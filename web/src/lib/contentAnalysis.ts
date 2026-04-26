import type {
  ContentBlockAnalysis,
  MessageAnalysis,
  RequestTrigger,
  ToolCallAnalysis,
  ToolDefinitionAnalysis,
} from "../types";
import { MISSING } from "./constants";
import {
  asArray,
  asObject,
  compactJson,
  countCacheBlocks,
  describeType,
  getStringField,
  previewText,
  readCache,
  safeJson,
  sizeOf,
} from "./json";

function getContentText(value: unknown): string {
  if (typeof value === "string") {
    return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return safeJson(value);
  }

  const directText =
    getStringField(objectValue, "text") ??
    getStringField(objectValue, "thinking") ??
    getStringField(objectValue, "content");
  if (directText !== null) {
    return directText;
  }

  if (typeof objectValue.input !== "undefined") {
    return safeJson(objectValue.input);
  }

  return safeJson(value);
}

function getBlockType(value: unknown): string {
  const objectValue = asObject(value);
  return getStringField(objectValue, "type") ?? "text";
}

function toContentBlock(value: unknown, path: string, fallbackTitle: string): ContentBlockAnalysis {
  const objectValue = asObject(value);
  const type = getBlockType(value);
  const text = getContentText(value);
  const toolName = getStringField(objectValue, "name");
  const toolUseId = getStringField(objectValue, "id") ?? getStringField(objectValue, "tool_use_id");
  const title = toolName ?? (type === "thinking" ? "assistant thinking" : fallbackTitle);
  const isSystemReminder = text.trimStart().startsWith("<system-reminder>");

  return {
    id: `${path}:${type}:${toolName ?? toolUseId ?? text.slice(0, 24)}`,
    path,
    type,
    title,
    text,
    preview: previewText(text),
    size: sizeOf(value),
    cache: readCache(value),
    raw: value,
    isSystemReminder,
    toolName: toolName ?? undefined,
    toolUseId: toolUseId ?? undefined,
    isError: objectValue?.is_error === true,
  };
}

export function extractSystemBlocks(rawSystem: unknown): ContentBlockAnalysis[] {
  const systemItems = Array.isArray(rawSystem)
    ? rawSystem
    : typeof rawSystem === "undefined"
      ? []
      : [rawSystem];
  return systemItems.map((item, index) =>
    toContentBlock(item, `requestBody.raw.system[${index}]`, `system[${index}]`),
  );
}

export function extractMessages(rawMessages: unknown): MessageAnalysis[] {
  const rawMessageList = asArray(rawMessages);
  const messages = rawMessageList.map((message, index) => {
    const messageObject = asObject(message);
    const role = getStringField(messageObject, "role") ?? "unknown";
    const rawBlocks = normalizeContentBlocks(messageObject?.content);
    const blocks = rawBlocks.map((block, contentIndex) =>
      toContentBlock(
        block,
        `requestBody.raw.messages[${index}].content[${contentIndex}]`,
        `content[${contentIndex}]`,
      ),
    );
    const previewSource =
      blocks.find((block) => !block.isSystemReminder && block.text.trim()) ??
      blocks.find((block) => block.text.trim()) ??
      null;

    return {
      index,
      path: `requestBody.raw.messages[${index}]`,
      role,
      blocks,
      contentTypes: blocks.map((block) => block.type),
      preview: previewSource ? previewSource.preview : MISSING,
      size: sizeOf(message),
      cacheCount: countCacheBlocks(message),
      isLatestUserInput: false,
      isRequestTrigger: false,
      hasSystemReminder: blocks.some((block) => block.isSystemReminder),
      hasThinking: blocks.some((block) => block.type === "thinking"),
      hasToolUse: blocks.some((block) => block.type === "tool_use"),
      hasToolResult: blocks.some((block) => block.type === "tool_result"),
    };
  });
  const latestUserBlock = findLatestUserBlock(messages);
  const trigger = findRequestTrigger(messages);

  return messages.map((message) => ({
    ...message,
    isLatestUserInput: message.blocks.some((block) => block.path === latestUserBlock?.path),
    isRequestTrigger: message.blocks.some((block) => block.path === trigger.block?.path),
  }));
}

function normalizeContentBlocks(content: unknown): unknown[] {
  return Array.isArray(content)
    ? content
    : typeof content === "undefined" || content === null
      ? []
      : [content];
}

export function extractTools(rawTools: unknown, previousTools: unknown): ToolDefinitionAnalysis[] {
  const previousToolMap = new Map<string, string>();
  for (const tool of asArray(previousTools)) {
    const toolObject = asObject(tool);
    const name = getStringField(toolObject, "name");
    if (name) {
      previousToolMap.set(name, compactJson(tool));
    }
  }

  return asArray(rawTools).map((tool, index) => {
    const toolObject = asObject(tool);
    const name = getStringField(toolObject, "name") ?? `tool_${index + 1}`;
    const description = getStringField(toolObject, "description") ?? "";
    const properties = asObject(asObject(toolObject?.input_schema)?.properties);
    const required = asArray(asObject(toolObject?.input_schema)?.required).filter(
      (item): item is string => typeof item === "string",
    );

    return {
      index,
      path: `requestBody.raw.tools[${index}]`,
      name,
      description,
      descriptionSize: description.length,
      inputFields: properties ? Object.keys(properties) : [],
      requiredFields: required,
      size: sizeOf(tool),
      raw: tool,
      changed: previousToolMap.has(name) ? previousToolMap.get(name) !== compactJson(tool) : false,
    };
  });
}

export function extractToolCalls(
  messages: MessageAnalysis[],
  requestIndex: number,
): ToolCallAnalysis[] {
  return messages.flatMap((message) =>
    message.blocks.flatMap((block, contentIndex) => {
      if (block.type !== "tool_use" && block.type !== "tool_result") {
        return [];
      }

      return [
        {
          id: `${block.path}:${block.toolName ?? block.toolUseId ?? contentIndex}`,
          requestIndex,
          path: block.path,
          type: block.type,
          tool: block.toolName ?? block.toolUseId ?? MISSING,
          inputSummary: block.type === "tool_use" ? block.preview : "",
          resultSummary: block.type === "tool_result" ? block.preview : "",
          linkedMessage: `messages[${message.index}].content[${contentIndex}]`,
          raw: block.raw,
        },
      ];
    }),
  );
}

export function findLatestUserBlock(messages: MessageAnalysis[]): ContentBlockAnalysis | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const userBlock =
      [...message.blocks]
        .reverse()
        .find((block) => block.type === "text" && !block.isSystemReminder && block.text.trim()) ??
      null;
    if (userBlock) {
      return userBlock;
    }
  }

  return null;
}

export function findRequestTrigger(messages: MessageAnalysis[]): RequestTrigger {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const block =
      [...message.blocks].reverse().find((item) => !item.isSystemReminder && item.text.trim()) ??
      null;
    if (!block) {
      continue;
    }

    if (block.type === "tool_result") {
      return {
        kind: "tool_result",
        label: "工具结果",
        preview: block.preview,
        path: block.path,
        block,
        messageIndex: message.index,
      };
    }

    if (block.type === "text") {
      return {
        kind: "user_input",
        label: "用户输入",
        preview: block.preview,
        path: block.path,
        block,
        messageIndex: message.index,
      };
    }

    return {
      kind: "unknown",
      label: block.type,
      preview: block.preview,
      path: block.path,
      block,
      messageIndex: message.index,
    };
  }

  return {
    kind: "unknown",
    label: "未知触发",
    preview: MISSING,
    path: "requestBody.raw.messages[last user]",
    block: null,
    messageIndex: null,
  };
}

export function extractThinkingType(rawThinking: unknown): string {
  const thinkingObject = asObject(rawThinking);
  return (
    getStringField(thinkingObject, "type") ??
    (typeof rawThinking === "undefined" ? "none" : describeType(rawThinking))
  );
}

export function extractContextSummary(rawContext: unknown): string {
  const contextObject = asObject(rawContext);
  const edits = asArray(contextObject?.edits);

  if (edits.length === 0) {
    return typeof rawContext === "undefined" ? "none" : previewText(safeJson(rawContext), 96);
  }

  return edits
    .map((edit) => {
      const editObject = asObject(edit);
      const type = getStringField(editObject, "type") ?? "edit";
      const keep = getStringField(editObject, "keep");
      return keep ? `${type}, keep ${keep}` : type;
    })
    .join(" · ");
}

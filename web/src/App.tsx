import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Braces,
  Brain,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Clipboard,
  Copy,
  Database,
  Diff,
  FileJson,
  Filter,
  Gauge,
  GitBranch,
  Layers3,
  ListFilter,
  type LucideIcon,
  Map as MapIcon,
  MessageSquareText,
  MessagesSquare,
  Network,
  PanelRight,
  PanelRightOpen,
  RefreshCw,
  Route,
  ScanSearch,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  UserRound,
  Wrench,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";

type SessionListItem = {
  sessionId: string | null;
  latestCapturedAt: string;
  latestTimestampMs: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  streamCount: number;
  durationMs: number;
  models: string[];
  promptTextPreview: string;
};

type CaptureRecord = {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  method: string;
  path: string;
  sessionId: string | null;
  requestHeaders: {
    redacted: Record<string, string>;
  };
  requestBody: {
    raw: unknown;
  };
  derived: {
    system: unknown;
    messages: unknown;
    model: string | null;
    maxTokens: number | null;
    stream: boolean;
    promptTextPreview: string;
  };
  response: {
    status: number;
    durationMs: number;
    ok: boolean;
    error?: string;
    body?: {
      raw: unknown;
    };
  };
};

type RouteState =
  | {
      name: "list";
    }
  | {
      name: "detail";
      sessionId: string | null;
    };

type ContentBlockAnalysis = {
  id: string;
  path: string;
  type: string;
  title: string;
  text: string;
  preview: string;
  size: number;
  cache: string | null;
  raw: unknown;
  isSystemReminder: boolean;
  toolName?: string;
  toolUseId?: string;
  isError?: boolean;
};

type MessageAnalysis = {
  index: number;
  path: string;
  role: string;
  blocks: ContentBlockAnalysis[];
  contentTypes: string[];
  preview: string;
  size: number;
  cacheCount: number;
  isLatestUser: boolean;
  hasSystemReminder: boolean;
  hasThinking: boolean;
  hasToolUse: boolean;
  hasToolResult: boolean;
};

type ToolDefinitionAnalysis = {
  index: number;
  path: string;
  name: string;
  description: string;
  descriptionSize: number;
  inputFields: string[];
  requiredFields: string[];
  size: number;
  raw: unknown;
  changed: boolean;
};

type ToolCallAnalysis = {
  id: string;
  requestIndex: number;
  path: string;
  type: "tool_use" | "tool_result";
  tool: string;
  inputSummary: string;
  resultSummary: string;
  linkedMessage: string;
  raw: unknown;
};

type DiffAnalysis = {
  badges: string[];
  systemChanged: boolean;
  toolsChanged: boolean;
  messagesDelta: number;
  metadataChanged: boolean;
  contextChanged: boolean;
  sizeDelta: number;
  changedLayerKeys: Set<LayerKey>;
};

type LayerKey = "metadata" | "context" | "system" | "tools" | "messages" | "latest";

type StackLayer = {
  key: LayerKey;
  title: string;
  path: string;
  summary: string;
  icon: LucideIcon;
  tone: "metadata" | "context" | "system" | "tool" | "conversation" | "user";
  size: number;
  badges: Array<{ label: string; tone?: BadgeTone }>;
  raw: unknown;
  cache: string | null;
};

type InspectorItem = {
  key: string;
  title: string;
  path: string;
  type: string;
  size: number;
  cache: string | null;
  diff: string;
  content: unknown;
};

type RequestAnalysis = {
  capture: CaptureRecord;
  index: number;
  raw: Record<string, unknown>;
  model: string;
  maxTokens: number | null;
  stream: boolean;
  thinkingType: string;
  contextManagementSummary: string;
  metadata: unknown;
  systemBlocks: ContentBlockAnalysis[];
  messages: MessageAnalysis[];
  tools: ToolDefinitionAnalysis[];
  toolCalls: ToolCallAnalysis[];
  latestUserBlock: ContentBlockAnalysis | null;
  layers: StackLayer[];
  diff: DiffAnalysis;
  sizes: {
    metadata: number;
    context: number;
    system: number;
    tools: number;
    messages: number;
    latest: number;
    total: number;
  };
  cacheCount: number;
  largestLayer: string;
};

type SessionAnalytics = {
  captures: CaptureRecord[];
  analyses: RequestAnalysis[];
  firstCapture: CaptureRecord | null;
  latestCapture: CaptureRecord | null;
  firstPrompt: string;
  latestPrompt: string;
  startAt: string | null;
  endAt: string | null;
  modelList: string[];
  requestCount: number;
  maxContextSize: number;
  latestContextSize: number;
  maxToolCount: number;
  latestToolCount: number;
  hasToolCalls: boolean;
  hasContextManagement: boolean;
  cacheCount: number;
  toolNames: string[];
  trend: number[];
  recentRequests: RequestAnalysis[];
  latestDiffBadges: string[];
};

type BadgeTone = "blue" | "teal" | "amber" | "rose" | "violet";
type DetailView = "stack" | "messages" | "tools" | "raw";
type TimeFilter = "all" | "24h" | "7d";
type SortMode = "latest" | "context" | "requests";

const MISSING = "Unknown";
const DETAIL_REQUEST_STORAGE_PREFIX = "prompt-gateway:selected-request:";

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value: string): string {
  return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sizeOf(value: unknown): number {
  if (typeof value === "string") {
    return normalizeText(value).length;
  }

  if (value === null || typeof value === "undefined") {
    return 0;
  }

  return compactJson(value).length;
}

function previewText(value: string, maxLength = 180): string {
  const compact = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!compact) {
    return MISSING;
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return `array[${value.length}]`;
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? normalizeText(value) : null;
}

function getStringField(objectValue: Record<string, unknown> | null, field: string): string | null {
  if (!objectValue) {
    return null;
  }

  return getString(objectValue[field]);
}

function readCache(value: unknown): string | null {
  const objectValue = asObject(value);
  const cache = asObject(objectValue?.cache_control);
  return getStringField(cache, "type");
}

function countCacheBlocks(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countCacheBlocks(item), 0);
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return 0;
  }

  const ownCount = asObject(objectValue.cache_control) ? 1 : 0;
  return Object.values(objectValue).reduce(
    (total, item) => total + countCacheBlocks(item),
    ownCount,
  );
}

function getContentText(value: unknown): string {
  if (typeof value === "string") {
    return normalizeText(value);
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

function extractSystemBlocks(rawSystem: unknown): ContentBlockAnalysis[] {
  const systemItems = Array.isArray(rawSystem)
    ? rawSystem
    : typeof rawSystem === "undefined"
      ? []
      : [rawSystem];
  return systemItems.map((item, index) =>
    toContentBlock(item, `requestBody.raw.system[${index}]`, `system[${index}]`),
  );
}

function extractMessages(rawMessages: unknown): MessageAnalysis[] {
  const rawMessageList = asArray(rawMessages);
  const lastUserIndex = (() => {
    for (let index = rawMessageList.length - 1; index >= 0; index -= 1) {
      const role = getStringField(asObject(rawMessageList[index]), "role");
      if (role === "user") {
        return index;
      }
    }

    return -1;
  })();

  return rawMessageList.map((message, index) => {
    const messageObject = asObject(message);
    const role = getStringField(messageObject, "role") ?? "unknown";
    const content = messageObject?.content;
    const rawBlocks = Array.isArray(content)
      ? content
      : typeof content === "undefined" || content === null
        ? []
        : [content];
    const blocks = rawBlocks.map((block, contentIndex) =>
      toContentBlock(
        block,
        `requestBody.raw.messages[${index}].content[${contentIndex}]`,
        `content[${contentIndex}]`,
      ),
    );
    const contentTypes = blocks.map((block) => block.type);
    const previewSource =
      blocks.find((block) => !block.isSystemReminder && block.text.trim()) ??
      blocks.find((block) => block.text.trim()) ??
      null;

    return {
      index,
      path: `requestBody.raw.messages[${index}]`,
      role,
      blocks,
      contentTypes,
      preview: previewSource ? previewSource.preview : MISSING,
      size: sizeOf(message),
      cacheCount: countCacheBlocks(message),
      isLatestUser: index === lastUserIndex,
      hasSystemReminder: blocks.some((block) => block.isSystemReminder),
      hasThinking: blocks.some((block) => block.type === "thinking"),
      hasToolUse: blocks.some((block) => block.type === "tool_use"),
      hasToolResult: blocks.some((block) => block.type === "tool_result"),
    };
  });
}

function extractInputFields(inputSchema: unknown): { fields: string[]; required: string[] } {
  const schemaObject = asObject(inputSchema);
  const properties = asObject(schemaObject?.properties);
  const fields = properties ? Object.keys(properties) : [];
  const required = asArray(schemaObject?.required).filter(
    (item): item is string => typeof item === "string",
  );
  return { fields, required };
}

function extractTools(rawTools: unknown, previousTools: unknown): ToolDefinitionAnalysis[] {
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
    const { fields, required } = extractInputFields(toolObject?.input_schema);

    return {
      index,
      path: `requestBody.raw.tools[${index}]`,
      name,
      description,
      descriptionSize: description.length,
      inputFields: fields,
      requiredFields: required,
      size: sizeOf(tool),
      raw: tool,
      changed: previousToolMap.has(name) ? previousToolMap.get(name) !== compactJson(tool) : false,
    };
  });
}

function extractToolCalls(messages: MessageAnalysis[], requestIndex: number): ToolCallAnalysis[] {
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

function findLatestUserBlock(messages: MessageAnalysis[]): ContentBlockAnalysis | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const userBlock =
      [...message.blocks]
        .reverse()
        .find((block) => block.type === "text" && !block.isSystemReminder) ??
      [...message.blocks].reverse().find((block) => !block.isSystemReminder) ??
      message.blocks[message.blocks.length - 1] ??
      null;
    if (userBlock) {
      return userBlock;
    }
  }

  return null;
}

function extractThinkingType(rawThinking: unknown): string {
  const thinkingObject = asObject(rawThinking);
  return (
    getStringField(thinkingObject, "type") ??
    (typeof rawThinking === "undefined" ? "none" : describeType(rawThinking))
  );
}

function extractContextSummary(rawContext: unknown): string {
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

function buildDiff(
  raw: Record<string, unknown>,
  previousRaw: Record<string, unknown> | null,
  totalSize: number,
  previousSize: number,
): DiffAnalysis {
  if (!previousRaw) {
    return {
      badges: ["first request"],
      systemChanged: false,
      toolsChanged: false,
      messagesDelta: asArray(raw.messages).length,
      metadataChanged: false,
      contextChanged: false,
      sizeDelta: 0,
      changedLayerKeys: new Set<LayerKey>(),
    };
  }

  const systemChanged = compactJson(raw.system) !== compactJson(previousRaw.system);
  const toolsChanged = compactJson(raw.tools) !== compactJson(previousRaw.tools);
  const metadataChanged = compactJson(raw.metadata) !== compactJson(previousRaw.metadata);
  const contextChanged =
    compactJson(raw.context_management) !== compactJson(previousRaw.context_management);
  const messagesDelta = asArray(raw.messages).length - asArray(previousRaw.messages).length;
  const sizeDelta = totalSize - previousSize;
  const changedLayerKeys = new Set<LayerKey>();
  const badges: string[] = [];

  if (messagesDelta > 0) {
    badges.push(`+${messagesDelta} message`);
    changedLayerKeys.add("messages");
    changedLayerKeys.add("latest");
  }

  if (systemChanged) {
    badges.push("system changed");
    changedLayerKeys.add("system");
  }

  if (toolsChanged) {
    badges.push("tools changed");
    changedLayerKeys.add("tools");
  }

  if (contextChanged) {
    badges.push("context edit");
    changedLayerKeys.add("context");
  }

  if (metadataChanged) {
    badges.push("metadata changed");
    changedLayerKeys.add("metadata");
  }

  if (sizeDelta > 8000) {
    badges.push(`+${formatCompactNumber(sizeDelta)} chars`);
  }

  return {
    badges: badges.length > 0 ? badges : ["unchanged"],
    systemChanged,
    toolsChanged,
    messagesDelta,
    metadataChanged,
    contextChanged,
    sizeDelta,
    changedLayerKeys,
  };
}

function makeLayer({
  key,
  title,
  path,
  summary,
  icon,
  tone,
  size,
  badges,
  raw,
  cache,
}: StackLayer): StackLayer {
  return { key, title, path, summary, icon, tone, size, badges, raw, cache };
}

function analyzeCapture(
  capture: CaptureRecord,
  index: number,
  previous?: RequestAnalysis,
): RequestAnalysis {
  const raw = asObject(capture.requestBody.raw) ?? {};
  const previousRaw = previous?.raw ?? null;
  const systemBlocks = extractSystemBlocks(raw.system);
  const messages = extractMessages(raw.messages);
  const tools = extractTools(raw.tools, previousRaw?.tools);
  const toolCalls = extractToolCalls(messages, index);
  const latestUserBlock = findLatestUserBlock(messages);
  const metadata = raw.metadata;
  const requestMetadata = {
    model: raw.model,
    max_tokens: raw.max_tokens,
    stream: raw.stream,
    thinking: raw.thinking,
    metadata,
  };
  const sizes = {
    metadata: sizeOf(requestMetadata),
    context: sizeOf(raw.context_management),
    system: sizeOf(raw.system),
    tools: sizeOf(raw.tools),
    messages: sizeOf(raw.messages),
    latest: latestUserBlock ? sizeOf(latestUserBlock.text) : 0,
    total: 0,
  };
  sizes.total = sizes.metadata + sizes.context + sizes.system + sizes.tools + sizes.messages;
  const diff = buildDiff(raw, previousRaw, sizes.total, previous?.sizes.total ?? 0);
  const cacheCount = countCacheBlocks(capture.requestBody.raw);
  const layerSizes = [
    { name: "System Layer", value: sizes.system },
    { name: "Tool Definition Layer", value: sizes.tools },
    { name: "Conversation Layer", value: sizes.messages },
    { name: "Request Metadata", value: sizes.metadata },
    { name: "Context Management", value: sizes.context },
  ];
  const largestLayer =
    layerSizes.sort((left, right) => right.value - left.value)[0]?.name ?? MISSING;
  const model = getString(raw.model) ?? capture.derived.model ?? MISSING;
  const maxTokens = typeof raw.max_tokens === "number" ? raw.max_tokens : capture.derived.maxTokens;
  const stream = typeof raw.stream === "boolean" ? raw.stream : capture.derived.stream;
  const thinkingType = extractThinkingType(raw.thinking);
  const contextManagementSummary = extractContextSummary(raw.context_management);
  const systemCacheCount = systemBlocks.filter((block) => block.cache).length;
  const biggestTools = [...tools]
    .sort((left, right) => right.descriptionSize - left.descriptionSize)
    .slice(0, 2);
  const latestUserSummary = latestUserBlock
    ? latestUserBlock.preview
    : "No latest user input found";
  const layers = [
    makeLayer({
      key: "metadata",
      title: "Request Metadata",
      path: "requestBody.raw.model / max_tokens / stream / metadata",
      summary: "Model, max output, stream mode, thinking mode, and request-level metadata.",
      icon: SlidersHorizontal,
      tone: "metadata",
      size: sizes.metadata,
      badges: [
        { label: `max_tokens ${maxTokens ?? MISSING}`, tone: "blue" },
        { label: `stream ${String(stream)}`, tone: "teal" },
        { label: `thinking ${thinkingType}` },
      ],
      raw: requestMetadata,
      cache: null,
    }),
    makeLayer({
      key: "context",
      title: "Context Management",
      path: "requestBody.raw.context_management",
      summary:
        contextManagementSummary === "none"
          ? "No context management field on this request."
          : contextManagementSummary,
      icon: Diff,
      tone: "context",
      size: sizes.context,
      badges:
        contextManagementSummary === "none"
          ? [{ label: "none" }]
          : [{ label: "context edit", tone: "rose" }, { label: contextManagementSummary }],
      raw: raw.context_management ?? null,
      cache: null,
    }),
    makeLayer({
      key: "system",
      title: "System Layer",
      path:
        systemBlocks.length > 0
          ? `requestBody.raw.system[0..${systemBlocks.length - 1}]`
          : "requestBody.raw.system",
      summary:
        "Claude Code injected identity, runtime rules, environment context, and session-specific guidance.",
      icon: ShieldCheck,
      tone: "system",
      size: sizes.system,
      badges: [
        { label: `${systemBlocks.length} blocks` },
        { label: `${systemCacheCount} cache`, tone: systemCacheCount > 0 ? "violet" : undefined },
        ...(largestLayer === "System Layer"
          ? [{ label: "largest layer", tone: "blue" as const }]
          : []),
      ],
      raw: raw.system ?? null,
      cache: systemCacheCount > 0 ? `${systemCacheCount} cache hints` : null,
    }),
    makeLayer({
      key: "tools",
      title: "Tool Definition Layer",
      path:
        tools.length > 0
          ? `requestBody.raw.tools[0..${tools.length - 1}]`
          : "requestBody.raw.tools",
      summary:
        tools.length > 0
          ? `This request exposed ${tools.length} tool definitions, including ${biggestTools.map((tool) => tool.name).join(", ") || "tools"}.`
          : "No tool definitions were exposed in this request.",
      icon: Wrench,
      tone: "tool",
      size: sizes.tools,
      badges: [
        { label: `${tools.length} tools`, tone: "amber" },
        ...(biggestTools[0]
          ? [
              {
                label: `${biggestTools[0].name} ${formatCompactNumber(biggestTools[0].descriptionSize)} desc`,
              },
            ]
          : []),
        ...(diff.toolsChanged ? [{ label: "changed", tone: "rose" as const }] : []),
      ],
      raw: raw.tools ?? [],
      cache: null,
    }),
    makeLayer({
      key: "messages",
      title: "Conversation Layer",
      path:
        messages.length > 0
          ? `requestBody.raw.messages[0..${messages.length - 1}]`
          : "requestBody.raw.messages",
      summary:
        "Prior user messages, assistant text, thinking, tool calls, and tool results included in this request.",
      icon: MessagesSquare,
      tone: "conversation",
      size: sizes.messages,
      badges: [
        { label: `${messages.length} messages`, tone: "teal" },
        ...(messages.some((message) => message.hasThinking) ? [{ label: "thinking" }] : []),
        ...(toolCalls.length > 0
          ? [{ label: `${toolCalls.length} tool events`, tone: "amber" as const }]
          : []),
      ],
      raw: raw.messages ?? [],
      cache: messages.some((message) => message.cacheCount > 0) ? "cache hints" : null,
    }),
    makeLayer({
      key: "latest",
      title: "Latest User Input",
      path: latestUserBlock?.path ?? "requestBody.raw.messages[last user]",
      summary: latestUserSummary,
      icon: UserRound,
      tone: "user",
      size: sizes.latest,
      badges: [
        { label: "actual user input", tone: "blue" },
        ...(latestUserBlock?.cache
          ? [{ label: latestUserBlock.cache, tone: "violet" as const }]
          : []),
      ],
      raw: latestUserBlock?.raw ?? null,
      cache: latestUserBlock?.cache ?? null,
    }),
  ];

  return {
    capture,
    index,
    raw,
    model,
    maxTokens,
    stream,
    thinkingType,
    contextManagementSummary,
    metadata,
    systemBlocks,
    messages,
    tools,
    toolCalls,
    latestUserBlock,
    layers,
    diff,
    sizes,
    cacheCount,
    largestLayer,
  };
}

function analyzeCaptures(captures: CaptureRecord[]): RequestAnalysis[] {
  const analyses: RequestAnalysis[] = [];
  for (const [index, capture] of captures.entries()) {
    analyses.push(analyzeCapture(capture, index, analyses[index - 1]));
  }

  return analyses;
}

function buildSessionAnalytics(captures: CaptureRecord[]): SessionAnalytics {
  const sorted = [...captures].sort((left, right) => left.timestampMs - right.timestampMs);
  const analyses = analyzeCaptures(sorted);
  const firstCapture = sorted[0] ?? null;
  const latestCapture = sorted[sorted.length - 1] ?? null;
  const firstAnalysis = analyses[0] ?? null;
  const latestAnalysis = analyses[analyses.length - 1] ?? null;
  const modelList = Array.from(
    new Set(analyses.map((analysis) => analysis.model).filter((model) => model !== MISSING)),
  );
  const toolNames = Array.from(
    new Set(analyses.flatMap((analysis) => analysis.tools.map((tool) => tool.name))),
  ).sort();

  return {
    captures: sorted,
    analyses,
    firstCapture,
    latestCapture,
    firstPrompt:
      firstAnalysis?.latestUserBlock?.preview ?? firstCapture?.derived.promptTextPreview ?? MISSING,
    latestPrompt:
      latestAnalysis?.latestUserBlock?.preview ??
      latestCapture?.derived.promptTextPreview ??
      MISSING,
    startAt: firstCapture?.capturedAt ?? null,
    endAt: latestCapture?.capturedAt ?? null,
    modelList,
    requestCount: sorted.length,
    maxContextSize: Math.max(0, ...analyses.map((analysis) => analysis.sizes.total)),
    latestContextSize: latestAnalysis?.sizes.total ?? 0,
    maxToolCount: Math.max(0, ...analyses.map((analysis) => analysis.tools.length)),
    latestToolCount: latestAnalysis?.tools.length ?? 0,
    hasToolCalls: analyses.some((analysis) => analysis.toolCalls.length > 0),
    hasContextManagement: analyses.some((analysis) => analysis.contextManagementSummary !== "none"),
    cacheCount: analyses.reduce((total, analysis) => total + analysis.cacheCount, 0),
    toolNames,
    trend: analyses.map((analysis) => analysis.sizes.total),
    recentRequests: analyses.slice(-5).reverse(),
    latestDiffBadges: latestAnalysis?.diff.badges ?? [],
  };
}

function parseRoute(pathname: string): RouteState {
  if (pathname.startsWith("/sessions/")) {
    return {
      name: "detail",
      sessionId: decodeSessionRouteId(pathname.slice("/sessions/".length)),
    };
  }

  return { name: "list" };
}

function encodeSessionRouteId(value: string | null): string {
  return value ? encodeURIComponent(value) : "~missing";
}

function decodeSessionRouteId(value: string): string | null {
  return value === "~missing" ? null : decodeURIComponent(value);
}

function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatDate(value: string | null): string {
  if (!value) {
    return MISSING;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return MISSING;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string | null): string {
  if (!value) {
    return MISSING;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return MISSING;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

function compactSessionId(value: string | null): string {
  if (!value) {
    return "missing-session";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function sessionKey(sessionId: string | null): string {
  return encodeSessionRouteId(sessionId);
}

function badgeToneForLabel(label: string): BadgeTone | undefined {
  if (label.includes("tool")) {
    return "amber";
  }

  if (label.includes("context") || label.includes("changed")) {
    return "rose";
  }

  if (label.includes("cache")) {
    return "violet";
  }

  if (label.includes("thinking") || label.includes("message")) {
    return "teal";
  }

  if (label.includes("user") || label.includes("latest")) {
    return "blue";
  }

  return undefined;
}

function Badge({ label, tone }: { label: string; tone?: BadgeTone }) {
  return <span className={tone ? `badge ${tone}` : "badge"}>{label}</span>;
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

function Button({
  children,
  icon: Icon,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  tone?: "default" | "primary";
  disabled?: boolean;
}) {
  return (
    <button
      className={tone === "primary" ? "button primary" : "button"}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function MetricTile({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
}) {
  return (
    <article className="metric-tile">
      <div className="metric-label">
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-caption">{caption}</div>
    </article>
  );
}

function AppTopbar({
  query,
  onQueryChange,
  routeLabel,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  routeLabel: string;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate("/")} type="button">
        <span className="brand-mark">
          <Route aria-hidden="true" />
        </span>
        <span>
          <span className="brand-title">prompt-gateway</span>
          <span className="brand-subtitle">Claude Code request lens</span>
        </span>
      </button>

      <label className="top-search">
        <Search aria-hidden="true" />
        <input
          aria-label="全局搜索"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索 sessionId、requestId、用户输入、工具名"
          type="search"
          value={query}
        />
      </label>

      <div className="route-pill" title="当前页面路径">
        <MapIcon aria-hidden="true" />
        <span>{routeLabel}</span>
      </div>
    </header>
  );
}

function EmptyState({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error";
}) {
  return <div className={tone === "error" ? "empty-state error" : "empty-state"}>{children}</div>;
}

function LoadingPanel({ children }: { children: ReactNode }) {
  return (
    <div className="loading-panel">
      <RefreshCw aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const displayValues = (values.length > 0 ? values.slice(-18) : [0]).map((value, index) => ({
    id: `bar-${values.length}-${index}-${value}`,
    value,
  }));

  return (
    <div className="sparkline" aria-label="上下文增长趋势" role="img">
      {displayValues.map((bar) => (
        <span key={bar.id} style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const width = Math.max(4, Math.min(100, max <= 0 ? 0 : (value / max) * 100));
  return (
    <div className="mini-bar" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function useSessionDetails(sessions: SessionListItem[]) {
  const [details, setDetails] = useState<Record<string, SessionAnalytics>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      const missingSessions = sessions.filter((session) => !details[sessionKey(session.sessionId)]);
      if (missingSessions.length === 0) {
        return;
      }

      const loadedEntries = await Promise.all(
        missingSessions.map(async (session) => {
          const response = await fetch(`/api/sessions/${encodeSessionRouteId(session.sessionId)}`);
          if (!response.ok) {
            throw new Error(`Failed to load session ${session.sessionId ?? "~missing"}`);
          }

          const payload = (await response.json()) as { captures: CaptureRecord[] };
          return [sessionKey(session.sessionId), buildSessionAnalytics(payload.captures)] as const;
        }),
      ).catch(() => []);

      if (!cancelled && loadedEntries.length > 0) {
        setDetails((current) => ({
          ...current,
          ...Object.fromEntries(loadedEntries),
        }));
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [details, sessions]);

  return details;
}

function ListPage({
  sessions,
  details,
  loading,
  error,
  query,
  onQueryChange,
}: {
  sessions: SessionListItem[];
  details: Record<string, SessionAnalytics>;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [toolFilter, setToolFilter] = useState("all");
  const [contextFilter, setContextFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const modelOptions = useMemo(
    () => Array.from(new Set(sessions.flatMap((session) => session.models))).sort(),
    [sessions],
  );
  const now = Date.now();

  const filteredSessions = useMemo(() => {
    const trimmedQuery = deferredQuery.trim().toLowerCase();
    const cutoff =
      timeFilter === "24h"
        ? now - 24 * 60 * 60 * 1000
        : timeFilter === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : 0;

    return sessions
      .filter((session) => {
        const analytics = details[sessionKey(session.sessionId)];
        const haystack = [
          session.sessionId ?? "",
          session.promptTextPreview,
          session.models.join(" "),
          analytics?.firstPrompt ?? "",
          analytics?.latestPrompt ?? "",
          analytics?.toolNames.join(" ") ?? "",
          analytics?.captures.map((capture) => capture.requestId).join(" ") ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (trimmedQuery && !haystack.includes(trimmedQuery)) {
          return false;
        }

        if (cutoff && session.latestTimestampMs < cutoff) {
          return false;
        }

        if (modelFilter !== "all" && !session.models.includes(modelFilter)) {
          return false;
        }

        if (toolFilter === "with-tools" && (analytics?.maxToolCount ?? 0) === 0) {
          return false;
        }

        if (toolFilter === "with-tool-calls" && !analytics?.hasToolCalls) {
          return false;
        }

        if (contextFilter === "with-context" && !analytics?.hasContextManagement) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftAnalytics = details[sessionKey(left.sessionId)];
        const rightAnalytics = details[sessionKey(right.sessionId)];
        if (sortMode === "context") {
          return (rightAnalytics?.maxContextSize ?? 0) - (leftAnalytics?.maxContextSize ?? 0);
        }

        if (sortMode === "requests") {
          return right.requestCount - left.requestCount;
        }

        return right.latestTimestampMs - left.latestTimestampMs;
      });
  }, [
    contextFilter,
    deferredQuery,
    details,
    modelFilter,
    now,
    sessions,
    sortMode,
    timeFilter,
    toolFilter,
  ]);

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (
      !selectedKey ||
      !filteredSessions.some((session) => sessionKey(session.sessionId) === selectedKey)
    ) {
      setSelectedKey(sessionKey(filteredSessions[0].sessionId));
    }
  }, [filteredSessions, selectedKey]);

  const selectedSession =
    filteredSessions.find((session) => sessionKey(session.sessionId) === selectedKey) ??
    filteredSessions[0] ??
    null;
  const selectedAnalytics = selectedSession ? details[sessionKey(selectedSession.sessionId)] : null;
  const totals = useMemo(() => {
    const requestCount = sessions.reduce((total, session) => total + session.requestCount, 0);
    const maxContext = Math.max(
      0,
      ...Object.values(details).map((analytics) => analytics.maxContextSize),
    );
    const toolHeavy = Object.values(details).filter(
      (analytics) => analytics.maxToolCount >= 20,
    ).length;
    return { requestCount, maxContext, toolHeavy };
  }, [details, sessions]);

  return (
    <>
      <AppTopbar onQueryChange={onQueryChange} query={query} routeLabel="/sessions" />
      <main className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">
              <Database aria-hidden="true" />
              捕获会话
            </div>
            <h1 className="title">Session 列表页</h1>
            <p className="subtitle">
              从 session 维度浏览 Claude Code CLI
              的请求轨迹，优先暴露请求数量、上下文规模、模型、工具数量和最近用户输入。
            </p>
          </div>
          <div className="button-row">
            <Button icon={CalendarDays} onClick={() => setTimeFilter("24h")}>
              最近 24 小时
            </Button>
          </div>
        </div>

        <section className="stats-grid" aria-label="Session 总览">
          <MetricTile
            caption="当前捕获目录中的会话数"
            icon={MessagesSquare}
            label="Sessions"
            value={String(sessions.length)}
          />
          <MetricTile
            caption="所有 session 的 /v1/messages 请求"
            icon={Send}
            label="Requests"
            value={String(totals.requestCount)}
          />
          <MetricTile
            caption="按字符估算，非精确 token"
            icon={Gauge}
            label="Max Context"
            value={formatCompactNumber(totals.maxContext)}
          />
          <MetricTile
            caption="包含 20 个以上工具定义的 session"
            icon={Wrench}
            label="Tool Heavy"
            value={String(totals.toolHeavy)}
          />
        </section>

        <div className="list-workbench">
          <aside className="filter-panel panel">
            <div className="panel-head">
              <div className="panel-title">
                <Filter aria-hidden="true" />
                筛选
              </div>
            </div>
            <div className="panel-body filter-stack">
              <label className="field-label">
                时间范围
                <select
                  value={timeFilter}
                  onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                >
                  <option value="all">全部时间</option>
                  <option value="24h">最近 24 小时</option>
                  <option value="7d">最近 7 天</option>
                </select>
              </label>
              <label className="field-label">
                模型
                <select
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                >
                  <option value="all">全部模型</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                工具
                <select value={toolFilter} onChange={(event) => setToolFilter(event.target.value)}>
                  <option value="all">全部</option>
                  <option value="with-tools">有工具定义</option>
                  <option value="with-tool-calls">有工具调用</option>
                </select>
              </label>
              <label className="field-label">
                Context Management
                <select
                  value={contextFilter}
                  onChange={(event) => setContextFilter(event.target.value)}
                >
                  <option value="all">全部</option>
                  <option value="with-context">包含 context edit</option>
                </select>
              </label>
              <label className="field-label">
                排序
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="latest">最近更新时间</option>
                  <option value="context">上下文规模</option>
                  <option value="requests">请求数量</option>
                </select>
              </label>
              <Button
                icon={ListFilter}
                onClick={() => {
                  onQueryChange("");
                  setTimeFilter("all");
                  setModelFilter("all");
                  setToolFilter("all");
                  setContextFilter("all");
                  setSortMode("latest");
                }}
              >
                清空筛选
              </Button>
            </div>
          </aside>

          <section className="panel table-panel">
            <div className="filter-bar">
              <label className="field search-field">
                <Search aria-hidden="true" />
                <input
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="sessionId / requestId / 用户输入 / 工具名"
                  type="search"
                  value={query}
                />
              </label>
              <div className="result-count">{filteredSessions.length} shown</div>
              <IconButton
                label="刷新列表"
                icon={RefreshCw}
                onClick={() => window.location.reload()}
              />
            </div>

            {loading ? <LoadingPanel>正在加载 session 列表...</LoadingPanel> : null}
            {error ? <EmptyState tone="error">{error}</EmptyState> : null}
            {!loading && !error && filteredSessions.length === 0 ? (
              <EmptyState>
                {sessions.length === 0 ? "暂无捕获的 session" : "没有匹配当前筛选条件的 session"}
              </EmptyState>
            ) : null}

            {!loading && !error && filteredSessions.length > 0 ? (
              <div className="table-scroll">
                <table className="session-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Time Range</th>
                      <th>Requests</th>
                      <th>Models</th>
                      <th>Context Size</th>
                      <th>Tools</th>
                      <th>Changes</th>
                      <th>Last Prompt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => {
                      const analytics = details[sessionKey(session.sessionId)];
                      const isSelected = selectedKey === sessionKey(session.sessionId);
                      return (
                        <tr
                          className={isSelected ? "selected" : undefined}
                          key={sessionKey(session.sessionId)}
                          onClick={() =>
                            navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)
                          }
                          onFocus={() => setSelectedKey(sessionKey(session.sessionId))}
                          onMouseEnter={() => setSelectedKey(sessionKey(session.sessionId))}
                        >
                          <td>
                            <div className="session-name">
                              <div className="session-dot">
                                <Terminal aria-hidden="true" />
                              </div>
                              <div>
                                <div className="session-id">
                                  {compactSessionId(session.sessionId)}
                                </div>
                                <div className="session-desc">
                                  {analytics?.firstPrompt ?? session.promptTextPreview ?? MISSING}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="mono">
                              {formatDate(analytics?.startAt ?? session.latestCapturedAt)}
                            </div>
                            <div className="muted">
                              至 {formatDate(analytics?.endAt ?? session.latestCapturedAt)}
                            </div>
                          </td>
                          <td className="strong-number">{session.requestCount}</td>
                          <td>
                            <div className="badge-row">
                              {(analytics?.modelList.length ? analytics.modelList : session.models)
                                .slice(0, 2)
                                .map((model) => (
                                  <Badge key={model} label={model} tone="blue" />
                                ))}
                              {(analytics?.modelList.length ?? session.models.length) === 0 ? (
                                <Badge label={MISSING} />
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="density">
                              <MiniBar
                                value={analytics?.latestContextSize ?? 0}
                                max={totals.maxContext}
                              />
                              <div className="density-caption">
                                <span>
                                  {analytics
                                    ? formatCompactNumber(analytics.latestContextSize)
                                    : "loading"}
                                </span>
                                <span>estimated</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="badge-row">
                              <Badge
                                label={`${analytics?.latestToolCount ?? 0} tools`}
                                tone="amber"
                              />
                              {analytics?.hasToolCalls ? (
                                <Badge label="tool_use" tone="teal" />
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="badge-row">
                              {(analytics?.latestDiffBadges ?? ["loading"])
                                .slice(0, 2)
                                .map((badge) => (
                                  <Badge
                                    key={badge}
                                    label={badge}
                                    tone={badgeToneForLabel(badge)}
                                  />
                                ))}
                            </div>
                          </td>
                          <td>
                            <div className="last-prompt">
                              <span>
                                {analytics?.latestPrompt ?? session.promptTextPreview ?? MISSING}
                              </span>
                              <span aria-hidden="true" className="row-open">
                                <ArrowRight aria-hidden="true" />
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <SessionPreview session={selectedSession} analytics={selectedAnalytics} />
        </div>
      </main>
    </>
  );
}

function SessionPreview({
  session,
  analytics,
}: {
  session: SessionListItem | null;
  analytics: SessionAnalytics | null;
}) {
  if (!session) {
    return (
      <aside className="panel preview-panel">
        <div className="panel-body">
          <EmptyState>选择一个 session 后查看摘要。</EmptyState>
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel preview-panel">
      <div className="panel-head">
        <div className="panel-title">
          <PanelRight aria-hidden="true" />
          Session 预览
        </div>
        <IconButton
          label="复制 sessionId"
          icon={Copy}
          onClick={() =>
            void navigator.clipboard?.writeText(session.sessionId ?? "missing-session")
          }
        />
      </div>
      <div className="panel-body">
        <div className="preview-title">
          <div className="session-dot">
            <Terminal aria-hidden="true" />
          </div>
          <div>
            <div className="session-id full">{session.sessionId ?? "missing-session"}</div>
            <div className="muted">
              最后更新 {formatDate(analytics?.endAt ?? session.latestCapturedAt)}
            </div>
          </div>
        </div>

        <div className="preview-block">
          <div className="block-label">摘要</div>
          <div className="kv-list">
            <div className="kv">
              <span>Requests</span>
              <strong>{session.requestCount}</strong>
            </div>
            <div className="kv">
              <span>Tools</span>
              <strong>{analytics ? `${analytics.latestToolCount} definitions` : "loading"}</strong>
            </div>
            <div className="kv">
              <span>Model</span>
              <strong>
                {analytics?.modelList.join(", ") || session.models.join(", ") || MISSING}
              </strong>
            </div>
            <div className="kv">
              <span>Largest layer</span>
              <strong>
                {analytics?.analyses[analytics.analyses.length - 1]?.largestLayer ?? MISSING}
              </strong>
            </div>
          </div>
        </div>

        <div className="preview-block">
          <div className="block-label">首次用户输入</div>
          <p className="preview-text">
            {analytics?.firstPrompt ?? session.promptTextPreview ?? MISSING}
          </p>
        </div>

        <div className="preview-block">
          <div className="block-label">最后用户输入</div>
          <p className="preview-text strong">
            {analytics?.latestPrompt ?? session.promptTextPreview ?? MISSING}
          </p>
        </div>

        <div className="preview-block">
          <div className="block-label">上下文增长</div>
          <Sparkline values={analytics?.trend ?? []} />
        </div>

        <div className="preview-block">
          <div className="block-label">最近请求</div>
          <div className="request-list">
            {(analytics?.recentRequests ?? []).map((analysis) => (
              <button
                className="request-list-item"
                key={analysis.capture.requestId}
                onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
                type="button"
              >
                <span className="request-index">{analysis.index + 1}</span>
                <span className="truncate">
                  {analysis.latestUserBlock?.preview ?? analysis.capture.derived.promptTextPreview}
                </span>
                <Badge
                  label={analysis.diff.badges[0] ?? "request"}
                  tone={badgeToneForLabel(analysis.diff.badges[0] ?? "")}
                />
              </button>
            ))}
            {!analytics ? <div className="muted">正在计算...</div> : null}
          </div>
        </div>

        <Button
          icon={PanelRightOpen}
          onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
          tone="primary"
        >
          查看详情
        </Button>
      </div>
    </aside>
  );
}

function OverviewCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <article className="overview-card">
      <div className="label">
        <Icon aria-hidden="true" />
        {label}
      </div>
      <div className="value">{value}</div>
    </article>
  );
}

function DetailPage({
  sessionId,
  globalQuery,
  onGlobalQueryChange,
}: {
  sessionId: string | null;
  globalQuery: string;
  onGlobalQueryChange: (value: string) => void;
}) {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeView, setActiveView] = useState<DetailView>("stack");
  const [onlyTools, setOnlyTools] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [rawSearch, setRawSearch] = useState("");
  const [inspectorKey, setInspectorKey] = useState<string | null>("layer:system");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/sessions/${encodeSessionRouteId(sessionId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load session (${response.status})`);
        }

        const payload = (await response.json()) as { captures: CaptureRecord[] };
        if (!cancelled) {
          setCaptures(payload.captures);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const analyses = useMemo(() => analyzeCaptures(captures), [captures]);
  const analytics = useMemo(() => buildSessionAnalytics(captures), [captures]);

  useEffect(() => {
    if (analyses.length === 0) {
      setSelectedIndex(0);
      return;
    }

    const stored = Number(
      window.localStorage.getItem(
        `${DETAIL_REQUEST_STORAGE_PREFIX}${encodeSessionRouteId(sessionId)}`,
      ),
    );
    const nextIndex =
      Number.isInteger(stored) && stored >= 0 && stored < analyses.length
        ? stored
        : analyses.length - 1;
    setSelectedIndex(nextIndex);
  }, [analyses.length, sessionId]);

  useEffect(() => {
    if (analyses.length === 0) {
      return;
    }

    window.localStorage.setItem(
      `${DETAIL_REQUEST_STORAGE_PREFIX}${encodeSessionRouteId(sessionId)}`,
      String(selectedIndex),
    );
  }, [analyses.length, selectedIndex, sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(analyses.length - 1, current + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analyses.length]);

  const selectedAnalysis = analyses[selectedIndex] ?? null;
  const timelineQuery = globalQuery.trim().toLowerCase();
  const filteredTimeline = analyses.filter((analysis) => {
    if (timelineQuery) {
      const haystack = [
        analysis.capture.requestId,
        analysis.model,
        analysis.latestUserBlock?.text ?? "",
        analysis.capture.derived.promptTextPreview,
        analysis.tools.map((tool) => tool.name).join(" "),
        analysis.diff.badges.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(timelineQuery)) {
        return false;
      }
    }

    if (onlyTools && analysis.toolCalls.length === 0 && analysis.tools.length === 0) {
      return false;
    }

    if (
      onlyChanged &&
      analysis.diff.badges.every((badge) => badge === "unchanged" || badge === "first request")
    ) {
      return false;
    }

    return true;
  });

  const inspectorItems = useMemo(() => {
    if (!selectedAnalysis) {
      return new Map<string, InspectorItem>();
    }

    const items = new Map<string, InspectorItem>();
    for (const layer of selectedAnalysis.layers) {
      items.set(`layer:${layer.key}`, {
        key: `layer:${layer.key}`,
        title: layer.title,
        path: layer.path,
        type: describeType(layer.raw),
        size: layer.size,
        cache: layer.cache,
        diff: selectedAnalysis.diff.changedLayerKeys.has(layer.key) ? "changed" : "unchanged",
        content: layer.raw,
      });
    }

    for (const block of selectedAnalysis.systemBlocks) {
      items.set(block.path, {
        key: block.path,
        title: block.title,
        path: block.path,
        type: block.type,
        size: block.size,
        cache: block.cache,
        diff: selectedAnalysis.diff.changedLayerKeys.has("system") ? "changed" : "unchanged",
        content: block.raw,
      });
    }

    for (const message of selectedAnalysis.messages) {
      items.set(message.path, {
        key: message.path,
        title: `message ${message.index + 1}`,
        path: message.path,
        type: message.role,
        size: message.size,
        cache: message.cacheCount > 0 ? `${message.cacheCount} cache hints` : null,
        diff: message.isLatestUser ? "latest" : "included",
        content: selectedAnalysis.raw.messages,
      });
      for (const block of message.blocks) {
        items.set(block.path, {
          key: block.path,
          title: block.title,
          path: block.path,
          type: block.type,
          size: block.size,
          cache: block.cache,
          diff: message.isLatestUser ? "latest" : "included",
          content: block.raw,
        });
      }
    }

    for (const tool of selectedAnalysis.tools) {
      items.set(tool.path, {
        key: tool.path,
        title: tool.name,
        path: tool.path,
        type: "tool schema",
        size: tool.size,
        cache: null,
        diff: tool.changed ? "changed" : "unchanged",
        content: tool.raw,
      });
    }

    return items;
  }, [selectedAnalysis]);

  const inspectorItem =
    (inspectorKey ? inspectorItems.get(inspectorKey) : null) ??
    (selectedAnalysis ? (inspectorItems.get("layer:system") ?? null) : null);

  return (
    <>
      <AppTopbar
        onQueryChange={onGlobalQueryChange}
        query={globalQuery}
        routeLabel={`/sessions/${encodeSessionRouteId(sessionId)}`}
      />
      <main className="page">
        {loading ? <LoadingPanel>正在加载请求详情...</LoadingPanel> : null}
        {error ? <EmptyState tone="error">{error}</EmptyState> : null}

        {selectedAnalysis ? (
          <>
            <section className="session-summary-bar">
              <Button icon={ArrowLeft} onClick={() => navigate("/")}>
                返回列表
              </Button>
              <div className="summary-title">
                <div className="session-dot">
                  <Terminal aria-hidden="true" />
                </div>
                <div>
                  <h2>Session 详情页</h2>
                  <p className="mono">{sessionId ?? "missing-session"}</p>
                </div>
              </div>
              <div className="summary-metrics">
                <Badge label={`Request ${selectedIndex + 1} / ${analyses.length}`} tone="blue" />
                <Badge label={formatTime(selectedAnalysis.capture.capturedAt)} />
                <Badge label={selectedAnalysis.model} tone="teal" />
                <Badge label={`${selectedAnalysis.tools.length} tools`} tone="amber" />
                {selectedAnalysis.contextManagementSummary !== "none" ? (
                  <Badge label="context edit" tone="rose" />
                ) : null}
              </div>
            </section>

            <div className="detail-shell">
              <aside className="panel timeline">
                <div className="panel-head">
                  <div className="panel-title">
                    <GitBranch aria-hidden="true" />
                    请求时间轴
                  </div>
                  <IconButton
                    label="上一条请求"
                    icon={ChevronDown}
                    onClick={() => setSelectedIndex((current) => Math.max(0, current - 1))}
                  />
                </div>
                <div className="timeline-filter">
                  <button
                    className={onlyTools ? "button active" : "button"}
                    onClick={() => setOnlyTools((current) => !current)}
                    type="button"
                  >
                    <Wrench aria-hidden="true" />
                    有工具
                  </button>
                  <button
                    className={onlyChanged ? "button active" : "button"}
                    onClick={() => setOnlyChanged((current) => !current)}
                    type="button"
                  >
                    <Diff aria-hidden="true" />
                    有变化
                  </button>
                </div>
                <div className="timeline-list">
                  {filteredTimeline.map((analysis) => (
                    <button
                      className={
                        analysis.index === selectedIndex ? "timeline-item active" : "timeline-item"
                      }
                      key={analysis.capture.requestId}
                      onClick={() => {
                        setSelectedIndex(analysis.index);
                        setInspectorKey("layer:system");
                      }}
                      type="button"
                    >
                      <span className="timeline-node">{analysis.index + 1}</span>
                      <span className="timeline-content">
                        <span className="timeline-main">
                          <span className="timeline-prompt truncate">
                            {analysis.latestUserBlock?.preview ??
                              analysis.capture.derived.promptTextPreview}
                          </span>
                          <span className="timeline-time">
                            {formatTime(analysis.capture.capturedAt)}
                          </span>
                        </span>
                        <span className="badge-row">
                          {analysis.diff.badges.slice(0, 3).map((badge) => (
                            <Badge key={badge} label={badge} tone={badgeToneForLabel(badge)} />
                          ))}
                          <Badge label={`${formatCompactNumber(analysis.sizes.total)} chars`} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="detail-main">
                <div className="overview-grid">
                  <OverviewCard
                    icon={Network}
                    label="API"
                    value={`${selectedAnalysis.capture.method} ${selectedAnalysis.capture.path}`}
                  />
                  <OverviewCard icon={Brain} label="Model" value={selectedAnalysis.model} />
                  <OverviewCard
                    icon={Activity}
                    label="Thinking"
                    value={selectedAnalysis.thinkingType}
                  />
                  <OverviewCard
                    icon={Gauge}
                    label="Context"
                    value={`${formatCompactNumber(selectedAnalysis.sizes.total)} chars`}
                  />
                  <OverviewCard
                    icon={Wrench}
                    label="Tools"
                    value={String(selectedAnalysis.tools.length)}
                  />
                  <OverviewCard
                    icon={MessagesSquare}
                    label="Messages"
                    value={String(selectedAnalysis.messages.length)}
                  />
                </div>

                <div className="toolbar">
                  <div className="segmented" aria-label="详情视图" role="tablist">
                    {[
                      ["stack", "Context Stack"],
                      ["messages", "Messages"],
                      ["tools", "Tools"],
                      ["raw", "Raw JSON"],
                    ].map(([value, label]) => (
                      <button
                        className={activeView === value ? "segment active" : "segment"}
                        key={value}
                        onClick={() => setActiveView(value as DetailView)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="button-row">
                    <Button icon={Diff} onClick={() => setActiveView("stack")}>
                      Compare with previous
                    </Button>
                    <IconButton
                      label="复制当前请求"
                      icon={Copy}
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          safeJson(selectedAnalysis.capture.requestBody.raw),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="callout">
                  <CircleDot aria-hidden="true" />
                  <span>
                    用户最新输入是{" "}
                    <strong>{selectedAnalysis.latestUserBlock?.preview ?? MISSING}</strong>
                    ，但本次请求同时携带 {selectedAnalysis.systemBlocks.length} 个 system block、
                    {selectedAnalysis.messages.length} 条 messages、{selectedAnalysis.tools.length}{" "}
                    个 tools，以及 thinking 与 context management 配置。
                  </span>
                </div>

                {activeView === "stack" ? (
                  <ContextStack
                    analysis={selectedAnalysis}
                    inspectorKey={inspectorKey}
                    onSelect={(key) => setInspectorKey(`layer:${key}`)}
                  />
                ) : null}
                {activeView === "messages" ? (
                  <MessagesView
                    analysis={selectedAnalysis}
                    onSelect={(key) => setInspectorKey(key)}
                  />
                ) : null}
                {activeView === "tools" ? (
                  <ToolsView analysis={selectedAnalysis} onSelect={(key) => setInspectorKey(key)} />
                ) : null}
                {activeView === "raw" ? (
                  <RawJsonView
                    analysis={selectedAnalysis}
                    rawSearch={rawSearch}
                    onRawSearchChange={setRawSearch}
                    onSelectRaw={() => setInspectorKey("layer:metadata")}
                  />
                ) : null}
              </section>

              <InspectorPanel
                analytics={analytics}
                item={inspectorItem}
                onOpenRaw={() => setActiveView("raw")}
                onSelect={(key) => {
                  setInspectorKey(key);
                  if (key.startsWith("layer:")) {
                    setActiveView("stack");
                  }
                }}
              />
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function ContextStack({
  analysis,
  inspectorKey,
  onSelect,
}: {
  analysis: RequestAnalysis;
  inspectorKey: string | null;
  onSelect: (key: LayerKey) => void;
}) {
  const maxSize = Math.max(1, ...analysis.layers.map((layer) => layer.size));

  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Layers3 aria-hidden="true" />
          上下文组装图
        </h3>
        <span className="small-note">按进入 request body 的逻辑层级展示</span>
      </div>
      <div className="context-stack">
        {analysis.layers.map((layer) => {
          const Icon = layer.icon;
          return (
            <button
              className={
                inspectorKey === `layer:${layer.key}`
                  ? `stack-layer layer-${layer.tone} selected`
                  : `stack-layer layer-${layer.tone}`
              }
              key={layer.key}
              onClick={() => onSelect(layer.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(layer.key);
                }
              }}
              type="button"
            >
              <div className="layer-label">
                <div className="layer-icon">
                  <Icon aria-hidden="true" />
                </div>
                <div>
                  <div className="layer-title">{layer.title}</div>
                  <div className="layer-path">{layer.path}</div>
                </div>
              </div>
              <div className="layer-copy">
                <div className="layer-summary">{layer.summary}</div>
                <div className="layer-meta">
                  {layer.badges.map((badge) => (
                    <Badge key={badge.label} label={badge.label} tone={badge.tone} />
                  ))}
                  {analysis.diff.changedLayerKeys.has(layer.key) ? (
                    <Badge label="Changed" tone="rose" />
                  ) : null}
                </div>
              </div>
              <div className="layer-size">
                <div className="size-number">{formatCompactNumber(layer.size)}</div>
                <div className="size-label">estimated chars</div>
                <MiniBar value={layer.size} max={maxSize} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="diff-summary">
        <div className="block-label">与上一请求对比</div>
        <div className="badge-row">
          {analysis.diff.badges.map((badge) => (
            <Badge key={badge} label={badge} tone={badgeToneForLabel(badge)} />
          ))}
        </div>
        <div className="diff-grid">
          <div>
            <span>System</span>
            <strong>{analysis.diff.systemChanged ? "changed" : "unchanged"}</strong>
          </div>
          <div>
            <span>Messages</span>
            <strong>
              {analysis.diff.messagesDelta >= 0
                ? `+${analysis.diff.messagesDelta}`
                : analysis.diff.messagesDelta}
            </strong>
          </div>
          <div>
            <span>Tools</span>
            <strong>{analysis.diff.toolsChanged ? "changed" : "unchanged"}</strong>
          </div>
          <div>
            <span>Size Delta</span>
            <strong>
              {analysis.diff.sizeDelta >= 0 ? "+" : ""}
              {formatCompactNumber(analysis.diff.sizeDelta)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessagesView({
  analysis,
  onSelect,
}: {
  analysis: RequestAnalysis;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <MessageSquareText aria-hidden="true" />
          Messages 结构视图
        </h3>
        <span className="small-note">自动注入内容与真实用户输入分开展示</span>
      </div>
      <div className="message-list">
        {analysis.messages.map((message) => (
          <article
            className={message.isLatestUser ? "message-row latest" : "message-row"}
            key={message.path}
          >
            <button className="message-role" onClick={() => onSelect(message.path)} type="button">
              <span className={message.role === "assistant" ? "role-dot assistant" : "role-dot"} />
              {message.role}
            </button>
            <div className="message-copy">
              <div className="message-preview">{message.preview}</div>
              <div className="message-path">{message.path}</div>
              <details className="content-details">
                <summary>查看 {message.blocks.length} 个 content block</summary>
                <div className="content-block-list">
                  {message.blocks.map((block) => (
                    <button
                      className="content-block"
                      key={block.path}
                      onClick={() => onSelect(block.path)}
                      type="button"
                    >
                      <span>
                        <Badge
                          label={block.isSystemReminder ? "system reminder" : block.type}
                          tone={block.isSystemReminder ? "rose" : undefined}
                        />
                        {block.cache ? <Badge label={block.cache} tone="violet" /> : null}
                      </span>
                      <strong>{block.title}</strong>
                      <span>{block.preview}</span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <div className="message-meta">
              {message.isLatestUser ? <Badge label="latest input" tone="blue" /> : null}
              {message.hasSystemReminder ? <Badge label="system reminder" tone="rose" /> : null}
              {message.hasThinking ? <Badge label="thinking" tone="teal" /> : null}
              {message.hasToolUse ? <Badge label="tool_use" tone="amber" /> : null}
              {message.hasToolResult ? <Badge label="tool_result" tone="amber" /> : null}
              <Badge label={`${message.contentTypes.length} blocks`} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ToolsView({
  analysis,
  onSelect,
}: {
  analysis: RequestAnalysis;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Wrench aria-hidden="true" />
          工具定义视图
        </h3>
        <span className="small-note">当前请求暴露工具定义，未必代表本次一定调用</span>
      </div>
      <div className="table-scroll compact">
        <table className="tool-table">
          <thead>
            <tr>
              <th>Tool Name</th>
              <th>Description Size</th>
              <th>Input Fields</th>
              <th>Required</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {analysis.tools.map((tool) => (
              <tr key={tool.path} onClick={() => onSelect(tool.path)}>
                <td className="tool-name">{tool.name}</td>
                <td className="mono">{formatCompactNumber(tool.descriptionSize)} chars</td>
                <td>
                  <div className="badge-row">
                    {(tool.inputFields.length > 0 ? tool.inputFields : ["none"])
                      .slice(0, 5)
                      .map((field) => (
                        <Badge key={field} label={field} />
                      ))}
                  </div>
                </td>
                <td>
                  <div className="badge-row">
                    {(tool.requiredFields.length > 0 ? tool.requiredFields : ["none"])
                      .slice(0, 4)
                      .map((field) => (
                        <Badge
                          key={field}
                          label={field}
                          tone={field === "none" ? undefined : "violet"}
                        />
                      ))}
                  </div>
                </td>
                <td>
                  <Badge
                    label={tool.changed ? "changed" : "unchanged"}
                    tone={tool.changed ? "rose" : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title sub">
        <h3>
          <Activity aria-hidden="true" />
          工具调用时间线
        </h3>
      </div>
      {analysis.toolCalls.length === 0 ? (
        <EmptyState>当前请求暴露了工具定义，但上下文中未出现工具调用记录。</EmptyState>
      ) : (
        <div className="tool-call-list">
          {analysis.toolCalls.map((call) => (
            <button
              className="tool-call-row"
              key={call.id}
              onClick={() => onSelect(call.path)}
              type="button"
            >
              <Badge label={`Request ${call.requestIndex + 1}`} tone="blue" />
              <strong>{call.tool}</strong>
              <span>{call.type === "tool_use" ? call.inputSummary : call.resultSummary}</span>
              <code>{call.linkedMessage}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RawJsonView({
  analysis,
  rawSearch,
  onRawSearchChange,
  onSelectRaw,
}: {
  analysis: RequestAnalysis;
  rawSearch: string;
  onRawSearchChange: (value: string) => void;
  onSelectRaw: () => void;
}) {
  const rawText = safeJson(analysis.capture.requestBody.raw);
  const lowerRaw = rawText.toLowerCase();
  const matchCount = rawSearch.trim()
    ? lowerRaw.split(rawSearch.trim().toLowerCase()).length - 1
    : 0;

  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Braces aria-hidden="true" />
          Raw JSON 定位
        </h3>
        <span className="small-note">从任意可视化块跳转到字段路径</span>
      </div>
      <div className="raw-toolbar">
        <label className="field search-field">
          <Search aria-hidden="true" />
          <input
            onChange={(event) => onRawSearchChange(event.target.value)}
            placeholder="搜索字段或值"
            type="search"
            value={rawSearch}
          />
        </label>
        <span className="result-count">{matchCount} matches</span>
        <Button icon={Clipboard} onClick={() => void navigator.clipboard?.writeText(rawText)}>
          复制完整 request body
        </Button>
        <IconButton icon={ScanSearch} label="定位 Metadata" onClick={onSelectRaw} />
      </div>
      <pre className="raw-json">{rawText}</pre>
    </section>
  );
}

function InspectorPanel({
  item,
  analytics,
  onOpenRaw,
  onSelect,
}: {
  item: InspectorItem | null;
  analytics: SessionAnalytics;
  onOpenRaw: () => void;
  onSelect: (key: string) => void;
}) {
  const content = item
    ? typeof item.content === "string"
      ? item.content
      : safeJson(item.content)
    : "";

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <div className="panel-title">
          <ScanSearch aria-hidden="true" />
          检查器
        </div>
        <div className="button-row">
          <IconButton
            label="复制字段"
            icon={Copy}
            disabled={!item}
            onClick={() => item && void navigator.clipboard?.writeText(content)}
          />
          <IconButton
            label="在 Raw JSON 中打开"
            icon={FileJson}
            disabled={!item}
            onClick={onOpenRaw}
          />
        </div>
      </div>
      <div className="panel-body">
        {item ? (
          <>
            <div className="block-label">Selected Path</div>
            <div className="inspector-path">{item.path}</div>

            <div className="inspector-grid">
              <div className="inspector-stat">
                <div className="label">Type</div>
                <div className="value">{item.type}</div>
              </div>
              <div className="inspector-stat">
                <div className="label">Size</div>
                <div className="value">{formatCompactNumber(item.size)} chars</div>
              </div>
              <div className="inspector-stat">
                <div className="label">Cache</div>
                <div className="value">{item.cache ?? "none"}</div>
              </div>
              <div className="inspector-stat">
                <div className="label">Diff</div>
                <div className="value">{item.diff}</div>
              </div>
            </div>

            <div className="block-label">Content Preview</div>
            <pre className="code-box">{content}</pre>

            <div className="copy-rail">
              <Button icon={Copy} onClick={() => void navigator.clipboard?.writeText(content)}>
                复制内容
              </Button>
              <Button icon={ScanSearch} onClick={onOpenRaw}>
                定位 Raw
              </Button>
            </div>
          </>
        ) : (
          <EmptyState>选择一个上下文块、message、tool 或 raw 字段查看详情。</EmptyState>
        )}

        <div className="preview-block">
          <div className="block-label">字段目录</div>
          <div className="field-tree">
            <button className="tree-row" onClick={() => onSelect("layer:metadata")} type="button">
              <span>metadata</span>
              <span className="soft">object</span>
            </button>
            <button className="tree-row" onClick={() => onSelect("layer:context")} type="button">
              <span>context_management</span>
              <span className="soft">object</span>
            </button>
            <button className="tree-row" onClick={() => onSelect("layer:system")} type="button">
              <span>system</span>
              <span className="soft">
                {analytics.analyses[analytics.analyses.length - 1]?.systemBlocks.length ?? 0} blocks
              </span>
            </button>
            <button className="tree-row" onClick={() => onSelect("layer:messages")} type="button">
              <span>messages</span>
              <span className="soft">
                {analytics.analyses[analytics.analyses.length - 1]?.messages.length ?? 0} array
              </span>
            </button>
            <button className="tree-row" onClick={() => onSelect("layer:tools")} type="button">
              <span>tools</span>
              <span className="soft">
                {analytics.analyses[analytics.analyses.length - 1]?.tools.length ?? 0} array
              </span>
            </button>
            <button className="tree-row" onClick={() => onOpenRaw()} type="button">
              <span>raw</span>
              <span className="soft">json</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function App() {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const sessionDetails = useSessionDetails(sessions);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const response = await fetch("/api/sessions");
        if (!response.ok) {
          throw new Error(`Failed to load sessions (${response.status})`);
        }

        const payload = (await response.json()) as { sessions: SessionListItem[] };
        if (!cancelled) {
          setSessions(payload.sessions);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionsError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  if (route.name === "detail") {
    return (
      <DetailPage
        globalQuery={globalQuery}
        onGlobalQueryChange={setGlobalQuery}
        sessionId={route.sessionId}
      />
    );
  }

  return (
    <ListPage
      details={sessionDetails}
      error={sessionsError}
      loading={sessionsLoading}
      onQueryChange={setGlobalQuery}
      query={globalQuery}
      sessions={sessions}
    />
  );
}

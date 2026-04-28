import { asArray, asObject, getStringField, normalizeText, safeJson, sizeOf } from "./json";

export type ResponseTextBlock = {
  id: string;
  path: string;
  type: string;
  text: string;
  raw: unknown;
};

export type ResponseBodyAnalysis = {
  raw: unknown;
  rawText: string;
  text: string;
  blocks: ResponseTextBlock[];
  size: number;
  format: "json" | "stream" | "text" | "empty";
};

export function analyzeResponseBody(raw: unknown): ResponseBodyAnalysis {
  const blocks =
    typeof raw === "string" ? extractStreamTextBlocks(raw) : extractJsonTextBlocks(raw);
  const format = detectResponseFormat(raw, blocks);
  const text = blocks.map((block) => block.text).join(format === "stream" ? "" : "\n\n");

  return {
    raw,
    rawText: rawText(raw),
    text: normalizeText(text).trim(),
    blocks,
    size: sizeOf(raw),
    format,
  };
}

function detectResponseFormat(
  raw: unknown,
  blocks: ResponseTextBlock[],
): ResponseBodyAnalysis["format"] {
  if (raw === null || typeof raw === "undefined") {
    return "empty";
  }

  if (typeof raw !== "string") {
    return "json";
  }

  if (blocks.length > 0 && raw.split("\n").some((line) => line.trim().startsWith("data:"))) {
    return "stream";
  }

  return "text";
}

function rawText(raw: unknown): string {
  if (typeof raw === "string") {
    return normalizeText(raw);
  }

  return safeJson(raw);
}

function extractJsonTextBlocks(raw: unknown, path = "response.body.raw"): ResponseTextBlock[] {
  const objectValue = asObject(raw);
  if (!objectValue) {
    return typeof raw === "string" && raw.trim()
      ? [{ id: path, path, type: "text", text: normalizeText(raw), raw }]
      : [];
  }

  const content = asArray(objectValue.content);
  if (content.length > 0) {
    return content.flatMap((block, index) =>
      extractContentBlockText(block, `${path}.content[${index}]`),
    );
  }

  const completion = getStringField(objectValue, "completion");
  if (completion) {
    return [
      {
        id: `${path}.completion`,
        path: `${path}.completion`,
        type: "completion",
        text: completion,
        raw: completion,
      },
    ];
  }

  const text = getStringField(objectValue, "text");
  if (text) {
    return [{ id: `${path}.text`, path: `${path}.text`, type: "text", text, raw: text }];
  }

  return [];
}

function extractContentBlockText(block: unknown, path: string): ResponseTextBlock[] {
  if (typeof block === "string") {
    const text = normalizeText(block);
    return text.trim() ? [{ id: path, path, type: "text", text, raw: block }] : [];
  }

  const objectValue = asObject(block);
  if (!objectValue) {
    return [];
  }

  const text = getStringField(objectValue, "text");
  if (text) {
    return [
      {
        id: path,
        path,
        type: getStringField(objectValue, "type") ?? "text",
        text,
        raw: block,
      },
    ];
  }

  return [];
}

function extractStreamTextBlocks(raw: string): ResponseTextBlock[] {
  const blocks: ResponseTextBlock[] = [];
  const lines = normalizeText(raw).split("\n");

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const event = JSON.parse(payload) as unknown;
      const eventObject = asObject(event);
      const delta = asObject(eventObject?.delta);
      const contentBlock = asObject(eventObject?.content_block);
      const text = getStringField(delta, "text") ?? getStringField(contentBlock, "text");

      if (!text) {
        continue;
      }

      blocks.push({
        id: `response.stream[${index}]`,
        path: `response.body.raw:data[${index}]`,
        type: getStringField(eventObject, "type") ?? "stream_delta",
        text,
        raw: event,
      });
    } catch {}
  }

  return blocks;
}

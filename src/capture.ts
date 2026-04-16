import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  CaptureRequestMeta,
  CaptureResponseMeta,
  PromptCaptureRecord,
  PromptGatewayConfig,
  RedactedHeaders,
} from "./types.js";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

type PromptBody = {
  system?: unknown;
  messages?: unknown;
  model?: unknown;
  max_tokens?: unknown;
  stream?: unknown;
};

interface HeadersLike {
  entries(): IterableIterator<[string, string]>;
}

function isHeadersLike(
  value: HeadersLike | Record<string, string | string[] | undefined>,
): value is HeadersLike {
  return typeof (value as HeadersLike).entries === "function";
}

export function redactHeaders(
  headers: HeadersLike | Record<string, string | string[] | undefined>,
): RedactedHeaders {
  const pairs: Array<[string, string]> = isHeadersLike(headers)
    ? Array.from(headers.entries())
    : Object.entries(headers).flatMap(([key, value]) => {
        if (typeof value === "undefined") {
          return [];
        }

        return [[key, Array.isArray(value) ? value.join(", ") : value] as [string, string]];
      });

  return Object.fromEntries(
    pairs.map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      return [key, SENSITIVE_HEADERS.has(lowerKey) ? "[REDACTED]" : value];
    }),
  );
}

function asPromptBody(body: unknown): PromptBody {
  if (typeof body === "object" && body !== null) {
    return body as PromptBody;
  }

  return {};
}

function previewPrompt(body: PromptBody): string {
  const segments: string[] = [];

  if (typeof body?.system === "string") {
    segments.push(body.system);
  } else if (Array.isArray(body?.system)) {
    for (const item of body.system) {
      if (typeof item === "string") {
        segments.push(item);
      } else if (typeof item?.text === "string") {
        segments.push(item.text);
      }
    }
  }

  if (Array.isArray(body?.messages)) {
    for (const message of body.messages) {
      if (typeof message?.content === "string") {
        segments.push(message.content);
        continue;
      }

      if (Array.isArray(message?.content)) {
        for (const part of message.content) {
          if (typeof part?.text === "string") {
            segments.push(part.text);
          }
        }
      }
    }
  }

  return segments.join("\n\n").slice(0, 1200);
}

export function capturePromptRequest(
  reqMeta: CaptureRequestMeta,
  responseMeta: CaptureResponseMeta,
): PromptCaptureRecord {
  const timestampMs = Date.now();
  const capturedAt = new Date(timestampMs).toISOString();
  const requestId = crypto.randomUUID();
  const body = asPromptBody(reqMeta.body);

  return {
    requestId,
    capturedAt,
    timestampMs,
    method: reqMeta.method,
    path: reqMeta.path,
    sessionId: reqMeta.sessionId,
    requestHeaders: {
      redacted: reqMeta.redactedHeaders,
    },
    requestBody: {
      raw: reqMeta.body,
    },
    derived: {
      system: body?.system ?? null,
      messages: body?.messages ?? null,
      model: typeof body?.model === "string" ? body.model : null,
      maxTokens: typeof body?.max_tokens === "number" ? body.max_tokens : null,
      stream: Boolean(body?.stream),
      promptTextPreview: previewPrompt(body),
    },
    response: responseMeta,
  };
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTimestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function writeCaptureArtifacts(
  record: PromptCaptureRecord,
  html: string,
  config: Pick<PromptGatewayConfig, "outputRoot" | "writeJson" | "writeHtml">,
): Promise<{ jsonPath?: string; htmlPath?: string }> {
  const date = new Date(record.timestampMs);
  const day = formatDay(date);
  const stamp = formatTimestampForFile(date);
  const baseName = `${stamp}-${record.requestId}`;

  let jsonPath: string | undefined;
  let htmlPath: string | undefined;

  if (config.writeJson) {
    const captureDir = path.join(config.outputRoot, "captures", day);
    jsonPath = path.join(captureDir, `${baseName}.json`);
    await fs.mkdir(captureDir, { recursive: true });
    await fs.writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  if (config.writeHtml) {
    const htmlDir = path.join(config.outputRoot, "html", day);
    htmlPath = path.join(htmlDir, `${baseName}.html`);
    await fs.mkdir(htmlDir, { recursive: true });
    await fs.writeFile(htmlPath, html, "utf8");
  }

  return { jsonPath, htmlPath };
}

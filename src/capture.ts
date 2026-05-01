import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  CaptureRequestMeta,
  CaptureResponseMeta,
  PromptCaptureListItem,
  PromptCaptureRecord,
  PromptGatewayConfig,
  PromptSessionListItem,
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

function previewText(text: string): string {
  return text.slice(0, 1200);
}

function getLastUserMessagePreview(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== "user") {
      continue;
    }

    if (typeof message.content === "string") {
      const normalized = message.content.trim();
      if (normalized) {
        return previewText(normalized);
      }
      continue;
    }

    if (!Array.isArray(message.content)) {
      continue;
    }

    for (let contentIndex = message.content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const part = message.content[contentIndex] as { text?: unknown };
      if (typeof part?.text !== "string") {
        continue;
      }

      const normalized = part.text.trim();
      if (normalized) {
        return previewText(normalized);
      }
    }
  }

  return null;
}

function previewPrompt(body: PromptBody): string {
  const lastUserMessagePreview = getLastUserMessagePreview(body?.messages);
  if (lastUserMessagePreview) {
    return lastUserMessagePreview;
  }

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

  return previewText(segments.join("\n\n"));
}

function normalizeCaptureRecord(record: PromptCaptureRecord): PromptCaptureRecord {
  const body = asPromptBody(record.requestBody?.raw);

  return {
    ...record,
    derived: {
      ...record.derived,
      promptTextPreview: previewPrompt(body),
    },
  };
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
    response: {
      ...responseMeta,
      body: {
        raw: responseMeta.body,
      },
    },
  };
}

const SESSION_CAPTURE_DIR = "sessions";
const MISSING_SESSION_SLUG = "missing-session";
const CAPTURE_READ_CONCURRENCY = 32;

function getValidTimeZone(timezone?: string): string | undefined {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const candidate = timezone || fallback;

  if (!candidate) {
    return undefined;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return fallback;
  }
}

function formatLocalTimestampForFile(timestampMs: number, timezone?: string): string {
  const validTimeZone = getValidTimeZone(timezone);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };

  if (validTimeZone) {
    options.timeZone = validTimeZone;
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", options)
      .formatToParts(new Date(timestampMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
}

function slugifyFilePart(
  value: string | null | undefined,
  fallback: string,
  maxLength = 80,
): string {
  const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  const compact = normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const slug = compact || fallback;
  return slug.length > maxLength ? slug.slice(0, maxLength).replace(/-$/g, "") : slug;
}

function getSessionSlug(sessionId: string | null): string {
  return slugifyFilePart(sessionId, MISSING_SESSION_SLUG, 80);
}

function getArtifactBaseName(record: PromptCaptureRecord, timezone?: string): string {
  const stamp = formatLocalTimestampForFile(record.timestampMs, timezone);
  const sessionSlug = getSessionSlug(record.sessionId);
  const status = String(record.response.status);
  const modelSlug = slugifyFilePart(record.derived.model, "unknown-model", 80);
  const requestSlug = slugifyFilePart(record.requestId, "unknown-request", 32).slice(0, 12);

  return `${stamp}__${sessionSlug}__${status}__${modelSlug}__req-${requestSlug}`;
}

export async function writeCaptureArtifacts(
  record: PromptCaptureRecord,
  html: string,
  config: Pick<PromptGatewayConfig, "outputRoot" | "writeJson" | "writeHtml" | "timezone">,
): Promise<{ jsonPath?: string; htmlPath?: string }> {
  const sessionSlug = getSessionSlug(record.sessionId);
  const baseName = getArtifactBaseName(record, config.timezone);

  let jsonPath: string | undefined;
  let htmlPath: string | undefined;

  if (config.writeJson) {
    const captureDir = path.join(config.outputRoot, "captures", SESSION_CAPTURE_DIR, sessionSlug);
    jsonPath = path.join(captureDir, `${baseName}.json`);
    await fs.mkdir(captureDir, { recursive: true });
    await fs.writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  if (config.writeHtml) {
    const htmlDir = path.join(config.outputRoot, "html", SESSION_CAPTURE_DIR, sessionSlug);
    htmlPath = path.join(htmlDir, `${baseName}.html`);
    await fs.mkdir(htmlDir, { recursive: true });
    await fs.writeFile(htmlPath, html, "utf8");
  }

  return { jsonPath, htmlPath };
}

function toListItem(record: PromptCaptureRecord): PromptCaptureListItem {
  return {
    requestId: record.requestId,
    capturedAt: record.capturedAt,
    timestampMs: record.timestampMs,
    sessionId: record.sessionId,
    model: record.derived.model,
    maxTokens: record.derived.maxTokens,
    stream: record.derived.stream,
    status: record.response.status,
    durationMs: record.response.durationMs,
    ok: record.response.ok,
    promptTextPreview: record.derived.promptTextPreview,
  };
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function listJsonFiles(root: string): Promise<string[]> {
  try {
    const files = await fs.readdir(root);
    return files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .map((file) => path.join(root, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function listCaptureFilePaths(outputRoot: string): Promise<string[]> {
  const capturesRoot = path.join(outputRoot, "captures");
  const sessionRoot = path.join(capturesRoot, SESSION_CAPTURE_DIR);
  const sessionDirs = await listDirectories(sessionRoot);
  const paths: string[] = [];

  for (const sessionDir of sessionDirs) {
    paths.push(...(await listJsonFiles(path.join(sessionRoot, sessionDir))));
  }

  const legacyDayDirs = (await listDirectories(capturesRoot)).filter((dir) =>
    /^\d{4}-\d{2}-\d{2}$/.test(dir),
  );
  for (const dayDir of legacyDayDirs) {
    paths.push(...(await listJsonFiles(path.join(capturesRoot, dayDir))));
  }

  return paths;
}

async function readCaptureFile(filePath: string): Promise<PromptCaptureRecord | null> {
  let raw: string;

  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    return normalizeCaptureRecord(JSON.parse(raw) as PromptCaptureRecord);
  } catch {
    return null;
  }
}

export async function listPromptCaptures(outputRoot: string): Promise<PromptCaptureListItem[]> {
  const records = await listPromptCaptureRecords(outputRoot);
  return records.map(toListItem).sort((left, right) => right.timestampMs - left.timestampMs);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    }),
  );

  return results;
}

async function listPromptCaptureRecords(outputRoot: string): Promise<PromptCaptureRecord[]> {
  const files = await listCaptureFilePaths(outputRoot);
  const records = (
    await mapWithConcurrency(files, CAPTURE_READ_CONCURRENCY, (file) => readCaptureFile(file))
  ).filter((record): record is PromptCaptureRecord => Boolean(record));

  return records.sort((left, right) => right.timestampMs - left.timestampMs);
}

export async function listPromptSessions(outputRoot: string): Promise<PromptSessionListItem[]> {
  const records = await listPromptCaptureRecords(outputRoot);
  const sessions = new Map<string, PromptCaptureRecord[]>();

  for (const record of records) {
    const key = record.sessionId ?? "";
    sessions.set(key, [...(sessions.get(key) ?? []), record]);
  }

  return Array.from(sessions.values())
    .map((sessionRecords) => {
      const sorted = [...sessionRecords].sort(
        (left, right) => right.timestampMs - left.timestampMs,
      );
      const latest = sorted[0];
      const models = Array.from(
        new Set(
          sorted
            .map((record) => record.derived.model)
            .filter((model): model is string => Boolean(model)),
        ),
      );

      return {
        sessionId: latest.sessionId,
        latestCapturedAt: latest.capturedAt,
        latestTimestampMs: latest.timestampMs,
        requestCount: sorted.length,
        successCount: sorted.filter((record) => record.response.ok).length,
        errorCount: sorted.filter((record) => !record.response.ok).length,
        streamCount: sorted.filter((record) => record.derived.stream).length,
        durationMs: sorted.reduce((total, record) => total + record.response.durationMs, 0),
        models,
        promptTextPreview: latest.derived.promptTextPreview,
      };
    })
    .sort((left, right) => right.latestTimestampMs - left.latestTimestampMs);
}

export async function listPromptCapturesBySessionId(
  outputRoot: string,
  sessionId: string | null,
): Promise<PromptCaptureRecord[]> {
  const records = await listPromptCaptureRecords(outputRoot);
  return records
    .filter((record) => record.sessionId === sessionId)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

export async function getPromptCaptureById(
  outputRoot: string,
  requestId: string,
): Promise<PromptCaptureRecord | null> {
  const files = await listCaptureFilePaths(outputRoot);

  for (const file of files) {
    const record = await readCaptureFile(file);
    if (record?.requestId === requestId) {
      return record;
    }
  }

  return null;
}

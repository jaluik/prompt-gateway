import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fetch, { Headers, type Response } from "node-fetch";

import {
  capturePromptRequest,
  getPromptCaptureById,
  listPromptCaptures,
  listPromptCapturesBySessionId,
  listPromptSessions,
  redactHeaders,
  writeCaptureArtifacts,
} from "./capture.js";
import { renderPromptCaptureHtml, renderWebAppFallbackHtml } from "./render.js";
import type { PromptGatewayConfig } from "./types.js";
import { resolveUpstreamConfig } from "./upstream.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const WEB_DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "web");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function getRequestPathname(url: string | undefined): string {
  if (!url) {
    return "/";
  }

  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return url;
  }
}

async function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function forwardResponseAndCapture(
  upstream: Response,
  res: http.ServerResponse,
): Promise<unknown> {
  if (!upstream.body) {
    res.end();
    return null;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of upstream.body) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(bufferChunk);

    if (!res.write(bufferChunk)) {
      await new Promise<void>((resolve) => res.once("drain", resolve));
    }
  }

  res.end();

  const responseText = Buffer.concat(chunks).toString("utf8");
  const contentType = upstream.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  return responseText;
}

function toHeaders(req: http.IncomingMessage): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") {
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  return headers;
}

function writeResponseHead(res: http.ServerResponse, upstream: Response): void {
  for (const [key, value] of upstream.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    res.setHeader(key, value);
  }

  res.statusCode = upstream.status;
  res.statusMessage = upstream.statusText;
}

function writeJson(res: http.ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function writeError(res: http.ServerResponse, error: string, statusCode: number): void {
  writeJson(res, { error }, statusCode);
}

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveWebAssetPath(requestPath: string): string | null {
  const normalized = path.posix.normalize(requestPath);
  if (requestPath.startsWith("/assets/") && !normalized.startsWith("/assets/")) {
    return null;
  }

  const assetPath = normalized.replace(/^\/+/, "");
  if (!assetPath) {
    return null;
  }

  const resolvedPath = path.resolve(WEB_DIST_DIR, assetPath);
  const relativePath = path.relative(WEB_DIST_DIR, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

async function readWebAsset(requestPath: string): Promise<Buffer | null> {
  const assetPath = resolveWebAssetPath(requestPath);
  if (!assetPath) {
    return null;
  }

  try {
    return await fs.readFile(assetPath);
  } catch (error) {
    if (["EISDIR", "ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) {
      return null;
    }

    throw error;
  }
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function serveWebApp(
  res: http.ServerResponse,
  requestPath: string,
  htmlTitle: string,
): Promise<boolean> {
  if (requestPath.startsWith("/api/")) {
    return false;
  }

  if (requestPath.startsWith("/assets/") || requestPath === "/favicon.ico") {
    const file = await readWebAsset(requestPath);
    if (!file) {
      writeError(res, "Asset not found", 404);
      return true;
    }

    res.statusCode = 200;
    res.setHeader("content-type", getContentType(requestPath));
    res.end(file);
    return true;
  }

  if (
    requestPath === "/" ||
    requestPath.startsWith("/captures/") ||
    requestPath.startsWith("/sessions/")
  ) {
    const indexFile = await readWebAsset("index.html");
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(indexFile ? indexFile.toString("utf8") : renderWebAppFallbackHtml(htmlTitle));
    return true;
  }

  return false;
}

export function createGatewayServer(config: PromptGatewayConfig): http.Server {
  return http.createServer((req, res) => {
    void handleGatewayRequest(req, res, config).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[prompt-gateway] request failed: ${message}\n`);

      if (res.writableEnded) {
        return;
      }

      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : new Error(message));
        return;
      }

      writeError(res, "Internal server error", 500);
    });
  });
}

async function handleGatewayRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: PromptGatewayConfig,
): Promise<void> {
  const requestPath = getRequestPathname(req.url);

  if (req.method === "GET" && requestPath === "/api/captures") {
    const captures = await listPromptCaptures(config.outputRoot);
    writeJson(res, { captures });
    return;
  }

  if (req.method === "GET" && requestPath === "/api/sessions") {
    const sessions = await listPromptSessions(config.outputRoot);
    writeJson(res, { sessions });
    return;
  }

  if (req.method === "GET" && requestPath.startsWith("/api/sessions/")) {
    const encodedSessionId = requestPath.slice("/api/sessions/".length);
    const sessionId = encodedSessionId === "~missing" ? null : decodePathSegment(encodedSessionId);
    if (sessionId === null && encodedSessionId !== "~missing") {
      writeError(res, "Invalid session id", 400);
      return;
    }

    const captures = await listPromptCapturesBySessionId(config.outputRoot, sessionId);
    if (captures.length === 0) {
      writeError(res, "Session not found", 404);
      return;
    }

    writeJson(res, { sessionId, captures });
    return;
  }

  if (req.method === "GET" && requestPath.startsWith("/api/captures/")) {
    const requestId = decodePathSegment(requestPath.slice("/api/captures/".length));
    if (!requestId) {
      writeError(res, "Invalid capture id", 400);
      return;
    }

    const capture = await getPromptCaptureById(config.outputRoot, requestId);
    if (!capture) {
      writeError(res, "Capture not found", 404);
      return;
    }

    writeJson(res, capture);
    return;
  }

  if (req.method === "GET" && (await serveWebApp(res, requestPath, config.htmlTitle))) {
    return;
  }

  if (req.method !== "POST" || requestPath !== "/v1/messages") {
    writeError(res, "Not found", 404);
    return;
  }

  await handleMessagesRequest(req, res, requestPath, config);
}

async function handleMessagesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestPath: string,
  config: PromptGatewayConfig,
): Promise<void> {
  const startedAt = Date.now();
  let parsedBody: unknown = null;
  let upstreamStatus = 502;
  let upstreamOk = false;
  let upstreamError: string | undefined;
  let upstreamBody: unknown = null;

  try {
    const bodyBuffer = await readRequestBody(req);
    const bodyText = bodyBuffer.toString("utf8");

    try {
      parsedBody = bodyBuffer.length === 0 ? null : JSON.parse(bodyText);
    } catch {
      upstreamStatus = 400;
      upstreamError = "Invalid JSON request body";
      upstreamBody = { error: upstreamError };
      parsedBody = bodyText;
      writeJson(res, upstreamBody, upstreamStatus);
      return;
    }

    const upstreamConfig = resolveUpstreamConfig(process.env, config.upstreamOverrides);
    const headers = toHeaders(req);
    if (upstreamConfig.apiKey && !headers.has("x-api-key")) {
      headers.set("x-api-key", upstreamConfig.apiKey);
    }
    if (!headers.has("anthropic-version")) {
      headers.set("anthropic-version", upstreamConfig.apiVersion);
    }
    headers.set("content-type", "application/json");

    const upstreamResponse = await fetch(upstreamConfig.messagesUrl, {
      method: "POST",
      headers,
      body: bodyBuffer,
    });

    upstreamStatus = upstreamResponse.status;
    upstreamOk = upstreamResponse.ok;
    writeResponseHead(res, upstreamResponse);
    upstreamBody = await forwardResponseAndCapture(upstreamResponse, res);
  } catch (error) {
    upstreamError = error instanceof Error ? error.message : String(error);
    upstreamBody = { error: "Upstream request failed", details: upstreamError };
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.end();
      }
    } else {
      writeJson(res, upstreamBody, 502);
    }
  } finally {
    const record = capturePromptRequest(
      {
        method: req.method ?? "POST",
        path: requestPath,
        sessionId: req.headers["x-claude-code-session-id"]?.toString() ?? null,
        redactedHeaders: redactHeaders(
          req.headers as Record<string, string | string[] | undefined>,
        ),
        body: parsedBody,
      },
      {
        status: res.statusCode || upstreamStatus,
        durationMs: Date.now() - startedAt,
        ok: upstreamOk && !upstreamError,
        error: upstreamError,
        body: upstreamBody,
      },
    );

    const html = renderPromptCaptureHtml(record, { title: config.htmlTitle });
    try {
      await writeCaptureArtifacts(record, html, config);
    } catch (artifactError) {
      const message =
        artifactError instanceof Error ? artifactError.message : String(artifactError);
      process.stderr.write(`[prompt-gateway] failed to write artifacts: ${message}\n`);
    }
  }
}

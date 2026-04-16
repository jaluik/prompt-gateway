import http from "node:http";
import { pipeline } from "node:stream/promises";
import fetch, { Headers, type Response } from "node-fetch";

import { capturePromptRequest, redactHeaders, writeCaptureArtifacts } from "./capture.js";
import { renderPromptCaptureHtml } from "./render.js";
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

async function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
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

export function createGatewayServer(config: PromptGatewayConfig): http.Server {
  return http.createServer(async (req, res) => {
    const requestPath = req.url ?? "/";

    if (req.method !== "POST" || requestPath !== "/v1/messages") {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const startedAt = Date.now();
    let parsedBody: unknown = null;
    let upstreamStatus = 502;
    let upstreamOk = false;
    let upstreamError: string | undefined;

    try {
      const bodyBuffer = await readRequestBody(req);
      parsedBody = bodyBuffer.length === 0 ? null : JSON.parse(bodyBuffer.toString("utf8"));

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

      if (upstreamResponse.body) {
        await pipeline(upstreamResponse.body, res);
      } else {
        res.end();
      }
    } catch (error) {
      upstreamError = error instanceof Error ? error.message : String(error);
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Upstream request failed", details: upstreamError }));
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
  });
}

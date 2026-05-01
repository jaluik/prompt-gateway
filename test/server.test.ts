import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import fetch from "node-fetch";

import { createGatewayServer } from "../src/server.js";
import { test } from "./harness.js";
import { close, createTempDir, listen, onlyEntry, waitFor, waitForEntries } from "./helpers.js";

test("gateway proxies a JSON messages request and writes artifacts", async () => {
  const tempRoot = await createTempDir("prompt-gateway-server");
  let upstreamRequestBody = "";

  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) {
      upstreamRequestBody += chunk.toString();
    }

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ id: "msg_123", type: "message", content: [{ type: "text", text: "ok" }] }),
    );
  });

  const upstreamInfo = await listen(upstream);
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: true,
    htmlTitle: "Prompt Capture",
    upstreamOverrides: {
      baseUrl: upstreamInfo.url,
    },
  });
  const gatewayInfo = await listen(gateway);

  try {
    const response = await fetch(`${gatewayInfo.url}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-claude-code-session-id": "session-abc",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: "hello proxy" }],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as { id?: string };
    assert.equal(json.id, "msg_123");
    assert.match(upstreamRequestBody, /hello proxy/);

    const captureDir = path.join(tempRoot, "captures", "sessions", "session-abc");
    const captureFiles = await waitForEntries(() => fs.readdir(captureDir), "capture file");
    const captureFile = onlyEntry(captureFiles, "capture file");
    assert.match(captureFile, /__session-abc__200__claude-sonnet-4-5__req-/);
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, captureFile), "utf8"));

    assert.equal(capture.sessionId, "session-abc");
    assert.equal(capture.derived.model, "claude-sonnet-4-5");
    assert.equal(capture.response.body.raw.id, "msg_123");
    assert.equal(capture.response.body.raw.content[0].text, "ok");

    const htmlDir = path.join(tempRoot, "html", "sessions", "session-abc");
    const htmlFiles = await waitForEntries(() => fs.readdir(htmlDir), "html file");
    assert.equal(htmlFiles.length, 1);
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

test("gateway streams upstream responses", async () => {
  const tempRoot = await createTempDir("prompt-gateway-stream");
  const upstream = http.createServer((_, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    res.write("event: message\n");
    res.write(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello "}}\n\n',
    );
    res.write(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"stream"}}\n\n',
    );
    res.end("data: [DONE]\n\n");
  });
  const upstreamInfo = await listen(upstream);
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
    htmlTitle: "Prompt Capture",
    upstreamOverrides: {
      baseUrl: upstreamInfo.url,
    },
  });
  const gatewayInfo = await listen(gateway);

  try {
    const response = await fetch(`${gatewayInfo.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet",
        stream: true,
        messages: [{ role: "user", content: "hello stream" }],
      }),
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /\[DONE\]/);

    const captureDir = path.join(tempRoot, "captures", "sessions", "missing-session");
    const captureFiles = await waitForEntries(() => fs.readdir(captureDir), "capture file");
    const captureFile = onlyEntry(captureFiles, "capture file");
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, captureFile), "utf8"));

    assert.match(capture.response.body.raw, /"text":"hello "/);
    assert.match(capture.response.body.raw, /"text":"stream"/);
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

test("gateway records upstream failure responses", async () => {
  const tempRoot = await createTempDir("prompt-gateway-error");
  const upstream = http.createServer((_, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "boom" } }));
  });
  const upstreamInfo = await listen(upstream);
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
    htmlTitle: "Prompt Capture",
    upstreamOverrides: {
      baseUrl: upstreamInfo.url,
    },
  });
  const gatewayInfo = await listen(gateway);

  try {
    const response = await fetch(`${gatewayInfo.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet",
        messages: [{ role: "user", content: "hello error" }],
      }),
    });

    assert.equal(response.status, 500);
    const captureDir = path.join(tempRoot, "captures", "sessions", "missing-session");
    const captureFiles = await waitForEntries(() => fs.readdir(captureDir), "capture file");
    const captureFile = onlyEntry(captureFiles, "capture file");
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, captureFile), "utf8"));

    assert.equal(capture.response.status, 500);
    assert.equal(capture.response.ok, false);
    assert.equal(capture.response.body.raw.error.message, "boom");
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

test("gateway rejects invalid JSON messages requests without proxying upstream", async () => {
  const tempRoot = await createTempDir("prompt-gateway-invalid-json");
  let upstreamHitCount = 0;
  const upstream = http.createServer((_, res) => {
    upstreamHitCount += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamInfo = await listen(upstream);
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
    htmlTitle: "Prompt Capture",
    upstreamOverrides: {
      baseUrl: upstreamInfo.url,
    },
  });
  const gatewayInfo = await listen(gateway);

  try {
    const response = await fetch(`${gatewayInfo.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "Invalid JSON request body");
    assert.equal(upstreamHitCount, 0);

    const captureDir = path.join(tempRoot, "captures", "sessions", "missing-session");
    const captureFiles = await waitForEntries(() => fs.readdir(captureDir), "capture file");
    const captureFile = onlyEntry(captureFiles, "capture file");
    const capture = JSON.parse(await fs.readFile(path.join(captureDir, captureFile), "utf8"));

    assert.equal(capture.response.status, 400);
    assert.equal(capture.response.ok, false);
    assert.equal(capture.response.error, "Invalid JSON request body");
    assert.equal(capture.requestBody.raw, "{not json");
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

test("gateway rejects malformed encoded API ids", async () => {
  const tempRoot = await createTempDir("prompt-gateway-bad-api-id");
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
    htmlTitle: "Prompt Capture",
  });
  const gatewayInfo = await listen(gateway);

  try {
    const sessionResponse = await fetch(`${gatewayInfo.url}/api/sessions/%E0%A4%A`);
    assert.equal(sessionResponse.status, 400);
    const sessionBody = (await sessionResponse.json()) as { error?: string };
    assert.equal(sessionBody.error, "Invalid session id");

    const captureResponse = await fetch(`${gatewayInfo.url}/api/captures/%E0%A4%A`);
    assert.equal(captureResponse.status, 400);
    const captureBody = (await captureResponse.json()) as { error?: string };
    assert.equal(captureBody.error, "Invalid capture id");
  } finally {
    await close(gatewayInfo.server);
  }
});

test("gateway exposes capture history APIs and browser shell", async () => {
  const tempRoot = await createTempDir("prompt-gateway-browser");
  const upstream = http.createServer((_, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamInfo = await listen(upstream);
  const gateway = createGatewayServer({
    host: "127.0.0.1",
    port: 0,
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
    htmlTitle: "Prompt Capture Browser",
    upstreamOverrides: {
      baseUrl: upstreamInfo.url,
    },
  });
  const gatewayInfo = await listen(gateway);

  try {
    await fetch(`${gatewayInfo.url}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-claude-code-session-id": "browser-session",
      },
      body: JSON.stringify({
        model: "claude-sonnet",
        messages: [{ role: "user", content: "browser test prompt" }],
      }),
    });

    const listPayload = await waitFor(async () => {
      const listResponse = await fetch(`${gatewayInfo.url}/api/captures`);
      assert.equal(listResponse.status, 200);
      const payload = (await listResponse.json()) as {
        captures: Array<{ requestId: string; promptTextPreview: string }>;
      };
      if (payload.captures.length === 0) {
        throw new Error("waiting for capture list");
      }

      return payload;
    });
    assert.equal(listPayload.captures.length, 1);
    assert.match(listPayload.captures[0]?.promptTextPreview || "", /browser test prompt/);

    const sessionListResponse = await fetch(`${gatewayInfo.url}/api/sessions`);
    assert.equal(sessionListResponse.status, 200);
    const sessionListPayload = (await sessionListResponse.json()) as {
      sessions: Array<{ sessionId: string | null; requestCount: number }>;
    };
    assert.equal(sessionListPayload.sessions[0]?.sessionId, "browser-session");
    assert.equal(sessionListPayload.sessions[0]?.requestCount, 1);

    const sessionDetailResponse = await fetch(`${gatewayInfo.url}/api/sessions/browser-session`);
    assert.equal(sessionDetailResponse.status, 200);
    const sessionDetailPayload = (await sessionDetailResponse.json()) as {
      captures: Array<{ sessionId: string | null }>;
    };
    assert.equal(sessionDetailPayload.captures.length, 1);
    assert.equal(sessionDetailPayload.captures[0]?.sessionId, "browser-session");

    const requestId = listPayload.captures[0]?.requestId;
    assert.ok(requestId);

    const detailResponse = await fetch(`${gatewayInfo.url}/api/captures/${requestId}`);
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as { requestId: string };
    assert.equal(detailPayload.requestId, requestId);

    const appResponse = await fetch(`${gatewayInfo.url}/`);
    assert.equal(appResponse.status, 200);
    const appHtml = await appResponse.text();
    assert.match(appHtml, /Prompt Gateway is almost ready|<div id="root"><\/div>/);

    const sessionAppResponse = await fetch(`${gatewayInfo.url}/sessions/browser-session`);
    assert.equal(sessionAppResponse.status, 200);
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

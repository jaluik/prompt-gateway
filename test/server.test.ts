import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { createGatewayServer } from "../src/server.js";
import { close, createTempDir, listen, onlyEntry, waitForEntries } from "./helpers.js";

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
    const json = await response.json();
    assert.equal(json.id, "msg_123");
    assert.match(upstreamRequestBody, /hello proxy/);

    const captureRoot = path.join(tempRoot, "captures");
    const captureDays = await waitForEntries(() => fs.readdir(captureRoot), "capture day");
    const captureDay = onlyEntry(captureDays, "capture day");
    const captureFiles = await waitForEntries(
      () => fs.readdir(path.join(captureRoot, captureDay)),
      "capture file",
    );
    const captureFile = onlyEntry(captureFiles, "capture file");
    const capture = JSON.parse(
      await fs.readFile(path.join(captureRoot, captureDay, captureFile), "utf8"),
    );

    assert.equal(capture.sessionId, "session-abc");
    assert.equal(capture.derived.model, "claude-sonnet-4-5");

    const htmlRoot = path.join(tempRoot, "html");
    const htmlDays = await waitForEntries(() => fs.readdir(htmlRoot), "html day");
    assert.equal(htmlDays.length, 1);
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
    res.write('data: {"type":"content_block_delta"}\n\n');
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
    const captureRoot = path.join(tempRoot, "captures");
    const captureDays = await waitForEntries(() => fs.readdir(captureRoot), "capture day");
    const captureDay = onlyEntry(captureDays, "capture day");
    const captureFiles = await waitForEntries(
      () => fs.readdir(path.join(captureRoot, captureDay)),
      "capture file",
    );
    const captureFile = onlyEntry(captureFiles, "capture file");
    const capture = JSON.parse(
      await fs.readFile(path.join(captureRoot, captureDay, captureFile), "utf8"),
    );

    assert.equal(capture.response.status, 500);
    assert.equal(capture.response.ok, false);
  } finally {
    await close(gatewayInfo.server);
    await close(upstreamInfo.server);
  }
});

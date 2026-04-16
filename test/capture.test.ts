import assert from "node:assert/strict";

import {
  capturePromptRequest,
  getPromptCaptureById,
  listPromptCaptures,
  redactHeaders,
  writeCaptureArtifacts,
} from "../src/capture.js";
import { renderPromptCaptureHtml } from "../src/render.js";
import { test } from "./harness.js";
import { createTempDir, onlyEntry } from "./helpers.js";

test("redactHeaders masks sensitive values", () => {
  const redacted = redactHeaders({
    authorization: "Bearer secret",
    "x-api-key": "top-secret",
    "content-type": "application/json",
  });

  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted["x-api-key"], "[REDACTED]");
  assert.equal(redacted["content-type"], "application/json");
});

test("capturePromptRequest extracts prompt metadata", () => {
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-123",
      redactedHeaders: { authorization: "[REDACTED]" },
      body: {
        system: "system prompt",
        model: "claude-sonnet",
        max_tokens: 2048,
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      },
    },
    {
      status: 200,
      durationMs: 42,
      ok: true,
    },
  );

  assert.equal(record.path, "/v1/messages");
  assert.equal(record.sessionId, "session-123");
  assert.equal(record.derived.model, "claude-sonnet");
  assert.equal(record.derived.maxTokens, 2048);
  assert.equal(record.derived.stream, true);
  assert.match(record.derived.promptTextPreview, /system prompt/);
  assert.match(record.derived.promptTextPreview, /hello/);
});

test("renderPromptCaptureHtml includes key fields", () => {
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-123",
      redactedHeaders: { authorization: "[REDACTED]" },
      body: {
        system: "system prompt",
        model: "claude-sonnet",
        max_tokens: 2048,
        stream: false,
        messages: [{ role: "user", content: "hello" }],
      },
    },
    {
      status: 200,
      durationMs: 42,
      ok: true,
    },
  );

  const html = renderPromptCaptureHtml(record, { title: "Prompt Capture" });
  assert.match(html, /Prompt Capture/);
  assert.match(html, /session-123/);
  assert.match(html, /claude-sonnet/);
  assert.match(html, /hello/);
});

test("writeCaptureArtifacts creates dated output files", async () => {
  const tempRoot = await createTempDir("prompt-gateway-capture");
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: null,
      redactedHeaders: {},
      body: { messages: [] },
    },
    {
      status: 200,
      durationMs: 1,
      ok: true,
    },
  );

  const html = renderPromptCaptureHtml(record);
  const result = await writeCaptureArtifacts(record, html, {
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: true,
  });

  assert.ok(result.jsonPath);
  assert.ok(result.htmlPath);
  assert.match(onlyEntry([result.jsonPath], "json path"), /captures\/\d{4}-\d{2}-\d{2}\//);
  assert.match(onlyEntry([result.htmlPath], "html path"), /html\/\d{4}-\d{2}-\d{2}\//);
});

test("capture helpers list and resolve saved prompt captures", async () => {
  const tempRoot = await createTempDir("prompt-gateway-list");
  const first = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-a",
      redactedHeaders: {},
      body: {
        model: "claude-haiku",
        messages: [{ role: "user", content: "first prompt" }],
      },
    },
    {
      status: 200,
      durationMs: 12,
      ok: true,
    },
  );

  const second = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-b",
      redactedHeaders: {},
      body: {
        model: "claude-sonnet",
        messages: [{ role: "user", content: "second prompt" }],
      },
    },
    {
      status: 500,
      durationMs: 24,
      ok: false,
    },
  );

  await writeCaptureArtifacts(first, renderPromptCaptureHtml(first), {
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
  });
  await writeCaptureArtifacts(second, renderPromptCaptureHtml(second), {
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: false,
  });

  const captures = await listPromptCaptures(tempRoot);
  assert.equal(captures.length, 2);
  assert.deepEqual(
    captures.map((capture) => capture.requestId).sort(),
    [first.requestId, second.requestId].sort(),
  );
  assert.ok(captures.some((capture) => /second prompt/.test(capture.promptTextPreview)));

  const resolved = await getPromptCaptureById(tempRoot, first.requestId);
  assert.equal(resolved?.requestId, first.requestId);
  assert.match(resolved?.derived.promptTextPreview || "", /first prompt/);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  capturePromptRequest,
  getPromptCaptureById,
  listPromptCaptures,
  listPromptCapturesBySessionId,
  listPromptSessions,
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
      body: { content: [{ type: "text", text: "hello back" }] },
    },
  );

  assert.equal(record.path, "/v1/messages");
  assert.equal(record.sessionId, "session-123");
  assert.equal(record.derived.model, "claude-sonnet");
  assert.equal(record.derived.maxTokens, 2048);
  assert.equal(record.derived.stream, true);
  assert.equal(record.derived.promptTextPreview, "hello");
  assert.equal(record.response.body.raw && typeof record.response.body.raw, "object");
});

test("capturePromptRequest prefers the last text block in user messages for prompt preview", () => {
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-456",
      redactedHeaders: {},
      body: {
        system: "shared instructions",
        messages: [
          { role: "assistant", content: "previous reply" },
          {
            role: "user",
            content: [
              { type: "text", text: "first distinguishing question" },
              { type: "text", text: "extra context" },
            ],
          },
          {
            role: "user",
            content: [
              { type: "text", text: "later user prompt" },
              { type: "text", text: "final distinguishing prompt" },
            ],
          },
        ],
      },
    },
    {
      status: 200,
      durationMs: 18,
      ok: true,
      body: null,
    },
  );

  assert.equal(record.derived.promptTextPreview, "final distinguishing prompt");
});

test("capturePromptRequest prefers the last text block within a single user message", () => {
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-457",
      redactedHeaders: {},
      body: {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "system reminder one" },
              { type: "text", text: "system reminder two" },
              { type: "text", text: "Reply with exactly: prompt-gateway smoke test" },
            ],
          },
        ],
      },
    },
    {
      status: 200,
      durationMs: 5,
      ok: true,
      body: null,
    },
  );

  assert.equal(record.derived.promptTextPreview, "Reply with exactly: prompt-gateway smoke test");
});

test("capturePromptRequest falls back when no user message text is available", () => {
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-789",
      redactedHeaders: {},
      body: {
        system: "system fallback",
        messages: [{ role: "assistant", content: "assistant only" }],
      },
    },
    {
      status: 200,
      durationMs: 7,
      ok: true,
      body: null,
    },
  );

  assert.match(record.derived.promptTextPreview, /system fallback/);
  assert.match(record.derived.promptTextPreview, /assistant only/);
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
      body: { content: [{ type: "text", text: "hello back" }] },
    },
  );

  const html = renderPromptCaptureHtml(record, { title: "Prompt Capture" });
  assert.match(html, /Prompt Capture/);
  assert.match(html, /session-123/);
  assert.match(html, /claude-sonnet/);
  assert.match(html, /hello/);
  assert.match(html, /Response Body/);
  assert.match(html, /hello back/);
});

test("writeCaptureArtifacts creates session-scoped local-time output files", async () => {
  const tempRoot = await createTempDir("prompt-gateway-capture");
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session/test value",
      redactedHeaders: {},
      body: { model: "claude/sonnet 4.5", messages: [] },
    },
    {
      status: 200,
      durationMs: 1,
      ok: true,
      body: null,
    },
  );
  record.timestampMs = Date.parse("2026-04-20T00:00:00.000Z");
  record.capturedAt = "2026-04-20T00:00:00.000Z";

  const html = renderPromptCaptureHtml(record);
  const result = await writeCaptureArtifacts(record, html, {
    outputRoot: tempRoot,
    writeJson: true,
    writeHtml: true,
    timezone: "Asia/Shanghai",
  });

  assert.ok(result.jsonPath);
  assert.ok(result.htmlPath);
  assert.match(
    onlyEntry([result.jsonPath], "json path"),
    /captures\/sessions\/session-test-value\/2026-04-20_08-00-00__session-test-value__200__claude-sonnet-4.5__req-[a-zA-Z0-9._-]+\.json$/,
  );
  assert.match(
    onlyEntry([result.htmlPath], "html path"),
    /html\/sessions\/session-test-value\/2026-04-20_08-00-00__session-test-value__200__claude-sonnet-4.5__req-[a-zA-Z0-9._-]+\.html$/,
  );
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
      body: { content: [{ type: "text", text: "first response" }] },
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
      body: { error: { message: "boom" } },
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

test("capture helpers read legacy dated capture directories", async () => {
  const tempRoot = await createTempDir("prompt-gateway-legacy-captures");
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "legacy-session",
      redactedHeaders: {},
      body: {
        model: "claude-legacy",
        messages: [{ role: "user", content: "legacy prompt" }],
      },
    },
    {
      status: 200,
      durationMs: 5,
      ok: true,
      body: null,
    },
  );
  record.timestampMs = Date.parse("2026-04-19T20:00:00.000Z");
  record.capturedAt = "2026-04-19T20:00:00.000Z";

  const legacyDir = path.join(tempRoot, "captures", "2026-04-19");
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(path.join(legacyDir, `${record.requestId}.json`), JSON.stringify(record));

  const captures = await listPromptCaptures(tempRoot);
  assert.equal(captures.length, 1);
  assert.equal(captures[0]?.requestId, record.requestId);

  const resolved = await getPromptCaptureById(tempRoot, record.requestId);
  assert.equal(resolved?.sessionId, "legacy-session");
});

test("capture helpers group saved captures by Claude Code session", async () => {
  const tempRoot = await createTempDir("prompt-gateway-sessions");
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
      body: null,
    },
  );
  const second = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-a",
      redactedHeaders: {},
      body: {
        model: "claude-sonnet",
        stream: true,
        messages: [{ role: "user", content: "second prompt" }],
      },
    },
    {
      status: 500,
      durationMs: 24,
      ok: false,
      body: null,
    },
  );
  const other = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-b",
      redactedHeaders: {},
      body: {
        model: "claude-sonnet",
        messages: [{ role: "user", content: "other prompt" }],
      },
    },
    {
      status: 200,
      durationMs: 8,
      ok: true,
      body: null,
    },
  );
  first.timestampMs = Date.parse("2026-04-20T00:00:00.000Z");
  first.capturedAt = "2026-04-20T00:00:00.000Z";
  second.timestampMs = Date.parse("2026-04-20T00:01:00.000Z");
  second.capturedAt = "2026-04-20T00:01:00.000Z";
  other.timestampMs = Date.parse("2026-04-20T00:02:00.000Z");
  other.capturedAt = "2026-04-20T00:02:00.000Z";

  for (const record of [first, second, other]) {
    await writeCaptureArtifacts(record, renderPromptCaptureHtml(record), {
      outputRoot: tempRoot,
      writeJson: true,
      writeHtml: false,
    });
  }

  const sessions = await listPromptSessions(tempRoot);
  const sessionA = sessions.find((session) => session.sessionId === "session-a");
  assert.equal(sessionA?.requestCount, 2);
  assert.equal(sessionA?.successCount, 1);
  assert.equal(sessionA?.errorCount, 1);
  assert.equal(sessionA?.streamCount, 1);
  assert.equal(sessionA?.durationMs, 36);
  assert.deepEqual(sessionA?.models.sort(), ["claude-haiku", "claude-sonnet"]);

  const captures = await listPromptCapturesBySessionId(tempRoot, "session-a");
  assert.deepEqual(
    captures.map((capture) => capture.requestId),
    [first.requestId, second.requestId],
  );
});

test("capture helpers recompute preview for older saved captures", async () => {
  const tempRoot = await createTempDir("prompt-gateway-legacy-preview");
  const record = capturePromptRequest(
    {
      method: "POST",
      path: "/v1/messages",
      sessionId: "session-legacy",
      redactedHeaders: {},
      body: {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "legacy reminder" },
              { type: "text", text: "Reply with exactly: prompt-gateway smoke test" },
            ],
          },
        ],
      },
    },
    {
      status: 200,
      durationMs: 3,
      ok: true,
      body: null,
    },
  );

  await writeCaptureArtifacts(
    {
      ...record,
      derived: {
        ...record.derived,
        promptTextPreview: "legacy preview value",
      },
    },
    renderPromptCaptureHtml(record),
    {
      outputRoot: tempRoot,
      writeJson: true,
      writeHtml: false,
    },
  );

  const captures = await listPromptCaptures(tempRoot);
  assert.equal(captures[0]?.promptTextPreview, "Reply with exactly: prompt-gateway smoke test");

  const resolved = await getPromptCaptureById(tempRoot, record.requestId);
  assert.equal(
    resolved?.derived.promptTextPreview,
    "Reply with exactly: prompt-gateway smoke test",
  );
});

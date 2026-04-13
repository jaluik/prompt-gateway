import assert from "node:assert/strict";
import test from "node:test";

import { resolveUpstreamConfig } from "../src/upstream.js";

test("resolveUpstreamConfig prefers explicit overrides", () => {
  const config = resolveUpstreamConfig(
    {
      ANTHROPIC_BASE_URL: "https://env.example.com",
      ANTHROPIC_API_KEY: "env-key",
    },
    {
      baseUrl: "https://override.example.com",
      apiKey: "override-key",
      apiVersion: "2024-01-01",
    },
  );

  assert.equal(config.baseUrl, "https://override.example.com");
  assert.equal(config.messagesUrl, "https://override.example.com/v1/messages");
  assert.equal(config.apiKey, "override-key");
  assert.equal(config.apiVersion, "2024-01-01");
  assert.equal(config.source, "override");
});

test("resolveUpstreamConfig uses environment when provided", () => {
  const config = resolveUpstreamConfig({
    PROMPT_GATEWAY_UPSTREAM_URL: "https://env.example.com/",
    PROMPT_GATEWAY_UPSTREAM_API_KEY: "env-key",
    PROMPT_GATEWAY_UPSTREAM_API_VERSION: "2025-02-19",
  });

  assert.equal(config.baseUrl, "https://env.example.com");
  assert.equal(config.messagesUrl, "https://env.example.com/v1/messages");
  assert.equal(config.apiKey, "env-key");
  assert.equal(config.apiVersion, "2025-02-19");
  assert.equal(config.source, "environment");
});

test("resolveUpstreamConfig falls back to Anthropic default", () => {
  const config = resolveUpstreamConfig({});

  assert.equal(config.baseUrl, "https://api.anthropic.com");
  assert.equal(config.messagesUrl, "https://api.anthropic.com/v1/messages");
  assert.equal(config.apiVersion, "2023-06-01");
  assert.equal(config.source, "default");
});

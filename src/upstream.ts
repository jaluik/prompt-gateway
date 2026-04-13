import type { UpstreamConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_API_VERSION = "2023-06-01";

export function resolveUpstreamConfig(
  env: NodeJS.ProcessEnv,
  overrides: Partial<{
    baseUrl: string;
    apiKey: string;
    apiVersion: string;
  }> = {},
): UpstreamConfig {
  if (
    env.CLAUDE_CODE_USE_BEDROCK === "1" ||
    env.CLAUDE_CODE_USE_VERTEX === "1" ||
    env.CLAUDE_CODE_USE_FOUNDRY === "1"
  ) {
    if (!overrides.baseUrl && !env.PROMPT_GATEWAY_UPSTREAM_URL) {
      throw new Error(
        "Detected a non-Anthropic Claude Code provider. Set PROMPT_GATEWAY_UPSTREAM_URL to an Anthropic-compatible endpoint for this gateway.",
      );
    }
  }

  const baseUrl =
    overrides.baseUrl ||
    env.PROMPT_GATEWAY_UPSTREAM_URL ||
    env.ANTHROPIC_BASE_URL ||
    env.ANTHROPIC_API_URL ||
    DEFAULT_BASE_URL;

  const apiKey = overrides.apiKey || env.PROMPT_GATEWAY_UPSTREAM_API_KEY || env.ANTHROPIC_API_KEY;

  const apiVersion =
    overrides.apiVersion ||
    env.PROMPT_GATEWAY_UPSTREAM_API_VERSION ||
    env.ANTHROPIC_VERSION ||
    DEFAULT_API_VERSION;

  const source: UpstreamConfig["source"] =
    overrides.baseUrl || overrides.apiKey || overrides.apiVersion
      ? "override"
      : env.PROMPT_GATEWAY_UPSTREAM_URL ||
          env.PROMPT_GATEWAY_UPSTREAM_API_KEY ||
          env.PROMPT_GATEWAY_UPSTREAM_API_VERSION ||
          env.ANTHROPIC_BASE_URL ||
          env.ANTHROPIC_API_URL ||
          env.ANTHROPIC_API_KEY ||
          env.ANTHROPIC_VERSION
        ? "environment"
        : "default";

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    baseUrl: normalizedBaseUrl,
    messagesUrl: `${normalizedBaseUrl}/v1/messages`,
    apiKey,
    apiVersion,
    source,
  };
}

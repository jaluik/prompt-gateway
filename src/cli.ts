import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";

import { createGatewayServer } from "./server.js";
import type { PromptGatewayConfig } from "./types.js";
import { resolveUpstreamConfig } from "./upstream.js";

interface CliOverrides {
  host?: string;
  port?: number;
  outputRoot?: string;
  writeJson?: boolean;
  writeHtml?: boolean;
  htmlTitle?: string;
  timezone?: string;
  upstreamBaseUrl?: string;
  upstreamApiKey?: string;
  upstreamApiVersion?: string;
  claudeCommand?: string;
}

type ClaudeSettingsEnv = Partial<Record<"ANTHROPIC_BASE_URL" | "ANTHROPIC_API_URL", string>>;

interface ClaudeSettingsSnapshot {
  env: ClaudeSettingsEnv;
  settings: Record<string, unknown>;
}

interface GeneratedClaudeSettings {
  path: string;
  cleanup: () => Promise<void>;
}

const KNOWN_OPTIONS = new Set([
  "--help",
  "-h",
  "--host",
  "--port",
  "--output",
  "--upstream-url",
  "--api-key",
  "--api-version",
  "--html-title",
  "--timezone",
  "--claude-command",
  "--no-html",
  "--no-json",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePort(value: string | undefined, source: string): number {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${source} requires a port value`);
  }

  const port = Number(normalized);
  if (!/^\d+$/.test(normalized) || port > 65535) {
    throw new Error(`${source} must be an integer from 0 to 65535`);
  }

  return port;
}

function getOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (
    typeof value === "undefined" ||
    value === "--" ||
    value.startsWith("--") ||
    KNOWN_OPTIONS.has(value)
  ) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function showHelp(): void {
  process.stdout.write(`Claude Code Prompt Gateway

Usage:
  npx prompt-gateway
  npx prompt-gateway --port 8787 --upstream-url https://api.anthropic.com
  npx prompt-gateway claude
  prompt-gateway
  prompt-gateway --output ./.claude/prompt-gateway

Options:
  --host <value>              Listen host
  --port <value>              Listen port, falls back to an available port if busy
  --output <path>             Output directory for JSON and HTML captures
  --upstream-url <url>        Upstream base URL
  --api-key <value>           Upstream API key
  --api-version <value>       anthropic-version header
  --html-title <value>        HTML page title
  --timezone <value>          Timezone label override
  --claude-command <value>    Claude executable, default: claude
  --no-html                   Disable HTML artifact output
  --no-json                   Disable JSON artifact output
  --help                      Show this help

Environment variables are still supported and act as defaults.
`);
}

function parseArgs(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      break;
    }

    switch (arg) {
      case "--help":
      case "-h":
        showHelp();
        process.exit(0);
        return overrides;
      case "--host":
        overrides.host = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--port":
        overrides.port = parsePort(getOptionValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
        overrides.outputRoot = path.resolve(getOptionValue(argv, index, arg));
        index += 1;
        break;
      case "--upstream-url":
        overrides.upstreamBaseUrl = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--api-key":
        overrides.upstreamApiKey = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--api-version":
        overrides.upstreamApiVersion = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--html-title":
        overrides.htmlTitle = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--timezone":
        overrides.timezone = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--claude-command":
        overrides.claudeCommand = getOptionValue(argv, index, arg);
        index += 1;
        break;
      case "--no-html":
        overrides.writeHtml = false;
        break;
      case "--no-json":
        overrides.writeJson = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return overrides;
}

function getConfig(overrides: CliOverrides): PromptGatewayConfig {
  return {
    host: overrides.host || process.env.PROMPT_GATEWAY_HOST || "127.0.0.1",
    port:
      overrides.port ?? parsePort(process.env.PROMPT_GATEWAY_PORT || "8787", "PROMPT_GATEWAY_PORT"),
    outputRoot:
      overrides.outputRoot ||
      path.resolve(process.env.PROMPT_GATEWAY_OUTPUT_ROOT || ".claude/prompt-gateway"),
    writeJson: overrides.writeJson ?? parseBoolean(process.env.PROMPT_GATEWAY_WRITE_JSON, true),
    writeHtml: overrides.writeHtml ?? parseBoolean(process.env.PROMPT_GATEWAY_WRITE_HTML, true),
    htmlTitle:
      overrides.htmlTitle || process.env.PROMPT_GATEWAY_HTML_TITLE || "Claude Code Prompt Capture",
    timezone: overrides.timezone || process.env.PROMPT_GATEWAY_TIMEZONE,
    upstreamOverrides: {
      baseUrl: overrides.upstreamBaseUrl || process.env.PROMPT_GATEWAY_UPSTREAM_URL,
      apiKey: overrides.upstreamApiKey || process.env.PROMPT_GATEWAY_UPSTREAM_API_KEY,
      apiVersion: overrides.upstreamApiVersion || process.env.PROMPT_GATEWAY_UPSTREAM_API_VERSION,
    },
  };
}

function getPrivacyNotice(outputRoot: string): string {
  return `⚠️  Privacy: captures include raw request and response bodies. Keep ${outputRoot} private and out of git.`;
}

async function listenServer(
  server: http.Server,
  host: string,
  port: number,
): Promise<{ host: string; port: number; url: string }> {
  try {
    return await listenServerOnce(server, host, port);
  } catch (error) {
    if (port === 0 || (error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      throw error;
    }

    const address = await listenServerOnce(server, host, 0);
    process.stdout.write(
      `[prompt-gateway] Port ${port} on ${host} is already in use; using ${address.url} instead.\n`,
    );
    return address;
  }
}

async function listenServerOnce(
  server: http.Server,
  host: string,
  port: number,
): Promise<{ host: string; port: number; url: string }> {
  await new Promise<void>((resolve, reject) => {
    let cleanup = (): void => {};
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      resolve();
    };

    cleanup = (): void => {
      server.off("error", onError);
      server.off("listening", onListening);
    };

    server.once("error", onError);
    server.once("listening", onListening);

    try {
      server.listen(port, host);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve gateway address");
  }

  return {
    host,
    port: address.port,
    url: `http://${host}:${address.port}`,
  };
}

async function serve(overrides: CliOverrides): Promise<void> {
  const config = getConfig(overrides);
  const server = createGatewayServer(config);
  const address = await listenServer(server, config.host, config.port);
  const upstream = resolveUpstreamConfig(process.env, config.upstreamOverrides);

  process.stdout.write(
    [
      "🚀 Prompt Gateway is live",
      `🔀 Proxy target: ${upstream.baseUrl}`,
      `🌐 Local gateway: ${address.url}`,
      `📝 Capture store: ${config.outputRoot}`,
      `👀 Open history: ${address.url}/`,
      getPrivacyNotice(config.outputRoot),
      "",
      "Claude Code requests sent to this gateway will now be captured locally.",
      "",
    ].join("\n"),
  );
}

function getClaudeCommand(overrides: CliOverrides): string {
  return overrides.claudeCommand || process.env.PROMPT_GATEWAY_CLAUDE_COMMAND || "claude";
}

function getClaudeSettingsPath(env: NodeJS.ProcessEnv): string {
  const configDir = env.CLAUDE_CONFIG_DIR
    ? path.resolve(env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), ".claude");

  return path.join(configDir, "settings.json");
}

function extractClaudeSettingsEnv(settings: Record<string, unknown>): ClaudeSettingsEnv {
  if (!isRecord(settings.env)) {
    return {};
  }

  const settingsEnv: ClaudeSettingsEnv = {};
  for (const key of ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_URL"] as const) {
    const value = settings.env[key];
    if (typeof value === "string" && value.trim()) {
      settingsEnv[key] = value;
    }
  }

  return settingsEnv;
}

async function readClaudeSettings(env: NodeJS.ProcessEnv): Promise<ClaudeSettingsSnapshot> {
  try {
    const settingsText = await fs.readFile(getClaudeSettingsPath(env), "utf8");
    const settings = JSON.parse(settingsText) as unknown;
    if (!isRecord(settings)) {
      return { env: {}, settings: {} };
    }

    return { env: extractClaudeSettingsEnv(settings), settings };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { env: {}, settings: {} };
    }

    throw error;
  }
}

function getWrappedUpstreamBaseUrl(
  env: NodeJS.ProcessEnv,
  overrides: CliOverrides,
  claudeSettingsEnv: ClaudeSettingsEnv = {},
): string | undefined {
  return (
    overrides.upstreamBaseUrl ||
    env.PROMPT_GATEWAY_UPSTREAM_URL ||
    claudeSettingsEnv.ANTHROPIC_BASE_URL ||
    claudeSettingsEnv.ANTHROPIC_API_URL ||
    env.ANTHROPIC_BASE_URL ||
    env.ANTHROPIC_API_URL
  );
}

function shouldInjectClaudeSettings(claudeCommand: string): boolean {
  return path.basename(claudeCommand).toLowerCase().includes("claude");
}

async function createGatewayClaudeSettings(
  gatewayUrl: string,
  sourceSettings: Record<string, unknown>,
): Promise<GeneratedClaudeSettings> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-gateway-claude-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  const sourceEnv = isRecord(sourceSettings.env) ? sourceSettings.env : {};
  const gatewaySettings = {
    ...sourceSettings,
    env: {
      ...sourceEnv,
      ANTHROPIC_BASE_URL: gatewayUrl,
      ANTHROPIC_API_URL: gatewayUrl,
    },
  };

  await fs.writeFile(settingsPath, `${JSON.stringify(gatewaySettings, null, 2)}\n`, "utf8");

  return {
    path: settingsPath,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

function getGatewayClaudeArgs(
  claudeCommand: string,
  claudeArgs: string[],
  settingsPath?: string,
): string[] {
  if (!shouldInjectClaudeSettings(claudeCommand) || !settingsPath) {
    return claudeArgs;
  }

  return ["--settings", settingsPath, ...claudeArgs];
}

async function runClaude(overrides: CliOverrides, claudeArgs: string[]): Promise<void> {
  if (
    process.env.CLAUDE_CODE_USE_BEDROCK === "1" ||
    process.env.CLAUDE_CODE_USE_VERTEX === "1" ||
    process.env.CLAUDE_CODE_USE_FOUNDRY === "1"
  ) {
    throw new Error(
      "prompt-gateway claude currently supports Anthropic-compatible ANTHROPIC_BASE_URL flows only. Bedrock/Vertex/Foundry passthrough is not implemented yet.",
    );
  }

  const claudeSettings = await readClaudeSettings(process.env);
  const upstreamBaseUrl = getWrappedUpstreamBaseUrl(process.env, overrides, claudeSettings.env);
  const config = getConfig({
    ...overrides,
    upstreamBaseUrl,
  });

  const server = createGatewayServer(config);
  const address = await listenServer(server, config.host, config.port);
  const viewerUrl = `${address.url}/`;
  process.stdout.write(
    [
      "🚀 Prompt Gateway wrapped Claude Code",
      `🤖 Claude Code now talks to: ${address.url}`,
      `🔀 Real upstream stays at: ${upstreamBaseUrl || "https://api.anthropic.com"}`,
      `📝 Captures will be saved in: ${config.outputRoot}`,
      `🌐 Inspect prompts in your browser: ${viewerUrl}`,
      getPrivacyNotice(config.outputRoot),
      "",
      "Your current Claude Code session is now flowing through the local proxy.",
      "",
    ].join("\n"),
  );

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: address.url,
    PROMPT_GATEWAY_UPSTREAM_URL: upstreamBaseUrl,
  };

  delete childEnv.ANTHROPIC_API_URL;

  const cleanup = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  let generatedSettings: GeneratedClaudeSettings | undefined;
  let signalForwarder: ((signal: NodeJS.Signals) => void) | undefined;

  try {
    const claudeCommand = getClaudeCommand(overrides);
    generatedSettings = shouldInjectClaudeSettings(claudeCommand)
      ? await createGatewayClaudeSettings(address.url, claudeSettings.settings)
      : undefined;
    const childArgs = getGatewayClaudeArgs(claudeCommand, claudeArgs, generatedSettings?.path);
    const child = spawn(claudeCommand, childArgs, {
      stdio: "inherit",
      env: childEnv,
      shell: process.platform === "win32",
    });

    signalForwarder = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };

    process.on("SIGINT", signalForwarder);
    process.on("SIGTERM", signalForwarder);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code));
    });

    process.exitCode = exitCode ?? 1;
  } finally {
    if (signalForwarder) {
      process.off("SIGINT", signalForwarder);
      process.off("SIGTERM", signalForwarder);
    }
    await cleanup();
    await generatedSettings?.cleanup();
  }
}

const args = process.argv.slice(2);
const command = args[0];
const argList = command === "serve" ? args.slice(1) : args;

if (!command || command === "serve" || command.startsWith("--")) {
  const overrides = parseArgs(argList);
  serve(overrides).catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
} else if (command === "claude") {
  if (args[1] === "--help" || args[1] === "-h") {
    showHelp();
    process.exit(0);
  }

  const splitIndex = args.indexOf("--");
  const optionArgs = splitIndex === -1 ? [] : args.slice(1, splitIndex);
  const claudeArgs = splitIndex === -1 ? args.slice(1) : args.slice(splitIndex + 1);
  const overrides = parseArgs(optionArgs);

  runClaude(overrides, claudeArgs).catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write(
    "Usage: prompt-gateway [serve] [--port 8787] [--upstream-url <url>]\n       prompt-gateway claude [--claude-command claude] [-- --claude-args]\n",
  );
  process.exitCode = 1;
}

import { spawn } from "node:child_process";
import type http from "node:http";
import path from "node:path";

import { createGatewayServer } from "./server.js";
import type { PromptGatewayConfig } from "./types.js";

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

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
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
  --port <value>              Listen port
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
      continue;
    }

    const next = argv[index + 1];

    switch (arg) {
      case "--help":
      case "-h":
        showHelp();
        process.exit(0);
        return overrides;
      case "--host":
        overrides.host = next;
        index += 1;
        break;
      case "--port":
        if (next) {
          overrides.port = Number.parseInt(next, 10);
        }
        index += 1;
        break;
      case "--output":
        overrides.outputRoot = next ? path.resolve(next) : undefined;
        index += 1;
        break;
      case "--upstream-url":
        overrides.upstreamBaseUrl = next;
        index += 1;
        break;
      case "--api-key":
        overrides.upstreamApiKey = next;
        index += 1;
        break;
      case "--api-version":
        overrides.upstreamApiVersion = next;
        index += 1;
        break;
      case "--html-title":
        overrides.htmlTitle = next;
        index += 1;
        break;
      case "--timezone":
        overrides.timezone = next;
        index += 1;
        break;
      case "--claude-command":
        overrides.claudeCommand = next;
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
    port: overrides.port || Number.parseInt(process.env.PROMPT_GATEWAY_PORT || "8787", 10),
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

async function listenServer(
  server: http.Server,
  host: string,
  port: number,
): Promise<{ host: string; port: number; url: string }> {
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
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

  process.stdout.write(
    `[prompt-gateway] listening on ${address.url} -> output ${config.outputRoot}\n`,
  );
}

function getClaudeCommand(overrides: CliOverrides): string {
  return overrides.claudeCommand || process.env.PROMPT_GATEWAY_CLAUDE_COMMAND || "claude";
}

function getWrappedUpstreamBaseUrl(
  env: NodeJS.ProcessEnv,
  overrides: CliOverrides,
): string | undefined {
  return (
    overrides.upstreamBaseUrl ||
    env.PROMPT_GATEWAY_UPSTREAM_URL ||
    env.ANTHROPIC_BASE_URL ||
    env.ANTHROPIC_API_URL
  );
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

  const upstreamBaseUrl = getWrappedUpstreamBaseUrl(process.env, overrides);
  const config = getConfig({
    ...overrides,
    port: overrides.port ?? 0,
    upstreamBaseUrl,
  });

  const server = createGatewayServer(config);
  const address = await listenServer(server, config.host, config.port);
  process.stdout.write(
    `[prompt-gateway] wrapping Claude with gateway ${address.url} -> upstream ${upstreamBaseUrl || "https://api.anthropic.com"}\n`,
  );

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: address.url,
    PROMPT_GATEWAY_UPSTREAM_URL: upstreamBaseUrl,
  };

  delete childEnv.ANTHROPIC_API_URL;

  const claudeCommand = getClaudeCommand(overrides);
  const child = spawn(claudeCommand, claudeArgs, {
    stdio: "inherit",
    env: childEnv,
    shell: process.platform === "win32",
  });

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

  const forwardSignal = (signal: NodeJS.Signals): void => {
    child.kill(signal);
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code));
    });

    process.exitCode = exitCode ?? 1;
  } finally {
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
    await cleanup();
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

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
  npx @jaluik/prompt-tracker
  npx @jaluik/prompt-tracker --port 8787 --upstream-url https://api.anthropic.com
  prompt-gateway
  prompt-gateway --output ./.claude/prompt-tracker

Options:
  --host <value>              Listen host
  --port <value>              Listen port
  --output <path>             Output directory for JSON and HTML captures
  --upstream-url <url>        Upstream base URL
  --api-key <value>           Upstream API key
  --api-version <value>       anthropic-version header
  --html-title <value>        HTML page title
  --timezone <value>          Timezone label override
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
      path.resolve(process.env.PROMPT_GATEWAY_OUTPUT_ROOT || ".claude/prompt-tracker"),
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

async function serve(overrides: CliOverrides): Promise<void> {
  const config = getConfig(overrides);
  const server = createGatewayServer(config);

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => {
      process.stdout.write(
        `[prompt-gateway] listening on http://${config.host}:${config.port} -> output ${config.outputRoot}\n`,
      );
      resolve();
    });
  });
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
} else {
  process.stderr.write("Usage: prompt-gateway [serve] [--port 8787] [--upstream-url <url>]\n");
  process.exitCode = 1;
}

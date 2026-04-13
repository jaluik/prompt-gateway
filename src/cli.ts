import path from "node:path";

import { createGatewayServer } from "./server.js";
import type { PromptGatewayConfig } from "./types.js";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function getConfigFromEnv(): PromptGatewayConfig {
  return {
    host: process.env.PROMPT_GATEWAY_HOST || "127.0.0.1",
    port: Number.parseInt(process.env.PROMPT_GATEWAY_PORT || "8787", 10),
    outputRoot: path.resolve(process.env.PROMPT_GATEWAY_OUTPUT_ROOT || ".claude/prompt-tracker"),
    writeJson: parseBoolean(process.env.PROMPT_GATEWAY_WRITE_JSON, true),
    writeHtml: parseBoolean(process.env.PROMPT_GATEWAY_WRITE_HTML, true),
    htmlTitle: process.env.PROMPT_GATEWAY_HTML_TITLE || "Claude Code Prompt Capture",
    timezone: process.env.PROMPT_GATEWAY_TIMEZONE,
    upstreamOverrides: {
      baseUrl: process.env.PROMPT_GATEWAY_UPSTREAM_URL,
      apiKey: process.env.PROMPT_GATEWAY_UPSTREAM_API_KEY,
      apiVersion: process.env.PROMPT_GATEWAY_UPSTREAM_API_VERSION,
    },
  };
}

async function serve(): Promise<void> {
  const config = getConfigFromEnv();
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

const command = process.argv[2];

if (command === "serve") {
  serve().catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write("Usage: prompt-gateway serve\n");
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "./harness.js";
import { close, createTempDir, listen } from "./helpers.js";

const execFileAsync = promisify(execFile);

test("claude wrapper injects local ANTHROPIC_BASE_URL and preserves upstream", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const configDir = await createTempDir("prompt-gateway-cli-config");

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      cliPath,
      "claude",
      "--claude-command",
      process.execPath,
      "--",
      "-e",
      "console.log(JSON.stringify({ base: process.env.ANTHROPIC_BASE_URL, upstream: process.env.PROMPT_GATEWAY_UPSTREAM_URL }))",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: "https://litellm.example.com/anthropic",
        CLAUDE_CONFIG_DIR: configDir,
        PROMPT_GATEWAY_PORT: "0",
      },
    },
  );

  const lines = stdout.trim().split("\n");
  const payloadLine = lines[lines.length - 1];
  assert.ok(payloadLine);
  assert.match(stdout, /Prompt Gateway wrapped Claude Code/);
  assert.match(stdout, /Inspect prompts in your browser/);

  const payload = JSON.parse(payloadLine) as {
    base?: string;
    upstream?: string;
  };

  assert.match(payload.base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(payload.upstream, "https://litellm.example.com/anthropic");
});

test("claude wrapper honors explicit dynamic port", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const configDir = await createTempDir("prompt-gateway-cli-config");
  const env = { ...process.env };

  delete env.PROMPT_GATEWAY_PORT;

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      cliPath,
      "claude",
      "--port",
      "0",
      "--claude-command",
      process.execPath,
      "--",
      "-e",
      "console.log(JSON.stringify({ base: process.env.ANTHROPIC_BASE_URL }))",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        ANTHROPIC_BASE_URL: "https://litellm.example.com/anthropic",
        CLAUDE_CONFIG_DIR: configDir,
      },
    },
  );

  const lines = stdout.trim().split("\n");
  const payloadLine = lines[lines.length - 1];
  assert.ok(payloadLine);

  const payload = JSON.parse(payloadLine) as {
    base?: string;
  };
  const gatewayUrl = new URL(payload.base || "");

  assert.equal(gatewayUrl.hostname, "127.0.0.1");
  assert.notEqual(Number(gatewayUrl.port), 8787);
});

test("cli rejects invalid ports before starting the gateway", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "serve", "--port", "abc"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PROMPT_GATEWAY_PORT: "0",
      },
    }),
    (error) => {
      const stderr = (error as { stderr?: string }).stderr || "";
      assert.match(stderr, /--port must be an integer from 0 to 65535/);
      return true;
    },
  );
});

test("claude wrapper honors Claude settings upstream while overriding Claude base URL", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const tempDir = await createTempDir("prompt-gateway-cli");
  const configDir = path.join(tempDir, "claude-config");
  const fakeClaudePath = path.join(tempDir, "claude");

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "settings.json"),
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
        ANTHROPIC_AUTH_TOKEN: "test-token",
      },
    }),
  );
  await fs.writeFile(
    fakeClaudePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const settingsIndex = process.argv.indexOf("--settings");
const settingsPath = settingsIndex === -1 ? null : process.argv[settingsIndex + 1];
const settings = settingsPath ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : null;
console.log(JSON.stringify({
  base: process.env.ANTHROPIC_BASE_URL,
  upstream: process.env.PROMPT_GATEWAY_UPSTREAM_URL,
  settings,
  settingsPath,
  args: process.argv.slice(2),
}));
`,
  );
  await fs.chmod(fakeClaudePath, 0o755);

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "claude", "--claude-command", fakeClaudePath, "--", "--print", "hello"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: "https://env.example.com",
        CLAUDE_CONFIG_DIR: configDir,
        PROMPT_GATEWAY_PORT: "0",
      },
    },
  );

  const lines = stdout.trim().split("\n");
  const payloadLine = lines[lines.length - 1];
  assert.ok(payloadLine);
  assert.match(stdout, /Real upstream stays at: https:\/\/api\.kimi\.com\/coding\//);

  const payload = JSON.parse(payloadLine) as {
    base?: string;
    upstream?: string;
    settings?: { env?: Record<string, string> };
    settingsPath?: string;
    args?: string[];
  };

  assert.match(payload.base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(payload.upstream, "https://api.kimi.com/coding/");
  assert.equal(payload.settings?.env?.ANTHROPIC_BASE_URL, payload.base);
  assert.equal(payload.settings?.env?.ANTHROPIC_API_URL, payload.base);
  assert.equal(payload.args?.[0], "--settings");
  assert.equal(payload.settingsPath, payload.args?.[1]);
  assert.equal(path.basename(payload.settingsPath || ""), "settings.json");
  assert.equal(payload.args?.[2], "--print");
});

test("claude wrapper does not require an existing Claude settings file", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const tempDir = await createTempDir("prompt-gateway-cli");
  const configDir = path.join(tempDir, "empty-claude-config");
  const fakeClaudePath = path.join(tempDir, "claude");

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    fakeClaudePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const settingsIndex = process.argv.indexOf("--settings");
const settingsPath = settingsIndex === -1 ? null : process.argv[settingsIndex + 1];
const settings = settingsPath ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : null;
console.log(JSON.stringify({
  base: process.env.ANTHROPIC_BASE_URL,
  upstream: process.env.PROMPT_GATEWAY_UPSTREAM_URL,
  settings,
  settingsPath,
  args: process.argv.slice(2),
}));
`,
  );
  await fs.chmod(fakeClaudePath, 0o755);

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "claude", "--claude-command", fakeClaudePath, "--", "--print", "hello"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: "https://env.example.com",
        CLAUDE_CONFIG_DIR: configDir,
        PROMPT_GATEWAY_PORT: "0",
      },
    },
  );

  const lines = stdout.trim().split("\n");
  const payloadLine = lines[lines.length - 1];
  assert.ok(payloadLine);

  const payload = JSON.parse(payloadLine) as {
    base?: string;
    upstream?: string;
    settings?: { env?: Record<string, string> };
    settingsPath?: string;
    args?: string[];
  };

  assert.match(payload.base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(payload.upstream, "https://env.example.com");
  assert.equal(payload.settings?.env?.ANTHROPIC_BASE_URL, payload.base);
  assert.equal(payload.settings?.env?.ANTHROPIC_API_URL, payload.base);
  assert.equal(payload.args?.[0], "--settings");
  assert.equal(payload.settingsPath, payload.args?.[1]);
  assert.equal(path.basename(payload.settingsPath || ""), "settings.json");
});

test("claude wrapper uses ANTHROPIC_API_URL when Claude settings file is absent", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const tempDir = await createTempDir("prompt-gateway-cli");
  const configDir = path.join(tempDir, "empty-claude-config");
  const fakeClaudePath = path.join(tempDir, "claude");
  const env = { ...process.env };

  delete env.ANTHROPIC_BASE_URL;
  delete env.PROMPT_GATEWAY_UPSTREAM_URL;

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    fakeClaudePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const settingsIndex = process.argv.indexOf("--settings");
const settingsPath = settingsIndex === -1 ? null : process.argv[settingsIndex + 1];
const settings = settingsPath ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : null;
console.log(JSON.stringify({
  base: process.env.ANTHROPIC_BASE_URL,
  apiUrl: process.env.ANTHROPIC_API_URL,
  upstream: process.env.PROMPT_GATEWAY_UPSTREAM_URL,
  settings,
  args: process.argv.slice(2),
}));
`,
  );
  await fs.chmod(fakeClaudePath, 0o755);

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, "claude", "--claude-command", fakeClaudePath, "--", "--print", "hello"],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        ANTHROPIC_API_URL: "https://api-url.example.com/anthropic",
        CLAUDE_CONFIG_DIR: configDir,
        PROMPT_GATEWAY_PORT: "0",
      },
    },
  );

  const lines = stdout.trim().split("\n");
  const payloadLine = lines[lines.length - 1];
  assert.ok(payloadLine);
  assert.match(stdout, /Real upstream stays at: https:\/\/api-url\.example\.com\/anthropic/);

  const payload = JSON.parse(payloadLine) as {
    base?: string;
    apiUrl?: string;
    upstream?: string;
    settings?: { env?: Record<string, string> };
    args?: string[];
  };

  assert.match(payload.base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(payload.apiUrl, undefined);
  assert.equal(payload.upstream, "https://api-url.example.com/anthropic");
  assert.equal(payload.settings?.env?.ANTHROPIC_BASE_URL, payload.base);
  assert.equal(payload.settings?.env?.ANTHROPIC_API_URL, payload.base);
  assert.equal(payload.args?.[0], "--settings");
});

test("claude wrapper falls back when the configured gateway port is already in use", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");
  const configDir = await createTempDir("prompt-gateway-cli-config");
  const blocker = http.createServer((_, response) => {
    response.end("busy");
  });
  const blockerInfo = await listen(blocker);
  const occupiedPort = Number(new URL(blockerInfo.url).port);

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        cliPath,
        "claude",
        "--claude-command",
        process.execPath,
        "--",
        "-e",
        "console.log(JSON.stringify({ base: process.env.ANTHROPIC_BASE_URL }))",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: "https://litellm.example.com/anthropic",
          CLAUDE_CONFIG_DIR: configDir,
          PROMPT_GATEWAY_PORT: String(occupiedPort),
        },
      },
    );

    assert.match(
      stdout,
      new RegExp(
        `Port ${occupiedPort} on 127\\.0\\.0\\.1 is already in use; using http://127\\.0\\.0\\.1:\\d+ instead\\.`,
      ),
    );

    const lines = stdout.trim().split("\n");
    const payloadLine = lines[lines.length - 1];
    assert.ok(payloadLine);

    const payload = JSON.parse(payloadLine) as {
      base?: string;
    };
    const gatewayUrl = new URL(payload.base || "");

    assert.equal(gatewayUrl.hostname, "127.0.0.1");
    assert.notEqual(Number(gatewayUrl.port), occupiedPort);
  } finally {
    await close(blockerInfo.server);
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "./harness.js";

const execFileAsync = promisify(execFile);

test("claude wrapper injects local ANTHROPIC_BASE_URL and preserves upstream", async () => {
  const cliPath = path.resolve(".test-dist/src/cli.js");

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

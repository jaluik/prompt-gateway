# prompt-gateway

[中文文档](./README.md)

See exactly what Claude Code sends to `/v1/messages`.

`prompt-gateway` launches Claude Code through a local Anthropic-compatible gateway, forwards the request to your real upstream, and saves every captured payload locally. You can inspect the final system prompt, messages, tools, context size, model settings, and response metadata.

```bash
npx prompt-gateway claude
```

No proxy setup. No Claude Code patching. Run one command, use Claude Code normally, then open the local capture browser.

## Why Use It

- Debug the real prompt Claude Code sent, not the prompt you think it sent.
- Inspect `system`, `messages`, `tools`, `thinking`, `context_management`, model, max tokens, and stream settings in one place.
- Compare requests inside the same Claude Code session and see what changed.
- Tell apart real user input from tool results that are carried in `role: "user"` messages.
- Keep a local audit trail of captured `/v1/messages` requests for troubleshooting and sharing.

## Quick Start

Requirements: Node.js 16 or newer.

Start Claude Code through the gateway:

```bash
npx prompt-gateway claude
```

Then use Claude Code as usual. The gateway starts on:

```text
http://127.0.0.1:8787/
```

Captured files are saved under:

```text
.claude/prompt-gateway/captures/YYYY-MM-DD/*.json
.claude/prompt-gateway/html/YYYY-MM-DD/*.html
```

Install globally if you prefer:

```bash
npm install -g prompt-gateway
prompt-gateway claude
```

## Capture Browser

The local web UI groups captures by Claude Code session and makes high-signal request details easy to scan.

![Session list showing request counts, max context size, model filters, and session preview](./docs/assets/readme/session-list.png)

Open a session to see the full request timeline, context size, diff badges, model settings, tool counts, and the request body broken into logical layers.

![Session detail showing request timeline, trigger badges, request metadata, and context stack](./docs/assets/readme/request-detail.png)

The detail view separates user input, tool results, assistant thinking, tool calls, injected system reminders, and raw JSON paths. That makes it much easier to answer whether a request came from the user or from a tool result continuing the loop.

![Messages view showing latest input, request trigger, and tool result badges](./docs/assets/readme/messages-and-tools.png)

## What Gets Captured

Each `/v1/messages` request record includes:

- request method, path, capture time, and Claude Code session id
- redacted request headers
- raw request body
- extracted `system`, `messages`, model, max tokens, and stream flag
- tool definitions and tool call/result summaries in the browser UI
- response status, duration, success/error state, and response body when available
- derived prompt previews for fast browsing

Common sensitive headers are redacted by default:

- `authorization`
- `x-api-key`
- `proxy-authorization`
- `cookie`
- `set-cookie`

## How It Works

`prompt-gateway claude` preserves the normal Claude Code workflow:

1. Starts a local HTTP gateway.
2. Launches Claude Code with `ANTHROPIC_BASE_URL` pointing at that gateway.
3. Resolves your real Anthropic-compatible upstream from flags, environment variables, or Claude Code settings.
4. Forwards `/v1/messages` to the real upstream.
5. Saves the captured request and response locally.
6. Serves the capture browser at `http://127.0.0.1:8787/`.

If Claude Code settings already contain `ANTHROPIC_BASE_URL` or `ANTHROPIC_API_URL`, the wrapper uses that as the real upstream and only overrides the launched Claude Code process.

## Common Commands

Pass arguments through to Claude Code:

```bash
npx prompt-gateway claude -- --print "hello"
```

Use a custom Claude executable:

```bash
npx prompt-gateway claude --claude-command /path/to/claude
```

Point at a custom Anthropic-compatible upstream:

```bash
npx prompt-gateway claude --upstream-url https://api.anthropic.com
```

Write captures somewhere else:

```bash
npx prompt-gateway claude --output ./.claude/prompt-gateway
```

Only write JSON captures:

```bash
npx prompt-gateway claude --no-html
```

Show all options:

```bash
npx prompt-gateway --help
```

## Configuration

CLI options:

| Option | Default | Description |
| --- | --- | --- |
| `--host <value>` | `127.0.0.1` | Local gateway host. |
| `--port <value>` | `8787` | Local gateway port. |
| `--output <path>` | `.claude/prompt-gateway` | Capture output directory. |
| `--upstream-url <url>` | `https://api.anthropic.com` | Real Anthropic-compatible base URL. |
| `--api-key <value>` | environment | Upstream API key. |
| `--api-version <value>` | environment | `anthropic-version` request header. |
| `--html-title <value>` | `Prompt Gateway` | Browser/page title. |
| `--timezone <value>` | local/default | Display timezone label. |
| `--claude-command <value>` | `claude` | Claude Code executable. |
| `--no-html` | off | Do not write per-capture HTML files. |
| `--no-json` | off | Do not write JSON capture files. |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `PROMPT_GATEWAY_HOST` | Local gateway host. |
| `PROMPT_GATEWAY_PORT` | Local gateway port. |
| `PROMPT_GATEWAY_OUTPUT_ROOT` | Capture output directory. |
| `PROMPT_GATEWAY_WRITE_JSON` | Enable/disable JSON capture writing. |
| `PROMPT_GATEWAY_WRITE_HTML` | Enable/disable HTML capture writing. |
| `PROMPT_GATEWAY_HTML_TITLE` | Browser/page title. |
| `PROMPT_GATEWAY_TIMEZONE` | Display timezone label. |
| `PROMPT_GATEWAY_UPSTREAM_URL` | Real upstream base URL. |
| `PROMPT_GATEWAY_UPSTREAM_API_KEY` | Real upstream API key. |
| `PROMPT_GATEWAY_UPSTREAM_API_VERSION` | Upstream Anthropic API version. |
| `PROMPT_GATEWAY_CLAUDE_COMMAND` | Claude Code executable. |

Compatible upstream variables are also respected:

- Claude Code settings `env.ANTHROPIC_BASE_URL`
- Claude Code settings `env.ANTHROPIC_API_URL`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_VERSION`

Claude Code settings are read from `~/.claude/settings.json` by default. If `CLAUDE_CONFIG_DIR` is set, `prompt-gateway` reads `settings.json` from that directory instead.

## Current Limits

`prompt-gateway claude` currently supports the Anthropic-compatible `ANTHROPIC_BASE_URL` flow.

These Claude Code provider modes are not wrapped yet:

- `CLAUDE_CODE_USE_BEDROCK=1`
- `CLAUDE_CODE_USE_VERTEX=1`
- `CLAUDE_CODE_USE_FOUNDRY=1`

Maintainer notes for local development, tests, and releases live in [DEVELOPING.md](./DEVELOPING.md).

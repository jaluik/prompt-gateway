# prompt-gateway

`prompt-gateway` 用来包一层启动 Claude Code，拦截 Claude Code 发往 `/v1/messages` 的最终请求，并把这些请求保存到本地，方便你回看、排查和分享上下文。

它面向的核心场景很直接：

- 想知道 Claude Code 最终到底发了什么 prompt
- 想检查 `system`、`messages`、`model`、`max_tokens` 是否符合预期
- 想保留一份本地请求记录，方便排查问题

## 它是怎么工作的

你不用手动改 Claude Code 的代理地址。

推荐方式是直接用 `prompt-gateway` 来启动 Claude Code：

```bash
npx prompt-gateway claude
```

启动后它会做几件事：

- 启动一个本地 HTTP gateway
- 把当前 Claude Code 进程的 `ANTHROPIC_BASE_URL` 临时改到本地 gateway
- 把真实上游地址保留下来，继续转发到真正的 Anthropic-compatible endpoint
- 如果 Claude Code settings 里已有 `ANTHROPIC_BASE_URL`，例如由 `cc switch` 写入，会把它当作真实上游，并只覆盖本次 Claude Code 进程
- 把每次请求记录成 JSON，并可选生成单条 HTML
- 提供一个本地网页查看历史记录和详情

## 安装和要求

作为 npm 包运行时支持：

- Node.js `16` 或更高版本

最简单的使用方式：

```bash
npx prompt-gateway claude
```

也可以全局安装：

```bash
npm install -g prompt-gateway
prompt-gateway claude
```

## 快速开始

1. 直接启动 Claude Code：

```bash
npx prompt-gateway claude
```

2. 正常使用 Claude Code。

3. 在浏览器里打开本地查看页：

```text
http://127.0.0.1:8787/
```

默认情况下，请求会写到：

```text
.claude/prompt-gateway/captures/YYYY-MM-DD/*.json
.claude/prompt-gateway/html/YYYY-MM-DD/*.html
```

## 常用用法

透传 Claude Code 参数：

```bash
npx prompt-gateway claude -- --print "hello"
```

如果你的 Claude 可执行文件不叫 `claude`：

```bash
npx prompt-gateway claude --claude-command /path/to/claude
```

指定真实上游地址：

```bash
npx prompt-gateway claude --upstream-url https://api.anthropic.com
```

指定输出目录：

```bash
npx prompt-gateway claude --output ./.claude/prompt-gateway
```

只写 JSON，不生成单条 HTML：

```bash
npx prompt-gateway claude --no-html
```

查看帮助：

```bash
npx prompt-gateway --help
```

## 你能看到什么

每条捕获记录都会保存这些信息：

- 请求方法和路径
- Claude Code session id
- 脱敏后的请求头
- 原始请求体
- 提取后的 `system`、`messages`、`model`、`max_tokens`、`stream`
- 响应状态、耗时、是否成功、错误信息
- 一段可快速浏览的 prompt 预览文本

其中常见敏感请求头会默认脱敏，包括：

- `authorization`
- `x-api-key`
- `proxy-authorization`
- `cookie`
- `set-cookie`

## 本地网页

启动后可以在本地网页里查看：

- 历史请求列表
- 单条请求详情
- prompt 预览
- 已保存的 JSON 捕获记录

默认地址：

```text
http://127.0.0.1:8787/
```

## 配置项

CLI 参数：

- `--host <value>`：监听地址，默认 `127.0.0.1`
- `--port <value>`：监听端口，默认 `8787`
- `--output <path>`：输出目录，默认 `.claude/prompt-gateway`
- `--upstream-url <url>`：真实上游 base URL
- `--api-key <value>`：上游 API key
- `--api-version <value>`：`anthropic-version` 请求头
- `--html-title <value>`：本地网页标题
- `--timezone <value>`：页面展示用时区标签
- `--claude-command <value>`：Claude 可执行文件路径，默认 `claude`
- `--no-html`：不写 HTML 文件
- `--no-json`：不写 JSON 文件

环境变量：

- `PROMPT_GATEWAY_HOST`
- `PROMPT_GATEWAY_PORT`
- `PROMPT_GATEWAY_OUTPUT_ROOT`
- `PROMPT_GATEWAY_WRITE_JSON`
- `PROMPT_GATEWAY_WRITE_HTML`
- `PROMPT_GATEWAY_HTML_TITLE`
- `PROMPT_GATEWAY_TIMEZONE`
- `PROMPT_GATEWAY_UPSTREAM_URL`
- `PROMPT_GATEWAY_UPSTREAM_API_KEY`
- `PROMPT_GATEWAY_UPSTREAM_API_VERSION`
- `PROMPT_GATEWAY_CLAUDE_COMMAND`

如果没有显式指定上游，程序也会读取这些兼容变量：

- Claude Code settings 里的 `env.ANTHROPIC_BASE_URL`
- Claude Code settings 里的 `env.ANTHROPIC_API_URL`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_VERSION`

Claude Code settings 默认读取 `~/.claude/settings.json`，如果设置了 `CLAUDE_CONFIG_DIR`，则读取对应目录下的 `settings.json`。

默认真实上游是：

```text
https://api.anthropic.com
```

默认转发目标是：

```text
https://api.anthropic.com/v1/messages
```

## 当前限制

`prompt-gateway claude` 目前只覆盖 Anthropic-compatible 的 `ANTHROPIC_BASE_URL` 流程。

下面这些模式当前还没有做透传包装：

- `CLAUDE_CODE_USE_BEDROCK=1`
- `CLAUDE_CODE_USE_VERTEX=1`
- `CLAUDE_CODE_USE_FOUNDRY=1`

维护者相关的开发、测试和发布说明见 [DEVELOPING.md](./DEVELOPING.md)。

# Claude Code Prompt Gateway

`prompt-gateway` 是一个本地代理，用来拦截 Claude Code 发往 `/v1/messages` 的最终请求，并把请求记录成可回看、可检索的本地数据。

它适合在这些场景里使用：

- 想确认 Claude Code 最终到底发了什么 prompt
- 想排查 system prompt、messages、参数拼装是否符合预期
- 想保留请求记录，方便复盘或分享问题上下文

## 你能得到什么

- 透明代理 Claude Code 的 `/v1/messages` 请求
- 记录 request body、session、响应状态和耗时
- 默认脱敏常见敏感请求头
- 内置本地网页，可直接查看历史记录和单条详情
- 同时兼容流式和非流式上游响应

## 运行要求

- 作为 npm 包使用、运行 CLI、使用代理功能：Node.js `16` 或更高版本
- 如果你是从源码开发、执行 `pnpm install`、构建前端或参与维护：建议使用 Node.js `18` 或更高版本

也就是说：

- `prompt-gateway` 的发布产物和实际运行路径支持 Node 16
- 当前仓库的开发工具链不把 Node 16 作为源码开发基线

最简单的启动方式：

```bash
npx prompt-gateway
```

也可以全局安装后使用：

```bash
npm install -g prompt-gateway
prompt-gateway
```

默认监听地址：

```text
http://127.0.0.1:8787
```

默认输出目录：

```text
.claude/prompt-gateway
```

启动后可以直接在浏览器打开：

```text
http://127.0.0.1:8787/
```

## 推荐用法

### 方式一：直接当本地代理使用

1. 启动 gateway：

```bash
npx prompt-gateway
```

2. 把 Claude Code 的 base URL 指到：

```text
http://127.0.0.1:8787
```

3. 正常使用 Claude Code。
4. 在浏览器打开本地页面查看记录：

```text
http://127.0.0.1:8787/
```

请求会默认写到：

- `.claude/prompt-gateway/captures/YYYY-MM-DD/*.json`
- `.claude/prompt-gateway/html/YYYY-MM-DD/*.html`

### 方式二：不改配置，直接包装启动 Claude Code

如果你不想手动改 Claude Code 配置，可以直接运行：

```bash
npx prompt-gateway claude
```

它会自动：

- 启动本地 prompt gateway
- 临时把 `ANTHROPIC_BASE_URL` 指到本地 gateway
- 再启动 `claude`

如果你已经设置了自定义 `ANTHROPIC_BASE_URL`，包装模式会把它保留为真实上游，再由本地 gateway 转发。

给 Claude CLI 透传参数时，使用 `--`：

```bash
npx prompt-gateway claude -- --print "hello"
```

如果你的 Claude 可执行文件不叫 `claude`，可以这样指定：

```bash
npx prompt-gateway claude --claude-command /path/to/claude
```

## 常用命令

指定上游和输出目录：

```bash
npx prompt-gateway --upstream-url https://api.anthropic.com --output ./.claude/prompt-gateway
```

只保留 JSON，不生成 HTML 文件：

```bash
npx prompt-gateway --no-html
```

查看帮助：

```bash
npx prompt-gateway --help
```

## 环境变量

- `PROMPT_GATEWAY_HOST`: 监听主机，默认 `127.0.0.1`
- `PROMPT_GATEWAY_PORT`: 监听端口，默认 `8787`
- `PROMPT_GATEWAY_OUTPUT_ROOT`: 输出目录，默认 `.claude/prompt-gateway`
- `PROMPT_GATEWAY_WRITE_JSON`: 是否写 JSON，默认 `true`
- `PROMPT_GATEWAY_WRITE_HTML`: 是否写 HTML，默认 `true`
- `PROMPT_GATEWAY_HTML_TITLE`: 页面标题
- `PROMPT_GATEWAY_UPSTREAM_URL`: 上游 base URL，例如 `https://api.anthropic.com`
- `PROMPT_GATEWAY_UPSTREAM_API_KEY`: 上游 API Key
- `PROMPT_GATEWAY_UPSTREAM_API_VERSION`: 上游 `anthropic-version`

如果没有显式设置上游，程序还会尝试读取这些兼容变量：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_VERSION`

最终默认会转发到：

```text
https://api.anthropic.com/v1/messages
```

## 当前限制

- `prompt-gateway claude` 目前只覆盖 Anthropic-compatible 的 `ANTHROPIC_BASE_URL` 流程
- `CLAUDE_CODE_USE_BEDROCK=1`
- `CLAUDE_CODE_USE_VERTEX=1`
- `CLAUDE_CODE_USE_FOUNDRY=1`

以上几种透传包装当前还没有实现。

## 开发文档

如果你是维护者，或者需要查看本地开发、测试、发版、提交规范，请看 [DEVELOPING.md](./DEVELOPING.md)。

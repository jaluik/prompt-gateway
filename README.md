# Claude Code Prompt Gateway

本项目实现了一个本地 TypeScript LLM gateway，用来拦截 Claude Code 发往 `/v1/messages` 的最终请求体，并把请求记录为 JSON 与 HTML。

当前工程已经按作用域包 `@jaluik/prompt-tracker` 配置，适合发布为 npm 包后直接给外部使用。

## 功能

- 透明代理 `POST /v1/messages`
- 默认脱敏敏感请求头
- 记录完整 request body、session、响应状态与耗时
- 生成单次请求详情 HTML，展示 `system`、`messages`、headers 摘要与原始 JSON
- 兼容流式和非流式上游响应

## 作为 npm 包使用

```bash
npx @jaluik/prompt-tracker
```

或者全局安装后使用：

```bash
npm install -g @jaluik/prompt-tracker
prompt-gateway
```

如果你是从源码开发：

```bash
pnpm install
pnpm build
node dist/cli.js
```

默认监听地址：

```text
http://127.0.0.1:8787
```

默认输出目录：

```text
.claude/prompt-tracker
```

最简单的启动方式：

```bash
npx @jaluik/prompt-tracker
```

如果你想显式指定上游和输出目录：

```bash
npx @jaluik/prompt-tracker --upstream-url https://api.anthropic.com --output ./.claude/prompt-tracker
```

## 环境变量

- `PROMPT_GATEWAY_HOST`: 监听主机，默认 `127.0.0.1`
- `PROMPT_GATEWAY_PORT`: 监听端口，默认 `8787`
- `PROMPT_GATEWAY_OUTPUT_ROOT`: 输出目录，默认 `.claude/prompt-tracker`
- `PROMPT_GATEWAY_WRITE_JSON`: 是否写 JSON，默认 `true`
- `PROMPT_GATEWAY_WRITE_HTML`: 是否写 HTML，默认 `true`
- `PROMPT_GATEWAY_HTML_TITLE`: HTML 标题
- `PROMPT_GATEWAY_UPSTREAM_URL`: 上游 base URL，例如 `https://api.anthropic.com`
- `PROMPT_GATEWAY_UPSTREAM_API_KEY`: 上游 API Key
- `PROMPT_GATEWAY_UPSTREAM_API_VERSION`: 上游 `anthropic-version`

如果没有显式设置上游，程序会尝试读取：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_VERSION`

最终兜底为：

```text
https://api.anthropic.com/v1/messages
```

## 接入 Claude Code

把 Claude Code 的 API 基址指向本地 gateway，然后由 gateway 再转发到真实上游。你需要根据自己当前的 Claude Code 配置方式，把上游 URL 改到本地地址，例如：

```text
http://127.0.0.1:8787
```

这样 Claude Code 发起的 `/v1/messages` 请求会先进入本地代理，生成以下产物：

- `.claude/prompt-tracker/captures/YYYY-MM-DD/*.json`
- `.claude/prompt-tracker/html/YYYY-MM-DD/*.html`

## 现在怎么用

1. 启动代理：`npx @jaluik/prompt-tracker`
2. 把 Claude Code 的 base URL 指到 `http://127.0.0.1:8787`
3. 正常使用 Claude Code
4. 打开生成结果：
   `open .claude/prompt-tracker/html`

如果你只想看 JSON，不生成 HTML：

```bash
npx @jaluik/prompt-tracker --no-html
```

如果你想看帮助：

```bash
npx @jaluik/prompt-tracker --help
```

## 开发命令

```bash
pnpm format
pnpm check
pnpm test
pnpm build
pnpm pack:dry
```

## 提交约束

- `pre-commit`: 通过 `lint-staged` 对暂存文件执行 `biome check --write`
- `commit-msg`: 通过 `commitlint` 校验 Conventional Commits

首次安装依赖后会通过 `husky` 自动启用 Git hooks。

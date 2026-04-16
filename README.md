# Claude Code Prompt Gateway

本项目实现了一个本地 TypeScript LLM gateway，用来拦截 Claude Code 发往 `/v1/messages` 的最终请求体，并把请求记录为 JSON 与 HTML。

当前工程现在按无 scope 包 `prompt-gateway` 配置，可以直接发布为 npm 公共包并给外部使用。

## Node 版本

项目现在支持 `Node.js 16` 及以上版本。

如果你从源码安装，建议同时使用支持 `Node 16` 的 `pnpm 8` 或更高兼容版本。

## 功能

- 透明代理 `POST /v1/messages`
- 默认脱敏敏感请求头
- 记录完整 request body、session、响应状态与耗时
- 生成单次请求详情 HTML，展示 `system`、`messages`、headers 摘要与原始 JSON
- 兼容流式和非流式上游响应

## 作为 npm 包使用

```bash
npx prompt-gateway
```

或者全局安装后使用：

```bash
npm install -g prompt-gateway
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
.claude/prompt-gateway
```

最简单的启动方式：

```bash
npx prompt-gateway
```

如果你想显式指定上游和输出目录：

```bash
npx prompt-gateway --upstream-url https://api.anthropic.com --output ./.claude/prompt-gateway
```

## 环境变量

- `PROMPT_GATEWAY_HOST`: 监听主机，默认 `127.0.0.1`
- `PROMPT_GATEWAY_PORT`: 监听端口，默认 `8787`
- `PROMPT_GATEWAY_OUTPUT_ROOT`: 输出目录，默认 `.claude/prompt-gateway`
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

- `.claude/prompt-gateway/captures/YYYY-MM-DD/*.json`
- `.claude/prompt-gateway/html/YYYY-MM-DD/*.html`

## 无需改配置文件的启动方式

如果你不想手改 Claude Code 配置文件，可以使用包装命令：

```bash
prompt-gateway claude
```

它会自动：

- 启动本地 prompt gateway
- 临时把 `ANTHROPIC_BASE_URL` 指到本地 gateway
- 再启动 `claude`

如果你原本已经配置了自定义 `ANTHROPIC_BASE_URL`，包装命令会把它保留下来并作为 gateway 的上游继续转发，所以 Anthropic-compatible 的自定义 base URL 仍然能被拦截。

给 Claude CLI 传参数时，使用 `--` 分隔：

```bash
prompt-gateway claude -- --print "hello"
```

如果你的 Claude 可执行文件不叫 `claude`，可以这样指定：

```bash
prompt-gateway claude --claude-command /path/to/claude
```

当前限制：

- 该包装命令目前只支持 Anthropic-compatible 的 `ANTHROPIC_BASE_URL` 流程
- `CLAUDE_CODE_USE_BEDROCK=1`、`CLAUDE_CODE_USE_VERTEX=1`、`CLAUDE_CODE_USE_FOUNDRY=1` 的透传包装还没有实现

## 现在怎么用

1. 启动代理：`npx prompt-gateway`
2. 把 Claude Code 的 base URL 指到 `http://127.0.0.1:8787`
3. 正常使用 Claude Code
4. 打开生成结果：
   `open .claude/prompt-gateway/html`

如果你只想看 JSON，不生成 HTML：

```bash
npx prompt-gateway --no-html
```

如果你想看帮助：

```bash
npx prompt-gateway --help
```

如果你希望不改 Claude Code 配置，直接用包装模式：

```bash
npx prompt-gateway claude
```

## 开发命令

```bash
pnpm format
pnpm check
pnpm test
pnpm build
pnpm pack:dry
```

## 发版流程

发版由 GitHub Actions 自动完成。当前仓库使用 npm Trusted Publishing，不再依赖 `NPM_TOKEN`。

日常提交到 `master` 时会自动执行：

- `pnpm check`
- `pnpm test`

当你推送形如 `v*` 的 tag 时会自动执行完整发布流程：

- `pnpm check`
- `pnpm test`
- `pnpm build`
- `pnpm pack:dry`
- 校验 tag 版本和 `package.json` 中的 `version` 一致
- 通过 Trusted Publishing 发布到 npm

推荐发布步骤：

1. 更新 `package.json` 中的 `version`
2. 提交代码并推送到 `master`
3. 创建并推送对应 tag，例如：

```bash
git tag v0.0.1
git push origin v0.0.1
```

注意：

- tag 必须和 `package.json` 的版本一致，例如 `package.json` 是 `0.0.1`，则 tag 必须是 `v0.0.1`
- 如果 GitHub Actions 的 release job 失败，npm 不会发布成功
- 建议每次发版前先确认 `master` 上最近一次 CI 已通过
- 当前发布依赖 npm 包设置里的 Trusted Publisher 配置，且 workflow 文件名必须是 `ci-cd.yml`

## 提交约束

- `pre-commit`: 通过 `lint-staged` 对暂存文件执行 `biome check --write`
- `commit-msg`: 通过 `commitlint` 校验 Conventional Commits

首次安装依赖后会通过 `husky` 自动启用 Git hooks。

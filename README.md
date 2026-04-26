# prompt-gateway

[English](./README.en.md)

看清 Claude Code 最终发给 `/v1/messages` 的完整请求。

`prompt-gateway` 会用一个本地 Anthropic-compatible gateway 启动 Claude Code，把请求继续转发到你的真实上游，同时把每次捕获到的 payload 保存在本地。你可以回看最终 system prompt、messages、tools、上下文体积、模型参数和响应信息。

```bash
npx prompt-gateway claude
```

不需要手动配置代理，不需要修改 Claude Code。一个命令启动，照常使用 Claude Code，然后打开本地捕获浏览器查看真实请求。

## 为什么需要它

- 排查 Claude Code 实际发送的 prompt，而不是凭感觉猜。
- 在一个页面里查看 `system`、`messages`、`tools`、`thinking`、`context_management`、model、max tokens 和 stream 设置。
- 对比同一个 Claude Code session 里的多次请求，看清上下文怎么增长、哪些层发生变化。
- 区分真正的用户输入和 Anthropic 消息格式中放在 `role: "user"` 里的工具结果。
- 为问题排查、复盘和分享保留本地 `/v1/messages` 请求记录。

## 快速开始

运行要求：Node.js 16 或更高版本。

通过 gateway 启动 Claude Code：

```bash
npx prompt-gateway claude
```

之后正常使用 Claude Code。捕获浏览器默认地址是：

```text
http://127.0.0.1:8787/
```

捕获文件默认保存到：

```text
.claude/prompt-gateway/captures/YYYY-MM-DD/*.json
.claude/prompt-gateway/html/YYYY-MM-DD/*.html
```

也可以全局安装：

```bash
npm install -g prompt-gateway
prompt-gateway claude
```

## 本地捕获浏览器

Web UI 会按 Claude Code session 聚合捕获记录，让你优先看到请求数量、上下文规模、模型、工具数量和最新输入。

![Session 列表展示请求数量、最大上下文、模型筛选和 session 预览](./docs/assets/readme/session-list.png)

进入某个 session 后，可以查看完整请求时间轴、上下文大小、diff 标识、模型设置、工具数量，以及按逻辑层拆开的 request body。

![Session 详情展示请求时间轴、触发来源标识、请求元信息和上下文组装图](./docs/assets/readme/request-detail.png)

详情页会把用户输入、工具结果、assistant thinking、tool use、system reminder 和 Raw JSON 路径拆开显示。这样你能快速判断：这次请求是用户新输入触发的，还是工具结果继续推进的。

![Messages 视图展示 latest input、request trigger 和 tool_result 标识](./docs/assets/readme/messages-and-tools.png)

## 会捕获什么

每条 `/v1/messages` 捕获记录包含：

- 请求方法、路径、捕获时间和 Claude Code session id
- 脱敏后的请求头
- 原始 request body
- 提取后的 `system`、`messages`、model、max tokens 和 stream flag
- Web UI 中的 tools 定义、tool call 和 tool result 摘要
- 响应状态、耗时、成功/失败状态，以及可用时的响应体
- 便于快速浏览的 prompt preview

常见敏感请求头会默认脱敏：

- `authorization`
- `x-api-key`
- `proxy-authorization`
- `cookie`
- `set-cookie`

## 工作方式

`prompt-gateway claude` 保留 Claude Code 的正常使用方式：

1. 启动一个本地 HTTP gateway。
2. 启动 Claude Code，并把本次 Claude Code 进程的 `ANTHROPIC_BASE_URL` 指向本地 gateway。
3. 从 CLI 参数、环境变量或 Claude Code settings 中解析真实 Anthropic-compatible upstream。
4. 把 `/v1/messages` 请求转发到真实上游。
5. 在本地保存捕获到的请求和响应信息。
6. 在 `http://127.0.0.1:8787/` 提供捕获浏览器。

如果 Claude Code settings 里已经有 `ANTHROPIC_BASE_URL` 或 `ANTHROPIC_API_URL`，wrapper 会把它当作真实上游，只覆盖当前启动的 Claude Code 进程。

## 常用命令

透传参数给 Claude Code：

```bash
npx prompt-gateway claude -- --print "hello"
```

使用自定义 Claude 可执行文件：

```bash
npx prompt-gateway claude --claude-command /path/to/claude
```

指定真实 Anthropic-compatible 上游：

```bash
npx prompt-gateway claude --upstream-url https://api.anthropic.com
```

指定捕获输出目录：

```bash
npx prompt-gateway claude --output ./.claude/prompt-gateway
```

只写 JSON，不生成单条 HTML：

```bash
npx prompt-gateway claude --no-html
```

查看全部选项：

```bash
npx prompt-gateway --help
```

## 配置项

CLI 选项：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `--host <value>` | `127.0.0.1` | 本地 gateway 监听地址。 |
| `--port <value>` | `8787` | 本地 gateway 监听端口。 |
| `--output <path>` | `.claude/prompt-gateway` | 捕获输出目录。 |
| `--upstream-url <url>` | `https://api.anthropic.com` | 真实 Anthropic-compatible base URL。 |
| `--api-key <value>` | environment | 上游 API key。 |
| `--api-version <value>` | environment | `anthropic-version` 请求头。 |
| `--html-title <value>` | `Prompt Gateway` | 本地网页标题。 |
| `--timezone <value>` | local/default | 页面展示用时区标签。 |
| `--claude-command <value>` | `claude` | Claude Code 可执行文件。 |
| `--no-html` | off | 不写单条 HTML 捕获文件。 |
| `--no-json` | off | 不写 JSON 捕获文件。 |

环境变量：

| 变量 | 作用 |
| --- | --- |
| `PROMPT_GATEWAY_HOST` | 本地 gateway 监听地址。 |
| `PROMPT_GATEWAY_PORT` | 本地 gateway 监听端口。 |
| `PROMPT_GATEWAY_OUTPUT_ROOT` | 捕获输出目录。 |
| `PROMPT_GATEWAY_WRITE_JSON` | 开启/关闭 JSON 捕获写入。 |
| `PROMPT_GATEWAY_WRITE_HTML` | 开启/关闭 HTML 捕获写入。 |
| `PROMPT_GATEWAY_HTML_TITLE` | 本地网页标题。 |
| `PROMPT_GATEWAY_TIMEZONE` | 页面展示用时区标签。 |
| `PROMPT_GATEWAY_UPSTREAM_URL` | 真实上游 base URL。 |
| `PROMPT_GATEWAY_UPSTREAM_API_KEY` | 真实上游 API key。 |
| `PROMPT_GATEWAY_UPSTREAM_API_VERSION` | 上游 Anthropic API version。 |
| `PROMPT_GATEWAY_CLAUDE_COMMAND` | Claude Code 可执行文件。 |

也会读取这些 Anthropic-compatible 变量：

- Claude Code settings `env.ANTHROPIC_BASE_URL`
- Claude Code settings `env.ANTHROPIC_API_URL`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_VERSION`

Claude Code settings 默认读取 `~/.claude/settings.json`。如果设置了 `CLAUDE_CONFIG_DIR`，则读取该目录下的 `settings.json`。

## 当前限制

`prompt-gateway claude` 目前支持 Anthropic-compatible 的 `ANTHROPIC_BASE_URL` 流程。

以下 Claude Code provider 模式暂未包装：

- `CLAUDE_CODE_USE_BEDROCK=1`
- `CLAUDE_CODE_USE_VERTEX=1`
- `CLAUDE_CODE_USE_FOUNDRY=1`

维护者相关的本地开发、测试和发布说明见 [DEVELOPING.md](./DEVELOPING.md)。

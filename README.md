# prompt-gateway

[English](./README.en.md)

本地代理，抓取 Claude Code 发往 `/v1/messages` 的完整请求和响应。自带 Web UI，可以按 session 浏览、对比上下文变化。

```bash
npx prompt-gateway claude
```

启动后 Claude Code 照常使用，所有请求会经过本地代理转发到上游，同时保存到本地。浏览器打开 `http://127.0.0.1:8787/` 查看。

## 截图

Session 列表：

![Session 列表](./docs/assets/readme/session-list.png)

请求详情，system prompt、messages、tools 按层拆开显示：

![请求详情](./docs/assets/readme/request-detail.png)

消息视图会标出哪些是用户输入、哪些是 tool_result（Claude Code 把这两种都放在 `role: "user"` 里，看原始 JSON 分不出来）：

![消息视图](./docs/assets/readme/messages-and-tools.png)

## 安装

需要 Node.js 16+。

```bash
npx prompt-gateway claude
```

也可以全局安装：

```bash
npm install -g prompt-gateway
prompt-gateway claude
```

端口默认 8787，被占用会自动换。捕获文件在 `.claude/prompt-gateway/captures/` 下按日期存放。

## 原理

1. 启动本地 HTTP 代理
2. 设置 `ANTHROPIC_BASE_URL` 指向本地代理，然后启动 Claude Code
3. 代理把请求转发到真实上游（从环境变量、CLI 参数或 Claude Code settings 中读取）
4. 保存请求和响应

如果 Claude Code settings 里已经有 `ANTHROPIC_BASE_URL`，会自动作为上游地址，不影响原有配置。

敏感 header（`authorization`、`x-api-key`、`cookie`）保存时自动替换为 `[REDACTED]`。

## 参数

```bash
# 透传参数给 Claude Code
npx prompt-gateway claude -- --print "hello"

# 指定上游
npx prompt-gateway claude --upstream-url https://your-proxy.example.com

# 指定 claude 路径
npx prompt-gateway claude --claude-command /path/to/claude

# 只存 JSON
npx prompt-gateway claude --no-html
```

所有选项见 `npx prompt-gateway --help`。

## 限制

目前只支持 Anthropic 原生 API（`ANTHROPIC_BASE_URL`）。Bedrock、Vertex、Foundry 暂不支持。

开发相关见 [DEVELOPING.md](./DEVELOPING.md)。

import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SessionListItem = {
  sessionId: string | null;
  latestCapturedAt: string;
  latestTimestampMs: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  streamCount: number;
  durationMs: number;
  models: string[];
  promptTextPreview: string;
};

type CaptureRecord = {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  method: string;
  path: string;
  sessionId: string | null;
  requestHeaders: {
    redacted: Record<string, string>;
  };
  requestBody: {
    raw: unknown;
  };
  derived: {
    system: unknown;
    messages: unknown;
    model: string | null;
    maxTokens: number | null;
    stream: boolean;
    promptTextPreview: string;
  };
  response: {
    status: number;
    durationMs: number;
    ok: boolean;
    error?: string;
    body?: {
      raw: unknown;
    };
  };
};

type Route =
  | {
      name: "home";
    }
  | {
      name: "detail";
      sessionId: string | null;
    };

type MessageBlock = {
  id: string;
  label?: string;
  text: string;
  type: string;
};

type MessageItem = {
  id: string;
  role: string;
  blocks: MessageBlock[];
};

type TimelineEntry = {
  id: string;
  role: string;
  title: string;
  description: string;
  blocks: MessageBlock[];
  meta: string[];
  tone: "system" | "user" | "assistant" | "response" | "unknown";
};

type Language = "en" | "zh";
type Theme = "light" | "dark";

const COLLAPSE_THRESHOLD = 600;
const LANGUAGE_STORAGE_KEY = "prompt-gateway-language";
const THEME_STORAGE_KEY = "prompt-gateway-theme";

const COPY = {
  en: {
    appTitle: "Prompt Gateway",
    appSubtitle: "Local viewer for Claude Code request sessions",
    detailSubtitle: "What Claude Code sent to the model",
    backToCaptures: "Back to captures",
    languageEn: "EN",
    languageZh: "中文",
    themeLight: "Light",
    themeDark: "Dark",
    backToTop: "Back to top",
    clearSearch: "Clear",
    heroEyebrow: "Capture Dashboard",
    heroTitle: "Prompt capture dashboard",
    heroText:
      "Scan recent Claude Code sessions, spot failures quickly, and open the full conversation context without leaving the browser.",
    detailEyebrow: "Session Detail",
    detailTitle: "Inspect one Claude Code request session",
    detailText:
      "The main column follows every captured request in this session. The sidebar keeps session facts and raw payloads nearby.",
    captures: "Requests",
    sessions: "Sessions",
    successful: "Successful",
    streaming: "Streaming",
    recentCaptures: "Claude Code Request Sessions",
    recentCapturesDesc:
      "Each row is one Claude Code session. Open it to inspect every /v1/messages request and its full prompt payload.",
    shown: "shown",
    search: "Search",
    searchPlaceholder: "model, session, user input, success...",
    loadingHistory: "Loading capture history...",
    loadingDetails: "Loading prompt details...",
    noCaptures:
      "No prompts captured yet. Start Claude Code through the gateway and this list will fill in automatically.",
    noSearchResults: "No captures matched your search.",
    tableStatus: "Status",
    tableSession: "Session",
    tableRequests: "Requests",
    tableModel: "Model",
    tableCaptured: "Latest capture",
    tableDuration: "Duration",
    tablePreview: "Latest user input preview",
    success: "Success",
    error: "Error",
    unknownModel: "Unknown model",
    noPreview: "No latest user input available.",
    requestFacts: "Session summary",
    requestFactsDesc: "A short summary of this Claude Code session.",
    systemPrompt: "System Prompt",
    systemPromptDesc: "System instructions included in this captured request.",
    userPrompt: "User input sent in this request",
    userPromptDesc:
      "The last user-role message in this request. The full prompt payload also includes system instructions and history.",
    modelResponse: "Model Response",
    modelResponseDesc:
      "Assistant-role history included in the request, plus the current upstream response state.",
    promptPreview: "Latest user input",
    promptPreviewDesc: "Shows the latest user text sent upstream in this request.",
    readablePrompt: "Readable Prompt",
    readablePromptDesc: "Normalized for reading while preserving the original request semantics.",
    promptTimeline: "Prompt Timeline",
    promptTimelineDesc:
      "Reads the captured request in the same order the context was sent upstream.",
    requestContext: "Request context",
    requestMessage: "Message",
    requestShort: "Request",
    sessionTimeline: "Captured requests",
    sessionTimelineDesc: "Each card is one request Claude Code sent through prompt-gateway.",
    collapseAll: "Collapse all",
    expandAll: "Expand all",
    collapseEntry: "Collapse",
    expandEntry: "Expand",
    system: "System",
    messages: "Messages",
    noReadableBlocks: "No readable blocks found in this message.",
    noReadablePrompt: "No readable prompt content was found in this capture.",
    noSystemPrompt: "No system prompt content was found in this capture.",
    noUserPrompt: "No user prompt content was found in this capture.",
    noModelResponse:
      "No assistant-role history or captured response text was found in this capture.",
    currentResponse: "Current response",
    currentResponseDesc:
      "Captured from the upstream response for this request, alongside status and duration.",
    responseBody: "Response body",
    headers: "Headers",
    rawRequest: "Raw Request",
    systemJson: "System JSON",
    messagesJson: "Messages JSON",
    showFullJson: "Show full JSON",
    showFullBlock: "Show full block",
    showFullPreview: "Show full preview",
    close: "Close",
    requestCaptured: "Captured",
    requestCount: "Requests",
    sessionStarted: "Started",
    sessionLatest: "Latest",
    requestModel: "Model",
    requestSession: "Session",
    requestRoute: "Route",
    requestResponse: "Response",
    requestDuration: "Duration",
    requestStreaming: "Streaming",
    requestMaxTokens: "Max tokens",
    quickOverview: "Overview",
    quickReadable: "Readable prompt",
    quickRaw: "Raw payloads",
    responseSummary: "Response summary",
    responseSummaryDesc:
      "Start here to understand what happened before diving into the prompt body.",
    rawPayloads: "Raw payloads",
    rawPayloadsDesc: "Original structured data kept nearby for exact verification.",
    inspectRequest: "Inspect request",
    promptMessages: "Prompt messages",
    sessionShort: "Session",
    requestFlowTitle: "Request path",
    requestFlowDesc: "How Claude Code traffic is captured before it reaches the upstream API.",
    flowClaude: "Claude Code",
    flowGateway: "prompt-gateway",
    flowMessages: "POST /v1/messages",
    flowUpstream: "Upstream API",
    completeContext: "Full context sent to the model",
    completeContextDesc:
      "System instructions and messages exactly as this request sent them upstream, with readable labels before the raw JSON.",
    requestRawPayload: "Raw request JSON",
    currentInputEmpty: "No user input was found in this request.",
    requestPreview: "User input preview",
    showRequestDetails: "View full request",
    hideRequestDetails: "Hide details",
    requestWhatHappened: "Claude Code sent one request through prompt-gateway.",
    requestDetailsHint:
      "Open this only when you need system prompts, history, response, or raw JSON.",
    sessionSummaryHint: "Click to show session ID, timing, model, route, and streaming details.",
    expandSummary: "Expand",
    collapseSummary: "Collapse",
    missing: "missing",
    enabled: "Enabled",
    disabled: "Disabled",
    blocks: "block(s)",
    openByDefault: "Expanded",
  },
  zh: {
    appTitle: "Prompt Gateway",
    appSubtitle: "Claude Code 请求会话本地查看器",
    detailSubtitle: "看清 Claude Code 发给模型的内容",
    backToCaptures: "返回记录列表",
    languageEn: "EN",
    languageZh: "中文",
    themeLight: "浅色",
    themeDark: "深色",
    backToTop: "回到顶部",
    clearSearch: "清除",
    heroEyebrow: "记录面板",
    heroTitle: "Prompt 记录面板",
    heroText: "快速扫一眼最近 Claude Code 会话，优先发现异常，再进入会话详情做可读化排查。",
    detailEyebrow: "会话详情",
    detailTitle: "检查一次 Claude Code 请求会话",
    detailText: "主列按时间展示这个 session 中所有捕获请求，侧栏保留会话事实和原始载荷。",
    captures: "请求数",
    sessions: "会话数",
    successful: "成功数",
    streaming: "流式数",
    recentCaptures: "Claude Code 请求会话",
    recentCapturesDesc:
      "每一行是一组 Claude Code session。进入详情后，可以检查每次 /v1/messages 请求和完整 Prompt 载荷。",
    shown: "条已显示",
    search: "搜索",
    searchPlaceholder: "模型、会话、用户输入、成功/失败...",
    loadingHistory: "正在加载记录历史...",
    loadingDetails: "正在加载请求详情...",
    noCaptures: "还没有捕获到 Prompt。请通过 gateway 启动 Claude Code，列表会自动出现内容。",
    noSearchResults: "没有匹配当前搜索条件的记录。",
    tableStatus: "状态",
    tableSession: "会话",
    tableRequests: "请求数",
    tableModel: "模型",
    tableCaptured: "最近捕获",
    tableDuration: "耗时",
    tablePreview: "最新用户输入预览",
    success: "成功",
    error: "失败",
    unknownModel: "未知模型",
    noPreview: "暂无最新用户输入。",
    requestFacts: "会话摘要",
    requestFactsDesc: "这次 Claude Code 会话的简要概况。",
    systemPrompt: "系统 Prompt",
    systemPromptDesc: "这次捕获请求里携带的系统级指令内容。",
    userPrompt: "这次请求发给模型的用户输入",
    userPromptDesc:
      "这次请求中的最后一条 `user` 角色消息。完整 Prompt 载荷还包括系统指令和历史上下文。",
    modelResponse: "模型响应",
    modelResponseDesc: "请求中携带的历史 `assistant` 消息，以及这次调用的响应状态。",
    promptPreview: "最新用户输入",
    promptPreviewDesc: "展示这次请求里发送到上游的最后一段用户文本。",
    readablePrompt: "可读 Prompt",
    readablePromptDesc: "在不改变原始语义的前提下，转换成更适合人阅读的结构。",
    promptTimeline: "Prompt 时间线",
    promptTimelineDesc: "按照这次请求发往上游时的上下文顺序阅读。",
    requestContext: "请求上下文",
    requestMessage: "消息",
    requestShort: "请求",
    sessionTimeline: "捕获到的请求",
    sessionTimelineDesc: "每张卡片代表 Claude Code 通过 prompt-gateway 发给模型的一次请求。",
    collapseAll: "全部折叠",
    expandAll: "全部展开",
    collapseEntry: "折叠",
    expandEntry: "展开",
    system: "系统提示",
    messages: "消息内容",
    noReadableBlocks: "这条消息里没有识别到可读文本块。",
    noReadablePrompt: "这条记录里没有识别到可读 Prompt 内容。",
    noSystemPrompt: "这条记录里没有识别到系统 Prompt 内容。",
    noUserPrompt: "这条记录里没有识别到用户 Prompt 内容。",
    noModelResponse: "这条记录里没有识别到历史 assistant 消息，也没有捕获到可展示的响应文本。",
    currentResponse: "当前响应",
    currentResponseDesc: "这里展示的是这次请求从上游捕获到的响应内容，以及响应状态和耗时。",
    responseBody: "响应正文",
    headers: "请求头",
    rawRequest: "原始请求",
    systemJson: "System JSON",
    messagesJson: "Messages JSON",
    showFullJson: "展开完整 JSON",
    showFullBlock: "展开完整内容块",
    showFullPreview: "展开完整预览",
    close: "关闭",
    requestCaptured: "捕获时间",
    requestCount: "请求数",
    sessionStarted: "开始时间",
    sessionLatest: "最近时间",
    requestModel: "模型",
    requestSession: "会话",
    requestRoute: "路由",
    requestResponse: "响应",
    requestDuration: "耗时",
    requestStreaming: "流式",
    requestMaxTokens: "最大 Token",
    quickOverview: "概览",
    quickReadable: "可读 Prompt",
    quickRaw: "原始载荷",
    responseSummary: "响应概览",
    responseSummaryDesc: "先看结果，再决定是否继续深入 Prompt 正文。",
    rawPayloads: "原始载荷",
    rawPayloadsDesc: "保留原始结构化数据，方便需要时做精确核对。",
    inspectRequest: "查看请求",
    promptMessages: "消息数",
    sessionShort: "会话",
    requestFlowTitle: "请求路径",
    requestFlowDesc: "Claude Code 流量在到达上游 API 前如何被本地捕获。",
    flowClaude: "Claude Code",
    flowGateway: "prompt-gateway",
    flowMessages: "POST /v1/messages",
    flowUpstream: "上游 API",
    completeContext: "发给模型的完整上下文",
    completeContextDesc:
      "这次请求发往上游的 system 和 messages。这里先做可读化标注，原始 JSON 放在后面核对。",
    requestRawPayload: "原始请求 JSON",
    currentInputEmpty: "这次请求里没有识别到用户输入。",
    requestPreview: "用户输入预览",
    showRequestDetails: "查看完整请求",
    hideRequestDetails: "收起详情",
    requestWhatHappened: "Claude Code 通过 prompt-gateway 发出了一次请求。",
    requestDetailsHint: "需要看 system prompt、历史上下文、响应或原始 JSON 时再展开。",
    sessionSummaryHint: "点击展开 session ID、时间、模型、路由和流式信息。",
    expandSummary: "展开",
    collapseSummary: "收起",
    missing: "缺失",
    enabled: "已开启",
    disabled: "已关闭",
    blocks: "个区块",
    openByDefault: "已展开",
  },
} as const;

function detectSystemLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function detectSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function LanguageIcon({ language }: { language: Language }): ReactNode {
  return (
    <span aria-hidden="true" className="language-badge">
      {language === "en" ? "EN" : "中"}
    </span>
  );
}

function ThemeIcon({ theme }: { theme: Theme }): ReactNode {
  if (theme === "dark") {
    return (
      <svg aria-hidden="true" className="control-icon" viewBox="0 0 24 24">
        <path
          d="M15.7 4.8a7.2 7.2 0 1 0 3.5 13.5 8 8 0 1 1-3.5-13.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="control-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3.75v2.5M12 17.75v2.5M20.25 12h-2.5M6.25 12h-2.5M17.83 6.17l-1.76 1.76M7.93 16.07l-1.76 1.76M17.83 17.83l-1.76-1.76M7.93 7.93 6.17 6.17"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function BackToCapturesIcon(): ReactNode {
  return (
    <svg aria-hidden="true" className="control-icon" viewBox="0 0 24 24">
      <path
        d="M10 7 5 12l5 5M6 12h6.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M14.5 8h4.75M14.5 12h4.75M14.5 16h4.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
}

function formatPreview(value: string | null | undefined, fallback: string): string {
  const trimmed = normalizeText(value).trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function readTextFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  const objectValue = asObject(value);
  if (objectValue && typeof objectValue.text === "string") {
    return normalizeText(objectValue.text);
  }

  return null;
}

function toMessageBlock(value: unknown): MessageBlock | null {
  const directText = readTextFromUnknown(value);
  if (directText !== null) {
    return {
      id: `text-${directText.slice(0, 48)}`,
      text: directText,
      type: "text",
    };
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return null;
  }

  const blockType = typeof objectValue.type === "string" ? objectValue.type : "unknown";
  const text =
    readTextFromUnknown(objectValue.text) ??
    readTextFromUnknown(objectValue.input) ??
    readTextFromUnknown(objectValue.content);

  if (text !== null) {
    return {
      id: `${blockType}-${typeof objectValue.name === "string" ? objectValue.name : "block"}-${text.slice(0, 48)}`,
      label: typeof objectValue.name === "string" ? objectValue.name : undefined,
      text,
      type: blockType,
    };
  }

  return {
    id: `${blockType}-${JSON.stringify(value).slice(0, 48)}`,
    label: typeof objectValue.name === "string" ? objectValue.name : undefined,
    text: JSON.stringify(value, null, 2),
    type: blockType,
  };
}

function extractSystemBlocks(system: unknown): MessageBlock[] {
  if (typeof system === "undefined" || system === null) {
    return [];
  }

  if (Array.isArray(system)) {
    return system
      .map((item) => toMessageBlock(item))
      .filter((item): item is MessageBlock => item !== null);
  }

  const block = toMessageBlock(system);
  return block ? [block] : [];
}

function extractMessageItems(messages: unknown): MessageItem[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message) => {
    const messageObject = asObject(message);
    if (!messageObject) {
      return [];
    }

    const content = messageObject.content;
    const blocks = Array.isArray(content)
      ? content
          .map((item) => toMessageBlock(item))
          .filter((item): item is MessageBlock => item !== null)
      : (() => {
          const singleBlock = toMessageBlock(content);
          return singleBlock ? [singleBlock] : [];
        })();

    return [
      {
        id: `${typeof messageObject.role === "string" ? messageObject.role : "unknown"}-${JSON.stringify(content).slice(0, 48)}`,
        role: typeof messageObject.role === "string" ? messageObject.role : "unknown",
        blocks,
      },
    ];
  });
}

function getLastUserMessageBlocks(messageItems: MessageItem[]): MessageBlock[] {
  for (let index = messageItems.length - 1; index >= 0; index -= 1) {
    const message = messageItems[index];
    if (message.role === "user" && message.blocks.length > 0) {
      return message.blocks;
    }
  }

  return [];
}

function extractSseResponseText(responseBody: string): string | null {
  const segments: string[] = [];

  for (const line of responseBody.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const event = JSON.parse(payload) as Record<string, unknown>;
      const delta = asObject(event.delta);
      const contentBlock = asObject(event.content_block);

      if (typeof delta?.text === "string") {
        segments.push(delta.text);
        continue;
      }

      if (typeof contentBlock?.text === "string") {
        segments.push(contentBlock.text);
        continue;
      }

      if (typeof event.text === "string") {
        segments.push(event.text);
      }
    } catch {}
  }

  const joined = segments.join("");
  return joined.trim() ? joined : null;
}

function extractResponseBlocks(responseBody: unknown): MessageBlock[] {
  const objectValue = asObject(responseBody);
  if (objectValue && Array.isArray(objectValue.content)) {
    return objectValue.content
      .map((item) => toMessageBlock(item))
      .filter((item): item is MessageBlock => item !== null);
  }

  if (typeof responseBody === "string") {
    const sseText = extractSseResponseText(responseBody);
    if (sseText) {
      return [
        {
          id: `response-${sseText.slice(0, 48)}`,
          text: sseText,
          type: "response",
        },
      ];
    }
  }

  const singleBlock = toMessageBlock(responseBody);
  return singleBlock ? [singleBlock] : [];
}

function roleTone(role: string): TimelineEntry["tone"] {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }

  if (role === "response") {
    return "response";
  }

  return "unknown";
}

function blockKindLabel(block: MessageBlock): string {
  const trimmed = block.text.trimStart();

  if (block.type === "text" && trimmed.startsWith("<system-reminder>")) {
    return "system-reminder";
  }

  return block.label ?? block.type;
}

function buildTimelineEntries({
  systemBlocks,
  messageItems,
  responseBlocks,
  responseFacts,
  copy,
}: {
  systemBlocks: MessageBlock[];
  messageItems: MessageItem[];
  responseBlocks: MessageBlock[];
  responseFacts: Array<{ label: string; value: string }>;
  copy: (typeof COPY)[Language];
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (systemBlocks.length > 0) {
    entries.push({
      id: "system",
      role: "system",
      title: copy.requestContext,
      description: copy.systemPromptDesc,
      blocks: systemBlocks,
      meta: ["requestBody.raw.system", `${systemBlocks.length} ${copy.blocks}`],
      tone: "system",
    });
  }

  messageItems.forEach((message, index) => {
    entries.push({
      id: `message-${index}-${message.id}`,
      role: message.role,
      title: `${copy.requestMessage} ${index + 1}`,
      description: message.role,
      blocks: message.blocks,
      meta: [`requestBody.raw.messages[${index}]`, `${message.blocks.length} ${copy.blocks}`],
      tone: roleTone(message.role),
    });
  });

  if (responseBlocks.length > 0 || responseFacts.length > 0) {
    entries.push({
      id: "current-response",
      role: "response",
      title: copy.currentResponse,
      description: copy.currentResponseDesc,
      blocks: responseBlocks,
      meta: ["response.body.raw", ...responseFacts.map((item) => `${item.label}: ${item.value}`)],
      tone: "response",
    });
  }

  return entries;
}

function parseRoute(pathname: string): Route {
  if (pathname.startsWith("/sessions/")) {
    const encodedSessionId = pathname.slice("/sessions/".length);
    return {
      name: "detail",
      sessionId: decodeSessionRouteId(encodedSessionId),
    };
  }

  return { name: "home" };
}

function encodeSessionRouteId(value: string | null): string {
  return value ? encodeURIComponent(value) : "~missing";
}

function decodeSessionRouteId(value: string): string | null {
  return value === "~missing" ? null : decodeURIComponent(value);
}

function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function statusText(ok: boolean, status: number, copy: (typeof COPY)[Language]): string {
  return ok ? `${copy.success} · ${status}` : `${copy.error} · ${status}`;
}

function compactSessionId(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TopBar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        <div className="topbar-subtitle">{subtitle}</div>
      </div>
      {action ? <div className="topbar-action">{action}</div> : null}
    </header>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function KeyValueList({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="key-value-list">
      {items.map((item) => (
        <div className="key-value-row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSummaryCard({
  label,
  value,
  hoverValue,
  tone = "default",
}: {
  label: string;
  value: string;
  hoverValue?: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <article className={`detail-summary-card ${tone}`}>
      <span>{label}</span>
      <strong title={hoverValue}>{value}</strong>
    </article>
  );
}

function RequestFlow({ copy }: { copy: (typeof COPY)[Language] }) {
  const steps = [copy.flowClaude, copy.flowGateway, copy.flowMessages, copy.flowUpstream];

  return (
    <section className="panel request-flow-panel">
      <SectionHeader title={copy.requestFlowTitle} description={copy.requestFlowDesc} />
      <ol className="request-flow" aria-label={copy.requestFlowTitle}>
        {steps.map((step, index) => (
          <li key={step}>
            <span className="flow-step-number">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RawDetails({
  title,
  value,
  showFullJsonText,
  openByDefaultText,
}: {
  title: string;
  value: unknown;
  showFullJsonText: string;
  openByDefaultText: string;
}) {
  const text = JSON.stringify(value, null, 2);
  const shouldCollapse = text.length > COLLAPSE_THRESHOLD;

  return (
    <details className="inline-raw-details" open={!shouldCollapse}>
      <summary>
        <span>{title}</span>
        <span>{shouldCollapse ? showFullJsonText : openByDefaultText}</span>
      </summary>
      <pre>{text}</pre>
    </details>
  );
}

function RequestInspectionCard({
  capture,
  requestIndex,
  language,
  copy,
}: {
  capture: CaptureRecord;
  requestIndex: number;
  language: Language;
  copy: (typeof COPY)[Language];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const systemBlocks = extractSystemBlocks(capture.derived.system);
  const messageItems = extractMessageItems(capture.derived.messages);
  const currentUserBlocks = getLastUserMessageBlocks(messageItems);
  const currentUserPreview =
    currentUserBlocks
      .map((block) => block.text)
      .join("\n\n")
      .trim() || capture.derived.promptTextPreview;
  const responseFacts = [
    {
      label: copy.requestResponse,
      value: statusText(capture.response.ok, capture.response.status, copy),
    },
    { label: copy.requestDuration, value: `${capture.response.durationMs} ms` },
    {
      label: copy.requestStreaming,
      value: capture.derived.stream ? copy.enabled : copy.disabled,
    },
  ];
  const timelineEntries = buildTimelineEntries({
    systemBlocks,
    messageItems,
    responseBlocks: extractResponseBlocks(capture.response.body?.raw ?? null),
    responseFacts,
    copy,
  });
  const facts = [
    { label: copy.requestCaptured, value: formatDate(capture.capturedAt, language) },
    {
      label: copy.requestModel,
      value: capture.derived.model ?? copy.unknownModel,
    },
    { label: copy.requestRoute, value: `${capture.method} ${capture.path}` },
    {
      label: copy.requestResponse,
      value: statusText(capture.response.ok, capture.response.status, copy),
    },
    { label: copy.requestDuration, value: `${capture.response.durationMs} ms` },
    { label: copy.requestStreaming, value: capture.derived.stream ? copy.enabled : copy.disabled },
    {
      label: copy.requestMaxTokens,
      value: capture.derived.maxTokens === null ? copy.missing : String(capture.derived.maxTokens),
    },
  ];

  return (
    <article
      className={isExpanded ? "request-inspection-card expanded" : "request-inspection-card"}
      data-request-index={requestIndex + 1}
    >
      <header className="request-card-header">
        <div>
          <div className="timeline-title-row">
            <span className={capture.response.ok ? "status ok" : "status error"}>
              {capture.response.ok ? copy.success : copy.error}
            </span>
            <h3>
              {copy.requestShort} {requestIndex + 1}
            </h3>
          </div>
          <p>{copy.requestWhatHappened}</p>
        </div>
        <div className="request-card-actions">
          <div className="request-chip-row">
            <span>{capture.derived.model ?? copy.unknownModel}</span>
            <span>{capture.response.durationMs} ms</span>
            <span>{formatDate(capture.capturedAt, language)}</span>
          </div>
          <button
            aria-label={isExpanded ? copy.hideRequestDetails : copy.showRequestDetails}
            aria-expanded={isExpanded}
            className="request-toggle"
            onClick={() => setIsExpanded((current) => !current)}
            title={isExpanded ? copy.hideRequestDetails : copy.showRequestDetails}
            type="button"
          >
            <span aria-hidden="true">{isExpanded ? "-" : "+"}</span>
          </button>
        </div>
      </header>

      <section className="request-preview-panel">
        <div className="request-preview-heading">
          <span>{copy.requestPreview}</span>
          <span>{copy.requestDetailsHint}</span>
        </div>
        <pre>{formatPreview(currentUserPreview, copy.currentInputEmpty)}</pre>
      </section>

      {isExpanded ? (
        <div className="request-detail-stack">
          <section className="current-input-panel">
            <SectionHeader title={copy.userPrompt} description={copy.userPromptDesc} />
            <div className="current-input-body">
              {currentUserBlocks.length > 0 ? (
                currentUserBlocks.map((block) => (
                  <TextBlock
                    block={block}
                    closeText={copy.close}
                    key={block.id}
                    showFullBlockText={copy.showFullBlock}
                  />
                ))
              ) : (
                <div className="empty-state">{copy.currentInputEmpty}</div>
              )}
            </div>
          </section>

          <details className="request-details-section">
            <summary>{copy.completeContext}</summary>
            <div className="request-details-body">
              <SectionHeader description={copy.completeContextDesc} title={copy.completeContext} />
              <TimelineList copy={copy} entries={timelineEntries} key={capture.requestId} />
            </div>
          </details>

          <details className="request-details-section">
            <summary>{copy.rawPayloads}</summary>
            <div className="request-card-footer">
              <KeyValueList items={facts} />
              <RawDetails
                openByDefaultText={copy.openByDefault}
                showFullJsonText={copy.showFullJson}
                title={copy.requestRawPayload}
                value={capture.requestBody.raw}
              />
            </div>
          </details>
        </div>
      ) : null}
    </article>
  );
}

function TimelineList({
  entries,
  copy,
}: {
  entries: TimelineEntry[];
  copy: (typeof COPY)[Language];
}) {
  const defaultCollapsedIds = useMemo(
    () =>
      new Set(
        entries
          .filter(
            (entry) =>
              entry.blocks.length > 1 || entry.blocks.some((block) => block.text.length > 1000),
          )
          .map((entry) => entry.id),
      ),
    [entries],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  if (entries.length === 0) {
    return <div className="empty-state">{copy.noReadablePrompt}</div>;
  }

  const allExpanded = entries.every(
    (entry) => !defaultCollapsedIds.has(entry.id) || expandedIds.has(entry.id),
  );

  return (
    <div className="timeline-wrap">
      <div className="timeline-toolbar">
        <button
          className="ghost-button"
          onClick={() => {
            setExpandedIds(allExpanded ? new Set() : new Set(entries.map((entry) => entry.id)));
          }}
          type="button"
        >
          {allExpanded ? copy.collapseAll : copy.expandAll}
        </button>
      </div>
      <div className="timeline-list">
        {entries.map((entry, index) => {
          const isCollapsible = defaultCollapsedIds.has(entry.id);
          const isExpanded = !isCollapsible || expandedIds.has(entry.id);
          const previewBlock = entry.blocks[0] ?? null;

          return (
            <article className={`timeline-entry ${entry.tone}`} key={entry.id}>
              <div className="timeline-rail" aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="timeline-card">
                <header className="timeline-header">
                  <div>
                    <div className="timeline-title-row">
                      <span className="role-badge">{entry.role}</span>
                      <h3>{entry.title}</h3>
                    </div>
                    <p>{entry.description}</p>
                  </div>
                  <div className="timeline-side">
                    {entry.meta.length > 0 ? (
                      <div className="timeline-meta">
                        {entry.meta.map((item) => (
                          <span className="hint" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {isCollapsible ? (
                      <button
                        className="inline-link-button"
                        onClick={() => {
                          setExpandedIds((current) => {
                            const next = new Set(current);
                            if (next.has(entry.id)) {
                              next.delete(entry.id);
                            } else {
                              next.add(entry.id);
                            }
                            return next;
                          });
                        }}
                        type="button"
                      >
                        {isExpanded ? copy.collapseEntry : copy.expandEntry}
                      </button>
                    ) : null}
                  </div>
                </header>
                <div
                  className={isExpanded ? "timeline-block-list" : "timeline-block-list collapsed"}
                >
                  {entry.blocks.length > 0 && isExpanded ? (
                    entry.blocks.map((block) => (
                      <TextBlock
                        block={block}
                        closeText={copy.close}
                        key={block.id}
                        showFullBlockText={copy.showFullBlock}
                      />
                    ))
                  ) : previewBlock ? (
                    <div className="timeline-entry-preview">
                      <span className="pill">{blockKindLabel(previewBlock)}</span>
                      <pre>{previewBlock.text}</pre>
                    </div>
                  ) : (
                    <div className="empty-state">{copy.noReadableBlocks}</div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TextBlock({
  block,
  showFullBlockText,
  closeText,
}: {
  block: MessageBlock;
  showFullBlockText: string;
  closeText: string;
}) {
  const shouldCollapse = block.text.length > COLLAPSE_THRESHOLD;
  const [isOpen, setIsOpen] = useState(false);
  const label = blockKindLabel(block);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const modal = isOpen ? (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <button
        aria-label={closeText}
        className="modal-dismiss"
        onClick={() => setIsOpen(false)}
        type="button"
      />
      <div className="modal-panel">
        <div className="modal-header">
          <div className="text-block-meta">
            <span className="pill">{label}</span>
            {block.label && block.type !== "text" ? (
              <span className="hint">{block.type}</span>
            ) : null}
          </div>
          <button className="ghost-button" onClick={() => setIsOpen(false)} type="button">
            {closeText}
          </button>
        </div>
        <div className="modal-content">
          <pre>{block.text}</pre>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <article className="text-block">
        <div className="text-block-meta">
          <span className="pill">{label}</span>
          {block.label && block.type !== "text" ? <span className="hint">{block.type}</span> : null}
        </div>
        {shouldCollapse ? (
          <>
            <pre className="preview-pre collapsed">{block.text}</pre>
            <button className="inline-link-button" onClick={() => setIsOpen(true)} type="button">
              {showFullBlockText}
            </button>
          </>
        ) : (
          <pre>{block.text}</pre>
        )}
      </article>

      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </>
  );
}

function SessionTable({
  sessions,
  language,
  copy,
}: {
  sessions: SessionListItem[];
  language: Language;
  copy: (typeof COPY)[Language];
}) {
  return (
    <div className="capture-table">
      <div className="capture-table-head" aria-hidden="true">
        <span>{copy.tableStatus}</span>
        <span>{copy.tableSession}</span>
        <span>{copy.tableRequests}</span>
        <span>{copy.tableModel}</span>
        <span>{copy.tableCaptured}</span>
        <span>{copy.tablePreview}</span>
      </div>

      {sessions.map((session) => (
        <button
          className={
            session.errorCount === 0
              ? "capture-row capture-row-ok"
              : "capture-row capture-row-error"
          }
          key={session.sessionId ?? "missing-session"}
          onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
          type="button"
        >
          <span className={session.errorCount === 0 ? "status ok" : "status error"}>
            {session.errorCount === 0 ? copy.success : copy.error}
          </span>
          <span className="capture-model">{compactSessionId(session.sessionId, copy.missing)}</span>
          <span>
            {session.requestCount} · {session.durationMs} ms
          </span>
          <span className="capture-model">
            {session.models.length > 0 ? session.models.join(", ") : copy.unknownModel}
          </span>
          <span>{formatDate(session.latestCapturedAt, language)}</span>
          <span className="capture-preview">
            {formatPreview(session.promptTextPreview, copy.noPreview)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "zh" || stored === "en" ? stored : detectSystemLanguage();
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : detectSystemTheme();
  });
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedCaptures, setSelectedCaptures] = useState<CaptureRecord[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const copy = COPY[language];

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 360);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, language]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const response = await fetch("/api/sessions");
        if (!response.ok) {
          throw new Error(`Failed to load sessions (${response.status})`);
        }

        const payload = (await response.json()) as { sessions: SessionListItem[] };
        if (!cancelled) {
          setSessions(payload.sessions);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionsError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (route.name !== "detail") {
      setSelectedCaptures([]);
      setSelectedError(null);
      setSelectedLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSession(sessionId: string | null) {
      setSelectedLoading(true);
      setSelectedError(null);

      try {
        const response = await fetch(`/api/sessions/${encodeSessionRouteId(sessionId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load session (${response.status})`);
        }

        const payload = (await response.json()) as {
          sessionId: string | null;
          captures: CaptureRecord[];
        };
        if (!cancelled) {
          setSelectedCaptures(payload.captures);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setSelectedLoading(false);
        }
      }
    }

    void loadSession(route.sessionId);
    return () => {
      cancelled = true;
    };
  }, [route]);

  const stats = useMemo(() => {
    const successCount = sessions.reduce((total, item) => total + item.successCount, 0);
    const streamCount = sessions.reduce((total, item) => total + item.streamCount, 0);

    return {
      total: sessions.length,
      successCount,
      streamCount,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const trimmedQuery = deferredQuery.trim().toLowerCase();
    if (!trimmedQuery) {
      return sessions;
    }

    return sessions.filter((session) => {
      const haystack = [
        session.models.join(" "),
        session.sessionId ?? "",
        session.promptTextPreview,
        session.errorCount === 0 ? copy.success : copy.error,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [copy.error, copy.success, deferredQuery, sessions]);

  const nextLanguage = language === "en" ? "zh" : "en";
  const nextTheme = theme === "light" ? "dark" : "light";
  const languageToggleLabel =
    language === "en" ? `Switch to ${COPY.zh.languageZh}` : `切换到 ${COPY.en.languageEn}`;
  const themeToggleLabel = theme === "light" ? `${copy.themeDark}` : `${copy.themeLight}`;

  const controls = (
    <div className="topbar-controls">
      <button
        aria-label={languageToggleLabel}
        className="icon-toggle"
        onClick={() => setLanguage(nextLanguage)}
        title={languageToggleLabel}
        type="button"
      >
        <LanguageIcon language={language} />
      </button>
      <button
        aria-label={themeToggleLabel}
        className="icon-toggle"
        onClick={() => setTheme(nextTheme)}
        title={themeToggleLabel}
        type="button"
      >
        <ThemeIcon theme={theme} />
      </button>
    </div>
  );

  const backToTopButton = showBackToTop ? (
    <button
      aria-label={copy.backToTop}
      className="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      type="button"
    >
      ↑<span>{copy.backToTop}</span>
    </button>
  ) : null;

  if (route.name === "detail") {
    const firstCapture = selectedCaptures[0] ?? null;
    const latestCapture = selectedCaptures[selectedCaptures.length - 1] ?? null;
    const selectedSessionId = route.sessionId;
    const sessionOk = selectedCaptures.every((capture) => capture.response.ok);
    const sessionDurationMs = selectedCaptures.reduce(
      (total, capture) => total + capture.response.durationMs,
      0,
    );
    const sessionModels = Array.from(
      new Set(
        selectedCaptures
          .map((capture) => capture.derived.model)
          .filter((model): model is string => Boolean(model)),
      ),
    );
    const sessionStreamCount = selectedCaptures.filter((capture) => capture.derived.stream).length;

    const facts = latestCapture
      ? [
          { label: copy.requestSession, value: selectedSessionId ?? copy.missing },
          { label: copy.requestCount, value: String(selectedCaptures.length) },
          {
            label: copy.sessionStarted,
            value: firstCapture ? formatDate(firstCapture.capturedAt, language) : copy.missing,
          },
          { label: copy.sessionLatest, value: formatDate(latestCapture.capturedAt, language) },
          {
            label: copy.requestModel,
            value: sessionModels.length > 0 ? sessionModels.join(", ") : copy.unknownModel,
          },
          { label: copy.requestRoute, value: `${latestCapture.method} ${latestCapture.path}` },
          {
            label: copy.requestResponse,
            value: sessionOk
              ? `${copy.success} · ${selectedCaptures.length}/${selectedCaptures.length}`
              : `${copy.error} · ${
                  selectedCaptures.filter((capture) => !capture.response.ok).length
                }/${selectedCaptures.length}`,
          },
          { label: copy.requestDuration, value: `${sessionDurationMs} ms` },
          {
            label: copy.requestStreaming,
            value:
              sessionStreamCount > 0 ? `${copy.enabled} · ${sessionStreamCount}` : copy.disabled,
          },
        ]
      : [];

    const detailSummaryCards = latestCapture
      ? [
          {
            label: copy.requestResponse,
            value: sessionOk ? copy.success : copy.error,
            tone: sessionOk ? "success" : "danger",
          },
          {
            label: copy.requestDuration,
            value: `${sessionDurationMs} ms`,
            tone: "default" as const,
          },
          {
            label: copy.requestModel,
            value: sessionModels.length > 0 ? sessionModels.join(", ") : copy.unknownModel,
            hoverValue: sessionModels.length > 0 ? sessionModels.join(", ") : copy.unknownModel,
            tone: "default" as const,
          },
          {
            label: copy.sessionShort,
            value: compactSessionId(selectedSessionId, copy.missing),
            hoverValue: selectedSessionId ?? copy.missing,
            tone: "default" as const,
          },
        ]
      : [];

    return (
      <div className="app-shell">
        <TopBar
          subtitle={copy.detailSubtitle}
          title={copy.appTitle}
          action={
            <>
              {controls}
              <button
                aria-label={copy.backToCaptures}
                className="icon-toggle"
                onClick={() => navigate("/")}
                title={copy.backToCaptures}
                type="button"
              >
                <BackToCapturesIcon />
              </button>
            </>
          }
        />

        {selectedLoading ? <div className="empty-state">{copy.loadingDetails}</div> : null}
        {selectedError ? (
          <div className="empty-state error" role="alert">
            {selectedError}
          </div>
        ) : null}

        {latestCapture ? (
          <main className="detail-shell">
            <section className="detail-main">
              <RequestFlow copy={copy} />

              <section className="detail-summary-grid">
                {detailSummaryCards.map((card) => (
                  <DetailSummaryCard
                    hoverValue={card.hoverValue}
                    key={card.label}
                    label={card.label}
                    tone={card.tone}
                    value={card.value}
                  />
                ))}
              </section>

              <details className="session-technical-details">
                <summary>
                  <span>
                    <strong>{copy.requestFacts}</strong>
                    <small>{copy.sessionSummaryHint}</small>
                  </span>
                  <span className="summary-state">
                    <span className="summary-state-open">{copy.collapseSummary}</span>
                    <span className="summary-state-closed">{copy.expandSummary}</span>
                  </span>
                </summary>
                <div className="session-technical-body">
                  <KeyValueList items={facts} />
                </div>
              </details>

              <section className="panel highlight-panel timeline-panel" id="detail-timeline">
                <SectionHeader
                  title={copy.sessionTimeline}
                  description={copy.sessionTimelineDesc}
                  action={
                    <span className={sessionOk ? "status ok" : "status error"}>
                      {sessionOk ? copy.success : copy.error}
                    </span>
                  }
                />
                <div className="request-card-list">
                  {selectedCaptures.map((capture, index) => (
                    <RequestInspectionCard
                      capture={capture}
                      copy={copy}
                      key={capture.requestId}
                      language={language}
                      requestIndex={index}
                    />
                  ))}
                </div>
              </section>
            </section>
          </main>
        ) : null}
        {backToTopButton}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar action={controls} subtitle={copy.appSubtitle} title={copy.appTitle} />

      <section className="summary-grid">
        <SummaryCard label={copy.sessions} value={String(stats.total)} />
        <SummaryCard label={copy.successful} value={String(stats.successCount)} />
        <SummaryCard label={copy.streaming} value={String(stats.streamCount)} />
      </section>

      <main className="list-layout">
        <section className="panel">
          <SectionHeader
            action={
              <span className="hint">
                {filteredSessions.length} {copy.shown}
              </span>
            }
            description={copy.recentCapturesDesc}
            title={copy.recentCaptures}
          />

          <div className="toolbar">
            <label className="search-input">
              <span>{copy.search}</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                type="search"
                value={query}
              />
            </label>
            {query ? (
              <button className="ghost-button" onClick={() => setQuery("")} type="button">
                {copy.clearSearch}
              </button>
            ) : null}
          </div>

          {sessionsLoading ? <div className="empty-state">{copy.loadingHistory}</div> : null}
          {sessionsError ? (
            <div className="empty-state error" role="alert">
              {sessionsError}
            </div>
          ) : null}

          {!sessionsLoading && !sessionsError && filteredSessions.length === 0 ? (
            <div className="empty-state">
              {sessions.length === 0 ? copy.noCaptures : copy.noSearchResults}
            </div>
          ) : null}

          {!sessionsLoading && !sessionsError && filteredSessions.length > 0 ? (
            <SessionTable sessions={filteredSessions} copy={copy} language={language} />
          ) : null}
        </section>
      </main>
      {backToTopButton}
    </div>
  );
}

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type CaptureListItem = {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  sessionId: string | null;
  model: string | null;
  maxTokens: number | null;
  stream: boolean;
  status: number;
  durationMs: number;
  ok: boolean;
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
  };
};

type Route =
  | {
      name: "home";
    }
  | {
      name: "detail";
      requestId: string;
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

type Language = "en" | "zh";
type Theme = "light" | "dark";

const COLLAPSE_THRESHOLD = 600;
const LANGUAGE_STORAGE_KEY = "prompt-gateway-language";
const THEME_STORAGE_KEY = "prompt-gateway-theme";

const COPY = {
  en: {
    appTitle: "Prompt Gateway",
    appSubtitle: "Local viewer for Claude Code prompt captures",
    detailSubtitle: "Readable request inspection",
    backToCaptures: "Back to captures",
    languageEn: "EN",
    languageZh: "中文",
    themeLight: "Light",
    themeDark: "Dark",
    backToTop: "Back to top",
    heroEyebrow: "Capture Dashboard",
    heroTitle: "Prompt capture dashboard",
    heroText: "",
    detailEyebrow: "Request Detail",
    detailTitle: "Inspect one captured request",
    detailText:
      "The main column focuses on readable prompt content. The sidebar keeps request facts and raw payloads nearby without interrupting the reading flow.",
    captures: "Captures",
    successful: "Successful",
    streaming: "Streaming",
    recentCaptures: "Recent Captures",
    recentCapturesDesc: "Search by model, session, prompt text, or request outcome.",
    shown: "shown",
    search: "Search",
    searchPlaceholder: "model, session, preview, success...",
    loadingHistory: "Loading capture history...",
    loadingDetails: "Loading prompt details...",
    noCaptures:
      "No prompts captured yet. Start Claude Code through the gateway and this list will fill in automatically.",
    noSearchResults: "No captures matched your search.",
    tableStatus: "Status",
    tableModel: "Model",
    tableCaptured: "Captured",
    tableDuration: "Duration",
    tablePreview: "Preview",
    success: "Success",
    error: "Error",
    unknownModel: "Unknown model",
    noPreview: "No prompt preview available.",
    requestFacts: "Request Facts",
    requestFactsDesc: "The fields you usually need first when debugging behavior.",
    promptPreview: "Prompt Preview",
    promptPreviewDesc: "Fast overview of the prompt text that was sent upstream.",
    readablePrompt: "Readable Prompt",
    readablePromptDesc: "Normalized for reading while preserving the original request semantics.",
    system: "System",
    messages: "Messages",
    noReadableBlocks: "No readable blocks found in this message.",
    noReadablePrompt: "No readable prompt content was found in this capture.",
    headers: "Headers",
    rawRequest: "Raw Request",
    systemJson: "System JSON",
    messagesJson: "Messages JSON",
    showFullJson: "Show full JSON",
    showFullBlock: "Show full block",
    showFullPreview: "Show full preview",
    close: "Close",
    requestCaptured: "Captured",
    requestModel: "Model",
    requestSession: "Session",
    requestRoute: "Route",
    requestResponse: "Response",
    requestDuration: "Duration",
    requestStreaming: "Streaming",
    requestMaxTokens: "Max tokens",
    missing: "missing",
    enabled: "Enabled",
    disabled: "Disabled",
    blocks: "block(s)",
  },
  zh: {
    appTitle: "Prompt Gateway",
    appSubtitle: "Claude Code Prompt 本地查看器",
    detailSubtitle: "请求可读化检查视图",
    backToCaptures: "返回记录列表",
    languageEn: "EN",
    languageZh: "中文",
    themeLight: "浅色",
    themeDark: "深色",
    backToTop: "回到顶部",
    heroEyebrow: "记录面板",
    heroTitle: "Prompt 记录面板",
    heroText: "",
    detailEyebrow: "请求详情",
    detailTitle: "检查单条捕获请求",
    detailText:
      "主列聚焦可读 Prompt 内容，侧栏保留请求事实和原始载荷，让你在浏览器里就能快速定位问题。",
    captures: "记录数",
    successful: "成功数",
    streaming: "流式数",
    recentCaptures: "最近记录",
    recentCapturesDesc: "支持按模型、会话、Prompt 文本和请求结果搜索。",
    shown: "条已显示",
    search: "搜索",
    searchPlaceholder: "模型、会话、preview、成功/失败...",
    loadingHistory: "正在加载记录历史...",
    loadingDetails: "正在加载请求详情...",
    noCaptures: "还没有捕获到 Prompt。请通过 gateway 启动 Claude Code，列表会自动出现内容。",
    noSearchResults: "没有匹配当前搜索条件的记录。",
    tableStatus: "状态",
    tableModel: "模型",
    tableCaptured: "捕获时间",
    tableDuration: "耗时",
    tablePreview: "预览",
    success: "成功",
    error: "失败",
    unknownModel: "未知模型",
    noPreview: "暂无 Prompt 预览。",
    requestFacts: "请求关键信息",
    requestFactsDesc: "调试请求时最常用的一组字段。",
    promptPreview: "Prompt 预览",
    promptPreviewDesc: "快速查看这次请求发送到上游的核心文本内容。",
    readablePrompt: "可读 Prompt",
    readablePromptDesc: "在不改变原始语义的前提下，转换成更适合人阅读的结构。",
    system: "系统提示",
    messages: "消息内容",
    noReadableBlocks: "这条消息里没有识别到可读文本块。",
    noReadablePrompt: "这条记录里没有识别到可读 Prompt 内容。",
    headers: "请求头",
    rawRequest: "原始请求",
    systemJson: "System JSON",
    messagesJson: "Messages JSON",
    showFullJson: "展开完整 JSON",
    showFullBlock: "展开完整内容块",
    showFullPreview: "展开完整预览",
    close: "关闭",
    requestCaptured: "捕获时间",
    requestModel: "模型",
    requestSession: "会话",
    requestRoute: "路由",
    requestResponse: "响应",
    requestDuration: "耗时",
    requestStreaming: "流式",
    requestMaxTokens: "最大 Token",
    missing: "缺失",
    enabled: "已开启",
    disabled: "已关闭",
    blocks: "个区块",
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

function normalizeText(value: string): string {
  return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
}

function formatPreview(value: string, fallback: string): string {
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

function parseRoute(pathname: string): Route {
  if (pathname.startsWith("/captures/")) {
    return {
      name: "detail",
      requestId: decodeURIComponent(pathname.slice("/captures/".length)),
    };
  }

  return { name: "home" };
}

function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function statusText(ok: boolean, status: number, copy: (typeof COPY)[Language]): string {
  return ok ? `${copy.success} · ${status}` : `${copy.error} · ${status}`;
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

function JsonPanel({
  title,
  value,
  showFullJsonText,
}: {
  title: string;
  value: unknown;
  showFullJsonText: string;
}) {
  const text = JSON.stringify(value, null, 2);
  const shouldCollapse = text.length > COLLAPSE_THRESHOLD;

  return (
    <section className="panel">
      <SectionHeader title={title} />
      {shouldCollapse ? (
        <details className="collapsible-panel">
          <summary>{showFullJsonText}</summary>
          <pre>{text}</pre>
        </details>
      ) : (
        <pre>{text}</pre>
      )}
    </section>
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
            <span className="pill">{block.label ?? block.type}</span>
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
          <span className="pill">{block.label ?? block.type}</span>
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

function HumanReadablePrompt({
  system,
  messages,
  copy,
}: {
  system: unknown;
  messages: unknown;
  copy: (typeof COPY)[Language];
}) {
  const systemBlocks = extractSystemBlocks(system);
  const messageItems = extractMessageItems(messages);
  const [activeTab, setActiveTab] = useState<"system" | "messages">(
    systemBlocks.length > 0 ? "system" : "messages",
  );

  return (
    <section className="panel readable-panel">
      <SectionHeader title={copy.readablePrompt} description={copy.readablePromptDesc} />

      {systemBlocks.length > 0 || messageItems.length > 0 ? (
        <div className="tab-strip" role="tablist" aria-label={copy.readablePrompt}>
          {systemBlocks.length > 0 ? (
            <button
              aria-selected={activeTab === "system"}
              className={activeTab === "system" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("system")}
              role="tab"
              type="button"
            >
              {copy.system}
            </button>
          ) : null}
          {messageItems.length > 0 ? (
            <button
              aria-selected={activeTab === "messages"}
              className={activeTab === "messages" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("messages")}
              role="tab"
              type="button"
            >
              {copy.messages}
            </button>
          ) : null}
        </div>
      ) : null}

      {systemBlocks.length > 0 && activeTab === "system" ? (
        <div className="message-section">
          <div className="conversation-card system">
            {systemBlocks.map((block) => (
              <TextBlock
                block={block}
                closeText={copy.close}
                key={block.id}
                showFullBlockText={copy.showFullBlock}
              />
            ))}
          </div>
        </div>
      ) : null}

      {messageItems.length > 0 && activeTab === "messages" ? (
        <div className="message-section">
          <div className="conversation-list">
            {messageItems.map((message) => (
              <article className="conversation-card" key={message.id}>
                <header className="conversation-header">
                  <span className="role-badge">{message.role}</span>
                  <span className="hint">
                    {message.blocks.length} {copy.blocks}
                  </span>
                </header>
                {message.blocks.length > 0 ? (
                  message.blocks.map((block) => (
                    <TextBlock
                      block={block}
                      closeText={copy.close}
                      key={block.id}
                      showFullBlockText={copy.showFullBlock}
                    />
                  ))
                ) : (
                  <div className="empty-state">{copy.noReadableBlocks}</div>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {systemBlocks.length === 0 && messageItems.length === 0 ? (
        <div className="empty-state">{copy.noReadablePrompt}</div>
      ) : null}
    </section>
  );
}

function PromptPreview({
  value,
  showFullPreviewText,
}: {
  value: string;
  showFullPreviewText: string;
}) {
  const normalized = normalizeText(value || "(empty)");
  const shouldCollapse = normalized.length > COLLAPSE_THRESHOLD;

  return shouldCollapse ? (
    <details className="collapsible-panel">
      <summary>{showFullPreviewText}</summary>
      <pre className="preview-pre collapsed">{normalized}</pre>
    </details>
  ) : (
    <pre>{normalized}</pre>
  );
}

function CaptureTable({
  captures,
  language,
  copy,
}: {
  captures: CaptureListItem[];
  language: Language;
  copy: (typeof COPY)[Language];
}) {
  return (
    <div className="capture-table">
      <div className="capture-table-head" aria-hidden="true">
        <span>{copy.tableStatus}</span>
        <span>{copy.tableModel}</span>
        <span>{copy.tableCaptured}</span>
        <span>{copy.tableDuration}</span>
        <span>{copy.tablePreview}</span>
      </div>

      {captures.map((capture) => (
        <button
          className="capture-row"
          key={capture.requestId}
          onClick={() => navigate(`/captures/${capture.requestId}`)}
          type="button"
        >
          <span className={capture.ok ? "status ok" : "status error"}>
            {capture.ok ? copy.success : copy.error}
          </span>
          <span className="capture-model">{capture.model ?? copy.unknownModel}</span>
          <span>{formatDate(capture.capturedAt, language)}</span>
          <span>{capture.durationMs} ms</span>
          <span className="capture-preview">
            {formatPreview(capture.promptTextPreview, copy.noPreview)}
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
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [capturesLoading, setCapturesLoading] = useState(true);
  const [capturesError, setCapturesError] = useState<string | null>(null);
  const [selectedCapture, setSelectedCapture] = useState<CaptureRecord | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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

    async function loadCaptures() {
      setCapturesLoading(true);
      setCapturesError(null);

      try {
        const response = await fetch("/api/captures");
        if (!response.ok) {
          throw new Error(`Failed to load captures (${response.status})`);
        }

        const payload = (await response.json()) as { captures: CaptureListItem[] };
        if (!cancelled) {
          setCaptures(payload.captures);
        }
      } catch (error) {
        if (!cancelled) {
          setCapturesError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setCapturesLoading(false);
        }
      }
    }

    void loadCaptures();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (route.name !== "detail") {
      setSelectedCapture(null);
      setSelectedError(null);
      setSelectedLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCapture(requestId: string) {
      setSelectedLoading(true);
      setSelectedError(null);

      try {
        const response = await fetch(`/api/captures/${encodeURIComponent(requestId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load capture (${response.status})`);
        }

        const payload = (await response.json()) as CaptureRecord;
        if (!cancelled) {
          setSelectedCapture(payload);
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

    void loadCapture(route.requestId);
    return () => {
      cancelled = true;
    };
  }, [route]);

  const stats = useMemo(() => {
    const successCount = captures.filter((item) => item.ok).length;
    const streamCount = captures.filter((item) => item.stream).length;

    return {
      total: captures.length,
      successCount,
      streamCount,
    };
  }, [captures]);

  const filteredCaptures = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return captures;
    }

    return captures.filter((capture) => {
      const haystack = [
        capture.model ?? "",
        capture.sessionId ?? "",
        capture.promptTextPreview,
        capture.ok ? copy.success : copy.error,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [captures, copy.error, copy.success, query]);

  const controls = (
    <div className="topbar-controls">
      <div className="segmented-control">
        <button
          className={language === "en" ? "segment active" : "segment"}
          onClick={() => setLanguage("en")}
          type="button"
        >
          {copy.languageEn}
        </button>
        <button
          className={language === "zh" ? "segment active" : "segment"}
          onClick={() => setLanguage("zh")}
          type="button"
        >
          {copy.languageZh}
        </button>
      </div>
      <div className="segmented-control">
        <button
          className={theme === "light" ? "segment active" : "segment"}
          onClick={() => setTheme("light")}
          type="button"
        >
          {copy.themeLight}
        </button>
        <button
          className={theme === "dark" ? "segment active" : "segment"}
          onClick={() => setTheme("dark")}
          type="button"
        >
          {copy.themeDark}
        </button>
      </div>
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
    const facts = selectedCapture
      ? [
          { label: copy.requestCaptured, value: formatDate(selectedCapture.capturedAt, language) },
          { label: copy.requestModel, value: selectedCapture.derived.model ?? copy.unknownModel },
          { label: copy.requestSession, value: selectedCapture.sessionId ?? copy.missing },
          { label: copy.requestRoute, value: `${selectedCapture.method} ${selectedCapture.path}` },
          {
            label: copy.requestResponse,
            value: statusText(selectedCapture.response.ok, selectedCapture.response.status, copy),
          },
          { label: copy.requestDuration, value: `${selectedCapture.response.durationMs} ms` },
          {
            label: copy.requestStreaming,
            value: selectedCapture.derived.stream ? copy.enabled : copy.disabled,
          },
          {
            label: copy.requestMaxTokens,
            value:
              selectedCapture.derived.maxTokens === null
                ? copy.missing
                : String(selectedCapture.derived.maxTokens),
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
              <button className="ghost-button" onClick={() => navigate("/")} type="button">
                {copy.backToCaptures}
              </button>
            </>
          }
        />

        <section className="hero-simple">
          <div>
            <p className="eyebrow">{copy.detailEyebrow}</p>
            <h1>{copy.detailTitle}</h1>
            <p className="hero-text">{copy.detailText}</p>
          </div>
        </section>

        {selectedLoading ? <div className="empty-state">{copy.loadingDetails}</div> : null}
        {selectedError ? (
          <div className="empty-state error" role="alert">
            {selectedError}
          </div>
        ) : null}

        {selectedCapture ? (
          <main className="detail-shell">
            <section className="detail-main">
              <section className="panel highlight-panel">
                <SectionHeader
                  title={copy.promptPreview}
                  description={copy.promptPreviewDesc}
                  action={
                    <span className={selectedCapture.response.ok ? "status ok" : "status error"}>
                      {statusText(
                        selectedCapture.response.ok,
                        selectedCapture.response.status,
                        copy,
                      )}
                    </span>
                  }
                />
                <PromptPreview
                  showFullPreviewText={copy.showFullPreview}
                  value={selectedCapture.derived.promptTextPreview || "(empty)"}
                />
              </section>

              <HumanReadablePrompt
                copy={copy}
                messages={selectedCapture.derived.messages}
                system={selectedCapture.derived.system}
              />
            </section>

            <aside className="detail-sidebar">
              <section className="panel">
                <SectionHeader title={copy.requestFacts} description={copy.requestFactsDesc} />
                <KeyValueList items={facts} />
              </section>

              <JsonPanel
                showFullJsonText={copy.showFullJson}
                title={copy.headers}
                value={selectedCapture.requestHeaders.redacted}
              />
              <JsonPanel
                showFullJsonText={copy.showFullJson}
                title={copy.rawRequest}
                value={selectedCapture.requestBody.raw}
              />
              <JsonPanel
                showFullJsonText={copy.showFullJson}
                title={copy.systemJson}
                value={selectedCapture.derived.system}
              />
              <JsonPanel
                showFullJsonText={copy.showFullJson}
                title={copy.messagesJson}
                value={selectedCapture.derived.messages}
              />
            </aside>
          </main>
        ) : null}
        {backToTopButton}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar action={controls} subtitle={copy.appSubtitle} title={copy.appTitle} />

      <section className="hero-simple">
        <div>
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h1>{copy.heroTitle}</h1>
          {copy.heroText ? <p className="hero-text">{copy.heroText}</p> : null}
        </div>
      </section>

      <section className="summary-grid">
        <SummaryCard label={copy.captures} value={String(stats.total)} />
        <SummaryCard label={copy.successful} value={String(stats.successCount)} />
        <SummaryCard label={copy.streaming} value={String(stats.streamCount)} />
      </section>

      <main className="list-layout">
        <section className="panel">
          <SectionHeader
            action={
              <span className="hint">
                {filteredCaptures.length} {copy.shown}
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
          </div>

          {capturesLoading ? <div className="empty-state">{copy.loadingHistory}</div> : null}
          {capturesError ? (
            <div className="empty-state error" role="alert">
              {capturesError}
            </div>
          ) : null}

          {!capturesLoading && !capturesError && filteredCaptures.length === 0 ? (
            <div className="empty-state">
              {captures.length === 0 ? copy.noCaptures : copy.noSearchResults}
            </div>
          ) : null}

          {!capturesLoading && !capturesError && filteredCaptures.length > 0 ? (
            <CaptureTable captures={filteredCaptures} copy={copy} language={language} />
          ) : null}
        </section>
      </main>
      {backToTopButton}
    </div>
  );
}

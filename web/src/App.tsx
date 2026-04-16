import { useEffect, useMemo, useState } from "react";

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

const COLLAPSE_THRESHOLD = 600;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPreview(value: string): string {
  const trimmed = normalizeText(value).trim();
  if (!trimmed) {
    return "No prompt preview available for this request.";
  }

  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}

function normalizeText(value: string): string {
  return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const shouldCollapse = text.length > COLLAPSE_THRESHOLD;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{title}</h3>
      </div>
      {shouldCollapse ? (
        <details className="collapsible-panel">
          <summary>展开完整内容</summary>
          <pre>{text}</pre>
        </details>
      ) : (
        <pre>{text}</pre>
      )}
    </section>
  );
}

function TextBlock({ block }: { block: MessageBlock }) {
  const shouldCollapse = block.text.length > COLLAPSE_THRESHOLD;

  return (
    <article className="text-block">
      <div className="text-block-meta">
        <span className="pill">{block.label ?? block.type}</span>
        {block.label && block.type !== "text" ? <span className="hint">{block.type}</span> : null}
      </div>
      {shouldCollapse ? (
        <details className="collapsible-panel" open={false}>
          <summary>展开完整内容</summary>
          <pre className="preview-pre collapsed">{block.text}</pre>
        </details>
      ) : (
        <pre>{block.text}</pre>
      )}
    </article>
  );
}

function HumanReadablePrompt({ system, messages }: { system: unknown; messages: unknown }) {
  const systemBlocks = extractSystemBlocks(system);
  const messageItems = extractMessageItems(messages);

  return (
    <section className="panel readable-panel">
      <div className="panel-heading">
        <h2>🗂️ Readable prompt</h2>
        <span className="hint">Rendered from the original Claude request structure</span>
      </div>

      {systemBlocks.length > 0 ? (
        <div className="message-section">
          <div className="section-label">System</div>
          <div className="conversation-card system">
            {systemBlocks.map((block) => (
              <TextBlock block={block} key={block.id} />
            ))}
          </div>
        </div>
      ) : null}

      {messageItems.length > 0 ? (
        <div className="message-section">
          <div className="section-label">Messages</div>
          <div className="conversation-list">
            {messageItems.map((message) => (
              <article className={`conversation-card ${message.role}`} key={message.id}>
                <header className="conversation-header">
                  <span className="role-badge">{message.role}</span>
                  <span className="hint">{message.blocks.length} block(s)</span>
                </header>
                {message.blocks.length > 0 ? (
                  message.blocks.map((block) => <TextBlock block={block} key={block.id} />)
                ) : (
                  <div className="empty-state">No readable blocks found in this message.</div>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {systemBlocks.length === 0 && messageItems.length === 0 ? (
        <div className="empty-state">No readable prompt content was found in this capture.</div>
      ) : null}
    </section>
  );
}

function PromptPreview({ value }: { value: string }) {
  const normalized = normalizeText(value || "(empty)");
  const shouldCollapse = normalized.length > COLLAPSE_THRESHOLD;

  if (!shouldCollapse) {
    return <pre>{normalized}</pre>;
  }

  return (
    <details className="collapsible-panel">
      <summary>展开完整 preview</summary>
      <pre className="preview-pre collapsed">{normalized}</pre>
    </details>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [capturesLoading, setCapturesLoading] = useState(true);
  const [capturesError, setCapturesError] = useState<string | null>(null);
  const [selectedCapture, setSelectedCapture] = useState<CaptureRecord | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  if (route.name === "detail") {
    return (
      <div className="app-shell">
        <header className="hero">
          <button className="ghost-button" onClick={() => navigate("/")} type="button">
            ← Back to captures
          </button>
          <div className="hero-copy">
            <p className="eyebrow">🔎 Prompt detail</p>
            <h1>Inspect the full Claude Code request</h1>
            <p className="hero-text">
              Opened from your local prompt history. Everything here is loaded from the gateway's
              JSON capture store.
            </p>
          </div>
        </header>

        {selectedLoading ? <div className="empty-state">⏳ Loading prompt details…</div> : null}
        {selectedError ? <div className="empty-state error">⚠️ {selectedError}</div> : null}

        {selectedCapture ? (
          <main className="detail-layout">
            <section className="summary-grid">
              <SummaryCard label="Captured at" value={formatDate(selectedCapture.capturedAt)} />
              <SummaryCard label="Model" value={selectedCapture.derived.model ?? "Unknown model"} />
              <SummaryCard
                label="Response"
                value={`${selectedCapture.response.status} · ${selectedCapture.response.ok ? "OK" : "Error"}`}
              />
              <SummaryCard label="Duration" value={`${selectedCapture.response.durationMs} ms`} />
            </section>

            <section className="panel highlight-panel">
              <div className="panel-heading">
                <h2>✨ Prompt preview</h2>
                <span className={selectedCapture.response.ok ? "status ok" : "status error"}>
                  {selectedCapture.response.ok ? "Successful" : "Needs attention"}
                </span>
              </div>
              <PromptPreview value={selectedCapture.derived.promptTextPreview || "(empty)"} />
            </section>

            <HumanReadablePrompt
              messages={selectedCapture.derived.messages}
              system={selectedCapture.derived.system}
            />

            <section className="panel-grid">
              <JsonPanel title="Headers" value={selectedCapture.requestHeaders.redacted} />
              <JsonPanel title="Raw request" value={selectedCapture.requestBody.raw} />
              <JsonPanel title="System JSON" value={selectedCapture.derived.system} />
              <JsonPanel title="Messages JSON" value={selectedCapture.derived.messages} />
            </section>
          </main>
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">🚀 Prompt Gateway</p>
          <h1>Claude Code is running through your local proxy</h1>
          <p className="hero-text">
            Every outbound prompt is captured locally, indexed by time, and ready to inspect without
            opening exported HTML files by hand.
          </p>
        </div>

        <section className="hero-summary">
          <SummaryCard label="Captures" value={String(stats.total)} />
          <SummaryCard label="Successful" value={String(stats.successCount)} />
          <SummaryCard label="Streaming" value={String(stats.streamCount)} />
        </section>
      </header>

      <main className="list-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>📝 Recent prompt captures</h2>
            <span className="hint">Newest first</span>
          </div>

          {capturesLoading ? <div className="empty-state">⏳ Loading capture history…</div> : null}
          {capturesError ? <div className="empty-state error">⚠️ {capturesError}</div> : null}

          {!capturesLoading && !capturesError && captures.length === 0 ? (
            <div className="empty-state">
              🌱 No prompts captured yet. Start Claude Code through the gateway and this list will
              fill in automatically.
            </div>
          ) : null}

          <div className="capture-list">
            {captures.map((capture) => (
              <button
                className="capture-card"
                key={capture.requestId}
                onClick={() => navigate(`/captures/${capture.requestId}`)}
                type="button"
              >
                <div className="capture-meta">
                  <span className={capture.ok ? "status ok" : "status error"}>
                    {capture.ok ? "✅ OK" : "⚠️ Error"}
                  </span>
                  <span>{formatDate(capture.capturedAt)}</span>
                  <span>{capture.durationMs} ms</span>
                </div>
                <h3>{capture.model ?? "Unknown model"}</h3>
                <p>{formatPreview(capture.promptTextPreview)}</p>
                <div className="capture-footer">
                  <span>Session: {capture.sessionId ?? "missing"}</span>
                  <span>{capture.stream ? "🌊 Streaming" : "📦 Standard"}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

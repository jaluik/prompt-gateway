import type { PromptCaptureRecord, RenderPromptHtmlOptions } from "./types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function renderSection(title: string, body: string): string {
  return `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function renderPromptCaptureHtml(
  record: PromptCaptureRecord,
  options: RenderPromptHtmlOptions = {},
): string {
  const title = options.title ?? "Claude Code Prompt Capture";
  const summaryRows = [
    ["Captured At", record.capturedAt],
    ["Session ID", record.sessionId ?? "(missing)"],
    ["Request Path", record.path],
    ["Method", record.method],
    ["Model", record.derived.model ?? "(missing)"],
    [
      "Max Tokens",
      record.derived.maxTokens === null ? "(missing)" : String(record.derived.maxTokens),
    ],
    ["Stream", String(record.derived.stream)],
    ["Response Status", String(record.response.status)],
    ["Duration", `${record.response.durationMs}ms`],
  ]
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const systemBody = `<pre>${renderJson(record.derived.system)}</pre>`;
  const messagesBody = `<pre>${renderJson(record.derived.messages)}</pre>`;
  const headersBody = `<pre>${renderJson(record.requestHeaders.redacted)}</pre>`;
  const previewBody = `<pre>${escapeHtml(record.derived.promptTextPreview || "(empty)")}</pre>`;
  const rawBody = `<details open><summary>Show raw JSON</summary><pre>${renderJson(record.requestBody.raw)}</pre></details>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe7;
        --panel: #fffaf2;
        --ink: #1f1d1a;
        --muted: #6c6257;
        --border: #dbcdb8;
        --accent: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 30%),
          linear-gradient(180deg, #f7f2e8 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main { max-width: 1120px; margin: 0 auto; }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3.4rem);
        letter-spacing: -0.04em;
      }
      p.lead {
        margin: 0 0 24px;
        color: var(--muted);
        font-size: 1.05rem;
      }
      .grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .card {
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(255, 250, 242, 0.92);
        box-shadow: 0 10px 30px rgba(93, 72, 47, 0.08);
      }
      h2 {
        margin: 0 0 14px;
        font-size: 1.2rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 10px 0;
        border-bottom: 1px solid rgba(219, 205, 184, 0.7);
        vertical-align: top;
      }
      th {
        width: 34%;
        text-align: left;
        color: var(--muted);
        font-weight: 600;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 0.92rem;
        line-height: 1.55;
      }
      details summary {
        cursor: pointer;
        color: var(--accent);
        margin-bottom: 12px;
      }
      @media (max-width: 720px) {
        body { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">Captured Claude Code outbound payload with request metadata and rendered prompt details.</p>
      <div class="grid">
        ${renderSection("Summary", `<table>${summaryRows}</table>`)}
        ${renderSection("Prompt Preview", previewBody)}
        ${renderSection("System", systemBody)}
        ${renderSection("Messages", messagesBody)}
        ${renderSection("Headers", headersBody)}
        ${renderSection("Raw Request", rawBody)}
      </div>
    </main>
  </body>
</html>`;
}

export function renderWebAppFallbackHtml(title = "Prompt Gateway"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f6f1e8;
        --card: rgba(255, 250, 242, 0.96);
        --ink: #1f1b16;
        --muted: #6a6157;
        --line: rgba(140, 112, 78, 0.24);
        --accent: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 28%),
          linear-gradient(180deg, #fbf7f1 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        max-width: 760px;
        padding: 28px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: var(--card);
        box-shadow: 0 16px 48px rgba(74, 58, 42, 0.1);
      }
      h1 {
        margin: 0 0 10px;
        font-size: clamp(2rem, 5vw, 3.2rem);
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }
      code {
        font-family: "SFMono-Regular", "Menlo", monospace;
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Prompt Gateway is almost ready</h1>
      <p>
        The proxy is running, but the compiled web assets are missing. Run <code>pnpm build</code>
        to bundle the React UI, then refresh this page.
      </p>
    </main>
  </body>
</html>`;
}

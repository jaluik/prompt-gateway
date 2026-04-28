import { BotMessageSquare, Clipboard, FileJson } from "lucide-react";

import { Badge, Button, EmptyState } from "../../components/ui";
import { formatCompactNumber } from "../../lib/format";
import { analyzeResponseBody } from "../../lib/responseAnalysis";
import type { RequestAnalysis } from "../../types";

export function ResponseView({ analysis }: { analysis: RequestAnalysis }) {
  const response = analysis.capture.response;
  const body = response.body?.raw ?? null;
  const bodyAnalysis = analyzeResponseBody(body);
  const responseText = bodyAnalysis.text;
  const rawText = bodyAnalysis.rawText;

  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <BotMessageSquare aria-hidden="true" />
          模型响应
        </h3>
        <span className="small-note">状态、耗时和返回 body</span>
      </div>

      <div className="response-toolbar">
        <div className="badge-row">
          <Badge
            label={`${response.status} ${response.ok ? "ok" : "error"}`}
            tone={response.ok ? "teal" : "rose"}
          />
          <Badge label={`${response.durationMs}ms`} tone="blue" />
          <Badge label={bodyAnalysis.format} />
          <Badge label={`${formatCompactNumber(bodyAnalysis.size)} chars`} />
        </div>
        <Button
          disabled={!responseText}
          icon={Clipboard}
          onClick={() => void navigator.clipboard?.writeText(responseText)}
        >
          复制文本
        </Button>
        <Button icon={FileJson} onClick={() => void navigator.clipboard?.writeText(rawText)}>
          复制原始响应
        </Button>
      </div>

      {response.error ? <EmptyState tone="error">{response.error}</EmptyState> : null}

      {responseText ? (
        <article className="response-card">
          <div className="response-card-header">
            <strong>Assistant Text</strong>
            <span>{bodyAnalysis.blocks.length} text block(s)</span>
          </div>
          <pre className="response-text">{responseText}</pre>
        </article>
      ) : (
        <EmptyState>当前响应没有可提取的文本内容，下面保留原始 response body。</EmptyState>
      )}

      <details className="response-raw" open={!responseText}>
        <summary>Raw response body</summary>
        <pre className="raw-json">{rawText || "(empty)"}</pre>
      </details>
    </section>
  );
}

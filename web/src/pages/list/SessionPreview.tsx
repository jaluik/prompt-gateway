import { Copy, PanelRight, PanelRightOpen, Terminal } from "lucide-react";

import { Badge, Button, EmptyState, IconButton, Sparkline } from "../../components/ui";
import { MISSING } from "../../lib/constants";
import { formatDate } from "../../lib/format";
import { encodeSessionRouteId, navigate } from "../../lib/routing";
import type { SessionAnalytics, SessionListItem } from "../../types";

export function SessionPreview({
  session,
  analytics,
}: {
  session: SessionListItem | null;
  analytics: SessionAnalytics | null;
}) {
  if (!session) {
    return (
      <aside className="panel preview-panel">
        <div className="panel-body">
          <EmptyState>选择一个 session 后查看摘要。</EmptyState>
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel preview-panel">
      <div className="panel-head">
        <div className="panel-title">
          <PanelRight aria-hidden="true" />
          Session 预览
        </div>
        <IconButton
          label="复制 sessionId"
          icon={Copy}
          onClick={() =>
            void navigator.clipboard?.writeText(session.sessionId ?? "missing-session")
          }
        />
      </div>
      <div className="panel-body">
        <div className="preview-title">
          <div className="session-dot">
            <Terminal aria-hidden="true" />
          </div>
          <div>
            <div className="session-id full">{session.sessionId ?? "missing-session"}</div>
            <div className="muted">
              最后更新 {formatDate(analytics?.endAt ?? session.latestCapturedAt)}
            </div>
          </div>
        </div>

        <div className="preview-block">
          <div className="block-label">摘要</div>
          <div className="kv-list">
            <PreviewKv label="Requests" value={String(session.requestCount)} />
            <PreviewKv
              label="Tools"
              value={analytics ? `${analytics.latestToolCount} definitions` : "loading"}
            />
            <PreviewKv
              label="Model"
              value={analytics?.modelList.join(", ") || session.models.join(", ") || MISSING}
            />
            <PreviewKv
              label="Largest layer"
              value={analytics?.analyses[analytics.analyses.length - 1]?.largestLayer ?? MISSING}
            />
          </div>
        </div>

        <PromptBlock
          label="首次用户输入"
          text={analytics?.firstPrompt ?? session.promptTextPreview ?? MISSING}
        />
        <PromptBlock
          strong
          label="最后用户输入"
          text={analytics?.latestPrompt ?? session.promptTextPreview ?? MISSING}
        />

        <div className="preview-block">
          <div className="block-label">上下文增长</div>
          <Sparkline values={analytics?.trend ?? []} />
        </div>

        <div className="preview-block">
          <div className="block-label">最近请求</div>
          <div className="request-list">
            {(analytics?.recentRequests ?? []).map((analysis) => (
              <button
                className="request-list-item"
                key={analysis.capture.requestId}
                onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
                type="button"
              >
                <span className="request-index">{analysis.index + 1}</span>
                <span className="truncate">
                  {analysis.trigger.preview || analysis.capture.derived.promptTextPreview}
                </span>
                <Badge
                  label={analysis.trigger.label}
                  tone={
                    analysis.trigger.kind === "tool_result"
                      ? "amber"
                      : analysis.trigger.kind === "user_input"
                        ? "blue"
                        : undefined
                  }
                />
              </button>
            ))}
            {!analytics ? <div className="muted">正在计算...</div> : null}
          </div>
        </div>

        <Button
          icon={PanelRightOpen}
          onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
          tone="primary"
        >
          查看详情
        </Button>
      </div>
    </aside>
  );
}

function PreviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PromptBlock({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div className="preview-block">
      <div className="block-label">{label}</div>
      <p className={strong ? "preview-text strong" : "preview-text"}>{text}</p>
    </div>
  );
}

import { ArrowRight, RefreshCw, Search, Terminal } from "lucide-react";

import { Badge, EmptyState, IconButton, LoadingPanel, MiniBar } from "../../components/ui";
import { MISSING } from "../../lib/constants";
import {
  badgeToneForLabel,
  compactSessionId,
  formatCompactNumber,
  formatDate,
} from "../../lib/format";
import { encodeSessionRouteId, navigate, sessionKey } from "../../lib/routing";
import type { SessionAnalytics, SessionListItem } from "../../types";

type Props = {
  sessions: SessionListItem[];
  filteredSessions: SessionListItem[];
  details: Record<string, SessionAnalytics>;
  selectedKey: string | null;
  maxContext: number;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectKey: (value: string) => void;
};

export function SessionTable({
  sessions,
  filteredSessions,
  details,
  selectedKey,
  maxContext,
  loading,
  error,
  query,
  onQueryChange,
  onSelectKey,
}: Props) {
  return (
    <section className="panel table-panel">
      <div className="filter-bar">
        <label className="field search-field">
          <Search aria-hidden="true" />
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="sessionId / requestId / 用户输入 / 工具名"
            type="search"
            value={query}
          />
        </label>
        <div className="result-count">{filteredSessions.length} shown</div>
        <IconButton label="刷新列表" icon={RefreshCw} onClick={() => window.location.reload()} />
      </div>

      {loading ? <LoadingPanel>正在加载 session 列表...</LoadingPanel> : null}
      {error ? <EmptyState tone="error">{error}</EmptyState> : null}
      {!loading && !error && filteredSessions.length === 0 ? (
        <EmptyState>
          {sessions.length === 0 ? "暂无捕获的 session" : "没有匹配当前筛选条件的 session"}
        </EmptyState>
      ) : null}

      {!loading && !error && filteredSessions.length > 0 ? (
        <div className="table-scroll">
          <table className="session-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Time Range</th>
                <th>Requests</th>
                <th>Models</th>
                <th>Context Size</th>
                <th>Tools</th>
                <th>Changes</th>
                <th>Last Prompt</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => (
                <SessionRow
                  analytics={details[sessionKey(session.sessionId)]}
                  isSelected={selectedKey === sessionKey(session.sessionId)}
                  key={sessionKey(session.sessionId)}
                  maxContext={maxContext}
                  onSelectKey={onSelectKey}
                  session={session}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function SessionRow({
  session,
  analytics,
  isSelected,
  maxContext,
  onSelectKey,
}: {
  session: SessionListItem;
  analytics: SessionAnalytics | undefined;
  isSelected: boolean;
  maxContext: number;
  onSelectKey: (value: string) => void;
}) {
  const key = sessionKey(session.sessionId);
  const latestContextSize = analytics?.latestContextSize ?? session.latestContextSize;
  const latestToolCount = analytics?.latestToolCount ?? session.latestToolCount;
  const hasToolCalls = analytics?.hasToolCalls ?? session.hasToolCalls;

  return (
    <tr
      className={isSelected ? "selected" : undefined}
      onClick={() => navigate(`/sessions/${encodeSessionRouteId(session.sessionId)}`)}
      onFocus={() => onSelectKey(key)}
      onMouseEnter={() => onSelectKey(key)}
    >
      <td>
        <div className="session-name">
          <div className="session-dot">
            <Terminal aria-hidden="true" />
          </div>
          <div>
            <div className="session-id">{compactSessionId(session.sessionId)}</div>
            <div className="session-desc">
              {analytics?.firstPrompt ?? session.firstPromptTextPreview ?? MISSING}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="mono">{formatDate(analytics?.startAt ?? session.firstCapturedAt)}</div>
        <div className="muted">至 {formatDate(analytics?.endAt ?? session.latestCapturedAt)}</div>
      </td>
      <td className="strong-number">{session.requestCount}</td>
      <td>
        <div className="badge-row">
          {(analytics?.modelList.length ? analytics.modelList : session.models)
            .slice(0, 2)
            .map((model) => (
              <Badge key={model} label={model} tone="blue" />
            ))}
          {(analytics?.modelList.length ?? session.models.length) === 0 ? (
            <Badge label={MISSING} />
          ) : null}
        </div>
      </td>
      <td>
        <div className="density">
          <MiniBar value={latestContextSize} max={maxContext} />
          <div className="density-caption">
            <span>{formatCompactNumber(latestContextSize)}</span>
            <span>estimated</span>
          </div>
        </div>
      </td>
      <td>
        <div className="badge-row">
          <Badge label={`${latestToolCount} tools`} tone="amber" />
          {hasToolCalls ? <Badge label="tool_use" tone="teal" /> : null}
        </div>
      </td>
      <td>
        <div className="badge-row">
          {(analytics?.latestDiffBadges ?? ["loading"]).slice(0, 2).map((badge) => (
            <Badge key={badge} label={badge} tone={badgeToneForLabel(badge)} />
          ))}
        </div>
      </td>
      <td>
        <div className="last-prompt">
          <span>{analytics?.latestPrompt ?? session.promptTextPreview ?? MISSING}</span>
          <span aria-hidden="true" className="row-open">
            <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </td>
    </tr>
  );
}

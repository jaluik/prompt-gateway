import { CalendarDays, Database } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AppTopbar } from "../../components/AppTopbar";
import { Button } from "../../components/ui";
import { sessionKey } from "../../lib/routing";
import type { SessionAnalytics, SessionListItem, SortMode, TimeFilter } from "../../types";
import { ListFilters } from "./ListFilters";
import { ListMetrics } from "./ListMetrics";
import { SessionPreview } from "./SessionPreview";
import { SessionTable } from "./SessionTable";

export function ListPage({
  sessions,
  details,
  loading,
  error,
  query,
  onQueryChange,
}: {
  sessions: SessionListItem[];
  details: Record<string, SessionAnalytics>;
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [toolFilter, setToolFilter] = useState("all");
  const [contextFilter, setContextFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const modelOptions = useMemo(
    () => Array.from(new Set(sessions.flatMap((session) => session.models))).sort(),
    [sessions],
  );

  const filteredSessions = useMemo(
    () =>
      filterSessions({
        sessions,
        details,
        query: deferredQuery,
        timeFilter,
        modelFilter,
        toolFilter,
        contextFilter,
        sortMode,
      }),
    [
      contextFilter,
      deferredQuery,
      details,
      modelFilter,
      sessions,
      sortMode,
      timeFilter,
      toolFilter,
    ],
  );

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (
      !selectedKey ||
      !filteredSessions.some((session) => sessionKey(session.sessionId) === selectedKey)
    ) {
      setSelectedKey(sessionKey(filteredSessions[0].sessionId));
    }
  }, [filteredSessions, selectedKey]);

  const selectedSession =
    filteredSessions.find((session) => sessionKey(session.sessionId) === selectedKey) ??
    filteredSessions[0] ??
    null;
  const selectedAnalytics = selectedSession ? details[sessionKey(selectedSession.sessionId)] : null;
  const totals = useMemo(() => buildTotals(sessions, details), [details, sessions]);

  return (
    <>
      <AppTopbar onQueryChange={onQueryChange} query={query} routeLabel="/sessions" />
      <main className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">
              <Database aria-hidden="true" />
              捕获会话
            </div>
            <h1 className="title">Session 列表页</h1>
            <p className="subtitle">
              从 session 维度浏览 Claude Code CLI
              的请求轨迹，优先暴露请求数量、上下文规模、模型、工具数量和最近用户输入。
            </p>
          </div>
          <div className="button-row">
            <Button icon={CalendarDays} onClick={() => setTimeFilter("24h")}>
              最近 24 小时
            </Button>
          </div>
        </div>

        <ListMetrics
          maxContext={totals.maxContext}
          requestCount={totals.requestCount}
          sessionCount={sessions.length}
          toolHeavy={totals.toolHeavy}
        />

        <div className="list-workbench">
          <ListFilters
            contextFilter={contextFilter}
            modelFilter={modelFilter}
            modelOptions={modelOptions}
            onContextFilterChange={setContextFilter}
            onModelFilterChange={setModelFilter}
            onReset={() => {
              onQueryChange("");
              setTimeFilter("all");
              setModelFilter("all");
              setToolFilter("all");
              setContextFilter("all");
              setSortMode("latest");
            }}
            onSortModeChange={setSortMode}
            onTimeFilterChange={setTimeFilter}
            onToolFilterChange={setToolFilter}
            sortMode={sortMode}
            timeFilter={timeFilter}
            toolFilter={toolFilter}
          />

          <SessionTable
            details={details}
            error={error}
            filteredSessions={filteredSessions}
            loading={loading}
            maxContext={totals.maxContext}
            onQueryChange={onQueryChange}
            onSelectKey={setSelectedKey}
            query={query}
            selectedKey={selectedKey}
            sessions={sessions}
          />

          <SessionPreview session={selectedSession} analytics={selectedAnalytics} />
        </div>
      </main>
    </>
  );
}

function filterSessions({
  sessions,
  details,
  query,
  timeFilter,
  modelFilter,
  toolFilter,
  contextFilter,
  sortMode,
}: {
  sessions: SessionListItem[];
  details: Record<string, SessionAnalytics>;
  query: string;
  timeFilter: TimeFilter;
  modelFilter: string;
  toolFilter: string;
  contextFilter: string;
  sortMode: SortMode;
}) {
  const trimmedQuery = query.trim().toLowerCase();
  const cutoff =
    timeFilter === "24h"
      ? Date.now() - 86_400_000
      : timeFilter === "7d"
        ? Date.now() - 604_800_000
        : 0;

  return sessions
    .filter((session) => {
      const analytics = details[sessionKey(session.sessionId)];
      const haystack = [
        session.sessionId ?? "",
        session.promptTextPreview,
        session.models.join(" "),
        analytics?.firstPrompt ?? "",
        analytics?.latestPrompt ?? "",
        analytics?.toolNames.join(" ") ?? "",
        analytics?.captures.map((capture) => capture.requestId).join(" ") ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (trimmedQuery && !haystack.includes(trimmedQuery)) {
        return false;
      }

      if (cutoff && session.latestTimestampMs < cutoff) {
        return false;
      }

      if (modelFilter !== "all" && !session.models.includes(modelFilter)) {
        return false;
      }

      if (toolFilter === "with-tools" && (analytics?.maxToolCount ?? 0) === 0) {
        return false;
      }

      if (toolFilter === "with-tool-calls" && !analytics?.hasToolCalls) {
        return false;
      }

      return contextFilter !== "with-context" || !!analytics?.hasContextManagement;
    })
    .sort((left, right) => {
      const leftAnalytics = details[sessionKey(left.sessionId)];
      const rightAnalytics = details[sessionKey(right.sessionId)];
      if (sortMode === "context") {
        return (rightAnalytics?.maxContextSize ?? 0) - (leftAnalytics?.maxContextSize ?? 0);
      }

      if (sortMode === "requests") {
        return right.requestCount - left.requestCount;
      }

      return right.latestTimestampMs - left.latestTimestampMs;
    });
}

function buildTotals(
  sessions: SessionListItem[],
  details: Record<string, SessionAnalytics>,
): { requestCount: number; maxContext: number; toolHeavy: number } {
  const requestCount = sessions.reduce((total, session) => total + session.requestCount, 0);
  const maxContext = Math.max(
    0,
    ...Object.values(details).map((analytics) => analytics.maxContextSize),
  );
  const toolHeavy = Object.values(details).filter(
    (analytics) => analytics.maxToolCount >= 20,
  ).length;
  return { requestCount, maxContext, toolHeavy };
}

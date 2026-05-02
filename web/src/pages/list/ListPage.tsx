import { CalendarDays, Database } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AppTopbar } from "../../components/AppTopbar";
import { Button } from "../../components/ui";
import { useSessionDetails } from "../../hooks/useSessions";
import { sessionKey } from "../../lib/routing";
import type { SessionListItem, SortMode, TimeFilter } from "../../types";
import { ListFilters } from "./ListFilters";
import { ListMetrics } from "./ListMetrics";
import { SessionPreview } from "./SessionPreview";
import { SessionTable } from "./SessionTable";

export function ListPage({
  sessions,
  loading,
  error,
  query,
  onQueryChange,
}: {
  sessions: SessionListItem[];
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
        query: deferredQuery,
        timeFilter,
        modelFilter,
        toolFilter,
        contextFilter,
        sortMode,
      }),
    [contextFilter, deferredQuery, modelFilter, sessions, sortMode, timeFilter, toolFilter],
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
  const selectedSessions = useMemo(
    () => (selectedSession ? [selectedSession] : []),
    [selectedSession],
  );
  const details = useSessionDetails(selectedSessions);
  const selectedAnalytics = selectedSession ? details[sessionKey(selectedSession.sessionId)] : null;
  const totals = useMemo(() => buildTotals(sessions), [sessions]);

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
  query,
  timeFilter,
  modelFilter,
  toolFilter,
  contextFilter,
  sortMode,
}: {
  sessions: SessionListItem[];
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
      const haystack = [
        session.sessionId ?? "",
        session.latestRequestId,
        session.promptTextPreview,
        session.firstPromptTextPreview,
        session.models.join(" "),
        session.toolNames.join(" "),
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

      if (toolFilter === "with-tools" && session.maxToolCount === 0) {
        return false;
      }

      if (toolFilter === "with-tool-calls" && !session.hasToolCalls) {
        return false;
      }

      return contextFilter !== "with-context" || session.hasContextManagement;
    })
    .sort((left, right) => {
      if (sortMode === "context") {
        return right.maxContextSize - left.maxContextSize;
      }

      if (sortMode === "requests") {
        return right.requestCount - left.requestCount;
      }

      return right.latestTimestampMs - left.latestTimestampMs;
    });
}

function buildTotals(sessions: SessionListItem[]): {
  requestCount: number;
  maxContext: number;
  toolHeavy: number;
} {
  const requestCount = sessions.reduce((total, session) => total + session.requestCount, 0);
  const maxContext = Math.max(0, ...sessions.map((session) => session.maxContextSize));
  const toolHeavy = sessions.filter((session) => session.maxToolCount >= 20).length;
  return { requestCount, maxContext, toolHeavy };
}

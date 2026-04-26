import { useEffect, useMemo, useState } from "react";

import { AppTopbar } from "../../components/AppTopbar";
import { EmptyState, LoadingPanel } from "../../components/ui";
import { useSessionCaptures } from "../../hooks/useSessions";
import { DETAIL_REQUEST_STORAGE_PREFIX } from "../../lib/constants";
import { analyzeCaptures, buildSessionAnalytics } from "../../lib/requestAnalysis";
import { encodeSessionRouteId } from "../../lib/routing";
import type { DetailView, RequestAnalysis } from "../../types";
import { ContextStack } from "./ContextStack";
import { DetailToolbar } from "./DetailToolbar";
import { InspectorPanel } from "./InspectorPanel";
import { buildInspectorItems } from "./inspectorItems";
import { MessagesView } from "./MessagesView";
import { OverviewGrid } from "./OverviewGrid";
import { RawJsonView } from "./RawJsonView";
import { RequestCallout } from "./RequestCallout";
import { SessionSummaryBar } from "./SessionSummaryBar";
import { TimelinePanel } from "./TimelinePanel";
import { ToolsView } from "./ToolsView";

export function DetailPage({
  sessionId,
  globalQuery,
  onGlobalQueryChange,
}: {
  sessionId: string | null;
  globalQuery: string;
  onGlobalQueryChange: (value: string) => void;
}) {
  const { captures, loading, error } = useSessionCaptures(sessionId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeView, setActiveView] = useState<DetailView>("stack");
  const [onlyTools, setOnlyTools] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [rawSearch, setRawSearch] = useState("");
  const [inspectorKey, setInspectorKey] = useState<string | null>("layer:system");
  const analyses = useMemo(() => analyzeCaptures(captures), [captures]);
  const analytics = useMemo(() => buildSessionAnalytics(captures), [captures]);

  useSelectedRequestStorage(sessionId, analyses, selectedIndex, setSelectedIndex);
  useTimelineKeyboard(analyses.length, setSelectedIndex);

  const selectedAnalysis = analyses[selectedIndex] ?? null;
  const filteredTimeline = filterTimeline(analyses, globalQuery, onlyTools, onlyChanged);
  const inspectorItems = useMemo(() => buildInspectorItems(selectedAnalysis), [selectedAnalysis]);
  const inspectorItem =
    (inspectorKey ? inspectorItems.get(inspectorKey) : null) ??
    (selectedAnalysis ? (inspectorItems.get("layer:system") ?? null) : null);

  return (
    <>
      <AppTopbar
        onQueryChange={onGlobalQueryChange}
        query={globalQuery}
        routeLabel={`/sessions/${encodeSessionRouteId(sessionId)}`}
      />
      <main className="page">
        {loading ? <LoadingPanel>正在加载请求详情...</LoadingPanel> : null}
        {error ? <EmptyState tone="error">{error}</EmptyState> : null}
        {selectedAnalysis ? (
          <>
            <SessionSummaryBar
              requestCount={analyses.length}
              selectedAnalysis={selectedAnalysis}
              selectedIndex={selectedIndex}
              sessionId={sessionId}
            />
            <div className="detail-shell">
              <TimelinePanel
                analyses={filteredTimeline}
                onlyChanged={onlyChanged}
                onlyTools={onlyTools}
                onOnlyChangedChange={setOnlyChanged}
                onOnlyToolsChange={setOnlyTools}
                onSelectIndex={(index) => {
                  setSelectedIndex(index);
                  setInspectorKey("layer:system");
                }}
                selectedIndex={selectedIndex}
              />
              <section className="detail-main">
                <OverviewGrid analysis={selectedAnalysis} />
                <DetailToolbar
                  activeView={activeView}
                  analysis={selectedAnalysis}
                  onActiveViewChange={setActiveView}
                />
                <RequestCallout analysis={selectedAnalysis} />
                <ActiveDetailView
                  activeView={activeView}
                  analysis={selectedAnalysis}
                  inspectorKey={inspectorKey}
                  rawSearch={rawSearch}
                  onInspectorKeyChange={setInspectorKey}
                  onRawSearchChange={setRawSearch}
                />
              </section>
              <InspectorPanel
                analytics={analytics}
                item={inspectorItem}
                onOpenRaw={() => setActiveView("raw")}
                onSelect={(key) => {
                  setInspectorKey(key);
                  if (key.startsWith("layer:")) {
                    setActiveView("stack");
                  }
                }}
              />
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function ActiveDetailView({
  activeView,
  analysis,
  inspectorKey,
  rawSearch,
  onInspectorKeyChange,
  onRawSearchChange,
}: {
  activeView: DetailView;
  analysis: RequestAnalysis;
  inspectorKey: string | null;
  rawSearch: string;
  onInspectorKeyChange: (value: string) => void;
  onRawSearchChange: (value: string) => void;
}) {
  if (activeView === "messages") {
    return <MessagesView analysis={analysis} onSelect={onInspectorKeyChange} />;
  }

  if (activeView === "tools") {
    return <ToolsView analysis={analysis} onSelect={onInspectorKeyChange} />;
  }

  if (activeView === "raw") {
    return (
      <RawJsonView
        analysis={analysis}
        rawSearch={rawSearch}
        onRawSearchChange={onRawSearchChange}
        onSelectRaw={() => onInspectorKeyChange("layer:metadata")}
      />
    );
  }

  return (
    <ContextStack
      analysis={analysis}
      inspectorKey={inspectorKey}
      onSelect={(key) => onInspectorKeyChange(`layer:${key}`)}
    />
  );
}

function filterTimeline(
  analyses: RequestAnalysis[],
  globalQuery: string,
  onlyTools: boolean,
  onlyChanged: boolean,
) {
  const timelineQuery = globalQuery.trim().toLowerCase();
  return analyses.filter((analysis) => {
    if (timelineQuery && !timelineHaystack(analysis).includes(timelineQuery)) {
      return false;
    }

    if (onlyTools && analysis.toolCalls.length === 0 && analysis.tools.length === 0) {
      return false;
    }

    return (
      !onlyChanged ||
      analysis.diff.badges.some((badge) => badge !== "unchanged" && badge !== "first request")
    );
  });
}

function timelineHaystack(analysis: RequestAnalysis): string {
  return [
    analysis.capture.requestId,
    analysis.model,
    analysis.latestUserBlock?.text ?? "",
    analysis.trigger.preview,
    analysis.trigger.label,
    analysis.capture.derived.promptTextPreview,
    analysis.tools.map((tool) => tool.name).join(" "),
    analysis.diff.badges.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function useSelectedRequestStorage(
  sessionId: string | null,
  analyses: RequestAnalysis[],
  selectedIndex: number,
  setSelectedIndex: (value: number) => void,
) {
  useEffect(() => {
    if (analyses.length === 0) {
      setSelectedIndex(0);
      return;
    }

    const stored = Number(
      window.localStorage.getItem(
        `${DETAIL_REQUEST_STORAGE_PREFIX}${encodeSessionRouteId(sessionId)}`,
      ),
    );
    setSelectedIndex(
      Number.isInteger(stored) && stored >= 0 && stored < analyses.length
        ? stored
        : analyses.length - 1,
    );
  }, [analyses.length, sessionId, setSelectedIndex]);

  useEffect(() => {
    if (analyses.length === 0) {
      return;
    }

    window.localStorage.setItem(
      `${DETAIL_REQUEST_STORAGE_PREFIX}${encodeSessionRouteId(sessionId)}`,
      String(selectedIndex),
    );
  }, [analyses.length, selectedIndex, sessionId]);
}

function useTimelineKeyboard(
  requestCount: number,
  setSelectedIndex: (updater: (current: number) => number) => void,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(requestCount - 1, current + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestCount, setSelectedIndex]);
}

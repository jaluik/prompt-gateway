import { ArrowLeft, Terminal } from "lucide-react";

import { Badge, Button } from "../../components/ui";
import { formatTime } from "../../lib/format";
import { navigate } from "../../lib/routing";
import type { RequestAnalysis } from "../../types";

export function SessionSummaryBar({
  sessionId,
  selectedAnalysis,
  selectedIndex,
  requestCount,
}: {
  sessionId: string | null;
  selectedAnalysis: RequestAnalysis;
  selectedIndex: number;
  requestCount: number;
}) {
  return (
    <section className="session-summary-bar">
      <Button icon={ArrowLeft} onClick={() => navigate("/")}>
        返回列表
      </Button>
      <div className="summary-title">
        <div className="session-dot">
          <Terminal aria-hidden="true" />
        </div>
        <div>
          <h2>Session 详情页</h2>
          <p className="mono">{sessionId ?? "missing-session"}</p>
        </div>
      </div>
      <div className="summary-metrics">
        <Badge label={`Request ${selectedIndex + 1} / ${requestCount}`} tone="blue" />
        <Badge label={formatTime(selectedAnalysis.capture.capturedAt)} />
        <Badge label={selectedAnalysis.model} tone="teal" />
        <Badge label={`${selectedAnalysis.tools.length} tools`} tone="amber" />
        {selectedAnalysis.contextManagementSummary !== "none" ? (
          <Badge label="context edit" tone="rose" />
        ) : null}
      </div>
    </section>
  );
}

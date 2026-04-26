import { ChevronDown, Diff, GitBranch, Wrench } from "lucide-react";

import { Badge, IconButton } from "../../components/ui";
import { badgeToneForLabel, formatCompactNumber, formatTime } from "../../lib/format";
import type { RequestAnalysis } from "../../types";

export function TimelinePanel({
  analyses,
  selectedIndex,
  onlyTools,
  onlyChanged,
  onOnlyToolsChange,
  onOnlyChangedChange,
  onSelectIndex,
}: {
  analyses: RequestAnalysis[];
  selectedIndex: number;
  onlyTools: boolean;
  onlyChanged: boolean;
  onOnlyToolsChange: (value: boolean) => void;
  onOnlyChangedChange: (value: boolean) => void;
  onSelectIndex: (value: number) => void;
}) {
  return (
    <aside className="panel timeline">
      <div className="panel-head">
        <div className="panel-title">
          <GitBranch aria-hidden="true" />
          请求时间轴
        </div>
        <IconButton
          label="上一条请求"
          icon={ChevronDown}
          onClick={() => onSelectIndex(Math.max(0, selectedIndex - 1))}
        />
      </div>
      <div className="timeline-filter">
        <button
          className={onlyTools ? "button active" : "button"}
          onClick={() => onOnlyToolsChange(!onlyTools)}
          type="button"
        >
          <Wrench aria-hidden="true" />
          有工具
        </button>
        <button
          className={onlyChanged ? "button active" : "button"}
          onClick={() => onOnlyChangedChange(!onlyChanged)}
          type="button"
        >
          <Diff aria-hidden="true" />
          有变化
        </button>
      </div>
      <div className="timeline-list">
        {analyses.map((analysis) => (
          <button
            className={analysis.index === selectedIndex ? "timeline-item active" : "timeline-item"}
            key={analysis.capture.requestId}
            onClick={() => onSelectIndex(analysis.index)}
            type="button"
          >
            <span className="timeline-node">{analysis.index + 1}</span>
            <span className="timeline-content">
              <span className="timeline-main">
                <span className="timeline-prompt truncate">
                  {analysis.latestUserBlock?.preview ?? analysis.capture.derived.promptTextPreview}
                </span>
                <span className="timeline-time">{formatTime(analysis.capture.capturedAt)}</span>
              </span>
              <span className="badge-row">
                {analysis.diff.badges.slice(0, 3).map((badge) => (
                  <Badge key={badge} label={badge} tone={badgeToneForLabel(badge)} />
                ))}
                <Badge label={`${formatCompactNumber(analysis.sizes.total)} chars`} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

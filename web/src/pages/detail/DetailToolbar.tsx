import { Copy, Diff } from "lucide-react";

import { Button, IconButton } from "../../components/ui";
import { safeJson } from "../../lib/json";
import type { DetailView, RequestAnalysis } from "../../types";

const VIEWS: Array<[DetailView, string]> = [
  ["stack", "Context Stack"],
  ["messages", "Messages"],
  ["tools", "Tools"],
  ["raw", "Raw JSON"],
];

export function DetailToolbar({
  activeView,
  analysis,
  onActiveViewChange,
}: {
  activeView: DetailView;
  analysis: RequestAnalysis;
  onActiveViewChange: (value: DetailView) => void;
}) {
  return (
    <div className="toolbar">
      <div className="segmented" aria-label="详情视图" role="tablist">
        {VIEWS.map(([value, label]) => (
          <button
            className={activeView === value ? "segment active" : "segment"}
            key={value}
            onClick={() => onActiveViewChange(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="button-row">
        <Button icon={Diff} onClick={() => onActiveViewChange("stack")}>
          Compare with previous
        </Button>
        <IconButton
          label="复制当前请求"
          icon={Copy}
          onClick={() =>
            void navigator.clipboard?.writeText(safeJson(analysis.capture.requestBody.raw))
          }
        />
      </div>
    </div>
  );
}

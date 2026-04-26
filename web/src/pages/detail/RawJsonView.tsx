import { Braces, Clipboard, ScanSearch, Search } from "lucide-react";

import { Button, IconButton } from "../../components/ui";
import { safeJson } from "../../lib/json";
import type { RequestAnalysis } from "../../types";

export function RawJsonView({
  analysis,
  rawSearch,
  onRawSearchChange,
  onSelectRaw,
}: {
  analysis: RequestAnalysis;
  rawSearch: string;
  onRawSearchChange: (value: string) => void;
  onSelectRaw: () => void;
}) {
  const rawText = safeJson(analysis.capture.requestBody.raw);
  const lowerRaw = rawText.toLowerCase();
  const matchCount = rawSearch.trim()
    ? lowerRaw.split(rawSearch.trim().toLowerCase()).length - 1
    : 0;

  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Braces aria-hidden="true" />
          Raw JSON 定位
        </h3>
        <span className="small-note">从任意可视化块跳转到字段路径</span>
      </div>
      <div className="raw-toolbar">
        <label className="field search-field">
          <Search aria-hidden="true" />
          <input
            onChange={(event) => onRawSearchChange(event.target.value)}
            placeholder="搜索字段或值"
            type="search"
            value={rawSearch}
          />
        </label>
        <span className="result-count">{matchCount} matches</span>
        <Button icon={Clipboard} onClick={() => void navigator.clipboard?.writeText(rawText)}>
          复制完整 request body
        </Button>
        <IconButton icon={ScanSearch} label="定位 Metadata" onClick={onSelectRaw} />
      </div>
      <pre className="raw-json">{rawText}</pre>
    </section>
  );
}

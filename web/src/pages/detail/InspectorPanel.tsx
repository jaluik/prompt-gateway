import { Copy, FileJson, ScanSearch } from "lucide-react";

import { Button, EmptyState, IconButton } from "../../components/ui";
import { formatCompactNumber } from "../../lib/format";
import { safeJson } from "../../lib/json";
import type { InspectorItem, SessionAnalytics } from "../../types";

export function InspectorPanel({
  item,
  analytics,
  onOpenRaw,
  onSelect,
}: {
  item: InspectorItem | null;
  analytics: SessionAnalytics;
  onOpenRaw: () => void;
  onSelect: (key: string) => void;
}) {
  const content = item
    ? typeof item.content === "string"
      ? item.content
      : safeJson(item.content)
    : "";

  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <div className="panel-title">
          <ScanSearch aria-hidden="true" />
          检查器
        </div>
        <div className="button-row">
          <IconButton
            label="复制字段"
            icon={Copy}
            disabled={!item}
            onClick={() => item && void navigator.clipboard?.writeText(content)}
          />
          <IconButton
            label="在 Raw JSON 中打开"
            icon={FileJson}
            disabled={!item}
            onClick={onOpenRaw}
          />
        </div>
      </div>
      <div className="panel-body">
        {item ? (
          <>
            <div className="block-label">Selected Path</div>
            <div className="inspector-path">{item.path}</div>
            <div className="inspector-grid">
              <InspectorStat label="Type" value={item.type} />
              <InspectorStat label="Size" value={`${formatCompactNumber(item.size)} chars`} />
              <InspectorStat label="Cache" value={item.cache ?? "none"} />
              <InspectorStat label="Diff" value={item.diff} />
            </div>
            <div className="block-label">Content Preview</div>
            <pre className="code-box">{content}</pre>
            <div className="copy-rail">
              <Button icon={Copy} onClick={() => void navigator.clipboard?.writeText(content)}>
                复制内容
              </Button>
              <Button icon={ScanSearch} onClick={onOpenRaw}>
                定位 Raw
              </Button>
            </div>
          </>
        ) : (
          <EmptyState>选择一个上下文块、message、tool 或 raw 字段查看详情。</EmptyState>
        )}

        <div className="preview-block">
          <div className="block-label">字段目录</div>
          <div className="field-tree">
            <TreeRow label="metadata" meta="object" onClick={() => onSelect("layer:metadata")} />
            <TreeRow
              label="context_management"
              meta="object"
              onClick={() => onSelect("layer:context")}
            />
            <TreeRow
              label="system"
              meta={`${analytics.analyses[analytics.analyses.length - 1]?.systemBlocks.length ?? 0} blocks`}
              onClick={() => onSelect("layer:system")}
            />
            <TreeRow
              label="messages"
              meta={`${analytics.analyses[analytics.analyses.length - 1]?.messages.length ?? 0} array`}
              onClick={() => onSelect("layer:messages")}
            />
            <TreeRow
              label="tools"
              meta={`${analytics.analyses[analytics.analyses.length - 1]?.tools.length ?? 0} array`}
              onClick={() => onSelect("layer:tools")}
            />
            <TreeRow label="raw" meta="json" onClick={onOpenRaw} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function InspectorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector-stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function TreeRow({ label, meta, onClick }: { label: string; meta: string; onClick: () => void }) {
  return (
    <button className="tree-row" onClick={onClick} type="button">
      <span>{label}</span>
      <span className="soft">{meta}</span>
    </button>
  );
}

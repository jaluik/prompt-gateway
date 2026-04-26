import { Layers3 } from "lucide-react";

import { Badge, MiniBar } from "../../components/ui";
import { badgeToneForLabel, formatCompactNumber } from "../../lib/format";
import type { LayerKey, RequestAnalysis } from "../../types";

export function ContextStack({
  analysis,
  inspectorKey,
  onSelect,
}: {
  analysis: RequestAnalysis;
  inspectorKey: string | null;
  onSelect: (key: LayerKey) => void;
}) {
  const maxSize = Math.max(1, ...analysis.layers.map((layer) => layer.size));

  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Layers3 aria-hidden="true" />
          上下文组装图
        </h3>
        <span className="small-note">按进入 request body 的逻辑层级展示</span>
      </div>
      <div className="context-stack">
        {analysis.layers.map((layer) => {
          const Icon = layer.icon;
          return (
            <button
              className={
                inspectorKey === `layer:${layer.key}`
                  ? `stack-layer layer-${layer.tone} selected`
                  : `stack-layer layer-${layer.tone}`
              }
              key={layer.key}
              onClick={() => onSelect(layer.key)}
              type="button"
            >
              <div className="layer-label">
                <div className="layer-icon">
                  <Icon aria-hidden="true" />
                </div>
                <div>
                  <div className="layer-title">{layer.title}</div>
                  <div className="layer-path">{layer.path}</div>
                </div>
              </div>
              <div className="layer-copy">
                <div className="layer-summary">{layer.summary}</div>
                <div className="layer-meta">
                  {layer.badges.map((badge) => (
                    <Badge key={badge.label} label={badge.label} tone={badge.tone} />
                  ))}
                  {analysis.diff.changedLayerKeys.has(layer.key) ? (
                    <Badge label="Changed" tone="rose" />
                  ) : null}
                </div>
              </div>
              <div className="layer-size">
                <div className="size-number">{formatCompactNumber(layer.size)}</div>
                <div className="size-label">estimated chars</div>
                <MiniBar value={layer.size} max={maxSize} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="diff-summary">
        <div className="block-label">与上一请求对比</div>
        <div className="badge-row">
          {analysis.diff.badges.map((badge) => (
            <Badge key={badge} label={badge} tone={badgeToneForLabel(badge)} />
          ))}
        </div>
        <div className="diff-grid">
          <DiffCell label="System" value={analysis.diff.systemChanged ? "changed" : "unchanged"} />
          <DiffCell
            label="Messages"
            value={
              analysis.diff.messagesDelta >= 0
                ? `+${analysis.diff.messagesDelta}`
                : String(analysis.diff.messagesDelta)
            }
          />
          <DiffCell label="Tools" value={analysis.diff.toolsChanged ? "changed" : "unchanged"} />
          <DiffCell
            label="Size Delta"
            value={`${analysis.diff.sizeDelta >= 0 ? "+" : ""}${formatCompactNumber(
              analysis.diff.sizeDelta,
            )}`}
          />
        </div>
      </div>
    </section>
  );
}

function DiffCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

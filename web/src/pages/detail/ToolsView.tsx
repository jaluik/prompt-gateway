import { Activity, Wrench } from "lucide-react";

import { Badge, EmptyState } from "../../components/ui";
import { formatCompactNumber } from "../../lib/format";
import type { RequestAnalysis } from "../../types";

export function ToolsView({
  analysis,
  onSelect,
}: {
  analysis: RequestAnalysis;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <Wrench aria-hidden="true" />
          工具定义视图
        </h3>
        <span className="small-note">当前请求暴露工具定义，未必代表本次一定调用</span>
      </div>
      <div className="table-scroll compact">
        <table className="tool-table">
          <thead>
            <tr>
              <th>Tool Name</th>
              <th>Description Size</th>
              <th>Input Fields</th>
              <th>Required</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {analysis.tools.map((tool) => (
              <tr key={tool.path} onClick={() => onSelect(tool.path)}>
                <td className="tool-name">{tool.name}</td>
                <td className="mono">{formatCompactNumber(tool.descriptionSize)} chars</td>
                <td>
                  <ToolFields fields={tool.inputFields} />
                </td>
                <td>
                  <ToolFields fields={tool.requiredFields} required />
                </td>
                <td>
                  <Badge
                    label={tool.changed ? "changed" : "unchanged"}
                    tone={tool.changed ? "rose" : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title sub">
        <h3>
          <Activity aria-hidden="true" />
          工具调用时间线
        </h3>
      </div>
      {analysis.toolCalls.length === 0 ? (
        <EmptyState>当前请求暴露了工具定义，但上下文中未出现工具调用记录。</EmptyState>
      ) : (
        <div className="tool-call-list">
          {analysis.toolCalls.map((call) => (
            <button
              className="tool-call-row"
              key={call.id}
              onClick={() => onSelect(call.path)}
              type="button"
            >
              <Badge label={`Request ${call.requestIndex + 1}`} tone="blue" />
              <strong>{call.tool}</strong>
              <span>{call.type === "tool_use" ? call.inputSummary : call.resultSummary}</span>
              <code>{call.linkedMessage}</code>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ToolFields({ fields, required }: { fields: string[]; required?: boolean }) {
  return (
    <div className="badge-row">
      {(fields.length > 0 ? fields : ["none"]).slice(0, required ? 4 : 5).map((field) => (
        <Badge
          key={field}
          label={field}
          tone={required && field !== "none" ? "violet" : undefined}
        />
      ))}
    </div>
  );
}

import { CircleDot } from "lucide-react";

import { MISSING } from "../../lib/constants";
import type { RequestAnalysis } from "../../types";

export function RequestCallout({ analysis }: { analysis: RequestAnalysis }) {
  const leadingText =
    analysis.trigger.kind === "tool_result" ? "本次请求由工具结果继续触发：" : "用户最新输入是 ";
  const trailingText =
    analysis.trigger.kind === "tool_result" && analysis.latestUserBlock
      ? `。最近用户输入是 ${analysis.latestUserBlock.preview}`
      : "";

  return (
    <div className="callout">
      <CircleDot aria-hidden="true" />
      <span>
        {leadingText}
        <strong>{analysis.trigger.preview || MISSING}</strong>
        {trailingText}
        ，但本次请求同时携带 {analysis.systemBlocks.length} 个 system block、
        {analysis.messages.length} 条 messages、{analysis.tools.length} 个 tools，以及 thinking 与
        context management 配置。
      </span>
    </div>
  );
}

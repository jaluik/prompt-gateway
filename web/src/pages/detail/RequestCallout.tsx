import { CircleDot } from "lucide-react";

import { MISSING } from "../../lib/constants";
import type { RequestAnalysis } from "../../types";

export function RequestCallout({ analysis }: { analysis: RequestAnalysis }) {
  return (
    <div className="callout">
      <CircleDot aria-hidden="true" />
      <span>
        用户最新输入是 <strong>{analysis.latestUserBlock?.preview ?? MISSING}</strong>
        ，但本次请求同时携带 {analysis.systemBlocks.length} 个 system block、
        {analysis.messages.length} 条 messages、{analysis.tools.length} 个 tools，以及 thinking 与
        context management 配置。
      </span>
    </div>
  );
}

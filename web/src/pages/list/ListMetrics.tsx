import { Gauge, MessagesSquare, Send, Wrench } from "lucide-react";

import { MetricTile } from "../../components/ui";
import { formatCompactNumber } from "../../lib/format";

export function ListMetrics({
  sessionCount,
  requestCount,
  maxContext,
  toolHeavy,
}: {
  sessionCount: number;
  requestCount: number;
  maxContext: number;
  toolHeavy: number;
}) {
  return (
    <section className="stats-grid" aria-label="Session 总览">
      <MetricTile
        caption="当前捕获目录中的会话数"
        icon={MessagesSquare}
        label="Sessions"
        value={String(sessionCount)}
      />
      <MetricTile
        caption="所有 session 的 /v1/messages 请求"
        icon={Send}
        label="Requests"
        value={String(requestCount)}
      />
      <MetricTile
        caption="按字符估算，非精确 token"
        icon={Gauge}
        label="Max Context"
        value={formatCompactNumber(maxContext)}
      />
      <MetricTile
        caption="包含 20 个以上工具定义的 session"
        icon={Wrench}
        label="Tool Heavy"
        value={String(toolHeavy)}
      />
    </section>
  );
}

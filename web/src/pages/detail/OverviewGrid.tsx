import {
  Activity,
  Brain,
  Gauge,
  type LucideIcon,
  MessagesSquare,
  Network,
  Wrench,
} from "lucide-react";

import { formatCompactNumber } from "../../lib/format";
import type { RequestAnalysis } from "../../types";

export function OverviewGrid({ analysis }: { analysis: RequestAnalysis }) {
  return (
    <div className="overview-grid">
      <OverviewCard
        icon={Network}
        label="API"
        value={`${analysis.capture.method} ${analysis.capture.path}`}
      />
      <OverviewCard icon={Brain} label="Model" value={analysis.model} />
      <OverviewCard icon={Activity} label="Thinking" value={analysis.thinkingType} />
      <OverviewCard
        icon={Gauge}
        label="Context"
        value={`${formatCompactNumber(analysis.sizes.total)} chars`}
      />
      <OverviewCard icon={Wrench} label="Tools" value={String(analysis.tools.length)} />
      <OverviewCard
        icon={MessagesSquare}
        label="Messages"
        value={String(analysis.messages.length)}
      />
    </div>
  );
}

function OverviewCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <article className="overview-card">
      <div className="label">
        <Icon aria-hidden="true" />
        {label}
      </div>
      <div className="value">{value}</div>
    </article>
  );
}

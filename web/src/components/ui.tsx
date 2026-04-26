import { type LucideIcon, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import type { BadgeTone } from "../types";

export function Badge({ label, tone }: { label: string; tone?: BadgeTone }) {
  return <span className={tone ? `badge ${tone}` : "badge"}>{label}</span>;
}

export function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

export function Button({
  children,
  icon: Icon,
  onClick,
  tone = "default",
  disabled,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  tone?: "default" | "primary";
  disabled?: boolean;
}) {
  return (
    <button
      className={tone === "primary" ? "button primary" : "button"}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function MetricTile({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
}) {
  return (
    <article className="metric-tile">
      <div className="metric-label">
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-caption">{caption}</div>
    </article>
  );
}

export function EmptyState({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error";
}) {
  return <div className={tone === "error" ? "empty-state error" : "empty-state"}>{children}</div>;
}

export function LoadingPanel({ children }: { children: ReactNode }) {
  return (
    <div className="loading-panel">
      <RefreshCw aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const displayValues = (values.length > 0 ? values.slice(-18) : [0]).map((value, index) => ({
    id: `bar-${values.length}-${index}-${value}`,
    value,
  }));

  return (
    <div className="sparkline" aria-label="上下文增长趋势" role="img">
      {displayValues.map((bar) => (
        <span key={bar.id} style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function MiniBar({ value, max }: { value: number; max: number }) {
  const width = Math.max(4, Math.min(100, max <= 0 ? 0 : (value / max) * 100));
  return (
    <div className="mini-bar" aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

import type { BadgeTone } from "../types";
import { MISSING } from "./constants";

export function formatDate(value: string | null): string {
  if (!value) {
    return MISSING;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return MISSING;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value: string | null): string {
  if (!value) {
    return MISSING;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return MISSING;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

export function compactSessionId(value: string | null): string {
  if (!value) {
    return "missing-session";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export function badgeToneForLabel(label: string): BadgeTone | undefined {
  if (label.includes("tool")) {
    return "amber";
  }

  if (label.includes("context") || label.includes("changed")) {
    return "rose";
  }

  if (label.includes("cache")) {
    return "violet";
  }

  if (label.includes("thinking") || label.includes("message")) {
    return "teal";
  }

  if (label.includes("user") || label.includes("latest")) {
    return "blue";
  }

  return undefined;
}

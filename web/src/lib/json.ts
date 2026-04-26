import { MISSING } from "./constants";

export function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value: string): string {
  return value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function sizeOf(value: unknown): number {
  if (typeof value === "string") {
    return normalizeText(value).length;
  }

  if (value === null || typeof value === "undefined") {
    return 0;
  }

  return compactJson(value).length;
}

export function previewText(value: string, maxLength = 180): string {
  const compact = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!compact) {
    return MISSING;
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

export function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return `array[${value.length}]`;
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

export function getString(value: unknown): string | null {
  return typeof value === "string" ? normalizeText(value) : null;
}

export function getStringField(
  objectValue: Record<string, unknown> | null,
  field: string,
): string | null {
  if (!objectValue) {
    return null;
  }

  return getString(objectValue[field]);
}

export function readCache(value: unknown): string | null {
  const objectValue = asObject(value);
  const cache = asObject(objectValue?.cache_control);
  return getStringField(cache, "type");
}

export function countCacheBlocks(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countCacheBlocks(item), 0);
  }

  const objectValue = asObject(value);
  if (!objectValue) {
    return 0;
  }

  const ownCount = asObject(objectValue.cache_control) ? 1 : 0;
  return Object.values(objectValue).reduce(
    (total, item) => total + countCacheBlocks(item),
    ownCount,
  );
}

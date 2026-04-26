import type { DiffAnalysis, LayerKey } from "../types";
import { formatCompactNumber } from "./format";
import { asArray, compactJson } from "./json";

export function buildDiff(
  raw: Record<string, unknown>,
  previousRaw: Record<string, unknown> | null,
  totalSize: number,
  previousSize: number,
): DiffAnalysis {
  if (!previousRaw) {
    return {
      badges: ["first request"],
      systemChanged: false,
      toolsChanged: false,
      messagesDelta: asArray(raw.messages).length,
      metadataChanged: false,
      contextChanged: false,
      sizeDelta: 0,
      changedLayerKeys: new Set<LayerKey>(),
    };
  }

  const systemChanged = compactJson(raw.system) !== compactJson(previousRaw.system);
  const toolsChanged = compactJson(raw.tools) !== compactJson(previousRaw.tools);
  const metadataChanged = compactJson(raw.metadata) !== compactJson(previousRaw.metadata);
  const contextChanged =
    compactJson(raw.context_management) !== compactJson(previousRaw.context_management);
  const messagesDelta = asArray(raw.messages).length - asArray(previousRaw.messages).length;
  const sizeDelta = totalSize - previousSize;
  const changedLayerKeys = new Set<LayerKey>();
  const badges: string[] = [];

  if (messagesDelta > 0) {
    badges.push(`+${messagesDelta} message`);
    changedLayerKeys.add("messages");
    changedLayerKeys.add("latest");
  }

  for (const [changed, badge, layer] of [
    [systemChanged, "system changed", "system"],
    [toolsChanged, "tools changed", "tools"],
    [contextChanged, "context edit", "context"],
    [metadataChanged, "metadata changed", "metadata"],
  ] as const) {
    if (changed) {
      badges.push(badge);
      changedLayerKeys.add(layer);
    }
  }

  if (sizeDelta > 8000) {
    badges.push(`+${formatCompactNumber(sizeDelta)} chars`);
  }

  return {
    badges: badges.length > 0 ? badges : ["unchanged"],
    systemChanged,
    toolsChanged,
    messagesDelta,
    metadataChanged,
    contextChanged,
    sizeDelta,
    changedLayerKeys,
  };
}

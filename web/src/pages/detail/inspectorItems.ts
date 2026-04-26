import { describeType } from "../../lib/json";
import type { InspectorItem, RequestAnalysis } from "../../types";

export function buildInspectorItems(selectedAnalysis: RequestAnalysis | null) {
  if (!selectedAnalysis) {
    return new Map<string, InspectorItem>();
  }

  const items = new Map<string, InspectorItem>();
  for (const layer of selectedAnalysis.layers) {
    items.set(`layer:${layer.key}`, {
      key: `layer:${layer.key}`,
      title: layer.title,
      path: layer.path,
      type: describeType(layer.raw),
      size: layer.size,
      cache: layer.cache,
      diff: selectedAnalysis.diff.changedLayerKeys.has(layer.key) ? "changed" : "unchanged",
      content: layer.raw,
    });
  }

  for (const block of selectedAnalysis.systemBlocks) {
    items.set(block.path, {
      key: block.path,
      title: block.title,
      path: block.path,
      type: block.type,
      size: block.size,
      cache: block.cache,
      diff: selectedAnalysis.diff.changedLayerKeys.has("system") ? "changed" : "unchanged",
      content: block.raw,
    });
  }

  for (const message of selectedAnalysis.messages) {
    items.set(message.path, {
      key: message.path,
      title: `message ${message.index + 1}`,
      path: message.path,
      type: message.role,
      size: message.size,
      cache: message.cacheCount > 0 ? `${message.cacheCount} cache hints` : null,
      diff: message.isLatestUser ? "latest" : "included",
      content: selectedAnalysis.raw.messages,
    });
    for (const block of message.blocks) {
      items.set(block.path, {
        key: block.path,
        title: block.title,
        path: block.path,
        type: block.type,
        size: block.size,
        cache: block.cache,
        diff: message.isLatestUser ? "latest" : "included",
        content: block.raw,
      });
    }
  }

  for (const tool of selectedAnalysis.tools) {
    items.set(tool.path, {
      key: tool.path,
      title: tool.name,
      path: tool.path,
      type: "tool schema",
      size: tool.size,
      cache: null,
      diff: tool.changed ? "changed" : "unchanged",
      content: tool.raw,
    });
  }

  return items;
}

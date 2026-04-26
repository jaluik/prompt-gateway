import type { CaptureRecord, RequestAnalysis, SessionAnalytics } from "../types";
import { MISSING } from "./constants";
import {
  extractContextSummary,
  extractMessages,
  extractSystemBlocks,
  extractThinkingType,
  extractToolCalls,
  extractTools,
  findLatestUserBlock,
} from "./contentAnalysis";
import { buildDiff } from "./diffAnalysis";
import { asObject, countCacheBlocks, getString, sizeOf } from "./json";
import { buildLayers } from "./layerAnalysis";

export function analyzeCapture(
  capture: CaptureRecord,
  index: number,
  previous?: RequestAnalysis,
): RequestAnalysis {
  const raw = asObject(capture.requestBody.raw) ?? {};
  const previousRaw = previous?.raw ?? null;
  const systemBlocks = extractSystemBlocks(raw.system);
  const messages = extractMessages(raw.messages);
  const tools = extractTools(raw.tools, previousRaw?.tools);
  const toolCalls = extractToolCalls(messages, index);
  const latestUserBlock = findLatestUserBlock(messages);
  const metadata = raw.metadata;
  const requestMetadata = {
    model: raw.model,
    max_tokens: raw.max_tokens,
    stream: raw.stream,
    thinking: raw.thinking,
    metadata,
  };
  const sizes = {
    metadata: sizeOf(requestMetadata),
    context: sizeOf(raw.context_management),
    system: sizeOf(raw.system),
    tools: sizeOf(raw.tools),
    messages: sizeOf(raw.messages),
    latest: latestUserBlock ? sizeOf(latestUserBlock.text) : 0,
    total: 0,
  };
  sizes.total = sizes.metadata + sizes.context + sizes.system + sizes.tools + sizes.messages;

  const diff = buildDiff(raw, previousRaw, sizes.total, previous?.sizes.total ?? 0);
  const model = getString(raw.model) ?? capture.derived.model ?? MISSING;
  const maxTokens = typeof raw.max_tokens === "number" ? raw.max_tokens : capture.derived.maxTokens;
  const stream = typeof raw.stream === "boolean" ? raw.stream : capture.derived.stream;
  const thinkingType = extractThinkingType(raw.thinking);
  const contextManagementSummary = extractContextSummary(raw.context_management);
  const layerSizes = [
    { name: "System Layer", value: sizes.system },
    { name: "Tool Definition Layer", value: sizes.tools },
    { name: "Conversation Layer", value: sizes.messages },
    { name: "Request Metadata", value: sizes.metadata },
    { name: "Context Management", value: sizes.context },
  ];
  const largestLayer =
    layerSizes.sort((left, right) => right.value - left.value)[0]?.name ?? MISSING;

  return {
    capture,
    index,
    raw,
    model,
    maxTokens,
    stream,
    thinkingType,
    contextManagementSummary,
    metadata,
    systemBlocks,
    messages,
    tools,
    toolCalls,
    latestUserBlock,
    layers: buildLayers({
      raw,
      sizes,
      systemBlocks,
      tools,
      messages,
      toolCalls,
      latestUserBlock,
      maxTokens,
      stream,
      thinkingType,
      contextManagementSummary,
      largestLayer,
      diff,
      requestMetadata,
    }),
    diff,
    sizes,
    cacheCount: countCacheBlocks(capture.requestBody.raw),
    largestLayer,
  };
}

export function analyzeCaptures(captures: CaptureRecord[]): RequestAnalysis[] {
  const analyses: RequestAnalysis[] = [];
  for (const [index, capture] of captures.entries()) {
    analyses.push(analyzeCapture(capture, index, analyses[index - 1]));
  }

  return analyses;
}

export function buildSessionAnalytics(captures: CaptureRecord[]): SessionAnalytics {
  const sorted = [...captures].sort((left, right) => left.timestampMs - right.timestampMs);
  const analyses = analyzeCaptures(sorted);
  const firstCapture = sorted[0] ?? null;
  const latestCapture = sorted[sorted.length - 1] ?? null;
  const firstAnalysis = analyses[0] ?? null;
  const latestAnalysis = analyses[analyses.length - 1] ?? null;
  const modelList = Array.from(
    new Set(analyses.map((analysis) => analysis.model).filter((model) => model !== MISSING)),
  );
  const toolNames = Array.from(
    new Set(analyses.flatMap((analysis) => analysis.tools.map((tool) => tool.name))),
  ).sort();

  return {
    captures: sorted,
    analyses,
    firstCapture,
    latestCapture,
    firstPrompt:
      firstAnalysis?.latestUserBlock?.preview ?? firstCapture?.derived.promptTextPreview ?? MISSING,
    latestPrompt:
      latestAnalysis?.latestUserBlock?.preview ??
      latestCapture?.derived.promptTextPreview ??
      MISSING,
    startAt: firstCapture?.capturedAt ?? null,
    endAt: latestCapture?.capturedAt ?? null,
    modelList,
    requestCount: sorted.length,
    maxContextSize: Math.max(0, ...analyses.map((analysis) => analysis.sizes.total)),
    latestContextSize: latestAnalysis?.sizes.total ?? 0,
    maxToolCount: Math.max(0, ...analyses.map((analysis) => analysis.tools.length)),
    latestToolCount: latestAnalysis?.tools.length ?? 0,
    hasToolCalls: analyses.some((analysis) => analysis.toolCalls.length > 0),
    hasContextManagement: analyses.some((analysis) => analysis.contextManagementSummary !== "none"),
    cacheCount: analyses.reduce((total, analysis) => total + analysis.cacheCount, 0),
    toolNames,
    trend: analyses.map((analysis) => analysis.sizes.total),
    recentRequests: analyses.slice(-5).reverse(),
    latestDiffBadges: latestAnalysis?.diff.badges ?? [],
  };
}

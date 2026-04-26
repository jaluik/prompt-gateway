import {
  Diff,
  MessagesSquare,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from "lucide-react";

import type { RequestAnalysis, StackLayer } from "../types";
import { MISSING } from "./constants";
import { formatCompactNumber } from "./format";

type LayerInputs = Pick<
  RequestAnalysis,
  "systemBlocks" | "tools" | "messages" | "toolCalls" | "latestUserBlock" | "diff" | "sizes"
> & {
  raw: Record<string, unknown>;
  maxTokens: number | null;
  stream: boolean;
  thinkingType: string;
  contextManagementSummary: string;
  largestLayer: string;
  requestMetadata: Record<string, unknown>;
};

export function buildLayers(input: LayerInputs): StackLayer[] {
  const systemCacheCount = input.systemBlocks.filter((block) => block.cache).length;
  const biggestTools = [...input.tools]
    .sort((left, right) => right.descriptionSize - left.descriptionSize)
    .slice(0, 2);
  const latestUserSummary = input.latestUserBlock
    ? input.latestUserBlock.preview
    : "No latest user input found";

  return [
    {
      key: "metadata",
      title: "Request Metadata",
      path: "requestBody.raw.model / max_tokens / stream / metadata",
      summary: "Model, max output, stream mode, thinking mode, and request-level metadata.",
      icon: SlidersHorizontal,
      tone: "metadata",
      size: input.sizes.metadata,
      badges: [
        { label: `max_tokens ${input.maxTokens ?? MISSING}`, tone: "blue" },
        { label: `stream ${String(input.stream)}`, tone: "teal" },
        { label: `thinking ${input.thinkingType}` },
      ],
      raw: input.requestMetadata,
      cache: null,
    },
    makeContextLayer(input),
    makeSystemLayer(input, systemCacheCount),
    makeToolsLayer(input, biggestTools),
    makeMessagesLayer(input),
    {
      key: "latest",
      title: "Latest User Input",
      path: input.latestUserBlock?.path ?? "requestBody.raw.messages[last user]",
      summary: latestUserSummary,
      icon: UserRound,
      tone: "user",
      size: input.sizes.latest,
      badges: [
        { label: "actual user input", tone: "blue" },
        ...(input.latestUserBlock?.cache
          ? [{ label: input.latestUserBlock.cache, tone: "violet" as const }]
          : []),
      ],
      raw: input.latestUserBlock?.raw ?? null,
      cache: input.latestUserBlock?.cache ?? null,
    },
  ];
}

function makeContextLayer(input: LayerInputs): StackLayer {
  return {
    key: "context",
    title: "Context Management",
    path: "requestBody.raw.context_management",
    summary:
      input.contextManagementSummary === "none"
        ? "No context management field on this request."
        : input.contextManagementSummary,
    icon: Diff,
    tone: "context",
    size: input.sizes.context,
    badges:
      input.contextManagementSummary === "none"
        ? [{ label: "none" }]
        : [{ label: "context edit", tone: "rose" }, { label: input.contextManagementSummary }],
    raw: input.raw.context_management ?? null,
    cache: null,
  };
}

function makeSystemLayer(input: LayerInputs, systemCacheCount: number): StackLayer {
  return {
    key: "system",
    title: "System Layer",
    path:
      input.systemBlocks.length > 0
        ? `requestBody.raw.system[0..${input.systemBlocks.length - 1}]`
        : "requestBody.raw.system",
    summary:
      "Claude Code injected identity, runtime rules, environment context, and session-specific guidance.",
    icon: ShieldCheck,
    tone: "system",
    size: input.sizes.system,
    badges: [
      { label: `${input.systemBlocks.length} blocks` },
      { label: `${systemCacheCount} cache`, tone: systemCacheCount > 0 ? "violet" : undefined },
      ...(input.largestLayer === "System Layer"
        ? [{ label: "largest layer", tone: "blue" as const }]
        : []),
    ],
    raw: input.raw.system ?? null,
    cache: systemCacheCount > 0 ? `${systemCacheCount} cache hints` : null,
  };
}

function makeToolsLayer(input: LayerInputs, biggestTools: LayerInputs["tools"]): StackLayer {
  return {
    key: "tools",
    title: "Tool Definition Layer",
    path:
      input.tools.length > 0
        ? `requestBody.raw.tools[0..${input.tools.length - 1}]`
        : "requestBody.raw.tools",
    summary:
      input.tools.length > 0
        ? `This request exposed ${input.tools.length} tool definitions, including ${
            biggestTools.map((tool) => tool.name).join(", ") || "tools"
          }.`
        : "No tool definitions were exposed in this request.",
    icon: Wrench,
    tone: "tool",
    size: input.sizes.tools,
    badges: [
      { label: `${input.tools.length} tools`, tone: "amber" },
      ...(biggestTools[0]
        ? [
            {
              label: `${biggestTools[0].name} ${formatCompactNumber(
                biggestTools[0].descriptionSize,
              )} desc`,
            },
          ]
        : []),
      ...(input.diff.toolsChanged ? [{ label: "changed", tone: "rose" as const }] : []),
    ],
    raw: input.raw.tools ?? [],
    cache: null,
  };
}

function makeMessagesLayer(input: LayerInputs): StackLayer {
  return {
    key: "messages",
    title: "Conversation Layer",
    path:
      input.messages.length > 0
        ? `requestBody.raw.messages[0..${input.messages.length - 1}]`
        : "requestBody.raw.messages",
    summary:
      "Prior user messages, assistant text, thinking, tool calls, and tool results included in this request.",
    icon: MessagesSquare,
    tone: "conversation",
    size: input.sizes.messages,
    badges: [
      { label: `${input.messages.length} messages`, tone: "teal" },
      ...(input.messages.some((message) => message.hasThinking) ? [{ label: "thinking" }] : []),
      ...(input.toolCalls.length > 0
        ? [{ label: `${input.toolCalls.length} tool events`, tone: "amber" as const }]
        : []),
    ],
    raw: input.raw.messages ?? [],
    cache: input.messages.some((message) => message.cacheCount > 0) ? "cache hints" : null,
  };
}

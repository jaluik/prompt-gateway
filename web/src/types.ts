import type { LucideIcon } from "lucide-react";

export type SessionListItem = {
  sessionId: string | null;
  latestCapturedAt: string;
  latestTimestampMs: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  streamCount: number;
  durationMs: number;
  models: string[];
  promptTextPreview: string;
};

export type CaptureRecord = {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  method: string;
  path: string;
  sessionId: string | null;
  requestHeaders: {
    redacted: Record<string, string>;
  };
  requestBody: {
    raw: unknown;
  };
  derived: {
    system: unknown;
    messages: unknown;
    model: string | null;
    maxTokens: number | null;
    stream: boolean;
    promptTextPreview: string;
  };
  response: {
    status: number;
    durationMs: number;
    ok: boolean;
    error?: string;
    body?: {
      raw: unknown;
    };
  };
};

export type RouteState =
  | {
      name: "list";
    }
  | {
      name: "detail";
      sessionId: string | null;
    };

export type ContentBlockAnalysis = {
  id: string;
  path: string;
  type: string;
  title: string;
  text: string;
  preview: string;
  size: number;
  cache: string | null;
  raw: unknown;
  isSystemReminder: boolean;
  toolName?: string;
  toolUseId?: string;
  isError?: boolean;
};

export type MessageAnalysis = {
  index: number;
  path: string;
  role: string;
  blocks: ContentBlockAnalysis[];
  contentTypes: string[];
  preview: string;
  size: number;
  cacheCount: number;
  isLatestUser: boolean;
  hasSystemReminder: boolean;
  hasThinking: boolean;
  hasToolUse: boolean;
  hasToolResult: boolean;
};

export type ToolDefinitionAnalysis = {
  index: number;
  path: string;
  name: string;
  description: string;
  descriptionSize: number;
  inputFields: string[];
  requiredFields: string[];
  size: number;
  raw: unknown;
  changed: boolean;
};

export type ToolCallAnalysis = {
  id: string;
  requestIndex: number;
  path: string;
  type: "tool_use" | "tool_result";
  tool: string;
  inputSummary: string;
  resultSummary: string;
  linkedMessage: string;
  raw: unknown;
};

export type LayerKey = "metadata" | "context" | "system" | "tools" | "messages" | "latest";

export type DiffAnalysis = {
  badges: string[];
  systemChanged: boolean;
  toolsChanged: boolean;
  messagesDelta: number;
  metadataChanged: boolean;
  contextChanged: boolean;
  sizeDelta: number;
  changedLayerKeys: Set<LayerKey>;
};

export type StackLayer = {
  key: LayerKey;
  title: string;
  path: string;
  summary: string;
  icon: LucideIcon;
  tone: "metadata" | "context" | "system" | "tool" | "conversation" | "user";
  size: number;
  badges: Array<{ label: string; tone?: BadgeTone }>;
  raw: unknown;
  cache: string | null;
};

export type InspectorItem = {
  key: string;
  title: string;
  path: string;
  type: string;
  size: number;
  cache: string | null;
  diff: string;
  content: unknown;
};

export type RequestAnalysis = {
  capture: CaptureRecord;
  index: number;
  raw: Record<string, unknown>;
  model: string;
  maxTokens: number | null;
  stream: boolean;
  thinkingType: string;
  contextManagementSummary: string;
  metadata: unknown;
  systemBlocks: ContentBlockAnalysis[];
  messages: MessageAnalysis[];
  tools: ToolDefinitionAnalysis[];
  toolCalls: ToolCallAnalysis[];
  latestUserBlock: ContentBlockAnalysis | null;
  layers: StackLayer[];
  diff: DiffAnalysis;
  sizes: {
    metadata: number;
    context: number;
    system: number;
    tools: number;
    messages: number;
    latest: number;
    total: number;
  };
  cacheCount: number;
  largestLayer: string;
};

export type SessionAnalytics = {
  captures: CaptureRecord[];
  analyses: RequestAnalysis[];
  firstCapture: CaptureRecord | null;
  latestCapture: CaptureRecord | null;
  firstPrompt: string;
  latestPrompt: string;
  startAt: string | null;
  endAt: string | null;
  modelList: string[];
  requestCount: number;
  maxContextSize: number;
  latestContextSize: number;
  maxToolCount: number;
  latestToolCount: number;
  hasToolCalls: boolean;
  hasContextManagement: boolean;
  cacheCount: number;
  toolNames: string[];
  trend: number[];
  recentRequests: RequestAnalysis[];
  latestDiffBadges: string[];
};

export type BadgeTone = "blue" | "teal" | "amber" | "rose" | "violet";
export type DetailView = "stack" | "messages" | "tools" | "raw";
export type TimeFilter = "all" | "24h" | "7d";
export type SortMode = "latest" | "context" | "requests";

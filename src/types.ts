export type RedactedHeaders = Record<string, string>;

export interface UpstreamConfig {
  baseUrl: string;
  messagesUrl: string;
  apiKey?: string;
  apiVersion: string;
  source: "override" | "environment" | "default";
}

export interface PromptGatewayConfig {
  host: string;
  port: number;
  outputRoot: string;
  writeJson: boolean;
  writeHtml: boolean;
  htmlTitle: string;
  timezone?: string;
  upstreamOverrides?: Partial<{
    baseUrl: string;
    apiKey: string;
    apiVersion: string;
  }>;
}

export interface PromptCaptureRecord {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  method: string;
  path: string;
  sessionId: string | null;
  requestHeaders: {
    redacted: RedactedHeaders;
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
    body: {
      raw: unknown;
    };
  };
}

export interface PromptCaptureListItem {
  requestId: string;
  capturedAt: string;
  timestampMs: number;
  sessionId: string | null;
  model: string | null;
  maxTokens: number | null;
  stream: boolean;
  status: number;
  durationMs: number;
  ok: boolean;
  promptTextPreview: string;
  contextSize: number;
  toolCount: number;
  toolNames: string[];
  hasToolCalls: boolean;
  hasContextManagement: boolean;
}

export interface PromptSessionListItem {
  sessionId: string | null;
  latestRequestId: string;
  firstCapturedAt: string;
  latestCapturedAt: string;
  firstTimestampMs: number;
  latestTimestampMs: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  streamCount: number;
  durationMs: number;
  models: string[];
  promptTextPreview: string;
  firstPromptTextPreview: string;
  maxContextSize: number;
  latestContextSize: number;
  maxToolCount: number;
  latestToolCount: number;
  hasToolCalls: boolean;
  hasContextManagement: boolean;
  toolNames: string[];
}

export interface RenderPromptHtmlOptions {
  title?: string;
}

export interface CaptureRequestMeta {
  method: string;
  path: string;
  sessionId: string | null;
  redactedHeaders: RedactedHeaders;
  body: unknown;
}

export interface CaptureResponseMeta {
  status: number;
  durationMs: number;
  ok: boolean;
  error?: string;
  body: unknown;
}

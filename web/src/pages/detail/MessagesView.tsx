import { MessageSquareText } from "lucide-react";

import { Badge } from "../../components/ui";
import type { RequestAnalysis } from "../../types";

export function MessagesView({
  analysis,
  onSelect,
}: {
  analysis: RequestAnalysis;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="view-section">
      <div className="section-title">
        <h3>
          <MessageSquareText aria-hidden="true" />
          Messages 结构视图
        </h3>
        <span className="small-note">自动注入内容与真实用户输入分开展示</span>
      </div>
      <div className="message-list">
        {analysis.messages.map((message) => (
          <article
            className={message.isLatestUser ? "message-row latest" : "message-row"}
            key={message.path}
          >
            <button className="message-role" onClick={() => onSelect(message.path)} type="button">
              <span className={message.role === "assistant" ? "role-dot assistant" : "role-dot"} />
              {message.role}
            </button>
            <div className="message-copy">
              <div className="message-preview">{message.preview}</div>
              <div className="message-path">{message.path}</div>
              <details className="content-details">
                <summary>查看 {message.blocks.length} 个 content block</summary>
                <div className="content-block-list">
                  {message.blocks.map((block) => (
                    <button
                      className="content-block"
                      key={block.path}
                      onClick={() => onSelect(block.path)}
                      type="button"
                    >
                      <span>
                        <Badge
                          label={block.isSystemReminder ? "system reminder" : block.type}
                          tone={block.isSystemReminder ? "rose" : undefined}
                        />
                        {block.cache ? <Badge label={block.cache} tone="violet" /> : null}
                      </span>
                      <strong>{block.title}</strong>
                      <span>{block.preview}</span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <div className="message-meta">
              {message.isLatestUser ? <Badge label="latest input" tone="blue" /> : null}
              {message.hasSystemReminder ? <Badge label="system reminder" tone="rose" /> : null}
              {message.hasThinking ? <Badge label="thinking" tone="teal" /> : null}
              {message.hasToolUse ? <Badge label="tool_use" tone="amber" /> : null}
              {message.hasToolResult ? <Badge label="tool_result" tone="amber" /> : null}
              <Badge label={`${message.contentTypes.length} blocks`} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

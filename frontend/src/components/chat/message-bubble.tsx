"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, FileText, User, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackButtons } from "./feedback-buttons";
import type { ChatMessage, DocResponse } from "@/types";

// filename to short name mapping
function getShortName(filename: string): string {
  if (filename.includes("ガス事業法")) return "ガス事業法";
  if (filename.includes("液化")) return "液化石油ガス法";
  if (filename.includes("高圧ガス")) return "高圧ガス保安法";
  // fallback: remove extension and any suffix after underscore
  return filename.replace(/\.[^.]+$/, "").replace(/[＿_].*$/, "");
}

// Color for each document tab
function getDocColor(index: number): { tab: string; activeTab: string; border: string } {
  const colors = [
    { tab: "text-red-600", activeTab: "bg-red-50 border-red-500 text-red-700", border: "border-red-200" },
    { tab: "text-blue-600", activeTab: "bg-blue-50 border-blue-500 text-blue-700", border: "border-blue-200" },
    { tab: "text-green-600", activeTab: "bg-green-50 border-green-500 text-green-700", border: "border-green-200" },
  ];
  return colors[index % colors.length];
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [showSources, setShowSources] = useState(false);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const isUser = message.role === "user";

  // Multi-document response
  if (!isUser && message.docResponses && message.docResponses.length > 0) {
    const activeDoc = message.docResponses[activeDocIndex];
    const activeSources = activeDoc?.sources || [];

    return (
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="h-4 w-4" />
        </div>

        <div className="flex max-w-[85%] flex-col gap-2 flex-1">
          {/* Document tabs */}
          <div className="flex gap-1 flex-wrap">
            {message.docResponses.map((doc, idx) => {
              const colors = getDocColor(idx);
              const isActive = idx === activeDocIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveDocIndex(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? colors.activeTab
                      : `border-transparent text-muted-foreground hover:text-foreground hover:bg-muted`
                  }`}
                >
                  {doc.isStreaming && !doc.isDone && (
                    <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
                  )}
                  {getShortName(doc.filename)}
                </button>
              );
            })}
          </div>

          {/* Active document content */}
          {activeDoc && (
            <div className={`rounded-2xl px-4 py-2.5 bg-muted border ${getDocColor(activeDocIndex).border}`}>
              {activeDoc.isStreaming && !activeDoc.content ? (
                <div className="flex flex-col gap-2 py-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeDoc.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Sources for active doc */}
          {activeDoc && !activeDoc.isStreaming && activeSources.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <FileText className="h-3 w-3" />
                参照元 ({activeSources.length}件)
                {showSources ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showSources && (
                <div className="flex flex-col gap-1.5">
                  {activeSources.map((source, i) => (
                    <div
                      key={i}
                      className="rounded-md border bg-background p-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {source.filename}
                        </Badge>
                        {source.page_numbers && (
                          <span className="text-muted-foreground">
                            p.{source.page_numbers}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          ({Math.round(source.similarity * 100)}%)
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground line-clamp-2">
                        {source.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {!message.isStreaming && activeDoc?.content && (
            <FeedbackButtons chatLogId={message.id} />
          )}
        </div>
      </div>
    );
  }

  // Standard single message (user or old format)
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? "items-end" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          }`}
        >
          {message.isStreaming && !message.content ? (
            <div className="flex flex-col gap-2 py-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <FileText className="h-3 w-3" />
              参照元 ({message.sources.length}件)
              {showSources ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showSources && (
              <div className="flex flex-col gap-1.5">
                {message.sources.map((source, i) => (
                  <div
                    key={i}
                    className="rounded-md border bg-background p-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {source.filename}
                      </Badge>
                      {source.page_numbers && (
                        <span className="text-muted-foreground">
                          p.{source.page_numbers}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        ({Math.round(source.similarity * 100)}%)
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground line-clamp-2">
                      {source.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {!isUser && !message.isStreaming && message.content && (
          <FeedbackButtons chatLogId={message.id} />
        )}
      </div>
    </div>
  );
}

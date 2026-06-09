"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  User,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
} from "lucide-react";
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

/**
 * Render markdown with smaller, muted styling on citation lines (出典：...).
 * Also forces a paragraph break before each 出典 so it never inlines with the
 * preceding sentence even when the model omits the blank line.
 */
function MarkdownWithCitations({ content }: { content: string }) {
  // 箇条書きを「はっきりした・付きリスト」として描画するための前処理:
  //  1) インラインの「空白＋・」を改行に（語中の中黒は前に空白が無いので除外）
  //  2) 行頭の「・」を Markdown のリスト項目「- 」に変換（ul/li で明確な・を描画）
  //  3) 出典は段落として分離
  const processed = content
    .replace(/[ \t　]+・[ \t　]*/g, "\n・")
    .replace(/(^|\n)[ \t　]*・[ \t　]*/g, "$1- ")
    .replace(/\s*\n\s*(出典[：:])/g, "\n\n$1");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        ul: ({ children }) => (
          <ul className="my-1 flex list-none flex-col gap-1 pl-0">{children}</ul>
        ),
        li: ({ children }) => (
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[1px] shrink-0 select-none text-base font-bold leading-6 text-primary"
            >
              ・
            </span>
            <span className="min-w-0 flex-1">{children}</span>
          </li>
        ),
        p: ({ children, ...props }) => {
          const first = Array.isArray(children) ? children[0] : children;
          const text = typeof first === "string" ? first : "";
          if (/^\s*出典[：:]/.test(text)) {
            return (
              <p
                className="!text-xs !text-muted-foreground !my-1 leading-snug"
                {...props}
              >
                {children}
              </p>
            );
          }
          return <p {...props}>{children}</p>;
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

// 文書外の一般知識との整合性バッジ（方式B）
function ConsistencyBadge({ verdict, note }: { verdict: string; note: string }) {
  const map: Record<
    string,
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    一致: {
      label: "一般知識とも整合",
      cls: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
      Icon: CheckCircle2,
    },
    部分一致: {
      label: "一部相違あり（要確認）",
      cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
      Icon: AlertTriangle,
    },
    不一致: {
      label: "一般知識と相違（要確認）",
      cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
      Icon: AlertTriangle,
    },
  };
  const s = map[verdict] || {
    label: "整合性: 判定対象外",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Info,
  };
  const Icon = s.Icon;
  return (
    <div className={`flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${s.cls}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <span className="font-medium">{s.label}</span>
        {note && <span className="ml-1 opacity-90">— {note}</span>}
      </div>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [showSources, setShowSources] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const isUser = message.role === "user";

  // Multi-document response
  if (!isUser && message.docResponses && message.docResponses.length > 0) {
    const activeDoc = message.docResponses[activeDocIndex];
    const activeSources = activeDoc?.sources || [];

    return (
      <div className="flex gap-3">
        <img
          src="/dog-avatar.png"
          alt="アシスタント"
          className="h-10 w-10 shrink-0 rounded-full object-cover bg-white"
        />

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
                  <MarkdownWithCitations content={activeDoc.content} />
                </div>
              )}
            </div>
          )}

          {/* 整合性バッジ（文書外の一般知識との照合結果） */}
          {activeDoc && !activeDoc.isStreaming && activeDoc.consistency && (
            <ConsistencyBadge
              verdict={activeDoc.consistency.verdict}
              note={activeDoc.consistency.note}
            />
          )}

          {/* 参考（文書外の一般情報） */}
          {activeDoc && !activeDoc.isStreaming && activeDoc.reference && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowReference(!showReference)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="h-3 w-3" />
                参考（文書外の一般情報）
                {showReference ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showReference && (
                <div className="rounded-md border bg-background p-2 text-xs">
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    ※ 社内文書ではなく AI の一般知識による参考情報です。最新の法令と異なる場合があります。回答の根拠は上の本文・出典をご確認ください。
                  </p>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <MarkdownWithCitations content={activeDoc.reference} />
                  </div>
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
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
      ) : (
        <img
          src="/dog-avatar.png"
          alt="アシスタント"
          className="h-10 w-10 shrink-0 rounded-full object-cover bg-white"
        />
      )}

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
              <MarkdownWithCitations content={message.content} />
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

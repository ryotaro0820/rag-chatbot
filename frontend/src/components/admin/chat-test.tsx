"use client";

import { useState, useEffect } from "react";
import {
  Send,
  Bot,
  Loader2,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listChatbots } from "@/lib/api";
import { toast } from "sonner";
import type { Chatbot } from "@/types";

interface SourceDoc {
  filename: string;
  content: string;
  similarity: number;
}

interface TestResult {
  text: string;
  sources: SourceDoc[];
  promptTokens: number;
  completionTokens: number;
}

export function ChatTest() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedChatbotId, setSelectedChatbotId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    listChatbots()
      .then((bots) => {
        setChatbots(bots.filter((b) => b.is_active));
        if (bots.length > 0) setSelectedChatbotId(bots[0].id);
      })
      .catch(() => toast.error("チャットボット一覧の取得に失敗しました"));
  }, []);

  const handleTest = async () => {
    if (!question.trim()) {
      toast.error("質問を入力してください");
      return;
    }
    if (!selectedChatbotId) {
      toast.error("チャットボットを選択してください");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question.trim(),
          history: [],
          session_id: `test-${Date.now()}`,
          chatbot_id: selectedChatbotId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "テスト送信に失敗しました");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sources: SourceDoc[] = [];
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "token" || parsed.token) {
              fullText += parsed.token || parsed.content || "";
              setResult({
                text: fullText,
                sources,
                promptTokens,
                completionTokens,
              });
            }

            if (parsed.type === "sources" && parsed.sources) {
              sources = parsed.sources;
              setResult({
                text: fullText,
                sources,
                promptTokens,
                completionTokens,
              });
            }

            if (parsed.type === "usage" || parsed.usage) {
              const usage = parsed.usage || parsed;
              promptTokens = usage.prompt_tokens || 0;
              completionTokens = usage.completion_tokens || 0;
              setResult({
                text: fullText,
                sources,
                promptTokens,
                completionTokens,
              });
            }

            // Handle non-SSE streamed JSON (plain text chunks)
            if (parsed.content) {
              fullText += parsed.content;
              setResult({
                text: fullText,
                sources,
                promptTokens,
                completionTokens,
              });
            }
          } catch {
            // Not JSON, might be plain text
          }
        }
      }

      // If we got text but no structured result yet
      if (fullText && !result) {
        setResult({
          text: fullText,
          sources,
          promptTokens,
          completionTokens,
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "テスト送信に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          テスト送信
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Chatbot selector */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              チャットボット
            </label>
            <Select
              value={selectedChatbotId}
              onValueChange={(v) => setSelectedChatbotId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="チャットボットを選択" />
              </SelectTrigger>
              <SelectContent>
                {chatbots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Question input + send */}
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="テスト質問を入力..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) handleTest();
              }}
              disabled={loading}
            />
            <Button onClick={handleTest} disabled={loading || !question.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-1">テスト送信</span>
            </Button>
          </div>

          {/* Result area */}
          {result && (
            <div className="flex flex-col gap-3 rounded-md border p-4">
              {/* Response text */}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  回答:
                </p>
                <div className="max-h-80 overflow-y-auto rounded-md border bg-background p-3">
                  <p className="whitespace-pre-wrap text-sm">{result.text}</p>
                </div>
              </div>

              {/* Sources */}
              {result.sources.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    参照ドキュメント:
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.sources.map((src, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded border p-2"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {src.filename}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {(src.similarity * 100).toFixed(1)}%
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {src.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Token usage */}
              {(result.promptTokens > 0 || result.completionTokens > 0) && (
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    Prompt: {result.promptTokens.toLocaleString()} tokens
                  </span>
                  <span>
                    Completion: {result.completionTokens.toLocaleString()}{" "}
                    tokens
                  </span>
                  <span>
                    合計:{" "}
                    {(
                      result.promptTokens + result.completionTokens
                    ).toLocaleString()}{" "}
                    tokens
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

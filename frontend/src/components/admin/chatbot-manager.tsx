"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Settings2,
  FileText,
  Save,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listChatbots,
  updateChatbot,
  listDocuments,
  getChatbotDocuments,
  updateChatbotDocuments,
} from "@/lib/api";
import { toast } from "sonner";
import type { Chatbot, DocumentInfo } from "@/types";

export function ChatbotManager() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [bots, docs] = await Promise.all([
        listChatbots(),
        listDocuments(),
      ]);
      setChatbots(bots);
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to load chatbot data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          チャットボット管理
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {chatbots.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            チャットボットが設定されていません
          </p>
        )}
        {chatbots.map((bot) => (
          <ChatbotCard
            key={bot.id}
            chatbot={bot}
            documents={documents}
            expanded={expandedId === bot.id}
            onToggle={() =>
              setExpandedId(expandedId === bot.id ? null : bot.id)
            }
            onUpdated={loadData}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface ChatbotCardProps {
  chatbot: Chatbot;
  documents: DocumentInfo[];
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}

function ChatbotCard({
  chatbot,
  documents,
  expanded,
  onToggle,
  onUpdated,
}: ChatbotCardProps) {
  const [name, setName] = useState(chatbot.name);
  const [description, setDescription] = useState(chatbot.description || "");
  const [threshold, setThreshold] = useState(chatbot.similarity_threshold);
  const [topK, setTopK] = useState(chatbot.top_k);
  const [systemPrompt, setSystemPrompt] = useState(
    chatbot.system_prompt || ""
  );
  const [assignedDocIds, setAssignedDocIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);

  useEffect(() => {
    if (expanded && !docsLoaded) {
      getChatbotDocuments(chatbot.id).then((ids) => {
        setAssignedDocIds(ids);
        setDocsLoaded(true);
      });
    }
  }, [expanded, chatbot.id, docsLoaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateChatbot(chatbot.id, {
        name,
        description: description || null,
        similarity_threshold: threshold,
        top_k: topK,
        system_prompt: systemPrompt || null,
      });
      await updateChatbotDocuments(chatbot.id, assignedDocIds);
      toast.success(`${name} を更新しました`);
      onUpdated();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "更新に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleDoc = (docId: string) => {
    setAssignedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  return (
    <div className="rounded-lg border">
      {/* Collapsed header */}
      <button
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <Bot className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{chatbot.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {chatbot.slug}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            閾値: {Math.round(chatbot.similarity_threshold * 100)}% / Top-K:{" "}
            {chatbot.top_k}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-4">
          {/* Basic settings */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">名前</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="チャットボット名"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">説明</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="チャットボットの説明"
              />
            </div>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium">
                <Settings2 className="h-3 w-3" />
                類似度閾値: {Math.round(threshold * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(threshold * 100)}
                onChange={(e) => setThreshold(Number(e.target.value) / 100)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0% (全て抽出)</span>
                <span>100% (完全一致のみ)</span>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium">
                <Settings2 className="h-3 w-3" />
                Top-K (検索件数): {topK}
              </label>
              <input
                type="range"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1件</span>
                <span>20件</span>
              </div>
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-1 block text-xs font-medium">
              システムプロンプト
            </label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="システムプロンプト（{context}でRAG文脈が挿入されます）"
              rows={4}
              className="text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {"{context}"} の部分に検索された文書の内容が挿入されます
            </p>
          </div>

          {/* Document assignment */}
          <div>
            <label className="mb-2 flex items-center gap-1 text-xs font-medium">
              <FileText className="h-3 w-3" />
              対象文書 ({assignedDocIds.length}件選択中)
            </label>
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                文書がアップロードされていません
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {/* Select all / deselect all */}
                <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() =>
                      setAssignedDocIds(documents.map((d) => d.id))
                    }
                  >
                    全選択
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setAssignedDocIds([])}
                  >
                    全解除
                  </Button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    未選択の場合は全文書が対象
                  </span>
                </div>
                {documents.map((doc) => {
                  const isSelected = assignedDocIds.includes(doc.id);
                  return (
                    <button
                      key={doc.id}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                      onClick={() => toggleDoc(doc.id)}
                    >
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span className="flex-1 truncate">{doc.filename}</span>
                      {doc.category_name && (
                        <Badge variant="secondary" className="text-[10px]">
                          {doc.category_name}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save button */}
          <Button onClick={handleSave} disabled={saving} className="self-end">
            <Save className="mr-1 h-4 w-4" />
            {saving ? "保存中..." : "設定を保存"}
          </Button>
        </div>
      )}
    </div>
  );
}

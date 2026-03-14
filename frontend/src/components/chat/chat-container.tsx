"use client";

import { useState, useCallback, useEffect } from "react";
import { History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { SuggestedQuestions } from "./suggested-questions";
import { sendChatMessage } from "@/lib/api";
import {
  getConversations,
  saveConversation,
  deleteConversation,
  createNewConversation,
  generateTitle,
} from "@/lib/chat-storage";
import type { ChatMessage, Conversation, SourceReference } from "@/types";

export function ChatContainer() {
  const [conversation, setConversation] = useState<Conversation>(
    createNewConversation()
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load conversations from localStorage
  useEffect(() => {
    setConversations(getConversations());
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;

      const userMessage: ChatMessage = { role: "user", content: message };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      const updatedMessages = [
        ...conversation.messages,
        userMessage,
        assistantMessage,
      ];
      setConversation((prev) => ({ ...prev, messages: updatedMessages }));
      setIsStreaming(true);

      try {
        const history = conversation.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const { reader } = sendChatMessage(
          message,
          history,
          conversation.id
        );
        const decoder = new TextDecoder();
        let fullContent = "";
        let sources: SourceReference[] = [];
        let chatLogId: number | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text
            .split("\n")
            .filter((line) => line.startsWith("data: "));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "chunk") {
                fullContent += data.content;
                setConversation((prev) => {
                  const msgs = [...prev.messages];
                  const last = msgs[msgs.length - 1];
                  msgs[msgs.length - 1] = {
                    ...last,
                    content: fullContent,
                    isStreaming: true,
                  };
                  return { ...prev, messages: msgs };
                });
              } else if (data.type === "sources") {
                sources = data.sources;
              } else if (data.type === "done") {
                chatLogId = data.chat_log_id;
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }

        // Finalize message
        setConversation((prev) => {
          const msgs = [...prev.messages];
          msgs[msgs.length - 1] = {
            role: "assistant",
            content: fullContent,
            sources,
            id: chatLogId,
            isStreaming: false,
          };
          const updated = {
            ...prev,
            messages: msgs,
            title: generateTitle(msgs),
            updatedAt: new Date().toISOString(),
          };
          saveConversation(updated);
          setConversations(getConversations());
          return updated;
        });
      } catch (error) {
        setConversation((prev) => {
          const msgs = [...prev.messages];
          msgs[msgs.length - 1] = {
            role: "assistant",
            content:
              error instanceof Error
                ? `エラー: ${error.message}`
                : "エラーが発生しました。もう一度お試しください。",
            isStreaming: false,
          };
          return { ...prev, messages: msgs };
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [conversation, isStreaming]
  );

  const handleNewChat = () => {
    const newConv = createNewConversation();
    setConversation(newConv);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setConversation(conv);
    setShowHistory(false);
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversation(id);
    setConversations(getConversations());
    if (conversation.id === id) {
      setConversation(createNewConversation());
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      {showHistory && (
        <div className="w-72 border-r bg-muted/30 flex flex-col">
          <div className="flex items-center justify-between border-b p-3">
            <span className="text-sm font-medium">会話履歴</span>
            <Button variant="ghost" size="icon" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 border-b px-3 py-2 cursor-pointer hover:bg-muted ${
                  conv.id === conversation.id ? "bg-muted" : ""
                }`}
                onClick={() => handleSelectConversation(conv)}
              >
                <span className="flex-1 truncate text-sm">{conv.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                会話履歴がありません
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-medium">社内文書チャットボット</h1>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            <Plus className="mr-1 h-3 w-3" />
            新しい会話
          </Button>
        </div>

        {/* Messages or suggestions */}
        {conversation.messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <SuggestedQuestions onSelect={handleSend} />
          </div>
        ) : (
          <MessageList messages={conversation.messages} />
        )}

        {/* Input */}
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
}

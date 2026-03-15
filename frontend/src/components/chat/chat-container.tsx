"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Plus,
  Trash2,
  ArrowLeft,
  Shield,
  Search,
  Telescope,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { SuggestedQuestions } from "./suggested-questions";
import { sendChatMessage, getChatbot } from "@/lib/api";
import {
  getConversations,
  saveConversation,
  deleteConversation,
  createNewConversation,
  generateTitle,
} from "@/lib/chat-storage";
import type { ChatMessage, Conversation, SourceReference, Chatbot, DocResponse } from "@/types";

interface ChatContainerProps {
  chatbotSlug?: string;
}

const SLUG_ICONS: Record<string, React.ReactNode> = {
  strict: <Shield className="h-4 w-4" />,
  standard: <Search className="h-4 w-4" />,
  broad: <Telescope className="h-4 w-4" />,
};

const SLUG_BADGE_COLORS: Record<string, string> = {
  strict: "bg-blue-100 text-blue-700",
  standard: "bg-green-100 text-green-700",
  broad: "bg-orange-100 text-orange-700",
};

export function ChatContainer({ chatbotSlug }: ChatContainerProps) {
  const router = useRouter();
  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [conversation, setConversation] = useState<Conversation>(
    createNewConversation()
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load chatbot config
  useEffect(() => {
    if (!chatbotSlug) return;
    async function loadChatbot() {
      try {
        const bot = await getChatbot(chatbotSlug!);
        setChatbot(bot);
        // Create a new conversation linked to this chatbot
        const conv = createNewConversation();
        conv.chatbotId = bot.id;
        setConversation(conv);
      } catch {
        // Chatbot not found, redirect to selector
        router.push("/");
      }
    }
    loadChatbot();
  }, [chatbotSlug, router]);

  // Load conversations from localStorage (filtered by chatbot)
  useEffect(() => {
    const allConvs = getConversations();
    if (chatbot) {
      setConversations(allConvs.filter((c) => c.chatbotId === chatbot.id));
    } else {
      setConversations(allConvs);
    }
  }, [chatbot]);

  const handleSend = useCallback(
    async (message: string) => {
      if (isStreaming) return;

      const userMessage: ChatMessage = { role: "user", content: message };
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "",
        isStreaming: true,
        docResponses: [],
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
          conversation.id,
          chatbot?.id
        );
        const decoder = new TextDecoder();
        const docResponses: DocResponse[] = [];
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

              if (data.type === "doc_start") {
                docResponses[data.doc_index] = {
                  doc_index: data.doc_index,
                  document_id: data.document_id,
                  filename: data.filename,
                  content: "",
                  sources: [],
                  isStreaming: true,
                  isDone: false,
                };
                setConversation((prev) => {
                  const msgs = [...prev.messages];
                  msgs[msgs.length - 1] = {
                    ...msgs[msgs.length - 1],
                    docResponses: [...docResponses],
                    isStreaming: true,
                  };
                  return { ...prev, messages: msgs };
                });
              } else if (data.type === "chunk" && data.doc_index !== undefined) {
                if (docResponses[data.doc_index]) {
                  docResponses[data.doc_index].content += data.content;
                  setConversation((prev) => {
                    const msgs = [...prev.messages];
                    msgs[msgs.length - 1] = {
                      ...msgs[msgs.length - 1],
                      docResponses: [...docResponses],
                      isStreaming: true,
                    };
                    return { ...prev, messages: msgs };
                  });
                }
              } else if (data.type === "doc_sources") {
                if (docResponses[data.doc_index]) {
                  docResponses[data.doc_index].sources = data.sources;
                }
              } else if (data.type === "doc_done") {
                if (docResponses[data.doc_index]) {
                  docResponses[data.doc_index].isStreaming = false;
                  docResponses[data.doc_index].isDone = true;
                  setConversation((prev) => {
                    const msgs = [...prev.messages];
                    msgs[msgs.length - 1] = {
                      ...msgs[msgs.length - 1],
                      docResponses: [...docResponses],
                      isStreaming: true,
                    };
                    return { ...prev, messages: msgs };
                  });
                }
              } else if (data.type === "done") {
                chatLogId = data.chat_log_id;
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }

        // Finalize: combine content from all doc responses
        const combinedContent = docResponses
          .map((d) => `**${d.filename}**\n${d.content}`)
          .join("\n\n---\n\n");
        const allSources = docResponses.flatMap((d) => d.sources);

        setConversation((prev) => {
          const msgs = [...prev.messages];
          msgs[msgs.length - 1] = {
            role: "assistant",
            content: combinedContent,
            sources: allSources,
            docResponses: [...docResponses],
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
          const allConvs = getConversations();
          if (chatbot) {
            setConversations(allConvs.filter((c) => c.chatbotId === chatbot.id));
          } else {
            setConversations(allConvs);
          }
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
    [conversation, isStreaming, chatbot]
  );

  const handleNewChat = () => {
    const newConv = createNewConversation();
    if (chatbot) {
      newConv.chatbotId = chatbot.id;
    }
    setConversation(newConv);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setConversation(conv);
    setShowHistory(false);
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversation(id);
    const allConvs = getConversations();
    if (chatbot) {
      setConversations(allConvs.filter((c) => c.chatbotId === chatbot.id));
    } else {
      setConversations(allConvs);
    }
    if (conversation.id === id) {
      handleNewChat();
    }
  };

  const slug = chatbot?.slug || "";
  const icon = SLUG_ICONS[slug] || <Bot className="h-4 w-4" />;
  const badgeClass = SLUG_BADGE_COLORS[slug] || "bg-gray-100 text-gray-700";

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
            onClick={() => router.push("/")}
            title="チャットボット選択に戻る"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            {icon}
            <h1 className="text-sm font-medium">
              {chatbot?.name || "チャットボット"}
            </h1>
            {chatbot && (
              <Badge className={`${badgeClass} text-[10px]`}>
                閾値 {Math.round(chatbot.similarity_threshold * 100)}%
              </Badge>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            <Plus className="mr-1 h-3 w-3" />
            新しい会話
          </Button>
        </div>

        {/* Messages or suggestions */}
        {conversation.messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <SuggestedQuestions
              onSelect={handleSend}
              chatbotName={chatbot?.name}
              chatbotDescription={chatbot?.description}
            />
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

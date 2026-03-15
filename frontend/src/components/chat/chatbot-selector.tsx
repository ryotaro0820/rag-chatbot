"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Droplets, Gauge, Bot, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listChatbots } from "@/lib/api";
import type { Chatbot } from "@/types";

const SLUG_ICONS: Record<string, React.ReactNode> = {
  "gas-business": <Flame className="h-8 w-8" />,
  "lpg-law": <Droplets className="h-8 w-8" />,
  "high-pressure-gas": <Gauge className="h-8 w-8" />,
  // 旧slug互換
  strict: <Flame className="h-8 w-8" />,
  standard: <Droplets className="h-8 w-8" />,
  broad: <Gauge className="h-8 w-8" />,
};

const SLUG_COLORS: Record<string, string> = {
  "gas-business": "from-red-500/10 to-red-600/5 border-red-200 hover:border-red-400",
  "lpg-law": "from-blue-500/10 to-blue-600/5 border-blue-200 hover:border-blue-400",
  "high-pressure-gas": "from-green-500/10 to-green-600/5 border-green-200 hover:border-green-400",
  strict: "from-red-500/10 to-red-600/5 border-red-200 hover:border-red-400",
  standard: "from-blue-500/10 to-blue-600/5 border-blue-200 hover:border-blue-400",
  broad: "from-green-500/10 to-green-600/5 border-green-200 hover:border-green-400",
};

const SLUG_ACCENT: Record<string, string> = {
  "gas-business": "bg-red-100 text-red-700",
  "lpg-law": "bg-blue-100 text-blue-700",
  "high-pressure-gas": "bg-green-100 text-green-700",
  strict: "bg-red-100 text-red-700",
  standard: "bg-blue-100 text-blue-700",
  broad: "bg-green-100 text-green-700",
};

export function ChatbotSelector() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const data = await listChatbots();
        setChatbots(data);
      } catch (err) {
        console.error("Failed to load chatbots:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSelect = (chatbot: Chatbot) => {
    router.push(`/chat/${chatbot.slug}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Bot className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">法令チャットボット</h1>
        <p className="text-muted-foreground text-center max-w-md">
          質問したい法令を選択してください。
          各チャットボットは対応する法令文書のみを参照して回答します。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-4xl">
        {chatbots.map((bot) => {
          const icon = SLUG_ICONS[bot.slug] || <Bot className="h-8 w-8" />;
          const colorClass = SLUG_COLORS[bot.slug] || "from-gray-500/10 to-gray-600/5 border-gray-200 hover:border-gray-400";
          const accentClass = SLUG_ACCENT[bot.slug] || "bg-gray-100 text-gray-700";

          return (
            <Card
              key={bot.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 bg-gradient-to-b ${colorClass}`}
              onClick={() => handleSelect(bot)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accentClass}`}>
                    {icon}
                  </div>
                </div>
                <CardTitle className="text-lg mt-2">{bot.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {bot.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {chatbots.length === 0 && !loading && (
        <p className="text-muted-foreground mt-8">
          チャットボットが設定されていません。管理画面から設定してください。
        </p>
      )}
    </div>
  );
}

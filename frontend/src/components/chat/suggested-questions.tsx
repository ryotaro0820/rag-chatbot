"use client";

import { MessageSquare } from "lucide-react";

const SUGGESTIONS = [
  "ガス事業者の許可要件は？",
  "液化石油ガスの販売に必要な資格は？",
  "高圧ガスの貯蔵基準について教えてください",
  "保安検査の頻度はどのくらいですか？",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  chatbotName?: string;
  chatbotDescription?: string | null;
}

export function SuggestedQuestions({
  onSelect,
  chatbotName,
  chatbotDescription,
}: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="flex flex-col items-center gap-2">
        <MessageSquare className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          {chatbotName || "社内文書チャットボット"}
        </h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {chatbotDescription || "社内文書に基づいて質問にお答えします"}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:bg-muted"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

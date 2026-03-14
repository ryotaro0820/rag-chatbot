"use client";

import { MessageSquare } from "lucide-react";

const SUGGESTIONS = [
  "就業規則について教えてください",
  "有給休暇の申請方法は？",
  "経費精算の手順を教えてください",
  "リモートワークのルールは？",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="flex flex-col items-center gap-2">
        <MessageSquare className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">社内文書チャットボット</h2>
        <p className="text-sm text-muted-foreground">
          社内文書に基づいて質問にお答えします
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

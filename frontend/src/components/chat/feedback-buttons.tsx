"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/lib/api";

interface FeedbackButtonsProps {
  chatLogId?: number;
}

export function FeedbackButtons({ chatLogId }: FeedbackButtonsProps) {
  const [selected, setSelected] = useState<"up" | "down" | null>(null);

  if (!chatLogId) return null;

  const handleFeedback = async (rating: "up" | "down") => {
    setSelected(rating);
    try {
      await submitFeedback(chatLogId, rating);
    } catch {
      // Silently fail - non-critical
    }
  };

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${selected === "up" ? "text-green-600" : "text-muted-foreground"}`}
        onClick={() => handleFeedback("up")}
        disabled={selected !== null}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${selected === "down" ? "text-red-600" : "text-muted-foreground"}`}
        onClick={() => handleFeedback("down")}
        disabled={selected !== null}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
    </div>
  );
}

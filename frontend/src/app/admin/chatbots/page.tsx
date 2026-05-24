"use client";

import { ChatbotManager } from "@/components/admin/chatbot-manager";
import { ChatTest } from "@/components/admin/chat-test";

export default function ChatbotsPage() {
  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      <ChatbotManager />
      <ChatTest />
    </div>
  );
}

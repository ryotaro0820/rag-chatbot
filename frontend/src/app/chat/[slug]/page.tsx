import { ChatContainer } from "@/components/chat/chat-container";

interface ChatPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChatWithBotPage({ params }: ChatPageProps) {
  const { slug } = await params;
  return <ChatContainer chatbotSlug={slug} />;
}

export interface DocResponse {
  doc_index: number;
  document_id: string;
  filename: string;
  content: string;
  sources: SourceReference[];
  isStreaming: boolean;
  isDone: boolean;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  sources?: SourceReference[];
  isStreaming?: boolean;
  docResponses?: DocResponse[];
}

export interface SourceReference {
  document_id: string;
  filename: string;
  content: string;
  page_numbers: string | null;
  similarity: number;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  category_id: string | null;
  category_name: string | null;
  file_size: number | null;
  chunk_count: number | null;
  version: number;
  uploaded_at: string;
}

export interface ChunkPreview {
  id: string;
  chunk_index: number;
  content: string;
  page_numbers: string | null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  created_at: string;
}

export interface ChatLogEntry {
  id: number;
  session_id: string;
  client_ip: string | null;
  user_message: string;
  assistant_message: string | null;
  source_documents: Record<string, unknown>[] | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
}

export interface UsageDailySummary {
  date: string;
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_embedding_tokens: number;
  estimated_cost_usd: number;
}

export interface FeedbackSummary {
  total: number;
  up_count: number;
  down_count: number;
  up_ratio: number;
}

export interface PopularQuestion {
  user_message: string;
  count: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  chatbotId?: string;
}

export interface Chatbot {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  similarity_threshold: number;
  top_k: number;
  system_prompt: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

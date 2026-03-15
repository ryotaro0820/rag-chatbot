import type {
  DocumentInfo,
  ChunkPreview,
  CategoryInfo,
  ChatLogEntry,
  UsageDailySummary,
  FeedbackSummary,
  PopularQuestion,
  Chatbot,
} from "@/types";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// --- Admin Auth ---

export async function adminLogin(
  email: string,
  password: string
): Promise<{ access_token: string; user_email: string }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "ログインに失敗しました");
  }
  return res.json();
}

// --- Documents ---

export async function uploadDocuments(
  files: File[],
  categoryId?: string
): Promise<{ results: { filename: string; success: boolean; document_id?: string; chunk_count?: number; error?: string }[] }> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  if (categoryId) formData.append("category_id", categoryId);

  const res = await fetch("/api/documents/upload", {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "アップロードに失敗しました");
  }
  return res.json();
}

export async function replaceDocument(
  documentId: string,
  file: File
): Promise<{ success: boolean; chunk_count: number; version: number }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/documents/${documentId}/replace`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "差し替えに失敗しました");
  }
  return res.json();
}

export async function listDocuments(
  categoryId?: string
): Promise<DocumentInfo[]> {
  const url = new URL("/api/documents", window.location.origin);
  if (categoryId) url.searchParams.set("category_id", categoryId);

  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("文書一覧の取得に失敗しました");
  return res.json();
}

export async function getDocumentChunks(
  documentId: string
): Promise<ChunkPreview[]> {
  const res = await fetch(`/api/documents/${documentId}/chunks`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("チャンクの取得に失敗しました");
  return res.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/documents/${documentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("削除に失敗しました");
}

// --- Categories ---

export async function listCategories(): Promise<CategoryInfo[]> {
  const res = await fetch("/api/categories", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("カテゴリの取得に失敗しました");
  return res.json();
}

export async function createCategory(name: string): Promise<CategoryInfo> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("カテゴリの作成に失敗しました");
  return res.json();
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const res = await fetch(`/api/categories/${categoryId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("カテゴリの削除に失敗しました");
}

// --- Chat ---

export function sendChatMessage(
  message: string,
  history: { role: string; content: string }[],
  sessionId: string,
  chatbotId?: string
): { reader: ReadableStreamDefaultReader<Uint8Array>; abort: () => void } {
  const controller = new AbortController();

  const responsePromise = fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      session_id: sessionId,
      chatbot_id: chatbotId,
    }),
    signal: controller.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        const res = await responsePromise;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "チャットに失敗しました");
        }
        const reader = res.body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamController.enqueue(value);
        }
        streamController.close();
      } catch (e) {
        streamController.error(e);
      }
    },
  });

  return {
    reader: stream.getReader(),
    abort: () => controller.abort(),
  };
}

// --- Feedback ---

export async function submitFeedback(
  chatLogId: number,
  rating: "up" | "down"
): Promise<void> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_log_id: chatLogId, rating }),
  });
  if (!res.ok) throw new Error("フィードバックの送信に失敗しました");
}

// --- Chatbots ---

export async function listChatbots(): Promise<Chatbot[]> {
  const res = await fetch("/api/chatbots");
  if (!res.ok) throw new Error("チャットボットの取得に失敗しました");
  return res.json();
}

export async function getChatbot(slugOrId: string): Promise<Chatbot> {
  const res = await fetch(`/api/chatbots/${slugOrId}`);
  if (!res.ok) throw new Error("チャットボットが見つかりません");
  return res.json();
}

export async function updateChatbot(
  id: string,
  data: Partial<Chatbot>
): Promise<Chatbot> {
  const res = await fetch(`/api/chatbots/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("チャットボットの更新に失敗しました");
  return res.json();
}

export async function getChatbotDocuments(
  chatbotId: string
): Promise<string[]> {
  const res = await fetch(`/api/chatbots/${chatbotId}/documents`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("文書割り当ての取得に失敗しました");
  return res.json();
}

export async function updateChatbotDocuments(
  chatbotId: string,
  documentIds: string[]
): Promise<void> {
  const res = await fetch(`/api/chatbots/${chatbotId}/documents`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  if (!res.ok) throw new Error("文書割り当ての更新に失敗しました");
}

// --- Admin Dashboard ---

export async function getChatLogs(
  limit = 50,
  offset = 0
): Promise<ChatLogEntry[]> {
  const res = await fetch(
    `/api/admin/logs?limit=${limit}&offset=${offset}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error("ログの取得に失敗しました");
  return res.json();
}

export async function getUsageSummary(
  days = 30
): Promise<UsageDailySummary[]> {
  const res = await fetch(`/api/admin/usage?days=${days}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("使用量の取得に失敗しました");
  return res.json();
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const res = await fetch("/api/admin/feedback-summary", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("フィードバック集計の取得に失敗しました");
  return res.json();
}

export async function getPopularQuestions(
  limit = 10
): Promise<PopularQuestion[]> {
  const res = await fetch(
    `/api/admin/popular-questions?limit=${limit}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error("よくある質問の取得に失敗しました");
  return res.json();
}

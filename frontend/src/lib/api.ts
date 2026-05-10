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

/**
 * 認証付きfetch（HttpOnly Cookieを自動送信）
 */
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: "include", // HttpOnly Cookieを送信
  });
}

// --- Admin Auth ---

export async function adminLogin(
  email: string,
  password: string
): Promise<{ user_email: string }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
  const results: { filename: string; success: boolean; document_id?: string; chunk_count?: number; error?: string }[] = [];

  for (const file of files) {
    try {
      // 1. 署名付きアップロードURLを取得（Vercelの4.5MBボディ上限を回避するため、
      //    ブラウザから直接Supabase Storageに送る）
      const urlRes = await authFetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, file_size: file.size }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.error || "署名URLの取得に失敗しました");
      }
      const { document_id, storage_path, signed_url } = await urlRes.json();

      // 2. 署名付きURLにファイルを直接PUT
      const putRes = await fetch(signed_url, {
        method: "PUT",
        headers: {
          "Content-Type":
            file.type ||
            (file.name.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Storageへのアップロードに失敗しました (${putRes.status})`);
      }

      // 3. サーバーに処理を依頼（テキスト抽出 → ベクトル化 → DB保存）
      const procRes = await authFetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id,
          storage_path,
          filename: file.name,
          file_size: file.size,
          category_id: categoryId,
        }),
      });
      const procBody = await procRes.json().catch(() => ({}));
      if (!procRes.ok || !procBody.success) {
        throw new Error(procBody.error || "ファイル処理に失敗しました");
      }

      results.push({
        filename: file.name,
        success: true,
        document_id: procBody.document_id,
        chunk_count: procBody.chunk_count,
      });
    } catch (err) {
      results.push({
        filename: file.name,
        success: false,
        error: err instanceof Error ? err.message : "アップロードに失敗しました",
      });
    }
  }

  return { results };
}

export async function replaceDocument(
  documentId: string,
  file: File
): Promise<{ success: boolean; chunk_count: number; version: number }> {
  // 1. 署名付きアップロードURLを取得
  const urlRes = await authFetch(`/api/documents/${documentId}/replace-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, file_size: file.size }),
  });
  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}));
    throw new Error(err.error || "署名URLの取得に失敗しました");
  }
  const { storage_path, signed_url } = await urlRes.json();

  // 2. 署名付きURLにファイルを直接PUT
  const putRes = await fetch(signed_url, {
    method: "PUT",
    headers: {
      "Content-Type":
        file.type ||
        (file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Storageへのアップロードに失敗しました (${putRes.status})`);
  }

  // 3. サーバーに処理を依頼
  const res = await authFetch(`/api/documents/${documentId}/replace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storage_path,
      filename: file.name,
      file_size: file.size,
    }),
  });
  const procBody = await res.json().catch(() => ({}));
  if (!res.ok || !procBody.success) {
    throw new Error(procBody.error || "差し替えに失敗しました");
  }
  return procBody;
}

export async function listDocuments(
  categoryId?: string
): Promise<DocumentInfo[]> {
  const url = new URL("/api/documents", window.location.origin);
  if (categoryId) url.searchParams.set("category_id", categoryId);

  const res = await authFetch(url.toString());
  if (!res.ok) throw new Error("文書一覧の取得に失敗しました");
  return res.json();
}

export async function getDocumentChunks(
  documentId: string
): Promise<ChunkPreview[]> {
  const res = await authFetch(`/api/documents/${documentId}/chunks`);
  if (!res.ok) throw new Error("チャンクの取得に失敗しました");
  return res.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await authFetch(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("削除に失敗しました");
}

// --- Categories ---

export async function listCategories(): Promise<CategoryInfo[]> {
  const res = await authFetch("/api/categories");
  if (!res.ok) throw new Error("カテゴリの取得に失敗しました");
  return res.json();
}

export async function createCategory(name: string): Promise<CategoryInfo> {
  const res = await authFetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("カテゴリの作成に失敗しました");
  return res.json();
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const res = await authFetch(`/api/categories/${categoryId}`, {
    method: "DELETE",
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
  const res = await authFetch(`/api/chatbots/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("チャットボットの更新に失敗しました");
  return res.json();
}

export async function getChatbotDocuments(
  chatbotId: string
): Promise<string[]> {
  const res = await authFetch(`/api/chatbots/${chatbotId}/documents`);
  if (!res.ok) throw new Error("文書割り当ての取得に失敗しました");
  return res.json();
}

export async function updateChatbotDocuments(
  chatbotId: string,
  documentIds: string[]
): Promise<void> {
  const res = await authFetch(`/api/chatbots/${chatbotId}/documents`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  if (!res.ok) throw new Error("文書割り当ての更新に失敗しました");
}

// --- Admin Dashboard ---

export async function getChatLogs(
  limit = 50,
  offset = 0
): Promise<ChatLogEntry[]> {
  const res = await authFetch(
    `/api/admin/logs?limit=${limit}&offset=${offset}`
  );
  if (!res.ok) throw new Error("ログの取得に失敗しました");
  return res.json();
}

export async function getUsageSummary(
  days = 30
): Promise<UsageDailySummary[]> {
  const res = await authFetch(`/api/admin/usage?days=${days}`);
  if (!res.ok) throw new Error("使用量の取得に失敗しました");
  return res.json();
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const res = await authFetch("/api/admin/feedback-summary");
  if (!res.ok) throw new Error("フィードバック集計の取得に失敗しました");
  return res.json();
}

export async function getPopularQuestions(
  limit = 10
): Promise<PopularQuestion[]> {
  const res = await authFetch(
    `/api/admin/popular-questions?limit=${limit}`
  );
  if (!res.ok) throw new Error("よくある質問の取得に失敗しました");
  return res.json();
}

// --- Feedback Details ---

export interface FeedbackDetail {
  id: number;
  chat_log_id: number;
  user_message: string;
  assistant_message: string | null;
  created_at: string;
}

export async function getFeedbackDetails(): Promise<FeedbackDetail[]> {
  const res = await authFetch("/api/admin/feedback-details");
  if (!res.ok) throw new Error("低評価フィードバックの取得に失敗しました");
  return res.json();
}

// --- Change Password ---

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await authFetch("/api/admin/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "パスワード変更に失敗しました");
  }
}

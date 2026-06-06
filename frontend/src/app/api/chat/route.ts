import { NextRequest, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getOpenAI } from "@/lib/server/openai";
import { createChatStream } from "@/lib/server/chat-service";
import { trackUsage, isDailyBudgetExceeded } from "@/lib/server/usage-tracker";

export const maxDuration = 300;

const BUDGET_MESSAGE =
  "本日の利用が混み合っているため、一時的に回答を停止しています。お手数ですが時間をおいて再度お試しください。";

/**
 * 通常の SSE 回答と同じ形式で 1 件のお知らせメッセージを返す。
 * 上限到達時もフロントのチャット UI で自然なメッセージとして表示される。
 */
function noticeStream(messageText: string): ReadableStream {
  const encoder = new TextEncoder();
  const send = (obj: unknown) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        send({ type: "doc_start", doc_index: 0, document_id: "", filename: "お知らせ" })
      );
      controller.enqueue(send({ type: "chunk", content: messageText, doc_index: 0 }));
      controller.enqueue(send({ type: "doc_sources", doc_index: 0, sources: [] }));
      controller.enqueue(
        send({ type: "doc_done", doc_index: 0, full_response: messageText })
      );
      controller.enqueue(
        send({
          type: "done",
          prompt_tokens: 0,
          completion_tokens: 0,
          embedding_tokens: 0,
          documents: [{ document_id: "", filename: "お知らせ", full_response: messageText }],
        })
      );
      controller.close();
    },
  });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], session_id, chatbot_id } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "メッセージが必要です" }), {
        status: 400,
      });
    }

    const supabase = getSupabaseAdmin();
    const openaiClient = getOpenAI();

    // コスト上限チェック（認証なし公開のための安全弁）
    if (await isDailyBudgetExceeded(supabase)) {
      return new Response(noticeStream(BUDGET_MESSAGE), { headers: SSE_HEADERS });
    }

    // チャットボット設定を取得
    let topK = 8;
    let threshold = 0.3;
    let systemPrompt: string | null = null;

    if (chatbot_id) {
      const { data: chatbot } = await supabase
        .from("chatbots")
        .select("*")
        .eq("id", chatbot_id)
        .single();

      if (chatbot) {
        topK = chatbot.top_k;
        threshold = chatbot.similarity_threshold;
        systemPrompt = chatbot.system_prompt;
      }
    }

    // SSEストリームを作成
    const chatStream = createChatStream({
      openaiClient,
      supabase,
      message,
      history,
      topK,
      threshold,
      chatbotId: chatbot_id,
      systemPromptOverride: systemPrompt,
    });

    // ストリームを分岐: レスポンス送信 + ログ記録
    const [responseStream, logStream] = chatStream.tee();

    // バックグラウンドでログ記録
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // ログ記録を after() に登録し、レスポンス完了までサーバーレス関数を
    // 確実に生かしておく（未 await のままだと Vercel 上で途中終了し
    // ログ・使用量記録が欠落する恐れがあるため）。
    const logPromise = logChatInBackground(logStream, supabase, {
      sessionId: session_id,
      clientIp,
      userMessage: message,
      chatbotId: chatbot_id,
    });
    after(logPromise);

    return new Response(responseStream, { headers: SSE_HEADERS });
  } catch (error) {
    // 内部エラーの詳細はサーバーログにのみ出力し、クライアントには汎用文言を返す
    console.error("Chat route error:", error);
    return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), {
      status: 500,
    });
  }
}

async function logChatInBackground(
  stream: ReadableStream,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  meta: {
    sessionId: string;
    clientIp: string;
    userMessage: string;
    chatbotId?: string;
  }
) {
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let sources: unknown = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let embeddingTokens = 0;
    const allSources: unknown[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "done") {
              // Combine all document responses
              if (data.documents) {
                fullResponse = data.documents
                  .map((d: { filename: string; full_response: string }) =>
                    `【${d.filename}】\n${d.full_response}`)
                  .join("\n\n");
              }
              promptTokens = data.prompt_tokens;
              completionTokens = data.completion_tokens;
              embeddingTokens = data.embedding_tokens;
            } else if (data.type === "doc_sources" && data.sources) {
              allSources.push(...data.sources);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }

    sources = allSources.length > 0 ? allSources : null;

    // チャットログ保存
    await supabase.from("chat_logs").insert({
      session_id: meta.sessionId,
      client_ip: meta.clientIp,
      user_message: meta.userMessage,
      assistant_message: fullResponse,
      source_documents: sources,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      chatbot_id: meta.chatbotId || null,
    });

    // 使用量記録
    await trackUsage(supabase, promptTokens, completionTokens, embeddingTokens);
  } catch {
    console.error("Failed to log chat");
  }
}

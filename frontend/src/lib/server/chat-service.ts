import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { searchSimilarChunks, type ChunkResult } from "./vector-store";

const DEFAULT_SYSTEM_PROMPT = `あなたは社内文書に基づいて質問に答えるアシスタントです。
以下の参考情報をもとに、正確かつ具体的に回答してください。
参考情報に含まれない内容については、「この情報は提供された文書には含まれていません」と正直に伝えてください。
回答の際は、どの文書のどの部分を参考にしたかを明示してください。

【参考情報】
{context}`;

function buildContext(chunks: ChunkResult[]): string {
  if (chunks.length === 0) {
    return "（関連する文書が見つかりませんでした）";
  }

  return chunks
    .map((chunk) => {
      let header = `[文書: ${chunk.filename}`;
      if (chunk.page_numbers) {
        header += `, ページ: ${chunk.page_numbers}`;
      }
      header += "]";
      return `${header}\n${chunk.content}`;
    })
    .join("\n---\n");
}

export interface ChatStreamOptions {
  openaiClient: OpenAI;
  supabase: SupabaseClient;
  message: string;
  history: { role: string; content: string }[];
  topK?: number;
  threshold?: number;
  chatbotId?: string;
  systemPromptOverride?: string | null;
}

export function createChatStream(options: ChatStreamOptions): ReadableStream {
  const {
    openaiClient,
    supabase,
    message,
    history,
    topK = 8,
    threshold = 0.3,
    chatbotId,
    systemPromptOverride,
  } = options;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Step 1: ベクトル検索
        const { chunks, embeddingTokens } = await searchSimilarChunks(
          supabase,
          openaiClient,
          message,
          topK,
          threshold,
          chatbotId
        );

        // Step 2: システムプロンプト構築
        const context = buildContext(chunks);
        const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
        const systemPrompt = basePrompt.replace("{context}", context);

        // Step 3: メッセージ構築
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: systemPrompt },
        ];

        for (const msg of history.slice(-10)) {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
        messages.push({ role: "user", content: message });

        // Step 4: OpenAI ストリーミング
        const stream = await openaiClient.chat.completions.create({
          model: "gpt-5-nano",
          messages,
          stream: true,
          stream_options: { include_usage: true },
        });

        let fullResponse = "";
        let promptTokens = 0;
        let completionTokens = 0;

        for await (const chunk of stream) {
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }

          if (chunk.choices?.[0]?.delta?.content) {
            const content = chunk.choices[0].delta.content;
            fullResponse += content;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content })}\n\n`
              )
            );
          }
        }

        // Step 5: ソース送信
        const sources = chunks.map((c) => ({
          document_id: c.document_id,
          filename: c.filename,
          content: c.content.slice(0, 200),
          page_numbers: c.page_numbers,
          similarity: Math.round(c.similarity * 1000) / 1000,
        }));
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "sources", sources })}\n\n`
          )
        );

        // Step 6: 使用量送信
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "usage",
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              embedding_tokens: embeddingTokens,
            })}\n\n`
          )
        );

        // Step 7: 完了シグナル
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              full_response: fullResponse,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              embedding_tokens: embeddingTokens,
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: msg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

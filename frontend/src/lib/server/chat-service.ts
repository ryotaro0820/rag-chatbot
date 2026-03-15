import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { searchByDocument, generateQueryEmbedding, type ChunkResult } from "./vector-store";

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
    systemPromptOverride,
  } = options;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Get all documents
        const { data: documents, error: docError } = await supabase
          .from("documents")
          .select("id, filename")
          .order("filename");

        if (docError || !documents || documents.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "文書が見つかりません" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Step 2: Generate embedding ONCE
        const { embedding: queryEmbedding, tokens: embeddingTokens } =
          await generateQueryEmbedding(openaiClient, message);

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const docResults: { document_id: string; filename: string; full_response: string }[] = [];

        // Step 3: For each document, search and generate response
        for (let docIndex = 0; docIndex < documents.length; docIndex++) {
          const doc = documents[docIndex];

          // Signal document start
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "doc_start",
                doc_index: docIndex,
                document_id: doc.id,
                filename: doc.filename,
              })}\n\n`
            )
          );

          // Search within this document
          const { chunks } = await searchByDocument(
            supabase,
            openaiClient,
            message,
            doc.id,
            topK,
            threshold,
            queryEmbedding
          );

          // If no chunks found, send a quick message and move on
          if (chunks.length === 0) {
            const noResultMsg = "この文書には関連する情報が見つかりませんでした。";
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: noResultMsg, doc_index: docIndex })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "doc_sources", doc_index: docIndex, sources: [] })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "doc_done", doc_index: docIndex, full_response: noResultMsg })}\n\n`
              )
            );
            docResults.push({ document_id: doc.id, filename: doc.filename, full_response: noResultMsg });
            continue;
          }

          // Build context and system prompt
          const context = buildContext(chunks);
          const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
          const systemPrompt = basePrompt.replace("{context}", context);

          // Build messages
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

          // Call OpenAI
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
                  `data: ${JSON.stringify({ type: "chunk", content, doc_index: docIndex })}\n\n`
                )
              );
            }
          }

          totalPromptTokens += promptTokens;
          totalCompletionTokens += completionTokens;

          // Send sources
          const sources = chunks.map((c) => ({
            document_id: c.document_id,
            filename: c.filename,
            content: c.content.slice(0, 200),
            page_numbers: c.page_numbers,
            similarity: Math.round(c.similarity * 1000) / 1000,
          }));
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "doc_sources", doc_index: docIndex, sources })}\n\n`
            )
          );

          // Signal document done
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "doc_done", doc_index: docIndex, full_response: fullResponse })}\n\n`
            )
          );

          docResults.push({ document_id: doc.id, filename: doc.filename, full_response: fullResponse });
        }

        // Final done signal
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              prompt_tokens: totalPromptTokens,
              completion_tokens: totalCompletionTokens,
              embedding_tokens: embeddingTokens,
              documents: docResults,
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

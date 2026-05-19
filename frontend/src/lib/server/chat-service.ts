import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { searchByDocument, generateQueryEmbedding, type ChunkResult } from "./vector-store";

const DEFAULT_SYSTEM_PROMPT = `あなたは社内文書に基づいて質問に答えるアシスタントです。

【回答ルール】
- 参考情報のみを根拠に回答すること（推測・一般知識での補完は禁止）
- 箇条書きを活用し、要点を端的にまとめる（1項目1〜2行）
- **重要：各記述の末尾に必ず引用元を明示すること**
  - 形式: \`（出典N: 文書名 p.X）\` ※Nは参考情報内の [出典N] 番号、p.X はページ番号
  - ページ番号が無い出典は \`（出典N: 文書名）\` と記載
  - 1つの記述が複数の出典に基づく場合は \`（出典1, 出典3）\` のように併記
- 引用は内容を要約してよいが、条文番号・条項・固有名詞は原文どおりに記載すること
- 参考情報に含まれない内容を問われた場合は「この文書には該当する情報がありません」とだけ答え、出典は付けない

【参考情報】
{context}`;

/**
 * ファイル名から法令グループ名を判定する。
 * 同じ法令に属する文書は 1 タブにまとめて回答する。
 *
 * 注意: Mac から API 経由でアップロードされたファイル名は NFD（分解 Unicode）で
 * 保存されているため、includes 比較する前に NFC へ正規化する必要がある。
 * 例: ガ(U+30AC) vs カ(U+30AB)+濁点(U+3099)
 */
function getLawGroup(filename: string): string {
  const normalized = filename.normalize("NFC");
  if (normalized.includes("ガス事業法")) return "ガス事業法";
  if (normalized.includes("液化")) return "液化石油ガス法";
  if (normalized.includes("高圧ガス")) return "高圧ガス保安法";
  // それ以外はファイル名そのまま（拡張子・suffix除去）
  return normalized.replace(/\.[^.]+$/, "").replace(/[＿_].*$/, "");
}

function buildContext(chunks: ChunkResult[]): string {
  if (chunks.length === 0) {
    return "（関連する文書が見つかりませんでした）";
  }

  return chunks
    .map((chunk, i) => {
      const n = i + 1;
      let header = `[出典${n}] 文書: ${chunk.filename}`;
      if (chunk.page_numbers) {
        header += `, ページ: ${chunk.page_numbers}`;
      }
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
    threshold = 0.2,
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

        // Step 3: Search ALL documents in parallel (big speed win)
        const searchResults = await Promise.all(
          documents.map((doc) =>
            searchByDocument(
              supabase,
              openaiClient,
              message,
              doc.id,
              topK,
              threshold,
              queryEmbedding
            )
          )
        );

        // Step 3.5: 法令グループ単位にチャンクを集約
        // - 同一法令に属する複数文書のヒットチャンクを統合し、類似度上位 topK のみ採用
        // - 各グループは UI 上 1 タブとして表示される
        const groups: Map<
          string,
          { firstDocId: string; chunks: ChunkResult[] }
        > = new Map();
        const groupOrder: string[] = [];
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const groupName = getLawGroup(doc.filename);
          if (!groups.has(groupName)) {
            groups.set(groupName, { firstDocId: doc.id, chunks: [] });
            groupOrder.push(groupName);
          }
          groups.get(groupName)!.chunks.push(...searchResults[i].chunks);
        }
        // グループ内で類似度降順に並べ、上位 topK のみ残す
        for (const g of groups.values()) {
          g.chunks.sort((a, b) => b.similarity - a.similarity);
          g.chunks = g.chunks.slice(0, topK);
        }

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const docResults: { document_id: string; filename: string; full_response: string }[] = [];

        // Step 4: 法令グループごとに 1 つの統合回答を生成してストリーミング
        for (let gi = 0; gi < groupOrder.length; gi++) {
          const groupName = groupOrder[gi];
          const { firstDocId, chunks } = groups.get(groupName)!;

          // タブ開始イベント（filename にはグループ名を入れて UI のラベルに使う）
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "doc_start",
                doc_index: gi,
                document_id: firstDocId,
                filename: groupName,
              })}\n\n`
            )
          );

          // チャンクが無ければスキップ
          if (chunks.length === 0) {
            const noResultMsg = "この文書には関連する情報が見つかりませんでした。";
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: noResultMsg, doc_index: gi })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "doc_sources", doc_index: gi, sources: [] })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "doc_done", doc_index: gi, full_response: noResultMsg })}\n\n`
              )
            );
            docResults.push({ document_id: firstDocId, filename: groupName, full_response: noResultMsg });
            continue;
          }

          // Build context and system prompt
          const context = buildContext(chunks);
          const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
          const systemPrompt = basePrompt.replace("{context}", context);

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
                  `data: ${JSON.stringify({ type: "chunk", content, doc_index: gi })}\n\n`
                )
              );
            }
          }

          totalPromptTokens += promptTokens;
          totalCompletionTokens += completionTokens;

          // 参照元はグループ内の実ファイル名のままユーザーに表示する
          const sources = chunks.map((c) => ({
            document_id: c.document_id,
            filename: c.filename,
            content: c.content.slice(0, 200),
            page_numbers: c.page_numbers,
            similarity: Math.round(c.similarity * 1000) / 1000,
          }));
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "doc_sources", doc_index: gi, sources })}\n\n`
            )
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "doc_done", doc_index: gi, full_response: fullResponse })}\n\n`
            )
          );

          docResults.push({ document_id: firstDocId, filename: groupName, full_response: fullResponse });
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import type { TextChunk } from "./text-chunker";

export async function generateEmbedding(
  client: OpenAI,
  text: string
): Promise<number[]> {
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function storeChunks(
  supabase: SupabaseClient,
  openaiClient: OpenAI,
  documentId: string,
  chunks: TextChunk[]
): Promise<number> {
  if (chunks.length === 0) return 0;

  const texts = chunks.map((c) => c.text);
  const batchSize = 50;
  const allEmbeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    allEmbeddings.push(...response.data.map((item) => item.embedding));
    totalTokens += response.usage.total_tokens;
  }

  const rows = chunks.map((chunk, idx) => ({
    document_id: documentId,
    chunk_index: chunk.chunk_index,
    content: chunk.text,
    page_numbers: chunk.page_numbers,
    embedding: JSON.stringify(allEmbeddings[idx]),
  }));

  // バッチで挿入
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error(`チャンク保存エラー: ${error.message}`);
  }

  return totalTokens;
}

export async function searchSimilarChunks(
  supabase: SupabaseClient,
  openaiClient: OpenAI,
  query: string,
  topK: number = 5,
  threshold: number = 0.7,
  chatbotId?: string
): Promise<{ chunks: ChunkResult[]; embeddingTokens: number }> {
  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = response.data[0].embedding;
  const embeddingTokens = response.usage.total_tokens;

  // チャットボットIDがある場合は専用関数、ない場合は全体検索
  const rpcName = chatbotId ? "match_chunks_for_chatbot" : "match_chunks";
  const params: Record<string, unknown> = {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: topK,
    match_threshold: threshold,
  };
  if (chatbotId) {
    params.p_chatbot_id = chatbotId;
  }

  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) throw new Error(`ベクトル検索エラー: ${error.message}`);

  return { chunks: data || [], embeddingTokens };
}

export async function deleteDocumentChunks(
  supabase: SupabaseClient,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);
  if (error) throw new Error(`チャンク削除エラー: ${error.message}`);
}

export async function getDocumentChunks(
  supabase: SupabaseClient,
  documentId: string
) {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, chunk_index, content, page_numbers")
    .eq("document_id", documentId)
    .order("chunk_index");
  if (error) throw new Error(`チャンク取得エラー: ${error.message}`);
  return data || [];
}

export interface ChunkResult {
  id: string;
  document_id: string;
  content: string;
  page_numbers: string | null;
  filename: string;
  similarity: number;
}

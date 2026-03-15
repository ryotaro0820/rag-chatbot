import type { SupabaseClient } from "@supabase/supabase-js";

const PRICE_PER_1K_PROMPT = 0.00015;
const PRICE_PER_1K_COMPLETION = 0.0006;
const PRICE_PER_1K_EMBEDDING = 0.00002;

export async function trackUsage(
  supabase: SupabaseClient,
  promptTokens: number = 0,
  completionTokens: number = 0,
  embeddingTokens: number = 0
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const cost =
    (promptTokens / 1000) * PRICE_PER_1K_PROMPT +
    (completionTokens / 1000) * PRICE_PER_1K_COMPLETION +
    (embeddingTokens / 1000) * PRICE_PER_1K_EMBEDDING;

  const { data: existing } = await supabase
    .from("usage_daily")
    .select("*")
    .eq("date", today);

  if (existing && existing.length > 0) {
    const row = existing[0];
    await supabase
      .from("usage_daily")
      .update({
        total_requests: row.total_requests + 1,
        total_prompt_tokens: row.total_prompt_tokens + promptTokens,
        total_completion_tokens: row.total_completion_tokens + completionTokens,
        total_embedding_tokens: row.total_embedding_tokens + embeddingTokens,
        estimated_cost_usd: row.estimated_cost_usd + cost,
      })
      .eq("date", today);
  } else {
    await supabase.from("usage_daily").insert({
      date: today,
      total_requests: 1,
      total_prompt_tokens: promptTokens,
      total_completion_tokens: completionTokens,
      total_embedding_tokens: embeddingTokens,
      estimated_cost_usd: cost,
    });
  }
}

export async function getUsageSummary(
  supabase: SupabaseClient,
  days: number = 30
) {
  const { data, error } = await supabase
    .from("usage_daily")
    .select("*")
    .order("date", { ascending: false })
    .limit(days);
  if (error) throw new Error(`使用量取得エラー: ${error.message}`);
  return data || [];
}

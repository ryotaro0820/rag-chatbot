from __future__ import annotations

from typing import List
from datetime import date
from app.services.supabase_client import SupabaseRestClient as Client

# gpt-5-nano pricing (estimate)
PRICE_PER_1K_PROMPT_TOKENS = 0.0001
PRICE_PER_1K_COMPLETION_TOKENS = 0.0004
PRICE_PER_1K_EMBEDDING_TOKENS = 0.00002


def track_usage(
    supabase: Client,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    embedding_tokens: int = 0,
) -> None:
    """Record token usage for the current day."""
    today = date.today().isoformat()

    cost = (
        (prompt_tokens / 1000) * PRICE_PER_1K_PROMPT_TOKENS
        + (completion_tokens / 1000) * PRICE_PER_1K_COMPLETION_TOKENS
        + (embedding_tokens / 1000) * PRICE_PER_1K_EMBEDDING_TOKENS
    )

    existing = (
        supabase.table("usage_daily").select("*").eq("date", today).execute()
    )

    if existing.data:
        row = existing.data[0]
        supabase.table("usage_daily").update(
            {
                "total_requests": row["total_requests"] + 1,
                "total_prompt_tokens": row["total_prompt_tokens"] + prompt_tokens,
                "total_completion_tokens": row["total_completion_tokens"]
                + completion_tokens,
                "total_embedding_tokens": row["total_embedding_tokens"]
                + embedding_tokens,
                "estimated_cost_usd": row["estimated_cost_usd"] + cost,
            }
        ).eq("date", today).execute()
    else:
        supabase.table("usage_daily").insert(
            {
                "date": today,
                "total_requests": 1,
                "total_prompt_tokens": prompt_tokens,
                "total_completion_tokens": completion_tokens,
                "total_embedding_tokens": embedding_tokens,
                "estimated_cost_usd": cost,
            }
        ).execute()


def get_usage_summary(
    supabase: Client, days: int = 30
) -> List[dict]:
    """Get usage summary for the last N days."""
    result = (
        supabase.table("usage_daily")
        .select("*")
        .order("date", desc=True)
        .limit(days)
        .execute()
    )
    return result.data or []

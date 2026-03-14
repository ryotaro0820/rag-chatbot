from fastapi import APIRouter, Depends, HTTPException
from app.services.supabase_client import SupabaseRestClient

from app.dependencies import get_supabase
from app.models.schemas import FeedbackRequest

router = APIRouter(tags=["feedback"])


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackRequest,
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Submit feedback for a chat response."""
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="ratingは 'up' または 'down' である必要があります")

    # Verify chat log exists
    existing = (
        supabase.table("chat_logs")
        .select("id")
        .eq("id", body.chat_log_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="チャットログが見つかりません")

    # Check if feedback already exists
    existing_feedback = (
        supabase.table("feedback")
        .select("id")
        .eq("chat_log_id", body.chat_log_id)
        .execute()
    )
    if existing_feedback.data:
        # Update existing feedback
        supabase.table("feedback").update(
            {"rating": body.rating}
        ).eq("chat_log_id", body.chat_log_id).execute()
        return {"status": "updated"}

    # Insert new feedback
    supabase.table("feedback").insert(
        {"chat_log_id": body.chat_log_id, "rating": body.rating}
    ).execute()
    return {"status": "created"}

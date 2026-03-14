from __future__ import annotations

from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from app.services.supabase_client import SupabaseRestClient

from app.dependencies import get_supabase, verify_admin_token
from app.models.schemas import (
    LoginRequest,
    LoginResponse,
    ChatLogResponse,
    UsageDailySummary,
    PopularQuestion,
    FeedbackSummary,
)
from app.services.usage_tracker import get_usage_summary

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=LoginResponse)
async def admin_login(
    body: LoginRequest,
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Login with email and password via Supabase Auth."""
    try:
        auth_response = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
        return LoginResponse(
            access_token=auth_response.session.access_token,
            user_email=auth_response.user.email,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail=f"ログイン失敗: {str(e)}")


@router.post("/logout")
async def admin_logout(
    _admin: dict = Depends(verify_admin_token),
):
    """Logout (client should discard the token)."""
    return {"status": "ok"}


@router.get("/logs", response_model=List[ChatLogResponse])
async def get_logs(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Get chat logs."""
    result = (
        supabase.table("chat_logs")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return [
        ChatLogResponse(
            id=log["id"],
            session_id=log["session_id"],
            client_ip=log.get("client_ip"),
            user_message=log["user_message"],
            assistant_message=log.get("assistant_message"),
            source_documents=log.get("source_documents"),
            prompt_tokens=log.get("prompt_tokens"),
            completion_tokens=log.get("completion_tokens"),
            created_at=log["created_at"],
        )
        for log in result.data
    ]


@router.get("/usage", response_model=List[UsageDailySummary])
async def get_usage(
    days: int = Query(30, le=365),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Get daily usage summary."""
    data = get_usage_summary(supabase, days)
    return [
        UsageDailySummary(
            date=row["date"],
            total_requests=row["total_requests"],
            total_prompt_tokens=row["total_prompt_tokens"],
            total_completion_tokens=row["total_completion_tokens"],
            total_embedding_tokens=row["total_embedding_tokens"],
            estimated_cost_usd=row["estimated_cost_usd"],
        )
        for row in data
    ]


@router.get("/feedback-summary", response_model=FeedbackSummary)
async def get_feedback_summary(
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Get feedback summary."""
    result = supabase.table("feedback").select("rating").execute()
    ratings = result.data or []

    total = len(ratings)
    up_count = sum(1 for r in ratings if r["rating"] == "up")
    down_count = sum(1 for r in ratings if r["rating"] == "down")

    return FeedbackSummary(
        total=total,
        up_count=up_count,
        down_count=down_count,
        up_ratio=round(up_count / total, 3) if total > 0 else 0.0,
    )


@router.get("/popular-questions", response_model=List[PopularQuestion])
async def get_popular_questions(
    limit: int = Query(10, le=50),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Get most frequently asked questions."""
    result = (
        supabase.table("chat_logs")
        .select("user_message")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )

    counts: Dict[str, int] = {}
    for row in result.data or []:
        msg = row["user_message"].strip()
        counts[msg] = counts.get(msg, 0) + 1

    sorted_questions = sorted(counts.items(), key=lambda x: x[1], reverse=True)

    return [
        PopularQuestion(user_message=msg, count=count)
        for msg, count in sorted_questions[:limit]
    ]

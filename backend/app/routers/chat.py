import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
from app.services.supabase_client import SupabaseRestClient

from app.dependencies import get_supabase, get_openai
from app.models.schemas import ChatRequest
from app.services.chat_service import stream_chat_response
from app.services.rate_limiter import chat_rate_limiter
from app.services.usage_tracker import track_usage
from app.config import get_settings, Settings

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    supabase: SupabaseRestClient = Depends(get_supabase),
    openai_client: OpenAI = Depends(get_openai),
    settings: Settings = Depends(get_settings),
):
    """Chat endpoint with SSE streaming response."""
    # Rate limit check
    chat_rate_limiter.check(request)

    client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    if not client_ip and request.client:
        client_ip = request.client.host

    async def event_generator():
        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0
        embedding_tokens = 0
        sources = []

        async for event in stream_chat_response(
            openai_client,
            supabase,
            body.message,
            body.history,
            top_k=settings.top_k_results,
        ):
            yield event

            # Parse the event to extract metadata
            if event.startswith("data: "):
                try:
                    data = json.loads(event[6:].strip())
                    if data["type"] == "sources":
                        sources = data["sources"]
                    elif data["type"] == "done":
                        full_response = data.get("full_response", "")
                        prompt_tokens = data.get("prompt_tokens", 0)
                        completion_tokens = data.get("completion_tokens", 0)
                        embedding_tokens = data.get("embedding_tokens", 0)
                except (json.JSONDecodeError, KeyError):
                    pass

        # Log chat after streaming is done
        log_data = {
            "session_id": body.session_id or "anonymous",
            "client_ip": client_ip,
            "user_message": body.message,
            "assistant_message": full_response,
            "source_documents": sources,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        }
        supabase.table("chat_logs").insert(log_data).execute()

        # Track usage
        track_usage(
            supabase,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            embedding_tokens=embedding_tokens,
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

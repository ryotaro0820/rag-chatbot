from __future__ import annotations

from typing import Optional

from openai import OpenAI
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.services.supabase_client import SupabaseRestClient

_openai_client: Optional[OpenAI] = None
_supabase_client: Optional[SupabaseRestClient] = None


def get_openai(settings: Settings = Depends(get_settings)) -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def get_supabase(settings: Settings = Depends(get_settings)) -> SupabaseRestClient:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseRestClient(
            url=settings.supabase_url,
            service_key=settings.supabase_service_key,
            anon_key=settings.supabase_anon_key,
        )
    return _supabase_client


def verify_admin_token(
    request: Request, settings: Settings = Depends(get_settings)
) -> dict:
    """Verify JWT token from Authorization header. Returns decoded payload."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="無効なトークンです")

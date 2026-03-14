from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


# --- Chat ---
class ChatRequest(BaseModel):
    message: str
    history: List[dict] = []
    session_id: str = ""


class SourceReference(BaseModel):
    document_id: str
    filename: str
    content: str
    page_numbers: Optional[str] = None
    similarity: float


class ChatLogResponse(BaseModel):
    id: int
    session_id: str
    client_ip: Optional[str]
    user_message: str
    assistant_message: Optional[str]
    source_documents: Optional[List[dict]]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    created_at: str


# --- Documents ---
class DocumentInfo(BaseModel):
    id: str
    filename: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    file_size: Optional[int]
    chunk_count: Optional[int]
    version: int = 1
    uploaded_at: str


class ChunkPreview(BaseModel):
    id: str
    chunk_index: int
    content: str
    page_numbers: Optional[str]


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    chunk_count: int
    status: str = "processed"


# --- Categories ---
class CategoryCreate(BaseModel):
    name: str


class CategoryInfo(BaseModel):
    id: str
    name: str
    created_at: str


# --- Feedback ---
class FeedbackRequest(BaseModel):
    chat_log_id: int
    rating: str  # "up" or "down"


class FeedbackSummary(BaseModel):
    total: int
    up_count: int
    down_count: int
    up_ratio: float


# --- Usage ---
class UsageDailySummary(BaseModel):
    date: str
    total_requests: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_embedding_tokens: int
    estimated_cost_usd: float


class PopularQuestion(BaseModel):
    user_message: str
    count: int


# --- Admin Auth ---
class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    user_email: str

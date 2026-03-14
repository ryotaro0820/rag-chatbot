from __future__ import annotations

import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from openai import OpenAI
from app.services.supabase_client import SupabaseRestClient

from app.dependencies import get_supabase, get_openai, verify_admin_token
from app.models.schemas import (
    DocumentInfo,
    UploadResponse,
    ChunkPreview,
    CategoryCreate,
    CategoryInfo,
)
from app.services.document_processor import extract_text
from app.services.text_chunker import chunk_text
from app.services.vector_store import store_chunks, delete_document_chunks, get_document_chunks
from app.services.file_storage import upload_file, delete_file, get_content_type
from app.services.usage_tracker import track_usage
from app.config import get_settings, Settings

router = APIRouter(tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/documents/upload", response_model=List[UploadResponse])
async def upload_documents(
    files: List[UploadFile] = File(...),
    category_id: Optional[str] = Query(None),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
    openai_client: OpenAI = Depends(get_openai),
    settings: Settings = Depends(get_settings),
):
    """Upload one or more documents."""
    results = []

    for file in files:
        # Validate extension
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"サポートされていないファイル形式です: {file.filename}",
            )

        # Read file
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="ファイルサイズが50MBを超えています")

        # Generate document ID
        doc_id = str(uuid.uuid4())
        storage_path = f"{doc_id}/{file.filename}"

        # Upload to Supabase Storage
        content_type = get_content_type(file.filename)
        upload_file(supabase, file_bytes, storage_path, content_type)

        # Extract text
        pages = extract_text(file_bytes, file.filename)

        # Chunk text
        chunks = chunk_text(pages, settings.chunk_size, settings.chunk_overlap)

        # Store chunks with embeddings
        embedding_tokens = store_chunks(supabase, openai_client, doc_id, chunks)

        # Save document metadata
        supabase.table("documents").insert(
            {
                "id": doc_id,
                "filename": file.filename,
                "category_id": category_id,
                "file_size": len(file_bytes),
                "chunk_count": len(chunks),
                "storage_path": storage_path,
            }
        ).execute()

        # Track embedding usage
        track_usage(supabase, embedding_tokens=embedding_tokens)

        results.append(
            UploadResponse(
                document_id=doc_id,
                filename=file.filename,
                chunk_count=len(chunks),
            )
        )

    return results


@router.post("/documents/{document_id}/replace", response_model=UploadResponse)
async def replace_document(
    document_id: str,
    file: UploadFile = File(...),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
    openai_client: OpenAI = Depends(get_openai),
    settings: Settings = Depends(get_settings),
):
    """Replace a document with a new version."""
    existing = (
        supabase.table("documents").select("*").eq("id", document_id).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="文書が見つかりません")

    old_doc = existing.data[0]

    file_bytes = await file.read()

    delete_document_chunks(supabase, document_id)
    if old_doc.get("storage_path"):
        delete_file(supabase, old_doc["storage_path"])

    storage_path = f"{document_id}/{file.filename}"
    content_type = get_content_type(file.filename)
    upload_file(supabase, file_bytes, storage_path, content_type)

    pages = extract_text(file_bytes, file.filename)
    chunks = chunk_text(pages, settings.chunk_size, settings.chunk_overlap)
    embedding_tokens = store_chunks(supabase, openai_client, document_id, chunks)

    supabase.table("documents").update(
        {
            "filename": file.filename,
            "file_size": len(file_bytes),
            "chunk_count": len(chunks),
            "storage_path": storage_path,
            "version": old_doc["version"] + 1,
        }
    ).eq("id", document_id).execute()

    track_usage(supabase, embedding_tokens=embedding_tokens)

    return UploadResponse(
        document_id=document_id,
        filename=file.filename,
        chunk_count=len(chunks),
        status="replaced",
    )


@router.get("/documents", response_model=List[DocumentInfo])
async def list_documents(
    category_id: Optional[str] = Query(None),
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """List all documents, optionally filtered by category."""
    query = supabase.table("documents").select(
        "*, categories(name)"
    ).order("uploaded_at", desc=True)

    if category_id:
        query = query.eq("category_id", category_id)

    result = query.execute()

    return [
        DocumentInfo(
            id=str(doc["id"]),
            filename=doc["filename"],
            category_id=str(doc["category_id"]) if doc.get("category_id") else None,
            category_name=doc.get("categories", {}).get("name") if doc.get("categories") else None,
            file_size=doc.get("file_size"),
            chunk_count=doc.get("chunk_count"),
            version=doc.get("version", 1),
            uploaded_at=doc["uploaded_at"],
        )
        for doc in result.data
    ]


@router.get("/documents/{document_id}/chunks", response_model=List[ChunkPreview])
async def get_chunks(
    document_id: str,
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Get chunk previews for a document."""
    chunks = get_document_chunks(supabase, document_id)
    return [
        ChunkPreview(
            id=str(c["id"]),
            chunk_index=c["chunk_index"],
            content=c["content"],
            page_numbers=c.get("page_numbers"),
        )
        for c in chunks
    ]


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    """Delete a document and all its chunks."""
    existing = (
        supabase.table("documents").select("*").eq("id", document_id).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="文書が見つかりません")

    doc = existing.data[0]

    delete_document_chunks(supabase, document_id)

    if doc.get("storage_path"):
        delete_file(supabase, doc["storage_path"])

    supabase.table("documents").delete().eq("id", document_id).execute()

    return {"status": "deleted", "document_id": document_id}


# --- Categories ---


@router.get("/categories", response_model=List[CategoryInfo])
async def list_categories(
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    result = (
        supabase.table("categories")
        .select("*")
        .order("name")
        .execute()
    )
    return [
        CategoryInfo(id=str(c["id"]), name=c["name"], created_at=c["created_at"])
        for c in result.data
    ]


@router.post("/categories", response_model=CategoryInfo)
async def create_category(
    body: CategoryCreate,
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    result = (
        supabase.table("categories")
        .insert({"name": body.name})
        .execute()
    )
    c = result.data[0]
    return CategoryInfo(id=str(c["id"]), name=c["name"], created_at=c["created_at"])


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    _admin: dict = Depends(verify_admin_token),
    supabase: SupabaseRestClient = Depends(get_supabase),
):
    supabase.table("categories").delete().eq("id", category_id).execute()
    return {"status": "deleted", "category_id": category_id}

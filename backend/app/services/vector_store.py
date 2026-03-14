from __future__ import annotations

from typing import List, Tuple
from app.services.supabase_client import SupabaseRestClient as Client
from openai import OpenAI


def generate_embedding(client: OpenAI, text: str) -> List[float]:
    """Generate embedding for a text using OpenAI."""
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def generate_embeddings_batch(
    client: OpenAI, texts: List[str]
) -> List[List[float]]:
    """Generate embeddings for multiple texts in a single API call."""
    if not texts:
        return []
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    return [item.embedding for item in response.data]


def store_chunks(
    supabase: Client,
    openai_client: OpenAI,
    document_id: str,
    chunks: List[dict],
) -> int:
    """Store document chunks with embeddings in Supabase."""
    if not chunks:
        return 0

    texts = [chunk["text"] for chunk in chunks]

    batch_size = 50
    all_embeddings = []
    total_tokens = 0

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])
        total_tokens += response.usage.total_tokens

    rows = []
    for chunk, embedding in zip(chunks, all_embeddings):
        rows.append(
            {
                "document_id": document_id,
                "chunk_index": chunk["chunk_index"],
                "content": chunk["text"],
                "page_numbers": chunk.get("page_numbers"),
                "embedding": embedding,
            }
        )

    supabase.table("document_chunks").insert(rows).execute()
    return total_tokens


def search_similar_chunks(
    supabase: Client,
    openai_client: OpenAI,
    query: str,
    top_k: int = 5,
    threshold: float = 0.7,
) -> Tuple[List[dict], int]:
    """Search for chunks similar to the query."""
    response = openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query,
    )
    query_embedding = response.data[0].embedding
    embedding_tokens = response.usage.total_tokens

    result = supabase.rpc(
        "match_chunks",
        {
            "query_embedding": query_embedding,
            "match_count": top_k,
            "match_threshold": threshold,
        },
    ).execute()

    return result.data or [], embedding_tokens


def delete_document_chunks(supabase: Client, document_id: str) -> None:
    """Delete all chunks for a document."""
    supabase.table("document_chunks").delete().eq(
        "document_id", document_id
    ).execute()


def get_document_chunks(supabase: Client, document_id: str) -> List[dict]:
    """Get all chunks for a document (without embeddings)."""
    result = (
        supabase.table("document_chunks")
        .select("id, chunk_index, content, page_numbers")
        .eq("document_id", document_id)
        .order("chunk_index")
        .execute()
    )
    return result.data or []

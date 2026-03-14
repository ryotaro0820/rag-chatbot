from __future__ import annotations

import json
from typing import AsyncGenerator, List

from openai import OpenAI
from app.services.supabase_client import SupabaseRestClient as Client

from app.services.vector_store import search_similar_chunks


SYSTEM_PROMPT_TEMPLATE = """あなたは社内文書に基づいて質問に答えるアシスタントです。
以下の参考情報をもとに、正確かつ具体的に回答してください。
参考情報に含まれない内容については、「この情報は提供された文書には含まれていません」と正直に伝えてください。
回答の際は、どの文書のどの部分を参考にしたかを明示してください。

【参考情報】
{context}
"""


def build_context(chunks: List[dict]) -> str:
    """Build context string from retrieved chunks."""
    if not chunks:
        return "（関連する文書が見つかりませんでした）"

    parts = []
    for chunk in chunks:
        header = f"[文書: {chunk['filename']}"
        if chunk.get("page_numbers"):
            header += f", ページ: {chunk['page_numbers']}"
        header += "]"
        parts.append(f"{header}\n{chunk['content']}")

    return "\n---\n".join(parts)


async def stream_chat_response(
    openai_client: OpenAI,
    supabase: Client,
    message: str,
    history: List[dict],
    top_k: int = 5,
) -> AsyncGenerator[str, None]:
    """Stream chat response using RAG pipeline."""
    # Step 1: Retrieve relevant chunks
    chunks, embedding_tokens = search_similar_chunks(
        supabase, openai_client, message, top_k=top_k
    )

    # Step 2: Build system prompt with context
    context = build_context(chunks)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=context)

    # Step 3: Build messages
    messages = [{"role": "system", "content": system_prompt}]

    for msg in history[-10:]:
        messages.append(
            {"role": msg.get("role", "user"), "content": msg.get("content", "")}
        )

    messages.append({"role": "user", "content": message})

    # Step 4: Stream response from OpenAI
    stream = openai_client.chat.completions.create(
        model="gpt-5-nano",
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
    )

    full_response = ""
    prompt_tokens = 0
    completion_tokens = 0

    for chunk in stream:
        if chunk.usage:
            prompt_tokens = chunk.usage.prompt_tokens
            completion_tokens = chunk.usage.completion_tokens

        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            full_response += content
            yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"

    # Step 5: Send sources
    sources = [
        {
            "document_id": str(c["document_id"]),
            "filename": c["filename"],
            "content": c["content"][:200],
            "page_numbers": c.get("page_numbers"),
            "similarity": round(c["similarity"], 3),
        }
        for c in chunks
    ]
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    # Step 6: Send usage info
    yield f"data: {json.dumps({'type': 'usage', 'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'embedding_tokens': embedding_tokens})}\n\n"

    # Step 7: Send done signal
    yield f"data: {json.dumps({'type': 'done', 'full_response': full_response, 'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'embedding_tokens': embedding_tokens})}\n\n"

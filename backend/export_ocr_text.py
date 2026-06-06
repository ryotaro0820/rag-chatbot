"""
OCR 済みドキュメントの content を、ドキュメントごとに 1 ファイルの txt として出力する。
PDF と並べて目視チェックする用。

使い方:
    cd /Users/hiramatsuryotaro/Desktop/rag-chatbot/backend
    python3 export_ocr_text.py

出力先: /Users/hiramatsuryotaro/Desktop/rag-chatbot/ocr_review/
"""
from __future__ import annotations

import sys
from pathlib import Path

from app.config import get_settings
from app.services.supabase_client import SupabaseRestClient

OUTPUT_DIR = Path("/Users/hiramatsuryotaro/Desktop/rag-chatbot/ocr_review")


def main() -> int:
    settings = get_settings()
    sb = SupabaseRestClient(
        url=settings.supabase_url,
        service_key=settings.supabase_service_key,
        anon_key=settings.supabase_anon_key,
    )

    docs = (
        sb.table("documents")
        .select("id,filename,chunk_count,file_size")
        .like("filename", "%20260421%")
        .order("filename")
        .execute()
    )
    if not docs.data:
        print("対象ドキュメントなし", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for doc in docs.data:
        doc_id = doc["id"]
        filename = doc["filename"]
        chunk_count = doc["chunk_count"]
        file_size_mb = (doc.get("file_size") or 0) / 1024 / 1024

        # ファイル名から拡張子を txt に
        out_name = filename.replace(".pdf", ".txt")
        out_path = OUTPUT_DIR / out_name

        print(f"取得中: {filename} ({chunk_count} chunks)...")
        # 全 chunks を一気に取得（大きいファイルは数千行）
        # range(start, end) で 1000 件ずつページネーション
        rows: list[dict] = []
        page_size = 1000
        for offset in range(0, chunk_count + page_size, page_size):
            batch = (
                sb.table("document_chunks")
                .select("chunk_index,page_numbers,content")
                .eq("document_id", doc_id)
                .order("chunk_index")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            if not batch.data:
                break
            rows.extend(batch.data)
            if len(batch.data) < page_size:
                break

        with out_path.open("w", encoding="utf-8") as f:
            f.write(f"=== {filename} ===\n")
            f.write(f"file_size: {file_size_mb:.1f} MB\n")
            f.write(f"chunk_count: {chunk_count}\n")
            f.write(f"actual_chunks_retrieved: {len(rows)}\n")
            f.write("=" * 60 + "\n\n")
            for r in rows:
                f.write(
                    f"--- chunk {r['chunk_index']} (page {r.get('page_numbers') or '-'}) ---\n"
                )
                f.write((r.get("content") or "") + "\n\n")

        print(f"  → {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")

    print(f"\n完了: {OUTPUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

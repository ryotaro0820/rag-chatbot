"""
PDF/DOCX を Supabase に一括投入するワンショットスクリプト。

Vercel の 60 秒制限を回避するため、Web UI ではなくローカルから直接処理する。
Render/Vercel のデプロイには影響しない。

使い方:
    cd /Users/hiramatsuryotaro/Desktop/rag-chatbot/backend
    python ingest_pdfs.py /path/to/pdf/folder
    # または個別ファイル指定
    python ingest_pdfs.py /path/to/one.pdf /path/to/two.pdf
    # カテゴリ指定（任意）
    python ingest_pdfs.py --category-id <uuid> /path/to/folder

事前準備:
    pip install -r requirements.txt
    backend/.env が存在すること（既に存在するはず）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import uuid
from pathlib import Path

from openai import OpenAI

# OCR 結果のローカルキャッシュ場所
_CACHE_DIR = Path(__file__).resolve().parent / ".ocr_cache"
_CACHE_DIR.mkdir(exist_ok=True)


def _cache_path(pdf_path: Path) -> Path:
    """PDF ファイルパスとファイルサイズから決定的なキャッシュキーを作る。"""
    key = f"{pdf_path.resolve()}|{pdf_path.stat().st_size}"
    h = hashlib.md5(key.encode("utf-8")).hexdigest()
    return _CACHE_DIR / f"{h}.json"


def load_ocr_cache(pdf_path: Path) -> list[dict] | None:
    cp = _cache_path(pdf_path)
    if cp.exists():
        try:
            with cp.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
        except Exception:
            return None
    return None


def save_ocr_cache(pdf_path: Path, pages: list[dict]) -> None:
    cp = _cache_path(pdf_path)
    tmp = cp.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    tmp.replace(cp)

from app.config import get_settings
from app.services.supabase_client import SupabaseRestClient
from app.services.document_processor import extract_text
from app.services.text_chunker import chunk_text
from app.services.file_storage import upload_file, get_content_type
from app.services.usage_tracker import track_usage


def with_retry(label: str, fn, max_attempts: int = 5, base_wait: float = 5.0):
    """ネットワーク／一時的なエラーで再試行するラッパー。"""
    last = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except Exception as e:
            last = e
            msg = str(e)[:200]
            print(f"  ⚠ {label} 失敗 (試行 {attempt}/{max_attempts}): {msg}")
            if attempt < max_attempts:
                wait = base_wait * (2 ** (attempt - 1))
                print(f"     {wait:.0f}秒待ってリトライ")
                time.sleep(wait)
    raise last  # type: ignore[misc]


def store_chunks_resilient(
    supabase: SupabaseRestClient,
    openai_client: OpenAI,
    document_id: str,
    chunks: list[dict],
    embed_batch_size: int = 50,
    insert_batch_size: int = 100,
) -> int:
    """embedding をバッチ生成し、chunks を小ロットで insert（リトライ付き）。"""
    if not chunks:
        return 0
    texts = [c["text"] for c in chunks]
    all_embeddings: list[list[float]] = []
    total_tokens = 0
    for i in range(0, len(texts), embed_batch_size):
        batch_texts = texts[i : i + embed_batch_size]
        def _do_embed():
            return openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=batch_texts,
            )
        response = with_retry(f"embedding {i}-{i+len(batch_texts)}", _do_embed)
        all_embeddings.extend([d.embedding for d in response.data])
        total_tokens += response.usage.total_tokens

    rows = []
    for chunk, emb in zip(chunks, all_embeddings):
        rows.append({
            "document_id": document_id,
            "chunk_index": chunk["chunk_index"],
            "content": chunk["text"],
            "page_numbers": chunk.get("page_numbers"),
            "embedding": emb,
        })

    for i in range(0, len(rows), insert_batch_size):
        batch = rows[i : i + insert_batch_size]
        def _do_insert():
            return supabase.table("document_chunks").insert(batch).execute()
        with_retry(f"chunks insert {i}-{i+len(batch)}", _do_insert)
    return total_tokens

ALLOWED_EXTENSIONS = {".pdf", ".docx"}

# 日本語文字（ひらがな・カタカナ・漢字・全角記号）
_JA_CHAR = r"[぀-ヿ㐀-䶿一-鿿＀-￯]"
_SPACE_BETWEEN_JA = re.compile(rf"({_JA_CHAR})[ \t]+(?={_JA_CHAR})")


def normalize_japanese_spaces(text: str) -> str:
    """Tesseract が日本語の文字間に挿入する空白を除去する。
    日本語 ⇆ ASCII 間の空白や、文末の空白は保持する。"""
    # JA文字-空白-JA文字 のパターンを順次削除（lookaheadで1パス）
    text = _SPACE_BETWEEN_JA.sub(r"\1", text)
    # 連続する空白を1個に
    text = re.sub(r"[ \t]+", " ", text)
    return text


# OCR 用（必要時のみ import）
_ocr_imported = False


def _import_ocr() -> None:
    global _ocr_imported, pytesseract, convert_from_path, pdfinfo_from_path
    if _ocr_imported:
        return
    import pytesseract as _pt
    from pdf2image import convert_from_path as _cfp, pdfinfo_from_path as _pip
    pytesseract = _pt
    convert_from_path = _cfp
    pdfinfo_from_path = _pip
    _ocr_imported = True


def ocr_pdf(
    path: Path,
    dpi: int = 300,
    batch_size: int = 3,
    lang: str = "jpn_vert+jpn",
    psm: int = 1,
) -> list[dict]:
    """
    スキャン PDF を OCR してページごとのテキストを返す。
    縦書き想定。横書き混在ページにも対応するため lang は縦書き優先＋横書きフォールバック。
    """
    _import_ocr()
    info = pdfinfo_from_path(str(path))
    total_pages = info["Pages"]
    print(f"  OCR 対象: {total_pages} ページ (dpi={dpi}, lang={lang}, psm={psm})")

    config = f"--psm {psm}"
    pages: list[dict] = []
    started = time.time()
    for start in range(1, total_pages + 1, batch_size):
        end = min(start + batch_size - 1, total_pages)
        images = convert_from_path(
            str(path), dpi=dpi, first_page=start, last_page=end
        )
        for offset, image in enumerate(images):
            page_num = start + offset
            text = pytesseract.image_to_string(image, lang=lang, config=config)
            text = normalize_japanese_spaces(text).strip()
            if text:
                pages.append({"text": text, "page": page_num})
            image.close()
        elapsed = time.time() - started
        avg = elapsed / end
        eta = avg * (total_pages - end)
        print(
            f"  OCR 進捗: {end}/{total_pages} ページ "
            f"(経過 {elapsed:.0f}s, 残り推定 {eta:.0f}s)"
        )
    return pages


def collect_files(paths: list[Path]) -> list[Path]:
    """ディレクトリならその中の対応拡張子ファイルを、ファイルならそのものを集める。"""
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            for ext in ALLOWED_EXTENSIONS:
                files.extend(sorted(p.glob(f"*{ext}")))
                files.extend(sorted(p.glob(f"*{ext.upper()}")))
        elif p.is_file():
            if p.suffix.lower() in ALLOWED_EXTENSIONS:
                files.append(p)
            else:
                print(f"  スキップ (未対応形式): {p.name}", file=sys.stderr)
        else:
            print(f"  見つからない: {p}", file=sys.stderr)
    # 重複排除
    seen = set()
    unique = []
    for f in files:
        if f not in seen:
            seen.add(f)
            unique.append(f)
    return unique


def already_uploaded(supabase: SupabaseRestClient, filename: str) -> bool:
    """同名のファイルが既に投入済みか確認。"""
    result = (
        supabase.table("documents")
        .select("id")
        .eq("filename", filename)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def process_file(
    path: Path,
    category_id: str | None,
    chatbot_ids: list[str],
    supabase: SupabaseRestClient,
    openai_client: OpenAI,
    chunk_size: int,
    chunk_overlap: int,
    skip_existing: bool,
) -> dict:
    """1ファイルを処理して結果を返す。"""
    filename = path.name
    file_size_mb = path.stat().st_size / 1024 / 1024
    print(f"\n[{filename}] {file_size_mb:.1f}MB")

    if skip_existing and already_uploaded(supabase, filename):
        print("  → スキップ（同名ファイルが既に存在）")
        return {"filename": filename, "status": "skipped"}

    started = time.time()
    doc_id = str(uuid.uuid4())
    ext = path.suffix.lower().lstrip(".")
    storage_path = f"{doc_id}/file.{ext}"

    # 1. ファイル読込
    file_bytes = path.read_bytes()
    print(f"  読込完了: {len(file_bytes) / 1024 / 1024:.1f}MB")

    # 2. Storage アップロード（Free プラン 50MB 上限対策：失敗してもスキップ）
    try:
        upload_file(supabase, file_bytes, storage_path, get_content_type(filename))
        print(f"  Storage アップロード完了 ({time.time() - started:.1f}s)")
        storage_path_for_db: str | None = storage_path
    except Exception as e:
        msg = str(e)[:120]
        print(f"  ⚠ Storage アップロードをスキップ ({msg})")
        storage_path_for_db = None

    # 3. テキスト抽出（通常）
    t = time.time()
    pages = extract_text(file_bytes, filename)
    print(f"  テキスト抽出: {len(pages)} ページ ({time.time() - t:.1f}s)")

    # 4. スキャン PDF だったら OCR にフォールバック（キャッシュ優先）
    if not pages and path.suffix.lower() == ".pdf":
        cached = load_ocr_cache(path)
        if cached:
            pages = cached
            print(f"  → OCR キャッシュから復元: {len(pages)} ページ")
        else:
            print("  → スキャン PDF と判定、OCR を実行します")
            t = time.time()
            pages = ocr_pdf(path)
            print(f"  OCR 完了: {len(pages)} ページに文字列を抽出 ({time.time() - t:.1f}s)")
            save_ocr_cache(path, pages)
            print(f"  OCR 結果をキャッシュに保存: {_cache_path(path).name}")

    # 5. チャンク分割
    chunks = chunk_text(pages, chunk_size, chunk_overlap)
    print(f"  チャンク分割: {len(chunks)} 個")

    if not chunks:
        print("  ⚠ 抽出されたテキストが空でした")
        with_retry("documents insert (empty)", lambda: supabase.table("documents").insert(
            {
                "id": doc_id,
                "filename": filename,
                "category_id": category_id,
                "file_size": len(file_bytes),
                "chunk_count": 0,
                "storage_path": storage_path_for_db,
                "version": 1,
            }
        ).execute())
        for cid in chatbot_ids:
            with_retry("chatbot_documents insert", lambda c=cid: supabase.table("chatbot_documents").insert(
                {"chatbot_id": c, "document_id": doc_id}
            ).execute())
        return {"filename": filename, "status": "empty", "document_id": doc_id}

    # 5. documents 行を先に insert（document_chunks の外部キー制約のため、リトライ付き）
    with_retry("documents insert", lambda: supabase.table("documents").insert(
        {
            "id": doc_id,
            "filename": filename,
            "category_id": category_id,
            "file_size": len(file_bytes),
            "chunk_count": len(chunks),
            "storage_path": storage_path_for_db,
            "version": 1,
        }
    ).execute())

    # 6. embedding + chunks insert（小バッチ＋リトライ）
    t = time.time()
    embedding_tokens = store_chunks_resilient(supabase, openai_client, doc_id, chunks)
    print(f"  embedding 完了: {embedding_tokens} tokens ({time.time() - t:.1f}s)")

    # 6.5 chatbot 紐付け（指定があれば、リトライ付き）
    for cid in chatbot_ids:
        with_retry("chatbot_documents insert", lambda c=cid: supabase.table("chatbot_documents").insert(
            {"chatbot_id": c, "document_id": doc_id}
        ).execute())
    if chatbot_ids:
        print(f"  チャットボット紐付け: {len(chatbot_ids)} 個")

    # 7. 使用量記録
    with_retry("track_usage", lambda: track_usage(supabase, embedding_tokens=embedding_tokens))

    elapsed = time.time() - started
    print(f"  ✅ 完了 (合計 {elapsed:.1f}s)")
    return {
        "filename": filename,
        "status": "ok",
        "document_id": doc_id,
        "chunk_count": len(chunks),
        "elapsed_sec": elapsed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="PDF/DOCX を Supabase に一括投入する"
    )
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="フォルダまたはファイルのパス（複数指定可）",
    )
    parser.add_argument(
        "--category-id",
        default=None,
        help="documents.category_id に入れる UUID（任意）",
    )
    parser.add_argument(
        "--chatbot-id",
        nargs="+",
        default=[],
        help="紐付けるチャットボットの UUID（スペース区切りで複数指定可）",
    )
    parser.add_argument(
        "--no-skip-existing",
        action="store_true",
        help="同名ファイルがあっても再投入する",
    )
    args = parser.parse_args()

    settings = get_settings()
    supabase = SupabaseRestClient(
        url=settings.supabase_url,
        service_key=settings.supabase_service_key,
        anon_key=settings.supabase_anon_key,
    )
    openai_client = OpenAI(api_key=settings.openai_api_key)

    files = collect_files(args.paths)
    if not files:
        print("対応形式のファイルが見つかりませんでした。", file=sys.stderr)
        return 1

    print(f"対象ファイル: {len(files)} 個")
    for f in files:
        print(f"  - {f}")

    results: list[dict] = []
    for path in files:
        try:
            result = process_file(
                path=path,
                category_id=args.category_id,
                chatbot_ids=args.chatbot_id,
                supabase=supabase,
                openai_client=openai_client,
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
                skip_existing=not args.no_skip_existing,
            )
            results.append(result)
        except Exception as e:
            print(f"  ❌ エラー: {e}", file=sys.stderr)
            results.append({"filename": path.name, "status": "error", "error": str(e)})

    print("\n=== 結果サマリ ===")
    ok = sum(1 for r in results if r["status"] == "ok")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    empty = sum(1 for r in results if r["status"] == "empty")
    err = sum(1 for r in results if r["status"] == "error")
    print(f"  成功: {ok}  スキップ: {skipped}  空: {empty}  失敗: {err}")
    if err > 0:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

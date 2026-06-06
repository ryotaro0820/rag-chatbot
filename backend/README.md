# backend/ — PDF 一括取り込み CLI

このディレクトリは **ドキュメントを Supabase に一括投入するためのコマンドラインツール**です。
チャット・管理画面・API は全て `frontend/`（Next.js）側で動いており、ここに
かつて存在した FastAPI Web サーバー（`main.py` / `routers/` / `render.yaml` /
`Dockerfile`）は未使用だったため削除しました。残っているのは取り込みスクリプトと
それが使うサービス層のみです。

## 構成

```
backend/
├── ingest_pdfs.py        # PDF/Word を抽出→チャンク化→埋め込み→Supabase へ投入
├── export_ocr_text.py    # 取り込み済みテキストのエクスポート
└── app/
    ├── config.py                     # 環境変数（OpenAI / Supabase）
    └── services/
        ├── supabase_client.py        # Supabase REST クライアント
        ├── document_processor.py     # PDF/DOCX テキスト抽出
        ├── text_chunker.py           # 文単位チャンク分割
        ├── file_storage.py           # Supabase Storage アップロード
        └── usage_tracker.py          # トークン/コスト記録
```

## セットアップ

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY を設定
```

OCR（スキャン PDF）を使う場合は追加で `pytesseract` / `pdf2image` と
システム側の `tesseract` / `poppler` が必要です。

## 使い方

```bash
# pdfs/ 配下の PDF を一括取り込み
python ingest_pdfs.py --help

# 取り込み済みテキストのエクスポート
python export_ocr_text.py
```

> 取り込みは管理画面（`frontend` の `/admin`）からのアップロードでも可能です。
> 大量の初期投入や OCR が必要な場合にこの CLI を使ってください。

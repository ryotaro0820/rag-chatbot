# CLAUDE.md — rag-chatbot（ガス法令 社内RAG）

ガス事業法・液化石油ガス法・高圧ガス保安法の社内文書に、**出典（文書名＋ページ番号）付き**で
答える日本語 RAG チャットボット。**本番運用中**。
アーキテクチャ・セットアップは [README.md](README.md) を読む。

## リポジトリ構成の注意

```
rag-chatbot/
├─ frontend/   ← Next.js 16。チャット・管理画面・RAGパイプライン・認証が全部ここ
└─ backend/    ← PDF一括取り込みCLI（ingest_pdfs.py）。Webサーバーではない
```

- **npm 系のコマンドは `frontend/` で実行する**（リポジトリ直下に package.json はない）
- **Vercel のプロジェクトルートは `frontend/`**。ルートを直下と勘違いするとデプロイが壊れる

## 公開仕様（変更時は必ず確認を取る）

- チャットは**認証なし公開**。URLを知っている人は誰でも使える
- そのため **1日あたりの利用上限額**でコスト暴走を防いでいる。この上限を外す／上げる変更は
  料金に直結するので、勝手に判断せず必ず確認する
- モデルは OpenAI `text-embedding-3-small`（埋め込み）+ `gpt-5-nano`（生成）

## 回答品質のルール

- **出典なしで答えさせない**。根拠文書名とページ番号を必ず返す設計を崩さない
- 法令ごとのタブ表示（ガス事業法／液石法／高圧ガス保安法）は仕様。統合しない

## 文書の取り込み

スキャンPDFの取り込み・OCR・チャンク設計は **scan-ocr-rag** スキルの手順に従う。
`backend/ingest_pdfs.py` を直接叩く前にスキルを確認する。

## デプロイ

`vercel --prod`（root = `frontend/`）。本番確認は **deploy-verify** スキル。
GitHub: `git@github.com:ryotaro0820/rag-chatbot.git`

> `~/Desktop/rag-chatbot` は移行前の残骸。2026-08-16 に `~/Desktop/_archive/` へ退避済み。
> こちら（`~/dev/rag-chatbot`）が正。

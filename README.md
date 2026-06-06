# 社内文書チャットボット（RAG Chatbot）

ガス関連法令の社内文書に基づいて質問に答える、日本語の RAG（Retrieval-Augmented
Generation）チャットボットです。アップロードした PDF / Word をベクトル検索し、
**根拠となる文書名・ページ番号付き**で回答します。対象法令はガス事業法・
液化石油ガス法・高圧ガス保安法で、回答は法令ごとにタブ表示されます。

> 公開仕様: チャットは **認証なし**。URL を知っている人は誰でも利用できます。
> コスト暴走を防ぐため 1 日あたりの利用上限額（下記）を設けています。

## アーキテクチャ

```
┌────────────┐   SSE    ┌──────────────────────────┐
│  ブラウザ   │ ───────▶ │ Next.js (Vercel)         │
│ (チャットUI)│ ◀─────── │  app/api/* がRAG全処理を担当 │
└────────────┘          └────────┬─────────┬───────┘
                                 │         │
                          埋め込み・生成   DB/認証/Storage
                                 ▼         ▼
                          ┌──────────┐ ┌──────────────────┐
                          │ OpenAI   │ │ Supabase         │
                          │ embedding│ │ Postgres+pgvector │
                          │ gpt-5-nano│ │ Auth / Storage   │
                          └──────────┘ └──────────────────┘

backend/  … PDF 一括取り込み用の CLI（ingest_pdfs.py）。Web サーバーではない。
```

- **フロントエンド / API**: Next.js 16（App Router）+ React 19 + TypeScript + Tailwind 4。
  チャット・管理画面・RAG パイプライン・認証は全て `frontend/` で完結。
- **データ**: Supabase（PostgreSQL + pgvector / GoTrue 認証 / Storage）。
- **AI**: OpenAI `text-embedding-3-small`（埋め込み）+ `gpt-5-nano`（生成）。
- **取り込み CLI**: `backend/`（詳細は [backend/README.md](backend/README.md)）。

## 主な機能

- 法令タブ別のストリーミング回答（出典＋ページ＋類似度を表示）
- 👍 / 👎 フィードバック
- 複数チャットボット設定（精度モード・systemプロンプト・割当文書を個別設定）
- 管理ダッシュボード（文書アップロード、利用量＆コスト、フィードバック集計、
  人気質問、チャットログ、CSV エクスポート、管理者ユーザー管理）

## セットアップ

```bash
cd frontend
npm install
cp .env.local.example .env.local   # 無ければ下記の変数を手動設定
npm run dev                        # http://localhost:3000
```

### 環境変数（frontend/.env.local）

| 変数 | 用途 |
|------|------|
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_KEY` | サーバー側 DB アクセス（Service Role） |
| `SUPABASE_ANON_KEY` | 管理者ログイン（GoTrue 認証）用 |
| `OPENAI_API_KEY` | 埋め込み・生成 |
| `DAILY_BUDGET_USD` | **1 日の利用上限額（USD）。既定 `5`。`0` 以下で無制限** |

## データベース初期化

Supabase の SQL Editor で順に実行します。

1. `frontend/supabase_full_setup.sql` … テーブル・RPC（ベクトル検索関数）
2. `supabase_rls.sql` … **RLS 有効化（多層防御）**。アプリは Service Role 経由のため
   動作に影響せず、anon キー経由の直アクセスのみ遮断します。

## デプロイ

- フロントエンド: **Vercel**（Next.js）。上記の環境変数を設定。
- 取り込み CLI: ローカル/任意環境で `backend/` を実行（[backend/README.md](backend/README.md)）。

## コスト保護の仕組み

認証なしで公開しているため、以下でコスト暴走を抑えます。

1. **1 日の利用上限額**（`DAILY_BUDGET_USD`）: 当日の推定コストが上限に達すると、
   チャットは丁寧なお知らせメッセージを返し、新たな OpenAI 呼び出しを止めます。
   実体は `usage_daily` テーブルの当日行を参照するだけで追加インフラ不要。
2. **IP 単位レート制限**（`middleware.ts`）: バースト的乱用を抑える best-effort。
   サーバーレスではインスタンス間で共有されないため、確実な上限は 1 の予算上限が担います。

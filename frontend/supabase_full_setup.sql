-- ============================================================
-- RAG チャットボット - Supabase 完全セットアップSQL
-- このファイルをSupabase SQL Editorに貼り付けて実行してください
-- ============================================================

-- 1. pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. カテゴリテーブル
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 文書メタデータ
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    file_size INTEGER,
    chunk_count INTEGER,
    storage_path TEXT,
    version INTEGER DEFAULT 1,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 文書チャンク + ベクトル
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_numbers TEXT,
    embedding VECTOR(1536)
);

-- 5. ベクトル検索用インデックス（既にある場合はスキップ）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_chunks_embedding') THEN
        CREATE INDEX idx_document_chunks_embedding ON document_chunks
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100);
    END IF;
EXCEPTION WHEN others THEN
    -- チャンク数が少ない場合ivfflatインデックスはエラーになる場合があるので無視
    RAISE NOTICE 'ivfflat index creation skipped: %', SQLERRM;
END $$;

-- 6. チャットボット設定テーブル
CREATE TABLE IF NOT EXISTS chatbots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    similarity_threshold FLOAT NOT NULL DEFAULT 0.3,
    top_k INTEGER NOT NULL DEFAULT 8,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. チャットボットと文書の紐付け
CREATE TABLE IF NOT EXISTS chatbot_documents (
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (chatbot_id, document_id)
);

-- 8. チャットログ
CREATE TABLE IF NOT EXISTS chat_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    client_ip TEXT,
    user_message TEXT NOT NULL,
    assistant_message TEXT,
    source_documents JSONB,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    chatbot_id UUID REFERENCES chatbots(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- chatbot_id カラムが既存テーブルにない場合追加
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_logs' AND column_name = 'chatbot_id'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 9. フィードバック
CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    chat_log_id BIGINT NOT NULL REFERENCES chat_logs(id),
    rating TEXT CHECK(rating IN ('up', 'down')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. API使用量 (日次集計)
CREATE TABLE IF NOT EXISTS usage_daily (
    date DATE PRIMARY KEY,
    total_requests INTEGER DEFAULT 0,
    total_prompt_tokens INTEGER DEFAULT 0,
    total_completion_tokens INTEGER DEFAULT 0,
    total_embedding_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0.0
);

-- ============================================================
-- RPC関数
-- ============================================================

-- 全体検索用
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 8,
    match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    page_numbers TEXT,
    filename TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.page_numbers,
        d.filename,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- チャットボット別検索用
CREATE OR REPLACE FUNCTION match_chunks_for_chatbot(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 8,
    match_threshold FLOAT DEFAULT 0.3,
    p_chatbot_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    page_numbers TEXT,
    filename TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.page_numbers,
        d.filename,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
      AND (
        p_chatbot_id IS NULL
        OR dc.document_id IN (
          SELECT cd.document_id FROM chatbot_documents cd WHERE cd.chatbot_id = p_chatbot_id
        )
      )
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================
-- 3つの法令別チャットボット作成
-- ============================================================

-- 既存データクリア（安全のため）
DELETE FROM chatbot_documents;
DELETE FROM chatbots;

INSERT INTO chatbots (name, slug, description, similarity_threshold, top_k, display_order, system_prompt) VALUES
(
    'ガス事業法',
    'gas-business',
    'ガス事業法に関する質問に回答します。ガス事業の許可・届出、保安規制、供給条件などについてお答えします。',
    0.3,
    8,
    1,
    'あなたは「ガス事業法」の専門アシスタントです。
以下の参考情報はガス事業法の条文から抽出されたものです。
この参考情報をもとに、正確かつ具体的に回答してください。

回答のルール:
- 参考情報に含まれる条文番号（第○条）を明示して回答してください
- 参考情報に含まれない内容については「ガス事業法の提供された範囲には該当する規定が見つかりませんでした」と伝えてください
- 法律の解釈が必要な場合は、条文の文言に忠実に回答し、独自の解釈は避けてください
- 関連する条文が複数ある場合は、それぞれの条文を引用してください

【参考情報】
{context}'
),
(
    '液化石油ガス法',
    'lpg-law',
    '液化石油ガスの保安の確保及び取引の適正化に関する法律について回答します。LPガスの販売・保安・設備基準などについてお答えします。',
    0.3,
    8,
    2,
    'あなたは「液化石油ガスの保安の確保及び取引の適正化に関する法律」（液化石油ガス法）の専門アシスタントです。
以下の参考情報は液化石油ガス法の条文から抽出されたものです。
この参考情報をもとに、正確かつ具体的に回答してください。

回答のルール:
- 参考情報に含まれる条文番号（第○条）を明示して回答してください
- 参考情報に含まれない内容については「液化石油ガス法の提供された範囲には該当する規定が見つかりませんでした」と伝えてください
- 法律の解釈が必要な場合は、条文の文言に忠実に回答し、独自の解釈は避けてください
- 関連する条文が複数ある場合は、それぞれの条文を引用してください

【参考情報】
{context}'
),
(
    '高圧ガス保安法',
    'high-pressure-gas',
    '高圧ガス保安法に関する質問に回答します。高圧ガスの製造・貯蔵・販売・移動の規制などについてお答えします。',
    0.3,
    8,
    3,
    'あなたは「高圧ガス保安法」の専門アシスタントです。
以下の参考情報は高圧ガス保安法の条文から抽出されたものです。
この参考情報をもとに、正確かつ具体的に回答してください。

回答のルール:
- 参考情報に含まれる条文番号（第○条）を明示して回答してください
- 参考情報に含まれない内容については「高圧ガス保安法の提供された範囲には該当する規定が見つかりませんでした」と伝えてください
- 法律の解釈が必要な場合は、条文の文言に忠実に回答し、独自の解釈は避けてください
- 関連する条文が複数ある場合は、それぞれの条文を引用してください

【参考情報】
{context}'
);

-- ============================================================
-- 文書とチャットボットの自動紐付け（ファイル名ベース）
-- ※ 文書を再アップロードした後にもう一度この部分だけ実行してください
-- ============================================================

-- ガス事業法
INSERT INTO chatbot_documents (chatbot_id, document_id)
SELECT c.id, d.id
FROM chatbots c, documents d
WHERE c.slug = 'gas-business'
  AND d.filename ILIKE '%ガス事業法%'
ON CONFLICT DO NOTHING;

-- 液化石油ガス法
INSERT INTO chatbot_documents (chatbot_id, document_id)
SELECT c.id, d.id
FROM chatbots c, documents d
WHERE c.slug = 'lpg-law'
  AND (d.filename ILIKE '%液化石油ガス%' OR d.filename ILIKE '%液化ガス%')
ON CONFLICT DO NOTHING;

-- 高圧ガス保安法
INSERT INTO chatbot_documents (chatbot_id, document_id)
SELECT c.id, d.id
FROM chatbots c, documents d
WHERE c.slug = 'high-pressure-gas'
  AND d.filename ILIKE '%高圧ガス保安法%'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 確認
-- ============================================================
SELECT c.name AS chatbot_name, c.slug, d.filename AS linked_document
FROM chatbots c
LEFT JOIN chatbot_documents cd ON c.id = cd.chatbot_id
LEFT JOIN documents d ON cd.document_id = d.id
ORDER BY c.display_order;

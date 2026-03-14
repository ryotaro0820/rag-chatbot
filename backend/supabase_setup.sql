-- pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- カテゴリ (先に作成 - documentsが参照するため)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文書メタデータ
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    file_size INTEGER,
    chunk_count INTEGER,
    storage_path TEXT,
    version INTEGER DEFAULT 1,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文書チャンク + ベクトル
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_numbers TEXT,
    embedding VECTOR(1536)
);

-- ベクトル検索用インデックス
CREATE INDEX idx_document_chunks_embedding ON document_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- チャットログ
CREATE TABLE chat_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    client_ip TEXT,
    user_message TEXT NOT NULL,
    assistant_message TEXT,
    source_documents JSONB,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- フィードバック
CREATE TABLE feedback (
    id BIGSERIAL PRIMARY KEY,
    chat_log_id BIGINT NOT NULL REFERENCES chat_logs(id),
    rating TEXT CHECK(rating IN ('up', 'down')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API使用量 (日次集計)
CREATE TABLE usage_daily (
    date DATE PRIMARY KEY,
    total_requests INTEGER DEFAULT 0,
    total_prompt_tokens INTEGER DEFAULT 0,
    total_completion_tokens INTEGER DEFAULT 0,
    total_embedding_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0.0
);

-- ベクトル類似検索用の関数
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
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

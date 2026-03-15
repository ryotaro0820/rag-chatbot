-- ============================================================
-- チャットボット設定テーブル（既存の場合はスキップ）
-- ============================================================

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

-- チャットボットと文書の紐付け（多対多）
CREATE TABLE IF NOT EXISTS chatbot_documents (
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (chatbot_id, document_id)
);

-- chat_logs に chatbot_id カラムを追加（既存カラムがない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_logs' AND column_name = 'chatbot_id'
    ) THEN
        ALTER TABLE chat_logs ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- chatbot_id に紐づく文書のみを対象にベクトル検索する関数
-- ============================================================
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

-- match_chunks 関数も閾値を更新
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

-- ============================================================
-- 特定の document_id 内でベクトル検索する関数
-- ============================================================
CREATE OR REPLACE FUNCTION match_chunks_for_document(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 8,
    match_threshold FLOAT DEFAULT 0.3,
    p_document_id UUID DEFAULT NULL
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
      AND (p_document_id IS NULL OR dc.document_id = p_document_id)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================
-- 検索モード別チャットボット（strict / standard / broad）
-- ============================================================
DELETE FROM chatbot_documents;
DELETE FROM chatbots;

INSERT INTO chatbots (name, slug, description, similarity_threshold, top_k, display_order, system_prompt) VALUES
(
    '厳密検索モード',
    'strict',
    '文書への一致率が高いものだけ回答します。正確性を重視する場合に最適です。',
    0.5,
    5,
    1,
    'あなたは法令文書に基づいて質問に答えるアシスタントです。
以下の参考情報をもとに、正確かつ具体的に回答してください。
参考情報に含まれない内容については、「この情報は提供された文書には含まれていません」と正直に伝えてください。
回答の際は、条文番号（第○条）を明示してください。
【重要】参考情報との一致度が高い情報のみを使用して回答してください。推測や補完は行わないでください。

【参考情報】
{context}'
),
(
    '標準検索モード',
    'standard',
    '中程度の一致率でも回答します。バランスの取れた検索モードです。',
    0.3,
    8,
    2,
    'あなたは法令文書に基づいて質問に答えるアシスタントです。
以下の参考情報をもとに、正確かつ具体的に回答してください。
参考情報に含まれない内容については、「この情報は提供された文書には含まれていません」と正直に伝えてください。
回答の際は、条文番号（第○条）を明示してください。

【参考情報】
{context}'
),
(
    '広範検索モード',
    'broad',
    '一致率が低くても関連情報を幅広く抽出します。探索的な質問に最適です。',
    0.15,
    12,
    3,
    'あなたは法令文書に基づいて質問に答えるアシスタントです。
以下の参考情報をもとに、できるだけ関連する情報を集めて回答してください。
直接的な回答が見つからない場合でも、関連する情報があれば提示してください。
参考情報に全く関連する内容がない場合のみ、「関連する情報が見つかりませんでした」と伝えてください。
回答の際は、条文番号（第○条）を明示してください。

【参考情報】
{context}'
);

-- All documents are available to all chatbots (no per-chatbot document filtering needed for this mode)
-- The per-document search is done automatically for each document in the system

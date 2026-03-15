-- =============================================
-- チャットボット設定テーブル
-- =============================================
CREATE TABLE chatbots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    similarity_threshold FLOAT NOT NULL DEFAULT 0.7,
    top_k INTEGER NOT NULL DEFAULT 5,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- チャットボットごとの文書割り当て（多対多）
CREATE TABLE chatbot_documents (
    chatbot_id UUID NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (chatbot_id, document_id)
);

-- chat_logsにchatbot_idカラム追加
ALTER TABLE chat_logs ADD COLUMN chatbot_id UUID REFERENCES chatbots(id) ON DELETE SET NULL;

-- =============================================
-- 初期データ: 3つのチャットボット
-- =============================================
INSERT INTO chatbots (name, slug, description, similarity_threshold, top_k, display_order) VALUES
('高精度モード', 'high', '類似度が高い文書のみを参照して正確に回答します。確実な情報が必要な場合に最適です。', 0.85, 3, 1),
('標準モード', 'medium', '適度な類似度の文書を参照してバランスよく回答します。一般的な質問に最適です。', 0.70, 5, 2),
('広範囲モード', 'low', '類似度が低い文書も含めて幅広く情報を抽出します。関連情報を網羅的に探したい場合に最適です。', 0.50, 8, 3);

-- =============================================
-- チャットボット別ベクトル検索関数
-- =============================================
CREATE OR REPLACE FUNCTION match_chunks_for_chatbot(
    query_embedding VECTOR(1536),
    p_chatbot_id UUID,
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
    JOIN chatbot_documents cd ON cd.document_id = d.id
    WHERE cd.chatbot_id = p_chatbot_id
      AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

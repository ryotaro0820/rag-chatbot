-- ============================================================================
-- Row Level Security (RLS) 有効化マイグレーション
-- ----------------------------------------------------------------------------
-- 目的: 多層防御。本アプリのサーバー側は Service Role Key 経由でアクセスするため
--       RLS をバイパスし、動作には一切影響しない。一方で anon / authenticated
--       ロール（= 公開 anon キー）からの PostgREST 直アクセスを完全に遮断する。
--
-- 前提: チャット・フィードバック等の公開エンドポイントを含め、全テーブルアクセスは
--       getSupabaseAdmin()（Service Role）経由。anon キーは GoTrue 認証
--       （ログイン/リフレッシュ/パスワード変更）にのみ使用しており、テーブルや
--       RPC を直接叩いていないことを確認済み。
--
-- 効果: RLS 有効化 + ポリシー無し = service_role 以外は全行アクセス不可（deny-all）。
--       将来 anon キーをクライアントに露出した場合でも、データは保護される。
--
-- 実行: Supabase ダッシュボードの SQL Editor に貼り付けて実行（冪等）。
-- ============================================================================

ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily       ENABLE ROW LEVEL SECURITY;

-- 念のため anon / authenticated の権限を明示的に剥奪（RLS と二重の防御）。
-- service_role はスーパーユーザー相当のため影響を受けない。
REVOKE ALL ON categories        FROM anon, authenticated;
REVOKE ALL ON documents         FROM anon, authenticated;
REVOKE ALL ON document_chunks   FROM anon, authenticated;
REVOKE ALL ON chatbots          FROM anon, authenticated;
REVOKE ALL ON chatbot_documents FROM anon, authenticated;
REVOKE ALL ON chat_logs         FROM anon, authenticated;
REVOKE ALL ON feedback          FROM anon, authenticated;
REVOKE ALL ON usage_daily       FROM anon, authenticated;

-- 確認用クエリ（任意）:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('categories','documents','document_chunks','chatbots',
--                     'chatbot_documents','chat_logs','feedback','usage_daily');

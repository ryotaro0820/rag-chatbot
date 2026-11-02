-- Supabase Security Advisor の警告8件を解消する(2026-11-02 に本番の chatbot プロジェクトへ適用)
--
-- このプロジェクトは daipro-lab と共用。ここで触るのは rag-chatbot の関数・表と vector 拡張だけ。
-- rag-chatbot のサーバは service role で読み書きしているので、anon / authenticated の権限を外しても動きは変わらない。
--
--  0011 Function Search Path Mutable  … 関数が呼び出し側の search_path で名前を探さないよう固定する
--  0014 Extension in Public           … vector 拡張を extensions スキーマへ移す(列の型・索引はそのまま使える)
--  0026/0027 GraphQL で見える表        … question_embeddings を anon / authenticated から外す
--
-- t_probe_before / t_probe_after はどの表のトリガにも付いていない試験用の残り。消さずに search_path だけ固定する。
-- backend/supabase_setup.sql で関数を作り直すときは、同じ SET search_path を付けること(付けないと警告が戻る)。

begin;

alter extension vector set schema extensions;

alter function public.match_chunks(extensions.vector, integer, double precision)
  set search_path = public, extensions;
alter function public.match_chunks_for_chatbot(extensions.vector, integer, double precision, uuid)
  set search_path = public, extensions;
alter function public.match_chunks_for_document(extensions.vector, integer, double precision, uuid)
  set search_path = public, extensions;

alter function public.t_probe_before() set search_path = public;
alter function public.t_probe_after() set search_path = public;

revoke all on table public.question_embeddings from anon, authenticated;

commit;

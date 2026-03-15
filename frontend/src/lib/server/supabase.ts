import { createClient } from "@supabase/supabase-js";

// サーバーサイド用 Supabase クライアント（Service Role Key使用）
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

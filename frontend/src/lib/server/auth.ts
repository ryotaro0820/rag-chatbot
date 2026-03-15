import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * 管理者トークンを検証する
 * Supabase Auth の getUser() を使用して確実にトークンを検証
 */
export async function verifyAdminToken(request: NextRequest): Promise<void> {
  // 1. Cookieからトークンを取得（優先）
  let token = request.cookies.get("admin_token")?.value;

  // 2. CookieがなければAuthorizationヘッダーからフォールバック
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    throw new Error("認証が必要です");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("サーバー設定エラー");
  }

  // Supabase Admin クライアントでトークンを検証
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("無効なトークンです");
  }
}

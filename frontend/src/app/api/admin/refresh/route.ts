import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * refresh_token を使って access_token を再発行する。
 * クライアントの authFetch が 401 を受けたときに呼び出し、
 * 新しい admin_token / admin_refresh クッキーをセットする。
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("admin_refresh")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "再認証が必要です" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    // refresh_token も失効 → 再ログインが必要
    const res = NextResponse.json({ error: "再ログインが必要です" }, { status: 401 });
    // 壊れたクッキーをクリア
    for (const name of ["admin_token", "admin_refresh", "admin_email"]) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return res;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ success: true });

  response.cookies.set("admin_token", data.session.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });

  // Supabase は refresh 時にトークンをローテーションするため新しい値で更新
  response.cookies.set("admin_refresh", data.session.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const { current_password, new_password } = await request.json();

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: "現在のパスワードと新しいパスワードを入力してください" },
        { status: 400 }
      );
    }

    if (new_password.length < 8) {
      return NextResponse.json(
        { error: "新しいパスワードは8文字以上で設定してください" },
        { status: 400 }
      );
    }

    // Cookie からトークンを取得してユーザーを特定
    const token = request.cookies.get("admin_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseServiceKey;

    // トークンからユーザーを取得
    const adminClient = getSupabaseAdmin();
    const { data: userData, error: userError } =
      await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "ユーザー情報の取得に失敗しました" },
        { status: 401 }
      );
    }

    // 現在のパスワードを検証（サインインを試みる）
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInError } =
      await verifyClient.auth.signInWithPassword({
        email: userData.user.email!,
        password: current_password,
      });

    if (signInError) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      );
    }

    // パスワードを更新
    const { error: updateError } =
      await adminClient.auth.admin.updateUserById(userData.user.id, {
        password: new_password,
      });

    if (updateError) {
      return NextResponse.json(
        { error: "パスワードの更新に失敗しました: " + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status =
      msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.email || !body.password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードが必要です" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // 基本的な入力バリデーション
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "無効な入力です" },
        { status: 400 }
      );
    }

    if (email.length > 254 || password.length > 128) {
      return NextResponse.json(
        { error: "入力値が長すぎます" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase configuration");
      return NextResponse.json(
        { error: "サーバー設定エラー" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 具体的なエラー内容は返さない（セキュリティ対策）
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      user_email: data.user.email,
    });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

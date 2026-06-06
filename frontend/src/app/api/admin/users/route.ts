import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase config");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 現在のユーザーが認証済みか確認 */
async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** GET: 管理者一覧を取得 */
export async function GET(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      return NextResponse.json(
        { error: "ユーザー一覧の取得に失敗しました" },
        { status: 500 }
      );
    }

    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email || "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }));

    return NextResponse.json(users);
  } catch {
    return NextResponse.json(
      { error: "サーバーエラー" },
      { status: 500 }
    );
  }
}

/** POST: 新しい管理者を追加 */
export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードが必要です" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // バリデーション
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "無効な入力です" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上にしてください" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // メール確認をスキップ
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        return NextResponse.json(
          { error: "このメールアドレスは既に登録されています" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `管理者の作成に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
    });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラー" },
      { status: 500 }
    );
  }
}

/** DELETE: 管理者を削除 */
export async function DELETE(request: NextRequest) {
  const currentUser = await verifyAdmin(request);
  if (!currentUser) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");

    if (!userId) {
      return NextResponse.json(
        { error: "ユーザーIDが必要です" },
        { status: 400 }
      );
    }

    // 自分自身は削除できない
    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: "自分自身を削除することはできません" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json(
        { error: `管理者の削除に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "サーバーエラー" },
      { status: 500 }
    );
  }
}

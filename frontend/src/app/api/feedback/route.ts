import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export async function POST(request: NextRequest) {
  try {
    const { chat_log_id, rating } = await request.json();

    if (!chat_log_id || !["up", "down"].includes(rating)) {
      return NextResponse.json(
        { error: "chat_log_id と rating (up/down) が必要です" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 既存のフィードバックがあれば更新
    const { data: existing } = await supabase
      .from("feedback")
      .select("id")
      .eq("chat_log_id", chat_log_id)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("feedback")
        .update({ rating })
        .eq("chat_log_id", chat_log_id);
    } else {
      await supabase.from("feedback").insert({ chat_log_id, rating });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

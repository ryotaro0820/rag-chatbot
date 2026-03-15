import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const limit = parseInt(
      request.nextUrl.searchParams.get("limit") || "10"
    );

    const supabase = getSupabaseAdmin();

    // 最新500件のログからよくある質問を集計
    const { data: logs, error } = await supabase
      .from("chat_logs")
      .select("user_message")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    // メッセージを集計
    const counts = new Map<string, number>();
    for (const log of logs || []) {
      const msg = log.user_message;
      counts.set(msg, (counts.get(msg) || 0) + 1);
    }

    const popular = Array.from(counts.entries())
      .map(([user_message, count]) => ({ user_message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return NextResponse.json(popular);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

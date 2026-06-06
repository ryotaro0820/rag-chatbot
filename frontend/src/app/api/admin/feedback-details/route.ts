import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const supabase = getSupabaseAdmin();

    // feedback テーブルから rating='down' のものを chat_logs と結合
    const { data, error } = await supabase
      .from("feedback")
      .select(
        `
        id,
        chat_log_id,
        created_at,
        chat_logs!inner (
          user_message,
          assistant_message
        )
      `
      )
      .eq("rating", "down")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    // フラット化して返す
    const result = (data || []).map((row: Record<string, unknown>) => {
      const chatLog = row.chat_logs as Record<string, unknown> | null;
      return {
        id: row.id,
        chat_log_id: row.chat_log_id,
        user_message: chatLog?.user_message ?? "",
        assistant_message: chatLog?.assistant_message ?? null,
        created_at: row.created_at,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status =
      msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("feedback").select("rating");

    if (error) throw new Error(error.message);

    const total = data?.length || 0;
    const upCount = data?.filter((f) => f.rating === "up").length || 0;
    const downCount = data?.filter((f) => f.rating === "down").length || 0;
    const upRatio = total > 0 ? Math.round((upCount / total) * 100) : 0;

    return NextResponse.json({
      total,
      up_count: upCount,
      down_count: downCount,
      up_ratio: upRatio,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

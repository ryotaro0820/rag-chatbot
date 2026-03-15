import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";
import { getUsageSummary } from "@/lib/server/usage-tracker";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const days = parseInt(
      request.nextUrl.searchParams.get("days") || "30"
    );

    const supabase = getSupabaseAdmin();
    const data = await getUsageSummary(supabase, days);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

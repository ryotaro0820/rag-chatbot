import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "50"),
      200
    );
    const offset = parseInt(
      request.nextUrl.searchParams.get("offset") || "0"
    );

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("chat_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);
    return NextResponse.json(data || []);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

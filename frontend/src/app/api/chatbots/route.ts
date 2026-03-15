import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

// 全チャットボット取得（公開）
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("chatbots")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (error) throw new Error(error.message);
    return NextResponse.json(data || []);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// チャットボット作成（管理者のみ）
export async function POST(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("chatbots")
      .insert({
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        similarity_threshold: body.similarity_threshold ?? 0.7,
        top_k: body.top_k ?? 5,
        system_prompt: body.system_prompt || null,
        display_order: body.display_order ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

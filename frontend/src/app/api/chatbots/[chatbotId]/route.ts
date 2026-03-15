import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

// チャットボット詳細取得（slug or id）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> }
) {
  try {
    const { chatbotId } = await params;
    const supabase = getSupabaseAdmin();

    // UUIDかslugかを判定
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        chatbotId
      );

    const { data, error } = await supabase
      .from("chatbots")
      .select("*")
      .eq(isUUID ? "id" : "slug", chatbotId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "チャットボットが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// チャットボット更新（管理者のみ）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { chatbotId } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.similarity_threshold !== undefined)
      updateData.similarity_threshold = body.similarity_threshold;
    if (body.top_k !== undefined) updateData.top_k = body.top_k;
    if (body.system_prompt !== undefined)
      updateData.system_prompt = body.system_prompt;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.display_order !== undefined)
      updateData.display_order = body.display_order;

    const { data, error } = await supabase
      .from("chatbots")
      .update(updateData)
      .eq("id", chatbotId)
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

// チャットボット削除（管理者のみ）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { chatbotId } = await params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("chatbots")
      .delete()
      .eq("id", chatbotId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

// チャットボットに割り当てられた文書ID一覧を取得
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> }
) {
  try {
    const { chatbotId } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("chatbot_documents")
      .select("document_id")
      .eq("chatbot_id", chatbotId);

    if (error) throw new Error(error.message);

    const documentIds = (data || []).map(
      (row: { document_id: string }) => row.document_id
    );
    return NextResponse.json(documentIds);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// チャットボットの文書割り当てを更新（全置換）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { chatbotId } = await params;
    const { document_ids } = await request.json();

    if (!Array.isArray(document_ids)) {
      return NextResponse.json(
        { error: "document_ids は配列である必要があります" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // 既存の割り当てを全削除
    await supabase
      .from("chatbot_documents")
      .delete()
      .eq("chatbot_id", chatbotId);

    // 新しい割り当てを挿入
    if (document_ids.length > 0) {
      const rows = document_ids.map((docId: string) => ({
        chatbot_id: chatbotId,
        document_id: docId,
      }));
      const { error } = await supabase
        .from("chatbot_documents")
        .insert(rows);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true, count: document_ids.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

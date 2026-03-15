import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";
import { deleteDocumentChunks } from "@/lib/server/vector-store";
import { deleteFile } from "@/lib/server/file-storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { documentId } = await params;
    const supabase = getSupabaseAdmin();

    // ドキュメント取得
    const { data: doc } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", documentId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { error: "ドキュメントが見つかりません" },
        { status: 404 }
      );
    }

    // チャンク削除
    await deleteDocumentChunks(supabase, documentId);

    // ストレージから削除
    if (doc.storage_path) {
      await deleteFile(supabase, doc.storage_path);
    }

    // メタデータ削除
    await supabase.from("documents").delete().eq("id", documentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

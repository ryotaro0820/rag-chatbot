import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getOpenAI } from "@/lib/server/openai";
import { verifyAdminToken } from "@/lib/server/auth";
import { extractText } from "@/lib/server/document-processor";
import { chunkText } from "@/lib/server/text-chunker";
import { storeChunks, deleteDocumentChunks } from "@/lib/server/vector-store";
import { uploadFile, deleteFile } from "@/lib/server/file-storage";
import { trackUsage } from "@/lib/server/usage-tracker";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { documentId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが必要です" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const openaiClient = getOpenAI();

    // 既存ドキュメント取得
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) {
      return NextResponse.json(
        { error: "ドキュメントが見つかりません" },
        { status: 404 }
      );
    }

    // 古いチャンクとファイルを削除
    await deleteDocumentChunks(supabase, documentId);
    if (doc.storage_path) {
      await deleteFile(supabase, doc.storage_path);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${documentId}/${file.name}`;

    // 新しいファイルをアップロード
    await uploadFile(supabase, storagePath, buffer, file.name);

    // テキスト抽出 & チャンク分割
    const pages = await extractText(buffer, file.name);
    const chunks = chunkText(pages);

    // ベクトル化 & 保存
    const embeddingTokens = await storeChunks(
      supabase,
      openaiClient,
      documentId,
      chunks
    );

    // メタデータ更新
    await supabase
      .from("documents")
      .update({
        filename: file.name,
        file_size: file.size,
        chunk_count: chunks.length,
        storage_path: storagePath,
        version: (doc.version || 1) + 1,
      })
      .eq("id", documentId);

    await trackUsage(supabase, 0, 0, embeddingTokens);

    return NextResponse.json({
      success: true,
      chunk_count: chunks.length,
      version: (doc.version || 1) + 1,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

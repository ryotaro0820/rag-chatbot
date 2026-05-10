import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getOpenAI } from "@/lib/server/openai";
import { verifyAdminToken } from "@/lib/server/auth";
import { extractText } from "@/lib/server/document-processor";
import { chunkText } from "@/lib/server/text-chunker";
import { storeChunks } from "@/lib/server/vector-store";
import { downloadFile, deleteFile } from "@/lib/server/file-storage";
import { trackUsage } from "@/lib/server/usage-tracker";

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ["pdf", "docx"];

/**
 * 1ファイル分の処理を行う。
 * 事前に /api/documents/upload-url で発行した署名URLでブラウザがStorageへ直接PUT済みの想定。
 * このエンドポイントはStorageからファイルを読み込み、テキスト抽出 → チャンク → ベクトル化 → DB保存を行う。
 */
export async function POST(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const body = await request.json().catch(() => ({}));
    const documentId = typeof body.document_id === "string" ? body.document_id : "";
    const storagePath = typeof body.storage_path === "string" ? body.storage_path : "";
    const filename = typeof body.filename === "string" ? body.filename : "";
    const fileSize = typeof body.file_size === "number" ? body.file_size : 0;
    const categoryId = typeof body.category_id === "string" ? body.category_id : null;

    if (!documentId || !storagePath || !filename) {
      return NextResponse.json(
        { error: "document_id, storage_path, filename が必要です" },
        { status: 400 }
      );
    }

    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "PDF または DOCX ファイルのみ対応しています" },
        { status: 400 }
      );
    }
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズが50MBを超えています" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const openaiClient = getOpenAI();

    try {
      const buffer = await downloadFile(supabase, storagePath);

      const pages = await extractText(buffer, filename);
      const chunks = chunkText(pages);

      const { error: docError } = await supabase.from("documents").insert({
        id: documentId,
        filename,
        category_id: categoryId || null,
        file_size: fileSize || buffer.length,
        chunk_count: chunks.length,
        storage_path: storagePath,
        version: 1,
      });
      if (docError) throw new Error(`文書メタデータ保存エラー: ${docError.message}`);

      const embeddingTokens = await storeChunks(
        supabase,
        openaiClient,
        documentId,
        chunks
      );

      await trackUsage(supabase, 0, 0, embeddingTokens);

      return NextResponse.json({
        success: true,
        document_id: documentId,
        chunk_count: chunks.length,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "処理エラー";
      console.error(`[Upload] ${filename} failed:`, errorMsg);
      // 失敗時はアップロード済みのファイルを掃除する
      await deleteFile(supabase, storagePath).catch(() => {});
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 500 }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getOpenAI } from "@/lib/server/openai";
import { verifyAdminToken } from "@/lib/server/auth";
import { extractText } from "@/lib/server/document-processor";
import { chunkText } from "@/lib/server/text-chunker";
import { storeChunks, deleteDocumentChunks } from "@/lib/server/vector-store";
import { downloadFile, deleteFile } from "@/lib/server/file-storage";
import { trackUsage } from "@/lib/server/usage-tracker";

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ["pdf", "docx"];

/**
 * 文書差し替え。事前に /api/documents/[documentId]/replace-url で発行した署名URLでブラウザが
 * Storageへ直接PUT済みの想定。このエンドポイントはStorageからファイルを読み込み、
 * 古いチャンク・ファイルを掃除し、新しいチャンクをベクトル化して保存する。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await verifyAdminToken(request);

    const { documentId } = await params;
    const body = await request.json().catch(() => ({}));
    const storagePath = typeof body.storage_path === "string" ? body.storage_path : "";
    const filename = typeof body.filename === "string" ? body.filename : "";
    const fileSize = typeof body.file_size === "number" ? body.file_size : 0;

    if (!storagePath || !filename) {
      return NextResponse.json(
        { error: "storage_path と filename が必要です" },
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

    // 既存ドキュメント取得
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) {
      // 新規アップロード時に発行されたファイルが既にStorageに残っている可能性があるので掃除
      await deleteFile(supabase, storagePath).catch(() => {});
      return NextResponse.json(
        { error: "ドキュメントが見つかりません" },
        { status: 404 }
      );
    }

    try {
      // 新ファイルをStorageから取得
      const buffer = await downloadFile(supabase, storagePath);

      // テキスト抽出 & チャンク分割（失敗したら古いデータは保持）
      const pages = await extractText(buffer, filename);
      const chunks = chunkText(pages);

      // 古いチャンクとファイルを削除
      await deleteDocumentChunks(supabase, documentId);
      if (doc.storage_path && doc.storage_path !== storagePath) {
        await deleteFile(supabase, doc.storage_path).catch(() => {});
      }

      // ベクトル化 & 保存
      const embeddingTokens = await storeChunks(
        supabase,
        openaiClient,
        documentId,
        chunks
      );

      const newVersion = (doc.version || 1) + 1;
      await supabase
        .from("documents")
        .update({
          filename,
          file_size: fileSize || buffer.length,
          chunk_count: chunks.length,
          storage_path: storagePath,
          version: newVersion,
        })
        .eq("id", documentId);

      await trackUsage(supabase, 0, 0, embeddingTokens);

      return NextResponse.json({
        success: true,
        chunk_count: chunks.length,
        version: newVersion,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "処理エラー";
      console.error(`[Replace] ${filename} failed:`, errorMsg);
      // 失敗時はアップロード済みの新ファイルを掃除（旧ファイルとDBは温存）
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

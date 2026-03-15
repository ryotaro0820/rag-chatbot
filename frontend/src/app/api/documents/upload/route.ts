import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getOpenAI } from "@/lib/server/openai";
import { verifyAdminToken } from "@/lib/server/auth";
import { extractText } from "@/lib/server/document-processor";
import { chunkText } from "@/lib/server/text-chunker";
import { storeChunks } from "@/lib/server/vector-store";
import { uploadFile } from "@/lib/server/file-storage";
import { trackUsage } from "@/lib/server/usage-tracker";
import { randomUUID } from "crypto";

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ["pdf", "docx"];

export async function POST(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const categoryId = formData.get("category_id") as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "ファイルが必要です" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const openaiClient = getOpenAI();
    const results = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        results.push({
          filename: file.name,
          success: false,
          error: "PDF または DOCX ファイルのみ対応しています",
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        results.push({
          filename: file.name,
          success: false,
          error: "ファイルサイズが50MBを超えています",
        });
        continue;
      }

      try {
        const documentId = randomUUID();
        const buffer = Buffer.from(await file.arrayBuffer());

        // ストレージにアップロード（日本語ファイル名はSupabase Storageで使えないのでUUID+拡張子）
        const storagePath = `${documentId}/file.${ext}`;
        await uploadFile(supabase, storagePath, buffer, file.name);

        // テキスト抽出
        const pages = await extractText(buffer, file.name);

        // チャンク分割
        const chunks = chunkText(pages);

        // メタデータを先に保存（外部キー制約のため）
        const { error: docError } = await supabase.from("documents").insert({
          id: documentId,
          filename: file.name,
          category_id: categoryId || null,
          file_size: file.size,
          chunk_count: chunks.length,
          storage_path: storagePath,
          version: 1,
        });
        if (docError) throw new Error(`文書メタデータ保存エラー: ${docError.message}`);

        // ベクトル化 & チャンク保存（documentsレコードが存在した後に実行）
        const embeddingTokens = await storeChunks(
          supabase,
          openaiClient,
          documentId,
          chunks
        );

        // 使用量記録
        await trackUsage(supabase, 0, 0, embeddingTokens);

        results.push({
          filename: file.name,
          success: true,
          document_id: documentId,
          chunk_count: chunks.length,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "処理エラー";
        console.error(`[Upload] ${file.name} failed:`, errorMsg);
        results.push({
          filename: file.name,
          success: false,
          error: errorMsg,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

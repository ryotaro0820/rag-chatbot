import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";
import { createSignedUpload } from "@/lib/server/file-storage";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ["pdf", "docx"];

export async function POST(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const body = await request.json().catch(() => ({}));
    const filename = typeof body.filename === "string" ? body.filename : "";
    const fileSize = typeof body.file_size === "number" ? body.file_size : 0;

    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "PDF または DOCX ファイルのみ対応しています" },
        { status: 400 }
      );
    }
    if (!fileSize || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズが50MBを超えています" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const documentId = randomUUID();
    const storagePath = `${documentId}/file.${ext}`;

    const { signedUrl, token } = await createSignedUpload(supabase, storagePath);

    return NextResponse.json({
      document_id: documentId,
      storage_path: storagePath,
      signed_url: signedUrl,
      token,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

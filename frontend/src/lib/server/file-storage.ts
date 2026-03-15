import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "documents";

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function uploadFile(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer,
  filename: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: getContentType(filename),
      upsert: true,
    });
  if (error) throw new Error(`ファイルアップロードエラー: ${error.message}`);
}

export async function deleteFile(
  supabase: SupabaseClient,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`ファイル削除エラー: ${error.message}`);
}

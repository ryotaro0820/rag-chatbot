import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "documents";

let bucketEnsured = false;

function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

/**
 * バケットが存在することを確認（存在しなければ作成）
 */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketEnsured) return;

  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    });
    if (createError && !createError.message.includes("already exists")) {
      console.error(`Bucket creation error: ${createError.message}`);
    }
  }

  bucketEnsured = true;
}

export async function uploadFile(
  supabase: SupabaseClient,
  path: string,
  buffer: Buffer,
  filename: string
): Promise<void> {
  await ensureBucket(supabase);

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

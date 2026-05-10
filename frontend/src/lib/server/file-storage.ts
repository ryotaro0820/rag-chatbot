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

/**
 * ブラウザから直接アップロードできる署名付きURLを発行する。
 * Vercelの4.5MBリクエストボディ上限を回避するため、サーバー経由ではなくクライアントが
 * Supabase Storageに直接PUTする目的で使う。
 */
export async function createSignedUpload(
  supabase: SupabaseClient,
  path: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  await ensureBucket(supabase);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`署名URL発行エラー: ${error?.message ?? "unknown"}`);
  }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/**
 * 保存済みファイルをBufferとして取得する。
 */
export async function downloadFile(
  supabase: SupabaseClient,
  path: string
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`ファイル取得エラー: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

import type { PageText } from "./text-chunker";

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<PageText[]> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    return extractTextFromPdf(buffer);
  } else if (ext === "docx") {
    return extractTextFromDocx(buffer);
  }
  throw new Error(`未対応のファイル形式です: ${ext}`);
}

async function extractTextFromPdf(buffer: Buffer): Promise<PageText[]> {
  // pdf-parse v1.1.1 は関数を直接エクスポート
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    buf: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ text: string; numpages: number }>;

  const data = await pdfParse(buffer);
  const pages: PageText[] = [];
  const rawPages = data.text.split("\f");

  for (let i = 0; i < rawPages.length; i++) {
    const text = rawPages[i].trim();
    if (text) {
      pages.push({ text, page: i + 1 });
    }
  }

  if (pages.length === 0 && data.text.trim()) {
    pages.push({ text: data.text.trim(), page: null });
  }

  return pages;
}

async function extractTextFromDocx(buffer: Buffer): Promise<PageText[]> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return [{ text: result.value, page: null }];
}

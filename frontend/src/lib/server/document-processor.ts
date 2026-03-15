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
  // pdf-parse v2 uses dynamic import
  const pdfParse = (await import("pdf-parse")).default;

  const pages: PageText[] = [];
  let currentPage = 0;

  await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      currentPage++;
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(" ");
      pages.push({ text, page: currentPage });
      return text;
    },
  });

  // If pagerender didn't work, fall back to full text
  if (pages.length === 0) {
    const data = await pdfParse(buffer);
    pages.push({ text: data.text, page: null });
  }

  return pages;
}

async function extractTextFromDocx(buffer: Buffer): Promise<PageText[]> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  // DOCXはページ情報が取れないので全体を1つにする
  return [{ text: result.value, page: null }];
}

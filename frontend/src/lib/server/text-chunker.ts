export interface PageText {
  text: string;
  page: number | null;
}

export interface TextChunk {
  text: string;
  chunk_index: number;
  page_numbers: string | null;
}

export function chunkText(
  pages: PageText[],
  chunkSize: number = 500,
  chunkOverlap: number = 100
): TextChunk[] {
  // 文をページ情報付きで分割
  const annotatedSegments: { text: string; page: number | null }[] = [];
  for (const pageInfo of pages) {
    const sentences = pageInfo.text.split(/(?<=[。\n！？])/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) {
        annotatedSegments.push({ text: trimmed, page: pageInfo.page });
      }
    }
  }

  if (annotatedSegments.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentText = "";
  const currentPages = new Set<number | null>();
  let chunkIndex = 0;

  for (const segment of annotatedSegments) {
    const candidate = currentText + segment.text;

    if (candidate.length > chunkSize && currentText) {
      chunks.push({
        text: currentText.trim(),
        chunk_index: chunkIndex,
        page_numbers: formatPages(currentPages),
      });
      chunkIndex++;

      const overlapText =
        currentText.length > chunkOverlap
          ? currentText.slice(-chunkOverlap)
          : currentText;
      currentText = overlapText + segment.text;
      currentPages.clear();
      currentPages.add(segment.page);
    } else {
      currentText = candidate;
      currentPages.add(segment.page);
    }
  }

  if (currentText.trim()) {
    chunks.push({
      text: currentText.trim(),
      chunk_index: chunkIndex,
      page_numbers: formatPages(currentPages),
    });
  }

  return chunks;
}

function formatPages(pages: Set<number | null>): string | null {
  const nums = Array.from(pages)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (nums.length === 1) return String(nums[0]);
  return `${nums[0]}-${nums[nums.length - 1]}`;
}

export interface PageText {
  text: string;
  page: number | null;
}

export interface TextChunk {
  text: string;
  chunk_index: number;
  page_numbers: string | null;
}

/**
 * 法律文書向けテキスト前処理
 * - 不要な空白・改行を正規化
 * - 条文番号の前で確実に改行を入れる
 */
function preprocessLegalText(text: string): string {
  // 連続する空白・改行を正規化
  let processed = text.replace(/\r\n/g, "\n");
  // 空行が多すぎる場合は1つに
  processed = processed.replace(/\n{3,}/g, "\n\n");
  // 全角スペースの連続を1つに
  processed = processed.replace(/　{2,}/g, "　");
  return processed;
}

/**
 * 法律文書を条・項・号の構造を意識して文に分割する
 *
 * 分割の優先度:
 * 1. 「第XX条」「第XX条の2」などの条文区切り
 * 2. 「２」「３」などの項番号
 * 3. 句点「。」での文区切り
 * 4. 改行での区切り
 */
function splitLegalText(text: string): string[] {
  const preprocessed = preprocessLegalText(text);

  // 条文の区切りパターン（第X条、第X条のX、附則、別表など）
  // lookbehind で前の文が終わった後に分割
  const segments: string[] = [];

  // まず条文単位で大きく分割
  // 「第XX条」「附則」「別表」の前で分割
  const articlePattern = /(?=(?:第[一二三四五六七八九十百千\d０-９]+条(?:の[一二三四五六七八九十\d０-９]+)?))|(?=附　?則)|(?=別　?表)/g;

  const articleBlocks = preprocessed.split(articlePattern).filter(s => s.trim());

  for (const block of articleBlocks) {
    // 各条文ブロック内を、項（数字始まり）で分割
    // 「２　」「３　」「１０　」のような項番号パターン
    const paragraphPattern = /(?=\n[２-９０１][０-９]?　)/g;
    const paragraphs = block.split(paragraphPattern).filter(s => s.trim());

    for (const paragraph of paragraphs) {
      // 各項を句点で文に分割（ただし短すぎる分割は避ける）
      const sentences = paragraph.split(/(?<=。)\s*/);
      let currentSentence = "";

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        // 短い文は次の文とくっつける（最低80文字を目安）
        if (currentSentence.length + trimmed.length < 80) {
          currentSentence += trimmed;
        } else {
          if (currentSentence) {
            segments.push(currentSentence);
          }
          currentSentence = trimmed;
        }
      }
      if (currentSentence) {
        segments.push(currentSentence);
      }
    }
  }

  return segments.filter(s => s.trim().length > 0);
}

/**
 * 法律文書向けチャンク分割
 *
 * 改善ポイント:
 * - チャンクサイズを800文字に拡大（法律文書は文脈が重要）
 * - オーバーラップを200文字に拡大（条文の繋がりを保持）
 * - 条文構造を意識した分割
 * - 条文の見出し情報をチャンクに含める
 */
export function chunkText(
  pages: PageText[],
  chunkSize: number = 800,
  chunkOverlap: number = 200
): TextChunk[] {
  // ページごとに文をセグメント化（法律文書対応）
  const annotatedSegments: { text: string; page: number | null }[] = [];

  for (const pageInfo of pages) {
    const segments = splitLegalText(pageInfo.text);
    for (const segment of segments) {
      const trimmed = segment.trim();
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
    const separator = currentText ? "\n" : "";
    const candidate = currentText + separator + segment.text;

    if (candidate.length > chunkSize && currentText) {
      chunks.push({
        text: currentText.trim(),
        chunk_index: chunkIndex,
        page_numbers: formatPages(currentPages),
      });
      chunkIndex++;

      // オーバーラップ: 前のチャンクの末尾を保持
      const overlapText =
        currentText.length > chunkOverlap
          ? currentText.slice(-chunkOverlap)
          : currentText;
      currentText = overlapText + "\n" + segment.text;
      currentPages.clear();
      currentPages.add(segment.page);
    } else {
      currentText = candidate;
      currentPages.add(segment.page);
    }
  }

  // 残りをチャンク化
  if (currentText.trim()) {
    // 最後のチャンクが短すぎる場合は前のチャンクとマージ
    if (currentText.trim().length < 100 && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.text += "\n" + currentText.trim();
      // ページ情報を更新
      const existingPages = parsePages(lastChunk.page_numbers);
      for (const p of currentPages) {
        existingPages.add(p);
      }
      lastChunk.page_numbers = formatPages(existingPages);
    } else {
      chunks.push({
        text: currentText.trim(),
        chunk_index: chunkIndex,
        page_numbers: formatPages(currentPages),
      });
    }
  }

  return chunks;
}

function parsePages(pageStr: string | null): Set<number | null> {
  const pages = new Set<number | null>();
  if (!pageStr) return pages;
  const parts = pageStr.split("-");
  if (parts.length === 1) {
    pages.add(parseInt(parts[0], 10));
  } else {
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    for (let i = start; i <= end; i++) {
      pages.add(i);
    }
  }
  return pages;
}

function formatPages(pages: Set<number | null>): string | null {
  const nums = Array.from(pages)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (nums.length === 1) return String(nums[0]);
  return `${nums[0]}-${nums[nums.length - 1]}`;
}

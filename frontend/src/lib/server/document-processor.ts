import type { PageText } from "./text-chunker";

// pdf-parse(pdfjs-dist)がブラウザAPIを参照するため、サーバーレス環境用ポリフィル
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error DOMMatrix polyfill for Node.js serverless
  globalThis.DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    inverse() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
  };
}

if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error Path2D polyfill for Node.js serverless
  globalThis.Path2D = class Path2D {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    rect() {}
  };
}

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

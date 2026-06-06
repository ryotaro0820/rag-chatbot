#!/usr/bin/env python3
"""
10並列セッション用のページ範囲割当てを生成する。

- PDF1: 1000ページ（pages/pdf1/page-0001.jpg ... page-1000.jpg、4桁ゼロ詰め）
- PDF2:  270ページ（pages/pdf2/page-001.jpg  ... page-270.jpg、 3桁ゼロ詰め）

PDF1とPDF2は別ドキュメントなので、1セッション内で混ぜず、
- PDF1を約8セッションで分担
- PDF2を約2セッションで分担
とする（PDF2は1セッションに収めると約270ページとなり大きすぎるため2分割）。

実行：
    python3 scripts/assign_batches.py

出力：
    scripts/batches.json        ← 機械可読のバッチ定義
    scripts/batches.txt         ← 人間可読のバッチ一覧（コピペ用）
"""

from __future__ import annotations
import json
import math
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

PDF1_TOTAL = 1000
PDF2_TOTAL = 270

# PDF1を8セッション、PDF2を2セッションに割り当てる
PDF1_SESSIONS = 8
PDF2_SESSIONS = 2


def split_range(total: int, n: int) -> list[tuple[int, int]]:
    """1〜totalをn個のなるべく均等な[start, end]区間に分割する。"""
    base = total // n
    rem = total % n
    out: list[tuple[int, int]] = []
    cur = 1
    for i in range(n):
        size = base + (1 if i < rem else 0)
        start = cur
        end = cur + size - 1
        out.append((start, end))
        cur = end + 1
    return out


def main() -> None:
    batches: list[dict] = []
    bid = 1

    for start, end in split_range(PDF1_TOTAL, PDF1_SESSIONS):
        batches.append(
            {
                "batch_id": f"B{bid:02d}",
                "pdf": "pdf1",
                "pages_dir": "pages/pdf1",
                "page_pad": 4,  # page-0001.jpg
                "json_out_dir": "output/json/pdf1",
                "start_page": start,
                "end_page": end,
                "page_count": end - start + 1,
            }
        )
        bid += 1

    for start, end in split_range(PDF2_TOTAL, PDF2_SESSIONS):
        batches.append(
            {
                "batch_id": f"B{bid:02d}",
                "pdf": "pdf2",
                "pages_dir": "pages/pdf2",
                "page_pad": 3,  # page-001.jpg
                "json_out_dir": "output/json/pdf2",
                "start_page": start,
                "end_page": end,
                "page_count": end - start + 1,
            }
        )
        bid += 1

    json_path = PROJECT_ROOT / "scripts" / "batches.json"
    txt_path = PROJECT_ROOT / "scripts" / "batches.txt"

    json_path.write_text(
        json.dumps(batches, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    lines = ["# 10並列バッチ割り当て（PDF1=8セッション、PDF2=2セッション）", ""]
    total_pages = 0
    for b in batches:
        lines.append(
            f"{b['batch_id']}  {b['pdf']}  page {b['start_page']:>4} - {b['end_page']:>4}  "
            f"(全 {b['page_count']} ページ)  画像: {b['pages_dir']}/page-{'X'*b['page_pad']}.jpg  "
            f"出力: {b['json_out_dir']}/"
        )
        total_pages += b["page_count"]
    lines.append("")
    lines.append(f"# 合計: {total_pages} ページ ({len(batches)} セッション)")
    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    print()
    print(f"[OK] wrote {json_path.relative_to(PROJECT_ROOT)}")
    print(f"[OK] wrote {txt_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()

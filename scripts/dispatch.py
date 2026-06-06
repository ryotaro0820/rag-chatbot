#!/usr/bin/env python3
"""
バッチ定義から、各セッションに渡す具体的プロンプトを生成する。

実行：
    python3 scripts/dispatch.py                    # 10バッチ分のプロンプトを scripts/prompts/ に書き出す
    python3 scripts/dispatch.py --batch B03        # 特定バッチだけ
    python3 scripts/dispatch.py --print B03        # 標準出力に1バッチ分だけ出力（コピペ用）

各セッションを Claude Code で起動する手順：
    1. ターミナルを10個開く
    2. それぞれで `cd /Users/hiramatsuryotaro/Desktop/rag-chatbot && claude` を起動
    3. 生成された scripts/prompts/B01.md ... B10.md の中身を1つずつ貼り付ける
"""

from __future__ import annotations
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
TEMPLATE_PATH = SCRIPTS / "PROMPT_TEMPLATE.md"
BATCHES_PATH = SCRIPTS / "batches.json"
OUT_DIR = SCRIPTS / "prompts"


def render(batch: dict, template: str) -> str:
    repl = {
        "{{BATCH_ID}}": batch["batch_id"],
        "{{PDF}}": batch["pdf"],
        "{{PAGES_DIR}}": batch["pages_dir"],
        "{{PAGE_PAD}}": str(batch["page_pad"]),
        "{{JSON_OUT_DIR}}": batch["json_out_dir"],
        "{{START_PAGE}}": str(batch["start_page"]),
        "{{END_PAGE}}": str(batch["end_page"]),
    }
    out = template
    for k, v in repl.items():
        out = out.replace(k, v)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", help="生成対象のバッチID（省略時は全件）")
    ap.add_argument(
        "--print", dest="print_only", help="指定バッチを標準出力に表示してファイル生成しない"
    )
    args = ap.parse_args()

    if not TEMPLATE_PATH.exists():
        raise SystemExit(f"テンプレートが見つかりません: {TEMPLATE_PATH}")
    if not BATCHES_PATH.exists():
        raise SystemExit(
            f"バッチ定義が見つかりません: {BATCHES_PATH}\n"
            "先に `python3 scripts/assign_batches.py` を実行してください。"
        )

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    batches = json.loads(BATCHES_PATH.read_text(encoding="utf-8"))

    if args.print_only:
        target = next((b for b in batches if b["batch_id"] == args.print_only), None)
        if target is None:
            raise SystemExit(f"バッチ {args.print_only} が見つかりません。")
        print(render(target, template))
        return

    OUT_DIR.mkdir(exist_ok=True)
    targets = (
        [b for b in batches if b["batch_id"] == args.batch] if args.batch else batches
    )
    if not targets:
        raise SystemExit(f"指定バッチが見つかりません: {args.batch}")

    for b in targets:
        path = OUT_DIR / f"{b['batch_id']}.md"
        path.write_text(render(b, template), encoding="utf-8")
        print(
            f"[OK] {path.relative_to(ROOT)}  ({b['pdf']} pages {b['start_page']}-{b['end_page']}, {b['page_count']}p)"
        )


if __name__ == "__main__":
    main()

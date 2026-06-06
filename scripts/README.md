# 高圧ガス保安法規集 OCR・構造化 — 運用手順

10並列の Claude Code セッションで「高圧ガス保安法規集 第23次改訂版」（1270ページ）を
ページ単位 JSON 化 → 最終的に1本の .docx に集約する。

---

## 0. 前提

| 項目 | パス／値 |
|---|---|
| プロジェクトルート | `/Users/hiramatsuryotaro/Desktop/rag-chatbot` |
| 元PDF | `pdfs/20260421_高圧ガス保安法規集_{1,2}.pdf`（合計1270ページ） |
| ページ画像 | `pages/pdf1/page-NNNN.jpg`（4桁）、`pages/pdf2/page-NNN.jpg`（3桁） |
| ページJSON | `output/json/pdf1/page-NNNN.json`、`output/json/pdf2/page-NNN.json` |
| 最終docx | `output/docx/koatsu_gas_houkishuu_v23.docx` |
| 必要ツール | `pdftoppm`（poppler-utils）、`python-docx`、Claude Code |

---

## 1. 画像化（既に実施済）

両PDFは既に `pages/` 配下に画像化済み（200dpi / JPG quality 80）。
再生成が必要な場合は次のコマンド。

```bash
mkdir -p pages/pdf1 pages/pdf2
pdftoppm -jpeg -jpegopt quality=80 -r 200 \
    "pdfs/20260421_高圧ガス保安法規集_1.pdf" pages/pdf1/page -progress
pdftoppm -jpeg -jpegopt quality=80 -r 200 \
    "pdfs/20260421_高圧ガス保安法規集_2.pdf" pages/pdf2/page -progress
```

> pdftoppm はページ総数に応じて自動でゼロ詰め桁数を決める。
> 1000ページのPDF1は4桁、270ページのPDF2は3桁になる点に注意。

---

## 2. バッチ割り当て

```bash
python3 scripts/assign_batches.py
```

`scripts/batches.json` と `scripts/batches.txt` を生成する。
**8セッションでPDF1を、2セッションでPDF2を処理する設計**（各セッション約125〜135ページ）。

| バッチ | PDF | ページ範囲 | 件数 |
|---|---|---|---|
| B01 | pdf1 |    1 -  125 | 125 |
| B02 | pdf1 |  126 -  250 | 125 |
| B03 | pdf1 |  251 -  375 | 125 |
| B04 | pdf1 |  376 -  500 | 125 |
| B05 | pdf1 |  501 -  625 | 125 |
| B06 | pdf1 |  626 -  750 | 125 |
| B07 | pdf1 |  751 -  875 | 125 |
| B08 | pdf1 |  876 - 1000 | 125 |
| B09 | pdf2 |    1 -  135 | 135 |
| B10 | pdf2 |  136 -  270 | 135 |

> **既に処理済**：PDF1 page 1-5 のサンプルが `output/json/pdf1/` にある。
> B01 のセッションでは上書きされるので問題なし（再OCRされる）。
> 上書きしたくない場合は B01 を「6〜125」に手で書き換える。

---

## 3. 10セッション分のプロンプトを生成

```bash
python3 scripts/dispatch.py
```

`scripts/prompts/B01.md` 〜 `B10.md` が生成される。
各ファイルがそのまま1セッションへの貼り付け用プロンプト。

特定バッチだけ作り直す／中身を見る：
```bash
python3 scripts/dispatch.py --batch B03
python3 scripts/dispatch.py --print B03   # 標準出力に表示（コピペしやすい）
```

---

## 4. 10並列で Claude Code を起動

ターミナルを10個開き、それぞれで次を実行：

```bash
cd /Users/hiramatsuryotaro/Desktop/rag-chatbot
claude          # 通常モード／--dangerously-skip-permissions など好みで
```

起動したら、各セッションに対応する `scripts/prompts/BXX.md` の **全文をペースト**。
セッションは担当範囲のページを順に処理し、`output/json/pdf{1,2}/page-NNNN.json` を書き出していく。

### 並列の安全性
- セッション間で書き込み対象ページが重複しない設計（バッチで完全分割）
- 出力先ディレクトリは事前作成済み（`output/json/pdf1`、`output/json/pdf2`）
- 進捗ログは `[BXX] Processed: ...` を標準出力に出すよう指示済み

### 想定時間
1セッションあたり125〜135ページ × 1ページ平均30〜60秒（画像読込＋OCR＋JSON書出）として、**約1〜2.5時間**。
すべて並列で走らせれば全体も同程度（最も遅いセッションで律速される）。

---

## 5. 完了監視

```bash
# 各バッチの進捗（JSON生成数）
for i in 1 2; do
  echo "pdf$i:"; ls output/json/pdf$i/ | wc -l
done

# 未処理ページの検出（PDF1）
for n in $(seq -w 1 1000); do
  [ -f output/json/pdf1/page-${n}.json ] || echo "missing: pdf1 page-${n}"
done | head
```

---

## 6. 最終 .docx 集約

```bash
pip install python-docx          # 未インストールなら
python3 scripts/build_final_docx.py --include-uncertain
```

`output/docx/koatsu_gas_houkishuu_v23.docx` が生成される。
- ページ順に章立て、各ページ見出し付き
- 〔引用:…〕〜〔引用ここまで〕ブロックは赤字でインデント表示
- `--include-uncertain` を付けると末尾に「自信のない文字一覧」を付録として出力

片方だけ集約：
```bash
python3 scripts/build_final_docx.py --pdf pdf1
python3 scripts/build_final_docx.py --pdf pdf2
```

---

## 7. 品質チェックの推奨手順

1. ランダムに 5〜10 ページを選び、生成docxと元PDFの該当ページを目視比較
2. `output/json/pdf*/page-*.json` の `uncertain` を grep で集計し、特定セッションに不確実が集中していないか確認
3. `self_check.brackets_balanced` や `citations_paired` が false のページを抽出し、優先的に再校正

```bash
# uncertain が多いページ Top 10
python3 - <<'PY'
import json, glob
from pathlib import Path
counts = []
for f in glob.glob("output/json/**/page-*.json", recursive=True):
    p = json.loads(Path(f).read_text(encoding="utf-8"))
    counts.append((len(p.get("uncertain", [])), f))
for n, f in sorted(counts, reverse=True)[:10]:
    print(f"{n:>4}  {f}")
PY
```

---

## 8. ファイル構成（成果物含む）

```
.
├── pdfs/                              # 元PDF（読み取り専用扱い）
├── pages/{pdf1,pdf2}/                 # 画像化済みページ
├── output/
│   ├── json/{pdf1,pdf2}/page-*.json   # 各セッションが書き出すページ単位JSON
│   ├── docx/koatsu_gas_houkishuu_v23.docx  # 最終成果物
│   └── logs/                          # 画像化ログ、エラーログ
└── scripts/
    ├── README.md                      ← 本ファイル
    ├── assign_batches.py
    ├── batches.json / batches.txt
    ├── PROMPT_TEMPLATE.md
    ├── dispatch.py
    ├── prompts/B01.md ... B10.md
    └── build_final_docx.py
```

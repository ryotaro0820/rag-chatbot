import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { searchByDocument, generateQueryEmbedding, type ChunkResult } from "./vector-store";

const DEFAULT_SYSTEM_PROMPT = `あなたは社内文書に基づいて質問に答えるアシスタントです。

【絶対に守ること】
- 参考情報に書かれている内容のみを根拠とする。推測・一般知識による補完は禁止
- 参考情報に出てこない条文番号・数値・期間・金額・固有名詞を出力してはならない
- 条文番号・条項・固有名詞は原文どおりに記載する
- 出典の書き方: 各記述の直後に必ず改行し、次の行に \`出典：文書名 p.X\` の形式で記載する。出典に番号は付けない。複数の場合は \`出典：文書名A p.X、文書名B p.Y\` のように列挙する

【回答手順】
1. まず参考情報を全件読み、質問のキーワード・テーマと接点のある記述を全て拾う
2. 質問への直接の答えがあれば、それを回答する
3. 直接の答えが無くても、関連する条文・定義・手続があれば必ず提示する（「直接の定めは見当たらないが、関連する規定として〜」と明示）
4. 参考情報のどの記述とも質問のテーマが一致しない場合のみ「この文書には該当する情報が含まれていません」と答える

【出力スタイル】
- 回答は必ず箇条書きにする。各項目の先頭に「・」を付ける（「-」「*」「1.」などの記号や番号は使わない）
- 端的に答える。冗長な説明・前置き・背景説明はせず、要点のみを短く述べる
- 全体で3〜5行に収める（最大でも6行）
- 1項目は1〜2行。一文は80文字以内
- 「はい」「つまり」「したがって」「以上のとおり」などの繋ぎ言葉・前置き・締めの一文を書かない
- 質問の言い換えや背景説明は書かない（問われたことだけ答える）
- 表や条文を引用するとき、質問に直接答える数値・キーワード行のみ抜粋する。前後の説明文・見出し・無関係な列はコピーしない
- 抜粋した条文の意味を別文で言い換えない（条文がそのまま答えなら出典付きでそれだけ書く）

【出力例】
・高さ2m以上の壁類を設け、製造設備と火気との迂回水平距離を8m以上とする
出典：液化石油ガス保安技術_整形版.docx p.5

【参考情報】
{context}`;

// チャットボット個別の system_prompt を含む全プロンプトの末尾に必ず付与する出力形式ルール。
// 各チャットボットの system_prompt を個別編集せず、ここ 1 箇所で統一適用する。
// 文脈（context）の後＝プロンプト末尾に置くことで「最後の指示」として効きやすくする。
const FORMAT_RULES = `

【最優先の出力形式（必ず守る）】
・回答は必ず箇条書きにする。各項目の先頭に「・」を付ける（「-」「*」「1.」などの記号・番号は使わない）
・端的に答える。冗長な説明・前置き・背景説明はせず、要点のみを短く述べる
・出典は各記述ごとに書かず、回答の最後にまとめて1回だけ記載する
・出典行（「出典：…」）には「・」を付けない`;

/**
 * ファイル名から法令グループ名を判定する。
 * 同じ法令に属する文書は 1 タブにまとめて回答する。
 *
 * 注意: Mac から API 経由でアップロードされたファイル名は NFD（分解 Unicode）で
 * 保存されているため、includes 比較する前に NFC へ正規化する必要がある。
 * 例: ガ(U+30AC) vs カ(U+30AB)+濁点(U+3099)
 */
function getLawGroup(filename: string): string {
  const normalized = filename.normalize("NFC");
  if (normalized.includes("ガス事業法")) return "ガス事業法";
  if (normalized.includes("液化")) return "液化石油ガス法";
  if (normalized.includes("高圧ガス")) return "高圧ガス保安法";
  // それ以外はファイル名そのまま（拡張子・suffix除去）
  return normalized.replace(/\.[^.]+$/, "").replace(/[＿_].*$/, "");
}

function buildContext(chunks: ChunkResult[]): string {
  if (chunks.length === 0) {
    return "（関連する文書が見つかりませんでした）";
  }

  return chunks
    .map((chunk) => {
      let header = `[文書: ${chunk.filename}`;
      if (chunk.page_numbers) {
        header += `, ページ: ${chunk.page_numbers}`;
      }
      header += "]";
      return `${header}\n${chunk.content}`;
    })
    .join("\n---\n");
}

export interface ChatStreamOptions {
  openaiClient: OpenAI;
  supabase: SupabaseClient;
  message: string;
  history: { role: string; content: string }[];
  topK?: number;
  threshold?: number;
  chatbotId?: string;
  systemPromptOverride?: string | null;
}

// ============================================================================
// 裏での整合性チェック（方式B / (i)純・一般知識 / 全体適用）
// ----------------------------------------------------------------------------
// ② 文書を一切渡さず、一般知識のみで回答させる（参考用）
// ③ 文書ベース回答（正）と②の整合性を判定する
// 環境変数 CROSS_CHECK_ENABLED="false" で無効化できる（既定: 有効）。
// ============================================================================

const GENERAL_KNOWLEDGE_PROMPT = `あなたは法令・実務に詳しいアシスタントです。次の質問に「あなたの一般知識のみ」で答えてください（参考文書は与えられません）。
・箇条書きで端的に。各項目の先頭に「・」を付ける。
・不確かな点は「一般には〜とされる（要確認）」と明示する。
・最新の法改正を反映していない可能性がある点に留意する。`;

async function generateGeneralAnswer(
  client: OpenAI,
  message: string,
  history: { role: string; content: string }[]
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: GENERAL_KNOWLEDGE_PROMPT },
  ];
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  messages.push({ role: "user", content: message });
  const res = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages,
    seed: 42,
    reasoning_effort: "minimal",
    verbosity: "low",
    max_completion_tokens: 800,
  });
  return {
    text: (res.choices[0]?.message?.content || "").trim(),
    promptTokens: res.usage?.prompt_tokens || 0,
    completionTokens: res.usage?.completion_tokens || 0,
  };
}

const JUDGE_PROMPT = `以下の2つの回答の整合性を判定してください。
「文書ベース回答」を正（社内文書に基づく）とし、一般知識が異なっても文書側を誤りとはしないこと。差異は note に記す。

【文書ベース回答（正）】
{doc}

【一般知識回答（参考）】
{general}

必ず次のJSONを1個だけ返す（前後に文章を付けない）:
{"verdict":"一致|部分一致|不一致|判定不能","note":"相違点や補足を1〜2文。無ければ空文字"}
判定基準:
- 一致: 主要な事実・数値・結論が矛盾しない
- 部分一致: 一部一致するが片方にしかない要素や軽微な差がある
- 不一致: 事実・数値・結論が明確に矛盾する
- 判定不能: 文書ベース回答が「情報なし」等で比較できない`;

const VALID_VERDICTS = ["一致", "部分一致", "不一致", "判定不能"];

async function judgeConsistency(
  client: OpenAI,
  docAnswer: string,
  generalAnswer: string
): Promise<{ verdict: string; note: string; promptTokens: number; completionTokens: number }> {
  const res = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content: JUDGE_PROMPT.replace("{doc}", docAnswer).replace("{general}", generalAnswer),
      },
    ],
    seed: 42,
    reasoning_effort: "minimal",
    verbosity: "low",
    max_completion_tokens: 300,
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content || "";
  let verdict = "判定不能";
  let note = "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.verdict === "string" && VALID_VERDICTS.includes(parsed.verdict)) {
      verdict = parsed.verdict;
    }
    if (typeof parsed.note === "string") note = parsed.note;
  } catch {
    // パース失敗時は「判定不能」のまま（fail-open）
  }
  return {
    verdict,
    note,
    promptTokens: res.usage?.prompt_tokens || 0,
    completionTokens: res.usage?.completion_tokens || 0,
  };
}

export function createChatStream(options: ChatStreamOptions): ReadableStream {
  const {
    openaiClient,
    supabase,
    message,
    history,
    topK = 8,
    threshold = 0.2,
    chatbotId,
    systemPromptOverride,
  } = options;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Step 1: 対象文書を取得
        // チャットボットに文書が割り当てられていればその文書のみに絞り込む。
        // 割り当てが無い（＝既定の全社コーパス）場合は従来どおり全文書を検索する。
        let assignedIds: string[] | null = null;
        if (chatbotId) {
          const { data: links, error: linkError } = await supabase
            .from("chatbot_documents")
            .select("document_id")
            .eq("chatbot_id", chatbotId);
          // 取得失敗時は全文書検索へフォールバック（fail-open）。
          // 文書割り当ては関連性チューニング用であり権限境界ではない前提。
          // 障害を見落とさないようログだけは残す。
          if (linkError) {
            console.error("chatbot_documents 取得エラー:", linkError.message);
          }
          if (links && links.length > 0) {
            assignedIds = links.map((l) => l.document_id as string);
          }
        }

        let docQuery = supabase.from("documents").select("id, filename");
        if (assignedIds) {
          docQuery = docQuery.in("id", assignedIds);
        }
        const { data: documents, error: docError } = await docQuery.order(
          "filename"
        );

        if (docError || !documents || documents.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "文書が見つかりません" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // 裏で「一般知識のみの回答」(②) を 1 回だけ先行生成する（検索・本文生成と並行）。
        // 質問のみに依存するため法令グループ間で共有でき、コストは +1 回で済む。
        const CROSS_CHECK_ENABLED = process.env.CROSS_CHECK_ENABLED !== "false";
        const generalPromise: Promise<{
          text: string;
          promptTokens: number;
          completionTokens: number;
        } | null> = CROSS_CHECK_ENABLED
          ? generateGeneralAnswer(openaiClient, message, history).catch((e) => {
              console.error("一般知識回答の生成エラー:", e);
              return null;
            })
          : Promise.resolve(null);

        // Step 2: Generate embedding ONCE
        const { embedding: queryEmbedding, tokens: embeddingTokens } =
          await generateQueryEmbedding(openaiClient, message);

        // Step 3: Search ALL documents in parallel (big speed win)
        const searchResults = await Promise.all(
          documents.map((doc) =>
            searchByDocument(
              supabase,
              openaiClient,
              message,
              doc.id,
              topK,
              threshold,
              queryEmbedding
            )
          )
        );

        // Step 3.5: 法令グループ単位にチャンクを集約
        // - 同一法令に属する複数文書のヒットチャンクを統合し、類似度上位 topK のみ採用
        // - 各グループは UI 上 1 タブとして表示される
        const groups: Map<
          string,
          { firstDocId: string; chunks: ChunkResult[] }
        > = new Map();
        const groupOrder: string[] = [];
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const groupName = getLawGroup(doc.filename);
          if (!groups.has(groupName)) {
            groups.set(groupName, { firstDocId: doc.id, chunks: [] });
            groupOrder.push(groupName);
          }
          groups.get(groupName)!.chunks.push(...searchResults[i].chunks);
        }
        // グループ内で類似度降順に並べ、上位 topK のみ残す
        for (const g of groups.values()) {
          g.chunks.sort((a, b) => b.similarity - a.similarity);
          g.chunks = g.chunks.slice(0, topK);
        }

        // Step 4: 法令グループごとに回答を生成。
        // 各グループの LLM 呼び出しを「並列」実行し、トークンを doc_index 付きで
        // インターリーブしてストリーミングする（従来は直列でグループ数分だけ待っていた）。

        // まず全グループのタブ開始イベントを順番に送る（タブ表示順を保証）
        for (let gi = 0; gi < groupOrder.length; gi++) {
          const { firstDocId } = groups.get(groupOrder[gi])!;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "doc_start",
                doc_index: gi,
                document_id: firstDocId,
                filename: groupOrder[gi],
              })}\n\n`
            )
          );
        }

        const basePrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;

        // 文書ベース回答(①)と一般知識回答(②)の整合性を判定し、
        // reference(②本文) と consistency(③判定) イベントを送出する。
        // 判定(③)の使用トークンを返す（②のトークンは末尾で 1 回だけ加算する）。
        const emitCrossCheck = async (gi: number, docAnswer: string) => {
          if (!CROSS_CHECK_ENABLED) return { p: 0, c: 0 };
          const general = await generalPromise;
          if (!general || !general.text) return { p: 0, c: 0 };
          // 参考（文書外の一般知識）回答
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "reference", doc_index: gi, content: general.text })}\n\n`
            )
          );
          try {
            const judge = await judgeConsistency(openaiClient, docAnswer, general.text);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "consistency", doc_index: gi, verdict: judge.verdict, note: judge.note })}\n\n`
              )
            );
            return { p: judge.promptTokens, c: judge.completionTokens };
          } catch (e) {
            console.error("整合性判定エラー:", e);
            return { p: 0, c: 0 };
          }
        };

        // 1 グループ分の回答を生成しつつ chunk/sources/done をストリーミングする
        const runGroup = async (gi: number) => {
          const groupName = groupOrder[gi];
          const { firstDocId, chunks } = groups.get(groupName)!;

          // チャンクが無ければ LLM を呼ばずに即返す
          if (chunks.length === 0) {
            const noResultMsg = "この文書には関連する情報が見つかりませんでした。";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: noResultMsg, doc_index: gi })}\n\n`)
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "doc_sources", doc_index: gi, sources: [] })}\n\n`)
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "doc_done", doc_index: gi, full_response: noResultMsg })}\n\n`)
            );
            const cc0 = await emitCrossCheck(gi, noResultMsg);
            return { document_id: firstDocId, filename: groupName, full_response: noResultMsg, promptTokens: cc0.p, completionTokens: cc0.c };
          }

          const systemPrompt =
            basePrompt.replace("{context}", buildContext(chunks)) + FORMAT_RULES;
          const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
            { role: "system", content: systemPrompt },
          ];
          for (const msg of history.slice(-10)) {
            messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
          }
          messages.push({ role: "user", content: message });

          const stream = await openaiClient.chat.completions.create({
            model: "gpt-5-nano",
            messages,
            seed: 42,
            // 低レイテンシ化: 既定の重い推論を抑え、簡潔出力＋上限で暴走を防ぐ。
            // 本ボットは出典引用の抽出タスクなので minimal で十分。
            reasoning_effort: "minimal",
            verbosity: "low",
            max_completion_tokens: 1200,
            stream: true,
            stream_options: { include_usage: true },
          });

          let fullResponse = "";
          let promptTokens = 0;
          let completionTokens = 0;
          let lineBuf = "";
          let started = false;
          const citations: string[] = [];

          // 表示を確定的に整える正規化（gpt-5-nano は指定を時々無視するため）:
          //  1) 行頭の箇条書き記号（- * • ‐ ・ ＋前後の空白）を必ず単一の「・」へ
          //  2) 行中の「空白＋・」を「改行＋・」へ＝各箇条書きを必ず改行で始める
          //     語中の中黒（例: 点検・検査）は前に空白が無いので影響しない
          const normalizeLine = (line: string) =>
            line
              .replace(/^[ \t　]*[-*•‐・]+[ \t　]*/, "・")
              .replace(/[ \t　]+・[ \t　]*/g, "\n・");

          // 本文中の「出典：…（行末まで）」を抜き出して収集し、本文からは除去する。
          // 出典は各記述ごとではなく、回答の最後に 1 回だけまとめて表示する。
          const stripCitations = (text: string) =>
            text.replace(/[ \t　]*出典[：:][^\n]*/g, (m) => {
              const c = m.replace(/^[\s]+/, "").trim();
              if (c) citations.push(c);
              return "";
            });

          const emitChunk = (text: string) => {
            if (!text) return;
            // 先頭の余分な改行・空白は最初の送出時に取り除く
            if (!started) {
              text = text.replace(/^\s+/, "");
              if (!text) return;
              started = true;
            }
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: text, doc_index: gi })}\n\n`)
            );
          };

          // 1 行（モデル出力の改行まで）を正規化＋出典除去して送出する
          const emitLine = (rawLine: string) => {
            let text = stripCitations(normalizeLine(rawLine));
            text = text.replace(/\n{2,}/g, "\n"); // 出典除去で生じた空行を圧縮
            if (text.replace(/\s/g, "") === "") return; // 中身が無ければ送らない
            emitChunk(text);
          };

          for await (const chunk of stream) {
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens;
              completionTokens = chunk.usage.completion_tokens;
            }
            const content = chunk.choices?.[0]?.delta?.content;
            if (!content) continue;
            lineBuf += content;
            // 改行を含む完成した行を順に処理して送出する
            let nl = lineBuf.indexOf("\n");
            while (nl !== -1) {
              emitLine(lineBuf.slice(0, nl + 1));
              lineBuf = lineBuf.slice(nl + 1);
              nl = lineBuf.indexOf("\n");
            }
          }
          // 末尾の未完了行
          emitLine(lineBuf);

          // 収集した出典を末尾に 1 回だけまとめて表示（重複除去・出現順維持）
          const uniqueCitations = [...new Set(citations)];
          if (uniqueCitations.length > 0) {
            emitChunk("\n\n" + uniqueCitations.join("\n"));
          }

          // 参照元はグループ内の実ファイル名のままユーザーに表示する
          const sources = chunks.map((c) => ({
            document_id: c.document_id,
            filename: c.filename,
            content: c.content.slice(0, 200),
            page_numbers: c.page_numbers,
            similarity: Math.round(c.similarity * 1000) / 1000,
          }));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "doc_sources", doc_index: gi, sources })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "doc_done", doc_index: gi, full_response: fullResponse })}\n\n`)
          );

          // 裏で整合性チェック（②参考回答 + ③判定）を送出
          const cc = await emitCrossCheck(gi, fullResponse);
          promptTokens += cc.p;
          completionTokens += cc.c;

          return { document_id: firstDocId, filename: groupName, full_response: fullResponse, promptTokens, completionTokens };
        };

        // 全グループを並列実行（壁時計時間 ≈ 最も遅いグループ 1 本分）
        const groupResults = await Promise.all(groupOrder.map((_, gi) => runGroup(gi)));

        // 一般知識回答(②)のトークンはグループ間で共有のため、ここで 1 回だけ加算する
        const generalResult = await generalPromise;
        const totalPromptTokens =
          groupResults.reduce((s, r) => s + r.promptTokens, 0) +
          (generalResult?.promptTokens || 0);
        const totalCompletionTokens =
          groupResults.reduce((s, r) => s + r.completionTokens, 0) +
          (generalResult?.completionTokens || 0);
        const docResults = groupResults.map((r) => ({
          document_id: r.document_id,
          filename: r.filename,
          full_response: r.full_response,
        }));

        // Final done signal
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              prompt_tokens: totalPromptTokens,
              completion_tokens: totalCompletionTokens,
              embedding_tokens: embeddingTokens,
              documents: docResults,
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        // 詳細はサーバーログにのみ残し、クライアントには汎用文言を返す
        console.error("createChatStream error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: "回答の生成中にエラーが発生しました。もう一度お試しください。",
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

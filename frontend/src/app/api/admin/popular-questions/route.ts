import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";
import { getOpenAI } from "@/lib/server/openai";
import { generateEmbedding } from "@/lib/server/vector-store";

const SIMILARITY_THRESHOLD = 0.9;

function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, " ")
    .replace(/[？?]+$/u, "")
    .trim();
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parsePgVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") return JSON.parse(v) as number[];
  throw new Error("unexpected embedding format");
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminToken(request);

    const limit = parseInt(
      request.nextUrl.searchParams.get("limit") || "10"
    );

    const supabase = getSupabaseAdmin();

    const { data: logs, error } = await supabase
      .from("chat_logs")
      .select("user_message")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    // Count by normalized form, remember most-frequent original wording per key
    const exactCounts = new Map<
      string,
      { count: number; representatives: Map<string, number> }
    >();
    for (const log of logs || []) {
      const raw = (log.user_message || "").trim();
      if (!raw) continue;
      const norm = normalize(raw);
      const bucket = exactCounts.get(norm) ?? {
        count: 0,
        representatives: new Map<string, number>(),
      };
      bucket.count += 1;
      bucket.representatives.set(
        raw,
        (bucket.representatives.get(raw) || 0) + 1
      );
      exactCounts.set(norm, bucket);
    }

    if (exactCounts.size === 0) {
      return NextResponse.json([]);
    }

    // Fetch cached embeddings
    const normTexts = Array.from(exactCounts.keys());
    const { data: cached } = await supabase
      .from("question_embeddings")
      .select("normalized_text, embedding")
      .in("normalized_text", normTexts);

    const embeddingMap = new Map<string, number[]>();
    for (const row of cached || []) {
      embeddingMap.set(row.normalized_text, parsePgVector(row.embedding));
    }

    // Compute and cache any missing embeddings
    const missing = normTexts.filter((t) => !embeddingMap.has(t));
    if (missing.length > 0) {
      const openai = getOpenAI();
      const toInsert: { normalized_text: string; embedding: string }[] = [];
      for (const text of missing) {
        try {
          const emb = await generateEmbedding(openai, text);
          embeddingMap.set(text, emb);
          toInsert.push({
            normalized_text: text,
            embedding: `[${emb.join(",")}]`,
          });
        } catch {
          // skip failed embeddings; they'll be retried next call
        }
      }
      if (toInsert.length > 0) {
        await supabase
          .from("question_embeddings")
          .upsert(toInsert, { onConflict: "normalized_text" });
      }
    }

    // Greedy clustering: sort by count desc, assign each to nearest existing
    // cluster within threshold, else start a new cluster.
    type Cluster = {
      centerEmbedding: number[];
      count: number;
      representatives: Map<string, number>;
    };
    const clusters: Cluster[] = [];
    const sorted = Array.from(exactCounts.entries()).sort(
      (a, b) => b[1].count - a[1].count
    );

    for (const [norm, bucket] of sorted) {
      const emb = embeddingMap.get(norm);
      if (!emb) {
        // Embedding unavailable — treat as its own cluster
        clusters.push({
          centerEmbedding: [],
          count: bucket.count,
          representatives: new Map(bucket.representatives),
        });
        continue;
      }
      let best: { idx: number; sim: number } | null = null;
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].centerEmbedding.length === 0) continue;
        const sim = cosineSim(emb, clusters[i].centerEmbedding);
        if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) {
          best = { idx: i, sim };
        }
      }
      if (best) {
        const c = clusters[best.idx];
        c.count += bucket.count;
        for (const [rep, n] of bucket.representatives) {
          c.representatives.set(rep, (c.representatives.get(rep) || 0) + n);
        }
      } else {
        clusters.push({
          centerEmbedding: emb,
          count: bucket.count,
          representatives: new Map(bucket.representatives),
        });
      }
    }

    const popular = clusters
      .map((c) => {
        // Pick the most frequent original wording as representative
        let rep = "";
        let max = -1;
        for (const [text, n] of c.representatives) {
          if (n > max) {
            max = n;
            rep = text;
          }
        }
        return { user_message: rep, count: c.count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return NextResponse.json(popular);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    const status = msg.includes("認証") || msg.includes("トークン") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

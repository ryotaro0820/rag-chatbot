import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { verifyAdminToken } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const categoryId = request.nextUrl.searchParams.get("category_id");

    let query = supabase
      .from("documents")
      .select("*, categories(name)")
      .order("uploaded_at", { ascending: false });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const documents = (data || []).map((doc: Record<string, unknown>) => ({
      id: doc.id,
      filename: doc.filename,
      category_id: doc.category_id,
      category_name: (doc.categories as Record<string, unknown>)?.name || null,
      file_size: doc.file_size,
      chunk_count: doc.chunk_count,
      version: doc.version,
      uploaded_at: doc.uploaded_at,
    }));

    return NextResponse.json(documents);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { getDocumentChunks } from "@/lib/server/vector-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const supabase = getSupabaseAdmin();
    const chunks = await getDocumentChunks(supabase, documentId);
    return NextResponse.json(chunks);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

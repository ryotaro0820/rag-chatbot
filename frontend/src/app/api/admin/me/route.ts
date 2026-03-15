import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      // トークン無効 → Cookie削除
      const response = NextResponse.json({ authenticated: false }, { status: 401 });
      response.cookies.set("admin_token", "", { path: "/", maxAge: 0 });
      response.cookies.set("admin_email", "", { path: "/", maxAge: 0 });
      return response;
    }

    return NextResponse.json({
      authenticated: true,
      email: data.user.email || request.cookies.get("admin_email")?.value || "",
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

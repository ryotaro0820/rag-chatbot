import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    const email = request.cookies.get("admin_email")?.value || "";
    return NextResponse.json({ authenticated: true, email });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

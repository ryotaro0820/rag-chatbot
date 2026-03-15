import { jwtVerify } from "jose";
import { NextRequest } from "next/server";

export async function verifyAdminToken(request: NextRequest): Promise<void> {
  // 1. Cookieからトークンを取得（優先）
  let token = request.cookies.get("admin_token")?.value;

  // 2. CookieがなければAuthorizationヘッダーからフォールバック
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    throw new Error("認証が必要です");
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Missing SUPABASE_JWT_SECRET");
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
  } catch {
    throw new Error("無効なトークンです");
  }
}

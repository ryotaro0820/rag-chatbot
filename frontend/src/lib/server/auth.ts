import { jwtVerify } from "jose";
import { NextRequest } from "next/server";

export async function verifyAdminToken(request: NextRequest): Promise<void> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("認証が必要です");
  }

  const token = authHeader.split(" ")[1];
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

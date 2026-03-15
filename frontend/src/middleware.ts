import { NextRequest, NextResponse } from "next/server";

// レート制限用のインメモリストア
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/admin/login": { max: 5, windowMs: 60 * 1000 },
  "/api/chat": { max: 10, windowMs: 60 * 1000 },
  "/api/documents/upload": { max: 5, windowMs: 60 * 1000 },
  "/api/feedback": { max: 20, windowMs: 60 * 1000 },
};

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count++;
  return true;
}

function cleanupStore() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * 認証トークンを取得（Cookie優先、Authorizationヘッダーにフォールバック）
 */
function getAdminToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get("admin_token")?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 定期クリーンアップ
  if (Math.random() < 0.01) cleanupStore();

  // API ルートのレート制限
  for (const [path, limit] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(path)) {
      const ip = getClientIp(request);
      const key = `${ip}:${path}`;

      if (!checkRateLimit(key, limit.max, limit.windowMs)) {
        return NextResponse.json(
          { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
          {
            status: 429,
            headers: { "Retry-After": "60" },
          }
        );
      }
      break;
    }
  }

  // 管理者API（login, logout, me以外）はトークン必須
  if (
    pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/logout") &&
    !pathname.startsWith("/api/admin/me")
  ) {
    const token = getAdminToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }
  }

  // 文書管理API（GET以外）は認証必須
  if (
    pathname.startsWith("/api/documents") &&
    request.method !== "GET"
  ) {
    const token = getAdminToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }
  }

  // カテゴリAPI（GET以外）は認証必須
  if (
    pathname.startsWith("/api/categories") &&
    request.method !== "GET"
  ) {
    const token = getAdminToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }
  }

  // チャットボットAPI（PUT/DELETE/POST）は認証必須
  if (
    pathname.startsWith("/api/chatbots") &&
    (request.method === "PUT" || request.method === "DELETE" || request.method === "POST")
  ) {
    const token = getAdminToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

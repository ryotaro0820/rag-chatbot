import type { NextConfig } from "next";

const securityHeaders = [
  // XSS攻撃防止
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  // Content-Typeスニッフィング防止
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // クリックジャッキング防止
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // リファラーポリシー
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // HSTS（HTTPS強制）
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // パーミッションポリシー（不要なブラウザ機能を無効化）
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP（Content Security Policy）
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co https://api.openai.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // 管理者ページを検索エンジンからインデックス除外
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },

  // X-Powered-By ヘッダーを非表示
  poweredByHeader: false,

  // サーバーサイドで使うパッケージ
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;

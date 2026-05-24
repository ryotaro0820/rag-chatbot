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
  // HSTS（HTTPS強制）- 2年間 + preload申請対応
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // パーミッションポリシー（不要なブラウザ機能を無効化）
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  // CSP（Content Security Policy）- 厳格化
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
    ].join("; "),
  },
  // Cross-Origin セキュリティ
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "credentialless",
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
      // APIエンドポイントのキャッシュ無効化
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex",
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

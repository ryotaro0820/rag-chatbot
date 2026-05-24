import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "社内文書チャットボット",
  description: "社内文書に基づいて質問に答えるAIチャットボット。ガス事業法・液化石油ガス法・高圧ガス保安法に関する質問にお答えします。",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "社内文書チャットボット",
    description: "社内文書に基づいて質問に答えるAIチャットボット",
    type: "website",
    locale: "ja_JP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

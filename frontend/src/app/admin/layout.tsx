"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, BarChart3, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/admin/login-form";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    const savedEmail = sessionStorage.getItem("admin_email");
    if (token) {
      setAuthenticated(true);
      setEmail(savedEmail || "");
    }
    setChecking(false);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    sessionStorage.removeItem("admin_email");
    setAuthenticated(false);
    setEmail("");
  };

  if (checking) return null;

  if (!authenticated) {
    return (
      <LoginForm
        onLogin={(userEmail) => {
          setAuthenticated(true);
          setEmail(userEmail);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <nav className="flex items-center gap-4 border-b px-6 py-3">
        <h1 className="text-lg font-semibold">管理者画面</h1>
        <div className="flex-1" />
        <Link href="/admin">
          <Button
            variant={pathname === "/admin" ? "secondary" : "ghost"}
            size="sm"
          >
            <FileText className="mr-1 h-4 w-4" />
            文書管理
          </Button>
        </Link>
        <Link href="/admin/dashboard">
          <Button
            variant={pathname === "/admin/dashboard" ? "secondary" : "ghost"}
            size="sm"
          >
            <BarChart3 className="mr-1 h-4 w-4" />
            ダッシュボード
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground">{email}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-1 h-4 w-4" />
          ログアウト
        </Button>
      </nav>

      {/* Content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

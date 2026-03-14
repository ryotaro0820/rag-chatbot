"use client";

import { useEffect, useState, useCallback } from "react";
import { UploadForm } from "@/components/admin/upload-form";
import { DocumentList } from "@/components/admin/document-list";
import { CategoryManager } from "@/components/admin/category-manager";
import { listDocuments, listCategories } from "@/lib/api";
import type { DocumentInfo, CategoryInfo } from "@/types";

export default function AdminPage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [docs, cats] = await Promise.all([
        listDocuments(),
        listCategories(),
      ]);
      setDocuments(docs);
      setCategories(cats);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UploadForm categories={categories} onUploaded={loadData} />
        <CategoryManager categories={categories} onRefresh={loadData} />
      </div>
      <DocumentList documents={documents} onRefresh={loadData} />
    </div>
  );
}

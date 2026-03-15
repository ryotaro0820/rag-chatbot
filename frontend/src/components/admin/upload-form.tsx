"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadDocuments } from "@/lib/api";
import { toast } from "sonner";
import type { CategoryInfo } from "@/types";

interface UploadFormProps {
  categories: CategoryInfo[];
  onUploaded: () => void;
}

export function UploadForm({ categories, onUploaded }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.name.toLowerCase().endsWith(".pdf") ||
        f.name.toLowerCase().endsWith(".docx")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const { results } = await uploadDocuments(
        files,
        categoryId || undefined
      );
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      if (successes.length > 0) {
        toast.success(`${successes.length}件のファイルをアップロードしました`);
      }
      if (failures.length > 0) {
        failures.forEach((f) => {
          toast.error(`${f.filename}: ${f.error || "処理エラー"}`);
        });
      }
      if (successes.length === 0 && failures.length === 0) {
        toast.error("ファイルが処理されませんでした");
      }
      setFiles([]);
      onUploaded();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "アップロードに失敗しました"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          文書アップロード
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary hover:bg-muted/50"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            ドラッグ&ドロップ または クリックしてファイルを選択
          </p>
          <p className="text-xs text-muted-foreground">
            対応形式: PDF, DOCX（複数選択可）
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)}MB
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeFile(i)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Category selection */}
        <div>
          <label className="mb-1 block text-sm font-medium">カテゴリ（任意）</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">なし</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          {uploading
            ? "アップロード中..."
            : `${files.length}件をアップロード`}
        </Button>
      </CardContent>
    </Card>
  );
}

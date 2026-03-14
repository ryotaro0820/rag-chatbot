"use client";

import { useState } from "react";
import { Tag, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createCategory, deleteCategory } from "@/lib/api";
import { toast } from "sonner";
import type { CategoryInfo } from "@/types";

interface CategoryManagerProps {
  categories: CategoryInfo[];
  onRefresh: () => void;
}

export function CategoryManager({
  categories,
  onRefresh,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createCategory(newName.trim());
      setNewName("");
      toast.success("カテゴリを作成しました");
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "作成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      toast.success("カテゴリを削除しました");
      onRefresh();
    } catch (err) {
      toast.error("削除に失敗しました");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          カテゴリ管理
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しいカテゴリ名"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={loading || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            追加
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Badge
              key={c.id}
              variant="secondary"
              className="flex items-center gap-1 py-1.5"
            >
              {c.name}
              <button
                onClick={() => handleDelete(c.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              カテゴリがありません
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

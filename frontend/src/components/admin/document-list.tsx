"use client";

import { useState } from "react";
import {
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { deleteDocument, replaceDocument, getDocumentChunks } from "@/lib/api";
import { toast } from "sonner";
import type { DocumentInfo, ChunkPreview } from "@/types";

interface DocumentListProps {
  documents: DocumentInfo[];
  onRefresh: () => void;
}

export function DocumentList({ documents, onRefresh }: DocumentListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [chunkDocId, setChunkDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDocument(deleteId);
      toast.success("文書を削除しました");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "削除に失敗しました");
    }
    setDeleteId(null);
  };

  const handleReplace = async (docId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        await replaceDocument(docId, file);
        toast.success("文書を差し替えました");
        onRefresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "差し替えに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleViewChunks = async (docId: string) => {
    if (chunkDocId === docId) {
      setChunkDocId(null);
      return;
    }
    try {
      const data = await getDocumentChunks(docId);
      setChunks(data);
      setChunkDocId(docId);
    } catch (err) {
      toast.error("チャンクの取得に失敗しました");
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            アップロード済み文書 ({documents.length}件)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              文書がまだアップロードされていません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ファイル名</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>サイズ</TableHead>
                  <TableHead>チャンク数</TableHead>
                  <TableHead>Ver.</TableHead>
                  <TableHead>アップロード日時</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <>
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        {doc.filename}
                      </TableCell>
                      <TableCell>
                        {doc.category_name ? (
                          <Badge variant="secondary">{doc.category_name}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{formatSize(doc.file_size)}</TableCell>
                      <TableCell>{doc.chunk_count ?? "-"}</TableCell>
                      <TableCell>{doc.version}</TableCell>
                      <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewChunks(doc.id)}
                            title="チャンクプレビュー"
                          >
                            {chunkDocId === doc.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleReplace(doc.id)}
                            disabled={loading}
                            title="差し替え"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            onClick={() => setDeleteId(doc.id)}
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Chunk preview */}
                    {chunkDocId === doc.id && (
                      <TableRow key={`${doc.id}-chunks`}>
                        <TableCell colSpan={7}>
                          <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              チャンクプレビュー ({chunks.length}件)
                            </p>
                            <div className="flex flex-col gap-2">
                              {chunks.map((chunk) => (
                                <div
                                  key={chunk.id}
                                  className="rounded border bg-background p-2 text-xs"
                                >
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      #{chunk.chunk_index}
                                    </Badge>
                                    {chunk.page_numbers && (
                                      <span className="text-muted-foreground">
                                        p.{chunk.page_numbers}
                                      </span>
                                    )}
                                  </div>
                                  <p className="whitespace-pre-wrap text-muted-foreground">
                                    {chunk.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>文書を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            この操作は元に戻せません。文書とすべてのチャンクが削除されます。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

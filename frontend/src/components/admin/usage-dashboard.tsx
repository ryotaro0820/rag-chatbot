"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getChatLogs,
  getUsageSummary,
  getFeedbackSummary,
  getPopularQuestions,
  getFeedbackDetails,
} from "@/lib/api";
import type { FeedbackDetail } from "@/lib/api";
import type {
  ChatLogEntry,
  UsageDailySummary,
  FeedbackSummary,
  PopularQuestion,
} from "@/types";
import { toast } from "sonner";

// --- CSV Helper ---
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const BOM = "\uFEFF"; // For Japanese in Excel
  const csv =
    BOM +
    [
      headers.join(","),
      ...rows.map((r) =>
        r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UsageDashboard() {
  const [logs, setLogs] = useState<ChatLogEntry[]>([]);
  const [usage, setUsage] = useState<UsageDailySummary[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [popular, setPopular] = useState<PopularQuestion[]>([]);
  const [feedbackDetails, setFeedbackDetails] = useState<FeedbackDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<number>>(new Set());
  const [expandedFeedbackIds, setExpandedFeedbackIds] = useState<Set<number>>(
    new Set()
  );

  useEffect(() => {
    async function load() {
      try {
        const [logsData, usageData, feedbackData, popularData, fbDetails] =
          await Promise.all([
            getChatLogs(50),
            getUsageSummary(30),
            getFeedbackSummary(),
            getPopularQuestions(10),
            getFeedbackDetails().catch(() => [] as FeedbackDetail[]),
          ]);
        setLogs(logsData);
        setUsage(usageData);
        setFeedback(feedbackData);
        setPopular(popularData);
        setFeedbackDetails(fbDetails);
      } catch (err) {
        console.error("Dashboard data load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalCost = usage.reduce((sum, d) => sum + d.estimated_cost_usd, 0);
  const totalRequests = usage.reduce((sum, d) => sum + d.total_requests, 0);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const toggleLogExpand = (id: number) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFeedbackExpand = (id: number) => {
    setExpandedFeedbackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportUsage = () => {
    if (usage.length === 0) {
      toast.error("エクスポートするデータがありません");
      return;
    }
    const headers = [
      "日付",
      "リクエスト数",
      "Prompt Tokens",
      "Completion Tokens",
      "Embedding Tokens",
      "推定コスト(USD)",
    ];
    const rows = usage.map((row) => [
      row.date,
      String(row.total_requests),
      String(row.total_prompt_tokens),
      String(row.total_completion_tokens),
      String(row.total_embedding_tokens),
      row.estimated_cost_usd.toFixed(4),
    ]);
    downloadCSV("usage_summary.csv", headers, rows);
    toast.success("使用量データをエクスポートしました");
  };

  const handleExportLogs = () => {
    if (logs.length === 0) {
      toast.error("エクスポートするデータがありません");
      return;
    }
    const headers = ["日時", "IP", "質問", "回答", "トークン"];
    const rows = logs.map((log) => [
      log.created_at,
      log.client_ip ?? "",
      log.user_message,
      (log.assistant_message ?? "").slice(0, 200),
      String((log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)),
    ]);
    downloadCSV("chat_logs.csv", headers, rows);
    toast.success("チャットログをエクスポートしました");
  };

  const handleExportPopular = () => {
    if (popular.length === 0) {
      toast.error("エクスポートするデータがありません");
      return;
    }
    const headers = ["順位", "質問", "回数"];
    const rows = popular.map((q, i) => [
      String(i + 1),
      q.user_message,
      String(q.count),
    ]);
    downloadCSV("popular_questions.csv", headers, rows);
    toast.success("よくある質問をエクスポートしました");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{totalRequests}</p>
              <p className="text-xs text-muted-foreground">
                総リクエスト数 (30日)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">${totalCost.toFixed(4)}</p>
              <p className="text-xs text-muted-foreground">推定コスト (30日)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <ThumbsUp className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">
                {feedback
                  ? `${Math.round(feedback.up_ratio * 100)}%`
                  : "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                好評率 ({feedback?.total ?? 0}件)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <ThumbsDown className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">
                {feedback?.down_count ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">低評価数</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Negative feedback details (Feature 2) */}
      {feedbackDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsDown className="h-5 w-5 text-red-600" />
              低評価の回答
              <Badge variant="destructive" className="ml-2">
                {feedbackDetails.length}件
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {feedbackDetails.map((item) => {
                const isExpanded = expandedFeedbackIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="rounded-md border"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                      onClick={() => toggleFeedbackExpand(item.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-sm">
                        {item.user_message}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(item.created_at)}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-muted/30 px-4 py-3">
                        <div className="mb-2">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            質問:
                          </p>
                          <p className="text-sm">{item.user_message}</p>
                        </div>
                        {item.assistant_message && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              回答:
                            </p>
                            <p className="whitespace-pre-wrap text-sm">
                              {item.assistant_message}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              日別使用量
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportUsage}>
              <Download className="mr-1 h-4 w-4" />
              CSVダウンロード
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              まだデータがありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>リクエスト数</TableHead>
                  <TableHead>Prompt Tokens</TableHead>
                  <TableHead>Completion Tokens</TableHead>
                  <TableHead>Embedding Tokens</TableHead>
                  <TableHead>推定コスト</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.total_requests}</TableCell>
                    <TableCell>
                      {row.total_prompt_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.total_completion_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.total_embedding_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      ${row.estimated_cost_usd.toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Popular questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              よくある質問
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportPopular}>
              <Download className="mr-1 h-4 w-4" />
              CSVダウンロード
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {popular.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              まだデータがありません
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {popular.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm">{q.user_message}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {q.count}回
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent chat logs (Feature 1: expandable rows) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              最近の質問ログ
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportLogs}>
              <Download className="mr-1 h-4 w-4" />
              CSVダウンロード
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              まだログがありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>日時</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>質問</TableHead>
                  <TableHead>トークン</TableHead>
                  <TableHead>FB</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const isExpanded = expandedLogIds.has(log.id);
                  return (
                    <LogRow
                      key={log.id}
                      log={log}
                      isExpanded={isExpanded}
                      onToggle={() => toggleLogExpand(log.id)}
                      formatDate={formatDate}
                    />
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Expandable Log Row ---

function LogRow({
  log,
  isExpanded,
  onToggle,
  formatDate,
}: {
  log: ChatLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  formatDate: (d: string) => string;
}) {
  const sources = log.source_documents;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs">
          {formatDate(log.created_at)}
        </TableCell>
        <TableCell className="text-xs">{log.client_ip ?? "-"}</TableCell>
        <TableCell className="max-w-xs truncate text-sm">
          {log.user_message}
        </TableCell>
        <TableCell className="text-xs">
          {(log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)}
        </TableCell>
        <TableCell className="text-xs">
          {/* Feedback status placeholder - shown if available */}
          -
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-4">
            <div className="flex flex-col gap-3">
              {/* Assistant message */}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  回答:
                </p>
                {log.assistant_message ? (
                  <div className="max-h-64 overflow-y-auto rounded-md border bg-background p-3">
                    <p className="whitespace-pre-wrap text-sm">
                      {log.assistant_message}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">回答なし</p>
                )}
              </div>

              {/* Source documents */}
              {sources && sources.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    参照ドキュメント:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((doc, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {(doc as Record<string, unknown>).filename as string ??
                          `Doc ${i + 1}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Token details */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>
                  Prompt: {(log.prompt_tokens ?? 0).toLocaleString()} tokens
                </span>
                <span>
                  Completion:{" "}
                  {(log.completion_tokens ?? 0).toLocaleString()} tokens
                </span>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

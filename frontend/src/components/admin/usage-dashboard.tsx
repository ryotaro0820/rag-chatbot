"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  DollarSign,
  TrendingUp,
} from "lucide-react";
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
  getChatLogs,
  getUsageSummary,
  getFeedbackSummary,
  getPopularQuestions,
} from "@/lib/api";
import type {
  ChatLogEntry,
  UsageDailySummary,
  FeedbackSummary,
  PopularQuestion,
} from "@/types";

export function UsageDashboard() {
  const [logs, setLogs] = useState<ChatLogEntry[]>([]);
  const [usage, setUsage] = useState<UsageDailySummary[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [popular, setPopular] = useState<PopularQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [logsData, usageData, feedbackData, popularData] =
          await Promise.all([
            getChatLogs(20),
            getUsageSummary(30),
            getFeedbackSummary(),
            getPopularQuestions(10),
          ]);
        setLogs(logsData);
        setUsage(usageData);
        setFeedback(feedbackData);
        setPopular(popularData);
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
              <p className="text-xs text-muted-foreground">総リクエスト数 (30日)</p>
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

      {/* Usage table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            日別使用量
          </CardTitle>
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
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            よくある質問
          </CardTitle>
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

      {/* Recent chat logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            最近の質問ログ
          </CardTitle>
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
                  <TableHead>日時</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>質問</TableHead>
                  <TableHead>トークン</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.client_ip ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {log.user_message}
                    </TableCell>
                    <TableCell className="text-xs">
                      {(log.prompt_tokens ?? 0) +
                        (log.completion_tokens ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

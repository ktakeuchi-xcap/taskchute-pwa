import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import { useReportSettings } from '@/features/reports/hooks/useReportSettings';
import { useGenerateReportDoc } from '@/features/reports/hooks/useGenerateReportDoc';
import {
  buildReportDocContent,
  buildReportPrompt,
  listCompletedTasksForCategory,
} from '@/features/reports/reportData';
import { formatJst } from '@/lib/time/jst';

/**
 * Two-step report generation (see docs/260708_課題要求管理表_v1.md REQ-56):
 * this app has no server to call an LLM from, so step 1 only produces a
 * prompt the user copies into an external Claude conversation; step 2 takes
 * Claude's organized bullet-point answer back and does the mechanical part
 * (standard-format Google Doc creation) here.
 */
export function WorkReportSection() {
  const tasksQuery = useTasks();
  const categoriesQuery = useCategories();
  const reportSettingsQuery = useReportSettings();
  const generateMutation = useGenerateReportDoc();

  const [category, setCategory] = useState('');
  const [yearMonth, setYearMonth] = useState(() => formatJst(new Date(), 'yyyy-MM'));
  const [activityText, setActivityText] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      category ? listCompletedTasksForCategory(tasksQuery.data ?? [], category, yearMonth) : [],
    [tasksQuery.data, category, yearMonth],
  );
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const prompt = useMemo(
    () => (category ? buildReportPrompt(category, yearMonth, entries) : ''),
    [category, yearMonth, entries],
  );

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyFeedback('コピーしました');
    } catch {
      setCopyFeedback('コピーに失敗しました。手動で選択してコピーしてください');
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setResult(null);
    const setting = (reportSettingsQuery.data ?? []).find((s) => s.category === category);
    if (!setting) {
      setError(
        `「${category}」の宛名・保存先フォルダが未設定です。ReportSettingsシートに、この案件名で1行追加してください。`,
      );
      return;
    }
    const content = buildReportDocContent({
      category,
      yearMonth,
      clientName: setting.clientName,
      totalMinutes,
      activityText,
    });
    try {
      const doc = await generateMutation.mutateAsync({ content, folderId: setting.folderId });
      setResult({ url: doc.url });
    } catch (err) {
      setError(`作成に失敗しました：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="report-category">
            案件
          </label>
          <select
            id="report-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setResult(null);
              setError(null);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">選択してください</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="report-month">
            対象月
          </label>
          <input
            id="report-month"
            type="month"
            value={yearMonth}
            onChange={(e) => {
              setYearMonth(e.target.value);
              setResult(null);
              setError(null);
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
      </div>

      {category ? (
        <p className="text-xs text-muted-foreground">
          完了タスク {entries.length}件・合計 {totalMinutes}分
        </p>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            手順1：Claude用プロンプト
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyPrompt}
            disabled={!category}
          >
            <Copy className="h-3.5 w-3.5" />
            コピー
          </Button>
        </div>
        <textarea
          readOnly
          value={prompt}
          placeholder="案件と対象月を選ぶと、ここにプロンプトが表示されます"
          rows={6}
          className="w-full rounded-md border border-input bg-muted/40 p-2 text-xs"
        />
        {copyFeedback ? <p className="text-xs text-muted-foreground">{copyFeedback}</p> : null}
        <p className="text-[11px] text-muted-foreground">
          このプロンプトを外部のClaudeに貼り付け、返ってきた箇条書きを下の欄に貼り戻してください。
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="report-activity">
          手順2：Claudeの出力を貼り付け
        </label>
        <textarea
          id="report-activity"
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
          rows={5}
          placeholder="・◯◯の対応&#10;・△△の定例MTGへの参加"
          className="w-full rounded-md border border-input bg-background p-2 text-xs"
        />
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={handleGenerate}
        disabled={!category || !activityText.trim() || generateMutation.isPending}
      >
        {generateMutation.isPending ? '作成中…' : '作業報告書を作成'}
      </Button>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {result ? (
        <p className="text-xs text-foreground">
          作成しました：{' '}
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline"
          >
            {result.url}
          </a>
        </p>
      ) : null}
    </div>
  );
}

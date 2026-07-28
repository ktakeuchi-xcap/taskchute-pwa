import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import { useReportSettings } from '@/features/reports/hooks/useReportSettings';
import {
  useDeleteReportSetting,
  useUpsertReportSetting,
} from '@/features/reports/hooks/useReportSettingsMutations';
import type { ReportSetting } from '@/features/reports/api/reportSettingsRepository';

/**
 * Manages ReportSettings (案件ごとの宛名・保存先フォルダ) used by the "作業報告書
 * を作成" feature — lets this be done entirely in the app instead of editing
 * the ReportSettings sheet by hand.
 */
export function ReportSettingsManager() {
  const categoriesQuery = useCategories();
  const settingsQuery = useReportSettings();
  const upsertMutation = useUpsertReportSetting();
  const deleteMutation = useDeleteReportSetting();

  const [category, setCategory] = useState('');
  const [clientName, setClientName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const settings = settingsQuery.data ?? [];
  const configuredCategories = new Set(settings.map((s) => s.category));
  const categoryOptions = (categoriesQuery.data ?? []).filter(
    (c) => !configuredCategories.has(c.name),
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!category) {
      setError('案件を選択してください');
      return;
    }
    if (!clientName.trim() || !folderId.trim()) {
      setError('宛名・保存先フォルダIDを入力してください');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        category,
        clientName: clientName.trim(),
        folderId: folderId.trim(),
      });
      setCategory('');
      setClientName('');
      setFolderId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = (setting: ReportSetting) => {
    if (window.confirm(`「${setting.category}」の作業報告書設定を削除しますか？`)) {
      deleteMutation.mutate(setting.category);
    }
  };

  const startEdit = (setting: ReportSetting) => {
    setEditingCategory(setting.category);
    setEditClientName(setting.clientName);
    setEditFolderId(setting.folderId);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setEditError(null);
  };

  const saveEdit = async (targetCategory: string) => {
    setEditError(null);
    if (!editClientName.trim() || !editFolderId.trim()) {
      setEditError('宛名・保存先フォルダIDを入力してください');
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        category: targetCategory,
        clientName: editClientName.trim(),
        folderId: editFolderId.trim(),
      });
      setEditingCategory(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {settings.length === 0 ? (
          <p className="text-xs text-muted-foreground">まだ登録されていません</p>
        ) : (
          settings.map((s) =>
            editingCategory === s.category ? (
              <div
                key={s.category}
                className="space-y-2 rounded-lg border border-primary/40 bg-card p-2"
              >
                <p className="text-xs font-medium">{s.category}</p>
                <Input
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  placeholder="宛名（例：株式会社PKSHA Technology）"
                  autoFocus
                />
                <Input
                  value={editFolderId}
                  onChange={(e) => setEditFolderId(e.target.value)}
                  placeholder="保存先GoogleドライブフォルダID"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => saveEdit(s.category)}
                    disabled={upsertMutation.isPending}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={cancelEdit}
                    disabled={upsertMutation.isPending}
                  >
                    キャンセル
                  </Button>
                </div>
                {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
              </div>
            ) : (
              <div
                key={s.category}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.category}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.clientName} 御中・フォルダ: {s.folderId}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label={`${s.category}の設定を編集`}
                    onClick={() => startEdit(s)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={`${s.category}の設定を削除`}
                    onClick={() => handleDelete(s)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ),
          )
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-2 rounded-lg border border-border bg-card/40 p-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="report-setting-category">案件</Label>
          <select
            id="report-setting-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">選択してください</option>
            {categoryOptions.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-setting-client-name">宛名</Label>
          <Input
            id="report-setting-client-name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="株式会社PKSHA Technology"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-setting-folder-id">保存先GoogleドライブフォルダID</Label>
          <Input
            id="report-setting-folder-id"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="フォルダのURLに含まれるID部分"
          />
        </div>
        <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
          追加
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}

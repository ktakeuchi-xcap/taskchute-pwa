import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/features/tasks/hooks/useCategories';
import {
  useAddCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/tasks/hooks/useCategoryMutations';
import { DEFAULT_CATEGORY_COLOR } from '@/features/tasks/categoryColors';
import { ColorPicker } from './ColorPicker';
import { CategoryTag } from './CategoryTag';

export function CategoryManager() {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(DEFAULT_CATEGORY_COLOR);
  const [editError, setEditError] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const addMutation = useAddCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const categoryNames = (categoriesQuery.data ?? []).map((c) => c.name);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categoryNames.includes(trimmed)) {
      setError('すでに登録されています');
      return;
    }
    try {
      await addMutation.mutateAsync({ name: trimmed, color });
      setName('');
      setColor(DEFAULT_CATEGORY_COLOR);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = (category: string) => {
    if (window.confirm(`案件「${category}」を削除しますか？`)) {
      deleteMutation.mutate(category);
    }
  };

  const startEdit = (categoryName: string, categoryColor: string | null) => {
    setEditingCategory(categoryName);
    setEditName(categoryName);
    setEditColor(categoryColor ?? DEFAULT_CATEGORY_COLOR);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setEditError(null);
  };

  const saveEdit = async (oldName: string) => {
    setEditError(null);
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('案件名を入力してください');
      return;
    }
    if (trimmed !== oldName && categoryNames.includes(trimmed)) {
      setEditError('すでに登録されています');
      return;
    }
    try {
      await updateMutation.mutateAsync({ oldName, newName: trimmed, color: editColor });
      setEditingCategory(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {(categoriesQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">まだ登録されていません</p>
        ) : (
          (categoriesQuery.data ?? []).map((c) =>
            editingCategory === c.name ? (
              <div
                key={c.name}
                className="space-y-2 rounded-lg border border-primary/40 bg-card p-2"
              >
                <div className="flex gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveEdit(c.name)}
                    disabled={updateMutation.isPending}
                  >
                    保存
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={updateMutation.isPending}
                  >
                    キャンセル
                  </Button>
                </div>
                <ColorPicker value={editColor} onChange={setEditColor} />
                {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
              </div>
            ) : (
              <div
                key={c.name}
                className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <CategoryTag name={c.name} colorKey={c.color} />
                <div className="flex flex-shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label={`${c.name}を編集`}
                    onClick={() => startEdit(c.name, c.color)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={`${c.name}を削除`}
                    onClick={() => handleDelete(c.name)}
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
          <Label htmlFor="new-category-name">新しい案件名</Label>
          <Input
            id="new-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：SG案件"
          />
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" className="w-full" disabled={addMutation.isPending}>
          追加
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}

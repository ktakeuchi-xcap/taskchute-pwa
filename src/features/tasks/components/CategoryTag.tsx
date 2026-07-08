import { cn } from '@/lib/utils';
import { categoryColorClassName } from '@/features/tasks/categoryColors';

interface CategoryTagProps {
  name: string;
  colorKey?: string | null;
  className?: string;
}

export function CategoryTag({ name, colorKey, className }: CategoryTagProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        categoryColorClassName(colorKey),
        className,
      )}
    >
      {name}
    </span>
  );
}

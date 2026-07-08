import { cn } from '@/lib/utils';
import { CATEGORY_COLORS, categoryDotClassName } from '@/features/tasks/categoryColors';

interface ColorPickerProps {
  value: string;
  onChange: (colorKey: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-label={c.label}
            aria-pressed={active}
            className={cn(
              'h-7 w-7 flex-shrink-0 rounded-full transition-transform',
              categoryDotClassName(c.key),
              active
                ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : 'hover:scale-105',
            )}
          />
        );
      })}
    </div>
  );
}

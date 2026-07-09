import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Theme, useThemeStore } from '@/store/themeStore';

interface ThemeOption {
  value: Theme;
  label: string;
  description: string;
  swatchClassName: string;
  accentClassName: string;
  labelFontFamily: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: Theme.Default,
    label: '標準',
    description: '見やすさ優先の明るいテーマ',
    swatchClassName: 'bg-white',
    accentClassName: 'bg-blue-500',
    labelFontFamily: 'inherit',
  },
  {
    value: Theme.Editorial,
    label: 'エディトリアル',
    description: '黒地に高コントラストのセリフ体を使った、モダンアート誌のような見た目',
    swatchClassName: 'bg-[#171412]',
    accentClassName: 'bg-[#b5622f]',
    labelFontFamily: 'Georgia, serif',
  },
];

export function ThemePicker() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="grid grid-cols-2 gap-3">
      {THEME_OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              active ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent',
            )}
          >
            <div
              className={cn(
                'flex h-14 items-center justify-center rounded-md border border-border/50',
                option.swatchClassName,
              )}
            >
              <span className={cn('h-2 w-8 rounded-full', option.accentClassName)} />
            </div>
            <div className="flex items-center gap-1">
              <span
                className="text-sm font-semibold"
                style={{ fontFamily: option.labelFontFamily }}
              >
                {option.label}
              </span>
              {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </div>
            <p className="text-[11px] text-muted-foreground">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

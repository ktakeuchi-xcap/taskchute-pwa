/**
 * Fixed palette for category tag colors. Class strings are written out in
 * full (not composed dynamically) so Tailwind's build-time scanner picks
 * them up — a dynamically interpolated class name would be purged.
 */
export const CATEGORY_COLORS = [
  {
    key: 'red',
    label: '赤',
    className: 'border border-red-200 bg-red-50 text-red-700',
    dotClassName: 'bg-red-400',
  },
  {
    key: 'orange',
    label: 'オレンジ',
    className: 'border border-orange-200 bg-orange-50 text-orange-700',
    dotClassName: 'bg-orange-400',
  },
  {
    key: 'amber',
    label: '黄',
    className: 'border border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-400',
  },
  {
    key: 'green',
    label: '緑',
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClassName: 'bg-emerald-400',
  },
  {
    key: 'teal',
    label: '青緑',
    className: 'border border-teal-200 bg-teal-50 text-teal-700',
    dotClassName: 'bg-teal-400',
  },
  {
    key: 'blue',
    label: '青',
    className: 'border border-blue-200 bg-blue-50 text-blue-700',
    dotClassName: 'bg-blue-400',
  },
  {
    key: 'indigo',
    label: '藍',
    className: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
    dotClassName: 'bg-indigo-400',
  },
  {
    key: 'purple',
    label: '紫',
    className: 'border border-purple-200 bg-purple-50 text-purple-700',
    dotClassName: 'bg-purple-400',
  },
  {
    key: 'pink',
    label: 'ピンク',
    className: 'border border-pink-200 bg-pink-50 text-pink-700',
    dotClassName: 'bg-pink-400',
  },
  {
    key: 'gray',
    label: 'グレー',
    className: 'border border-gray-200 bg-gray-100 text-gray-700',
    dotClassName: 'bg-gray-400',
  },
] as const;

export type CategoryColorKey = (typeof CATEGORY_COLORS)[number]['key'];

export const DEFAULT_CATEGORY_COLOR: CategoryColorKey = 'gray';

const COLOR_CLASS_MAP = new Map<string, string>(CATEGORY_COLORS.map((c) => [c.key, c.className]));
const DOT_CLASS_MAP = new Map<string, string>(CATEGORY_COLORS.map((c) => [c.key, c.dotClassName]));

export function categoryColorClassName(key: string | null | undefined): string {
  return (key && COLOR_CLASS_MAP.get(key)) || COLOR_CLASS_MAP.get(DEFAULT_CATEGORY_COLOR)!;
}

export function categoryDotClassName(key: string | null | undefined): string {
  return (key && DOT_CLASS_MAP.get(key)) || DOT_CLASS_MAP.get(DEFAULT_CATEGORY_COLOR)!;
}

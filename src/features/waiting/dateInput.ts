import { formatJst } from '@/lib/time/jst';

/** `<input type="date">` gives YYYY-MM-DD. Treat as JST midnight. */
export function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toDateInputValue(date: Date): string {
  return formatJst(date, 'yyyy-MM-dd');
}

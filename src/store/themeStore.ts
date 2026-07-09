import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const Theme = {
  Default: 'default',
  Editorial: 'editorial',
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: Theme.Default,
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'taskchute-theme' },
  ),
);

const EDITORIAL_FONT_LINK_ID = 'editorial-theme-font';

/**
 * The editorial theme's display serif is only fetched from Google Fonts the
 * first time someone actually switches to it — the default theme never pays
 * for it. Once injected, the `<link>` stays (the browser caches the font
 * file), so switching back and forth doesn't refetch.
 */
function ensureEditorialFontLoaded(): void {
  if (document.getElementById(EDITORIAL_FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = EDITORIAL_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&display=swap';
  document.head.appendChild(link);
}

/** Reflects the current theme onto <html data-theme> and lazy-loads its font, if any. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === Theme.Editorial) ensureEditorialFontLoaded();
}

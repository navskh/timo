'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import {
  themes,
  getThemeById,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  type ITheme,
} from './themes';

interface IThemeContext {
  theme: ITheme;
  setTheme: (id: string) => void;
  themes: ITheme[];
}

const ThemeContext = createContext<IThemeContext | null>(null);

const themeListeners = new Set<() => void>();

function readThemeId(): string {
  if (typeof document === 'undefined') return DEFAULT_THEME_ID;
  // Pre-hydration boot script already stamped data-theme on <html>; trust that.
  return document.documentElement.getAttribute('data-theme') ?? DEFAULT_THEME_ID;
}

function subscribe(cb: () => void) {
  themeListeners.add(cb);
  return () => { themeListeners.delete(cb); };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useSyncExternalStore(
    subscribe,
    readThemeId,
    () => DEFAULT_THEME_ID,
  );
  const theme = getThemeById(themeId);

  const setTheme = useCallback((id: string) => {
    const t = getThemeById(id);
    document.documentElement.setAttribute('data-theme', t.id);
    try { localStorage.setItem(THEME_STORAGE_KEY, t.id); } catch { /* private mode */ }
    for (const l of themeListeners) l();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

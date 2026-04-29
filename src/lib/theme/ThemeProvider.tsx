'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { themes, getThemeById, DEFAULT_THEME_ID, type ITheme } from './themes';

interface IThemeContext {
  theme: ITheme;
  setTheme: (id: string) => void;
  themes: ITheme[];
}

const ThemeContext = createContext<IThemeContext | null>(null);

const themeListeners = new Set<() => void>();

function readThemeId(): string {
  if (typeof document === 'undefined') return DEFAULT_THEME_ID;
  // The server component stamps data-theme on <html> from preferences.json
  // before sending HTML to the client; we trust whatever is on the element.
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
    // Optimistic UI: flip the DOM immediately, persist in the background.
    document.documentElement.setAttribute('data-theme', t.id);
    for (const l of themeListeners) l();
    void fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t.id }),
    }).catch(() => { /* server unreachable — theme still applied in this session */ });
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

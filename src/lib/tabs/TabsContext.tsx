'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Cross-project tab state. Each tab points at a chat session and snapshots
 * just enough info (titles) to render the strip without a fetch on mount.
 *
 * State lives at root layout level so navigating between projects keeps the
 * tab strip stable. localStorage 'timo-tabs' persists for the session — Tauri
 * port shuffle wipes localStorage between launches, so on a fresh launch we
 * start with no tabs (acceptable: the active session re-pins itself when the
 * project page mounts).
 */

export interface ITab {
  session_id: string;
  project_id: string;
  title: string;
  project_name: string;
}

interface ITabsContext {
  tabs: ITab[];
  /** Add tab at the end if not already present. Updates title/project_name
   *  if the tab already exists (so renames flow through). */
  openTab: (tab: ITab) => void;
  closeTab: (session_id: string) => void;
  /** Replace the entire tab list — used by the order-shuffling cases. */
  setTabs: (next: ITab[]) => void;
  /** Snapshot title patch for already-open tabs without re-pinning. */
  updateTabMeta: (session_id: string, patch: Partial<Pick<ITab, 'title' | 'project_name'>>) => void;
}

const Ctx = createContext<ITabsContext | null>(null);
const STORAGE_KEY = 'timo-tabs';

function isTab(x: unknown): x is ITab {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.session_id === 'string' &&
    typeof t.project_id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.project_name === 'string'
  );
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabsState] = useState<ITab[]>([]);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setTabsState(parsed.filter(isTab));
    } catch { /* ignore */ }
  }, []);

  // Persist on change.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)); } catch { /* ignore */ }
  }, [tabs]);

  // Sync tab title when a rename happens elsewhere (sidebar, header, etc.).
  useEffect(() => {
    const onRename = (e: Event) => {
      const detail = (e as CustomEvent<{ session_id?: string; title?: string }>).detail;
      if (!detail?.session_id || typeof detail.title !== 'string') return;
      setTabsState((prev) =>
        prev.map((t) =>
          t.session_id === detail.session_id ? { ...t, title: detail.title as string } : t,
        ),
      );
    };
    window.addEventListener('timo:session-renamed', onRename);
    return () => window.removeEventListener('timo:session-renamed', onRename);
  }, []);

  const openTab = useCallback((tab: ITab) => {
    setTabsState((prev) => {
      const idx = prev.findIndex((t) => t.session_id === tab.session_id);
      if (idx === -1) return [...prev, tab];
      // Already open — refresh title/project_name in case they changed.
      const next = prev.slice();
      next[idx] = { ...next[idx], title: tab.title, project_name: tab.project_name };
      return next;
    });
  }, []);

  const closeTab = useCallback((session_id: string) => {
    setTabsState((prev) => prev.filter((t) => t.session_id !== session_id));
  }, []);

  const setTabs = useCallback((next: ITab[]) => setTabsState(next), []);

  const updateTabMeta = useCallback(
    (session_id: string, patch: Partial<Pick<ITab, 'title' | 'project_name'>>) => {
      setTabsState((prev) =>
        prev.map((t) => (t.session_id === session_id ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  return (
    <Ctx.Provider value={{ tabs, openTab, closeTab, setTabs, updateTabMeta }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTabs must be used inside TabsProvider');
  return ctx;
}

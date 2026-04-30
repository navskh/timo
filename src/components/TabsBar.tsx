'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTabs, type ITab } from '@/lib/tabs/TabsContext';
import { InlineRename, renameSession } from './ui/InlineRename';

interface IRunningStatus {
  running: Array<{ session_id: string; project_id: string; title: string }>;
}

/** Cross-project tab strip rendered above page content. */
export function TabsBar() {
  const { tabs, closeTab, setTabs } = useTabs();
  const pathname = usePathname() ?? '';
  const sp = useSearchParams();
  const router = useRouter();

  const activeSid = sp?.get('s') ?? null;
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const currentProjectId = projectMatch?.[1] ?? null;

  // Running indicator data — same /api/sessions/status that the sidebar polls.
  // We poll independently here because TabsBar can render on non-project pages
  // where AppSidebar's polling is decoupled (and we don't want to share state).
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  // Which tab is currently being renamed inline. Double-click a tab title to enter.
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = (await fetch('/api/sessions/status').then((r) => r.json())) as IRunningStatus;
        if (stopped) return;
        setRunningIds(new Set(r.running?.map((x) => x.session_id) ?? []));
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  const navigateTo = useCallback(
    (tab: ITab) => router.push(`/projects/${tab.project_id}?s=${tab.session_id}`),
    [router],
  );

  const handleClose = useCallback(
    (sid: string) => {
      const idx = tabs.findIndex((t) => t.session_id === sid);
      if (idx === -1) return;
      const next = tabs.filter((t) => t.session_id !== sid);
      setTabs(next);
      // If the closed tab was active, jump to the neighbor (right then left).
      if (sid === activeSid && next.length > 0) {
        const target = next[idx] ?? next[idx - 1] ?? next[0];
        navigateTo(target);
      }
    },
    [tabs, activeSid, setTabs, navigateTo],
  );

  // Keyboard navigation:
  //   Ctrl+Tab            → next tab
  //   Ctrl+Shift+Tab      → previous tab
  //   Cmd/Ctrl + 1..9     → jump to tab N (browser-style)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tabs.length === 0) return;
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const activeIdx = tabs.findIndex((t) => t.session_id === activeSid);
        const dir = e.shiftKey ? -1 : 1;
        const base = activeIdx === -1 ? 0 : activeIdx;
        const target = tabs[(base + dir + tabs.length) % tabs.length];
        if (target) navigateTo(target);
        return;
      }
      if (cmdOrCtrl && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          navigateTo(tabs[idx]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, activeSid, navigateTo]);

  async function handleNew() {
    if (!currentProjectId) return;
    const r = await fetch(`/api/projects/${currentProjectId}/sessions`, { method: 'POST' }).then((r) => r.json());
    if (!r?.session?.id) return;
    router.push(`/projects/${currentProjectId}?s=${r.session.id}`);
    window.dispatchEvent(new Event('timo:refresh-sidebar'));
  }

  if (tabs.length === 0 && !currentProjectId) return null;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] flex items-stretch relative">
      <div className="flex items-stretch overflow-x-auto scrollbar-slim flex-1 min-w-0">
        {tabs.map((t) => {
          const active = t.session_id === activeSid;
          const isRunning = runningIds.has(t.session_id);
          return (
            <div
              key={t.session_id}
              className={`group/tab relative flex items-center gap-2 px-3.5 py-2 max-w-[260px] min-w-[160px] cursor-pointer transition border-r border-[var(--border)] ${
                active
                  ? 'bg-[var(--bg)] text-[var(--foreground)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]'
              }`}
              onClick={() => navigateTo(t)}
              role="tab"
              aria-selected={active}
              title={`${t.project_name} / ${t.title}`}
            >
              {active && (
                <span
                  className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--accent)]"
                  aria-hidden
                />
              )}
              {isRunning && (
                <span
                  className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"
                  aria-label="응답 중"
                />
              )}
              <span className="flex-1 min-w-0 flex flex-col leading-tight">
                <span className="truncate text-[10px] mono text-[var(--fg-dim)]">
                  {t.project_name}
                </span>
                {editingId === t.session_id ? (
                  <InlineRename
                    initial={t.title}
                    onCommit={async (next) => {
                      await renameSession(t.session_id, next);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                    className="bg-[var(--surface-1)] border border-[var(--accent-border)] rounded px-1 py-px text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)] w-full"
                  />
                ) : (
                  <span
                    className={`truncate text-xs ${active ? 'font-medium' : ''}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(t.session_id);
                    }}
                    title="더블클릭으로 이름 바꾸기"
                  >
                    {t.title}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClose(t.session_id); }}
                className={`shrink-0 w-4 h-4 rounded text-[var(--fg-dim)] hover:text-[var(--danger)] hover:bg-[var(--surface-4)] flex items-center justify-center text-xs transition ${
                  active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover/tab:opacity-100 focus:opacity-100'
                }`}
                title="탭 닫기 (대화는 유지됨)"
                aria-label="탭 닫기"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {currentProjectId && (
        <button
          type="button"
          onClick={handleNew}
          className="shrink-0 w-10 flex items-center justify-center text-base text-[var(--fg-dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-3)] transition border-l border-[var(--border)]"
          title="현재 프로젝트에 새 대화"
          aria-label="새 대화"
        >
          +
        </button>
      )}
    </div>
  );
}

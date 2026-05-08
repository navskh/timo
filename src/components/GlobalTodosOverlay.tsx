'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast, confirm } from './ui/dialogs';
import type { ITask, TaskStatus } from '@/types';

type ITaskRow = ITask & { project_name: string };

const STATUS_ORDER: Record<TaskStatus, number> = {
  running: 0,
  pending: 1,
  failed: 2,
  done: 3,
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  running: '진행 중',
  pending: '대기',
  failed: '실패',
  done: '완료',
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  running: 'bg-[var(--accent-bg)] text-[var(--accent-soft)] border-[var(--accent-border)]',
  pending: 'bg-[var(--surface-3)] text-[var(--fg-muted)] border-[var(--border)]',
  failed: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]',
  done: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
};

/**
 * Cross-project todo palette. Cmd/Ctrl+Shift+T opens it from anywhere.
 * Tabs split active vs 보관함; deletes default to soft (archive) and the
 * archive view exposes restore + permanent delete.
 */
export function GlobalTodosOverlay() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [tasks, setTasks] = useState<ITaskRow[]>([]);
  const [archiveCount, setArchiveCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // Hotkey: Cmd/Ctrl+Shift+T to toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdLike = e.metaKey || e.ctrlKey;
      if (cmdLike && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('timo:open-todos', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('timo:open-todos', onOpenEvent);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'active') {
        const r = await fetch('/api/tasks/all').then((r) => r.json());
        setTasks(r.tasks ?? []);
        setArchiveCount(r.archive_count ?? 0);
      } else {
        const r = await fetch('/api/tasks/archive').then((r) => r.json());
        setTasks(r.tasks ?? []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (!open) return;
    void load();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.project_name.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  // Group by project, project order matches the SQL ORDER (most recently
  // updated project first). Within each, sort by status priority.
  const grouped = useMemo(() => {
    const map = new Map<string, { project_name: string; tasks: ITaskRow[] }>();
    for (const t of filtered) {
      const existing = map.get(t.project_id);
      if (existing) existing.tasks.push(t);
      else map.set(t.project_id, { project_name: t.project_name, tasks: [t] });
    }
    for (const g of map.values()) {
      g.tasks.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return a.sort_order - b.sort_order;
      });
    }
    return [...map.entries()];
  }, [filtered]);

  async function patchStatus(taskId: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      void load();
    }
  }

  async function softDelete(taskId: string, title: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setArchiveCount((c) => c + 1);
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      toast.success(`📦 보관함으로 이동: ${title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      void load();
    }
  }

  async function restore(taskId: string, title: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await fetch(`/api/tasks/${taskId}/restore`, { method: 'POST' });
      toast.success(`복원됨: ${title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      void load();
    }
  }

  async function hardDelete(taskId: string, title: string) {
    const ok = await confirm({
      title: '영구 삭제',
      message: `"${title}"을(를) 영구 삭제할까요? 되돌릴 수 없어요.`,
      confirmText: '영구 삭제',
      danger: true,
    });
    if (!ok) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await fetch(`/api/tasks/${taskId}?hard=1`, { method: 'DELETE' });
      toast.success('영구 삭제됨');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      void load();
    }
  }

  function jumpToProject(projectId: string) {
    setOpen(false);
    router.push(`/projects/${projectId}`);
  }

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-[2px] flex items-start justify-center p-6 pt-[10vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="전체 할 일"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[720px] max-h-[80vh] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => setView('active')}
              className={`px-2.5 py-1 text-xs rounded transition ${
                view === 'active'
                  ? 'bg-[var(--accent-bg)] text-[var(--accent-soft)] border border-[var(--accent-border)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-3)] border border-transparent'
              }`}
            >
              할 일
            </button>
            <button
              onClick={() => setView('archive')}
              className={`px-2.5 py-1 text-xs rounded transition flex items-center gap-1 ${
                view === 'archive'
                  ? 'bg-[var(--accent-bg)] text-[var(--accent-soft)] border border-[var(--accent-border)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-3)] border border-transparent'
              }`}
            >
              📦 보관함
              {archiveCount > 0 && view === 'active' && (
                <span className="text-[10px] mono opacity-70">({archiveCount})</span>
              )}
            </button>
          </div>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'active' ? '검색…' : '보관된 항목 검색…'}
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <span className="text-[10px] mono text-[var(--fg-dim)] hidden sm:inline">
            ⌘⇧T 닫기 · Esc
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <p className="px-3 py-8 text-center text-xs text-[var(--fg-dim)]">불러오는 중…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--fg-muted)]">
              {view === 'active'
                ? search
                  ? '검색 결과 없음'
                  : '활성 할 일 없음 — 깨끗합니다 ✨'
                : '보관함 비어있음'}
            </p>
          )}

          {view === 'active' && grouped.map(([projectId, group]) => (
            <div key={projectId} className="mb-3">
              <button
                onClick={() => jumpToProject(projectId)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] mono uppercase tracking-wider text-[var(--fg-dim)] hover:text-[var(--accent-soft)] transition text-left"
                title="프로젝트로 이동"
              >
                <span>↗</span>
                <span className="truncate">{group.project_name}</span>
                <span className="ml-auto text-[10px] opacity-60">{group.tasks.length}</span>
              </button>
              <ul className="space-y-0.5">
                {group.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="group/row flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-3)] transition"
                  >
                    <button
                      onClick={() => patchStatus(t.id, t.status === 'done' ? 'pending' : 'done')}
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] transition ${
                        t.status === 'done'
                          ? 'bg-[var(--success)] border-[var(--success)] text-white'
                          : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
                      }`}
                      title={t.status === 'done' ? '미완료로 되돌리기' : '완료로 표시'}
                      aria-label="상태 토글"
                    >
                      {t.status === 'done' ? '✓' : ''}
                    </button>
                    <span
                      className={`flex-1 min-w-0 text-sm truncate ${
                        t.status === 'done' ? 'line-through text-[var(--fg-dim)]' : 'text-[var(--foreground)]'
                      }`}
                      onClick={() => jumpToProject(t.project_id)}
                      role="button"
                      title={`${t.title}\n클릭 → ${group.project_name}로 이동`}
                    >
                      {t.title}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] mono px-1.5 py-0.5 rounded border ${STATUS_BADGE[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                    <button
                      onClick={() => softDelete(t.id, t.title)}
                      className="shrink-0 opacity-0 group-hover/row:opacity-100 text-[var(--fg-dim)] hover:text-[var(--danger)] transition px-1 text-xs"
                      title="보관함으로 이동"
                      aria-label="보관함으로 이동"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {view === 'archive' && filtered.length > 0 && (
            <ul className="space-y-0.5">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className="group/row flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--surface-3)] transition"
                >
                  <span
                    className="flex-1 min-w-0 text-sm text-[var(--fg-muted)] truncate"
                    title={t.title}
                  >
                    {t.title}
                    <span className="ml-2 text-[10px] mono text-[var(--fg-dim)]">
                      · {t.project_name}
                    </span>
                  </span>
                  <button
                    onClick={() => restore(t.id, t.title)}
                    className="shrink-0 opacity-0 group-hover/row:opacity-100 text-[10px] mono px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--accent-soft)] hover:border-[var(--accent-border)] transition"
                    title="복원"
                  >
                    ↺ 복원
                  </button>
                  <button
                    onClick={() => hardDelete(t.id, t.title)}
                    className="shrink-0 opacity-0 group-hover/row:opacity-100 text-[var(--fg-dim)] hover:text-[var(--danger)] transition px-1 text-xs"
                    title="영구 삭제"
                    aria-label="영구 삭제"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

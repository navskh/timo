'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { IProject, IChatSession } from '@/types';
import { NewProjectModal } from './NewProjectModal';
import { ClaudeLimitsBar } from './ClaudeLimitsBar';
import ThemePicker from './ThemePicker';
import { confirm, toast } from './ui/dialogs';
import pkg from '../../package.json';

interface ISkillSummary {
  name: string;
  description: string;
  trigger: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams?.get('s') ?? null;
  const [projects, setProjects] = useState<IProject[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, IChatSession[]>>({});
  const [showNew, setShowNew] = useState(false);
  const [skills, setSkills] = useState<ISkillSummary[]>([]);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  // Pinned projects = "what I'm actively working on right now". Persisted as
  // a Set; filter toggle below shows only these. Replaces the old running-
  // only filter since "currently producing a turn" is too transient to be
  // useful as a navigation filter.
  const [pinnedProjectIds, setPinnedProjectIds] = useState<Set<string>>(new Set());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const prevRunningRef = useRef<Map<string, string>>(new Map());

  // Hydrate pin state + filter preference from localStorage on mount.
  useEffect(() => {
    try {
      const ids = JSON.parse(localStorage.getItem('timo-pinned-projects') ?? '[]');
      if (Array.isArray(ids)) {
        setPinnedProjectIds(new Set(ids.filter((x): x is string => typeof x === 'string')));
      }
      setPinnedOnly(localStorage.getItem('timo-sidebar-pinned-only') === '1');
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('timo-pinned-projects', JSON.stringify([...pinnedProjectIds]));
    } catch { /* ignore */ }
  }, [pinnedProjectIds]);
  useEffect(() => {
    try {
      localStorage.setItem('timo-sidebar-pinned-only', pinnedOnly ? '1' : '0');
    } catch { /* ignore */ }
  }, [pinnedOnly]);

  function togglePin(projectId: string) {
    setPinnedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  const activeProjectId = (() => {
    const m = pathname?.match(/^\/projects\/([^/]+)/);
    return m?.[1] ?? null;
  })();

  const loadProjects = useCallback(async () => {
    const r = await fetch('/api/projects').then((r) => r.json());
    setProjects(r.projects ?? []);
  }, []);

  const loadSessions = useCallback(async (projectId: string) => {
    const r = await fetch(`/api/projects/${projectId}/sessions`).then((r) => r.json());
    setSessionsByProject((prev) => ({ ...prev, [projectId]: r.sessions ?? [] }));
  }, []);

  const loadSkills = useCallback(async () => {
    const r = await fetch('/api/skills').then((r) => r.json());
    setSkills(r.skills ?? []);
  }, []);

  useEffect(() => {
    loadProjects();
    loadSkills();
  }, [loadProjects, loadSkills]);

  // Poll running sessions every 2s. Detect transitions to fire completion toast
  // and broadcast globally so the chat page can refetch its messages.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/sessions/status').then((r) => r.json());
        if (stopped) return;
        const nextList: Array<{ session_id: string; project_id: string; title: string }> =
          r.running ?? [];
        const nextMap = new Map<string, string>();
        for (const s of nextList) nextMap.set(s.session_id, s.title);

        // Completion detection: was running, now not.
        const prev = prevRunningRef.current;
        for (const [sid, title] of prev) {
          if (!nextMap.has(sid)) {
            toast.success(`응답 완료: ${title}`);
            window.dispatchEvent(
              new CustomEvent('timo:session-finished', { detail: { session_id: sid } }),
            );
          }
        }
        prevRunningRef.current = nextMap;
        setRunningIds(new Set(nextMap.keys()));
      } catch { /* transient error — ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  // Auto-expand & load sessions for active project
  useEffect(() => {
    if (activeProjectId) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(activeProjectId);
        return next;
      });
      loadSessions(activeProjectId);
    }
  }, [activeProjectId, loadSessions]);

  // Listen to global refresh event (fired after message send so new session titles appear)
  useEffect(() => {
    const onRefresh = () => {
      loadProjects();
      if (activeProjectId) loadSessions(activeProjectId);
    };
    const onSkillsRefresh = () => loadSkills();
    window.addEventListener('timo:refresh-sidebar', onRefresh);
    window.addEventListener('timo:refresh-skills', onSkillsRefresh);
    return () => {
      window.removeEventListener('timo:refresh-sidebar', onRefresh);
      window.removeEventListener('timo:refresh-skills', onSkillsRefresh);
    };
  }, [activeProjectId, loadProjects, loadSessions, loadSkills]);

  function toggle(projectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else {
        next.add(projectId);
        if (!sessionsByProject[projectId]) loadSessions(projectId);
      }
      return next;
    });
  }

  async function deleteProject(id: string, name: string) {
    const ok = await confirm({
      title: '프로젝트 삭제',
      message: `"${name}"을(를) 삭제할까요?\n\n모든 세션·태스크·실행 이력이 함께 지워집니다. 되돌릴 수 없어요.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    toast.success(`프로젝트 "${name}" 삭제됨`);
    if (activeProjectId === id) router.push('/');
    loadProjects();
  }

  async function newSession(projectId: string) {
    const r = await fetch(`/api/projects/${projectId}/sessions`, { method: 'POST' }).then((r) => r.json());
    await loadSessions(projectId);
    if (r?.session?.id) router.push(`/projects/${projectId}?s=${r.session.id}`);
  }

  async function deleteSession(projectId: string, sessionId: string, title: string) {
    const ok = await confirm({
      title: '대화 삭제',
      message: `"${title}" 대화를 삭제할까요?\n메시지 전체가 함께 지워집니다.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    toast.success('대화 삭제됨');
    await loadSessions(projectId);
    // If we were viewing the deleted session, ensure redirects to a valid one.
    if (activeProjectId === projectId && activeSessionId === sessionId) {
      router.push(`/projects/${projectId}`);
    }
  }

  return (
    <>
      <aside className="w-[260px] shrink-0 flex flex-col bg-[var(--surface-1)] border-r border-[var(--border)] h-screen">
        {/* Brand */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-sm">
            <span className="text-[var(--accent-on)] text-[11px] font-bold">T</span>
          </div>
          <Link href="/" className="text-sm font-semibold tracking-tight hover:text-[var(--accent-soft)] transition">
            TIMO
          </Link>
          <span className="ml-auto text-[10px] text-[var(--fg-dim)] mono">v{pkg.version}</span>
          <ThemePicker />
        </div>

        {/* Action */}
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => setShowNew(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] text-sm font-medium transition"
          >
            <span className="text-base leading-none">+</span>
            <span>새 프로젝트</span>
          </button>
        </div>

        {/* Filter: show only projects the user has pinned as "active focus".
            Pin/unpin via the ★ button on each project row below. */}
        <div className="px-3 pt-1.5 pb-2">
          <button
            onClick={() => setPinnedOnly((v) => !v)}
            className={`w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition ${
              pinnedOnly
                ? 'bg-[var(--accent-bg)] text-[var(--accent-soft)] border border-[var(--accent-border)]'
                : 'text-[var(--fg-dim)] hover:text-[var(--fg-muted)] hover:bg-[var(--surface-3)] border border-transparent'
            }`}
            title={pinnedOnly ? '전체 프로젝트 보기로 전환' : '핀한 프로젝트만 보기로 전환'}
          >
            <span aria-hidden className="text-[10px]">★</span>
            <span>핀 프로젝트만</span>
            {pinnedProjectIds.size > 0 && (
              <span className="text-[10px] mono text-[var(--fg-dim)]">
                ({pinnedProjectIds.size})
              </span>
            )}
          </button>
        </div>

        {/* Project/session tree */}
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {projects.length === 0 && (
            <p className="px-3 py-6 text-xs text-[var(--fg-dim)] italic text-center">
              아직 프로젝트 없음
            </p>
          )}
          {pinnedOnly && pinnedProjectIds.size === 0 && projects.length > 0 && (
            <p className="px-3 py-6 text-xs text-[var(--fg-dim)] italic text-center leading-relaxed">
              핀한 프로젝트 없음
              <br />
              <span className="text-[var(--fg-muted)]">프로젝트 옆 ★를 눌러 핀</span>
            </p>
          )}
          <ul className="space-y-0.5">
            {(pinnedOnly
              ? projects.filter((p) => pinnedProjectIds.has(p.id))
              : projects
            ).map((p) => {
              const isOpen = expanded.has(p.id);
              const isActive = activeProjectId === p.id;
              const isPinned = pinnedProjectIds.has(p.id);
              const sessions: IChatSession[] = sessionsByProject[p.id] ?? [];
              return (
                <li key={p.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-md transition ${
                      isActive ? 'bg-[var(--accent-bg)]' : 'hover:bg-[var(--surface-3)]'
                    }`}
                  >
                    <button
                      onClick={() => toggle(p.id)}
                      className="shrink-0 w-5 h-7 flex items-center justify-center text-[var(--fg-dim)] hover:text-[var(--foreground)]"
                    >
                      <span className={`transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>›</span>
                    </button>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex-1 min-w-0 py-1 pr-1 text-sm truncate"
                      title={p.name}
                    >
                      <span className={isActive ? 'text-[var(--accent-soft)] font-medium' : 'text-[var(--foreground)]'}>
                        {p.name}
                      </span>
                    </Link>
                    <button
                      onClick={() => togglePin(p.id)}
                      className={`shrink-0 transition px-1.5 py-1 text-xs leading-none ${
                        isPinned
                          ? 'text-[var(--accent)] hover:text-[var(--accent-soft)]'
                          : 'opacity-0 group-hover:opacity-100 text-[var(--fg-dim)] hover:text-[var(--accent)]'
                      }`}
                      title={isPinned ? '핀 해제' : '프로젝트 핀'}
                      aria-label={isPinned ? '핀 해제' : '프로젝트 핀'}
                    >
                      {isPinned ? '★' : '☆'}
                    </button>
                    <button
                      onClick={() => deleteProject(p.id, p.name)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--fg-dim)] hover:text-[var(--danger)] transition px-1.5 py-1 text-xs"
                      title="프로젝트 삭제"
                    >
                      ×
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-[var(--border)]">
                      <li>
                        <button
                          onClick={() => newSession(p.id)}
                          className="w-full text-left pl-3 pr-2 py-1 text-[11px] text-[var(--fg-muted)] hover:text-[var(--accent-soft)] transition"
                        >
                          + 새 대화
                        </button>
                      </li>
                      {sessions.length === 0 && (
                        <li className="pl-3 pr-2 py-1 text-[11px] text-[var(--fg-dim)] italic">
                          세션 없음
                        </li>
                      )}
                      {sessions.slice(0, 10).map((s) => {
                        const isActiveSession = isActive && activeSessionId === s.id;
                        const isRunning = runningIds.has(s.id);
                        return (
                          <li key={s.id}>
                            <div
                              className={`group/session flex items-center rounded-r transition relative ${
                                isActiveSession
                                  ? 'bg-[var(--accent-bg)] before:absolute before:left-[-1px] before:top-1 before:bottom-1 before:w-[2px] before:bg-[var(--accent)] before:rounded-full'
                                  : 'hover:bg-[var(--surface-3)]'
                              }`}
                            >
                              <Link
                                href={`/projects/${p.id}?s=${s.id}`}
                                className={`pl-3 pr-1 py-1 text-[12px] flex-1 min-w-0 flex items-center gap-1.5 ${
                                  isActiveSession
                                    ? 'text-[var(--foreground)] font-medium'
                                    : 'text-[var(--fg-muted)] group-hover/session:text-[var(--accent-soft)]'
                                }`}
                                title={isRunning ? `${s.title} — 응답 중` : s.title}
                              >
                                {isRunning && (
                                  <span
                                    className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"
                                    aria-label="응답 중"
                                  />
                                )}
                                <span className="truncate flex-1">{s.title}</span>
                              </Link>
                              <button
                                onClick={() => deleteSession(p.id, s.id, s.title)}
                                className="shrink-0 opacity-0 group-hover/session:opacity-100 text-[var(--fg-dim)] hover:text-[var(--danger)] transition px-1.5 py-1 text-[11px]"
                                title="대화 삭제"
                              >
                                ×
                              </button>
                            </div>
                          </li>
                        );
                      })}
                      {sessions.length > 10 && (
                        <li className="pl-3 pr-2 py-0.5 text-[10px] text-[var(--fg-dim)]">
                          + {sessions.length - 10} more
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Skills */}
        <div className="border-t border-[var(--border)] px-2 py-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
              📚 Skills
            </span>
            <Link
              href="/skills"
              className="text-[10px] text-[var(--fg-dim)] hover:text-[var(--accent-soft)] transition"
              title="스킬 관리"
            >
              관리
            </Link>
          </div>
          <ul className="space-y-0.5">
            {skills.length === 0 && (
              <li className="px-2 py-1 text-[11px] text-[var(--fg-dim)] italic">스킬 없음</li>
            )}
            {skills.map((s) => (
              <li key={s.name}>
                <button
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('timo:insert-skill', { detail: { trigger: s.trigger } }),
                    );
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--surface-3)] text-left transition group"
                  title={s.description}
                >
                  <span className="mono text-[11px] text-[var(--accent-soft)]">{s.trigger}</span>
                  <span className="text-[10px] text-[var(--fg-dim)] truncate flex-1 group-hover:text-[var(--fg-muted)]">
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <ClaudeLimitsBar />

        <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--fg-dim)] mono">
          Think · Idea-Manager · Operation
        </div>
      </aside>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            loadProjects();
            router.push(`/projects/${id}`);
          }}
        />
      )}
    </>
  );
}

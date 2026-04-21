'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { IProject, IChatSession } from '@/types';
import { NewProjectModal } from './NewProjectModal';

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
    if (!confirm(`프로젝트 "${name}" 삭제할까요? 모든 세션·태스크·실행 이력이 함께 지워져요.`)) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (activeProjectId === id) router.push('/');
    loadProjects();
  }

  async function newSession(projectId: string) {
    const r = await fetch(`/api/projects/${projectId}/sessions`, { method: 'POST' }).then((r) => r.json());
    await loadSessions(projectId);
    if (r?.session?.id) router.push(`/projects/${projectId}?s=${r.session.id}`);
  }

  return (
    <>
      <aside className="w-[260px] shrink-0 flex flex-col bg-[var(--surface-1)] border-r border-[var(--border)] h-screen">
        {/* Brand */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shadow-sm">
            <span className="text-white text-[11px] font-bold">T</span>
          </div>
          <Link href="/" className="text-sm font-semibold tracking-tight hover:text-violet-300 transition">
            TIMO
          </Link>
          <span className="ml-auto text-[10px] text-[var(--fg-dim)] mono">v0.1</span>
        </div>

        {/* Action */}
        <div className="p-3">
          <button
            onClick={() => setShowNew(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-sm font-medium transition"
          >
            <span className="text-base leading-none">+</span>
            <span>새 프로젝트</span>
          </button>
        </div>

        {/* Project/session tree */}
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {projects.length === 0 && (
            <p className="px-3 py-6 text-xs text-[var(--fg-dim)] italic text-center">
              아직 프로젝트 없음
            </p>
          )}
          <ul className="space-y-0.5">
            {projects.map((p) => {
              const isOpen = expanded.has(p.id);
              const isActive = activeProjectId === p.id;
              const sessions = sessionsByProject[p.id] ?? [];
              return (
                <li key={p.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-md transition ${
                      isActive ? 'bg-[var(--accent-bg)]' : 'hover:bg-[var(--surface-3)]'
                    }`}
                  >
                    <button
                      onClick={() => toggle(p.id)}
                      className="shrink-0 w-5 h-7 flex items-center justify-center text-[var(--fg-dim)] hover:text-white"
                    >
                      <span className={`transition-transform inline-block ${isOpen ? 'rotate-90' : ''}`}>›</span>
                    </button>
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex-1 min-w-0 py-1 pr-1 text-sm truncate"
                      title={p.name}
                    >
                      <span className={isActive ? 'text-violet-200 font-medium' : 'text-gray-200'}>
                        {p.name}
                      </span>
                    </Link>
                    <button
                      onClick={() => deleteProject(p.id, p.name)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--fg-dim)] hover:text-red-400 transition px-1.5 py-1 text-xs"
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
                          className="w-full text-left pl-3 pr-2 py-1 text-[11px] text-[var(--fg-muted)] hover:text-violet-300 transition"
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
                        return (
                          <li key={s.id}>
                            <Link
                              href={`/projects/${p.id}?s=${s.id}`}
                              className={`block pl-3 pr-2 py-1 text-[12px] rounded-r truncate transition relative ${
                                isActiveSession
                                  ? 'bg-[var(--accent-bg)] text-violet-100 font-medium before:absolute before:left-[-1px] before:top-1 before:bottom-1 before:w-[2px] before:bg-violet-400 before:rounded-full'
                                  : 'text-gray-400 hover:text-violet-200 hover:bg-[var(--surface-3)]'
                              }`}
                              title={s.title}
                            >
                              {s.title}
                            </Link>
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
              className="text-[10px] text-[var(--fg-dim)] hover:text-violet-300 transition"
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
                  <span className="mono text-[11px] text-violet-300">{s.trigger}</span>
                  <span className="text-[10px] text-[var(--fg-dim)] truncate flex-1 group-hover:text-[var(--fg-muted)]">
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

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

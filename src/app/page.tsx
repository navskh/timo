'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { IProject } from '@/types';

export default function Home() {
  const [projects, setProjects] = useState<IProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">TIMO</h1>
          <p className="text-[var(--fg-muted)] mt-2 text-sm">
            Think · Idea-Manager · Operation — 대화 중심으로 작업을 진행하고, 태스크는 AI가 스스로 정리해요.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--fg-dim)]">로딩…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center">
            <p className="text-sm text-[var(--fg-muted)] mb-3">
              아직 프로젝트가 없어요. 좌측 사이드바에서 <b className="text-white">+ 새 프로젝트</b>를 만드세요.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-3">
              최근 프로젝트
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] hover:border-[var(--accent-border)] transition"
                  >
                    <div className="font-medium text-sm">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-[var(--fg-muted)] mt-1 line-clamp-2">
                        {p.description}
                      </div>
                    )}
                    <div className="text-[11px] text-[var(--fg-dim)] mt-2 mono truncate">
                      {p.agent_type} · {p.project_path ?? '(cwd 미지정)'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

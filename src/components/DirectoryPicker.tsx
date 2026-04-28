'use client';

import { useCallback, useEffect, useState } from 'react';

interface LsResponse {
  path: string;
  parent: string | null;
  home: string;
  entries: Array<{ name: string; isDir: boolean }>;
  error?: string;
}

interface Props {
  initialPath?: string | null;
  onSelect: (absPath: string) => void;
  onClose: () => void;
}

export function DirectoryPicker({ initialPath, onSelect, onClose }: Props) {
  const [data, setData] = useState<LsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  const load = useCallback(async (p?: string | null) => {
    setLoading(true);
    setError(null);
    const url = p ? `/api/fs/ls?path=${encodeURIComponent(p)}` : `/api/fs/ls`;
    const res = await fetch(url);
    const body = (await res.json()) as LsResponse;
    if (!res.ok) {
      setError(body.error ?? 'failed');
      setLoading(false);
      return;
    }
    setData(body);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(initialPath || undefined);
  }, [initialPath, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pathSegments = data ? breadcrumbSegments(data.path) : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--muted)] border border-[var(--border)] rounded-lg w-[640px] max-w-full max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: breadcrumb */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="text-xs text-[var(--fg-muted)] mb-1">작업 디렉토리 선택</div>
          <div className="flex items-center flex-wrap gap-1 text-xs mono">
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <button
                  onClick={() => load(seg.path)}
                  className="px-1.5 py-0.5 rounded hover:bg-[var(--accent-bg)] text-[var(--fg-muted)] hover:text-[var(--accent-soft)] transition"
                >
                  {seg.label}
                </button>
                {i < pathSegments.length - 1 && <span className="text-[var(--fg-dim)]">/</span>}
              </span>
            ))}
          </div>
          {data && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => load(data.home)}
                className="text-xs px-2 py-0.5 bg-[var(--surface-2)] hover:bg-[var(--accent-bg)] rounded mono"
                title={data.home}
              >
                🏠 홈
              </button>
              {data.parent && (
                <button
                  onClick={() => load(data.parent)}
                  className="text-xs px-2 py-0.5 bg-[var(--surface-2)] hover:bg-[var(--accent-bg)] rounded mono"
                >
                  ↑ 상위
                </button>
              )}
            </div>
          )}
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-6 text-sm text-[var(--fg-dim)]">로딩…</div>}
          {error && <div className="p-6 text-sm text-red-400 mono">⚠ {error}</div>}
          {!loading && data && (
            <ul className="divide-y divide-[var(--border)]">
              {data.entries.filter((e) => e.isDir).length === 0 && (
                <li className="p-6 text-sm text-[var(--fg-dim)] italic">하위 폴더 없음</li>
              )}
              {data.entries
                .filter((e) => e.isDir)
                .map((e) => (
                  <li key={e.name}>
                    <button
                      onDoubleClick={() => {
                        const next = joinPath(data.path, e.name);
                        load(next);
                      }}
                      onClick={() => {
                        const next = joinPath(data.path, e.name);
                        load(next);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[var(--accent-bg)] text-left text-sm transition"
                    >
                      <span>📁</span>
                      <span className="mono text-[var(--foreground)]">{e.name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Manual override */}
        <div className="border-t border-[var(--border)] px-4 py-2">
          <div className="flex gap-2">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualInput.trim()) {
                  load(manualInput.trim());
                }
              }}
              placeholder="경로 직접 입력 (Enter로 이동)"
              className="flex-1 text-xs mono bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
          <div className="text-[11px] mono text-[var(--fg-dim)] truncate flex-1" title={data?.path}>
            {data?.path ?? ''}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:bg-[var(--surface-3)]"
            >
              취소
            </button>
            <button
              disabled={!data}
              onClick={() => data && onSelect(data.path)}
              className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 font-medium"
            >
              이 폴더 선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function breadcrumbSegments(abs: string): Array<{ label: string; path: string }> {
  const parts = abs.split('/').filter(Boolean);
  const segs: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }];
  let acc = '';
  for (const p of parts) {
    acc += '/' + p;
    segs.push({ label: p, path: acc });
  }
  return segs;
}

function joinPath(base: string, name: string): string {
  if (base === '/') return '/' + name;
  return base + '/' + name;
}

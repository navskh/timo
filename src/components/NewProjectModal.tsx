'use client';

import { useEffect, useState } from 'react';
import type { AgentType } from '@/types';
import { DirectoryPicker } from './DirectoryPicker';

interface Props {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export function NewProjectModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    project_path: '',
    agent_type: 'claude' as AgentType,
  });
  const [busy, setBusy] = useState(false);
  const [pickingPath, setPickingPath] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (data?.project?.id) onCreated(data.project.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl w-[480px] max-w-full shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold">새 프로젝트</h2>
        </div>
        <div className="p-5 space-y-3">
          <Field label="이름">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="MyAwesomeApp"
              className="input"
            />
          </Field>
          <Field label="설명 (선택)">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="한 줄 설명"
              className="input"
            />
          </Field>
          <Field label="작업 디렉토리 (선택)">
            <div className="flex gap-2">
              <input
                value={form.project_path}
                onChange={(e) => setForm({ ...form, project_path: e.target.value })}
                placeholder="/Users/you/projects/foo — 나중에도 변경 가능"
                className="input mono"
              />
              <button
                type="button"
                onClick={() => setPickingPath(true)}
                className="shrink-0 px-3 py-2 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--surface-3)] hover:border-violet-500/50 transition flex items-center gap-1"
                title="폴더 브라우저로 선택"
              >
                📁 찾기
              </button>
            </div>
          </Field>
          <Field label="에이전트">
            <select
              value={form.agent_type}
              onChange={(e) => setForm({ ...form, agent_type: e.target.value as AgentType })}
              className="input"
            >
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="codex">Codex</option>
            </select>
          </Field>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--surface-3)]"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !form.name.trim()}
            className="px-4 py-1.5 text-sm rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-medium"
          >
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </form>
      {pickingPath && (
        <DirectoryPicker
          initialPath={form.project_path || null}
          onSelect={(p) => {
            setForm({ ...form, project_path: p });
            setPickingPath(false);
          }}
          onClose={() => setPickingPath(false)}
        />
      )}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.7rem;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
          color: inherit;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: var(--accent);
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] text-[var(--fg-muted)] mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentType } from '@/types';
import { confirm, toast } from '@/components/ui/dialogs';

interface ISkill {
  name: string;
  description: string;
  trigger: string;
  agent: AgentType | null;
  body: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<ISkill[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<ISkill | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/skills').then((r) => r.json());
    setSkills(r.skills ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (skills.length === 0) {
      setSelectedName(null);
      setDraft(null);
      return;
    }
    if (!selectedName && !creating) {
      setSelectedName(skills[0].name);
    }
  }, [skills, selectedName, creating]);

  useEffect(() => {
    if (creating) {
      setDraft({
        name: '',
        description: '',
        trigger: '/',
        agent: null,
        body: '---\nname: \ndescription: \ntrigger: /\nagent: claude\n---\n\n',
      });
      setDirty(false);
      return;
    }
    if (!selectedName) {
      setDraft(null);
      return;
    }
    fetch(`/api/skills/${selectedName}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.skill) {
          setDraft(d.skill);
          setDirty(false);
        }
      });
  }, [selectedName, creating]);

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    const url = creating ? '/api/skills' : `/api/skills/${selectedName}`;
    const method = creating ? 'POST' : 'PATCH';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error ?? '저장 실패');
      return;
    }
    await load();
    window.dispatchEvent(new Event('timo:refresh-skills'));
    setCreating(false);
    setSelectedName(data.skill.name);
    setDirty(false);
    toast.success(`"/${data.skill.name}" 저장됨`);
  }

  async function remove() {
    if (!selectedName) return;
    const ok = await confirm({
      title: '스킬 삭제',
      message: `"/${selectedName}" 스킬을 삭제할까요?\n~/.timo/skills/${selectedName}.md 파일이 제거됩니다.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/skills/${selectedName}`, { method: 'DELETE' });
    toast.success('스킬 삭제됨');
    await load();
    window.dispatchEvent(new Event('timo:refresh-skills'));
    setSelectedName(null);
    setDraft(null);
  }

  function updateDraft<K extends keyof ISkill>(key: K, value: ISkill[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
  }

  return (
    <main className="flex-1 flex overflow-hidden">
      {/* List */}
      <div className="w-[260px] border-r border-[var(--border)] bg-[var(--surface-1)] flex flex-col">
        <div className="h-12 px-4 border-b border-[var(--border)] flex items-center justify-between">
          <h1 className="text-sm font-semibold">📚 Skills</h1>
          <button
            onClick={() => {
              setCreating(true);
              setSelectedName(null);
            }}
            className="text-xs px-2 py-1 rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)]"
          >
            + 새 스킬
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {skills.length === 0 && !creating && (
            <li className="text-xs text-[var(--fg-dim)] italic px-3 py-4 text-center">
              스킬 없음
            </li>
          )}
          {skills.map((s) => {
            const isActive = selectedName === s.name && !creating;
            return (
              <li key={s.name}>
                <button
                  onClick={async () => {
                    if (dirty) {
                      const ok = await confirm({
                        title: '저장되지 않은 변경사항',
                        message: '현재 편집 중인 내용이 있어요. 이동하면 변경사항이 사라집니다.',
                        confirmText: '이동',
                        danger: true,
                      });
                      if (!ok) return;
                    }
                    setCreating(false);
                    setSelectedName(s.name);
                    setDirty(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                    isActive
                      ? 'bg-[var(--accent-bg)] text-[var(--accent-soft)]'
                      : 'hover:bg-[var(--surface-3)] text-[var(--foreground)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="mono text-[12px] text-[var(--accent-soft)]">{s.trigger}</span>
                  </div>
                  <div className="text-[11px] text-[var(--fg-dim)] truncate mt-0.5">
                    {s.description || '(설명 없음)'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!draft ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--fg-muted)]">
            왼쪽에서 스킬을 선택하거나 + 새 스킬을 눌러주세요.
          </div>
        ) : (
          <>
            <header className="h-12 border-b border-[var(--border)] flex items-center gap-3 px-4 bg-[var(--surface-1)]">
              <h2 className="text-sm font-semibold">
                {creating ? '새 스킬' : draft.name}
              </h2>
              <span className="text-xs text-[var(--fg-dim)] mono">
                {creating ? '' : `~/.timo/skills/${draft.name}.md`}
              </span>
              <div className="ml-auto flex gap-2">
                {!creating && (
                  <button
                    onClick={remove}
                    className="text-xs px-3 py-1.5 rounded border border-[var(--border)] text-[var(--fg-muted)] hover:text-red-400 hover:border-red-700/50"
                  >
                    삭제
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!dirty || saving || !draft.name.trim() || !draft.trigger.startsWith('/')}
                  className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 font-medium"
                >
                  {saving ? '저장 중…' : creating ? '만들기' : '저장'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="이름 (파일명, a-z/0-9/hyphen)">
                  <input
                    value={draft.name}
                    onChange={(e) => updateDraft('name', e.target.value)}
                    disabled={!creating}
                    placeholder="code-review"
                    className="input mono"
                  />
                </Field>
                <Field label="트리거 (slash 명령)">
                  <input
                    value={draft.trigger}
                    onChange={(e) => updateDraft('trigger', e.target.value)}
                    placeholder="/code-review"
                    className="input mono"
                  />
                </Field>
              </div>
              <Field label="설명 (사이드바/자동완성에 표시)">
                <input
                  value={draft.description}
                  onChange={(e) => updateDraft('description', e.target.value)}
                  placeholder="한 줄 설명"
                  className="input"
                />
              </Field>
              <Field label="에이전트 오버라이드 (비워두면 프로젝트 기본값 사용)">
                <select
                  value={draft.agent ?? ''}
                  onChange={(e) =>
                    updateDraft('agent', (e.target.value || null) as AgentType | null)
                  }
                  className="input"
                >
                  <option value="">(프로젝트 기본값)</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="codex">Codex</option>
                </select>
              </Field>
              <Field label="본문 (system prompt) — 이 내용이 스킬 호출 시 그대로 주입됨">
                <textarea
                  value={draft.body}
                  onChange={(e) => updateDraft('body', e.target.value)}
                  rows={24}
                  className="input mono text-[12px] leading-relaxed"
                  style={{ minHeight: '400px' }}
                />
              </Field>
            </div>
          </>
        )}
      </div>

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
    </main>
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

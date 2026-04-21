'use client';

import { useEffect, useRef, useState } from 'react';

interface ISkillSummary {
  name: string;
  description: string;
  trigger: string;
}

interface Props {
  running: boolean;
  onSend: (text: string) => void;
}

export function Composer({ running, onSend }: Props) {
  const [value, setValue] = useState('');
  const [skills, setSkills] = useState<ISkillSummary[]>([]);
  const [menu, setMenu] = useState<{ filter: string; index: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Fetch skills once on mount (cached in this session).
  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []));
  }, []);

  // Listen for sidebar clicks that want to inject a skill trigger.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const detail = (e as CustomEvent<{ trigger: string }>).detail;
      if (!detail?.trigger) return;
      setValue((prev) => {
        const prefix = prev.trim() === '' ? '' : prev.endsWith('\n') ? prev : prev + '\n';
        return `${prefix}${detail.trigger} `;
      });
      setTimeout(() => taRef.current?.focus(), 0);
    };
    window.addEventListener('timo:insert-skill', onInsert);
    return () => window.removeEventListener('timo:insert-skill', onInsert);
  }, []);

  // Recompute slash menu on value change.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) { setMenu(null); return; }
    const cursor = ta.selectionStart ?? value.length;
    const upto = value.slice(0, cursor);
    // Open menu only if "/" is at the very start OR after a newline, and cursor is still on that slash token
    const match = upto.match(/(?:^|\n)(\/[a-zA-Z0-9-]*)$/);
    if (!match) { setMenu(null); return; }
    const filter = match[1].slice(1).toLowerCase();
    setMenu((prev) => ({ filter, index: prev?.filter === filter ? prev.index : 0 }));
  }, [value]);

  const matches = menu
    ? skills
        .filter((s) => s.trigger.slice(1).toLowerCase().startsWith(menu.filter))
        .slice(0, 8)
    : [];

  function applySkill(skill: ISkillSummary) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const upto = value.slice(0, cursor);
    const after = value.slice(cursor);
    const triggerStart = upto.lastIndexOf('/');
    const nextValue = upto.slice(0, triggerStart) + skill.trigger + ' ' + after;
    setValue(nextValue);
    setMenu(null);
    setTimeout(() => {
      if (!taRef.current) return;
      const pos = triggerStart + skill.trigger.length + 1;
      taRef.current.selectionStart = taRef.current.selectionEnd = pos;
      taRef.current.focus();
    }, 0);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % matches.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        applySkill(matches[menu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !running) {
        onSend(value);
        setValue('');
      }
    }
  }

  return (
    <div className="relative">
      {menu && matches.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-[var(--fg-dim)] uppercase tracking-wider border-b border-[var(--border)]">
            스킬 — ↑↓ 이동, Tab/Enter 선택, Esc 닫기
          </div>
          <ul>
            {matches.map((s, i) => (
              <li key={s.name}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySkill(s);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                    i === menu.index ? 'bg-violet-600/30 text-white' : 'hover:bg-[var(--surface-3)]'
                  }`}
                >
                  <span className="mono text-[12px] text-violet-300 w-[80px]">{s.trigger}</span>
                  <span className="text-[12px] text-[var(--fg-muted)] truncate flex-1">
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={running ? 'TIMO가 작업 중…' : '무엇을 부탁할까요?  (Enter 전송 · Shift+Enter 줄바꿈 · / 스킬)'}
          disabled={running}
          rows={2}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] focus:border-violet-500 rounded-lg px-3.5 py-2.5 text-sm resize-none outline-none disabled:opacity-50 transition-colors mono-ascii-fallback"
          style={{ fontFamily: 'inherit' }}
        />
        <button
          onClick={() => {
            if (value.trim() && !running) {
              onSend(value);
              setValue('');
            }
          }}
          disabled={running || !value.trim()}
          className="h-[60px] px-5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition shrink-0"
        >
          {running ? '…' : '전송'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/lib/theme/ThemeProvider';

interface IPickerProps {
  /** Visual variant: `compact` shows only swatch + chevron, `inline` adds the theme name. */
  variant?: 'compact' | 'inline';
}

// useSyncExternalStore-based "is mounted" — avoids the setState-in-effect lint
// rule while still flipping false → true after hydration.
const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

export default function ThemePicker({ variant = 'compact' }: IPickerProps) {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);

  useEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] transition ${
          variant === 'compact' ? 'h-7 w-7 justify-center' : 'h-7 px-2 text-[11px] mono text-[var(--fg-muted)]'
        }`}
        title={`테마: ${theme.name}`}
      >
        <span
          className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-[var(--border-strong)]"
          style={{
            background: `linear-gradient(135deg, ${theme.swatch.bg} 0%, ${theme.swatch.bg} 50%, ${theme.swatch.accent} 50%, ${theme.swatch.accent} 100%)`,
          }}
        />
        {variant === 'inline' && <span>{theme.name}</span>}
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
          className="w-[280px] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl p-2"
        >
          <div className="px-2 py-1.5 text-[10px] mono uppercase tracking-wider text-[var(--fg-dim)]">
            테마
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {themes.map((t) => {
              const active = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); setOpen(false); }}
                  className={`flex items-center gap-2 p-1.5 rounded-md text-left transition ${
                    active
                      ? 'bg-[var(--accent-bg)] ring-1 ring-[var(--accent-border)]'
                      : 'hover:bg-[var(--surface-3)]'
                  }`}
                >
                  <span
                    className="shrink-0 w-8 h-8 rounded overflow-hidden ring-1 ring-[var(--border)] flex"
                    aria-hidden
                  >
                    <span style={{ background: t.swatch.bg, flex: 1 }} />
                    <span style={{ background: t.swatch.surface, flex: 1 }} />
                    <span style={{ background: t.swatch.accent, flex: 1 }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-medium text-[var(--foreground)] truncate">
                      {t.emoji} {t.name}
                    </span>
                    <span className="block text-[10px] mono text-[var(--fg-dim)]">
                      {t.scheme}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

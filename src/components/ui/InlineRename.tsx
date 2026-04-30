'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
  placeholder?: string;
}

/**
 * Rename input that auto-focuses and selects the existing text. Enter commits
 * (after trim — empty cancels), Escape cancels. Stops propagation so the
 * click/keydown handlers on the surrounding row don't get triggered.
 */
export function InlineRename({ initial, onCommit, onCancel, className, placeholder }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onCommit(trimmed);
          else onCancel();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={
        className ??
        'flex-1 min-w-0 bg-[var(--surface-1)] border border-[var(--accent-border)] rounded px-1.5 py-0.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]'
      }
    />
  );
}

/**
 * Helper that PATCHes /api/sessions/[sid] and broadcasts a `timo:session-renamed`
 * event so listeners (TabsContext, AppSidebar's own session list, project page)
 * can sync without re-fetching.
 */
export async function renameSession(session_id: string, title: string): Promise<void> {
  await fetch(`/api/sessions/${session_id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  window.dispatchEvent(
    new CustomEvent('timo:session-renamed', { detail: { session_id, title } }),
  );
}

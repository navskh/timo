'use client';

import { useState } from 'react';
import type { ITask, TaskStatus } from '@/types';

interface Props {
  tasks: ITask[];
  onDelete?: (id: string) => void;
  onAdd?: (title: string) => Promise<void> | void;
  onToggleStatus?: (id: string, nextStatus: TaskStatus) => Promise<void> | void;
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: 'done',
  running: 'done',
  done: 'pending',
  failed: 'pending',
};

export function TaskSidebar({ tasks, onDelete, onAdd, onToggleStatus }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t || busy || !onAdd) return;
    setBusy(true);
    await onAdd(t);
    setNewTitle('');
    setBusy(false);
  }
  const groups: Record<TaskStatus, ITask[]> = {
    running: [],
    pending: [],
    done: [],
    failed: [],
  };
  for (const t of tasks) groups[t.status].push(t);

  return (
    <aside className="w-full h-full flex flex-col border-l border-[var(--border)] bg-[var(--surface-1)]">
      <div className="h-12 px-3 border-b border-[var(--border)] text-sm font-semibold flex items-center justify-between">
        <span className="flex items-center gap-1.5">📋 태스크</span>
        <span className="text-[11px] text-[var(--fg-dim)] mono">
          {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
        </span>
      </div>

      {onAdd && (
        <form onSubmit={submit} className="px-2 py-2 border-b border-[var(--border)]">
          <div className="flex gap-1">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="+ 직접 추가…"
              disabled={busy}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] focus:border-violet-500 rounded px-2 py-1 text-[12px] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="px-2 py-1 text-[12px] bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded"
            >
              +
            </button>
          </div>
        </form>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {tasks.length === 0 && (
          <p className="text-xs text-gray-500 italic px-2 py-4">
            아직 없어요. 대화를 시작하면 AI가 TodoWrite로 태스크를 만들면서 여기 나타나요.
          </p>
        )}
        {groups.running.length > 0 && (
          <Group label="● 진행 중" color="text-violet-300" tasks={groups.running} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
        {groups.pending.length > 0 && (
          <Group label="• 대기" color="text-gray-300" tasks={groups.pending} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
        {groups.done.length > 0 && (
          <Group label="✓ 완료" color="text-green-400" tasks={groups.done} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
        {groups.failed.length > 0 && (
          <Group label="✗ 실패" color="text-red-400" tasks={groups.failed} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
      </div>
    </aside>
  );
}

function Group({
  label,
  color,
  tasks,
  onDelete,
  onToggleStatus,
}: {
  label: string;
  color: string;
  tasks: ITask[];
  onDelete?: (id: string) => void;
  onToggleStatus?: (id: string, nextStatus: TaskStatus) => Promise<void> | void;
}) {
  return (
    <div>
      <div className={`text-xs font-semibold mb-1 px-1 ${color}`}>{label}</div>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li
            key={t.id}
            className={`group px-2 py-1.5 rounded text-xs flex items-start gap-2 ${
              t.status === 'running'
                ? 'bg-violet-950/40 border border-violet-700/50 animate-pulse'
                : t.status === 'done'
                ? 'text-[var(--fg-dim)] line-through'
                : 'hover:bg-[var(--surface-3)]'
            }`}
          >
            <button
              type="button"
              disabled={!onToggleStatus}
              onClick={() => onToggleStatus?.(t.id, STATUS_CYCLE[t.status])}
              title={
                t.status === 'done'
                  ? '클릭해서 대기로 되돌리기'
                  : '클릭해서 완료로 표시'
              }
              className={`shrink-0 w-4 h-4 mt-0.5 rounded border transition ${
                t.status === 'done'
                  ? 'bg-green-600/80 border-green-500 text-white text-[10px] leading-none'
                  : t.status === 'failed'
                  ? 'bg-red-600/60 border-red-500 text-white text-[10px] leading-none'
                  : t.status === 'running'
                  ? 'border-violet-400 bg-violet-800/40'
                  : 'border-[var(--border-strong)] hover:border-violet-400'
              } disabled:cursor-default`}
            >
              {t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : ''}
            </button>
            <span className="flex-1 leading-relaxed">{t.title}</span>
            {onDelete && (
              <button
                onClick={() => onDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--fg-dim)] hover:text-red-400 transition"
                title="삭제"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

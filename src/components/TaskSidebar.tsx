'use client';

import { useEffect, useState } from 'react';
import type { ITask, TaskStatus } from '@/types';

interface Props {
  tasks: ITask[];
  onDelete?: (id: string) => void;
  onAdd?: (title: string) => Promise<void> | void;
  onToggleStatus?: (id: string, nextStatus: TaskStatus) => Promise<void> | void;
  /** Called with the new ordering of pending-task IDs after a drag. */
  onReorderPending?: (orderedIds: string[]) => Promise<void> | void;
  /** Fires a /tidy turn to let the AI reorganize the task list via TodoWrite. */
  onTidy?: () => Promise<void> | void;
  /** True while a chat turn is in progress — disable tidy. */
  tidyDisabled?: boolean;
  /** True while the tidy request is in flight — show inline progress. */
  tidyRunning?: boolean;
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: 'done',
  running: 'done',
  done: 'pending',
  failed: 'pending',
};

export function TaskSidebar({ tasks, onDelete, onAdd, onToggleStatus, onReorderPending, onTidy, tidyDisabled, tidyRunning }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [tidyElapsed, setTidyElapsed] = useState(0);

  // Wall-clock counter while tidy is in flight. Resets on each run.
  useEffect(() => {
    if (!tidyRunning) {
      setTidyElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setTidyElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [tidyRunning]);

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
      <div className="h-12 px-3 border-b border-[var(--border)] text-sm font-semibold flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">📋 태스크</span>
        <div className="flex items-center gap-2">
          {onTidy && (
            tidyRunning ? (
              <TidyProgress elapsed={tidyElapsed} taskCount={tasks.filter((t) => t.status !== 'done').length} />
            ) : (
              <button
                type="button"
                onClick={() => onTidy()}
                disabled={tidyDisabled}
                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] transition text-[var(--fg-muted)] hover:text-[var(--accent-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
                title="AI가 활성 태스크를 검토하고 정리합니다 (완료된 항목은 제외)"
              >
                ✨ 정리
              </button>
            )
          )}
          <span className="text-[11px] text-[var(--fg-dim)] mono">
            {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
          </span>
        </div>
      </div>

      {onAdd && (
        <form onSubmit={submit} className="px-2 py-2 border-b border-[var(--border)]">
          <div className="flex gap-1">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="+ 직접 추가…"
              disabled={busy}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] rounded px-2 py-1 text-[12px] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="px-2 py-1 text-[12px] bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 rounded"
            >
              +
            </button>
          </div>
        </form>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {tasks.length === 0 && (
          <p className="text-xs text-[var(--fg-dim)] italic px-2 py-4">
            아직 없어요. 대화를 시작하면 AI가 TodoWrite로 태스크를 만들면서 여기 나타나요.
          </p>
        )}
        {groups.running.length > 0 && (
          <Group label="● 진행 중" color="text-[var(--accent-soft)]" tasks={groups.running} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
        {groups.pending.length > 0 && (
          <Group
            label="• 대기"
            color="text-[var(--fg-muted)]"
            tasks={groups.pending}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            onReorder={onReorderPending}
          />
        )}
        {groups.done.length > 0 && (
          <Group label="✓ 완료" color="text-[var(--success)]" tasks={groups.done} onDelete={onDelete} onToggleStatus={onToggleStatus} />
        )}
        {groups.failed.length > 0 && (
          <Group label="✗ 실패" color="text-[var(--danger)]" tasks={groups.failed} onDelete={onDelete} onToggleStatus={onToggleStatus} />
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
  onReorder,
}: {
  label: string;
  color: string;
  tasks: ITask[];
  onDelete?: (id: string) => void;
  onToggleStatus?: (id: string, nextStatus: TaskStatus) => Promise<void> | void;
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
}) {
  // Optimistic ordering while drag is in-flight. Re-sync when parent prop changes.
  const [order, setOrder] = useState<ITask[]>(tasks);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setOrder(tasks);
  }, [tasks]);

  const draggable = Boolean(onReorder);

  function handleDragStart(e: React.DragEvent<HTMLLIElement>, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires setData to initiate drag
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e: React.DragEvent<HTMLLIElement>, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) setOverIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDrop(e: React.DragEvent<HTMLLIElement>, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      handleDragEnd();
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setOrder(next);
    handleDragEnd();
    onReorder?.(next.map((t) => t.id));
  }

  return (
    <div>
      <div className={`text-xs font-semibold mb-1 px-1 ${color}`}>{label}</div>
      <ul className="space-y-1">
        {order.map((t, i) => {
          const isDragging = dragIndex === i;
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <li
              key={t.id}
              draggable={draggable}
              onDragStart={draggable ? (e) => handleDragStart(e, i) : undefined}
              onDragOver={draggable ? (e) => handleDragOver(e, i) : undefined}
              onDrop={draggable ? (e) => handleDrop(e, i) : undefined}
              onDragEnd={draggable ? handleDragEnd : undefined}
              className={`group px-2 py-1.5 rounded text-xs flex items-start gap-2 transition relative ${
                t.status === 'running'
                  ? 'bg-[var(--accent-bg)] border border-[var(--accent-border)] animate-pulse'
                  : t.status === 'done'
                  ? 'text-[var(--fg-dim)] line-through'
                  : 'hover:bg-[var(--surface-3)]'
              } ${isDragging ? 'opacity-30 scale-[0.98]' : ''} ${
                isOver ? 'before:absolute before:left-0 before:right-0 before:-top-1 before:h-0.5 before:bg-[var(--accent)] before:rounded-full before:shadow-[0_0_8px_rgba(167,139,250,0.6)]' : ''
              } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              {draggable && (
                <span
                  className="shrink-0 text-[var(--fg-dim)] group-hover:text-[var(--fg-muted)] select-none leading-none mt-0.5"
                  title="드래그해서 순서 변경"
                >
                  ⋮⋮
                </span>
              )}
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
                    ? 'bg-[var(--success)] border-[var(--success)] text-white text-[10px] leading-none'
                    : t.status === 'failed'
                    ? 'bg-[var(--danger-bg)] border-[var(--danger)] text-white text-[10px] leading-none'
                    : t.status === 'running'
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                    : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
                } disabled:cursor-default`}
              >
                {t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : ''}
              </button>
              <span className="flex-1 leading-relaxed">{t.title}</span>
              {onDelete && (
                <button
                  onClick={() => onDelete(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--fg-dim)] hover:text-[var(--danger)] transition"
                  title="삭제"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function TidyProgress({ elapsed, taskCount }: { elapsed: number; taskCount: number }) {
  // Heuristic: per-task latency dominates input-token cost. Empirically ~1s per
  // active task above an 8s claude-CLI baseline.
  const estimated = Math.max(15, 8 + Math.ceil(taskCount * 1.2));
  const overshooting = elapsed > estimated;
  return (
    <span
      className="text-[11px] mono text-[var(--accent-soft)] flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--accent-border)] bg-[var(--accent-bg)]"
      title={`AI가 활성 태스크 ${taskCount}개를 검토 중. 보통 ${estimated}초 안에 끝나요.`}
    >
      <span className="inline-block w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
      {overshooting ? `${fmtTime(elapsed)} 조금만 더…` : `${fmtTime(elapsed)} / ~${fmtTime(estimated)}`}
    </span>
  );
}

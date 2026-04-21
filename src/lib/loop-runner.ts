import { executeTask, type ExecutorSink, cancelExecution } from './executor';
import { getNextPendingTask } from './db/queries/tasks';

/** Registry of project-level loops so the client can stop them. */
const activeLoops = new Map<string, { stopRequested: boolean; currentExecutionId?: string }>();

export function stopLoop(projectId: string): boolean {
  const loop = activeLoops.get(projectId);
  if (!loop) return false;
  loop.stopRequested = true;
  if (loop.currentExecutionId) {
    cancelExecution(loop.currentExecutionId);
  }
  return true;
}

export function isLoopActive(projectId: string): boolean {
  return activeLoops.has(projectId);
}

export type LoopEvent =
  | { type: 'loop-started'; project_id: string }
  | { type: 'task-picked'; task_id: string; title: string }
  | { type: 'exec'; payload: Parameters<ExecutorSink>[0] }
  | { type: 'loop-stopped'; reason: 'done' | 'cancelled' | 'failed'; message?: string };

export type LoopSink = (event: LoopEvent) => void;

/**
 * Runs every pending task in the project sequentially until there are none
 * left, the caller cancels, or a task fails (which stops the loop).
 */
export async function runProjectLoop(projectId: string, sink: LoopSink): Promise<void> {
  if (activeLoops.has(projectId)) {
    sink({ type: 'loop-stopped', reason: 'failed', message: 'loop already running' });
    return;
  }

  const state = { stopRequested: false, currentExecutionId: undefined as string | undefined };
  activeLoops.set(projectId, state);
  sink({ type: 'loop-started', project_id: projectId });

  try {
    while (!state.stopRequested) {
      const task = getNextPendingTask(projectId);
      if (!task) {
        sink({ type: 'loop-stopped', reason: 'done' });
        return;
      }
      sink({ type: 'task-picked', task_id: task.id, title: task.title });

      let hadFailure = false;
      const exec = await executeTask(task.id, (ev) => {
        if (ev.type === 'execution-started') {
          state.currentExecutionId = ev.execution.id;
        }
        if (ev.type === 'error') hadFailure = true;
        sink({ type: 'exec', payload: ev });
      });
      state.currentExecutionId = undefined;

      if (hadFailure || exec.status === 'failed') {
        sink({ type: 'loop-stopped', reason: 'failed', message: exec.error ?? undefined });
        return;
      }
      if (exec.status === 'cancelled') {
        sink({ type: 'loop-stopped', reason: 'cancelled' });
        return;
      }
    }
    sink({ type: 'loop-stopped', reason: 'cancelled' });
  } finally {
    activeLoops.delete(projectId);
  }
}

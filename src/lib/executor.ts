import type { ChildProcess } from 'node:child_process';
import { runAgent } from './ai/client';
import { getTask, updateTaskStatus } from './db/queries/tasks';
import { getProject } from './db/queries/projects';
import {
  createExecution,
  finishExecution,
  appendEvent,
} from './db/queries/executions';
import type { IExecution, ExecutionStatus } from '@/types';

export type ExecutorEvent =
  | { type: 'execution-started'; execution: IExecution }
  | { type: 'raw'; payload: Record<string, unknown> }
  | { type: 'text'; text: string }
  | { type: 'execution-finished'; execution: IExecution }
  | { type: 'error'; message: string };

export type ExecutorSink = (event: ExecutorEvent) => void;

/** In-memory registry of live executions so they can be cancelled. */
const live = new Map<string, ChildProcess>();

export function cancelExecution(executionId: string): boolean {
  const proc = live.get(executionId);
  if (!proc) return false;
  proc.kill('SIGTERM');
  return true;
}

export function isExecutionLive(executionId: string): boolean {
  return live.has(executionId);
}

function buildPrompt(taskTitle: string, taskDescription: string, projectDescription: string): string {
  const parts = [
    projectDescription ? `# Project context\n${projectDescription}\n` : '',
    `# Task\n${taskTitle}\n`,
    taskDescription ? `\n## Details\n${taskDescription}\n` : '',
    `\n---\nExecute this task. Use available tools (file read/write, shell, etc.) as needed. When finished, give a short final summary of what you did.`,
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Runs a single task through the configured agent.
 * Emits ExecutorEvents via the sink, persists events to DB for replay,
 * and updates task/execution status when finished.
 */
export async function executeTask(
  taskId: string,
  sink: ExecutorSink,
): Promise<IExecution> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const project = getProject(task.project_id);
  if (!project) throw new Error(`Project not found: ${task.project_id}`);

  const execution = createExecution({
    task_id: task.id,
    agent_type: project.agent_type,
  });
  updateTaskStatus(task.id, 'running');

  sink({ type: 'execution-started', execution });

  const prompt = buildPrompt(task.title, task.description, project.description);
  let seq = 0;

  try {
    const finalText = await runAgent(
      project.agent_type,
      prompt,
      (text) => {
        sink({ type: 'text', text });
      },
      (raw) => {
        const eventType = (raw.type as string) || 'unknown';
        appendEvent({
          execution_id: execution.id,
          seq: seq++,
          event_type: eventType,
          payload: raw,
        });
        sink({ type: 'raw', payload: raw });
      },
      {
        cwd: project.project_path ?? undefined,
        onSpawn: (proc) => {
          live.set(execution.id, proc);
        },
      },
    );

    live.delete(execution.id);
    finishExecution(execution.id, 'completed', finalText);
    updateTaskStatus(task.id, 'done');
    const finished = { ...execution, status: 'completed' as const, final_text: finalText };
    sink({ type: 'execution-finished', execution: finished });
    return finished;
  } catch (err) {
    live.delete(execution.id);
    const message = err instanceof Error ? err.message : String(err);
    const cancelled = message.includes('SIGTERM') || message.includes('killed by signal');
    const status: ExecutionStatus = cancelled ? 'cancelled' : 'failed';
    finishExecution(execution.id, status, '', message);
    updateTaskStatus(task.id, cancelled ? 'pending' : 'failed');
    const finished: IExecution = { ...execution, status, error: message };
    sink({ type: 'error', message });
    sink({ type: 'execution-finished', execution: finished });
    return finished;
  }
}

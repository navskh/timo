import { getDb } from '../index';
import { generateId } from '@/lib/utils/id';
import type { IExecution, IExecutionEvent, ExecutionStatus, AgentType } from '@/types';

export function createExecution(input: {
  task_id: string;
  agent_type: AgentType;
}): IExecution {
  const id = generateId();
  getDb()
    .prepare(
      `INSERT INTO executions (id, task_id, agent_type, status)
       VALUES (?, ?, ?, 'running')`,
    )
    .run(id, input.task_id, input.agent_type);
  return getExecution(id)!;
}

export function getExecution(id: string): IExecution | undefined {
  return getDb()
    .prepare('SELECT * FROM executions WHERE id = ?')
    .get(id) as IExecution | undefined;
}

export function getExecutionsByTask(taskId: string): IExecution[] {
  return getDb()
    .prepare('SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC')
    .all(taskId) as IExecution[];
}

export function finishExecution(
  id: string,
  status: ExecutionStatus,
  finalText: string,
  error?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE executions
       SET status = ?, finished_at = datetime('now'), final_text = ?, error = ?
       WHERE id = ?`,
    )
    .run(status, finalText, error ?? null, id);
}

export function appendEvent(input: {
  execution_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
}): void {
  const id = generateId();
  getDb()
    .prepare(
      `INSERT INTO execution_events (id, execution_id, seq, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.execution_id, input.seq, input.event_type, JSON.stringify(input.payload ?? {}));
}

export function getEvents(executionId: string): IExecutionEvent[] {
  return getDb()
    .prepare('SELECT * FROM execution_events WHERE execution_id = ? ORDER BY seq ASC')
    .all(executionId) as IExecutionEvent[];
}

/**
 * In-memory tracker of chat sessions currently producing an assistant turn.
 * Survives Next HMR via globalThis (same reason as the DB wrapper singleton).
 *
 * Why this exists:
 *  - Users can navigate away while TIMO is still streaming a response. The
 *    local SSE subscription dies, but the spawned claude CLI keeps going on
 *    the server and persists the final message.
 *  - The sidebar shows a spinner on sessions that are still running so the
 *    user knows something's cooking even from another project.
 *  - Coming back to a running session, the chat page shows a typing indicator
 *    instead of stale messages, and refetches when it flips to idle.
 */

import type { ChildProcess } from 'node:child_process';

export interface IRunningSession {
  session_id: string;
  project_id: string;
  title: string;
  started_at: number;
}

interface Store {
  running: Map<string, IRunningSession>;
  processes: Map<string, ChildProcess>;
}

const g = globalThis as { __timoChatState?: Store };
const state: Store = g.__timoChatState ?? { running: new Map(), processes: new Map() };
// Backfill — older globals from before the processes field existed.
if (!state.processes) state.processes = new Map();
g.__timoChatState = state;

export function markRunning(input: { session_id: string; project_id: string; title: string }) {
  state.running.set(input.session_id, {
    session_id: input.session_id,
    project_id: input.project_id,
    title: input.title,
    started_at: Date.now(),
  });
}

export function markIdle(session_id: string) {
  state.running.delete(session_id);
}

export function isRunning(session_id: string): boolean {
  return state.running.has(session_id);
}

export function listRunning(): IRunningSession[] {
  return [...state.running.values()];
}

export function setProcess(session_id: string, proc: ChildProcess) {
  state.processes.set(session_id, proc);
}

export function clearProcess(session_id: string) {
  state.processes.delete(session_id);
}

/** Send SIGTERM to the running claude CLI for this session. Returns true if a
 *  live process was found and the signal was dispatched. */
export function interruptSession(session_id: string): boolean {
  const proc = state.processes.get(session_id);
  if (!proc) return false;
  try {
    proc.kill('SIGTERM');
    return true;
  } catch {
    return false;
  }
}

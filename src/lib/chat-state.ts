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
import type { ChatBlock } from '@/types';

export interface IRunningSession {
  session_id: string;
  project_id: string;
  title: string;
  started_at: number;
}

interface Store {
  running: Map<string, IRunningSession>;
  processes: Map<string, ChildProcess>;
  /** Per-session running buffer of assistant blocks for the in-flight turn.
   *  A reattaching client (user navigated away mid-stream and came back)
   *  fetches this snapshot via /api/sessions/[sid]/streaming-state and uses
   *  it to render the partial response without waiting for completion. */
  streamingBlocks: Map<string, ChatBlock[]>;
}

const g = globalThis as { __timoChatState?: Store };
const state: Store = g.__timoChatState ?? {
  running: new Map(),
  processes: new Map(),
  streamingBlocks: new Map(),
};
// Backfill — older globals from before some fields existed.
if (!state.processes) state.processes = new Map();
if (!state.streamingBlocks) state.streamingBlocks = new Map();
g.__timoChatState = state;

export function markRunning(input: { session_id: string; project_id: string; title: string }) {
  state.running.set(input.session_id, {
    session_id: input.session_id,
    project_id: input.project_id,
    title: input.title,
    started_at: Date.now(),
  });
  // Fresh buffer for this turn; clear any stale carryover.
  state.streamingBlocks.set(input.session_id, []);
}

export function markIdle(session_id: string) {
  state.running.delete(session_id);
  state.streamingBlocks.delete(session_id);
}

/** Append one delta block to the in-flight buffer for this session. */
export function appendStreamingBlock(session_id: string, block: ChatBlock) {
  const arr = state.streamingBlocks.get(session_id) ?? [];
  arr.push(block);
  state.streamingBlocks.set(session_id, arr);
}

/** Snapshot of all delta blocks emitted so far in the current turn. */
export function getStreamingBlocks(session_id: string): ChatBlock[] {
  return state.streamingBlocks.get(session_id) ?? [];
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

export type AgentType = 'claude' | 'gemini' | 'codex';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  agent_type: AgentType;
  created_at: string;
  updated_at: string;
}

export interface ITask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IExecution {
  id: string;
  task_id: string;
  agent_type: AgentType;
  status: ExecutionStatus;
  started_at: string;
  finished_at: string | null;
  final_text: string;
  error: string | null;
}

export interface IExecutionEvent {
  id: string;
  execution_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface IChatSession {
  id: string;
  project_id: string;
  title: string;
  /** Model override for this session. null → project default (opus for claude). */
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface IChatMessage {
  id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  /** JSON-encoded array of ChatBlock — assistant text + tool_use + tool_result blocks in order. */
  blocks_json: string;
  created_at: string;
}

export interface IAttachment {
  /** Absolute fs path (given to the CLI for Read). */
  path: string;
  /** Browser-accessible URL under /api/uploads/... */
  url: string;
  name: string;
  size: number;
  mime: string;
}

export type ChatBlock =
  | { kind: 'text'; content: string }
  | { kind: 'image'; url: string; name?: string; path?: string }
  | { kind: 'tool_use'; id?: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId?: string; content: string; isError?: boolean }
  | { kind: 'system'; content: string }
  | { kind: 'error'; content: string };

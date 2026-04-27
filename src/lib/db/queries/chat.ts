import { getDb } from '../index';
import { generateId } from '@/lib/utils/id';
import type { IChatSession, IChatMessage, ChatRole, ChatBlock } from '@/types';

export function getSessions(projectId: string): IChatSession[] {
  return getDb()
    .prepare(
      'SELECT * FROM chat_sessions WHERE project_id = ? ORDER BY updated_at DESC',
    )
    .all(projectId) as IChatSession[];
}

export function getSession(id: string): IChatSession | undefined {
  return getDb()
    .prepare('SELECT * FROM chat_sessions WHERE id = ?')
    .get(id) as IChatSession | undefined;
}

export function createSession(projectId: string, title = '새 대화'): IChatSession {
  const id = generateId();
  getDb()
    .prepare('INSERT INTO chat_sessions (id, project_id, title) VALUES (?, ?, ?)')
    .run(id, projectId, title);
  return getSession(id)!;
}

export function touchSession(id: string): void {
  getDb()
    .prepare(`UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`)
    .run(id);
}

export function renameSession(id: string, title: string): void {
  getDb()
    .prepare(`UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(title, id);
}

export function setSessionModel(id: string, model: string | null): void {
  getDb()
    .prepare(`UPDATE chat_sessions SET model = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(model, id);
}

export function setMessageSuggestions(messageId: string, suggestions: string[]): void {
  getDb()
    .prepare(`UPDATE chat_messages SET suggestions_json = ? WHERE id = ?`)
    .run(JSON.stringify(suggestions ?? []), messageId);
}

export function getLastAssistantMessage(sessionId: string): IChatMessage | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM chat_messages
       WHERE session_id = ? AND role = 'assistant'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(sessionId) as IChatMessage | undefined;
}

export function deleteSession(id: string): void {
  getDb().prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
}

export function getMessages(sessionId: string): IChatMessage[] {
  return getDb()
    .prepare(
      'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(sessionId) as IChatMessage[];
}

export function addMessage(input: {
  session_id: string;
  role: ChatRole;
  content: string;
  blocks?: ChatBlock[];
}): IChatMessage {
  const id = generateId();
  getDb()
    .prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, blocks_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.session_id,
      input.role,
      input.content,
      JSON.stringify(input.blocks ?? []),
    );
  touchSession(input.session_id);
  return getDb()
    .prepare('SELECT * FROM chat_messages WHERE id = ?')
    .get(id) as IChatMessage;
}

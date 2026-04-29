import { getDb } from './db';
import { generateId } from './utils/id';
import type { TaskStatus, TaskSource } from '@/types';

/**
 * Claude Code's TodoWrite tool emits input shaped like:
 *   { todos: [{ content: "...", status: "pending|in_progress|completed", activeForm: "..." }] }
 *
 * The system prompt instructs Claude that each TodoWrite is the **full current
 * state** for the project (not a delta), so this sync treats the incoming list
 * as authoritative for AI-tracked tasks:
 *   - matches existing AI tasks by normalized title and updates status
 *   - unmatched todos become new AI tasks
 *   - existing AI tasks NOT in the incoming list get pruned
 *   - tasks with source='user' (added manually via the panel) are never
 *     touched — they're invisible to AI sync, only the user can manage them
 */
interface TodoInput {
  content?: string;
  status?: string;
  activeForm?: string;
}

function mapStatus(s: string | undefined): TaskStatus {
  switch (s) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'running';
    default:
      return 'pending';
  }
}

/** Strip `[prefix] ` and collapse whitespace/case for loose matching. */
function normalize(title: string): string {
  return title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function syncTodos(projectId: string, todos: TodoInput[]): void {
  if (!todos) return;
  const db = getDb();

  const existing = db
    .prepare(
      'SELECT id, title, status, source, sort_order FROM tasks WHERE project_id = ?',
    )
    .all(projectId) as Array<{
      id: string;
      title: string;
      status: TaskStatus;
      source: TaskSource;
      sort_order: number;
    }>;

  // Only AI-tracked tasks participate in matching/pruning. User-added tasks
  // pass through untouched — even if a TodoWrite happens to title-collide.
  const aiTasks = existing.filter((t) => t.source === 'ai');

  const byExactTitle = new Map<string, (typeof aiTasks)[number]>();
  const byNormalized = new Map<string, (typeof aiTasks)[number]>();
  for (const t of aiTasks) {
    byExactTitle.set(t.title.trim(), t);
    const norm = normalize(t.title);
    if (norm && !byNormalized.has(norm)) byNormalized.set(norm, t);
  }

  const maxOrder = existing.reduce((m, t) => Math.max(m, t.sort_order), -1);
  let nextOrder = maxOrder + 1;

  const insert = db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, source, sort_order)
     VALUES (?, ?, ?, '', ?, 'ai', ?)`,
  );
  const update = db.prepare(
    `UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  const remove = db.prepare(`DELETE FROM tasks WHERE id = ?`);

  // Track which existing AI tasks the incoming TodoWrite still mentions; the
  // rest get pruned at the end of the transaction.
  const claimed = new Set<string>();

  db.transaction(() => {
    for (const todo of todos) {
      const title = (todo.content ?? '').trim();
      if (!title) continue;
      const status = mapStatus(todo.status);

      let match = byExactTitle.get(title);
      if (!match || claimed.has(match.id)) {
        const norm = normalize(title);
        const fuzzy = norm ? byNormalized.get(norm) : undefined;
        if (fuzzy && !claimed.has(fuzzy.id)) match = fuzzy;
        else match = undefined;
      }

      if (match) {
        claimed.add(match.id);
        if (match.status !== status) update.run(status, match.id);
      } else {
        insert.run(generateId(), projectId, title, status, nextOrder++);
      }
    }

    // Prune AI tasks no longer in the plan. If todos was empty we still skip
    // pruning, since an empty TodoWrite is more likely a glitch than an
    // intentional "wipe everything" signal.
    if (todos.length > 0) {
      for (const t of aiTasks) {
        if (!claimed.has(t.id)) remove.run(t.id);
      }
    }
  })();
}

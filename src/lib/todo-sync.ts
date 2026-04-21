import { getDb } from './db';
import { generateId } from './utils/id';
import type { TaskStatus } from '@/types';

/**
 * Claude Code's TodoWrite tool emits input shaped like:
 *   { todos: [{ content: "...", status: "pending|in_progress|completed", activeForm: "..." }] }
 *
 * We sync those into TIMO's `tasks` table on the given project, so that
 * the side panel shows the current working plan in real time.
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

/**
 * Reconciles the given todos with the project's tasks:
 *  - matches existing tasks by normalized title
 *  - unmatched todos are inserted
 *  - existing tasks not present in the current plan are left alone
 *    (we do NOT delete — user/AI may have pre-existing tasks from other flows)
 */
/** Strip `[prefix] ` and collapse whitespace/case for loose matching. */
function normalize(title: string): string {
  return title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function syncTodos(projectId: string, todos: TodoInput[]): void {
  if (!todos || todos.length === 0) return;
  const db = getDb();

  const existing = db
    .prepare(
      'SELECT id, title, status, sort_order FROM tasks WHERE project_id = ?',
    )
    .all(projectId) as Array<{ id: string; title: string; status: TaskStatus; sort_order: number }>;

  const byExactTitle = new Map<string, (typeof existing)[number]>();
  const byNormalized = new Map<string, (typeof existing)[number]>();
  for (const t of existing) {
    byExactTitle.set(t.title.trim(), t);
    const norm = normalize(t.title);
    // Prefer keeping the first match (task with lower sort_order usually wins)
    if (norm && !byNormalized.has(norm)) byNormalized.set(norm, t);
  }

  const maxOrder = existing.reduce((m, t) => Math.max(m, t.sort_order), -1);
  let nextOrder = maxOrder + 1;

  const insert = db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, sort_order)
     VALUES (?, ?, ?, '', ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  // Prevent double-matching in one sync batch (if two todos normalize to the same existing task,
  // only the first wins; the rest fall through to insert).
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
  })();
}

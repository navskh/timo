import { getDb } from '../index';
import { generateId } from '@/lib/utils/id';
import type { ITask, TaskStatus, TaskSource } from '@/types';

export function getTasksByProject(projectId: string): ITask[] {
  return getDb()
    .prepare(
      `SELECT * FROM tasks
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(projectId) as ITask[];
}

export function getTask(id: string): ITask | undefined {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(id) as ITask | undefined;
}

export function getNextPendingTask(projectId: string): ITask | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM tasks
       WHERE project_id = ? AND status = 'pending' AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC
       LIMIT 1`,
    )
    .get(projectId) as ITask | undefined;
}

export interface ITaskWithProject extends ITask {
  project_name: string;
}

/** Active tasks across every project. Used by the global todos overlay. */
export function getAllActiveTasks(): ITaskWithProject[] {
  return getDb()
    .prepare(
      `SELECT t.*, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.deleted_at IS NULL
       ORDER BY p.updated_at DESC, t.sort_order ASC, t.created_at ASC`,
    )
    .all() as ITaskWithProject[];
}

/** Soft-deleted tasks across every project. Drives 보관함 view. */
export function getArchivedTasks(): ITaskWithProject[] {
  return getDb()
    .prepare(
      `SELECT t.*, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.deleted_at IS NOT NULL
       ORDER BY t.deleted_at DESC`,
    )
    .all() as ITaskWithProject[];
}

export function createTask(input: {
  project_id: string;
  title: string;
  description?: string;
  source?: TaskSource;
}): ITask {
  const id = generateId();
  const maxOrder = getDb()
    .prepare('SELECT MAX(sort_order) as m FROM tasks WHERE project_id = ?')
    .get(input.project_id) as { m: number | null };
  const sortOrder = (maxOrder?.m ?? -1) + 1;

  getDb()
    .prepare(
      `INSERT INTO tasks (id, project_id, title, description, source, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.project_id,
      input.title,
      input.description ?? '',
      input.source ?? 'ai',
      sortOrder,
    );
  return getTask(id)!;
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  getDb()
    .prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, id);
}

export function updateTask(
  id: string,
  patch: Partial<Pick<ITask, 'title' | 'description' | 'status' | 'sort_order'>>,
): ITask | undefined {
  const current = getTask(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE tasks
       SET title = ?, description = ?, status = ?, sort_order = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(next.title, next.description, next.status, next.sort_order, id);
  return getTask(id);
}

/** Soft delete — moves to 보관함. Default delete behavior across the app. */
export function softDeleteTask(id: string): void {
  getDb()
    .prepare(`UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?`)
    .run(id);
}

/** Restore from 보관함 → active list. */
export function restoreTask(id: string): void {
  getDb()
    .prepare(`UPDATE tasks SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(id);
}

/** Hard delete — only callable from the 보관함 view; physically removes the row. */
export function hardDeleteTask(id: string): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

/** Backward-compatible alias. New callers should use softDeleteTask explicitly. */
export const deleteTask = softDeleteTask;

export function reorderTasks(projectId: string, orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE tasks SET sort_order = ?, updated_at = datetime('now')
     WHERE id = ? AND project_id = ?`,
  );
  db.transaction(() => {
    orderedIds.forEach((taskId, index) => {
      stmt.run(index, taskId, projectId);
    });
  })();
}

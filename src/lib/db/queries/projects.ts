import { getDb } from '../index';
import { generateId } from '@/lib/utils/id';
import type { IProject, AgentType } from '@/types';

export function getProjects(): IProject[] {
  return getDb()
    .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    .all() as IProject[];
}

export function getProject(id: string): IProject | undefined {
  return getDb()
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(id) as IProject | undefined;
}

export function createProject(input: {
  name: string;
  description?: string;
  project_path?: string | null;
  agent_type?: AgentType;
}): IProject {
  const id = generateId();
  getDb()
    .prepare(
      `INSERT INTO projects (id, name, description, project_path, agent_type)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description ?? '',
      input.project_path ?? null,
      input.agent_type ?? 'claude',
    );
  return getProject(id)!;
}

export function updateProject(
  id: string,
  patch: Partial<Pick<IProject, 'name' | 'description' | 'project_path' | 'agent_type'>>,
): IProject | undefined {
  const current = getProject(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE projects
       SET name = ?, description = ?, project_path = ?, agent_type = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(next.name, next.description, next.project_path, next.agent_type, id);
  return getProject(id);
}

export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

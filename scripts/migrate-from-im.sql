-- Migrate data from idea-manager (~/.idea-manager/data/im.db) into TIMO.
-- Run with:
--   sqlite3 ~/.timo/data/timo.db < scripts/migrate-from-im.sql
-- The TIMO dev server must be stopped (it holds the db file).

ATTACH DATABASE '/Users/young/.idea-manager/data/im.db' AS im;

BEGIN;

-- Wipe TIMO tables (CASCADE via FKs: deleting projects removes tasks/executions/events)
DELETE FROM execution_events;
DELETE FROM executions;
DELETE FROM tasks;
DELETE FROM projects;

-- Import projects (preserve ids)
INSERT INTO projects (id, name, description, project_path, agent_type, created_at, updated_at)
SELECT
  id,
  name,
  COALESCE(description, ''),
  project_path,
  CASE
    WHEN agent_type IN ('claude','gemini','codex') THEN agent_type
    ELSE 'claude'
  END,
  created_at,
  updated_at
FROM im.projects;

-- Import tasks (flatten sub_projects into title prefix, merge task_prompts into description)
INSERT INTO tasks (id, project_id, title, description, status, sort_order, created_at, updated_at)
SELECT
  t.id,
  t.project_id,
  CASE
    WHEN sp.name IS NOT NULL AND TRIM(sp.name) <> ''
      THEN '[' || sp.name || '] ' || t.title
    ELSE t.title
  END AS title,
  CASE
    WHEN tp.content IS NOT NULL AND TRIM(tp.content) <> ''
      THEN COALESCE(t.description, '') || char(10) || char(10) || '---' || char(10) || '## Prompt' || char(10) || char(10) || tp.content
    ELSE COALESCE(t.description, '')
  END AS description,
  CASE t.status
    WHEN 'done' THEN 'done'
    WHEN 'problem' THEN 'failed'
    ELSE 'pending'
  END AS status,
  t.sort_order,
  t.created_at,
  t.updated_at
FROM im.tasks t
LEFT JOIN im.sub_projects sp ON sp.id = t.sub_project_id
LEFT JOIN im.task_prompts tp ON tp.task_id = t.id
WHERE t.is_archived = 0;

COMMIT;

DETACH DATABASE im;

-- Report
SELECT 'projects' AS table_name, COUNT(*) AS rows FROM projects
UNION ALL SELECT 'tasks',     COUNT(*) FROM tasks
UNION ALL SELECT 'pending',   COUNT(*) FROM tasks WHERE status = 'pending'
UNION ALL SELECT 'done',      COUNT(*) FROM tasks WHERE status = 'done'
UNION ALL SELECT 'failed',    COUNT(*) FROM tasks WHERE status = 'failed';

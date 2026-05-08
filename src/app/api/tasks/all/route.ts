import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getAllActiveTasks, getArchivedTasks } from '@/lib/db/queries/tasks';

export const dynamic = 'force-dynamic';

/**
 * Active tasks across every project, plus a count of soft-deleted ones for
 * the 보관함 disclosure. Used by the global todos overlay (Cmd+Shift+T).
 */
export async function GET() {
  await ensureDb();
  return NextResponse.json({
    tasks: getAllActiveTasks(),
    archive_count: getArchivedTasks().length,
  });
}

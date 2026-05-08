import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getTask, restoreTask } from '@/lib/db/queries/tasks';

type Ctx = { params: Promise<{ taskId: string }> };

/** Restore a soft-deleted task from 보관함 back to its project's active list. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  restoreTask(taskId);
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ task });
}

import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import {
  getTask,
  updateTask,
  softDeleteTask,
  hardDeleteTask,
} from '@/lib/db/queries/tasks';

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  const patch = await req.json();
  const task = updateTask(taskId, patch);
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ task });
}

/**
 * Default DELETE soft-deletes (moves to 보관함). `?hard=1` is reserved for the
 * archive view's "영구 삭제" button — physically removes the row.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  const hard = req.nextUrl.searchParams.get('hard') === '1';
  if (hard) hardDeleteTask(taskId);
  else softDeleteTask(taskId);
  return NextResponse.json({ ok: true, mode: hard ? 'hard' : 'soft' });
}

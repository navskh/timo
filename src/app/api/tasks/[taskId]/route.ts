import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getTask, updateTask, deleteTask } from '@/lib/db/queries/tasks';

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

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  deleteTask(taskId);
  return NextResponse.json({ ok: true });
}

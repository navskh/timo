import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { reorderTasks, getTasksByProject } from '@/lib/db/queries/tasks';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Body: { orderedIds: string[] } — full or partial ordering of the project's tasks.
 * Tasks not present in the list keep their relative order at the tail.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  const body = await req.json();
  const orderedIds = Array.isArray(body?.orderedIds) ? (body.orderedIds as string[]) : null;
  if (!orderedIds) {
    return NextResponse.json({ error: 'orderedIds (string[]) required' }, { status: 400 });
  }

  const all = getTasksByProject(id);
  const given = new Set(orderedIds);
  const tail = all.filter((t) => !given.has(t.id)).map((t) => t.id);
  const finalOrder = [...orderedIds.filter((tid) => all.some((t) => t.id === tid)), ...tail];

  reorderTasks(id, finalOrder);
  return NextResponse.json({ ok: true, count: finalOrder.length });
}

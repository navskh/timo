import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getTasksByProject, createTask } from '@/lib/db/queries/tasks';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  return NextResponse.json({ tasks: getTasksByProject(id) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  const body = await req.json();
  if (!body?.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const task = createTask({
    project_id: id,
    title: body.title,
    description: body.description ?? '',
    // Direct add via the panel = user-owned. Sync won't prune it later.
    source: 'user',
  });
  return NextResponse.json({ task }, { status: 201 });
}

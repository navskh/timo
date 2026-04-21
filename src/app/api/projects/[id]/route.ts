import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getProject, updateProject, deleteProject } from '@/lib/db/queries/projects';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  const patch = await req.json();
  const project = updateProject(id, patch);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  deleteProject(id);
  return NextResponse.json({ ok: true });
}

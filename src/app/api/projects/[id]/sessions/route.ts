import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getSessions, createSession } from '@/lib/db/queries/chat';
import { getProject } from '@/lib/db/queries/projects';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  return NextResponse.json({ sessions: getSessions(id) });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  if (!getProject(id)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const session = createSession(id);
  return NextResponse.json({ session }, { status: 201 });
}

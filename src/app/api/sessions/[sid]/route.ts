import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import {
  getSession,
  renameSession,
  deleteSession,
  setSessionModel,
} from '@/lib/db/queries/chat';

type Ctx = { params: Promise<{ sid: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  const session = getSession(sid);
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ session });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  const body = await req.json();
  if (typeof body.title === 'string') renameSession(sid, body.title);
  if ('model' in body) {
    const next = body.model;
    if (next === null || next === '' || typeof next === 'string') {
      setSessionModel(sid, next || null);
    }
  }
  return NextResponse.json({ session: getSession(sid) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  deleteSession(sid);
  return NextResponse.json({ ok: true });
}

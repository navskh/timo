import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getSessions, createSession } from '@/lib/db/queries/chat';
import { getProject } from '@/lib/db/queries/projects';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Idempotent: return the project's most-recent session, creating one if none.
 * Safe against concurrent calls (React Strict Mode double-fires effects) because
 * the read-then-insert runs synchronously inside sql.js — Node's single-thread
 * event loop prevents interleaving between the list() and create() calls.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  if (!getProject(id)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  let sessions = getSessions(id);
  if (sessions.length === 0) {
    createSession(id);
    sessions = getSessions(id);
  }
  return NextResponse.json({ session: sessions[0], sessions });
}

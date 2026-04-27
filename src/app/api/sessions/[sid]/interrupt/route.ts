import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { interruptSession } from '@/lib/chat-state';

type Ctx = { params: Promise<{ sid: string }> };

/** Send SIGTERM to the running claude CLI for this session, if any. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  const killed = interruptSession(sid);
  return NextResponse.json({ killed });
}

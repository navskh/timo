import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getMessages } from '@/lib/db/queries/chat';

type Ctx = { params: Promise<{ sid: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  return NextResponse.json({ messages: getMessages(sid) });
}

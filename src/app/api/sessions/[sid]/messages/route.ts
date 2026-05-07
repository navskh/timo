import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getMessages, getArchivedCount } from '@/lib/db/queries/chat';

type Ctx = { params: Promise<{ sid: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  // ?include=archived — return everything (UI's "이전 대화 펼치기").
  // Default is non-archived only.
  const includeArchived = req.nextUrl.searchParams.get('include') === 'archived';
  return NextResponse.json({
    messages: getMessages(sid, { includeArchived }),
    archivedCount: includeArchived ? 0 : getArchivedCount(sid),
  });
}

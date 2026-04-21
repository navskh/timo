import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { stopLoop } from '@/lib/loop-runner';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  const stopped = stopLoop(id);
  return NextResponse.json({ stopped });
}

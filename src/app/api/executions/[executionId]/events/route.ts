import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getEvents } from '@/lib/db/queries/executions';

type Ctx = { params: Promise<{ executionId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { executionId } = await params;
  return NextResponse.json({ events: getEvents(executionId) });
}

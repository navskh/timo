import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { cancelExecution } from '@/lib/executor';

type Ctx = { params: Promise<{ executionId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { executionId } = await params;
  const cancelled = cancelExecution(executionId);
  return NextResponse.json({ cancelled });
}

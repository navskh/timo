import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getExecutionsByTask } from '@/lib/db/queries/executions';

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { taskId } = await params;
  return NextResponse.json({ executions: getExecutionsByTask(taskId) });
}

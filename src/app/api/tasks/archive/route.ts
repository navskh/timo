import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getArchivedTasks } from '@/lib/db/queries/tasks';

export const dynamic = 'force-dynamic';

/** Soft-deleted tasks (보관함). */
export async function GET() {
  await ensureDb();
  return NextResponse.json({ tasks: getArchivedTasks() });
}

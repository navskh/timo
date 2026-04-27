import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { tidyProjectTasks } from '@/lib/tidy-engine';

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { id } = await params;
  try {
    const result = await tidyProjectTasks(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { generateSuggestions } from '@/lib/suggest-engine';

type Ctx = { params: Promise<{ sid: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  try {
    const result = await generateSuggestions(sid);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, choices: [], suggestions: [] }, { status: 500 });
  }
}

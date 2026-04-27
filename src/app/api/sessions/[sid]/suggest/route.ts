import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { generateSuggestions } from '@/lib/suggest-engine';

type Ctx = { params: Promise<{ sid: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;
  try {
    const suggestions = await generateSuggestions(sid);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, suggestions: [] }, { status: 500 });
  }
}

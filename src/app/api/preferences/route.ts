import { NextResponse } from 'next/server';
import { readPreferences, updatePreferences, type IPreferences } from '@/lib/preferences';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(readPreferences());
}

export async function PUT(req: Request) {
  const patch = (await req.json()) as IPreferences;
  const merged = updatePreferences(patch);
  return NextResponse.json(merged);
}

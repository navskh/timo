import { NextResponse } from 'next/server';
import { readCreds, fetchLimits, ClaudeLimitsError } from '@/lib/claude-limits';

export async function GET() {
  const creds = readCreds();
  if (!creds) {
    return NextResponse.json({ configured: false });
  }
  try {
    const limits = await fetchLimits(creds);
    return NextResponse.json({ configured: true, limits, saved_at: creds.saved_at });
  } catch (err) {
    const status = err instanceof ClaudeLimitsError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ configured: true, error: message }, { status });
  }
}

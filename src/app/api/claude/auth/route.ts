import { NextRequest, NextResponse } from 'next/server';
import {
  readCreds,
  writeCreds,
  deleteCreds,
  fetchLimits,
  ClaudeLimitsError,
} from '@/lib/claude-limits';

export async function GET() {
  const creds = readCreds();
  if (!creds) return NextResponse.json({ connected: false });
  // Don't leak the session_key to the client — mask most of it.
  return NextResponse.json({
    connected: true,
    org_id: creds.org_id,
    session_key_preview: creds.session_key.slice(0, 6) + '…' + creds.session_key.slice(-4),
    saved_at: creds.saved_at,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const session_key = typeof body?.session_key === 'string' ? body.session_key.trim() : '';
  const org_id = typeof body?.org_id === 'string' ? body.org_id.trim() : '';
  if (!session_key || !org_id) {
    return NextResponse.json({ error: 'session_key와 org_id가 모두 필요합니다.' }, { status: 400 });
  }
  // Validate before saving.
  try {
    await fetchLimits({ session_key, org_id, saved_at: new Date().toISOString() });
  } catch (err) {
    const status = err instanceof ClaudeLimitsError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `검증 실패: ${message}` }, { status });
  }
  const saved = writeCreds(session_key, org_id);
  return NextResponse.json({
    connected: true,
    org_id: saved.org_id,
    session_key_preview: saved.session_key.slice(0, 6) + '…' + saved.session_key.slice(-4),
    saved_at: saved.saved_at,
  });
}

export async function DELETE() {
  const removed = deleteCreds();
  return NextResponse.json({ removed });
}

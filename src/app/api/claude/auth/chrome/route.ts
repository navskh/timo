import { NextResponse } from 'next/server';
import {
  writeCreds,
  fetchLimits,
  extractFromChrome,
  ClaudeLimitsError,
} from '@/lib/claude-limits';

export async function POST() {
  let extracted;
  try {
    extracted = await extractFromChrome();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await fetchLimits({
      session_key: extracted.session_key,
      org_id: extracted.org_id,
      saved_at: new Date().toISOString(),
    });
  } catch (err) {
    const status = err instanceof ClaudeLimitsError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `쿠키는 읽었지만 API 호출 실패: ${message}` }, { status });
  }

  const saved = writeCreds(extracted.session_key, extracted.org_id);
  return NextResponse.json({
    connected: true,
    org_id: saved.org_id,
    session_key_preview: saved.session_key.slice(0, 6) + '…' + saved.session_key.slice(-4),
    saved_at: saved.saved_at,
    source: 'chrome',
  });
}

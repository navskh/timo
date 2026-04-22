import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SESSION_FILE = path.join(os.homedir(), '.timo', 'claude-session.json');

export interface IClaudeCreds {
  session_key: string;
  org_id: string;
  saved_at: string;
}

interface Bucket {
  utilization: number | null;
  resets_at: string | null;
}

export interface IClaudeLimits {
  five_hour: Bucket;
  seven_day: Bucket;
  seven_day_sonnet: Bucket;
  /** Raw payload in case claude.ai adds fields. */
  raw: Record<string, unknown>;
}

/* ── File I/O (chmod 600 like the Python widget) ───────────────────────────── */

export function readCreds(): IClaudeCreds | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.session_key || !parsed.org_id) return null;
    return parsed as IClaudeCreds;
  } catch {
    return null;
  }
}

export function writeCreds(session_key: string, org_id: string): IClaudeCreds {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload: IClaudeCreds = {
    session_key,
    org_id,
    saved_at: new Date().toISOString(),
  };
  // Write atomically, then tighten permissions.
  const tmp = `${SESSION_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, SESSION_FILE);
  try { fs.chmodSync(SESSION_FILE, 0o600); } catch { /* best-effort */ }
  return payload;
}

export function deleteCreds(): boolean {
  if (!fs.existsSync(SESSION_FILE)) return false;
  fs.unlinkSync(SESSION_FILE);
  return true;
}

/* ── claude.ai usage API ────────────────────────────────────────────────────── */

export class ClaudeLimitsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function pickBucket(source: unknown): Bucket {
  if (!source || typeof source !== 'object') return { utilization: null, resets_at: null };
  const s = source as Record<string, unknown>;
  const util = typeof s.utilization === 'number' ? s.utilization : null;
  const reset = typeof s.resets_at === 'string' ? s.resets_at : null;
  return { utilization: util, resets_at: reset };
}

export async function fetchLimits(creds: IClaudeCreds): Promise<IClaudeLimits> {
  const url = `https://claude.ai/api/organizations/${encodeURIComponent(creds.org_id)}/usage`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://claude.ai/settings/usage',
      Origin: 'https://claude.ai',
      Cookie: `sessionKey=${creds.session_key}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ClaudeLimitsError(
      res.status === 401 || res.status === 403
        ? '세션이 만료됐거나 쿠키가 유효하지 않습니다.'
        : `claude.ai 응답 오류 ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    five_hour: pickBucket(data.five_hour),
    seven_day: pickBucket(data.seven_day),
    seven_day_sonnet: pickBucket(data.seven_day_sonnet),
    raw: data,
  };
}

/* ── Chrome cookie auto-extraction ─────────────────────────────────────────── */

export interface IChromeCookies {
  session_key: string;
  org_id: string;
}

export async function extractFromChrome(): Promise<IChromeCookies> {
  // Dynamic import — optional dep path, don't pull into non-Chrome code paths.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chromeCookies = require('chrome-cookies-secure');
  const cookies: Record<string, string> = await new Promise((resolve, reject) => {
    chromeCookies.getCookies(
      'https://claude.ai',
      'object',
      (err: Error | null, result: Record<string, string>) => {
        if (err) reject(err);
        else resolve(result);
      },
    );
  });
  const session_key = cookies.sessionKey;
  const org_id = cookies.lastActiveOrg;
  if (!session_key || !org_id) {
    throw new Error(
      'Chrome에서 claude.ai 쿠키를 찾지 못했어요. Chrome에 로그인되어 있는지 확인해주세요.',
    );
  }
  return { session_key, org_id };
}

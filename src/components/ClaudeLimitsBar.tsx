'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Bucket {
  utilization: number | null;
  resets_at: string | null;
}

interface LimitsResponse {
  configured: boolean;
  limits?: {
    five_hour: Bucket;
    seven_day: Bucket;
    seven_day_sonnet: Bucket;
  };
  error?: string;
}

function pctColor(p: number | null): string {
  if (p === null) return 'bg-[var(--surface-4)]';
  if (p >= 80) return 'bg-[var(--danger-soft)]';
  if (p >= 50) return 'bg-[var(--warning)]';
  return 'bg-[var(--success)]';
}

function timeUntil(iso: string | null): string {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.max(0, Math.round((target - now) / 1000));
  if (secs <= 0) return 'reset';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

export function ClaudeLimitsBar() {
  const [data, setData] = useState<LimitsResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'unconfigured' | 'error' | 'ok'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/claude/limits');
      const json = (await res.json()) as LimitsResponse;
      if (!json.configured) {
        setStatus('unconfigured');
        setData(null);
        return;
      }
      if (!res.ok || json.error) {
        setStatus('error');
        setErrorMsg(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
      setStatus('ok');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60 * 1000); // 1 minute
    const refresh = () => load();
    window.addEventListener('timo:refresh-claude-limits', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('timo:refresh-claude-limits', refresh);
    };
  }, [load]);

  if (status === 'unconfigured') {
    return (
      <div className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--fg-dim)]">
        <Link href="/settings" className="hover:text-[var(--accent-soft)] transition">
          ⚡ Claude 한도 연결 →
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="border-t border-[var(--border)] px-3 py-2 text-[11px] text-[var(--danger)]">
        <Link href="/settings" className="hover:underline" title={errorMsg}>
          ⚡ Claude 한도 오류 — 설정 열기
        </Link>
      </div>
    );
  }

  if (!data?.limits) {
    return (
      <div className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--fg-dim)] mono">
        ⚡ 한도 불러오는 중…
      </div>
    );
  }

  const { five_hour, seven_day, seven_day_sonnet } = data.limits;

  return (
    <Link
      href="/settings"
      className="block border-t border-[var(--border)] px-3 py-2 hover:bg-[var(--surface-2)] transition"
      title="클릭해서 설정 열기"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider">
          ⚡ Claude
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            load();
          }}
          className="text-[10px] text-[var(--fg-dim)] hover:text-[var(--accent-soft)]"
          title="새로고침"
        >
          ↻
        </button>
      </div>
      <div className="space-y-1">
        <LimitRow label="5H" bucket={five_hour} />
        <LimitRow label="7D" bucket={seven_day} />
        <LimitRow label="Sonnet" bucket={seven_day_sonnet} />
      </div>
    </Link>
  );
}

function LimitRow({ label, bucket }: { label: string; bucket: Bucket }) {
  const pct = bucket.utilization ?? null;
  const reset = timeUntil(bucket.resets_at);
  const ratio = pct !== null ? Math.min(Math.max(pct, 0), 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="mono w-[42px] text-[var(--fg-muted)] shrink-0">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full overflow-hidden bg-[var(--surface-4)]">
        <div
          className={`absolute inset-y-0 left-0 ${pctColor(pct)} transition-all`}
          style={{ width: `${ratio}%` }}
        />
      </div>
      <span className="mono w-[32px] text-right">
        {pct !== null ? `${Math.round(pct)}%` : '—'}
      </span>
      <span className="mono w-[32px] text-right text-[var(--fg-dim)]">{reset}</span>
    </div>
  );
}

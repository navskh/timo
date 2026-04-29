'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirm, toast } from '@/components/ui/dialogs';

interface AuthStatus {
  connected: boolean;
  org_id?: string;
  session_key_preview?: string;
  saved_at?: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState('');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/claude/auth');
    const data = (await r.json()) as AuthStatus;
    setStatus(data);
    setOrgId(data.org_id ?? '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionKey.trim() || !orgId.trim() || busy) return;
    setBusy(true);
    const res = await fetch('/api/claude/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_key: sessionKey.trim(), org_id: orgId.trim() }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? `HTTP ${res.status}`);
      return;
    }
    toast.success('연결됨! 사이드바에 한도가 표시됩니다.');
    setSessionKey('');
    await load();
    window.dispatchEvent(new Event('timo:refresh-claude-limits'));
  }

  async function tryChrome() {
    setBusy(true);
    const res = await fetch('/api/claude/auth/chrome', { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? 'Chrome 쿠키 추출 실패');
      return;
    }
    toast.success('Chrome에서 자동 연결됐어요!');
    await load();
    window.dispatchEvent(new Event('timo:refresh-claude-limits'));
  }

  async function disconnect() {
    const ok = await confirm({
      title: 'Claude 연결 끊기',
      message: '저장된 sessionKey 파일이 즉시 삭제됩니다. 다시 연결하려면 쿠키 재입력이 필요해요.',
      confirmText: '연결 끊기',
      danger: true,
    });
    if (!ok) return;
    await fetch('/api/claude/auth', { method: 'DELETE' });
    toast.success('Claude 연결이 해제되었어요');
    await load();
    window.dispatchEvent(new Event('timo:refresh-claude-limits'));
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">설정</h1>
          <p className="text-[var(--fg-muted)] mt-1 text-sm">
            Claude 구독 한도를 TIMO 사이드바에 표시하도록 연결합니다.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-3 text-[var(--fg-muted)] uppercase tracking-wider">
            ⚡ Claude 한도 연동
          </h2>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
            {loading ? (
              <p className="text-sm text-[var(--fg-dim)]">로딩…</p>
            ) : status?.connected ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex w-2 h-2 rounded-full bg-[var(--success)]" />
                  <span className="text-sm font-medium">연결됨</span>
                </div>
                <div className="text-xs text-[var(--fg-muted)] space-y-1 mono mb-4">
                  <div>org_id: {status.org_id}</div>
                  <div>sessionKey: {status.session_key_preview}</div>
                  {status.saved_at && <div>saved: {new Date(status.saved_at).toLocaleString()}</div>}
                </div>
                <button
                  onClick={disconnect}
                  className="px-3 py-1.5 text-xs rounded border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)]"
                >
                  연결 끊기
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--fg-muted)]">
                아직 연결 안 됨. 아래 두 방법 중 하나로 연결해주세요.
              </p>
            )}
          </div>
        </section>

        {/* Chrome auto */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold mb-2">방법 1: Chrome 쿠키 자동 가져오기 (권장)</h3>
          <p className="text-xs text-[var(--fg-muted)] mb-3">
            Chrome에 <code className="mono bg-[var(--surface-3)] px-1 rounded">claude.ai</code>로 로그인되어 있으면 자동으로 쿠키를 읽어옵니다. macOS는 Keychain 접근 권한 프롬프트가 뜰 수 있어요.
          </p>
          <button
            onClick={tryChrome}
            disabled={busy}
            className="px-4 py-2 text-sm rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 font-medium"
          >
            {busy ? '시도 중…' : 'Chrome에서 자동 연결'}
          </button>
        </section>

        {/* Manual */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold mb-2">방법 2: 수동 입력</h3>
          <p className="text-xs text-[var(--fg-muted)] mb-3">
            Chrome DevTools(F12) &gt; Application &gt; Cookies &gt; <code className="mono">https://claude.ai</code>에서 <code className="mono">sessionKey</code>와 <code className="mono">lastActiveOrg</code>를 복사해 붙여넣으세요.
          </p>
          <form onSubmit={saveManual} className="space-y-3">
            <Field label="Organization ID (lastActiveOrg 쿠키 값)">
              <input
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="a1b2c3d4-..."
                className="input mono"
              />
            </Field>
            <Field label="Session Key (sessionKey 쿠키 값)">
              <input
                type="password"
                value={sessionKey}
                onChange={(e) => setSessionKey(e.target.value)}
                placeholder="sk-ant-sid01-..."
                className="input mono"
              />
            </Field>
            <button
              type="submit"
              disabled={busy || !sessionKey.trim() || !orgId.trim()}
              className="px-4 py-2 text-sm rounded bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] disabled:opacity-40 font-medium"
            >
              {busy ? '확인 중…' : '저장 및 연결'}
            </button>
          </form>
        </section>

        <p className="text-[11px] text-[var(--fg-dim)] mt-8 leading-relaxed">
          🔒 sessionKey는 로컬 <code className="mono">~/.timo/claude-session.json</code>에 chmod 600으로 저장되며 TIMO 서버에서만 사용됩니다. <code className="mono">claude.ai</code>의 비공개 API를 호출하므로 claude.ai 정책/엔드포인트 변경 시 동작이 멈출 수 있어요. 연결 끊기를 누르면 파일이 즉시 삭제됩니다.
        </p>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.7rem;
          background: var(--surface-1);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.85rem;
          outline: none;
          color: inherit;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: var(--accent);
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] text-[var(--fg-muted)] mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}

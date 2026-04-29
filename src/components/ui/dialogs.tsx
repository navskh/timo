'use client';

import { useEffect, useState, useCallback } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * Confirm — imperative singleton with React host
 * ──────────────────────────────────────────────────────────────────────────── */

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Red-tinted confirm button for destructive actions. */
  danger?: boolean;
};

type ConfirmState = (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;

let confirmState: ConfirmState = null;
const confirmListeners = new Set<(s: ConfirmState) => void>();

function emitConfirm() {
  for (const l of confirmListeners) l(confirmState);
}

export function confirm(opts: ConfirmOptions | string): Promise<boolean> {
  const options = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise((resolve) => {
    // If one is already open, resolve the old one as cancelled.
    if (confirmState) confirmState.resolve(false);
    confirmState = { ...options, resolve };
    emitConfirm();
  });
}

function resolveConfirm(ok: boolean) {
  if (!confirmState) return;
  const r = confirmState.resolve;
  confirmState = null;
  emitConfirm();
  r(ok);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Toast — imperative singleton
 * ──────────────────────────────────────────────────────────────────────────── */

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss timeout in ms. 0 = sticky. */
  duration: number;
};

let toastId = 0;
let toasts: Toast[] = [];
const toastListeners = new Set<(ts: Toast[]) => void>();

function emitToasts() {
  const snapshot = toasts.slice();
  for (const l of toastListeners) l(snapshot);
}

function pushToast(kind: ToastKind, message: string, duration = 4000): number {
  const id = ++toastId;
  toasts = [...toasts, { id, kind, message, duration }];
  emitToasts();
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export const toast = {
  success: (message: string, duration?: number) => pushToast('success', message, duration ?? 4000),
  error: (message: string, duration?: number) => pushToast('error', message, duration ?? 6000),
  info: (message: string, duration?: number) => pushToast('info', message, duration ?? 4000),
};

/* ────────────────────────────────────────────────────────────────────────────
 * DialogHost — mount once in root layout
 * ──────────────────────────────────────────────────────────────────────────── */

export function DialogHost() {
  const [confirmS, setConfirmS] = useState<ConfirmState>(confirmState);
  const [toastsS, setToastsS] = useState<Toast[]>(toasts);

  useEffect(() => {
    const cl = (s: ConfirmState) => setConfirmS(s);
    confirmListeners.add(cl);
    const tl = (ts: Toast[]) => setToastsS(ts);
    toastListeners.add(tl);
    return () => {
      confirmListeners.delete(cl);
      toastListeners.delete(tl);
    };
  }, []);

  // Esc closes the confirm as cancel
  useEffect(() => {
    if (!confirmS) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveConfirm(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        resolveConfirm(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmS]);

  return (
    <>
      {confirmS && <ConfirmModal state={confirmS} />}
      <ToastStack toasts={toastsS} />
    </>
  );
}

function ConfirmModal({ state }: { state: NonNullable<ConfirmState> }) {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={() => resolveConfirm(false)}
    >
      <div
        className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl w-[440px] max-w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold">{state.title ?? '확인'}</h2>
        </div>
        <div className="px-5 py-5 text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
          {state.message}
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={() => resolveConfirm(false)}
            className="px-3 py-1.5 text-sm rounded-md border border-[var(--border)] hover:bg-[var(--surface-3)]"
          >
            {state.cancelText ?? '취소'}
          </button>
          <button
            autoFocus
            onClick={() => resolveConfirm(true)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium ${
              state.danger
                ? 'bg-[var(--danger)] hover:bg-[var(--danger-soft)] text-white'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)]'
            }`}
          >
            {state.confirmText ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const dismiss = useCallback(() => dismissToast(t.id), [t.id]);
  const style = {
    success: {
      bar: 'bg-[var(--success)]',
      border: 'border-[var(--success-border)]',
      icon: '✓',
      iconCls: 'text-[var(--success)]',
    },
    error: {
      bar: 'bg-[var(--danger-soft)]',
      border: 'border-[var(--danger-border)]',
      icon: '⚠',
      iconCls: 'text-[var(--danger)]',
    },
    info: {
      bar: 'bg-[var(--accent)]',
      border: 'border-[var(--accent-border)]',
      icon: 'ℹ',
      iconCls: 'text-[var(--accent-soft)]',
    },
  }[t.kind];
  return (
    <div
      role="status"
      onClick={dismiss}
      className={`pointer-events-auto cursor-pointer flex items-stretch gap-0 max-w-[360px] rounded-lg border ${style.border} bg-[var(--surface-2)] shadow-xl overflow-hidden animate-[toast-in_0.18s_ease-out]`}
    >
      <div className={`w-1 ${style.bar}`} />
      <div className="flex-1 px-3 py-2.5 flex items-start gap-2">
        <span className={`mt-0.5 text-sm ${style.iconCls}`}>{style.icon}</span>
        <p className="flex-1 text-[13px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">{t.message}</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="text-[var(--fg-dim)] hover:text-[var(--foreground)] text-xs shrink-0"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <style jsx>{`
        @keyframes toast-in {
          from { transform: translateX(16px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

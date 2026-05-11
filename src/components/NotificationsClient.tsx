'use client';

import { useEffect, useRef } from 'react';

/**
 * Fires a native OS notification when an assistant turn finishes in a session
 * the user isn't currently watching.
 *
 * Path A (Tauri production): use @tauri-apps/plugin-notification so macOS
 *   registers TIMO under 시스템 설정 → 알림 and the bundle id receives focus
 *   on click. The web Notification API alone in Tauri 2's WebKit doesn't
 *   surface to the notification center.
 *
 * Path B (dev browser, or older builds without the plugin): fall back to the
 *   browser's `Notification` constructor.
 *
 * Suppression rules either way: silent when the window is focused AND the
 *   URL ?s= matches the finished session.
 */
export function NotificationsClient() {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    let send: (title: string, body: string, sid: string) => void = () => { /* no-op */ };

    async function setupTauri() {
      try {
        const mod = await import('@tauri-apps/plugin-notification');
        let granted = await mod.isPermissionGranted();
        if (!granted) {
          const next = await mod.requestPermission();
          granted = next === 'granted';
        }
        if (!granted) return;
        send = (title, body) => {
          // Tauri's sendNotification doesn't expose a click callback — the OS
          // will focus the bundle on click via app-level routing. We rely on
          // the user clicking back into TIMO; no extra wiring required.
          mod.sendNotification({ title, body });
        };
      } catch (err) {
        // Plugin not available (older build) — silently fall back to web API.
        // eslint-disable-next-line no-console
        console.warn('[NotificationsClient] tauri plugin unavailable, falling back', err);
        setupWeb();
      }
    }

    function setupWeb() {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { /* user dismissed */ });
      }
      send = (title, body, sid) => {
        if (Notification.permission !== 'granted') return;
        const n = new Notification(title, {
          body,
          icon: '/icon.svg',
          tag: `timo-session-${sid}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      };
    }

    if (isTauri) void setupTauri();
    else setupWeb();

    const onFinished = (e: Event) => {
      const detail = (e as CustomEvent<{
        session_id?: string;
        project_id?: string;
        title?: string;
      }>).detail;
      if (!detail?.session_id) return;

      const urlSid = new URL(window.location.href).searchParams.get('s');
      const focused =
        typeof document !== 'undefined' && !document.hidden && document.hasFocus();
      if (focused && urlSid === detail.session_id) return;

      send(
        'TIMO 응답 완료',
        detail.title || '대화에서 응답이 완료되었습니다.',
        detail.session_id,
      );
    };
    window.addEventListener('timo:session-finished', onFinished);
    return () => window.removeEventListener('timo:session-finished', onFinished);
  }, []);

  return null;
}

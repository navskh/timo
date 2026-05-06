'use client';

import { useEffect, useRef } from 'react';

/**
 * Fires a native OS notification when an assistant turn finishes in a session
 * the user isn't currently watching. Hooks into the `timo:session-finished`
 * event that AppSidebar's polling already dispatches.
 *
 * Suppression rules:
 *  - Window is focused AND the URL ?s= matches the finished session → silent
 *    (user is already looking at the result).
 *  - Permission not granted → silent (we ask once on mount; user can grant
 *    later via OS settings).
 *
 * Click on the notification focuses the window and navigates to that
 * session's URL via a soft history change so React Router picks it up.
 */
export function NotificationsClient() {
  const requestedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    // Ask for permission once. Browsers allow requestPermission() at any time
    // in modern Chromium/WebKit, no user-gesture dance needed.
    if (Notification.permission === 'default' && !requestedRef.current) {
      requestedRef.current = true;
      Notification.requestPermission().catch(() => { /* user dismissed */ });
    }

    const onFinished = (e: Event) => {
      const detail = (e as CustomEvent<{
        session_id?: string;
        project_id?: string;
        title?: string;
      }>).detail;
      if (!detail?.session_id) return;
      if (Notification.permission !== 'granted') return;

      // Don't notify if the user is already looking at this session.
      const urlSid = new URL(window.location.href).searchParams.get('s');
      const focused = typeof document !== 'undefined' && !document.hidden && document.hasFocus();
      if (focused && urlSid === detail.session_id) return;

      const n = new Notification('TIMO 응답 완료', {
        body: detail.title || '대화에서 응답이 완료되었습니다.',
        icon: '/icon.svg',
        // tag dedupes — a second finish for the same session replaces the
        // existing notification instead of stacking another one.
        tag: `timo-session-${detail.session_id}`,
      });

      n.onclick = () => {
        window.focus();
        if (detail.project_id) {
          // Use history.pushState + popstate so Next router intercepts and
          // navigates without a full page reload.
          const target = `/projects/${detail.project_id}?s=${detail.session_id}`;
          window.history.pushState({}, '', target);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        n.close();
      };
    };

    window.addEventListener('timo:session-finished', onFinished);
    return () => window.removeEventListener('timo:session-finished', onFinished);
  }, []);

  return null;
}

'use client';

import { useEffect } from 'react';
import { checkUpdate, installUpdate, isTauri } from '@/lib/tauri-updater';
import { confirm, toast } from './ui/dialogs';

/**
 * Mounted once at the root layout. On startup (Tauri only) it asks the Rust
 * updater whether a newer release is published; if so it surfaces a confirm
 * dialog and, on user consent, kicks off download + install + restart.
 *
 * Runs in plain browsers as a no-op so `npm run dev` outside Tauri stays
 * silent.
 */
export function UpdaterClient() {
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    (async () => {
      const result = await checkUpdate();
      if (cancelled || !result?.available) return;

      const ok = await confirm({
        title: '업데이트 가능',
        message: `TIMO v${result.version}이 나왔어요.\n현재 버전: v${result.current_version}\n\n지금 설치하고 재시작할까요?`,
        confirmText: '설치 + 재시작',
        cancelText: '나중에',
      });
      if (!ok) return;

      toast.info('업데이트 다운로드 중… 끝나면 자동 재시작돼요.', 0);
      try {
        await installUpdate();
        // installUpdate triggers app.restart() in Rust — control never returns
        // on success. If we're here, it failed to install but the toast above
        // is still up; let the error toast take over.
      } catch (err) {
        toast.error(`업데이트 설치 실패: ${err instanceof Error ? err.message : String(err)}`, 8000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

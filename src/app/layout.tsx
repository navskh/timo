import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';
import { DialogHost } from '@/components/ui/dialogs';
import { UpdaterClient } from '@/components/UpdaterClient';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { DEFAULT_THEME_ID, getThemeById } from '@/lib/theme/themes';
import { readPreferences } from '@/lib/preferences';

// Tauri spawns the Next sidecar on a fresh ephemeral port every launch, so
// browser-origin storage (localStorage / cookies) gets wiped between sessions.
// The active theme lives in ~/.timo/data/preferences.json instead, and we
// read it server-side here so the very first paint already has the right
// `data-theme` attribute — no boot script, no FOUC.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TIMO — Think · Idea-Manager · Operation',
  description: 'Local-first AI executor. Brain dump → tasks → auto-run loop.',
  applicationName: 'TIMO',
  appleWebApp: {
    capable: true,
    title: 'TIMO',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeId = getThemeById(readPreferences().theme ?? DEFAULT_THEME_ID).id;
  return (
    <html lang="ko" data-theme={themeId}>
      <body>
        <ThemeProvider>
          <div className="flex h-screen overflow-hidden">
            <Suspense fallback={<aside className="w-[260px] shrink-0 border-r border-[var(--border)]" />}>
              <AppSidebar />
            </Suspense>
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">{children}</div>
          </div>
          <DialogHost />
          <UpdaterClient />
        </ThemeProvider>
      </body>
    </html>
  );
}

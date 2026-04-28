import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';
import { DialogHost } from '@/components/ui/dialogs';
import { UpdaterClient } from '@/components/UpdaterClient';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { THEME_STORAGE_KEY, DEFAULT_THEME_ID } from '@/lib/theme/themes';

// Inline pre-hydration script: read saved theme from localStorage and stamp
// `data-theme` on <html> before React mounts. Without this, the first paint
// would always be the default theme and then "flash" into the saved one.
const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||${JSON.stringify(DEFAULT_THEME_ID)};document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

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
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
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

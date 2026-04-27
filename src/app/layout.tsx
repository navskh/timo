import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';
import { DialogHost } from '@/components/ui/dialogs';
import { UpdaterClient } from '@/components/UpdaterClient';

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
      <body>
        <div className="flex h-screen overflow-hidden">
          <Suspense fallback={<aside className="w-[260px] shrink-0 border-r border-[var(--border)]" />}>
            <AppSidebar />
          </Suspense>
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">{children}</div>
        </div>
        <DialogHost />
        <UpdaterClient />
      </body>
    </html>
  );
}

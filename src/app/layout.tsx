import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AppSidebar } from '@/components/AppSidebar';

export const metadata: Metadata = {
  title: 'TIMO — Think · Idea-Manager · Operation',
  description: 'Local-first AI executor. Brain dump → tasks → auto-run loop.',
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
      </body>
    </html>
  );
}

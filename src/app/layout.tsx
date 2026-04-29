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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://navskh.github.io/timo';
const SITE_TITLE = 'TIMO — Think · Idea-Manager · Operation';
const SITE_DESCRIPTION =
  'Local-first AI pair-programmer. Spawn your Claude Code, Gemini, or Codex CLI, chat like usual, and let TIMO auto-track tasks and run them in an organic loop. Successor to idea-manager (im.v2).';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s · TIMO',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'TIMO',
  generator: 'Next.js',
  category: 'productivity',
  keywords: [
    'TIMO',
    'idea manager',
    'idea-manager',
    'im.v2',
    'AI agent',
    'autonomous agent',
    'agent loop',
    'Claude Code',
    'Claude CLI',
    'Gemini CLI',
    'Codex CLI',
    'AI pair programmer',
    'local-first',
    'task runner',
    'task executor',
    'AI executor',
    'developer tools',
    'productivity',
    'Tauri',
    'Next.js',
    'TypeScript',
    'SQLite',
  ],
  authors: [{ name: 'navskh', url: 'https://github.com/navskh' }],
  creator: 'navskh',
  publisher: 'navskh',
  appleWebApp: {
    capable: true,
    title: 'TIMO',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, email: false, address: false },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    siteName: 'TIMO',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'ko_KR',
    alternateLocale: ['en_US'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: '@navskh',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  referrer: 'origin-when-cross-origin',
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

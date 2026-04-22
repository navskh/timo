import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TIMO — Think · Idea-Manager · Operation',
    short_name: 'TIMO',
    description: 'Local-first AI pair-programmer. Chat like Claude Code, auto-tracked tasks.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a0a0c',
    theme_color: '#8b5cf6',
    lang: 'ko',
    categories: ['productivity', 'developer', 'utilities'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

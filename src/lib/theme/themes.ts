// Theme metadata. Actual color tokens live in globals.css under
// `[data-theme="<id>"]` selectors — this file just describes the available
// themes for the picker UI (id, label, swatch colors).

export interface ITheme {
  id: string;
  name: string;
  emoji: string;
  scheme: 'dark' | 'light';
  swatch: {
    bg: string;
    surface: string;
    accent: string;
  };
}

export const themes: ITheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    emoji: '🌌',
    scheme: 'dark',
    swatch: { bg: '#0a0a0c', surface: '#1c1c22', accent: '#8b5cf6' },
  },
  {
    id: 'slate',
    name: 'Slate',
    emoji: '☀️',
    scheme: 'light',
    swatch: { bg: '#f5f6f8', surface: '#e3e6eb', accent: '#6d4cd1' },
  },
  {
    id: 'nord',
    name: 'Nord',
    emoji: '❄️',
    scheme: 'dark',
    swatch: { bg: '#2e3440', surface: '#434c5e', accent: '#88c0d0' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    scheme: 'dark',
    swatch: { bg: '#06141f', surface: '#163450', accent: '#22d3ee' },
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌲',
    scheme: 'dark',
    swatch: { bg: '#0a1410', surface: '#1d3a2c', accent: '#34d399' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    emoji: '🌅',
    scheme: 'dark',
    swatch: { bg: '#14080c', surface: '#381c22', accent: '#fb923c' },
  },
  {
    id: 'rose',
    name: 'Rose',
    emoji: '🌷',
    scheme: 'dark',
    swatch: { bg: '#160a14', surface: '#3a1d31', accent: '#f472b6' },
  },
  {
    id: 'mono',
    name: 'Mono',
    emoji: '◐',
    scheme: 'dark',
    swatch: { bg: '#0a0a0a', surface: '#1f1f1f', accent: '#e5e5e5' },
  },
];

export const DEFAULT_THEME_ID = 'midnight';

export function getThemeById(id: string | null | undefined): ITheme {
  return themes.find((t) => t.id === id) ?? themes[0];
}

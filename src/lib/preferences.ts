import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from './utils/paths';

/**
 * App-wide preferences persisted to ~/.timo/data/preferences.json so they
 * survive across launches. localStorage isn't reliable here: Tauri spawns the
 * Next.js sidecar on a fresh ephemeral port every restart, which changes the
 * webview origin and wipes localStorage with it.
 */

export interface IPreferences {
  theme?: string;
}

function getPreferencesPath(): string {
  return path.join(getDataDir(), 'preferences.json');
}

export function readPreferences(): IPreferences {
  try {
    const raw = fs.readFileSync(getPreferencesPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as IPreferences) : {};
  } catch {
    return {};
  }
}

export function updatePreferences(patch: IPreferences): IPreferences {
  const current = readPreferences();
  const merged: IPreferences = { ...current, ...patch };
  const filePath = getPreferencesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return merged;
}

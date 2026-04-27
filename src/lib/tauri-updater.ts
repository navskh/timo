/**
 * Frontend wrapper for the Tauri update commands defined in src-tauri/src/lib.rs.
 *
 * - `isTauri()` lets layout code skip update flows when running under a plain
 *   browser (the `npm run dev` use case for non-packaged work).
 * - `checkUpdate()` probes the updater endpoint without downloading.
 * - `installUpdate()` downloads + applies the update and restarts the app
 *   (the call never returns on success because Tauri replaces the process).
 */

import { invoke } from '@tauri-apps/api/core';

export interface IUpdateCheck {
  available: boolean;
  current_version: string;
  version: string;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function checkUpdate(): Promise<IUpdateCheck | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<IUpdateCheck>('check_update');
  } catch (err) {
    console.warn('[updater] check failed:', err);
    return null;
  }
}

export async function installUpdate(): Promise<void> {
  if (!isTauri()) throw new Error('not running under Tauri');
  await invoke('install_update');
}

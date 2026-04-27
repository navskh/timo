import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let cached: string | null = null;

/**
 * Resolve a PATH string suitable for spawning user CLIs (claude/gemini/codex)
 * from contexts that don't inherit the user's shell environment.
 *
 * macOS GUI apps — and our Tauri-bundled sidecar by extension — are launched
 * by launchd with a minimal `/usr/bin:/bin:/usr/sbin:/sbin` PATH. Tools
 * installed via Homebrew, npm -g, or `~/.claude/local` aren't reachable, so
 * `spawn('claude')` fails with ENOENT even though the same command works
 * from the user's terminal.
 *
 * Strategy:
 *   1. Ask the user's login shell for its PATH (`$SHELL -ilc 'echo $PATH'`).
 *      This sources .zshrc / .zprofile / .bashrc / .bash_profile and gives
 *      us whatever the user actually has on PATH in their terminal.
 *   2. Prepend a few well-known install locations as a belt-and-suspenders
 *      fallback in case the user's rc files don't add them.
 *
 * The result is cached for the lifetime of the process — the shell is
 * relatively expensive to spawn and the PATH doesn't change while we run.
 *
 * Windows is a no-op: explorer.exe-launched processes inherit the system
 * PATH that already contains globally-installed CLIs.
 */
export function resolveShellPath(): string {
  if (cached !== null) return cached;

  if (process.platform === 'win32') {
    cached = process.env.PATH ?? '';
    return cached;
  }

  const home = os.homedir();
  const fallbacks = [
    path.join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, 'bin'),
    '/usr/bin',
    '/bin',
  ];

  let shellPath = process.env.PATH ?? '';
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    // Wrap PATH in sentinels so .zshrc/.bashrc chatter (oh-my-zsh banners,
    // fortune, neofetch, etc.) doesn't end up parsed as path entries.
    const cmd = 'echo "__TIMO_PATH_BEGIN__"; printf %s "$PATH"; echo "__TIMO_PATH_END__"';
    const out = execFileSync(shell, ['-ilc', cmd], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/__TIMO_PATH_BEGIN__\s*\n([\s\S]*?)\n__TIMO_PATH_END__/);
    const extracted = m?.[1].trim();
    if (extracted) shellPath = extracted;
  } catch {
    // Login shell unavailable (no SHELL, or shell rc errors) — fall back
    // to whatever PATH we inherited plus the well-known locations below.
  }

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of [...fallbacks, ...shellPath.split(path.delimiter)]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    merged.push(p);
  }
  cached = merged.join(path.delimiter);
  return cached;
}

/**
 * Hunt for `binary` (e.g. "claude") on disk and return an absolute path if
 * found. We don't trust spawn() to resolve via $PATH alone because:
 *  - launchd-spawned macOS GUI processes get a minimal PATH;
 *  - even with resolveShellPath() above, edge cases (rc errors, sentinel
 *    parsing fails) leave us with a PATH that doesn't include the user's
 *    install location.
 *
 * Checking existsSync against well-known dirs (plus whatever directories
 * we managed to learn about) is cheap and deterministic. Returns `null`
 * if nothing matched — callers should still try spawn() with the bare
 * binary name as a final fallback.
 */
export function findExecutable(binary: string): string | null {
  if (process.platform === 'win32') {
    // Skip — Windows resolution rules are different (PATHEXT, etc.) and
    // its GUI processes already have a sane PATH.
    return null;
  }
  const home = os.homedir();
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    ...resolveShellPath().split(path.delimiter),
  ];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const candidate = path.join(dir, binary);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Just the directory list we'd search — handy for diagnostic error messages. */
export function searchDirs(): string[] {
  if (process.platform === 'win32') return [];
  const home = os.homedir();
  const dirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    ...resolveShellPath().split(path.delimiter),
  ];
  return [...new Set(dirs.filter(Boolean))];
}

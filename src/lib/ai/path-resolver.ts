import { execFileSync } from 'node:child_process';
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

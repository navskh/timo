import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AGENTS } from './agents';
import { resolveShellPath, findExecutable, searchDirs } from './path-resolver';
import type { AgentType } from '@/types';

export type OnTextChunk = (text: string) => void;
export type OnRawEvent = (event: Record<string, unknown>) => void;

export interface RunAgentOptions {
  cwd?: string;
  timeoutMs?: number;
  model?: string;
  /** Cap the CLI's max-turns (Claude). Useful for single-shot judgments. */
  maxTurns?: number;
  /** Optional hook to capture the spawned process so callers can cancel. */
  onSpawn?: (proc: ChildProcess) => void;
}

/**
 * Spawn an AI CLI agent and collect the result text.
 * Optional callbacks receive streaming text chunks and raw NDJSON events.
 */
export function runAgent(
  agentType: AgentType,
  prompt: string,
  onText?: OnTextChunk,
  onRawEvent?: OnRawEvent,
  options?: RunAgentOptions,
): Promise<string> {
  const config = AGENTS[agentType];
  if (!config) {
    return Promise.reject(new Error(`Unknown agent type: ${agentType}`));
  }

  return new Promise((resolve, reject) => {
    const useStreamJson = !!(onText || onRawEvent);
    const args = config.buildArgs({ streaming: useStreamJson, model: options?.model, maxTurns: options?.maxTurns });
    const env = config.buildEnv();
    // GUI-launched processes (Tauri sidecar on macOS) get launchd's bare PATH
    // and miss the user's claude/gemini/codex install. Augment from the user
    // shell so spawn() can resolve the binary the same as in the terminal.
    env.PATH = resolveShellPath();

    // Belt + suspenders: resolve to an absolute path ourselves before spawn.
    // resolveShellPath above can fail in edge cases (sentinel match miss,
    // shell rc errors) and leave the PATH still missing the user's install
    // dir. existsSync over a known list is deterministic.
    const resolvedBinary = findExecutable(config.binary) ?? config.binary;

    const requestedCwd = options?.cwd;
    const effectiveCwd = requestedCwd && existsSync(requestedCwd) ? requestedCwd : process.cwd();

    const proc = spawn(resolvedBinary, args, {
      cwd: effectiveCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
      env,
    });

    options?.onSpawn?.(proc);

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    if (options?.timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, options.timeoutMs);
    }

    proc.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Surface the dirs we tried so users can paste the message into an
        // issue. With this they don't have to debug the GUI app blindly.
        const dirs = searchDirs().slice(0, 8).join('\n  ');
        reject(
          new Error(
            `${config.name} CLI (${config.binary}) not found. Tried these directories:\n  ${dirs}\n\nIf your install is elsewhere, add it to your shell PATH (.zshrc / .zprofile) and reopen the app.`,
          ),
        );
      } else {
        reject(new Error(`${config.name} CLI error: ${err.message}`));
      }
    });

    try {
      proc.stdin?.write(prompt, 'utf8');
      proc.stdin?.end();
    } catch (err) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      reject(new Error(`Failed to pipe prompt to ${config.name}: ${(err as Error).message}`));
      return;
    }

    let buffer = '';
    let resultText = '';
    /** Raw stdout fallback for diagnostics. The streaming parser silently
     *  drops non-JSON lines (auth prompts, "Error:" plain text, etc.), so we
     *  keep a small uninterpreted slice to surface in error messages. */
    let rawStdoutTail = '';
    let stderrText = '';
    let lastEmittedLength = 0;

    if (useStreamJson) {
      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Keep a small tail of raw stdout for the failure path; bounded so a
        // very chatty CLI doesn't blow up memory.
        rawStdoutTail = (rawStdoutTail + text).slice(-2000);
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            onRawEvent?.(parsed);

            const event = config.parseStreamEvent(parsed);
            if (event) {
              if (event.final) {
                if (event.final.length > lastEmittedLength) {
                  const newPart = event.final.slice(lastEmittedLength);
                  onText?.(newPart);
                  lastEmittedLength = event.final.length;
                }
                resultText = event.final;
              } else if (event.text) {
                resultText += event.text;
                lastEmittedLength = resultText.length;
                onText?.(event.text);
              }
            }
          } catch { /* ignore non-JSON */ }
        }
      });
    } else {
      proc.stdout?.on('data', (chunk: Buffer) => {
        resultText += chunk.toString();
      });
    }

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
    });

    proc.on('exit', (code, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (!useStreamJson && config.cleanOutput) {
        resultText = config.cleanOutput(resultText);
      }
      if (timedOut) {
        reject(new Error(`${config.name} CLI timed out after ${Math.round((options?.timeoutMs || 0) / 1000)}s`));
        return;
      }
      if (code !== 0 && !resultText) {
        // Build a richer diagnostic when the streaming parser dropped
        // everything: surface stderr, the raw stdout tail (often where the
        // real error sits — auth prompts, "Error: ..." text), the resolved
        // binary path, and the cwd. With these the user can usually tell
        // whether it's a login/quota/binary issue at a glance.
        const parts: string[] = [];
        const stderrTrimmed = stderrText.trim();
        const stdoutTrimmed = rawStdoutTail.trim();
        if (stderrTrimmed) parts.push(`stderr: ${stderrTrimmed.slice(0, 500)}`);
        if (stdoutTrimmed && useStreamJson) parts.push(`stdout: ${stdoutTrimmed.slice(0, 500)}`);
        if (signal) parts.push(`signal: ${signal}`);
        if (parts.length === 0) {
          // Truly silent exit. Most common cause is the user's CLI auth
          // expired (claude /login) or the binary is broken/outdated. Hint
          // toward those rather than leaving the user with nothing.
          parts.push('no output (try running the CLI in a terminal — likely a login or quota issue)');
        }
        parts.push(`binary: ${resolvedBinary}`);
        parts.push(`cwd: ${effectiveCwd}`);
        reject(new Error(`${config.name} CLI exited with code ${code}\n  ${parts.join('\n  ')}`));
        return;
      }
      resolve(resultText);
    });
  });
}

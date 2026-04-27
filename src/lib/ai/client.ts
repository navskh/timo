import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AGENTS } from './agents';
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

    const requestedCwd = options?.cwd;
    const effectiveCwd = requestedCwd && existsSync(requestedCwd) ? requestedCwd : process.cwd();

    const proc = spawn(config.binary, args, {
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
        reject(new Error(`${config.name} CLI not found on PATH. Install it first.`));
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
    let stderrText = '';
    let lastEmittedLength = 0;

    if (useStreamJson) {
      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
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
        const detail = stderrText.slice(0, 500) || (signal ? `killed by signal ${signal}` : 'no output');
        reject(new Error(`${config.name} CLI exited with code ${code}: ${detail}`));
        return;
      }
      resolve(resultText);
    });
  });
}

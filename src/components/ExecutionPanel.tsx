'use client';

import { useEffect, useRef, useState } from 'react';

export type StreamBlock =
  | { kind: 'text'; content: string }
  | { kind: 'tool_use'; name: string; input: unknown; id?: string }
  | { kind: 'tool_result'; toolUseId?: string; content: string; isError?: boolean }
  | { kind: 'system'; content: string }
  | { kind: 'error'; content: string };

interface Props {
  blocks: StreamBlock[];
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  title?: string;
}

export function ExecutionPanel({ blocks, status, title }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks]);

  return (
    <div className="border border-[var(--border)] rounded-md bg-[var(--surface-2)] flex flex-col max-h-[70vh]">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between text-sm">
        <span className="font-medium">{title ?? '실행 로그'}</span>
        <StatusPill status={status} />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {blocks.length === 0 ? (
          <p className="text-[var(--fg-dim)] italic">
            {status === 'running' ? '시작 중…' : '아직 실행 기록이 없어요.'}
          </p>
        ) : (
          blocks.map((b, i) => <BlockView key={i} block={b} />)
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Props['status'] }) {
  const map = {
    idle: { label: 'idle', cls: 'bg-[var(--surface-3)] text-[var(--fg-muted)]' },
    running: { label: '● 실행 중', cls: 'bg-[var(--accent-bg)] text-[var(--accent-soft)] animate-pulse' },
    done: { label: '✓ 완료', cls: 'bg-[var(--success-bg)] text-[var(--success-soft)]' },
    error: { label: '✗ 실패', cls: 'bg-[var(--danger-bg)] text-[var(--danger-soft)]' },
    cancelled: { label: '중단', cls: 'bg-yellow-600/40 text-yellow-200' },
  }[status];
  return <span className={`px-2 py-0.5 rounded text-xs ${map.cls}`}>{map.label}</span>;
}

function BlockView({ block }: { block: StreamBlock }) {
  if (block.kind === 'text') {
    return <div className="whitespace-pre-wrap leading-relaxed">{block.content}</div>;
  }
  if (block.kind === 'tool_use') {
    return (
      <details className="border border-[var(--border)] rounded bg-[var(--muted)]/60 overflow-hidden">
        <summary className="px-2 py-1 text-xs cursor-pointer mono text-[var(--accent-soft)] select-none">
          🔧 {block.name}
        </summary>
        <pre className="px-2 py-1 text-xs mono text-[var(--fg-muted)] overflow-x-auto border-t border-[var(--border)]">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      </details>
    );
  }
  if (block.kind === 'tool_result') {
    return (
      <details className={`border rounded overflow-hidden ${block.isError ? 'border-[var(--danger-border)] bg-[var(--danger-bg)]' : 'border-[var(--border)] bg-[var(--muted)]/40'}`}>
        <summary className="px-2 py-1 text-xs cursor-pointer mono text-[var(--fg-muted)] select-none">
          {block.isError ? '⚠️ tool result (error)' : '↩ tool result'}
        </summary>
        <pre className="px-2 py-1 text-xs mono whitespace-pre-wrap text-[var(--fg-muted)] border-t border-[var(--border)]">
          {block.content}
        </pre>
      </details>
    );
  }
  if (block.kind === 'system') {
    return <div className="text-xs italic text-[var(--fg-dim)]">{block.content}</div>;
  }
  if (block.kind === 'error') {
    return <div className="text-xs text-[var(--danger)] mono">{block.content}</div>;
  }
  return null;
}

/** Converts a raw Claude-CLI NDJSON event into StreamBlocks. */
export function blocksFromRawEvent(raw: Record<string, unknown>): StreamBlock[] {
  const out: StreamBlock[] = [];
  if (raw.type === 'assistant' && raw.message && typeof raw.message === 'object') {
    const msg = raw.message as { content?: Array<Record<string, unknown>> };
    for (const c of msg.content ?? []) {
      if (c.type === 'text' && typeof c.text === 'string') {
        out.push({ kind: 'text', content: c.text });
      } else if (c.type === 'tool_use') {
        out.push({
          kind: 'tool_use',
          name: (c.name as string) ?? 'unknown',
          input: c.input,
          id: c.id as string | undefined,
        });
      }
    }
  } else if (raw.type === 'user' && raw.message && typeof raw.message === 'object') {
    const msg = raw.message as { content?: Array<Record<string, unknown>> };
    for (const c of msg.content ?? []) {
      if (c.type === 'tool_result') {
        const content = Array.isArray(c.content)
          ? (c.content as Array<{ text?: string }>).map((x) => x.text ?? '').join('\n')
          : typeof c.content === 'string'
          ? c.content
          : JSON.stringify(c.content);
        out.push({
          kind: 'tool_result',
          toolUseId: c.tool_use_id as string | undefined,
          content,
          isError: Boolean(c.is_error),
        });
      }
    }
  } else if (raw.type === 'system') {
    const subtype = raw.subtype as string | undefined;
    if (subtype === 'init') {
      out.push({ kind: 'system', content: '세션 시작' });
    }
  } else if (raw.type === 'result') {
    // Result summary handled by overall status; skip to avoid duplicating final text.
  }
  return out;
}

'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatBlock, ChatRole } from '@/types';

interface Props {
  role: ChatRole;
  blocks: ChatBlock[];
  streaming?: boolean;
  /** Follow-up suggestions shown under the last assistant turn only. */
  suggestions?: string[];
  /** True if suggestions are still generating in the background. */
  suggestionsLoading?: boolean;
}

export function ChatMessage({ role, blocks, streaming, suggestions, suggestionsLoading }: Props) {
  if (role === 'user') {
    const textParts = blocks.filter((b) => b.kind === 'text').map((b) => (b as { content: string }).content);
    const imageBlocks = blocks.filter((b): b is Extract<ChatBlock, { kind: 'image' }> => b.kind === 'image');
    const text = textParts.join('\n');
    return (
      <div className="flex justify-end px-2">
        <div className="max-w-[78%] flex flex-col items-end gap-2">
          {imageBlocks.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {imageBlocks.map((img, i) => (
                <a
                  key={i}
                  href={img.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border border-[var(--accent-border)] rounded-lg overflow-hidden hover:border-[var(--accent)] transition"
                  title={img.name ?? '이미지'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.name ?? ''} className="max-w-[240px] max-h-[200px] object-cover" />
                </a>
              ))}
            </div>
          )}
          {text && (
            <div className="bg-[var(--accent)] text-[var(--accent-on)] px-3.5 py-2 rounded-2xl rounded-tr-md text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm">
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant turn: group consecutive tool_use/tool_result into a single "work trail" cluster,
  // keep text/system/error blocks as standalone sections.
  const clusters = buildClusters(blocks);

  return (
    <div className="flex gap-3 px-2">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 space-y-3 pb-2">
        <div className="text-xs font-semibold text-[var(--accent-soft)]">TIMO</div>
        {clusters.map((cluster, i) => (
          <ClusterRenderer key={i} cluster={cluster} />
        ))}
        {streaming && <div className="text-xs text-[var(--accent)] animate-pulse">● 생각 중…</div>}
        {!streaming && (suggestions?.length || suggestionsLoading) && (
          <Suggestions suggestions={suggestions ?? []} loading={suggestionsLoading} />
        )}
      </div>
    </div>
  );
}

function Suggestions({ suggestions, loading }: { suggestions: string[]; loading?: boolean }) {
  if (loading && suggestions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--fg-dim)] mono pt-1">
        <span className="animate-pulse">💭 다음 프롬프트 제안 중…</span>
      </div>
    );
  }
  const labels = ['▶ 진행', '🔍 검증', '💭 대안'];
  return (
    <div className="pt-1 flex flex-wrap gap-2 max-w-[740px]">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('timo:fill-composer', { detail: { text: s } }),
            );
          }}
          className="group/chip flex items-start gap-2 max-w-full text-left px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-3)] transition text-[12px]"
          title="클릭해서 입력창에 채우기"
        >
          <span className="text-[10px] text-[var(--fg-dim)] mono shrink-0 pt-0.5 group-hover/chip:text-[var(--accent-soft)]">
            {labels[i] ?? '·'}
          </span>
          <span className="text-[var(--foreground)] group-hover/chip:text-[var(--accent-soft)] leading-relaxed">
            {s}
          </span>
        </button>
      ))}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0 shadow-sm">
      <span className="text-[var(--accent-on)] text-[11px] font-bold tracking-tight">T</span>
    </div>
  );
}

/* --- clustering --- */

type Cluster =
  | { kind: 'text'; block: Extract<ChatBlock, { kind: 'text' }> }
  | { kind: 'image'; block: Extract<ChatBlock, { kind: 'image' }> }
  | { kind: 'note'; block: Extract<ChatBlock, { kind: 'system' } | { kind: 'error' }> }
  | { kind: 'tools'; blocks: Array<Extract<ChatBlock, { kind: 'tool_use' } | { kind: 'tool_result' }>> };

function buildClusters(blocks: ChatBlock[]): Cluster[] {
  const out: Cluster[] = [];
  for (const b of blocks) {
    if (b.kind === 'tool_use' || b.kind === 'tool_result') {
      const last = out[out.length - 1];
      if (last && last.kind === 'tools') last.blocks.push(b);
      else out.push({ kind: 'tools', blocks: [b] });
    } else if (b.kind === 'text') {
      out.push({ kind: 'text', block: b });
    } else if (b.kind === 'image') {
      out.push({ kind: 'image', block: b });
    } else {
      out.push({ kind: 'note', block: b });
    }
  }
  return out;
}

function ClusterRenderer({ cluster }: { cluster: Cluster }) {
  if (cluster.kind === 'text') {
    return (
      <div className="md-body text-[15px] text-[var(--foreground)] leading-[1.75] max-w-[740px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cluster.block.content}</ReactMarkdown>
      </div>
    );
  }
  if (cluster.kind === 'image') {
    return (
      <a
        href={cluster.block.url}
        target="_blank"
        rel="noreferrer"
        className="inline-block border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--accent)] transition"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cluster.block.url}
          alt={cluster.block.name ?? ''}
          className="max-w-[320px] max-h-[240px] object-cover"
        />
      </a>
    );
  }
  if (cluster.kind === 'note') {
    if (cluster.block.kind === 'error') {
      return (
        <div className="text-xs text-[var(--danger)] bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded px-2.5 py-1.5 mono">
          ⚠ {cluster.block.content}
        </div>
      );
    }
    return <div className="text-[11px] italic text-[var(--fg-dim)]">{cluster.block.content}</div>;
  }
  // Tools cluster: pair tool_use with its matching tool_result.
  return <ToolCluster blocks={cluster.blocks} />;
}

/* --- tools --- */

type ToolBlock = Extract<ChatBlock, { kind: 'tool_use' } | { kind: 'tool_result' }>;

function ToolCluster({ blocks }: { blocks: ToolBlock[] }) {
  // Pair each tool_use with its matching tool_result (by id → tool_use_id).
  const resultsByUseId = new Map<string, Extract<ChatBlock, { kind: 'tool_result' }>>();
  const orphanResults: Array<Extract<ChatBlock, { kind: 'tool_result' }>> = [];
  for (const b of blocks) {
    if (b.kind === 'tool_result') {
      if (b.toolUseId) resultsByUseId.set(b.toolUseId, b);
      else orphanResults.push(b);
    }
  }

  const pairs: Array<{
    use: Extract<ChatBlock, { kind: 'tool_use' }>;
    result?: Extract<ChatBlock, { kind: 'tool_result' }>;
  }> = [];
  for (const b of blocks) {
    if (b.kind === 'tool_use') {
      pairs.push({ use: b, result: b.id ? resultsByUseId.get(b.id) : undefined });
    }
  }

  return (
    <div className="space-y-1">
      {pairs.map((p, i) => (
        <ToolPair key={p.use.id ?? i} use={p.use} result={p.result} />
      ))}
      {orphanResults.map((r, i) => (
        <div key={`orphan-${i}`}>
          <ToolResultPill result={r} />
        </div>
      ))}
    </div>
  );
}

function ToolPair({
  use,
  result,
}: {
  use: Extract<ChatBlock, { kind: 'tool_use' }>;
  result?: Extract<ChatBlock, { kind: 'tool_result' }>;
}) {
  const preview = toolPreview(use.name, use.input);
  const isTodo = use.name === 'TodoWrite' || use.name === 'todo_write';
  const isError = result?.isError;
  const icon = toolIcon(use.name);

  return (
    <details className={`group rounded-md border bg-[var(--muted)]/30 transition ${
      isError
        ? 'border-[var(--danger-border)]'
        : isTodo
        ? 'border-[var(--warning-border)]'
        : 'border-[var(--border)] hover:border-[var(--accent-border)]'
    }`}>
      <summary className="cursor-pointer select-none flex items-center gap-2 px-2.5 py-1.5 text-[12px] leading-none">
        <span className="text-[var(--fg-muted)] group-open:rotate-90 transition-transform inline-block w-2">›</span>
        <span className="text-base leading-none">{icon}</span>
        <span className={`mono font-medium ${isTodo ? 'text-[var(--warning)]' : 'text-[var(--accent-soft)]'}`}>
          {use.name}
        </span>
        {preview && (
          <span className="mono text-[var(--fg-muted)] truncate min-w-0 flex-1" title={preview}>
            {preview}
          </span>
        )}
        {result && (
          <span className={`text-[10px] shrink-0 mono ${isError ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            {isError ? 'error' : 'ok'}
          </span>
        )}
      </summary>
      <div className="border-t border-[var(--border)] px-3 py-2 space-y-2 bg-[var(--surface-1)]">
        {/* input */}
        <div>
          <div className="text-[10px] text-[var(--fg-dim)] mono mb-1 uppercase tracking-wider">input</div>
          <pre className="mono text-[11.5px] text-[var(--fg-muted)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto scrollbar-slim">
            {typeof use.input === 'string' ? use.input : JSON.stringify(use.input, null, 2)}
          </pre>
        </div>
        {/* result */}
        {result && (
          <div>
            <div className={`text-[10px] mono mb-1 uppercase tracking-wider ${isError ? 'text-[var(--danger)]' : 'text-[var(--fg-dim)]'}`}>
              {isError ? 'error' : 'result'}
            </div>
            <pre className="mono text-[11.5px] text-[var(--fg-muted)] whitespace-pre-wrap break-words max-h-72 overflow-y-auto scrollbar-slim">
              {result.content}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

function ToolResultPill({ result }: { result: Extract<ChatBlock, { kind: 'tool_result' }> }) {
  return (
    <details className={`rounded-md border bg-[var(--muted)]/30 ${
      result.isError ? 'border-[var(--danger-border)]' : 'border-[var(--border)]'
    }`}>
      <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] text-[var(--fg-muted)] select-none flex items-center gap-2">
        <span className="text-base">↩</span>
        <span className="mono">tool result {result.isError ? '(error)' : ''}</span>
      </summary>
      <pre className="mono text-[11.5px] text-[var(--fg-muted)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto scrollbar-slim border-t border-[var(--border)] px-3 py-2 bg-[var(--surface-1)]">
        {result.content}
      </pre>
    </details>
  );
}

function toolIcon(name: string): string {
  switch (name) {
    case 'Bash':
    case 'BashOutput':
      return '💻';
    case 'Read':
      return '📄';
    case 'Write':
      return '✍️';
    case 'Edit':
    case 'MultiEdit':
      return '✏️';
    case 'Glob':
      return '🔎';
    case 'Grep':
      return '🔍';
    case 'WebFetch':
    case 'WebSearch':
      return '🌐';
    case 'TodoWrite':
    case 'todo_write':
      return '📋';
    case 'Task':
      return '🤖';
    case 'KillShell':
      return '🛑';
    default:
      return '🔧';
  }
}

function toolPreview(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  switch (name) {
    case 'Bash':
      return (obj.command as string) ?? '';
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return (obj.file_path as string) ?? (obj.filePath as string) ?? '';
    case 'Glob':
      return (obj.pattern as string) ?? '';
    case 'Grep': {
      const pat = obj.pattern as string | undefined;
      const path = obj.path as string | undefined;
      return pat ? `${pat}${path ? ` · ${path}` : ''}` : '';
    }
    case 'WebFetch':
    case 'WebSearch':
      return (obj.url as string) ?? (obj.query as string) ?? '';
    case 'TodoWrite':
    case 'todo_write': {
      const todos = obj.todos as Array<{ content?: string; status?: string }> | undefined;
      if (!todos?.length) return '';
      const done = todos.filter((t) => t.status === 'completed').length;
      return `${done}/${todos.length} done`;
    }
    case 'Task':
      return (obj.description as string) ?? (obj.subagent_type as string) ?? '';
    default: {
      const firstStr = Object.values(obj).find((v) => typeof v === 'string') as string | undefined;
      return firstStr ?? '';
    }
  }
}

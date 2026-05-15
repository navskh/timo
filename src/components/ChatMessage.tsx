'use client';

import { useRef, useState, type AnchorHTMLAttributes, type HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatBlock, ChatRole } from '@/types';

interface Props {
  role: ChatRole;
  blocks: ChatBlock[];
  streaming?: boolean;
  /** Follow-up suggestions shown under the last assistant turn only. */
  suggestions?: string[];
  /** Concrete answer choices when the assistant ended with a "pick one" — UI
   *  renders these as immediate-send buttons (no compose step). */
  choices?: string[];
  /** True if suggestions are still generating in the background. */
  suggestionsLoading?: boolean;
}

export function ChatMessage({ role, blocks, streaming, suggestions, choices, suggestionsLoading }: Props) {
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
        {!streaming && choices && choices.length > 0 && <Choices choices={choices} />}
        {!streaming && (!choices || choices.length === 0) && (suggestions?.length || suggestionsLoading) && (
          <Suggestions suggestions={suggestions ?? []} loading={suggestionsLoading} />
        )}
      </div>
    </div>
  );
}

function Choices({ choices }: { choices: string[] }) {
  return (
    <div className="pt-1 max-w-[740px]">
      <div className="flex items-center gap-1.5 text-[10px] mono text-[var(--fg-dim)] mb-2 uppercase tracking-wider">
        <span>↩</span>
        <span>이 중에서 골라 보내기 — 클릭하면 바로 전송</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {choices.map((c, i) => (
          <button
            key={i}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('timo:send-choice', { detail: { text: c } }),
              );
            }}
            className="flex items-center gap-2 max-w-full text-left px-3.5 py-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] hover:bg-[var(--accent)] hover:text-[var(--accent-on)] hover:border-[var(--accent)] text-[var(--accent-soft)] text-[13px] font-medium transition shadow-sm"
            title="클릭해서 즉시 전송"
          >
            <span className="text-[var(--accent)] group-hover:text-[var(--accent-on)]">▸</span>
            <span className="leading-relaxed">{c}</span>
          </button>
        ))}
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

/** Force markdown links to open in the system browser instead of navigating
 *  the Tauri webview itself. `target="_blank"` is enough — Tauri intercepts
 *  the new-window request and hands the URL off to the OS default browser. */
function ExternalLink({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isExternal = !!href && /^https?:\/\//i.test(href);
  if (!isExternal) {
    return <a href={href} {...rest}>{children}</a>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
    >
      {children}
    </a>
  );
}

/** Render a fenced code block with a hover-revealed copy button + a small
 *  language tag in the corner. The block ref's innerText preserves whatever
 *  rehype-highlight wrapped the tokens into, so we copy the visible code
 *  (not the highlighted HTML). */
function CodeBlock({ children, ...rest }: HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Pull the language tag out of the inner <code className="language-x">.
  let lang = '';
  if (children && typeof children === 'object' && 'props' in children) {
    const inner = children as { props?: { className?: string } };
    const match = inner.props?.className?.match(/language-([a-z0-9+#-]+)/i);
    if (match) lang = match[1];
  }

  const onCopy = async () => {
    if (!ref.current) return;
    try {
      await navigator.clipboard.writeText(ref.current.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative group/code my-3">
      {lang && (
        <span className="absolute top-2 left-3 text-[10px] mono text-[var(--fg-dim)] uppercase tracking-wider pointer-events-none">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={onCopy}
        className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[10px] mono transition border ${
          copied
            ? 'opacity-100 text-[var(--accent-soft)] border-[var(--accent-border)] bg-[var(--accent-bg)]'
            : 'opacity-0 group-hover/code:opacity-100 text-[var(--fg-muted)] border-[var(--border)] bg-[var(--surface-2)] hover:text-[var(--foreground)] hover:border-[var(--accent-border)]'
        }`}
        title="코드 복사"
        aria-label="코드 복사"
      >
        {copied ? '✓ 복사됨' : '복사'}
      </button>
      <pre ref={ref} {...rest}>{children}</pre>
    </div>
  );
}

/** Structured "ask the user" envelope some skills emit:
 *  { "questions": [{ question, header?, multiSelect?, options: [{label, description?}] }] }
 *  Without parsing, the JSON falls through as a code block in the chat —
 *  this turns it into clickable choice cards instead. */
interface IQuestionOption {
  label: string;
  description?: string;
}
interface IQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: IQuestionOption[];
}
interface IQuestionsPayload {
  questions: IQuestion[];
}

/** Accept either:
 *  - `{ questions: [{...}, ...] }`  (multi-question envelope)
 *  - `{ question, options, multiSelect?, header? }`  (single question, used by
 *    Claude's AskUserQuestion tool input)
 *  ...as long as every option has a string `label`. Returns null otherwise. */
function normalizeQuestionsPayload(parsed: unknown): IQuestionsPayload | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  let list: unknown[];
  if (Array.isArray(obj.questions)) {
    list = obj.questions;
  } else if (typeof obj.question === 'string' && Array.isArray(obj.options)) {
    list = [obj];
  } else {
    return null;
  }
  if (list.length === 0) return null;
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const it = item as Partial<IQuestion>;
    if (typeof it.question !== 'string' || !Array.isArray(it.options)) return null;
    for (const opt of it.options) {
      if (!opt || typeof opt !== 'object') return null;
      if (typeof (opt as IQuestionOption).label !== 'string') return null;
    }
  }
  return { questions: list as IQuestion[] };
}

function tryParseQuestionsPayload(raw: string): IQuestionsPayload | null {
  if (!raw) return null;
  // Strip code fences and surrounding whitespace; some skills wrap the JSON.
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim();
  if (!cleaned.startsWith('{')) return null;
  try {
    return normalizeQuestionsPayload(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

function dispatchChoice(text: string) {
  window.dispatchEvent(new CustomEvent('timo:send-choice', { detail: { text } }));
}

function QuestionsPanel({ payload }: { payload: IQuestionsPayload }) {
  return (
    <div className="space-y-4 max-w-[740px]">
      {payload.questions.map((q, idx) => (
        <QuestionCard key={idx} question={q} />
      ))}
    </div>
  );
}

function QuestionCard({ question }: { question: IQuestion }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const multi = !!question.multiSelect;

  function pickedAnswerText(indices: number[]): string {
    const labels = indices.map((i) => question.options[i].label).filter(Boolean);
    const head = question.header ? `${question.header}: ` : '';
    return `${head}${labels.join(', ')}`;
  }

  function onPick(i: number) {
    if (multi) {
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      return;
    }
    dispatchChoice(pickedAnswerText([i]));
  }

  function onSubmitMulti() {
    if (picked.size === 0) return;
    dispatchChoice(pickedAnswerText([...picked].sort((a, b) => a - b)));
  }

  return (
    <div className="border border-[var(--border)] rounded-xl bg-[var(--surface-2)] overflow-hidden">
      {question.header && (
        <div className="px-4 pt-3 text-[10px] mono uppercase tracking-wider text-[var(--fg-dim)]">
          {question.header}
        </div>
      )}
      <div className="px-4 pt-1 pb-3 text-[14px] font-medium text-[var(--foreground)]">
        {question.question}
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {question.options.map((opt, i) => {
          const isPicked = picked.has(i);
          return (
            <li key={i}>
              <button
                onClick={() => onPick(i)}
                className={`w-full text-left px-4 py-3 transition flex items-start gap-3 ${
                  multi
                    ? isPicked
                      ? 'bg-[var(--accent-bg)]'
                      : 'hover:bg-[var(--surface-3)]'
                    : 'hover:bg-[var(--accent-bg)]'
                }`}
              >
                <span
                  className={`shrink-0 mt-0.5 w-4 h-4 rounded ${multi ? 'border' : 'rounded-full border'} flex items-center justify-center text-[10px] transition ${
                    multi && isPicked
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-on)]'
                      : 'border-[var(--border-strong)]'
                  }`}
                  aria-hidden
                >
                  {multi && isPicked ? '✓' : ''}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] ${
                    multi && isPicked ? 'text-[var(--accent-soft)] font-medium' : 'text-[var(--foreground)] font-medium'
                  }`}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="block mt-1 text-[12px] text-[var(--fg-muted)] leading-relaxed">
                      {opt.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {multi && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-between">
          <span className="text-[11px] mono text-[var(--fg-dim)]">
            {picked.size}개 선택됨
          </span>
          <button
            onClick={onSubmitMulti}
            disabled={picked.size === 0}
            className="px-3 py-1 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-[var(--accent-on)] text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            보내기 →
          </button>
        </div>
      )}
    </div>
  );
}

function ClusterRenderer({ cluster }: { cluster: Cluster }) {
  if (cluster.kind === 'text') {
    // Detect structured questions envelope first — render as interactive cards.
    const questions = tryParseQuestionsPayload(cluster.block.content);
    if (questions) return <QuestionsPanel payload={questions} />;
    return (
      <div className="md-body text-[15px] text-[var(--foreground)] leading-[1.75] max-w-[740px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={{ a: ExternalLink, pre: CodeBlock }}
        >
          {cluster.block.content}
        </ReactMarkdown>
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
  // AskUserQuestion comes through as a tool_use that always errors out in our
  // permission-skipped setup (claude has no built-in mechanism to wait for a
  // user response). Hijack the rendering: parse the input as a question
  // payload and surface the interactive choice cards directly so the user can
  // actually answer instead of staring at an error block.
  if (use.name === 'AskUserQuestion' || use.name === 'ask_user_question') {
    const payload = normalizeQuestionsPayload(use.input);
    if (payload) return <QuestionsPanel payload={payload} />;
  }

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

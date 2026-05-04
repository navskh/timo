import { runAgent } from './ai/client';
import { getProject } from './db/queries/projects';
import { getTasksByProject } from './db/queries/tasks';
import {
  getSession,
  getMessages,
  addMessage,
  renameSession,
} from './db/queries/chat';
import { syncTodos } from './todo-sync';
import { extractSkillFromMessage, listSkills, type ISkill } from './skills';
import {
  markRunning,
  markIdle,
  setProcess,
  clearProcess,
  appendStreamingBlock,
} from './chat-state';
import type { IChatMessage, ChatBlock, IChatSession, ITask, AgentType, IAttachment } from '@/types';

export type ChatEvent =
  | { type: 'user-message-saved'; message: IChatMessage }
  | { type: 'assistant-delta'; block: ChatBlock }
  | { type: 'tasks-updated' }
  | { type: 'assistant-message-saved'; message: IChatMessage }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type ChatSink = (event: ChatEvent) => void;

/**
 * Build a single-string prompt from session history + new user message.
 * Claude CLI's `-p` is one-shot, so we serialize the conversation each turn.
 */
function buildPrompt(
  session: IChatSession,
  projectName: string,
  projectDescription: string,
  history: IChatMessage[],
  currentTasks: ITask[],
  availableSkills: ISkill[],
  activeSkill: ISkill | null,
  newUserText: string,
  attachments: IAttachment[],
): string {
  const parts: string[] = [];
  parts.push(`You are TIMO, an AI that pairs with the user on a running project called "${projectName}".`);
  if (projectDescription) parts.push(`Project context: ${projectDescription}`);
  parts.push(
    [
      'Work through the user\'s request autonomously. Use TodoWrite to plan and track sub-tasks as you work — each TodoWrite call is mirrored into the TIMO task panel that the user is watching live.',
      'Critical rules for TodoWrite (your call REPLACES the panel — items you omit get DELETED):',
      '- Each TodoWrite is the complete authoritative task list for this project. Include EVERY task you want to keep — even ones unrelated to the current turn.',
      '- To MARK AN EXISTING TASK DONE/IN-PROGRESS, include it with its EXACT title (copy-paste from the list below) and the new status.',
      '- Add a new todo only for genuinely new work the user did not already list.',
      '- Drop a task ONLY when it is truly obsolete (already done elsewhere, no longer needed, duplicate). If unsure, keep it.',
      '- Tasks with status `completed` stay in the list as a "done" record — keep them so the user can see what was accomplished, until they explicitly clean up.',
      'You may freely edit/read files, run shell commands, etc.',
    ].join('\n'),
  );

  if (availableSkills.length > 0) {
    parts.push(
      `\n# Available skills (the user can invoke these by typing "<trigger> <message>" — you may also suggest one)`,
    );
    for (const s of availableSkills) {
      parts.push(`- ${s.trigger} — ${s.description || s.name}`);
    }
  }

  if (activeSkill) {
    parts.push(`\n# Active skill: ${activeSkill.trigger} (${activeSkill.name})`);
    parts.push(
      'The user invoked this skill. Follow its directives strictly for this turn. Skill body ↓',
    );
    parts.push('---');
    parts.push(activeSkill.body);
    parts.push('---');
  }

  if (currentTasks.length > 0) {
    parts.push('\n# Existing tasks (copy titles exactly when updating status)');
    for (const t of currentTasks) {
      const marker = t.status === 'done' ? '[x]' : t.status === 'running' ? '[~]' : t.status === 'failed' ? '[!]' : '[ ]';
      parts.push(`- ${marker} ${t.title}`);
    }
  }

  if (history.length > 0) {
    parts.push('\n# Prior conversation');
    for (const m of history) {
      if (m.role === 'user') {
        parts.push(`\n## User\n${m.content}`);
      } else if (m.role === 'assistant' && m.content) {
        parts.push(`\n## You (previous turn)\n${m.content}`);
      }
    }
  }
  parts.push(`\n# Current user message\n${newUserText}`);

  if (attachments.length > 0) {
    parts.push('\n# Attached images');
    parts.push(
      '사용자가 아래 이미지를 첨부했습니다. **Read 툴로 각 파일을 읽어서** 내용을 분석하고 요청에 반영하세요:',
    );
    for (const a of attachments) {
      parts.push(`- ${a.path}  (${a.name}, ${a.mime}, ${Math.round(a.size / 1024)}KB)`);
    }
  }

  return parts.join('\n');
}

/**
 * Runs a chat turn. Streams blocks via sink, persists user + final assistant
 * messages to the DB, and syncs TodoWrite calls to tasks.
 */
export async function runChatTurn(
  sessionId: string,
  userText: string,
  sink: ChatSink,
  attachments: IAttachment[] = [],
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const project = getProject(session.project_id);
  if (!project) throw new Error(`Project not found: ${session.project_id}`);

  markRunning({
    session_id: sessionId,
    project_id: session.project_id,
    title: session.title,
  });

  // Build user message blocks: text first, then image thumbnails.
  const userBlocks: ChatBlock[] = [];
  if (userText.trim()) userBlocks.push({ kind: 'text', content: userText });
  for (const a of attachments) {
    userBlocks.push({ kind: 'image', url: a.url, name: a.name, path: a.path });
  }
  if (userBlocks.length === 0) userBlocks.push({ kind: 'text', content: '' });

  // Persist user message first so it appears immediately in history.
  const userMsg = addMessage({
    session_id: sessionId,
    role: 'user',
    content: userText,
    blocks: userBlocks,
  });
  sink({ type: 'user-message-saved', message: userMsg });

  // If this is the very first user message, auto-name the session.
  const history = getMessages(sessionId).filter((m) => m.id !== userMsg.id);
  if (history.length === 0) {
    const title = userText.trim().slice(0, 40) || '새 대화';
    renameSession(sessionId, title);
  }

  // Detect skill trigger in the user's message.
  const { skill: activeSkill, rest: userBody } = extractSkillFromMessage(userText);
  const skills = listSkills();

  // Include non-archived tasks so AI can mark them complete precisely.
  const allTasks = getTasksByProject(project.id);
  const relevantTasks = allTasks
    .filter((t) => t.status !== 'done')
    .concat(allTasks.filter((t) => t.status === 'done').slice(-10))
    .slice(0, 120);

  const prompt = buildPrompt(
    session,
    project.name,
    project.description,
    history,
    relevantTasks,
    skills,
    activeSkill,
    userBody || userText,
    attachments,
  );

  // Skill can override the agent (e.g., a review skill pinned to claude).
  const effectiveAgent: AgentType = activeSkill?.agent ?? project.agent_type;

  const assistantBlocks: ChatBlock[] = [];

  try {
    const finalText = await runAgent(
      effectiveAgent,
      prompt,
      undefined, // text chunks are re-derived from raw events
      (raw) => {
        const newBlocks = blocksFromRaw(raw);
        for (const b of newBlocks) {
          assistantBlocks.push(b);
          appendStreamingBlock(sessionId, b);
          sink({ type: 'assistant-delta', block: b });

          // Intercept TodoWrite → sync tasks
          if (b.kind === 'tool_use' && (b.name === 'TodoWrite' || b.name === 'todo_write')) {
            const input = b.input as { todos?: Array<Record<string, unknown>> } | undefined;
            const todos = (input?.todos ?? []).map((t) => ({
              content: (t.content as string) ?? '',
              status: (t.status as string) ?? 'pending',
              activeForm: (t.activeForm as string) ?? undefined,
            }));
            try {
              syncTodos(project.id, todos);
              sink({ type: 'tasks-updated' });
            } catch (e) {
              sink({
                type: 'error',
                message: `TodoWrite sync failed: ${(e as Error).message}`,
              });
            }
          }
        }
      },
      {
        cwd: project.project_path ?? undefined,
        model: session.model ?? undefined,
        onSpawn: (proc) => setProcess(sessionId, proc),
      },
    );

    // Persist the final assistant message (full text + all blocks).
    const assistantMsg = addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: finalText,
      blocks: assistantBlocks,
    });
    sink({ type: 'assistant-message-saved', message: assistantMsg });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Detect interrupted runs across all the ways claude can exit when we
    // signal it: a literal signal name in the message, the diagnostic format
    // we added in v0.6.1 ("signal: SIGTERM"), or the well-known
    // process-exit codes 128 + signum. claude usually catches SIGTERM and
    // exits cleanly with code 143 — without 143 in this list we treated
    // every interrupt as a hard error and dumped the entire stdout NDJSON
    // tail into the message content, which then leaked into the next turn's
    // prompt and broke the model.
    const interrupted =
      message.includes('SIGTERM') ||
      message.includes('SIGINT') ||
      message.includes('SIGKILL') ||
      message.includes('killed by signal') ||
      message.includes('timed out') ||
      /exited with code (143|137|130)\b/.test(message);
    assistantBlocks.push({
      kind: interrupted ? 'system' : 'error',
      content: interrupted ? '⏸ 사용자가 응답을 중단했어요' : message,
    });
    // Keep the persisted `content` short so it doesn't pollute future prompts.
    // The full diagnostic still lives in `blocks_json` for the UI to render;
    // it just isn't stuffed into `## You (previous turn)\n{...}` later on.
    const persistedContent = interrupted
      ? '(중단됨)'
      : `(error) ${message.split('\n')[0].slice(0, 200)}`;
    const assistantMsg = addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: persistedContent,
      blocks: assistantBlocks,
    });
    if (!interrupted) sink({ type: 'error', message });
    sink({ type: 'assistant-message-saved', message: assistantMsg });
  } finally {
    clearProcess(sessionId);
    markIdle(sessionId);
    sink({ type: 'done' });
  }
}

/** Extract ChatBlocks from a single claude-CLI NDJSON event. */
function blocksFromRaw(raw: Record<string, unknown>): ChatBlock[] {
  const out: ChatBlock[] = [];
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
  } else if (raw.type === 'system' && raw.subtype === 'init') {
    out.push({ kind: 'system', content: '세션 시작' });
  }
  return out;
}

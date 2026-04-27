import { runAgent } from './ai/client';
import { getProject } from './db/queries/projects';
import {
  getSession,
  getMessages,
  setMessageSuggestions,
  getLastAssistantMessage,
} from './db/queries/chat';

/**
 * Given a session, generate 3 follow-up prompt suggestions for the user and
 * attach them to the most recent assistant message. Uses a fast/cheap model
 * (sonnet) to keep cost + latency down, and because Sonnet is metered in a
 * separate bucket from Opus so the user's main quota is preserved.
 */
export async function generateSuggestions(sessionId: string): Promise<string[]> {
  const session = getSession(sessionId);
  if (!session) throw new Error('session not found');
  const project = getProject(session.project_id);
  if (!project) throw new Error('project not found');

  const last = getLastAssistantMessage(sessionId);
  if (!last) return [];

  const history = getMessages(sessionId).slice(-6);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');

  const prompt = [
    'You are TIMO\'s follow-up suggestion engine. Output ONLY a JSON array of 3 strings, no other text.',
    '',
    `Project: ${project.name}${project.description ? ` — ${project.description}` : ''}`,
    '',
    'Latest exchange:',
    lastUser ? `User: ${truncate(lastUser.content, 400)}` : '',
    `TIMO: ${truncate(last.content, 1200)}`,
    '',
    'Suggest 3 natural follow-up prompts the user might send next.',
    'Make them DIVERSE across these three intents (in order):',
    '  1. 진행(Proceed) — move to the next implementation step',
    '  2. 검증(Verify) — review/test/double-check what was just done',
    '  3. 대안(Alternative) — explore a different angle, deeper analysis, or what-if',
    '',
    'Constraints:',
    '- Korean, natural casual tone like "이거 ~해줘" / "~했어?" 등',
    '- 20–60 characters each',
    '- Do not repeat what TIMO already answered',
    '- No trailing punctuation if unnecessary',
    '- Output strictly: ["...", "...", "..."]',
  ].join('\n');

  let text: string;
  try {
    text = await runAgent('claude', prompt, undefined, undefined, {
      model: 'sonnet',
      timeoutMs: 30_000,
    });
  } catch {
    return [];
  }

  const suggestions = extractJsonArray(text);
  if (suggestions.length === 0) return [];

  const top3 = suggestions.slice(0, 3).map((s) => String(s).trim()).filter(Boolean);
  setMessageSuggestions(last.id, top3);
  return top3;
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/** Pull the first top-level JSON array out of the LLM's output, tolerating
 *  stray prefixes/code-fences/explanations. */
function extractJsonArray(raw: string): string[] {
  if (!raw) return [];
  // Strip code fences first.
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find first `[` and matching `]`.
  const start = cleaned.indexOf('[');
  if (start === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return [];
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

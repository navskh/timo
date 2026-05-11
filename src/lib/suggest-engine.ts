import { runAgent } from './ai/client';
import { getProject } from './db/queries/projects';
import {
  getSession,
  getMessages,
  setMessageSuggestions,
  setMessageChoices,
  getLastAssistantMessage,
} from './db/queries/chat';

export interface ISuggestResult {
  /** Concrete answer strings when the assistant asked the user to pick. */
  choices: string[];
  /** Generic follow-ups (only set when there are no choices). */
  suggestions: string[];
}

/**
 * Given a session, decide whether the last assistant message ended with a
 * "pick one" question and, if so, extract the answer options. Otherwise,
 * generate 3 generic follow-up prompts. Both are persisted to the assistant
 * message; the UI renders choices as immediate-send buttons when present,
 * suggestions as fill-the-composer chips otherwise.
 *
 * Uses sonnet (cheap, separate quota bucket) to keep this off the user's
 * main Opus budget.
 */
export async function generateSuggestions(sessionId: string): Promise<ISuggestResult> {
  const session = getSession(sessionId);
  if (!session) throw new Error('session not found');
  const project = getProject(session.project_id);
  if (!project) throw new Error('project not found');

  const last = getLastAssistantMessage(sessionId);
  if (!last) return { choices: [], suggestions: [] };

  const history = getMessages(sessionId).slice(-6);
  const lastUser = [...history].reverse().find((m) => m.role === 'user');

  const prompt = [
    'You are TIMO\'s follow-up engine. Output ONLY a JSON object with two arrays, no other text.',
    '',
    `Project: ${project.name}${project.description ? ` — ${project.description}` : ''}`,
    '',
    'Latest exchange:',
    lastUser ? `User: ${truncate(lastUser.content, 400)}` : '',
    `TIMO: ${truncate(last.content, 1500)}`,
    '',
    '## Decision 1 — Did TIMO end by asking the user to pick from concrete options?',
    'YES only when TIMO presented discrete, named choices (e.g. "A or B?", "1) X / 2) Y / 3) Z", "이대로 진행할까요 아니면 ...로 갈까요?").',
    'NO for open-ended questions ("어떻게 할까요?"), confirmations ("이대로 가도 될까요?" without an alternative), or pure status reports.',
    '',
    'If YES — fill `choices` with the answer strings the user would actually send back (Korean, short, what they\'d type). Up to 5. Leave `suggestions` as [].',
    'If NO — leave `choices` as []. Fill `suggestions` with 3 follow-ups (see below).',
    '',
    '## Suggestions format (only when choices is empty)',
    'Generate 3 diverse follow-ups, in this order:',
    '  1. 진행(Proceed) — move to the next implementation step',
    '  2. 검증(Verify) — review/test/double-check what was just done',
    '  3. 대안(Alternative) — explore a different angle, deeper analysis, what-if',
    '',
    '## Common constraints',
    '- Korean, natural casual tone',
    '- choices: 5–50 chars; suggestions: 20–60 chars',
    '- Do not repeat what TIMO already answered',
    '- Output strictly: {"choices":[...],"suggestions":[...]}',
  ].join('\n');

  let text: string;
  try {
    text = await runAgent('claude', prompt, undefined, undefined, {
      model: 'sonnet',
      timeoutMs: 30_000,
    });
  } catch {
    return { choices: [], suggestions: [] };
  }

  const parsed = extractJsonObject(text);
  const choicesRaw = Array.isArray(parsed?.choices) ? parsed.choices : [];
  const suggestionsRaw = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

  const choices = choicesRaw
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 5);
  // When choices are present we suppress suggestions so the UI shows one
  // clear action surface. When choices is empty, suggestions kick in.
  const suggestions = choices.length > 0
    ? []
    : suggestionsRaw.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);

  setMessageChoices(last.id, choices);
  setMessageSuggestions(last.id, suggestions);
  return { choices, suggestions };
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/** Pull the first top-level JSON object out of the LLM's output, tolerating
 *  stray prefixes/code-fences/explanations. */
function extractJsonObject(raw: string): { choices?: unknown[]; suggestions?: unknown[] } | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

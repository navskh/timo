import fs from 'node:fs';
import path from 'node:path';
import { getSkillsDir } from './utils/paths';
import { SEED_SKILLS } from './skills-seed';
import type { AgentType } from '@/types';

export interface ISkill {
  /** Slug used for filename and URL: /api/skills/[name]. Matches frontmatter name. */
  name: string;
  /** One-line description shown in UI. */
  description: string;
  /** Slash command trigger, e.g. "/plan". */
  trigger: string;
  /** Optional agent override. Falls back to the project's agent_type. */
  agent: AgentType | null;
  /** The system-prompt body (everything after the frontmatter block). */
  body: string;
}

const FILENAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function sanitizeName(raw: string): string {
  const n = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!FILENAME_RE.test(n)) {
    throw new Error(`Invalid skill name: "${raw}" (use a-z, 0-9, hyphens)`);
  }
  return n;
}

/** Very small YAML-subset parser: `key: value` lines between `---` markers. */
function parseFrontmatter(source: string): { fm: Record<string, string>; body: string } {
  const trimmed = source.replace(/^\ufeff/, '');
  const lines = trimmed.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { fm: {}, body: trimmed };
  }
  const fm: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      i++;
      break;
    }
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (m) {
      const key = m[1];
      let val = m[2];
      // Strip surrounding quotes if present.
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      fm[key] = val;
    }
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '');
  return { fm, body };
}

function serializeSkill(skill: ISkill): string {
  const fmLines = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `trigger: ${skill.trigger}`,
    `agent: ${skill.agent ?? ''}`,
    '---',
    '',
  ];
  return fmLines.join('\n') + skill.body.replace(/^\n+/, '') + (skill.body.endsWith('\n') ? '' : '\n');
}

function skillFromFile(filePath: string): ISkill | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = parseFrontmatter(raw);
    const name = (fm.name || path.basename(filePath, '.md')).trim();
    const trigger = (fm.trigger || `/${name}`).trim();
    const agentRaw = (fm.agent || '').trim() as AgentType | '';
    const agent = agentRaw === 'claude' || agentRaw === 'gemini' || agentRaw === 'codex' ? agentRaw : null;
    return {
      name: name.toLowerCase(),
      description: (fm.description || '').trim(),
      trigger,
      agent,
      body,
    };
  } catch {
    return null;
  }
}

/** Seed the skills directory with defaults if empty on first run. */
function ensureSeeded(): void {
  const dir = getSkillsDir();
  const existing = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (existing.length > 0) return;
  for (const { filename, body } of SEED_SKILLS) {
    fs.writeFileSync(path.join(dir, filename), body, 'utf8');
  }
}

export function listSkills(): ISkill[] {
  ensureSeeded();
  const dir = getSkillsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const out: ISkill[] = [];
  for (const f of files) {
    const s = skillFromFile(path.join(dir, f));
    if (s) out.push(s);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function getSkill(name: string): ISkill | null {
  ensureSeeded();
  const clean = sanitizeName(name);
  const filePath = path.join(getSkillsDir(), `${clean}.md`);
  if (!fs.existsSync(filePath)) return null;
  return skillFromFile(filePath);
}

/** Look up a skill by its trigger token (e.g. "/plan"). */
export function getSkillByTrigger(trigger: string): ISkill | null {
  const t = trigger.trim();
  if (!t.startsWith('/')) return null;
  const all = listSkills();
  return all.find((s) => s.trigger === t) ?? null;
}

export function saveSkill(input: {
  name: string;
  description: string;
  trigger?: string;
  agent?: AgentType | null;
  body: string;
}): ISkill {
  const name = sanitizeName(input.name);
  const trigger = (input.trigger?.trim() || `/${name}`).replace(/^\/+/, '/');
  if (!trigger.startsWith('/')) {
    throw new Error(`trigger must start with "/", got "${trigger}"`);
  }
  const skill: ISkill = {
    name,
    description: input.description.trim(),
    trigger,
    agent: input.agent ?? null,
    body: input.body,
  };
  const filePath = path.join(getSkillsDir(), `${name}.md`);
  fs.writeFileSync(filePath, serializeSkill(skill), 'utf8');
  return skill;
}

export function deleteSkill(name: string): boolean {
  const clean = sanitizeName(name);
  const filePath = path.join(getSkillsDir(), `${clean}.md`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Parse a user chat text — if the first token matches a skill trigger,
 * return the matched skill and the remaining message.
 */
export function extractSkillFromMessage(text: string): { skill: ISkill | null; rest: string } {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('/')) return { skill: null, rest: text };
  const firstLineBreak = trimmed.indexOf('\n');
  const firstSpace = trimmed.indexOf(' ');
  let endOfTrigger = -1;
  if (firstLineBreak === -1 && firstSpace === -1) endOfTrigger = trimmed.length;
  else if (firstLineBreak === -1) endOfTrigger = firstSpace;
  else if (firstSpace === -1) endOfTrigger = firstLineBreak;
  else endOfTrigger = Math.min(firstLineBreak, firstSpace);

  const trigger = trimmed.slice(0, endOfTrigger);
  const skill = getSkillByTrigger(trigger);
  if (!skill) return { skill: null, rest: text };
  const rest = trimmed.slice(endOfTrigger).trimStart();
  return { skill, rest };
}

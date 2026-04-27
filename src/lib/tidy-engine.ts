import { runAgent } from './ai/client';
import { getProject } from './db/queries/projects';
import {
  getTasksByProject,
  updateTaskStatus,
  updateTask,
  deleteTask,
} from './db/queries/tasks';
import type { ITask } from '@/types';

export interface ITidyPlan {
  id: string;
  action: 'keep' | 'done' | 'delete' | 'rename';
  new_title?: string;
  reason?: string;
}

export interface ITidyResult {
  summary: {
    total: number;
    kept: number;
    marked_done: number;
    deleted: number;
    renamed: number;
  };
  plan: ITidyPlan[];
  /** Brief human-readable paragraph from the AI. */
  report: string;
}

/**
 * Ask Sonnet to review every task and emit a JSON action plan, then apply it.
 * Does NOT use Claude Code's TodoWrite (which is for Claude's own ad-hoc
 * planning, not a 70-task database mirror). Server controls everything.
 */
export async function tidyProjectTasks(projectId: string): Promise<ITidyResult> {
  const project = getProject(projectId);
  if (!project) throw new Error('project not found');

  const tasks = getTasksByProject(projectId);
  if (tasks.length === 0) {
    return {
      summary: { total: 0, kept: 0, marked_done: 0, deleted: 0, renamed: 0 },
      plan: [],
      report: '태스크가 없어 정리할 대상이 없어요.',
    };
  }

  // Only send actionable tasks to the AI. Done items rarely need re-judgment
  // and they bloat the input context — for a 70-item list, this is the
  // difference between a 60s and a 15s response.
  const reviewable = tasks.filter((t) => t.status !== 'done');
  if (reviewable.length === 0) {
    return {
      summary: { total: tasks.length, kept: tasks.length, marked_done: 0, deleted: 0, renamed: 0 },
      plan: [],
      report: '활성(pending/running/failed) 태스크가 없어 정리할 대상이 없어요.',
    };
  }

  const prompt = buildPrompt(project.name, project.description, project.project_path, reviewable, tasks.length);

  let raw: string;
  try {
    // Single-turn judgment: no tool use, just emit JSON. Prevents Claude from
    // wandering off into git log/grep which blew past the 180s timeout.
    raw = await runAgent('claude', prompt, undefined, undefined, {
      model: 'haiku',
      maxTurns: 1,
      timeoutMs: 120_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Sonnet 호출 실패: ${message}`);
  }

  const parsed = extractPlan(raw);
  if (!parsed) {
    throw new Error('AI가 유효한 JSON 계획을 반환하지 않았어요. 원문 앞부분:\n' + raw.slice(0, 300));
  }

  const applied = applyPlan(projectId, parsed.plan, tasks);
  return {
    summary: applied,
    plan: parsed.plan,
    report: parsed.report ?? '',
  };
}

function buildPrompt(
  projectName: string,
  projectDescription: string,
  projectPath: string | null,
  tasks: ITask[],
  totalCount: number,
): string {
  const lines: string[] = [];
  lines.push(
    '당신은 TIMO의 태스크 정리 전문가입니다. 아래 활성 태스크들을 보고 정리할 항목을 판정하세요.',
  );
  lines.push(`프로젝트: ${projectName}${projectDescription ? ` — ${projectDescription}` : ''}`);
  if (projectPath) lines.push(`작업 디렉토리: ${projectPath}`);
  if (totalCount > tasks.length) {
    lines.push(`(완료된 ${totalCount - tasks.length}개 태스크는 검토 대상에서 제외됨)`);
  }
  lines.push('');
  lines.push('## 판정 규칙 — 변경할 것만 출력하세요');
  lines.push('확신 있게 바꿀 항목만 plan에 넣으세요. **유지할 항목은 절대 출력하지 마세요.**');
  lines.push('plan에 없는 id는 서버가 자동으로 keep 처리합니다.');
  lines.push('');
  lines.push('action 종류:');
  lines.push('- "done"   — 완료된 항목. 아래 신호 중 하나라도 있으면 done 처리:');
  lines.push('    · 제목에 "완료", "done", "끝", "처리됨", "[done]", "(완료)" 같은 마커');
  lines.push('    · "이거 완료로 처리해도 됨" 같은 사용자의 명시적 표현');
  lines.push('    · 제목 자체가 이미 결과를 서술하는 형태 ("X 했음", "Y 끝남")');
  lines.push('- "delete" — 명백한 중복·구식·취소된 항목. 병합도 삭제로 처리.');
  lines.push('- "rename" — 제목이 너무 모호할 때. new_title 필수. 완료 마커는 떼지 말고 유지.');
  lines.push('');
  lines.push('**위 신호가 명백하면 적극적으로** done/delete를 출력하세요.');
  lines.push('명백한 신호가 전혀 없을 때만 keep(=출력 안 함).');
  lines.push('');
  lines.push('## 중요 — 도구 호출 금지');
  lines.push('이 턴은 **단일 판정 턴**입니다. Bash, Read, Glob, Grep 등 어떤 도구도 호출하지 마세요.');
  lines.push('파일을 열어보거나 git을 확인하는 시도 없이, 오직 **제목과 상태만 보고** 판정합니다.');
  lines.push('');
  lines.push('## 태스크 (id | status | title)');
  for (const t of tasks) {
    lines.push(`- ${t.id} | ${t.status} | ${t.title}`);
  }
  lines.push('');
  lines.push('## 출력 형식 (엄격)');
  lines.push('JSON 객체 하나만 출력하세요. 앞뒤 설명·코드펜스 없이.');
  lines.push('변경할 항목이 없으면 plan은 빈 배열 [] 입니다.');
  lines.push('```');
  lines.push('{');
  lines.push('  "plan": [');
  lines.push('    { "id": "태스크id", "action": "done|delete|rename", "new_title": "rename일 때만", "reason": "10자 내외" }');
  lines.push('  ],');
  lines.push('  "report": "2-3줄 요약: 무엇을 왜 바꿨는지"');
  lines.push('}');
  lines.push('```');
  return lines.join('\n');
}

function extractPlan(raw: string): { plan: ITidyPlan[]; report?: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(obj.plan)) return null;
    const plan: ITidyPlan[] = obj.plan
      .filter((p: unknown): p is ITidyPlan => {
        if (!p || typeof p !== 'object') return false;
        const x = p as Record<string, unknown>;
        return typeof x.id === 'string' &&
          typeof x.action === 'string' &&
          ['keep', 'done', 'delete', 'rename'].includes(x.action as string);
      });
    return { plan, report: typeof obj.report === 'string' ? obj.report : '' };
  } catch {
    return null;
  }
}

function applyPlan(projectId: string, plan: ITidyPlan[], tasks: ITask[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const summary = { total: tasks.length, kept: 0, marked_done: 0, deleted: 0, renamed: 0 };
  const touched = new Set<string>();

  for (const p of plan) {
    const t = byId.get(p.id);
    if (!t) continue; // ignore hallucinated IDs
    touched.add(p.id);

    switch (p.action) {
      case 'keep':
        // Allowed but redundant — AI shouldn't emit these now. Treat as no-op.
        break;
      case 'done':
        if (t.status !== 'done') {
          updateTaskStatus(t.id, 'done');
          summary.marked_done++;
        }
        break;
      case 'delete':
        deleteTask(t.id);
        summary.deleted++;
        break;
      case 'rename': {
        const newTitle = (p.new_title ?? '').trim();
        if (newTitle && newTitle !== t.title) {
          updateTask(t.id, { title: newTitle });
          summary.renamed++;
        }
        break;
      }
    }
  }

  // Anything the AI didn't mention defaults to keep.
  summary.kept = tasks.length - summary.marked_done - summary.deleted - summary.renamed;
  return summary;
}

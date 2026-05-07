import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import {
  getSession,
  getMessages,
  addMessage,
  archiveMessages,
} from '@/lib/db/queries/chat';
import { getProject } from '@/lib/db/queries/projects';
import { runAgent } from '@/lib/ai/client';
import type { IChatMessage } from '@/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ sid: string }> };

const KEEP_RECENT = 5;
const MIN_TO_COMPACT = 6;

function renderHistoryForSummary(messages: IChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(`[USER]\n${m.content || '(empty)'}`);
    } else if (m.role === 'assistant') {
      parts.push(`[ASSISTANT]\n${m.content || '(no text content)'}`);
    } else if (m.role === 'system') {
      parts.push(`[EARLIER SUMMARY]\n${m.content}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

const SUMMARIZE_PROMPT = `다음은 사용자와 AI 어시스턴트의 대화 기록입니다. 이 대화를 한국어 한 단락(최대 500단어)으로 요약하세요.

요약에 반드시 포함:
- 사용자가 무엇을 하려고 했는지 (목표/문제)
- 결정된 방향, 채택된 접근, 거부된 옵션과 그 이유
- 작업한 파일 경로·명령어·핵심 식별자(있다면 그대로)
- 미해결 항목, 다음에 이어 갈 부분

제외:
- 인사말·감사 표현 같은 대화 채움
- 단순 진행상황 보고("작업 중...", "완료됨")
- 코드 블록 전체 (변경 요점만)

아래에 요약만 출력하세요. 메타 코멘트("요약:", "다음은 요약입니다") 금지.

---

`;

export async function POST(_req: NextRequest, { params }: Ctx) {
  await ensureDb();
  const { sid } = await params;

  const session = getSession(sid);
  if (!session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }
  const project = getProject(session.project_id);
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const all = getMessages(sid);
  if (all.length < MIN_TO_COMPACT) {
    return NextResponse.json(
      { error: `요약하기에 메시지가 너무 적어요 (${all.length}/${MIN_TO_COMPACT})` },
      { status: 400 },
    );
  }

  // Keep the last KEEP_RECENT messages live; everything before that gets
  // condensed into one system message. If there's already an earlier
  // summary in the live window it'll feed back into the new one — so
  // compacting twice doesn't lose the original gist.
  const toCompact = all.slice(0, all.length - KEEP_RECENT);
  if (toCompact.length === 0) {
    return NextResponse.json(
      { error: '요약 대상 메시지 없음 (최근 메시지만 남아있어요)' },
      { status: 400 },
    );
  }

  const transcript = renderHistoryForSummary(toCompact);
  const prompt = SUMMARIZE_PROMPT + transcript;

  let summary: string;
  try {
    summary = await runAgent(
      project.agent_type,
      prompt,
      undefined,
      undefined,
      {
        cwd: project.project_path ?? undefined,
        // No tools needed — pure summarization. Keep it tight.
        maxTurns: 1,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `요약 생성 실패: ${message}` }, { status: 500 });
  }

  const trimmed = summary.trim();
  if (!trimmed) {
    return NextResponse.json({ error: '빈 요약을 받았어요 (재시도 권장)' }, { status: 500 });
  }

  // Persist summary as a system role message + archive the originals atomically
  // is not possible across runAgent + DB writes, so do them in sequence with
  // tolerant ordering: insert the summary first, then archive (so the worst
  // case is "summary written but originals not archived" — easy to retry).
  const summaryMsg = addMessage({
    session_id: sid,
    role: 'system',
    content: `📦 이전 ${toCompact.length}개 메시지 요약\n\n${trimmed}`,
    blocks: [
      {
        kind: 'system',
        content: `📦 이전 ${toCompact.length}개 메시지 요약\n\n${trimmed}`,
      },
    ],
  });
  archiveMessages(toCompact.map((m) => m.id));

  return NextResponse.json({
    summary: summaryMsg,
    archivedCount: toCompact.length,
    keptCount: KEEP_RECENT,
  });
}

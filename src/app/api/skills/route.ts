import { NextRequest, NextResponse } from 'next/server';
import { listSkills, saveSkill } from '@/lib/skills';
import type { AgentType } from '@/types';

export async function GET() {
  return NextResponse.json({ skills: listSkills() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (typeof body.body !== 'string') {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }
  try {
    const skill = saveSkill({
      name: body.name,
      description: body.description ?? '',
      trigger: body.trigger,
      agent: (body.agent as AgentType | null) ?? null,
      body: body.body,
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 400 },
    );
  }
}

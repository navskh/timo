import { NextRequest, NextResponse } from 'next/server';
import { getSkill, saveSkill, deleteSkill } from '@/lib/skills';
import type { AgentType } from '@/types';

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { name } = await params;
  const skill = getSkill(name);
  if (!skill) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ skill });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { name } = await params;
  const existing = getSkill(name);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json();
  try {
    const skill = saveSkill({
      name: existing.name,
      description: body.description ?? existing.description,
      trigger: body.trigger ?? existing.trigger,
      agent: (body.agent as AgentType | null) ?? existing.agent,
      body: body.body ?? existing.body,
    });
    return NextResponse.json({ skill });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { name } = await params;
  const ok = deleteSkill(name);
  return NextResponse.json({ ok });
}

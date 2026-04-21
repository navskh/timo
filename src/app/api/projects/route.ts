import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getProjects, createProject } from '@/lib/db/queries/projects';
import type { AgentType } from '@/types';

export async function GET() {
  await ensureDb();
  return NextResponse.json({ projects: getProjects() });
}

export async function POST(req: NextRequest) {
  await ensureDb();
  const body = await req.json();
  if (!body?.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const project = createProject({
    name: body.name,
    description: body.description ?? '',
    project_path: body.project_path ?? null,
    agent_type: (body.agent_type as AgentType) ?? 'claude',
  });
  return NextResponse.json({ project }, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('path') ?? os.homedir();

  // Resolve to an absolute path, normalize, defend against traversal tricks.
  let abs: string;
  try {
    abs = path.resolve(requested);
  } catch {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: 'not found', path: abs }, { status: 404 });
  }
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: 'not a directory', path: abs }, { status: 400 });
  }

  let entries: Array<{ name: string; isDir: boolean }> = [];
  try {
    const items = fs.readdirSync(abs, { withFileTypes: true });
    entries = items
      .filter((d) => !d.name.startsWith('.') || d.name === '.git')
      .map((d) => ({
        name: d.name,
        isDir: d.isDirectory() || (d.isSymbolicLink() && safeIsDir(path.join(abs, d.name))),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err) {
    return NextResponse.json(
      { error: `read failed: ${(err as Error).message}`, path: abs },
      { status: 500 },
    );
  }

  const parent = path.dirname(abs);
  return NextResponse.json({
    path: abs,
    parent: parent === abs ? null : parent,
    home: os.homedir(),
    entries,
  });
}

function safeIsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

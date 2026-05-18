import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUploadsDir } from '@/lib/utils/paths';
import { generateId } from '@/lib/utils/id';

// Images get a special render path (thumbnail + Read hint as image). Everything
// else gets rendered as a file chip and Read'd as text/binary by claude.
const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// Block obvious executables so a stray drop doesn't put binaries in
// ~/.timo/uploads. Source code / docs / data / archives are all fine.
const BLOCKED_EXT = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.msi',
  '.app', '.dmg', '.pkg',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
]);

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/heic' || mime === 'image/heif') return '.heic';
  return '';
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  const lowerExt = path.extname(file.name).toLowerCase();
  if (BLOCKED_EXT.has(lowerExt)) {
    return NextResponse.json(
      { error: `실행 가능한 확장자는 첨부 불가 (${lowerExt})` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `25MB 이하만 가능 (현재: ${Math.round(file.size / 1024 / 1024)}MB)` },
      { status: 400 },
    );
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const subDir = path.join(getUploadsDir(), yyyy, mm);
  fs.mkdirSync(subDir, { recursive: true });

  // Prefer the original extension when available — it's the strongest hint for
  // claude when it reads the file (e.g. `.ts`, `.json`, `.md`). Fall back to a
  // mime mapping only for images, where the browser may strip the ext.
  const ext = path.extname(file.name) || extFromMime(file.type) || '.bin';
  const id = generateId();
  const filename = `${id}${ext}`;
  const abs = path.join(subDir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
  try { fs.chmodSync(abs, 0o644); } catch { /* ignore */ }

  // rel path for URL serving (under /api/uploads/<rel>)
  const rel = path.relative(getUploadsDir(), abs).split(path.sep).join('/');
  return NextResponse.json({
    path: abs,           // absolute fs path — given to Claude CLI via prompt
    url: `/api/uploads/${rel}`, // served by the [...rest] route for UI preview
    name: file.name,
    size: file.size,
    mime: file.type,
    isImage: IMAGE_MIME.has(file.type),
  }, { status: 201 });
}

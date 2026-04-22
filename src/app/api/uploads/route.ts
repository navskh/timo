import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUploadsDir } from '@/lib/utils/paths';
import { generateId } from '@/lib/utils/id';

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

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
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `이미지 파일만 가능 (현재: ${file.type || 'unknown'})` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `10MB 이하만 가능 (현재: ${Math.round(file.size / 1024 / 1024)}MB)` },
      { status: 400 },
    );
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const subDir = path.join(getUploadsDir(), yyyy, mm);
  fs.mkdirSync(subDir, { recursive: true });

  const ext = extFromMime(file.type) || path.extname(file.name) || '.bin';
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
  }, { status: 201 });
}

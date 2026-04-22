import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUploadsDir } from '@/lib/utils/paths';

type Ctx = { params: Promise<{ rest: string[] }> };

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { rest } = await params;
  const root = getUploadsDir();
  const abs = path.resolve(root, rest.join('/'));
  // Jail: refuse anything outside uploads dir.
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    return new Response('forbidden', { status: 403 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return new Response('not found', { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  const buf = fs.readFileSync(abs);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

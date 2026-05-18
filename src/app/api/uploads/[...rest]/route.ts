import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUploadsDir } from '@/lib/utils/paths';

type Ctx = { params: Promise<{ rest: string[] }> };

const MIME: Record<string, string> = {
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.svg': 'image/svg+xml',
  // text / code
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.rs': 'text/x-rust; charset=utf-8',
  '.go': 'text/x-go; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.rb': 'text/x-ruby; charset=utf-8',
  '.sql': 'text/x-sql; charset=utf-8',
  // docs / data
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
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

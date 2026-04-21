#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Next.js `output: 'standalone'` writes a self-contained server to
// .next/standalone/ but does NOT copy public/, .next/static/, or the
// sql.js wasm asset. We stitch those in so the published package works.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');

if (!fs.existsSync(STANDALONE)) {
  console.warn('[post-build] no standalone output — skipping');
  process.exit(0);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// 1. public/ → standalone/public/
copyDir(path.join(ROOT, 'public'), path.join(STANDALONE, 'public'));

// 2. .next/static → standalone/.next/static
copyDir(path.join(ROOT, '.next', 'static'), path.join(STANDALONE, '.next', 'static'));

// 3. sql.js — only the wasm loader + wasm binary we actually load at runtime.
//    dist/ also contains asm/browser/worker/debug variants (~20MB) we never use.
const sqlJsSrc = path.join(ROOT, 'node_modules', 'sql.js');
const sqlJsDst = path.join(STANDALONE, 'node_modules', 'sql.js');
const WANTED = ['dist/sql-wasm.js', 'dist/sql-wasm.wasm', 'package.json'];
for (const rel of WANTED) {
  copyFile(path.join(sqlJsSrc, rel), path.join(sqlJsDst, rel));
}

// 4. Prune things Next traced that TIMO never uses at runtime.
//    - typescript/@types: build-time only
//    - @img, sharp: server-side image optimization (unused)
//    - caniuse-lite, baseline-browser-mapping: build-time browser compat data
const PRUNE = [
  'node_modules/typescript',
  'node_modules/@types',
  'node_modules/@img',
  'node_modules/sharp',
  'node_modules/caniuse-lite',
  'node_modules/baseline-browser-mapping',
  'node_modules/detect-libc',
];
for (const rel of PRUNE) {
  const abs = path.join(STANDALONE, rel);
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}

console.log('[post-build] bundled public, static, slim sql.js into standalone; pruned trace fat');

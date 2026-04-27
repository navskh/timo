#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Prepare Tauri sidecar bundle:
//   1. Copy .next/standalone → src-tauri/server-resources/  (Next.js server + deps)
//   2. Download a statically-linked Node binary (matching process.version) from
//      nodejs.org and place it at src-tauri/binaries/node-{target-triple} so
//      the .app can spawn the server without depending on the host's Node /
//      Homebrew dylibs.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const STANDALONE = path.join(ROOT, '.next', 'standalone');

if (!fs.existsSync(STANDALONE)) {
  console.error('[tauri-prepare] no .next/standalone — run `npm run build` first');
  process.exit(1);
}

// 1. server-resources
const serverDest = path.join(TAURI_DIR, 'server-resources');
fs.rmSync(serverDest, { recursive: true, force: true });
fs.mkdirSync(serverDest, { recursive: true });
fs.cpSync(STANDALONE, serverDest, { recursive: true });
console.log('[tauri-prepare] copied .next/standalone → src-tauri/server-resources');

// 2. Node sidecar
function detectTargetTriple() {
  // Honor explicit override (set by CI per matrix entry — needed for
  // cross-arch builds where the runner's `rustc` host triple differs
  // from the requested --target).
  if (process.env.TAURI_TARGET_TRIPLE) {
    return process.env.TAURI_TARGET_TRIPLE.trim();
  }
  const env = {
    ...process.env,
    PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH || ''}`,
  };
  try {
    const out = execFileSync('rustc', ['-Vv'], { encoding: 'utf8', env });
    const m = out.match(/^host:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    // fall through to platform-based guess
  }
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  if (process.platform === 'linux') return `${arch}-unknown-linux-gnu`;
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`;
  throw new Error(`unsupported platform ${process.platform}/${process.arch}`);
}

const TRIPLE_TO_NODE = {
  'aarch64-apple-darwin':       { platform: 'darwin', arch: 'arm64', ext: 'tar.xz' },
  'x86_64-apple-darwin':        { platform: 'darwin', arch: 'x64',   ext: 'tar.xz' },
  'aarch64-unknown-linux-gnu':  { platform: 'linux',  arch: 'arm64', ext: 'tar.xz' },
  'x86_64-unknown-linux-gnu':   { platform: 'linux',  arch: 'x64',   ext: 'tar.xz' },
  'x86_64-pc-windows-msvc':     { platform: 'win',    arch: 'x64',   ext: 'zip' },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GET ${url} → ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureNodeBinary(version, triple) {
  const m = TRIPLE_TO_NODE[triple];
  if (!m) throw new Error(`no Node download mapping for ${triple}`);

  const cacheDir = path.join(os.homedir(), '.cache', 'timo-build');
  fs.mkdirSync(cacheDir, { recursive: true });

  const dirName = `node-v${version}-${m.platform}-${m.arch}`;
  const extracted = path.join(cacheDir, dirName);
  const binPath = m.platform === 'win'
    ? path.join(extracted, 'node.exe')
    : path.join(extracted, 'bin', 'node');

  if (fs.existsSync(binPath)) {
    console.log(`[tauri-prepare] using cached node at ${binPath}`);
    return binPath;
  }

  const archive = `${dirName}.${m.ext}`;
  const url = `https://nodejs.org/dist/v${version}/${archive}`;
  const archivePath = path.join(cacheDir, archive);
  console.log(`[tauri-prepare] downloading ${url}`);
  await download(url, archivePath);

  if (m.ext === 'tar.xz') {
    execFileSync('tar', ['-xJf', archivePath, '-C', cacheDir], { stdio: 'inherit' });
  } else {
    // Try `unzip` first (present on macOS/Linux + Git Bash). Bare Windows
    // runners lack it, so fall back to PowerShell's Expand-Archive.
    try {
      execFileSync('unzip', ['-q', archivePath, '-d', cacheDir], { stdio: 'inherit' });
    } catch {
      execFileSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${cacheDir}' -Force`,
      ], { stdio: 'inherit' });
    }
  }
  fs.unlinkSync(archivePath);

  if (!fs.existsSync(binPath)) {
    throw new Error(`expected ${binPath} after extracting ${archive}`);
  }
  return binPath;
}

// 3. (macOS only) Compile node-launcher wrapper.
//
// On macOS, Tauri sidecars at Contents/MacOS/node show up in the Dock because
// LaunchServices treats binaries inside Contents/MacOS/ as sub-applications.
// We replace the bundled `node` with a tiny C wrapper that embeds
// LSUIElement=YES in its __TEXT,__info_plist section and posix_spawn()s the
// real node from Contents/Resources/server-resources/node-bin.
function buildLauncherForMac(triple) {
  const launcherSrc = path.join(TAURI_DIR, 'launcher', 'launcher.c');
  const launcherPlist = path.join(TAURI_DIR, 'launcher', 'Info.plist');
  const outDir = path.join(os.tmpdir(), 'timo-launcher');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `node-launcher-${triple}`);

  // Map triple → clang -arch flag so the wrapper matches the target.
  const archFlag = triple.startsWith('aarch64') ? 'arm64'
    : triple.startsWith('x86_64')  ? 'x86_64'
    : null;
  if (!archFlag) throw new Error(`unsupported arch for triple ${triple}`);

  const args = [
    '-O2',
    '-arch', archFlag,
    launcherSrc,
    '-o', out,
    '-sectcreate', '__TEXT', '__info_plist', launcherPlist,
  ];
  console.log(`[tauri-prepare] compiling launcher: clang ${args.join(' ')}`);
  execFileSync('clang', args, { stdio: 'inherit' });
  fs.chmodSync(out, 0o755);

  // Ad-hoc sign so Hardened Runtime accepts it. Tauri also ad-hoc signs
  // externalBin entries during bundling, but signing here keeps `npm run
  // tauri:dev` (which skips bundling) consistent.
  try {
    execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', out], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[tauri-prepare] codesign on launcher failed (non-fatal):', err.message);
  }
  return out;
}

(async () => {
  const triple = detectTargetTriple();
  const version = process.versions.node;
  const src = await ensureNodeBinary(version, triple);

  const binDir = path.join(TAURI_DIR, 'binaries');
  fs.mkdirSync(binDir, { recursive: true });

  const isMac = triple.includes('apple-darwin');
  const isWin = triple.includes('windows');

  if (isMac) {
    // Real node lives next to the standalone server in Resources, where
    // LaunchServices won't treat it as a Dock-eligible application.
    const nodeBin = path.join(serverDest, 'node-bin');
    fs.copyFileSync(src, nodeBin);
    fs.chmodSync(nodeBin, 0o755);
    try {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', nodeBin], {
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn('[tauri-prepare] codesign on node-bin failed (non-fatal):', err.message);
    }
    console.log(`[tauri-prepare] staged node v${version} → ${path.relative(ROOT, nodeBin)}`);

    // Wrapper takes node's place at Contents/MacOS/node.
    const wrapper = buildLauncherForMac(triple);
    const dest = path.join(binDir, `node-${triple}`);
    fs.copyFileSync(wrapper, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`[tauri-prepare] installed launcher → ${path.relative(ROOT, dest)}`);
  } else {
    const dest = path.join(binDir, `node-${triple}${isWin ? '.exe' : ''}`);
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`[tauri-prepare] copied node v${version} → ${path.relative(ROOT, dest)}`);
  }
})().catch((err) => {
  console.error('[tauri-prepare]', err);
  process.exit(1);
});

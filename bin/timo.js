#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PKG_ROOT = path.resolve(__dirname, '..');
const STANDALONE_SERVER = path.join(PKG_ROOT, '.next', 'standalone', 'server.js');
const STANDALONE_DIR = path.dirname(STANDALONE_SERVER);

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'start';
  const opts = { port: 3789, open: true, mode: 'app', help: false };

  for (let i = cmd === args[0] ? 1 : 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-p' || a === '--port') opts.port = Number(args[++i]);
    else if (a === '--no-open') opts.open = false;
    else if (a === '--tab') opts.mode = 'tab';
    else if (a === '--app') opts.mode = 'app';
  }
  return { cmd, opts };
}

function printHelp() {
  console.log(`
TIMO — Think · Idea-Manager · Operation (im.v2)

Usage:
  timo start [options]

Options:
  -p, --port <port>   port to listen on (default 3789)
  --tab               open in a browser tab instead of app window
  --app               open in a standalone Chrome/Edge app window (default)
  --no-open           don't auto-open anything
  -h, --help          show this help

Data is stored at ~/.timo/  (skills/ and data/timo.db).
`.trim());
}

/** Find a Chromium-based browser that supports --app=<url>. */
function findChromeBinary() {
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Arc.app/Contents/MacOS/Arc',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
  }
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const candidates = [
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(pfx86, 'Microsoft/Edge/Application/msedge.exe'),
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
  }
  // Linux: try `which` on common names
  for (const bin of ['google-chrome', 'chromium', 'microsoft-edge', 'brave-browser']) {
    const r = spawnSync('which', [bin]);
    if (r.status === 0) return r.stdout.toString().trim();
  }
  return null;
}

function openInAppMode(url) {
  const chrome = findChromeBinary();
  if (!chrome) return false;
  const userDataDir = path.join(os.homedir(), '.timo', 'chrome-profile');
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch { /* ignore */ }
  const args = [
    `--app=${url}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,820',
  ];
  try {
    spawn(chrome, args, { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function openInBrowserTab(url) {
  const plat = process.platform;
  try {
    if (plat === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (plat === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function startServer(opts) {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    console.error('TIMO build output not found. If you are running from source:');
    console.error('  npm run build');
    process.exit(1);
  }

  const env = {
    ...process.env,
    PORT: String(opts.port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
  };

  const child = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: STANDALONE_DIR,
    env,
    stdio: 'inherit',
  });

  if (opts.open) {
    const url = `http://localhost:${opts.port}/`;
    setTimeout(() => {
      if (opts.mode === 'app') {
        const ok = openInAppMode(url);
        if (!ok) {
          console.log('[timo] no Chrome/Edge found, falling back to default browser');
          openInBrowserTab(url);
        }
      } else {
        openInBrowserTab(url);
      }
    }, 1500);
  }

  const shutdown = (sig) => child.kill(sig);
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  child.on('exit', (code) => process.exit(code ?? 0));
}

function main() {
  const { cmd, opts } = parseArgs(process.argv);
  if (opts.help || cmd === 'help') return printHelp();
  if (cmd === 'start') return startServer(opts);
  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main();

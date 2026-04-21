#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PKG_ROOT = path.resolve(__dirname, '..');
const STANDALONE_SERVER = path.join(PKG_ROOT, '.next', 'standalone', 'server.js');
const STANDALONE_DIR = path.dirname(STANDALONE_SERVER);

function parseArgs(argv) {
  // Tiny hand-rolled parser — avoids the commander dep so the package stays lean.
  const args = argv.slice(2);
  const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'start';
  const opts = { port: 3789, open: true, help: false };

  for (let i = cmd === args[0] ? 1 : 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-p' || a === '--port') opts.port = Number(args[++i]);
    else if (a === '--no-open') opts.open = false;
  }
  return { cmd, opts };
}

function printHelp() {
  console.log(`
TIMO — Think · Idea-Manager · Operation (im.v2)

Usage:
  timo start [--port 3789] [--no-open]
  timo -h / --help

Commands:
  start       Start the local TIMO server and open the browser

Data is stored at ~/.timo/  (skills/ and data/timo.db).
`.trim());
}

function openBrowser(url) {
  const plat = process.platform;
  try {
    if (plat === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (plat === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    console.log(`\nOpen in browser:  ${url}`);
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
    setTimeout(() => openBrowser(url), 1500);
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

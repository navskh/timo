#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Cross-platform wrapper for the tauri CLI.
//
// Original `npm run tauri` used a unix-only `PATH="$HOME/.cargo/bin:$PATH" tauri`
// prefix to guarantee cargo is on PATH. cmd.exe parses that as an env-var set
// only and silently skips the `tauri` token, so Windows CI succeeded with zero
// output and no artifacts. This wrapper does the same prepend portably.

const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const sep = process.platform === 'win32' ? ';' : ':';
const env = {
  ...process.env,
  PATH: `${cargoBin}${sep}${process.env.PATH ?? ''}`,
};

// `shell: true` lets Windows resolve npm's .cmd shim for `tauri`.
const child = spawn('tauri', process.argv.slice(2), { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));

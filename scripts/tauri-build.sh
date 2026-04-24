#!/usr/bin/env bash
set -euo pipefail

KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-$HOME/.tauri/timo.key}"
if [[ ! -f "$KEY_PATH" ]]; then
  echo "[tauri-build] missing signing key at $KEY_PATH" >&2
  echo "  generate with: npx tauri signer generate -w $KEY_PATH --ci" >&2
  exit 1
fi

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
export PATH="$HOME/.cargo/bin:$PATH"

# Local builds skip dmg (broken on macOS 26.x); CI builds default targets.
exec npx tauri build --bundles app,updater "$@"

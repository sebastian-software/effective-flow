#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$ROOT_DIR/dist/claude/sf-claude-plugin"

if [ ! -d "$PLUGIN_DIR" ]; then
  printf 'ERROR: Claude plugin build output not found: %s\n' "$PLUGIN_DIR" >&2
  printf 'Run ./local-update.sh or node build.mjs first.\n' >&2
  exit 1
fi

claude plugin marketplace add "$PLUGIN_DIR"

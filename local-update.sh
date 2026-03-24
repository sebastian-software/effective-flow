#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
"$ROOT_DIR/build.sh"

# Codex
CODEX_TARGET="${CODEX_HOME:-$HOME/.codex}/skills"
mkdir -p "$CODEX_TARGET"
for skill_dir in "$ROOT_DIR/dist/codex"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$CODEX_TARGET/$skill_name"
  cp -R "$skill_dir" "$CODEX_TARGET/$skill_name"
done

# Claude Code
CLAUDE_TARGET="${CLAUDE_HOME:-$HOME/.claude}/skills"
mkdir -p "$CLAUDE_TARGET"
for skill_dir in "$ROOT_DIR/dist/claude"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$CLAUDE_TARGET/$skill_name"
  cp -R "$skill_dir" "$CLAUDE_TARGET/$skill_name"
done

printf 'Deployed to:\n  %s\n  %s\n' "$CODEX_TARGET" "$CLAUDE_TARGET"

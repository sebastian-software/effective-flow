#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
"$ROOT_DIR/build.sh"

# --- Codex Skills -> ~/.agents/skills/ ---
CODEX_SKILLS_TARGET="$HOME/.agents/skills"
mkdir -p "$CODEX_SKILLS_TARGET"
for skill_dir in "$ROOT_DIR/dist/codex/skills"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$CODEX_SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$CODEX_SKILLS_TARGET/$skill_name"
done

# --- Codex Agents -> ~/.codex/agents/ ---
CODEX_AGENTS_TARGET="${CODEX_HOME:-$HOME/.codex}/agents"
mkdir -p "$CODEX_AGENTS_TARGET"
for toml_file in "$ROOT_DIR/dist/codex/agents"/sf-*.toml; do
  [ -f "$toml_file" ] || continue
  toml_name="$(basename "$toml_file")"
  cp "$toml_file" "$CODEX_AGENTS_TARGET/$toml_name"
done

# --- Claude Code Plugin -> ~/.claude/plugins/ ---
CLAUDE_TARGET="${CLAUDE_HOME:-$HOME/.claude}/plugins/sf-frontend-workflows"
rm -rf "$CLAUDE_TARGET"
mkdir -p "$(dirname "$CLAUDE_TARGET")"
cp -R "$ROOT_DIR/dist/claude/sf-frontend-workflows" "$CLAUDE_TARGET"

# --- Cleanup old locations ---
OLD_CODEX_SKILLS="${CODEX_HOME:-$HOME/.codex}/skills"
if [ -d "$OLD_CODEX_SKILLS" ]; then
  for old_dir in "$OLD_CODEX_SKILLS"/sf-*; do
    [ -d "$old_dir" ] || [ -L "$old_dir" ] || continue
    rm -rf "$old_dir"
  done
fi

OLD_CLAUDE_SKILLS="${CLAUDE_HOME:-$HOME/.claude}/skills"
if [ -d "$OLD_CLAUDE_SKILLS" ]; then
  for old_dir in "$OLD_CLAUDE_SKILLS"/sf-*; do
    [ -d "$old_dir" ] || [ -L "$old_dir" ] || continue
    rm -rf "$old_dir"
  done
fi

printf 'Deployed to:\n'
printf '  Codex Skills:  %s\n' "$CODEX_SKILLS_TARGET"
printf '  Codex Agents:  %s\n' "$CODEX_AGENTS_TARGET"
printf '  Claude Plugin: %s\n' "$CLAUDE_TARGET"

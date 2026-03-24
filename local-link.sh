#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
"$ROOT_DIR/build.sh"

# Helper: remove and symlink
link_target() {
  target="$1"
  source="$2"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm -rf "$target"
  fi
  ln -s "$source" "$target"
}

# --- Codex Skills -> ~/.agents/skills/ ---
CODEX_SKILLS_TARGET="$HOME/.agents/skills"
mkdir -p "$CODEX_SKILLS_TARGET"
for skill_dir in "$ROOT_DIR/dist/codex/skills"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  link_target "$CODEX_SKILLS_TARGET/$skill_name" "$skill_dir"
done

# --- Codex Agents -> ~/.codex/agents/ ---
CODEX_AGENTS_TARGET="${CODEX_HOME:-$HOME/.codex}/agents"
mkdir -p "$CODEX_AGENTS_TARGET"
for toml_file in "$ROOT_DIR/dist/codex/agents"/sf-*.toml; do
  [ -f "$toml_file" ] || continue
  toml_name="$(basename "$toml_file")"
  link_target "$CODEX_AGENTS_TARGET/$toml_name" "$toml_file"
done

# --- Claude Code Plugin -> ~/.claude/plugins/ ---
CLAUDE_TARGET="${CLAUDE_HOME:-$HOME/.claude}/plugins/sf-frontend-workflows"
mkdir -p "$(dirname "$CLAUDE_TARGET")"
link_target "$CLAUDE_TARGET" "$ROOT_DIR/dist/claude/sf-frontend-workflows"

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

printf 'Linked to:\n'
printf '  Codex Skills:  %s\n' "$CODEX_SKILLS_TARGET"
printf '  Codex Agents:  %s\n' "$CODEX_AGENTS_TARGET"
printf '  Claude Plugin: %s\n' "$CLAUDE_TARGET"

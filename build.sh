#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SOURCE_DIR="$ROOT_DIR/skills"
DIST_CODEX="$ROOT_DIR/dist/codex"
DIST_CLAUDE="$ROOT_DIR/dist/claude"

rm -rf "$DIST_CODEX" "$DIST_CLAUDE"
mkdir -p "$DIST_CODEX" "$DIST_CLAUDE"

for skill_dir in "$SOURCE_DIR"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"

  mkdir -p "$DIST_CODEX/$skill_name"
  mkdir -p "$DIST_CLAUDE/$skill_name"

  # Codex: {{SKILL:name}} -> $name
  perl -pe 's/\{\{SKILL:([^}]+)\}\}/\$$1/g' \
      "$skill_dir/SKILL.md" > "$DIST_CODEX/$skill_name/SKILL.md"

  # Claude Code: {{SKILL:name}} -> /name
  perl -pe 's/\{\{SKILL:([^}]+)\}\}/\/$1/g' \
      "$skill_dir/SKILL.md" > "$DIST_CLAUDE/$skill_name/SKILL.md"
done

printf 'Built: dist/codex/, dist/claude/\n'

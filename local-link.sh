#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
node "$ROOT_DIR/build.mjs"

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CLAUDE_SKILLS="$CLAUDE_HOME/skills"
CODEX_SKILLS="$HOME/.agents/skills"

# Development variant of local-update.sh: symlink the built `firmo` skill into
# the harness skills directories instead of copying. Only the `firmo` symlink is
# managed; the parent skills directory is never removed or replaced.
link_skill() {
  built="$1"
  dest_dir="$2"
  mkdir -p "$dest_dir"
  rm -rf "$dest_dir/firmo"
  ln -s "$built" "$dest_dir/firmo"
}

cleanup_sf() {
  dir="$1"
  [ -d "$dir" ] || return 0
  for old in "$dir"/sf-*; do
    [ -e "$old" ] || [ -L "$old" ] || continue
    rm -rf "$old"
  done
}

link_skill "$ROOT_DIR/dist/claude/firmo" "$CLAUDE_SKILLS"
link_skill "$ROOT_DIR/dist/codex/firmo" "$CODEX_SKILLS"

# --- Cleanup retired sf-* installs and the old Claude marketplace ---
cleanup_sf "$CLAUDE_SKILLS"
cleanup_sf "$CODEX_SKILLS"
cleanup_sf "$CODEX_HOME/skills"
if [ -d "$CODEX_HOME/agents" ]; then
  for old_agent in "$CODEX_HOME/agents"/sf-*.toml; do
    [ -e "$old_agent" ] || [ -L "$old_agent" ] || continue
    rm -f "$old_agent"
  done
fi
rm -rf "$CLAUDE_HOME/plugins/marketplaces/sf-claude-plugin"

printf 'Linked firmo skill to:\n'
printf '  Claude Code: %s/firmo -> %s\n' "$CLAUDE_SKILLS" "$ROOT_DIR/dist/claude/firmo"
printf '  Codex:       %s/firmo -> %s\n' "$CODEX_SKILLS" "$ROOT_DIR/dist/codex/firmo"

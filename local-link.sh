#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
node "$ROOT_DIR/build.mjs"

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CLAUDE_SKILLS="$CLAUDE_HOME/skills"
CLAUDE_AGENTS="$CLAUDE_HOME/agents"
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

# Claude Code does not auto-discover skill-nested agents, so the firmo agents
# are linked as registered subagents under ~/.claude/agents (namespaced firmo-*).
link_claude_agents() {
  mkdir -p "$CLAUDE_AGENTS"
  rm -f "$CLAUDE_AGENTS"/firmo-*.md
  for agent in "$ROOT_DIR/dist/claude/agents"/firmo-*.md; do
    [ -f "$agent" ] || continue
    ln -s "$agent" "$CLAUDE_AGENTS/$(basename "$agent")"
  done
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
link_claude_agents

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
printf '  Claude Code: %s/firmo (+ agents in %s/firmo-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
printf '  Codex:       %s/firmo -> %s\n' "$CODEX_SKILLS" "$ROOT_DIR/dist/codex/firmo"

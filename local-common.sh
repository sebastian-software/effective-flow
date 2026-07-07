# shellcheck shell=sh
# Shared deployment logic for local-update.sh (copy) and local-link.sh (symlink).
#
# The entry scripts set ROOT_DIR and INSTALL_MODE (copy|link), source this file
# and call `firmo_deploy`. Only the install strategy (cp -R / ln -s) and the
# final report differ between the two; everything else is identical, so it lives
# here to avoid drift.

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CLAUDE_SKILLS="$CLAUDE_HOME/skills"
CLAUDE_AGENTS="$CLAUDE_HOME/agents"
CODEX_SKILLS="$HOME/.agents/skills"

# Firmo installs as a single directory skill named `firmo`. We only ever create
# or replace the `firmo` subdirectory (via copy or symlink per INSTALL_MODE). The
# parent skills directory (which may be an external symlink shared with other
# skills) is never removed or replaced.
install_skill() {
  built="$1"
  dest_dir="$2"
  mkdir -p "$dest_dir"
  rm -rf "$dest_dir/firmo"
  if [ "$INSTALL_MODE" = link ]; then
    ln -s "$built" "$dest_dir/firmo"
  else
    cp -R "$built" "$dest_dir/firmo"
  fi
}

# Claude Code does not auto-discover skill-nested agents, so the firmo agents
# ship as registered subagents under ~/.claude/agents (namespaced firmo-*).
install_claude_agents() {
  mkdir -p "$CLAUDE_AGENTS"
  rm -f "$CLAUDE_AGENTS"/firmo-*.md
  for agent in "$ROOT_DIR/dist/claude/agents"/firmo-*.md; do
    [ -f "$agent" ] || continue
    if [ "$INSTALL_MODE" = link ]; then
      ln -s "$agent" "$CLAUDE_AGENTS/$(basename "$agent")"
    else
      cp "$agent" "$CLAUDE_AGENTS/"
    fi
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

firmo_report() {
  if [ "$INSTALL_MODE" = link ]; then
    printf 'Linked firmo skill to:\n'
    printf '  Claude Code: %s/firmo (+ agents in %s/firmo-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/firmo -> %s\n' "$CODEX_SKILLS" "$ROOT_DIR/dist/codex/firmo"
  else
    printf 'Deployed firmo skill to:\n'
    printf '  Claude Code: %s/firmo (+ agents in %s/firmo-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/firmo\n' "$CODEX_SKILLS"
    printf 'Alternatively install as a standard agent skill via `npx skills`, or link it with dalo.\n'
  fi
}

firmo_deploy() {
  node "$ROOT_DIR/build.mjs"

  install_skill "$ROOT_DIR/dist/claude/firmo" "$CLAUDE_SKILLS"
  install_skill "$ROOT_DIR/dist/codex/firmo" "$CODEX_SKILLS"
  install_claude_agents

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

  firmo_report
}

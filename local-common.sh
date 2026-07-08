# shellcheck shell=sh
# Shared deployment logic for install-skill.sh (copy) and local-link.sh (symlink).
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
DIST_ROOT="${DIST_ROOT:-$ROOT_DIR/dist}"

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
  for agent in "$DIST_ROOT/claude/agents"/firmo-*.md; do
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
    printf '  Codex:       %s/firmo -> %s\n' "$CODEX_SKILLS" "$DIST_ROOT/codex/firmo"
  else
    printf 'Deployed firmo skill to:\n'
    printf '  Claude Code: %s/firmo (+ agents in %s/firmo-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/firmo\n' "$CODEX_SKILLS"
    printf 'Alternatively install as a standard agent skill via `npx skills`, or link it with dalo.\n'
  fi
}

firmo_deploy_from_dist() {
  if [ ! -d "$DIST_ROOT/claude/firmo" ] || [ ! -d "$DIST_ROOT/codex/firmo" ]; then
    printf 'Distribution not found under %s\n' "$DIST_ROOT" >&2
    exit 1
  fi

  install_skill "$DIST_ROOT/claude/firmo" "$CLAUDE_SKILLS"
  install_skill "$DIST_ROOT/codex/firmo" "$CODEX_SKILLS"
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

firmo_deploy() {
  node "$ROOT_DIR/build.mjs"
  DIST_ROOT="$ROOT_DIR/dist"
  firmo_deploy_from_dist
}

firmo_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

firmo_release_repo() {
  if [ -n "${FIRMO_REPO:-}" ]; then
    printf '%s\n' "$FIRMO_REPO"
    return 0
  fi

  remote="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || printf '')"
  repo="$(printf '%s\n' "$remote" | sed -n \
    -e 's#^https://github.com/\([^/][^/]*/[^/][^/]*\)\.git$#\1#p' \
    -e 's#^https://github.com/\([^/][^/]*/[^/][^/]*\)$#\1#p' \
    -e 's#^git@github.com:\([^/][^/]*/[^/][^/]*\)\.git$#\1#p')"
  if [ -n "$repo" ]; then
    printf '%s\n' "$repo"
  else
    printf 'fastner/firmo\n'
  fi
}

firmo_install_latest_release() {
  firmo_require_command gh
  firmo_require_command mktemp
  firmo_require_command tar

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
  repo="$(firmo_release_repo)"

  printf 'Downloading latest firmo release from %s...\n' "$repo"
  gh release download --repo "$repo" --pattern 'firmo-*.tar.gz' --dir "$tmp_dir"
  archive="$(find "$tmp_dir" -name 'firmo-*.tar.gz' -type f | sort | tail -n 1)"
  if [ -z "$archive" ]; then
    printf 'No firmo release archive found in latest release.\n' >&2
    exit 1
  fi

  mkdir -p "$tmp_dir/dist"
  tar -xzf "$archive" -C "$tmp_dir/dist"
  DIST_ROOT="$tmp_dir/dist"
  firmo_deploy_from_dist
}

# shellcheck shell=sh
# Shared deployment logic for install-skill.sh (copy) and local-link.sh (symlink).
#
# The entry scripts set ROOT_DIR and INSTALL_MODE (copy|link), source this file
# and call `effective_flow_deploy`. Only the install strategy (cp -R / ln -s) and
# the final report differ between the two; everything else is identical, so it
# lives here to avoid drift.

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CLAUDE_SKILLS="$CLAUDE_HOME/skills"
CLAUDE_AGENTS="$CLAUDE_HOME/agents"
CODEX_SKILLS="$HOME/.agents/skills"
DIST_ROOT="${DIST_ROOT:-$ROOT_DIR/dist}"

# Effective Flow installs as a single directory skill named `effective-flow`. We
# only ever create or replace the `effective-flow` subdirectory (via copy or
# symlink per INSTALL_MODE). The parent skills directory (which may be an
# external symlink shared with other skills) is never removed or replaced.
install_skill() {
  built="$1"
  dest_dir="$2"
  mkdir -p "$dest_dir"
  rm -rf "$dest_dir/effective-flow"
  if [ "$INSTALL_MODE" = link ]; then
    ln -s "$built" "$dest_dir/effective-flow"
  else
    cp -R "$built" "$dest_dir/effective-flow"
  fi
}

# Claude Code does not auto-discover skill-nested agents, so the Effective Flow
# agents ship as registered subagents under ~/.claude/agents (namespaced
# effective-flow-*).
install_claude_agents() {
  mkdir -p "$CLAUDE_AGENTS"
  rm -f "$CLAUDE_AGENTS"/effective-flow-*.md
  for agent in "$DIST_ROOT/claude/agents"/effective-flow-*.md; do
    [ -f "$agent" ] || continue
    if [ "$INSTALL_MODE" = link ]; then
      ln -s "$agent" "$CLAUDE_AGENTS/$(basename "$agent")"
    else
      cp "$agent" "$CLAUDE_AGENTS/"
    fi
  done
}

# Remove a retired install (skill directory or prefixed agents/skills) left by an
# earlier name so a stale `/firmo` or `/sf-*` skill cannot linger beside the new
# `/effective-flow`. Only ever removes the given legacy names, never
# `effective-flow` itself.
cleanup_retired_dir_entries() {
  dir="$1"
  prefix="$2"
  [ -d "$dir" ] || return 0
  for old in "$dir/$prefix"*; do
    [ -e "$old" ] || [ -L "$old" ] || continue
    rm -rf "$old"
  done
}

# Extract the effective-flow version string (e.g. "1.43.0 (22024cf)") the build
# stamped into the router SKILL.md, so the install report can name what was just
# placed.
effective_flow_installed_version() {
  skill_md="$DIST_ROOT/claude/effective-flow/SKILL.md"
  [ -f "$skill_md" ] || return 0
  sed -n 's/.*(Version \(.*\))\..*/\1/p' "$skill_md"
}

effective_flow_report() {
  version="$(effective_flow_installed_version)"
  if [ -n "$version" ]; then
    printf 'effective-flow %s\n' "$version"
  fi
  if [ "$INSTALL_MODE" = link ]; then
    printf 'Linked effective-flow skill to:\n'
    printf '  Claude Code: %s/effective-flow (+ agents in %s/effective-flow-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/effective-flow -> %s\n' "$CODEX_SKILLS" "$DIST_ROOT/codex/effective-flow"
  else
    printf 'Deployed effective-flow skill to:\n'
    printf '  Claude Code: %s/effective-flow (+ agents in %s/effective-flow-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/effective-flow\n' "$CODEX_SKILLS"
    printf 'Alternatively install as a standard agent skill via `npx skills`, or link it with dalo.\n'
  fi
}

effective_flow_deploy_from_dist() {
  if [ ! -d "$DIST_ROOT/claude/effective-flow" ] || [ ! -d "$DIST_ROOT/codex/effective-flow" ]; then
    printf 'Distribution not found under %s\n' "$DIST_ROOT" >&2
    exit 1
  fi

  install_skill "$DIST_ROOT/claude/effective-flow" "$CLAUDE_SKILLS"
  install_skill "$DIST_ROOT/codex/effective-flow" "$CODEX_SKILLS"
  install_claude_agents

  # --- Cleanup retired firmo-/sf-* installs and the old Claude marketplace ---
  for legacy in firmo sf-; do
    cleanup_retired_dir_entries "$CLAUDE_SKILLS" "$legacy"
    cleanup_retired_dir_entries "$CODEX_SKILLS" "$legacy"
    cleanup_retired_dir_entries "$CODEX_HOME/skills" "$legacy"
    cleanup_retired_dir_entries "$CLAUDE_AGENTS" "$legacy"
  done
  if [ -d "$CODEX_HOME/agents" ]; then
    for old_agent in "$CODEX_HOME/agents"/firmo-*.toml "$CODEX_HOME/agents"/sf-*.toml; do
      [ -e "$old_agent" ] || [ -L "$old_agent" ] || continue
      rm -f "$old_agent"
    done
  fi
  rm -rf "$CLAUDE_HOME/plugins/marketplaces/sf-claude-plugin"

  effective_flow_report
}

effective_flow_deploy() {
  node "$ROOT_DIR/build.mjs"
  DIST_ROOT="$ROOT_DIR/dist"
  effective_flow_deploy_from_dist
}

effective_flow_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

effective_flow_release_repo() {
  # EFFECTIVE_FLOW_REPO overrides the release repo; the legacy FIRMO_REPO is still
  # honoured for backward compatibility.
  if [ -n "${EFFECTIVE_FLOW_REPO:-}" ]; then
    printf '%s\n' "$EFFECTIVE_FLOW_REPO"
    return 0
  fi
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
    printf 'sebastian-software/effective-flow\n'
  fi
}

effective_flow_install_latest_release() {
  effective_flow_require_command gh
  effective_flow_require_command mktemp
  effective_flow_require_command tar

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
  repo="$(effective_flow_release_repo)"

  printf 'Downloading latest effective-flow release from %s...\n' "$repo"
  gh release download --repo "$repo" --pattern 'effective-flow-*.tar.gz' --dir "$tmp_dir"
  archive="$(find "$tmp_dir" -name 'effective-flow-*.tar.gz' -type f | sort | tail -n 1)"
  if [ -z "$archive" ]; then
    printf 'No effective-flow release archive found in latest release.\n' >&2
    exit 1
  fi

  mkdir -p "$tmp_dir/dist"
  tar -xzf "$archive" -C "$tmp_dir/dist"
  DIST_ROOT="$tmp_dir/dist"
  effective_flow_deploy_from_dist
}

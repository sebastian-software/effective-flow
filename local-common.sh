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
CODEX_AGENTS="$CODEX_HOME/agents"
DIST_ROOT="${DIST_ROOT:-$ROOT_DIR/dist}"
CLAUDE_AGENT_MANIFEST="$CLAUDE_AGENTS/.effective-flow-agents.manifest"
CODEX_AGENT_MANIFEST="$CODEX_AGENTS/.effective-flow-agents.manifest"

# Frozen migration allowlists. These are names the direct installer historically
# created itself; cleanup must never infer ownership from a broad prefix glob.
EFFECTIVE_FLOW_OWNED_WORKERS='code-documenter code-validator docs-writer e2e-tester frontend-reviewer generic-implementer marketing-writer nodejs-implementer nodejs-reviewer rust-implementer rust-reviewer test-writer ui-implementer'
LEGACY_SF_SKILLS='sf-apply sf-apply-issues sf-apply-plan sf-apply-review sf-build sf-code-documenter sf-code-validator sf-commit sf-docs sf-docs-writer sf-e2e-tester sf-fix sf-frontend-reviewer sf-investigate sf-maintain sf-nodejs-implementer sf-nodejs-reviewer sf-open-plans sf-plan sf-plan-issues sf-pr sf-refactor sf-review sf-rust-implementer sf-rust-reviewer sf-setup sf-test-writer sf-ui-implementer sf-version'

# Effective Flow installs as a single directory skill named `effective-flow`. We
# only ever create or replace the `effective-flow` subdirectory (via copy or
# symlink per INSTALL_MODE). The parent skills directory (which may be an
# external symlink shared with other skills) is never removed or replaced.
install_skill() {
  built="$1"
  dest_dir="$2"
  mkdir -p "$dest_dir" || return 1
  rm -rf "$dest_dir/effective-flow" || return 1
  if [ "$INSTALL_MODE" = link ]; then
    ln -s "$built" "$dest_dir/effective-flow" || return 1
  else
    cp -R "$built" "$dest_dir/effective-flow" || return 1
  fi
}

agent_name_from_artifact() {
  artifact="$1"
  harness="$2"
  if [ "$harness" = claude ]; then
    sed -n 's/^name:[[:space:]]*//p' "$artifact" | sed -n '1p'
  else
    sed -n 's/^name[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*$/\1/p' "$artifact" | sed -n '1p'
  fi
}

# Native agents are release sidecars, not files nested inside the skill. Check
# both complete sets before changing an existing installation so a damaged
# archive cannot leave either harness half-updated.
validate_native_agents() {
  harness="$1"
  source_dir="$2"
  extension="$3"
  counterpart_dir="$4"
  counterpart_extension="$5"
  found=false

  if [ ! -d "$source_dir" ]; then
    printf 'Native %s agent distribution not found under %s\n' "$harness" "$source_dir" >&2
    return 1
  fi

  for artifact in "$source_dir"/*; do
    [ -e "$artifact" ] || [ -L "$artifact" ] || continue
    artifact_name="$(basename "$artifact")"
    case "$artifact_name" in
      effective-flow-*".$extension") ;;
      *)
        printf 'Unexpected native %s agent artifact: %s\n' "$harness" "$artifact" >&2
        return 1
        ;;
    esac
    if [ ! -f "$artifact" ] || [ -L "$artifact" ]; then
      printf 'Native %s agent artifact must be a regular file: %s\n' "$harness" "$artifact" >&2
      return 1
    fi

    worker_name="${artifact_name%."$extension"}"
    worker_suffix="${worker_name#effective-flow-}"
    case "$worker_suffix" in
      ''|*[!a-z0-9-]*|-*|*-)
        printf 'Malformed native %s agent filename: %s\n' "$harness" "$artifact" >&2
        return 1
        ;;
    esac
    declared_name="$(agent_name_from_artifact "$artifact" "$harness")"
    if [ "$declared_name" != "$worker_name" ]; then
      printf 'Native %s agent name does not match its filename: %s\n' "$harness" "$artifact" >&2
      return 1
    fi
    counterpart="$counterpart_dir/$worker_name.$counterpart_extension"
    if [ ! -f "$counterpart" ] || [ -L "$counterpart" ]; then
      printf 'Native %s agent has no matching sidecar: %s\n' "$harness" "$counterpart" >&2
      return 1
    fi
    found=true
  done

  if [ "$found" != true ]; then
    printf 'Native %s agent distribution contains no effective-flow agents: %s\n' "$harness" "$source_dir" >&2
    return 1
  fi
}

validate_native_distribution() {
  if [ ! -d "$DIST_ROOT/claude/effective-flow" ] || [ ! -d "$DIST_ROOT/codex/effective-flow" ]; then
    printf 'Distribution not found under %s\n' "$DIST_ROOT" >&2
    return 1
  fi
  validate_native_agents \
    claude "$DIST_ROOT/claude/agents" md "$DIST_ROOT/codex/agents" toml || return 1
  validate_native_agents \
    codex "$DIST_ROOT/codex/agents" toml "$DIST_ROOT/claude/agents" md || return 1
}

validate_agent_install_target() {
  source_dir="$1"
  dest_dir="$2"
  manifest="$3"
  extension="$4"

  if { [ -e "$dest_dir" ] || [ -L "$dest_dir" ]; } && [ ! -d "$dest_dir" ]; then
    printf 'Native agent destination must be a directory: %s\n' "$dest_dir" >&2
    return 1
  fi
  if [ -d "$manifest" ]; then
    printf 'Agent ownership manifest must not be a directory: %s\n' "$manifest" >&2
    return 1
  fi
  for agent in "$source_dir"/effective-flow-*".$extension"; do
    destination="$dest_dir/$(basename "$agent")"
    if [ -d "$destination" ] && [ ! -L "$destination" ]; then
      printf 'Cannot replace agent directory with a file: %s\n' "$destination" >&2
      return 1
    fi
  done
}

is_owned_agent_name() {
  candidate="$1"
  extension="$2"
  case "$candidate" in
    */*|.|..|'') return 1 ;;
    effective-flow-*".$extension")
      worker_name="${candidate%."$extension"}"
      worker_suffix="${worker_name#effective-flow-}"
      case "$worker_suffix" in
        ''|*[!a-z0-9-]*|-*|*-) return 1 ;;
        *) return 0 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

remove_recorded_agents() {
  dest_dir="$1"
  manifest="$2"
  extension="$3"
  [ -f "$manifest" ] || return 0

  while IFS= read -r owned_name || [ -n "$owned_name" ]; do
    is_owned_agent_name "$owned_name" "$extension" || continue
    owned_path="$dest_dir/$owned_name"
    # A manifest only owns files and links. Never turn a corrupt manifest into
    # recursive directory deletion.
    if [ ! -d "$owned_path" ] || [ -L "$owned_path" ]; then
      rm -f "$owned_path" || return 1
    fi
  done < "$manifest"
}

# Releases before ownership manifests removed all effective-flow-* agents on
# every install. Migrate only the exact worker names those releases shipped, and
# only when no manifest exists yet. This catches stale agents after a worker was
# removed without claiming similarly named foreign files.
remove_pre_manifest_agents() {
  dest_dir="$1"
  manifest="$2"
  extension="$3"
  [ -e "$manifest" ] || [ -L "$manifest" ] || {
    for worker in $EFFECTIVE_FLOW_OWNED_WORKERS; do
      owned_path="$dest_dir/effective-flow-$worker.$extension"
      if [ ! -d "$owned_path" ] || [ -L "$owned_path" ]; then
        rm -f "$owned_path" || return 1
      fi
    done
  }
  return 0
}

install_native_agents() {
  source_dir="$1"
  dest_dir="$2"
  manifest="$3"
  extension="$4"

  mkdir -p "$dest_dir" || return 1
  remove_pre_manifest_agents "$dest_dir" "$manifest" "$extension" || return 1
  remove_recorded_agents "$dest_dir" "$manifest" "$extension" || return 1
  manifest_tmp="$manifest.tmp.$$"
  : > "$manifest_tmp" || return 1

  for agent in "$source_dir"/effective-flow-*".$extension"; do
    agent_name="$(basename "$agent")"
    destination="$dest_dir/$agent_name"
    if [ -d "$destination" ] && [ ! -L "$destination" ]; then
      rm -f "$manifest_tmp"
      printf 'Cannot replace agent directory with a file: %s\n' "$destination" >&2
      return 1
    fi
    if ! rm -f "$destination"; then
      rm -f "$manifest_tmp"
      return 1
    fi
    if [ "$INSTALL_MODE" = link ]; then
      if ! ln -s "$agent" "$destination"; then
        rm -f "$manifest_tmp"
        return 1
      fi
    else
      if ! cp "$agent" "$destination"; then
        rm -f "$manifest_tmp"
        return 1
      fi
    fi
    if ! printf '%s\n' "$agent_name" >> "$manifest_tmp"; then
      rm -f "$manifest_tmp"
      return 1
    fi
  done

  if ! mv "$manifest_tmp" "$manifest"; then
    rm -f "$manifest_tmp"
    return 1
  fi
}

# Remove only retired skill names that an earlier installer actually created.
cleanup_retired_skill_entries() {
  dir="$1"
  [ -d "$dir" ] || return 0
  for legacy_name in firmo $LEGACY_SF_SKILLS; do
    old="$dir/$legacy_name"
    [ -e "$old" ] || [ -L "$old" ] || continue
    rm -rf "$old"
  done
}

cleanup_retired_agent_entries() {
  dir="$1"
  extension="$2"
  [ -d "$dir" ] || return 0
  for worker in $EFFECTIVE_FLOW_OWNED_WORKERS; do
    for legacy_prefix in firmo sf; do
      old="$dir/$legacy_prefix-$worker.$extension"
      [ -e "$old" ] || [ -L "$old" ] || continue
      rm -f "$old"
    done
  done
}

# Extract the effective-flow version string (e.g. "1.43.0 (22024cf)") the build
# stamped into the router SKILL.md, so the install report can name what was just
# placed.
effective_flow_installed_version() {
  skill_md="$DIST_ROOT/claude/effective-flow/SKILL.md"
  [ -f "$skill_md" ] || return 0
  sed -n 's/.*(version \(.*\))\..*/\1/p' "$skill_md"
}

effective_flow_report() {
  version="$(effective_flow_installed_version)"
  if [ -n "$version" ]; then
    printf 'effective-flow %s\n' "$version"
  fi
  if [ "$INSTALL_MODE" = link ]; then
    printf 'Linked effective-flow skill to:\n'
    printf '  Claude Code: %s/effective-flow (+ agents in %s/effective-flow-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/effective-flow -> %s (+ agents in %s/effective-flow-*.toml)\n' "$CODEX_SKILLS" "$DIST_ROOT/codex/effective-flow" "$CODEX_AGENTS"
  else
    printf 'Deployed effective-flow skill to:\n'
    printf '  Claude Code: %s/effective-flow (+ agents in %s/effective-flow-*.md)\n' "$CLAUDE_SKILLS" "$CLAUDE_AGENTS"
    printf '  Codex:       %s/effective-flow (+ agents in %s/effective-flow-*.toml)\n' "$CODEX_SKILLS" "$CODEX_AGENTS"
    # Backticks are intentional literal CLI notation in this user-facing text.
    # shellcheck disable=SC2016
    printf 'Alternatively install as a standard agent skill via `npx skills`, or link it with dalo.\n'
  fi
}

effective_flow_deploy_from_dist() {
  validate_native_distribution || return 1
  validate_agent_install_target \
    "$DIST_ROOT/claude/agents" "$CLAUDE_AGENTS" "$CLAUDE_AGENT_MANIFEST" md || return 1
  validate_agent_install_target \
    "$DIST_ROOT/codex/agents" "$CODEX_AGENTS" "$CODEX_AGENT_MANIFEST" toml || return 1

  install_skill "$DIST_ROOT/claude/effective-flow" "$CLAUDE_SKILLS" || return 1
  install_skill "$DIST_ROOT/codex/effective-flow" "$CODEX_SKILLS" || return 1
  install_native_agents \
    "$DIST_ROOT/claude/agents" "$CLAUDE_AGENTS" "$CLAUDE_AGENT_MANIFEST" md || return 1
  install_native_agents \
    "$DIST_ROOT/codex/agents" "$CODEX_AGENTS" "$CODEX_AGENT_MANIFEST" toml || return 1

  # --- Cleanup retired firmo-/sf-* installs and the old Claude marketplace ---
  cleanup_retired_skill_entries "$CLAUDE_SKILLS"
  cleanup_retired_skill_entries "$CODEX_SKILLS"
  cleanup_retired_skill_entries "$CODEX_HOME/skills"
  cleanup_retired_agent_entries "$CLAUDE_AGENTS" md
  cleanup_retired_agent_entries "$CODEX_AGENTS" toml
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

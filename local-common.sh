# shellcheck shell=sh
# Shared installer logic for install-skill.sh and local-link.sh.
#
# Two installation paths live here:
#
#   * Native deployment from this checkout, used by `install-skill.sh local`
#     (copy) and `local-link.sh` (symlink). The entry scripts set ROOT_DIR and
#     INSTALL_MODE (copy|link), source this file and call
#     `effective_flow_deploy`. Only the install strategy (cp -R / ln -s) and the
#     final report differ between the two; everything else is identical, so it
#     lives here to avoid drift.
#
#   * The default mode of install-skill.sh, which installs and updates the
#     published portable build through the DALO skill manager
#     (`effective_flow_install_through_dalo`) and migrates away the artifacts a
#     previous native installation left behind.

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
    # A native copy claims the skill slot outright, so a DALO-managed link that
    # occupied it before is gone. Say so instead of letting the next DALO run
    # surprise the developer.
    printf 'The skill slot is now installer-owned; dalo sync --check reports a conflict for it\n'
    printf 'until the default installer mode runs again.\n'
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

# The optional second argument is a remediation line printed below the generic
# message, so one missing command produces one coherent report instead of two
# separate checks each printing their own half.
effective_flow_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    if [ -n "${2:-}" ]; then
      printf '%s\n' "$2" >&2
    fi
    exit 1
  fi
}

# --- DALO driver -------------------------------------------------------------
#
# The default mode of install-skill.sh installs and updates the published
# portable build through the DALO skill manager. Every command behaviour the
# driver relies on was verified against DALO 0.9.2.

EFFECTIVE_FLOW_DALO_SOURCE=effective-flow
EFFECTIVE_FLOW_DALO_SLOT=effective-flow
EFFECTIVE_FLOW_DALO_HOMEPAGE='https://github.com/sebastian-software/dalo'
EFFECTIVE_FLOW_DEFAULT_CATALOG_URL='https://github.com/sebastian-software/effective-flow.git'

# Resolve the catalog Git URL. EFFECTIVE_FLOW_REPO overrides it and the legacy
# FIRMO_REPO is still honoured; both accept a full clone URL or an `owner/name`
# GitHub slug. The override is what allows exercising the driver against a local
# Git fixture without network access.
effective_flow_catalog_url() {
  configured="${EFFECTIVE_FLOW_REPO:-}"
  if [ -z "$configured" ]; then
    configured="${FIRMO_REPO:-}"
  fi
  if [ -z "$configured" ]; then
    printf '%s\n' "$EFFECTIVE_FLOW_DEFAULT_CATALOG_URL"
    return 0
  fi

  # A slug carries no scheme, no `host:path` SSH prefix, no leading path
  # separator and exactly one slash. Everything else is already a clone URL and
  # is passed through untouched.
  case "$configured" in
    *://* | *:*/* | /* | ./* | ../* | */*/*) printf '%s\n' "$configured" ;;
    */*) printf 'https://github.com/%s.git\n' "$configured" ;;
    *) printf '%s\n' "$configured" ;;
  esac
}

# --- One-time migration off the native direct installation -------------------
#
# The previous default mode copied native agents and skill directories into the
# harness homes, and DALO cannot adopt those files. The driver therefore removes
# what this project provably owns before DALO claims the slot. The migration is
# condition-based rather than marker-based: it acts only when leftovers exist,
# which makes it idempotent without a state file.

# Remove the agents an ownership manifest records, then the manifest itself.
# `remove_recorded_agents` is manifest-scoped and already ignores path-traversal
# entries, so a corrupt manifest cannot widen the removal.
effective_flow_migrate_recorded_agents() {
  migrate_harness="$1"
  migrate_dir="$2"
  migrate_manifest="$3"
  migrate_extension="$4"

  [ -f "$migrate_manifest" ] || return 0

  migrate_count=0
  while IFS= read -r migrate_name || [ -n "$migrate_name" ]; do
    is_owned_agent_name "$migrate_name" "$migrate_extension" || continue
    migrate_path="$migrate_dir/$migrate_name"
    if [ -e "$migrate_path" ] || [ -L "$migrate_path" ]; then
      migrate_count=$((migrate_count + 1))
    fi
  done < "$migrate_manifest"

  remove_recorded_agents "$migrate_dir" "$migrate_manifest" "$migrate_extension" || return 1
  if [ "$migrate_count" -gt 0 ]; then
    printf 'Removed %s native %s agent(s) recorded in %s\n' \
      "$migrate_count" "$migrate_harness" "$migrate_manifest"
  fi
  rm -f "$migrate_manifest" || return 1
  printf 'Removed the native %s agent manifest %s\n' "$migrate_harness" "$migrate_manifest"
}

# Read the `name` field a file declares in its leading YAML frontmatter. Only the
# block between the opening `---` and the next `---` counts, so a `name:` line in
# the document body cannot fake the declaration. Emits nothing when the file has
# no frontmatter or declares no name.
effective_flow_frontmatter_name() {
  frontmatter_path="$1"
  frontmatter_first="$(sed -n -e '1s/[[:space:]]*$//' -e '1p' "$frontmatter_path")"
  [ "$frontmatter_first" = '---' ] || return 0

  sed -n -e '1d' -e '/^---[[:space:]]*$/q' -e 's/^name:[[:space:]]*//p' "$frontmatter_path" |
    sed -n -e '1s/[[:space:]]*$//' -e '1p'
}

# Directory shape is no proof of ownership: `npx skills add --copy` and a
# hand-placed skill both create a real directory in exactly this slot. A directory
# therefore counts as a native install only with the signature `install-skill.sh
# local` and `local-link.sh` produce — a regular SKILL.md declaring
# `name: effective-flow`, and no `workers/` entry. Bundled worker contracts are
# the portable build's marker, so a `workers/` entry proves a manager (DALO or the
# Skills CLI) owns the directory and this project's native installer never wrote
# it.
effective_flow_is_native_skill_install() {
  native_slot="$1"

  if [ -e "$native_slot/workers" ] || [ -L "$native_slot/workers" ]; then
    return 1
  fi
  native_skill_md="$native_slot/SKILL.md"
  if [ ! -f "$native_skill_md" ] || [ -L "$native_skill_md" ]; then
    return 1
  fi
  [ "$(effective_flow_frontmatter_name "$native_skill_md")" = effective-flow ]
}

# Reclaim a target skill slot only in the two shapes the native installers
# produce: a real directory (copy mode) or a symlink into this checkout's dist/
# (link mode). Anything else is left alone — a symlink pointing elsewhere,
# including a DALO-managed link into the DALO store, and a real directory a skill
# manager or a human placed there. Whatever the migration declines to remove is
# caught afterwards by `dalo sync --check`, which blocks on an unmanaged entry, so
# the run still fails loudly instead of silently deleting foreign content.
#
# A symlink into dist/ carries its own proof: it points into this very checkout.
# A real directory does not, so it needs both an ownership proof and a content
# check, and the ownership proof comes first. `slot_installed` states whether this
# harness's agent manifest existed when the migration began — a file only
# `install_native_agents` writes, so its presence is evidence that this project's
# native installer ran on this machine for this harness. Content alone never
# qualifies: a directory carrying the native signature can still be a fork or a
# hand-placed copy, and identity is not ownership.
effective_flow_migrate_skill_slot() {
  slot_harness="$1"
  slot_path="$2"
  slot_installed="${3:-false}"

  if [ -L "$slot_path" ]; then
    slot_target="$(readlink "$slot_path" 2>/dev/null || printf '')"
    case "$slot_target" in
      "$DIST_ROOT"/*) ;;
      *) return 0 ;;
    esac
  elif [ -d "$slot_path" ]; then
    if [ "$slot_installed" != true ]; then
      printf 'Left %s untouched: no %s agent manifest proves this installer created it\n' \
        "$slot_path" "$slot_harness"
      return 0
    fi
    if ! effective_flow_is_native_skill_install "$slot_path"; then
      printf 'Left %s untouched: it is not a native %s skill install\n' \
        "$slot_path" "$slot_harness"
      return 0
    fi
  else
    return 0
  fi

  rm -rf "$slot_path" || return 1
  printf 'Removed the native %s skill install %s\n' "$slot_harness" "$slot_path"
}

# Membership test against the space-separated list of DALO targets that linked
# successfully.
effective_flow_target_linked() {
  case " $2 " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# Migrate only the harnesses named in the list of successfully linked DALO
# targets. DALO materializes into linked targets only, so removing the native
# install of a harness whose link failed would leave that harness with nothing in
# its place while the run continues. Report every removal on its own line, and
# stay silent when there is nothing to migrate.
# A manifest is read as ownership evidence only as a regular file. A symlink of
# that name is something else pointing somewhere else, and following it would let
# a link a stranger placed authorize a recursive delete.
effective_flow_native_install_recorded() {
  [ -f "$1" ] && [ ! -L "$1" ]
}

effective_flow_migrate_native_install() {
  migrate_targets="${1:-}"

  # Capture the manifest evidence before the agent step runs: that step removes
  # the manifest, so a later check would always find it gone and no real
  # directory would ever be reclaimed.
  claude_recorded=false
  codex_recorded=false
  if effective_flow_native_install_recorded "$CLAUDE_AGENT_MANIFEST"; then
    claude_recorded=true
  fi
  if effective_flow_native_install_recorded "$CODEX_AGENT_MANIFEST"; then
    codex_recorded=true
  fi

  if effective_flow_target_linked claude "$migrate_targets"; then
    effective_flow_migrate_recorded_agents \
      Claude "$CLAUDE_AGENTS" "$CLAUDE_AGENT_MANIFEST" md || return 1
    effective_flow_migrate_skill_slot \
      Claude "$CLAUDE_SKILLS/effective-flow" "$claude_recorded" || return 1
  else
    printf 'Left the native Claude install in place: its DALO target did not link\n'
  fi

  if effective_flow_target_linked codex "$migrate_targets"; then
    effective_flow_migrate_recorded_agents \
      Codex "$CODEX_AGENTS" "$CODEX_AGENT_MANIFEST" toml || return 1
    effective_flow_migrate_skill_slot \
      Codex "$CODEX_SKILLS/effective-flow" "$codex_recorded" || return 1
  else
    printf 'Left the native Codex install in place: its DALO target did not link\n'
  fi
}

# --- DALO command helpers ----------------------------------------------------

# `dalo --json source list` pretty-prints one field per line, so the registered
# entry is located by collapsing the document and splitting it back into one line
# per object. Emits nothing when the source is not registered. Verified against
# DALO 0.9.2.
# A pipeline reports only its last command's status, so the listing runs on its
# own first. Otherwise a broken store would look exactly like an unregistered
# source, and the run would fail later with a misattributed "already exists".
effective_flow_dalo_source_entry() {
  if ! source_list_output="$(dalo --json source list 2>&1)"; then
    printf '%s\n' "$source_list_output" >&2
    printf 'DALO could not list its sources, so whether %s is registered is unknown.\n' \
      "$EFFECTIVE_FLOW_DALO_SOURCE" >&2
    return 1
  fi

  printf '%s\n' "$source_list_output" |
    tr -d ' \n\t' |
    tr '{' '\n' |
    grep "\"id\":\"$EFFECTIVE_FLOW_DALO_SOURCE\"" |
    sed -n '1p'
}

# Whether DALO can actually resolve the skill, read from `dalo --json status`.
#
# This exists because an exit code is not that answer. `dalo source select`
# prints "installation policy: blocked until risk is explicitly accepted" and
# still exits 0, so a run that gates on its status walks straight past an
# unapproved skill, migrates the native install away and only then fails at
# `dalo sync --check` — leaving the harness with nothing installed. Verified
# against DALO 0.9.2.
#
# `resolution` reports the state per skill, separately from `unmanaged_skills`.
# That separation is the point: the unmanaged entry is the native install this
# migration is about to clear, while a pending approval or a blocked audit is a
# decision only the operator can make. Each array is extracted by its own key, so
# the check does not depend on the order of the keys around it.
#
# Exit status: 0 resolvable, 1 not resolvable, 2 the state could not be read.
# Callers that only gate on installability keep treating every non-zero status as
# "do not proceed"; the blocked-advance report needs the third answer, because a
# failed probe must not be reported as a missing approval record.
effective_flow_dalo_resolvable() {
  if ! status_output="$(dalo --json status 2>&1)"; then
    printf '%s\n' "$status_output" >&2
    printf 'DALO could not report its status, so whether %s is installable is unknown.\n' \
      "$EFFECTIVE_FLOW_DALO_SLOT" >&2
    return 2
  fi

  status_flat="$(printf '%s\n' "$status_output" | tr -d ' \n\t')"
  status_ref="\"source_ref\":\"$EFFECTIVE_FLOW_DALO_SOURCE:$EFFECTIVE_FLOW_DALO_SLOT\""

  for status_key in pending_approval_skills blocked_skills; do
    status_group="$(printf '%s\n' "$status_flat" |
      sed -n "s/.*\"$status_key\":\(\[[^]]*\]\).*/\1/p")"
    case "$status_group" in
      *"$status_ref"*) return 1 ;;
    esac
  done

  status_active="$(printf '%s\n' "$status_flat" |
    sed -n 's/.*"active_skills":\(\[[^]]*\]\).*/\1/p')"
  case "$status_active" in
    *"$status_ref"*) return 0 ;;
    *) return 1 ;;
  esac
}

effective_flow_dalo_source_url() {
  printf '%s\n' "$1" | sed -n 's/.*,"url":"\([^"]*\)".*/\1/p' | sed -n '1p'
}

# `source select` (first install) and `source refresh --advance` (update) both
# fail with a message that embeds the staged audit path. That path is derived
# from the candidate's content hash and therefore has to be read from the failing
# command rather than reconstructed. Verified against DALO 0.9.2; a future DALO
# release that exposes the staged path as a JSON field should replace this text
# extraction. The installer never accepts the risk itself and never suggests a
# reason: the reason is the operator's own declaration.
#
# DALO gates an update behind two independent acceptances: the staged audit that
# releases the catalog advance, and the approval record that lets `dalo sync`
# materialize the skill. Neither implies the other, so a blocked gate also reads
# the resolution state and names every step that is still open — otherwise the
# operator resolves one, reruns, and is stopped by the other.
effective_flow_dalo_guarded() {
  gate_step="$1"
  shift
  if gate_output="$(dalo "$@" 2>&1)"; then
    if [ -n "$gate_output" ]; then
      printf '%s\n' "$gate_output"
    fi
    return 0
  fi

  printf '%s\n' "$gate_output" >&2
  gate_path="$(printf '%s\n' "$gate_output" |
    sed -n "s/.*dalo audit '\([^']*\)'.*/\1/p" | sed -n '1p')"
  if [ -z "$gate_path" ]; then
    printf 'DALO failed during %s.\n' "$gate_step" >&2
    exit 1
  fi

  printf "DALO's security audit blocks the effective-flow skill, so %s stopped.\n" "$gate_step" >&2
  printf 'Review the staged copy and, if you accept its findings, run:\n' >&2
  printf "  dalo audit '%s' --accept-risk \"<reason>\"\n" "$gate_path" >&2

  # The probe enriches the report; it must never replace it. A skill that is
  # already approved keeps today's single-remedy output, and an unreadable status
  # is disclosed rather than guessed at.
  if effective_flow_dalo_resolvable; then
    gate_resolution=0
  else
    gate_resolution=$?
  fi
  if [ "$gate_resolution" -eq 1 ]; then
    printf 'The skill also carries no approval record, so both acceptance steps are open;\n' >&2
    printf 'run this one too before starting the installer again:\n' >&2
    printf '  dalo approve skill %s --accept-risk "<reason>"\n' \
      "$EFFECTIVE_FLOW_DALO_SOURCE:$EFFECTIVE_FLOW_DALO_SLOT" >&2
  elif [ "$gate_resolution" -ne 0 ]; then
    printf 'Whether an approval record is also missing could not be determined; run "dalo status".\n' >&2
  fi

  printf 'Write <reason> yourself; this installer never accepts risk on your behalf.\n' >&2
  printf 'Then run this installer again.\n' >&2
  exit 1
}

effective_flow_dalo_report() {
  report_targets="$1"
  printf 'Effective Flow is installed and managed by DALO.\n'
  printf 'Linked harness targets:%s\n' "$report_targets"
  printf 'DALO materializes the portable build: one skill with bundled worker contracts under\n'
  printf 'workers/, delegated through the harness subagent mechanism instead of native agent\n'
  printf 'sidecars. Run "dalo status" for the installed locations, or ./install-skill.sh local\n'
  printf 'for a native install of the current checkout with its per-role model and effort\n'
  printf 'profiles.\n'
}

effective_flow_install_through_dalo() {
  effective_flow_require_command dalo \
    "Install DALO first: $EFFECTIVE_FLOW_DALO_HOMEPAGE"

  catalog_url="$(effective_flow_catalog_url)"

  dalo init

  # `dalo target link` creates a missing harness directory, so a single failure
  # is tolerated; only losing both targets leaves nothing to sync into.
  dalo_targets=''
  for dalo_target in claude codex; do
    if dalo target link "$dalo_target"; then
      dalo_targets="$dalo_targets $dalo_target"
    else
      printf 'DALO could not link the %s target; continuing without it.\n' "$dalo_target" >&2
    fi
  done
  if [ -z "$dalo_targets" ]; then
    printf 'DALO linked no harness target, so there is nothing to install into.\n' >&2
    exit 1
  fi

  # `source add-catalog` is not idempotent, so it runs only for an unregistered
  # source. A registered source pointing elsewhere is reported, never silently
  # re-pointed.
  source_entry="$(effective_flow_dalo_source_entry)" || exit 1
  if [ -z "$source_entry" ]; then
    dalo source add-catalog "$EFFECTIVE_FLOW_DALO_SOURCE" "$catalog_url"
    source_registered=false
  else
    registered_url="$(effective_flow_dalo_source_url "$source_entry")"
    if [ -n "$registered_url" ] && [ "$registered_url" != "$catalog_url" ]; then
      printf 'The registered DALO source %s points at a different repository.\n' \
        "$EFFECTIVE_FLOW_DALO_SOURCE" >&2
      printf '  registered: %s\n' "$registered_url" >&2
      printf '  requested:  %s\n' "$catalog_url" >&2
      printf 'Re-point or remove the source yourself, then run this installer again.\n' >&2
      exit 1
    fi
    source_registered=true
  fi

  effective_flow_dalo_guarded 'the skill selection' \
    source select "$EFFECTIVE_FLOW_DALO_SOURCE" "$EFFECTIVE_FLOW_DALO_SLOT"
  # The catalog pin is deliberate, so an already-registered source only moves to
  # a newer release through an explicit advance.
  if [ "$source_registered" = true ]; then
    effective_flow_dalo_guarded 'the catalog advance' \
      source refresh "$EFFECTIVE_FLOW_DALO_SOURCE" --advance
  fi

  # Nothing is removed before DALO can prove it will install the replacement.
  # The audit-gated commands above report a block without failing, so this is the
  # step that actually stops an unapproved run — before the migration, never
  # after it.
  #
  # This gate needs no aggregation of its own, and that asymmetry is deliberate:
  # by the time it runs, the advance has already resolved, so the only remaining
  # open step is the approval record it names here. Making it symmetric with the
  # blocked-advance report would add a second lookup with nothing left to find.
  if ! effective_flow_dalo_resolvable; then
    printf 'DALO cannot install %s yet, so nothing was removed.\n' \
      "$EFFECTIVE_FLOW_DALO_SLOT" >&2
    printf 'Its security audit needs an explicit decision. Review the findings with\n' >&2
    printf '"dalo audit %s" and, if you accept them, run:\n' \
      "$EFFECTIVE_FLOW_DALO_SOURCE:$EFFECTIVE_FLOW_DALO_SLOT" >&2
    printf '  dalo approve skill %s --accept-risk "<reason>"\n' \
      "$EFFECTIVE_FLOW_DALO_SOURCE:$EFFECTIVE_FLOW_DALO_SLOT" >&2
    printf 'Write <reason> yourself; this installer never accepts risk on your behalf.\n' >&2
    printf 'Run "dalo status" for the exact blocking state, then run this installer again.\n' >&2
    exit 1
  fi

  # Free the slot before DALO claims it, for the linked targets only: a harness
  # DALO cannot materialize into must keep its native install. Bare `dalo sync`
  # exits 0 even when an unmanaged entry blocks a slot, so only `--check` turns a
  # failed migration into a visible failure.
  effective_flow_migrate_native_install "$dalo_targets" || exit 1

  if ! dalo sync --check; then
    printf 'DALO reports state that needs review; the report above names what is blocked.\n' >&2
    printf 'Resolve it and run this installer again.\n' >&2
    exit 1
  fi

  effective_flow_dalo_report "$dalo_targets"
}

# Harness-dictated worktree locations

**Status:** Active

Supersedes, for two cases, the "harness-supported flow" and no-switch rules for a reused
harness-managed worktree (part 1 below).

## Context

Effective Flow runs in Claude Code, in Codex (CLI and app), and in T3 Code, which runs the `claude`
or `codex` bundle. Several of these hosts, or the user's machine-level instructions, decide where
worktrees may live. Before this decision the only worktree location was the project-setup ADR's
`worktree.baseDir` (`applyReview.worktree.baseDir` for `apply-review`), default
`.effective-flow/.worktrees`, and every workflow composed `BASE_DIR/REPO_NAME/SESSION_ID…` in prose.

A T3 Code session whose global instructions allowed runner worktrees only below one machine
directory showed the cost. Plan-PR continuation created its sibling worktree there instead of under
the configured base: the worktree got no lifecycle record, cleanup was manual, the report had to
list the deviation, and `worktree record-init` would have refused a record at that path, because
its location proof checks only the configured base. Nothing in the contract let a machine declare
its location, and a machine path does not belong in a tracked ADR.

## Decision

Every rule below decides from Git facts and the helper's resolution of the environment only, never
from host identity or the build target, so it behaves identically on every host. No host-identity
rule and no new ownership kind is introduced.

### Part 3: machine-level worktree base and one path helper

- **Precedence.** `EFFECTIVE_FLOW_WORKTREE_BASE_DIR`, read through the helper's injected
  environment, wins over `worktree.baseDir` and `applyReview.worktree.baseDir`; then the ADR key;
  then the default. An empty or blank variable counts as unset, as an empty ADR value does. The
  source of the resolved base is the closed set `environment`, `configuration`, `default`.
- **One helper.** `worktree path-resolve` returns the complete leaf path
  (`<base>/<repo>/<SESSION_ID><suffix>`, an `apply-review` component at
  `<base>/<repo>/<SESSION_ID>/<group>`, `<repo>` the basename of the main checkout), the parent
  segments still to create, the base, its source and diagnostics. `worktree path-prepare`
  re-derives that result and creates the parents; prose never composes a worktree path or runs
  `mkdir` for one. The agent learns whether the variable is set only from that output, never from
  a shell probe. An ADR value that differs from the environment base is a diagnostic the run
  reports once and continues past.
- **Trust.** Below `.effective-flow/`, `path-prepare` applies the unchanged runtime-state guard.
  Elsewhere it applies `foreignWriter`, moved into the leaf module `path-trust-core.mjs`, plus an
  owner check, to every directory consulted resolving the base (its ancestors and link
  directories), and every segment below the base must be a real directory passing the same check;
  created segments are checked after creation. A user-private group and a root-owned sticky
  directory pass. The leaf must not exist before `git worktree add`; `record-init` proves it after
  creation.
- **Fail closed.** An invalid environment base (relative, missing, not a directory) or a missing or
  non-directory configured base outside `.effective-flow/` (`WORKTREE_BASE_INVALID`, its details
  naming the `variable` or the ADR `key`), a failed trust check or a symlinked segment
  (`WORKTREE_PATH_UNTRUSTED`), an existing leaf (`WORKTREE_PATH_EXISTS`) and a denied write, both in
  an existing parent, which `path-prepare` probes with a directory it removes again, and while
  creating parents below `.effective-flow/` (`WORKTREE_SANDBOX_DENIED`), each stop with that named
  error. None falls back to the ADR value or the default.
- **No schema change.** Lifecycle records stay at version 1. `record-init` keeps its location
  proof against the helper's current result. Cleanup has no location proof, so a later change of
  the variable cannot affect removal. The unrecorded-worktree scan of `worktree inspect`
  additionally derives its roots from the `<base>/<repo>` directory (the parent of the session
  leaf) of every existing record, so a worktree under an earlier base stays visible.
- **Variable source.** The configuration guide names only user-level scopes: `~/.claude/settings.json`
  `env`, `~/.codex/config.toml` `shell_environment_policy`, and the T3 Code provider environment,
  together with the host's write access for the base (Claude Code additional directories, Codex
  `sandbox_workspace_write.writable_roots`). It excludes project-level `.claude/settings.json` and
  `.codex/config.toml`, because a repository could otherwise steer the base.

### Part 4: conflict stop

It applies only when `path-resolve` reports no environment source and an instruction in the agent's
loaded context (system context, `CLAUDE.md` or `AGENTS.md`, host runtime information) forbids the
computed path. An interactive run asks before `path-prepare` with exactly two options: set
`EFFECTIVE_FLOW_WORKTREE_BASE_DIR` and restart, or abort; there is no agent-supplied location and no
"continue here". Autopilot records the blocker kind `worktree-location-conflict`, which accepts no
summary, renders a fixed neutral line, withholds the appendix, publishes no plan-only draft, and
closes as the security blocker does (`plan-pull-request-unchanged` with the plan pull request's
number when an issue source has one, otherwise `no-pull-request`, and `run-close` refuses any
other outcome while the blocker stands); this is an exception to
[Plan-only unattended publication](plan-only-unattended-publication.md). The one autopilot
exception is the delivery-base attempt worktree: a conflict there records no blocker, the
delivery-base outcome is `unresolved` with reason `worktree-location-conflict`, and the run still
publishes, because the attempt only tries to resolve a base conflict and an unresolved one already
publishes with the appendix flag. Run-state signals alone classify the run: `Run state:
non-interactive` or `relayed`, an Issue Buddy pass and a leaf or subagent without a user channel
end with `ABORT: worktree-location-conflict` and the same neutral message, while a same-session
workflow delegation and `Run state: gated` inherit the caller's interactivity and ask. A build run
stops before `authorize-execution`: its order is resolve, conflict stop, `authorize-execution`,
`path-prepare`. Public text never quotes the machine path or the instruction.

### Part 1: harness branch reuse

A reused harness worktree stays `harness-managed`: no lifecycle record, no removal, no automatic
setup. A read operation `worktree reuse-facts` fetches the base ref and the HEAD branch's upstream
and reports cleanliness, untracked files outside the ignore rules, commits beyond the base,
ancestry, upstream divergence, the detached state and whether HEAD is the base branch. The build
run re-derives them in `authorize-execution`, from the refs that read fetched and without a fetch
of its own, and records the closed field `branchSource` (`adopted`, `created`, `existing`) in
`authorization.json`. The caller passes the `branchSource` that `reuse-facts` returned in
`reuseBase`; `existing` is always accepted, since a failed fetch cannot be re-derived, and a
reported `adopted` or `created` that the re-derivation contradicts is refused with
`AUTHORITY_MISMATCH`, never downgraded. The facts count an upstream commit as foreign only when it is missing from
both HEAD and the base, so a host branch tracking the base itself stays adoptable when the base
moved ahead.

- **Adopt** without a question a clean branch that is not the base branch, has no untracked files,
  no commits beyond the base and no upstream commit missing from both HEAD and the base, and in
  hidden mode passes
  the `prefix-discloses` check. A branch strictly behind the base is adopted in the fixed order
  `authorize-execution` with `baseHead` the target OID, `git merge --ff-only`, then the transition
  requiring `head === baseHead`; a failed fast-forward means no adoption: the authorization keeps
  the pre-fast-forward OID, and the transition at that unchanged HEAD records `existing`. The adopted branch keeps
  the host's name and its branch-created flag stays false.
- **Create** the delivery branch, named through `delivery-branch-name`, immediately before the
  first commit for a detached harness checkout and for a clean checkout on the base branch with no
  commits beyond the base and no untracked files. The run sets its branch-created flag, records the
  creation OID and issues a new verified receipt. Because `authorization.json` is immutable, it
  records the creation OID (the fresh base OID `reuse-facts` returns, which no commit may move
  first) as `baseHead` at authorization. A HEAD strictly behind it moves there with
  `git switch --detach <creationOid>`, never `merge --ff-only`, so the local base branch keeps its
  tip and setup is detached at the creation OID; a checkout already there keeps its original
  detached or base-branch identity. The build-run operation `record-branch` verifies that HEAD is
  still the creation OID and issues the branch receipt once, after `git switch -c` and before the
  first commit, with the checkpoint's completion basis and current plan once the plan is archived. A handoff past the creation OID without that receipt is refused. An empty result or an abort before the first
  commit leaves no branch; after a commit the branch is kept and reported, and the harness is never
  switched back.
- **Superseded rules.** For exactly these two create cases this replaces the rule "create or adopt
  it through the harness-supported flow" and the rule never to switch a harness-managed worktree
  (`execution-location`, `worktree-integration` "Worktree execution" step 1 and its lifecycle
  rules, `build-run-contract`).
- **Every other case keeps today's behaviour:** a dirty tree, commits beyond the base, a foreign
  upstream commit, untracked files, a disclosing hidden-mode name, or a failed fetch, which leaves
  the facts unproven.

### Part 2: host-created worktrees, deferred

No host offers a usable facility to create a worktree in the middle of a session:

- Claude Code's `EnterWorktree` creates below `.claude/worktrees/` from its own base ref (setting
  `worktree.baseRef`: `fresh`, the default, branches from `origin/<default-branch>`, `head` from
  the current HEAD), is meant only for an explicit user or instruction request, and `ExitWorktree`
  with `remove` deletes the worktree and, unless a hook made it, its branch; it never removes a
  worktree entered with `path`. `EnterWorktree` with `path` could later move a session into an
  Effective Flow-created worktree; on first entry from the launch directory any registered worktree of the
  repository qualifies, while a switch from inside a worktree or from a pinned agent is limited to
  `.claude/worktrees/`.
- T3 Code and the Codex app create worktrees only at thread or task start.

The environment base covers all three hosts meanwhile.

## Consequences

- A machine declares its worktree location without touching the repository, and every
  worktree-creating workflow records, reports and cleans it up as before.
- A wrong or untrusted base stops a run before anything is created instead of silently using
  another location.
- Residual risk: the helper cannot tell which settings scope set the variable. A project-level
  host settings file that sets it would steer the base; the configuration guide excludes those
  scopes, and the trust checks still bound where directories are created.
- Deliberately out of scope: host-created worktrees on any host, a user-level Effective Flow
  configuration file, and lifecycle record schema version 2.
- Availability: each part is available from the first release containing its change.

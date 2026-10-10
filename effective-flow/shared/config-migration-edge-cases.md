## Configuration edge cases and consumer duties

These are the duties a run owes for configuration results the resolver reports but cannot carry
out itself: hidden mode, the two `tracker.*` state keys only an `external` target resolves, and the
timing of a retired-row stop. The resolution call and the action per result field live in the
"Effective Flow configuration (project setup ADR)" building block (`config-migration.md`), which
every source that loads this one carries.

### Hidden mode

`data.visibility: hidden` means the main checkout's local hidden configuration file, which only
effective-flow setup writes, is the whole configuration, and `data.values` already carries the forced
hidden values. Hidden mode also fixes the tracker target: an issue reference or per-run signal
that would otherwise select the forge or an external tool does not override it. A workflow that
can only work against such a target stops before its first tracker access or write, naming hidden
mode, and never falls back to writing labels or markers.

A standard-mode effective-flow setup run resolves the ADR it reads and writes through steps 1–4 only; a
step-0 file is then a read-only seed and never its write target. Hidden plan and concept writes
use absolute handles under the verified `RUNTIME_STATE_ROOT`, never a path relative to a linked
`EXECUTION_ROOT`, and apply "Runtime-state write safety" to the target and its parent directories.

**No trace in Git or forge prose.** In hidden mode no commit message, branch name, pull-request
title or body, or tracker-facing summary references a path under `.effective-flow/` — a plan or
concept file included — or names Effective Flow (`effective-flow`, `Effective Flow`). A run that
delegates a commit or a pull request hands this constraint on with the delegation.

### External tracker state keys

- **`tracker.externalStartedState`** → a nullable string containing the external connection's stable
  state ID, or its exact accepted token only when that connection exposes no ID. Missing or `null`
  means unset and never authorizes a guessed transition. Readers validate a non-null value against a
  fresh list of writable states in the exact configured tracker context before every implementation
  run; stale, terminal, read-only, cross-context, and display-name-only matches fail closed before
  code. Only `effective-flow setup` writes a confirmed tracker-verified suggestion. The fixed post-merge
  observation grace period has no configuration key.
- **`tracker.externalDoneState`** → a nullable string containing the external connection's stable
  **terminal** state ID, or its exact accepted token only when that connection exposes no ID. Missing
  or `null` means unset and never authorizes a guessed transition. Readers validate a non-null value
  against a fresh list of writable states in the exact configured tracker context before the offered
  post-merge terminal transition; stale, non-terminal, read-only, cross-context, not-done-category,
  and display-name-only matches make that transition unavailable instead of guessing, and never
  abort a run whose merge already succeeded. That transition is not the only reader: the post-merge
  observation of an issue found already terminal resolves the same value by the same rules, and a
  value that fails there makes that issue's reconciliation unavailable rather than its transition.
  Only `effective-flow setup` writes a confirmed
  tracker-verified suggestion. The completion assessment behind the offer has no configuration key of its own.

### Retired rows

A retired row is **never read as a value**, not even to report what it would have held. Act on
`data.retired` at the run's **first configuration read**, before any fetch, branch, worktree,
commit, push, delegation or merge: deciding only when a successor is about to be read would stop a
run after it already delivered. A `stop` does nothing else; a non-interactive delegated run stops
the same way and returns that reason to its caller like any other precondition failure. A run that
hands work to another workflow does not act on that workflow's successors; the receiving run
resolves its own at its own first configuration read. The checkout provisioning of
effective-flow iterate in PR mode and of effective-flow merge-gate applies "Base-branch resolution" to
`delivery.baseBranch` only as a checkout precondition; that is not a successor read, so a retired
`worktree.baseBranch` neither stops nor is reported there.

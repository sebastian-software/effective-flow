## Diff baseline

The diff baseline snapshots the working tree before this run's first implementation write, so
every step that acts on "the files this run changed" uses one computed delta instead of an
estimate. It is distinct from `{{SKILL:refactor}}`'s Phase 2 behavior baseline of check results.

```lazy-include
runtime-state-safety
when: a diff-baseline capture, render, or discard below `.effective-flow/runs/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: a diff-baseline capture, render, or discard below `.effective-flow/runs/` is imminent
```

Use the shipped helper as `node <skill-root>/scripts/diff-baseline.mjs <operation>` with the
operation `capture`, `render`, or `discard`. Send exactly one JSON object on standard input and
accept only its single JSON envelope on standard output; an envelope with `ok: false` or a
non-zero exit stops the step and is reported with its error code. The helper owns run-directory
allocation, the ignore and symlink guards, the private snapshot index and object store, and atomic
file replacement. Never reproduce those writes by hand.

### Capture

Capture exactly once, after the execution-location receipt is verified and any owned setup ran,
and before the first implementation write; the owning tool names the step. Every delivery mode
captures the same way: run-created or reused worktree, in-place with or without delivery, and
detached. Input:

```json
{
  "cwd": "<verified RUNTIME_STATE_ROOT>",
  "executionRoot": "<verified EXECUTION_ROOT>",
  "sessionId": "<SESSION_ID>",
  "repositoryIdentity": "<verified repository identity>"
}
```

The helper allocates `<RUNTIME_STATE_ROOT>/.effective-flow/runs/<RUN_ID>/diff-baseline/`
exclusively (a same-second collision gets a `-2`, `-3`, … suffix) and refuses before any write
when `.effective-flow/` is tracked, not ignored, or reached through a symlink; an unreadable
untracked file fails the capture closed, naming its path. Retain the returned `runId`, `dir`,
`baselineHead`, and `baselineTree` for the rest of the run and use only these values afterwards,
never a reconstructed path.

### Render

Render whenever a step needs the run's changed files: the owning tool names each point, and every
correction, incorporation, or current-scope correction pass is followed by a fresh render before
the next consumer. Input: `cwd`, `executionRoot`, `dir`, and `baselineTree` as retained, plus
`scope` when "Path scope" below applies. The helper atomically replaces `diff.patch` and
`paths.json` in `dir` and returns `diffPath`, `pathsPath`, `currentTree`, and `entries`
(`status`, `path`, and `oldPath` for a rename).

The latest render's `entries` are the run's **path list**. A path unchanged since capture never
appears, even when it was already edited or untracked before the run; ignored files, including
everything below `.effective-flow/`, never appear. An empty list means no file changed, not an
error. A failed render, for example a missing snapshot object or an `executionRoot` or
`baselineTree` that does not match the capture's recorded `baseline.json`, stops that step
fail-closed; never capture again to recover, because that would silently lose the baseline.

### Path scope

When a delegation handoff supplies an owned or affected file set — `{{SKILL:iterate}}` and
`{{SKILL:apply-review}}` run several items in one checkout — pass that set as `scope`, plus every
path whose later expansion the caller approved, so a sibling's edits never enter this run's change.
Scope entries are literal paths, never globs. A handed-off set that is empty is passed as
`scope: []` and renders no change; omit `scope` only when no set was handed off at all.

### Consumers

- **Documentation sync:** the path list is the run's actually changed file set.
- **Validation:** hand `{{AGENT:code-validator}}` the path list as its assigned scopes and state in
  the assignment that the list selects the routing buckets and is reported as the change under
  validation, while each selected bucket's checks still run at repository-native breadth, never
  narrowed to the listed files.
- **Review:** route reviewers from the path list and hand each reviewer the absolute `diffPath` plus
  only its routed bucket's slice of the path list. Baseline and tree OIDs stay with the orchestrator.
- **Formatter:** format the list's non-deleted paths plus the plan file, once.

A rename counts as its destination. A deleted (`D`) entry, and an entry with `pathBase64` (a
non-UTF-8 path whose `path` text is lossy), reach reviewers through the diff but are never handed
to documentation sync or the formatter as a file to edit.

### Lifecycle

After success, call `discard` with `{ "cwd": "<RUNTIME_STATE_ROOT>", "dir": "<dir>" }` at the
point the owning tool names. It removes the run's `diff-baseline/` directory with its private
object store, and its `runs/<RUN_ID>/` parent only when that is left empty; snapshot content a Git
LFS clean filter copied into the repository's shared LFS store stays there, an accepted side
effect. An aborted or escalated run keeps the directory; `{{SKILL:cleanup}}` lists it as a stale
diff baseline and deletes it only after confirmation. The diff can carry working-tree secrets: never quote it into a tracker item,
pull request, commit, or report.

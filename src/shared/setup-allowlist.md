## Claude Code allow rules

This fragment is loaded only when the allowlist step of `{{SKILL:setup}}` is offered. It writes 72
Claude Code allow rules into `<RUNTIME_STATE_ROOT>/.claude/settings.local.json`, bound to this
install's absolute path, so later runs call the helpers without a permission prompt:

- one per non-destructive or bounded runtime-state helper operation: `lock acquire`, `lock release`,
  `lock inspect`, `memory reserve`, `memory set-marker`, `memory migrate-directory`,
  `commit create`, `review open-report`, `review write-report`, `worktree record-init`,
  `worktree transition`, `worktree inspect`, `worktree resume-check`, `cleanup plan`,
  `ledger init`, `ledger append`, `ledger reconcile`, `presence register`, `presence refresh`,
  `presence list` and `presence release`;
- one for the `config-resolve` helper's `resolve` operation and one each for its read-only
  `no-ci-policy` and `conflict-validation` operations;
- one per read-only `remote-tracker.mjs` operation: the forge reads, the pure local computations
  and `thread-ledger-lookup`, never a mutation or the local write `thread-ledger-record`;
- one per read-only `conflict-validation.mjs` operation: `ci-detect`, `ci-integrity`,
  `ci-evidence-match` and `quick-marker-scan`.

`commit create` writes Git history and runs the repository's hooks without a prompt; it commits
only the listed paths, refuses paths below `.effective-flow/` and an untrusted hook configuration,
and never pushes, amends, resets or rebases. For its report, `review write-report`
writes only a new, generated-name file below `.effective-flow/review/` (through a
`.write-report-*.tmp` sibling) and the ID counter in `.effective-flow/memory.json`, never
overwrites a report, takes at most 64 KiB of input, and consumes IDs only with a successful
reservation. Separately, and only without the migration marker, it first runs the legacy-directory
migration under that operation's own bound (no-clobber copy into `.effective-flow/`, memory merge,
marker, adopting and removing a root `.sf-memory.json` through its own guard class). The
`worktree` and `cleanup plan` rules write only lifecycle records and their locks and never remove a
worktree or branch, with two bounded exceptions in `worktree transition`: `release: "partial-diff"`
restores exactly the residual paths it proved equal to the delivery ledger and still in the source,
removing such a file `HEAD` lacks, and a `partial-diff-resume` adoption appends at most one proven
tip commit to that ledger. That ledger is one private file of the record below
`.effective-flow/worktree-runs/ledgers/`, at most 256 KiB even with every group committed.
`ledger init` writes it once, no-clobber and under the record lock, only for the calling session's
own `active` `partial-diff` record, from descriptors the helper computes itself, and not at all
when that worst case exceeds the bound; `ledger append` adds one commit entry to it, only for a
branch tip it proved the next group's exact commit (parent, paths, blobs and modes). Neither
touches a worktree, branch or record. `worktree resume-check` and `ledger reconcile` only
read: they take no lock and write nothing. `presence register` creates only the calling run's own
marker below `.effective-flow/merge-gate-presence/`, no-clobber and at most 2 KiB; `presence refresh`
and `presence release` rewrite or remove only that marker and only with its token; `presence list`
only reads. `lock break`, `harness allow-rules` and the destructive `worktree remove` and
`cleanup apply` never get a rule, nor does `presence prune`, which removes other runs' markers.
Only the helper writes the settings file; never edit it in prose.

### `setup allowlist`

The keyword form runs only this step and its summary. It needs no existing configuration: make
Step 2 item 2's read-only resolution call with `tool: "setup"` and take only
`data.runtimeStateRoot`, `data.checkoutRoot` and `data.visibility` (`hidden` selects the hidden ignore
remedy below, anything else the standard one). The shared chat-language rule applies. It asks no Visibility
question and runs no other setup step.

### Preview, confirmation, apply

```include
helper-call-shape
```

The `skillRoot` value is that same literal `<skill-root>`, so the written rules match later calls.
The helper's `CLAUDECODE` gate is the authoritative harness check. Its `harness allow-rules` call is itself never allowlisted, so Claude
Code asks once for each call.

1. Preview:

   ```text
   node <skill-root>/scripts/effective-flow-state.mjs harness allow-rules <<< '{"cwd":"<RUNTIME_STATE_ROOT>","skillRoot":"<skill-root>","mode":"preview"}'
   ```

   Show `result.target` and the 72 `result.rules`, then `result.added`, `result.removed` (rules of
   an install whose helper no longer exists), `result.keptOtherInstalls` as "other install, kept",
   and every `result.warnings[]` entry with its rule and message (a `helper-wildcard` warning also
   covers a path-prefix rule such as `node ~/.claude/skills/*`, and a rule that admits an excluded
   operation or the `--apply` form is widened). An earlier release's smaller set previews its
   missing rules as `result.added`. A widened rule is never removed;
   the user decides. With `result.changed: false`, report that the rules are current and stop.

2. Ask in the conversation whether to write exactly this change, in every mode and in auto mode
   too: a harness approval of the `apply` command does not replace this answer. Only an explicit
   yes continues; a run that cannot ask writes nothing and reports the preview.
3. Apply with `"mode":"apply"` and `"digest":"<result.digest of the preview>"`, and report
   `result.applied`.

### Outcomes

Every outcome writes nothing; a configuration write of Step 6 stays in place.

- `UNSUPPORTED_HARNESS`: say in one sentence that the step is specific to Claude Code.
- `UNSUPPORTED_PATH`: state `outcome.reason`, with `outcome.path` and `outcome.detail` when present,
  and show `outcome.rules`, when non-empty, for manual entry under `permissions.allow`.
  `forbidden-character` (any character outside `A-Za-z0-9._@+/-`, a non-ASCII install path
  included) offers no rules; `unresolvable` means a path of the helper's chain could not be
  resolved. For `inside-repository-worktree`, `inside-runtime-root`, `foreign-writable` and
  `helper-mismatch`, add that entering the rules by hand reopens the risk the refusal guards
  against.
- `SETTINGS_NOT_IGNORED`: the ignore remedy below, then preview once more.
- `SETTINGS_TRACKED`: name the tracked file; untracking it is the user's decision.
- `SETTINGS_INVALID`: name the file and the parser message; the user repairs it.
- `PREVIEW_MISMATCH`: the file changed since the preview, for example through Claude Code itself.
  Preview once more and ask again.
- The same outcome a second time after that one re-preview: report it and stop.
- Any other nonzero exit or `error`: report its code and message.

### Ignore remedy

Ask whether to add the line `.claude/settings.local.json`, naming the file; on no, write nothing
and report the outcome.

- **Standard mode:** on yes append it once to `<RUNTIME_STATE_ROOT>/.gitignore`, creating the file
  if missing and ensuring a trailing newline first, never rewriting another line. In a linked
  worktree (`data.checkoutRoot` differs from `data.runtimeStateRoot`) use the hidden-mode remedy
  instead and never create or edit `<RUNTIME_STATE_ROOT>/.gitignore`: a local line there would
  dirty the main checkout and collide with the tracked file a later pull brings.
- **Hidden mode:** on yes add it to the Git common directory's `info/exclude` as
  `setup-hidden-mode` describes for that second line; never touch `.gitignore`.

```lazy-include
setup-hidden-mode
when: the helper returned `SETTINGS_NOT_IGNORED` and either the visibility is `hidden` or `data.checkoutRoot` differs from `data.runtimeStateRoot`
```

### Summary items

Report the target, the rules added, removed and kept for another install, every warning, and
whether the change was written, or the outcome and its reason. Always add two sentences:

- Never accept Claude Code's "don't ask again" suggestion for a helper call: it widens the rule to
  `node <helper> *` or `node *`, which also approves `lock break`, a tracker mutation, or any
  script.
- The rules live below the main checkout; whether Claude Code applies them in a session started
  inside a linked worktree is unverified.

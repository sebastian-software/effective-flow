
# Effective Flow Cleanup

You clean up the legacy remnants that Effective Flow's migrations deliberately leave behind and
inspect the Git worktrees linked to the current repository. All migrations are
**non-destructive** and explicitly defer actual deletion to the user (see
`effective-flow-dir-migration.md`: "Effective Flow leaves the cleanup to the user";
`effective-flow setup`: the untracked old `config.json` is "left on disk"). This skill is the
sanctioned, user-driven path for migration finalization and the only later workflow that may
remove a worktree through a verified Effective Flow lifecycle record.

## Goal

- capture all outdated migration artifacts in the current project (discovery)
- when a legacy runtime directory exists and the completion marker is missing, automatically run
  the shared non-destructive runtime-directory migration after the initial inventory
- check them against their new counterpart and determine whether anything still needs to be carried over (carry-over)
- have the user confirm every carry-over candidate and carry over what is confirmed
- then delete the old data **git-aware** and only after explicit confirmation (dry run first)
- never delete before the new counterpart exists and the carry-over is complete or deliberately discarded
- inventory outdated `.gitignore` entries but leave them untouched and route their repair to `effective-flow setup`
- inventory stale diff baselines and discard one only after dry run and confirmation
- inventory every linked worktree from Git's machine-readable output and match it to verified
  execution-location and lifecycle evidence
- after a separate dry-run and confirmation, remove only independently proven cleanup-ready
  Effective Flow-owned worktrees with ordinary Git operations
- finish every run with an individual retention reason and safe next step for every linked
  worktree other than the main worktree
- do not create a commit and do not create a backup directory
- be idempotent; a true no-op has neither a migration action nor a removable worktree, but still
  prints the mandatory worktree report

**Load on demand:** Read `shared/language-rules.md`, when the chat-language rule leaves this run's interactive output language on `language.project`, so the artifact-surface resolver must be read.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

Only the active overview owner emits user-facing progress; a delegated leaf returns to its parent.
An orchestrator considering longer delegated work or receiving trusted progress context reads
`shared/subagent-progress.md` on demand, including when this tool has no goal-completion include.
Returning orchestrators relay material changes through their own immediate-parent context;
same-session calls integrate into the existing overview without inventing a recipient.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a stale diff baseline will be discarded, or a confirmed carry-over copy or its directory creation, the runtime migration, or a memory or tracker-marker mutation is imminent.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when Phase 1 step 6 finds at least one legacy runtime directory and no valid `runtimeMigration.directory.version: 1` marker in `.effective-flow/memory.json`, a remote tracker access is about to perform its first runtime-state mutation (the forge contract's one-time `labelMigration.sf` marker), or any confirmed Phase 3 or Phase 5 mutation below `.effective-flow/` is about to run, even when Phase 1 found no legacy runtime directory (for example a carry-over copy or directory creation, a worktree lifecycle lock, claim, removal, reconcile, record write or deletion, a stale diff-baseline discard, or the confirmed removal of a legacy file such as a transitional `.effective-flow/config.json`).

## Effective Flow-owned worktree lifecycle

This contract adds crash-tolerant lifecycle evidence to the execution-location receipt. It never
replaces that receipt, Git's worktree registration, or the runtime-state write-safety contract.
A configured base directory, path pattern, branch prefix, age, or apparently empty checkout is
not ownership evidence.

Only worktrees created by Effective Flow receive lifecycle records. Reused user-managed or
`harness-managed` worktrees remain outside this lifecycle and must never be adopted retroactively.

### Runtime record

Each Effective Flow-created worktree is described by one file
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`, and while a writer holds
it, by the per-record lock `<RECORD_ID>.lock` beside it. Only the runtime-state helper operations below
create, change, claim or delete a record or take its lock; never write, rename or delete either in
prose. The helper resolves `RUNTIME_STATE_ROOT` from `cwd` and applies “Runtime-state write safety”
to every record and lock handle itself, fail-closed. `RECORD_ID` is an opaque, collision-resistant identifier matching
`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$`, generated once and never derived from the path or branch. A
version 1 record has exactly this key set; strings are illustrative:

```json
{
  "schemaVersion": 1,
  "recordId": "opaque-record-id",
  "sessionId": "workflow-session-id",
  "componentId": null,
  "workflow": "build",
  "purpose": "delivery",
  "repositoryIdentity": "/canonical/common-git-dir",
  "runtimeStateRoot": "/canonical/main-worktree",
  "worktreePath": "/canonical/linked-worktree",
  "branch": "effective-flow/build/example",
  "creationOid": "full-commit-oid",
  "ownership": "effective-flow-created",
  "receipt": {
    "repositoryIdentity": "/canonical/common-git-dir",
    "executionRoot": "/canonical/linked-worktree",
    "runtimeStateRoot": "/canonical/main-worktree",
    "checkout": {
      "kind": "branch",
      "branch": "effective-flow/build/example"
    },
    "origin": "effective-flow-created",
    "setupOwner": "Effective Flow build",
    "setupStatus": "pending",
    "workflow": "build",
    "purpose": "delivery"
  },
  "branchPolicy": "retain",
  "createdAt": "RFC-3339 timestamp",
  "updatedAt": "RFC-3339 timestamp",
  "status": "active",
  "reason": null
}
```

`componentId` is the component identifier or `null`. `purpose` and `branchPolicy` are bound
together: `delivery` and `partial-diff` at exactly `BASE_DIR/REPO_NAME/SESSION_ID` and
`plan-publication` at `BASE_DIR/REPO_NAME/SESSION_ID-plan-publication` carry `retain`;
`apply-review` at a direct child of its session directory, on branch
`apply-review/<SESSION_ID>/<GROUP_NAME>`, carries `delete-after-integration`. `reason` is `null` for
`active` and `cleanup-ready` and the exact reason otherwise. `creationOid` is the full commit OID at
which worktree and branch creation succeeded, captured once and never replaced. The `receipt` is the
immutable creation snapshot; fresh receipts are compared with it, never written into it. During
`cleanup-in-progress` a cleanup claim, `cleanupRunId` and `claimedAt`, names its owner and
timestamp. The helper refuses an unknown schema, a missing or extra key or an invalid value and never
repairs, rewrites or deletes such a record.

### State machine

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

| From                                | To or terminal action                   | Operation                                                                                               |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| newly created                       | `active`                                | `worktree record-init`                                                                                  |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | `worktree transition` by the owning session                                                             |
| `aborted` or `failed`               | `active` (adoption)                     | `worktree transition` under the record lock, `adoption` `plan-pr-continuation` or `partial-diff-resume` |
| `aborted` or `failed`               | `cleanup-ready` (release)               | `worktree transition` under the record lock, `release: "partial-diff"`                                  |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | claim inside `worktree remove`, `cleanup apply`                                                         |
| `cleanup-in-progress`               | `cleanup-failed` or record deleted      | the claiming helper call reconciles                                                                     |

A controlled user or workflow stop becomes `aborted`; an implementation, integration, validation,
ownership, or state-persistence error becomes `failed`. A sudden interruption leaves `active`,
`cleanup-in-progress`, or a lock in place: report that uncertainty, and never infer a crash or
completion from elapsed time. There is no TTL, heartbeat, stale-after threshold or age-based
transition. A foreign, ownerless or interrupted lock or claim stays: never break or take it over.

### Removal eligibility

The helper evaluates these conditions from fresh evidence under the record lock and reports every
failed one by number (`NOT_ELIGIBLE`, `conditions`):

1. The record is schema-valid, `effective-flow-created`, and `cleanup-ready` or `cleanup-failed`
   (`worktree remove` also accepts this session's `active` record).
2. Repository identity, `RUNTIME_STATE_ROOT`, path, branch, workflow, purpose and receipt snapshot
   match fresh evidence.
3. Exactly one linked worktree in `git worktree list --porcelain -z` matches the path.
4. That worktree is neither `locked` nor `prunable`, its directory exists, and its common Git
   directory matches.
5. Its `HEAD` and registration name the recorded branch; detached or changed branch identities fail.
6. `creationOid` is a commit and an ancestor of the branch tip
   (`git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>` exits `0`), never compared
   with a moving remote tip.
7. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none` is
   empty.
8. It is neither the main worktree nor the calling run's own execution worktree.
9. No foreign or ownerless lock or cleanup claim exists.

A released `partial-diff` record (`cleanup-ready` or `cleanup-failed`) whose worktree is fully gone,
unregistered and its path absent, is removable without conditions 3, 4, 5 and 7 and the toplevel
part of 2; no Git call runs in the vanished path. A half-gone worktree keeps every condition.

### Helper operations

**Helper call shape.** Write every call of the three JSON helpers as exactly one simple command:

```text
node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'
```

with exactly this `<argv>` per helper: `effective-flow-state.mjs <group> <operation>`,
`config-resolve.mjs resolve`, and `remote-tracker.mjs <operation>`, or `<operation> --apply` for a
mutation.

- Resolve `<skill-root>` from the currently loaded Effective Flow skill, in the form it was
  reached (a symlinked install path included, never resolved through `realpath`), and spell it out
  literally as an absolute path. Never use a shell variable, `$PWD`, `~`, command substitution,
  `cd … &&`, an `echo … |` or `printf … |` pipe, a heredoc, a loop or function, a compound
  command joined by `;`, `&&` or `||`, a trailing `echo "exit=$?"` or any other trailing command,
  or `| grep` or any other pipe on the output. Read the exit status and the envelope from the tool
  result itself.
- Every JSON value is literal too: `cwd`, where sent, is the literal absolute path its owning
  contract names (`RUNTIME_STATE_ROOT` for `effective-flow-state.mjs`), never `$PWD`. Write a `'`
  inside the JSON as `'\''`.
- The Claude Code allow rule matches only this literal shape, so any other shape prompts for
  permission on every call. The rule binds every harness, since it is also the auditable shape.

`cwd` is `RUNTIME_STATE_ROOT`; `executionRoot` is the registered checkout the calling run operates
from, and `RUNTIME_STATE_ROOT` for `worktree inspect`, the exit self-check and every call after the
run's own worktree was withdrawn, since that path no longer exists. `sessionId` proves ownership:
the record's own, or on adoption or release the new owner (`build` passes its build-run ID).

```text
node <skill-root>/scripts/effective-flow-state.mjs worktree record-init <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","record":<complete version 1 record, status active>}'
node <skill-root>/scripts/effective-flow-state.mjs worktree transition <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","from":"active","to":"<cleanup-ready|aborted|failed>","reason":<null or "<reason>">,"sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree inspect <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree remove <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<SESSION_ID>","recordIds":["<RECORD_ID>"]}'
```

- **`worktree record-init`** runs immediately after the verified `effective-flow-created` receipt
  and before setup or delegation. It writes the record no-clobber only for a newly registered,
  unlocked linked worktree at the purpose's path whose branch tip is `creationOid`.
- **`worktree transition`** runs under the record lock; a `from` that differs from the stored
  status writes nothing.
- **`worktree inspect`** is read-only: the session's records with their failed conditions, plus
  registered worktrees under its session paths that no record names (`unrecorded`) and ledgers
  without a record (`orphanLedgers`). Omitting `sessionId` covers every session.
- **`worktree remove`** lists every record of one session to withdraw in one call. Under one lock
  hold per record it moves `active` to `cleanup-ready`, claims it, runs only
  `git worktree remove <WORKTREE_PATH>` without force and never `git worktree prune`, applies the
  branch policy and deletes the record, its ledger first; a failed removal persists `cleanup-failed`
  with Git's error, and an already absent worktree is reconciled only under the call's own claim. Give the call an
  explicit Bash timeout of 120000 ms, above its 90 s deadline; in Codex, request sandbox escalation
  for it up front. `executionRoot` is never one of the listed worktrees.

**Load on demand:** Read `shared/worktree-partial-diff-recovery.md`, when a `partial-diff` record's delivery ledger, `ledger init`, `ledger append`, `ledger reconcile`, `worktree resume-check`, or a `worktree transition` with `adoption`, `visibility` or `release` is used: that fragment owns them.

**Branch policy.** `retain` leaves the branch. `delete-after-integration` runs
`git branch -d <BRANCH_NAME>`; when Git refuses, only an `apply-review` call carrying
`integrationRoot` lets the helper prove every component commit by exact patch-id against the branch
checked out there and then compare-and-delete the ref. Prose never runs `git branch -D`, and a
forced deletion outside that proof never happens.

**Outcomes.** Exit 0 carries `result`, exit 4 an `outcome.code`; any other exit, an unparsable
envelope or an `error` is handled as not `ok`. `worktree remove` exits 0 with `result.items[]`, one
`{recordId, ok, code?}` per record.

| Result                                                                                       | Handling                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `record-init` not `ok` (`RECORD_EXISTS`, `NOT_ELIGIBLE`, `LOCK_HELD`, `INTERRUPTED`, …)      | Retain worktree and branch, run no setup or delegation there, stop, and report the code and proofs.                                              |
| `transition` not `ok` (`STATUS_MISMATCH`, `RECORD_NOT_FOUND`, `NOT_OWNER`, `INTERRUPTED`, …) | Retain worktree and branch; report the record ID, code and current status. `LOCK_HELD` names the owner.                                          |
| `inspect` lists an orphan record lock or an orphan ledger                                    | A lock with no record, or no owner, or a ledger with no record: report it; never break or delete it.                                             |
| item `ok`                                                                                    | Worktree and record gone; report the branch outcome.                                                                                             |
| item `BRANCH_RETAINED`                                                                       | Worktree and record gone, branch kept: report `branch.branch`, `branch.reason` and `branch.unproven`.                                            |
| item `NOT_ELIGIBLE`, `LOCK_HELD`, `NOT_OWNER`, `RECORD_NOT_FOUND`, `INVALID_STATE`           | Nothing changed: report the failed conditions, owner or reason; the record keeps its status.                                                     |
| item `PREVIEW_MISMATCH` (`cleanup apply`)                                                    | The record changed after the dry run; nothing changed. Plan again.                                                                               |
| item `REMOVE_FAILED`                                                                         | The record is `cleanup-failed` with Git's error (or `persisted: false`): report partial cleanup.                                                 |
| item `UNSAFE_TARGET`, `WRITE_FAILED`, `GIT_FAILED`                                           | That item stopped; an in-flight claim or Git timeout is reconciled to `cleanup-failed`. Report the code and the status `worktree inspect` shows. |
| item `SANDBOX_DENIED`                                                                        | Nothing touched: rerun once with sandbox escalation, listing only the denied `recordIds`; otherwise report.                                      |
| item `DEADLINE_REACHED`, `INTERRUPTED`                                                       | Not started (also when under 15 s of the deadline remain; a record may already be `cleanup-ready`) or reconciled to `cleanup-failed`: report.    |
| harness denial, auto-mode refusal, another exit, an unparsable envelope or an `error`        | Nothing beyond the reported items changed: report the call.                                                                                      |

**Denial fallback.** After `worktree remove` returns any item that is not `ok` (`BRANCH_RETAINED`
aside) or fails as a whole call, and after the one `SANDBOX_DENIED` rerun, call `worktree
transition` `active` → `cleanup-ready` with `"reason":null` for every listed record not reported
removed (`STATUS_MISMATCH` means it already left `active`), because `effective-flow cleanup` collects only
`cleanup-ready` and `cleanup-failed`; report each retained worktree for `effective-flow cleanup`.

A final report names every retained worktree and every `BRANCH_RETAINED` branch, because no record
points at that branch any more.

## Effective Flow configuration (project setup ADR)

The tracked configuration is a living ADR "Effective Flow project setup" (default slug
`effective-flow-project-setup`) carrying a Markdown key/value table; hidden mode keeps it in the
untracked `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`. `.effective-flow/` is otherwise
private, ignored runtime state, and no `config.json` is a configuration source.

### Config locator (resolution call)

Before the first configuration-dependent step, make the literal call
`node <skill-root>/scripts/config-resolve.mjs resolve <<< '{"cwd":"<checkout>","tool":"<tool>"}'`:
`cwd` the absolute checkout this run works in, `tool` this tool's own name (e.g. `refactor`; an
internal source such as `apply-plan` passes its own), plus `mode` for `iterate` (`local`/`pr`) and
`apply-review` (`local`/`remote`). Each call is exactly one such command, with `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no trailing command, no compound command, and every `'` inside the JSON, untrusted text included, spelled as `'\''`. The script runs the whole config locator (steps 0–4), decodes
the table, forces the hidden-mode values, and classifies retired rows; never read the ADR by hand.
Fail closed: a missing Node, a nonzero exit, or anything but one parseable envelope line
`{ ok, operation, data }` stops the run before that step, reporting the cause. Exit 3
(`RUNTIME_ROOT_UNVERIFIED`, `RUNTIME_STATE_UNSAFE`) stops with the reported check and no write,
never continuing in standard mode. `data.runtimeStateRoot` is the verified `RUNTIME_STATE_ROOT`
(`null` outside Git), `data.visibility` is `standard` or `hidden`, and `data.source` names the
resolving step and path.

### Acting on the result

- **Values** come only from `data.values[<key>]`: `value` is decoded (`true`/`false`, `null`, `[]`
  for `(empty)`, else the literal string) and `items` is the comma-split list. An absent key or
  `state: unset` is not set → the owning tool's default; `value: null` is explicit and means "ask
  at run time" (no `delivery.completion` → default `merge`; `delivery.completion | null` → ask).
  For `state: invalid`, or a value the owning tool cannot interpret, use a safe default for the
  run, name the key to the user, and do **not** guess.
- **`executionProfiles.fast.enabled`** → its `profile`. `disabled` (missing row or literal `false`)
  and `invalid` (malformed, ambiguous, or unreadable) select Quality and stop new measurement
  without rewriting persisted pilot-generation state. `enabled` (only the literal `true`) admits
  the project to the pilot lifecycle but does not start a baseline, activate a generation, prove
  native Fast capability, or itself permit Fast. Only Guided setup (advanced block 10) sets it;
  Profile and Express preserve an existing value and never enable it. It has no legacy migration
  and names no provider model.
- **`delivery.prReview`** → `ask`, `always`, or `off`; unset resolves to `ask`. What it governs is
  the owning workflow's.
- **Diagnostics** (`data.diagnostics[].code`): `unknown-tool` needs nothing; every other code is
  reported once per run. `dead-marker`, `legacy-marker`, `marker-divergence`, `legacy-slug`,
  `transitional-fallback`, and `legacy-empty-token` also point to effective-flow setup; `several-match`
  names every listed path, and a run that writes configuration (`writerStop`) ends there;
  `ambiguous-key` and `invalid-value` take the safe default above.
- **Retired rows (retired-key rule).** Each `data.retired` entry names a retired row and its
  successor. `stop` ends the run, naming both keys and effective-flow setup, and never takes the
  successor's default — the one exception to the safe-default rule; `report` is reported once and
  points to effective-flow setup while the successor wins; `none` needs nothing. Only a `stop` entry with
  `conditional: reviewer-resolved` is downgraded to one report when the run resolves no reviewer
  matching its `normalizedLogin` under "Matching a configured login"; the conditional never changes
  `report` or `none`.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when `data.visibility` is `hidden`, a `data.retired` entry's action is `stop` or `report`, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`.

### Table encoding (binding for writers)

Reading creates no file and mutates no Git; only effective-flow setup creates or changes the ADR, the
markers, the local hidden configuration, and the migration. It writes a flat two-column table
under English `## Configuration` with `| Key | Value |` or German `## Konfiguration` with
`| Schlüssel | Wert |`. Keys and encoded values stay English in both envelopes, and a normal update
preserves the existing envelope language; changing `language.documentation.technical` does not
translate an existing ADR.

- **Boolean** → `true` / `false`; **String** → literal and unquoted (e.g. `origin/main`); a writer escapes every literal `|` in an encoded value as `\|`, and only a row carried over as its original `line` stays byte for byte.
- **`null`** → the literal token `null`; a missing row means the key is not set.
- **Empty list** → `(empty)`; **filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`); an empty object has no rows.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" in `issue-tracker-forge.md`.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: this core carries the `tracker` config schema including migration, the mode determination, and the tracker-target handoff, and the sibling fragment "Issue-tracker forge mechanics" (`issue-tracker-forge.md`) carries the provider-neutral remote-helper contract, the label convention, the security disclosure gate, the remote prose language, and the canonical issue and epic body formats. Every source that reaches the forge target loads that sibling as well, eagerly or through its own deferred pointer. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections of `issue-tracker-forge.md` (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto",
    "externalTool": null,
    "externalToolHint": null
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)
- `tracker.externalTool`: `null` (no external tool named)
- `tracker.externalToolHint`: `null` (no additional connection hint)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`, `"external"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`
- `tracker.externalTool`: a short, non-empty identifier of the tool that holds the issues. There is
  **no** whitelist; Effective Flow neither rejects an unknown tool nor infers capabilities from the
  name. Required when the mode is `external`.
- `tracker.externalToolHint`: free text that lets the run-time agent pick the right connection —
  e.g. MCP server name, workspace, team or project key, identifier convention, or state names.

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection of the "Remote helper contract" in `issue-tracker-forge.md` decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`. In hidden mode (config locator step 0) no argument overrides the forced `local` target: an issue reference stops the run instead.
2. **Per-run wish of the user:** A **generic** wish for issue/tracker work ("as issues", "publish to the tracker") activates the **configured** target and never redirects a run to a different one; without a configured target it selects `remote`. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`) selects `remote`, and only a wish that explicitly names the configured external tool selects `external`. If the user explicitly requests local work ("local", "without issues", "report only"), `local` is active — that stays the escape hatch on every target.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
Before asking, score each option for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `effective-flow setup` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything in the sibling fragment `issue-tracker-forge.md` — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

**Load on demand:** Read `shared/issue-tracker-forge.md`, when the resolved tracker target is the forge and the Phase 1 inventory is about to list issues carrying `firmo-` labels.

This tool deliberately carries **no** deferred `tracker-target` pointer, unlike every other source
that embeds the fragment above. It resolves the tracker target only to decide whether its
`firmo-` label class runs at all, performs no tracker write of any kind, and skips that class
entirely on an external target. Loading the external contract would therefore be pure context
cost. Any tracker write added here must load the contract first.

## Project conventions

If the project has an `AGENTS.md`, read it before cleaning up and follow its guidance on file formats, configuration, and project-wide conventions.

## Hard scope boundary

- **Only the current project.** This skill does **not** touch any global skill installation (e.g. `~/.claude/skills/effective-flow` or `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*` agents). Removing old installed skills/agents is done by the deploy scripts, not this tool.
- **Never delete the new.** The active runtime directory `.effective-flow/` itself, its current
  runtime state, and the project setup ADR are never deleted. The recognized legacy
  `config.json` exception remains governed by the legacy classes below. The only current
  runtime-state deletions allowed are the lifecycle record of a successfully reconciled
  `cleanup apply` claim and a confirmed stale diff baseline; no other active runtime file is a
  cleanup target.
- **Never target the main or current execution worktree.** `RUNTIME_STATE_ROOT` and the worktree
  from which cleanup is running are never removal candidates. A linked current execution
  worktree still appears in the final retained-worktree report.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `effective-flow commit`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `effective-flow setup` is responsible for that (see Phase 3).
- **Do not edit `.gitignore`.** Inventory and report outdated entries, then route normalization
  to `effective-flow setup`, the sole repair owner.
- **Never touch hidden mode's ignore entry.** The `.effective-flow/` line in
  `$(git rev-parse --git-common-dir)/info/exclude` is the active counterpart that hidden mode relies
  on, never a legacy remnant: inventory it and leave it untouched. The local hidden configuration
  `.effective-flow/project-setup.md` is current configuration, not a legacy `config.json`, and the
  hidden-mode processed-thread ledger `.effective-flow/merge-gate/thread-ledger.json` that
  `effective-flow iterate` keeps is current runtime state, never a leftover.
- **Delete only with consent.** Every deletion happens only after a dry run and explicit confirmation.

## Legacy classes

The skill knows exactly these four classes of migration remnants, each with its new counterpart:

| Class                       | Legacy remnant                                                                                                                                 | New counterpart                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime directories         | `.firmo/`, `.sf-plugin/` (deliberately left after migration)                                                                                   | `.effective-flow/`                              |
| Legacy `config.json`        | untracked `.firmo/config.json` or a legacy `config.json` in a runtime directory                                                                | project setup ADR (see `effective-flow setup`)       |
| Legacy `.gitignore` entries | outdated ignore lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern `.effective-flow/*` + `!.effective-flow/config.json`             | the single line `.effective-flow/`              |
| `firmo-` labels             | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` on the issue | the `effective-flow-` variant on the same issue |

`sf-` labels are **not** a standalone target: they are already moved to `effective-flow-` by the one-time `sf-` label migration (see "Label convention" in `issue-tracker-forge.md`). This skill only clears up remaining `firmo-` labels.

Linked worktrees are a separate cleanup class, not a fifth migration remnant. Existing
worktrees are never treated as legacy merely because they predate lifecycle recording.

Stale diff baselines are another separate class: an aborted `effective-flow build`, `effective-flow fix`, or
`effective-flow refactor` run leaves its `.effective-flow/runs/<RUN_ID>/diff-baseline/` directory
behind, and its diff can hold working-tree secrets. Nothing proves such a directory abandoned:
list each with its run ID (the run's start timestamp), warn that a run still in progress needs its
directory, and never infer staleness from age.

## Workflow

`cleanup plan` and `cleanup apply` are the helper operations of this tool, in the call shape of the
included lifecycle contract. `cwd` is `RUNTIME_STATE_ROOT`, `executionRoot` the cleanup checkout:

```text
node <skill-root>/scripts/effective-flow-state.mjs cleanup plan <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","decisions":<decisions>}'
node <skill-root>/scripts/effective-flow-state.mjs cleanup apply <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","decisions":<decisions>,"items":{"<itemId>":"<itemDigest>"}}'
```

`decisions` holds the carry-over answers: `discardAll` (legacy directory names whose open entries
are discarded), `discard` (single `.firmo/<path>` or `.sf-plugin/<path>` entries), and `config`
(`".effective-flow/config.json"`, `".firmo/config.json"` or `".sf-plugin/config.json"` →
`"complete"` once its values are in the ADR, `"discarded"` when the user drops them). `cleanup plan`
is read-only and returns `items` (actionable, each with `itemId` and `itemDigest`), `blocked` (with
`failures`), and `unrecorded` registered worktrees; item IDs are `worktree:<RECORD_ID>`,
`legacy:.firmo`, `legacy:.sf-plugin` and `config:.effective-flow/config.json`.

### Phase 1: Discovery / inventory

1. If this is a Git repository, issue and verify an execution-location receipt for the cleanup
   checkout and retain the verified main checkout as `RUNTIME_STATE_ROOT`. If Git or worktree
   support is unavailable, skip worktree removal, report the reason, and continue the migration
   inventory where possible.
2. Call `cleanup plan` without `decisions`; the helper guards the runtime root itself. From
   `git worktree list --porcelain -z` and the records below
   `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/` it classifies every record by the removal
   eligibility conditions; the main worktree and this cleanup's own execution worktree are
   excluded as removal candidates.
3. Classify every linked worktree other than the main worktree into exactly one preliminary
   result: a **removal candidate** (`worktree:` item), **retained** with its first failed condition
   or status (a `blocked` record: `active`, `aborted`, `failed`, `cleanup-in-progress`, dirty,
   locked, prunable, missing, mismatched, unknown or invalid schema), or **recordless** (an
   `unrecorded` entry: foreign, harness-managed, user-managed or created before lifecycle
   recording). A call that is not `ok` makes the worktrees **not reliably checkable**: retained,
   never silently skipped.
4. **Stale diff baselines:** list every `<RUNTIME_STATE_ROOT>/.effective-flow/runs/*/diff-baseline/`
   directory read-only, without following a symlink.
5. Capture the existing legacy remnants in the project root:
   - **Runtime directories and legacy `config.json`:** the plan's `legacy:` and `config:` items,
     ready or blocked.
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`info/exclude`:** read `$(git rev-parse --git-common-dir)/info/exclude` read-only and note
     whether it carries the `.effective-flow/` line. Inventory that line as the **active
     counterpart** of hidden mode, never as a legacy remnant and never as a removal candidate.
   - **`firmo-` labels:** forge history, and therefore only on the forge target with an authenticated CLI (see "Remote helper contract" in `issue-tracker-forge.md`) — list issues with `firmo-` labels separately per prefix. If the forge target, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly. On an external target this class is skipped entirely and reported as skipped: `firmo-` recognition and the one-time `sf-` migration are never run, emulated, or recorded against an external tool. Because that skip needs no tracker access, this tool requires no external-target contract.
6. If at least one legacy runtime directory exists, read
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` without mutation and inspect
   `runtimeMigration.directory.version`. When the valid version `1` marker is missing, treat the
   discovered legacy directory as the authorization for cleanup's first runtime write:
   - freshly revalidate the execution-location receipt and `RUNTIME_STATE_ROOT`, then apply
     “Runtime-state write safety” from that root;
   - invoke the loaded shared runtime-directory migration prerequisite exactly as written,
     without a separate carry-over confirmation and without reimplementing its inventory, copy,
     memory-merge, locking, or marker logic;
   - if any guard, source inventory, copy, memory validation, lock, or marker write fails, keep
     every legacy directory, do not offer any runtime directory for deletion, report the exact
     failure and safe retry through `effective-flow cleanup` (or the required ignore/index repair
     through `effective-flow setup`), and continue only independent inventory/reporting;
   - after success, repeat the legacy-runtime, counterpart, legacy-config, and nested-worktree
     inventory by calling `cleanup plan` again before making any carry-over or deletion decision.
     Do not invoke the prerequisite when no legacy runtime directory exists: such a cleanup run
     creates no runtime footprint merely to record a marker.
7. The marker certifies only the source it names. If `.firmo/` and `.sf-plugin/` both exist, the
   plan's inventory lists the unselected `.sf-plugin/` separately: the marker does not certify its
   carry-over and never releases it for deletion (`LEGACY_UNMIGRATED`). An item with
   `legacyMarker: true` comes from a marker written before markers named their source; it is
   certified only by a carry-over with no open entry.
8. For `firmo-` labels, determine whether the `effective-flow-` counterpart exists.
9. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists),
   worktree counts (removal candidate, retained, recordless or not reliably checkable), and stale
   diff baselines by run ID. Never end for lack of migration remnants; worktree preview and the
   final report still run.

### Phase 2: Carry-over check

The plan re-derives carry-over: ordinary files, legacy `.worktrees/` included, require byte-identical
counterparts below `.effective-flow/` or explicit discard; missing/differing files and non-regular entries
stay in `carryOver.open`. Source-named markers allow `memory.json` proof by current canonical
containment (recursive objects, exact arrays/scalars), not marker alone; unpreserved keys/conflicts
and unavailable proof stay open. Legacy `config.json` needs a `config` decision: parse it; invalid
JSON is **not** a carry-over source (report path and error), while values absent from the project
setup ADR are candidates. `.gitignore` and labels have no file carry-over.

### Phase 3: Confirm and perform carry-over

Present the open entries grouped by legacy directory and obtain a decision per group. Before the
Carry over question, tell the user about every item with `legacyMarker: true`: its marker names no
source, so every entry, its `memory.json` included, must be carried or discarded.

If there are runtime file candidates that are missing in `.effective-flow/` or differ: Ask the user: **Which files from the old runtime directory should be carried over to `.effective-flow/` before it is deleted?**
- Carry over all -- Copy every listed file to .effective-flow/ (do not overwrite existing files in the target)
- Select individually -- Decide per file which is carried over and which is discarded
- Carry over nothing -- Carry over no file — the entire old content is released for deletion

- **Carry over:** if a copy needs a missing directory below `.effective-flow/`, apply
  “Runtime-state write safety” to that exact directory immediately before its `mkdir`, and to the
  concrete file target immediately before each confirmed copy. Copy (do not move) and never
  overwrite a file already present; a differing file therefore stays open until it is discarded. A
  block preserves source and target and directs the user to `effective-flow setup`.
- **Discard:** "Carry over nothing" adds the directory to `discardAll`; a file discarded under
  "Select individually" goes to `discard`.
- **Config values:** do **not** write them into the ADR yourself. Name the affected keys and refer
  to `effective-flow setup`; record `complete` once they are in the ADR, `discarded` when the user drops
  them. Until then the legacy `config.json`, and the runtime directory containing it, stay blocked.
  Reason `live-configuration` (`NOT_ELIGIBLE` on the `config:` item, an open carry-over entry inside
  a legacy directory) means the config locator finds no project setup ADR (steps 0–2), so a legacy
  `config.json` can still be the live configuration (step 3): no decision, `discarded` included,
  unblocks it; the next step is `effective-flow setup` to create the ADR.
- **Labels:** carried over in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

After the copies, call `cleanup plan` with the decisions so far and present every entry still in
`carryOver.open` – a differing file, a non-regular entry, or unpreserved `memory.json` content –
with a discard option. A differing or non-regular entry can only be discarded, never copied; an
entry the user keeps blocks its directory. Then call `cleanup plan` with the final `decisions`;
this plan is the dry run of Phase 4.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label, class, and `itemId`.
2. Per file or directory, the Git status: **tracked** artifacts (a `LEGACY_TRACKED` item) are
   recoverable via the Git history and go through `git rm`; untracked or gitignored ones are
   **not** recoverable.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. Offer a legacy runtime directory only as a `legacy:` item: the plan proves its counterpart and
   marker, its carry-over complete or discarded (a contained legacy `config.json` included), and
   no `.git` below it. A blocked one is not offered; report its failures (`LEGACY_UNMIGRATED`,
   `CARRY_OVER_OPEN` with the open entries, `LEGACY_TRACKED`, `NOT_ELIGIBLE`, `UNSAFE_TARGET`) and
   the safe retry through `effective-flow cleanup` or repair through `effective-flow setup`.
5. **Legacy worktrees:** a legacy directory with a nested `.git` or a registered worktree anywhere
   below it is blocked (`NOT_ELIGIBLE`, `nested-git` or `registered-worktree` with its
   `registrations`); deleting the directory is never a substitute for removing a worktree.
6. Show worktree candidates as their own class: path, checkout identity, status, owner
   workflow/purpose, and branch policy. State that eligibility is checked again under an exclusive
   record lock immediately before removal.
7. List retained and recordless worktrees separately with their concrete reason. They are not
   offered for confirmation.
8. Explain that worktree removal uses only `git worktree remove <path>` without force. An
   `apply-review` branch is deleted only by `git branch -d`; when Git refuses, cleanup keeps it and
   reports it as `BRANCH_RETAINED`. Delivery and partial-diff branches remain. Cleanup never runs
   `git worktree prune` or `git branch -D`.
9. If there are no deletable migration artifacts, stale diff baselines, or worktree removal candidates, call the
   action set a no-op, but continue to Phase 6 so the mandatory retained-worktree report is
   still produced.

### Phase 5: Confirm deletion and execute git-aware

Obtain confirmation **per artifact class** and only then execute the deletion.

If there is at least one deletable legacy remnant: Ask the user: **Remove the legacy remnants listed above now? Tracked files via `git rm` (recoverable via the history); untracked/gitignored directories are removed physically and irreversibly.**
- Yes, remove as listed -- Tracked via git rm (staged, no commit); untracked/gitignored deleted physically; firmo labels detached from the issue
- Remove tracked only -- Only the git-recoverable, tracked artifacts via git rm; keep untracked directories and labels for now
- Cancel -- Delete nothing; the inventory remains

If there is at least one verified worktree removal candidate: Ask the user: **Remove the verified Effective Flow worktrees listed in the dry run now, after checking every proof again under its lifecycle lock?**
- Remove all verified -- Revalidate and remove every still-eligible listed worktree with ordinary git worktree remove
- Select individually -- Choose which listed worktrees may be revalidated and removed
- Keep all -- Remove no worktree; list every one in the final retained-worktree report

If there is at least one stale diff baseline: Ask the user: **Discard the stale diff baselines listed in the dry run now? Removal is physical and irreversible.**
- Remove all listed -- Discard every listed diff-baseline directory
- Select individually -- Choose which listed directories to discard; keep the rest
- Keep all -- Discard no diff baseline; each stays for a later cleanup run

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit).
- **Untracked/gitignored legacy items and worktrees:** "Yes, remove as listed" selects every
  `legacy:` and `config:` item of the dry run; "Remove all verified" every `worktree:` item,
  "Select individually" the chosen ones. Send all selected items in **one** `cleanup apply` call
  with the dry run's `decisions` and each item's `itemDigest`; give it an explicit Bash timeout of
  120000 ms and, in Codex, request sandbox escalation for it up front. The helper re-proves every
  selected item from fresh evidence before it removes anything.
- **Stale diff baselines:** for each confirmed directory, revalidate the receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety to its exact handle,
  and remove it only through `node <skill-root>/scripts/diff-baseline.mjs discard` with
  `{ "cwd": "<RUNTIME_STATE_ROOT>", "dir": "<its absolute handle>" }` on stdin, as
  `shared/diff-baseline.md`, section "Lifecycle", defines it; keep a refused one.
- **`.gitignore`:** leave every line untouched. Report the exact outdated entries and route the
  user to `effective-flow setup`, the sole owner of normalization and repair.
- **`firmo-` labels:** only on the forge target with a successful helper probe; skipped on an external target. Build the full normalized label transitions through the remote helper: first add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains. Inspect the dry-run steps before applying; if a step fails, report the completed steps and preserve the still-classified issue.

`cleanup apply` outcomes:

- `PREVIEW_MISMATCH` (`itemId`, `reason`), whole call: a selected item changed since the dry run
  (`digest`), vanished (`unknown-item`) or is no longer actionable (`not-actionable`), and nothing
  was written. Call `cleanup plan` again, show the new dry run, and ask again.
- `result.items[]`, one per selected item: worktree items follow the lifecycle outcome table, where
  `BRANCH_RETAINED` keeps an `apply-review` branch Git refused to delete. A legacy item reports
  `ok` with `removedEntries`, or its code: `LEGACY_CHANGED`, `UNSAFE_TARGET` and `WRITE_FAILED` stop
  that item with the partial state (`removedEntries`, `stoppedAt`), the plan codes of Phase 4 block
  it, and `DEADLINE_REACHED` or `INTERRUPTED` leave it for a later run. Every other item continues.
  After `git rm` of tracked remnants, rerun cleanup so the untracked rest of a mixed legacy
  directory is planned.
- A denied or refused call, another nonzero exit, an `error` (`INVALID_ROOT`, `INVALID_INPUT`,
  `RUNTIME_STATE_UNSAFE`, `GIT_FAILED`): nothing beyond the reported items changed; report it and
  retain every selected artifact.

On a migration-cleanup error (e.g. `git rm` fails or the tracker is unreachable), abort that
dependent migration sequence in a controlled manner: report the partial state and delete nothing
whose new counterpart is not secured. A worktree error affects only that independently claimed
candidate and is reported as retained, failed, or partial cleanup.

### Phase 6: Completion

The completion report is mandatory even when no migration remnant or worktree candidate exists.

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values `effective-flow setup` owns
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed,
  including discarded stale diff baselines
- which outdated `.gitignore` lines remain and that `effective-flow setup` owns their repair, not this run
- whether the Git common directory's `info/exclude` carries the `.effective-flow/` line, reported as
  hidden mode's active ignore entry that this run left untouched
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- worktrees removed successfully, with their checkout identities and branch outcomes, and every
  `BRANCH_RETAINED` branch with its unproven commits
- failed removal attempts and partial cleanup, including exact record, lock, branch, or command
  state that remains
- every remaining linked worktree other than the main worktree, one entry per worktree, with a
  path relative to the project root when internal (otherwise canonical absolute), checkout
  identity, lifecycle status and verification status, one concrete retention reason, and one
  safe next step; never collapse several worktrees behind a shared reason
- unmatched lifecycle records whose worktree is absent or mismatched, separately from linked
  worktrees, so interrupted post-removal state remains visible
- an explicit statement when no linked worktrees remain
- what else deliberately remains and why
- that **no** commit was created and which removals are staged

Retention reasons and their safe next steps:

- the current cleanup execution worktree: “Cleanup is running in this worktree.”
- `active`: an Effective Flow run is registered as active and may still be running or may have
  been interrupted unexpectedly; let the named owner finish
- `aborted` or `failed`: the owning run stopped or failed before cleanup readiness; inspect and
  recover its work. For a `partial-diff` record, the next step is `effective-flow deliver` in its source
  checkout, whose start offers to resume it or release it for cleanup; cleanup then removes it, also
  when its worktree is fully gone
- `cleanup-in-progress` or an existing lock: cleanup is claimed, active, or may have been
  interrupted; include known owner and timestamp and let the owner finish
- dirty: clean the checkout before rerunning cleanup; locked: ask the known owner before unlocking
- prunable, missing, detached, branch/OID-, receipt- or repository-mismatched: name the failed
  condition and reconcile manually
- reused, user-managed, foreign, or `harness-managed`: not Effective Flow-owned; the harness or
  user manages it
- no lifecycle record or an unknown/invalid schema: ownership cannot be proven; reconcile manually
- `cleanup-failed`: include the recorded removal failure; rerun cleanup once it is eligible again
- an orphan record lock (no record, or no owner): report its path; never break it

Cleanup never breaks a lock or upgrades a retained lifecycle status to make it eligible.

Then emit the next-step block per `next-steps` as the last element of the report: the staged-removals
row when this run staged deletions, the configuration row when it only referred config values on. A
report that found neither matches no row and emits nothing.

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Remove untracked legacy remnants, lifecycle records and worktrees only through `cleanup apply`;
  never `rm`, `rmdir` or `unlink` them, or write a record, in prose.
- A migration marker certifies only the source it names; never use it as deletion proof for an
  unselected simultaneous legacy directory.
- Preserve the active `.effective-flow/` directory and all unrelated runtime state. Mutate below
  it only for the explicitly confirmed carry-over copies, migration and `cleanup apply` above, or a
  confirmed stale diff-baseline discard, always through runtime-state safety. Do not mutate the
  project setup ADR or a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `effective-flow setup`.
- Never edit `.gitignore`; inventory and report outdated entries and route repair to
  `effective-flow setup`.
- Leave the `.effective-flow/` line in `info/exclude` untouched; it is active, not legacy.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- Never classify a worktree from age, last-modified time, base-directory shape, branch prefix, or
  apparent emptiness. There is no TTL, heartbeat, stale-after threshold, or automatic crash
  inference.
- Never use `git worktree remove --force`, `git worktree prune`, or `git branch -D`.
- If no legacy remnant is present, continue through worktree inventory and completion reporting.
  A no-op means that neither a migration action nor an eligible confirmed worktree removal ran.
- Output project-internal paths relative to the project root and external worktree paths in
  canonical absolute form.

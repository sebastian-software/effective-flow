
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

**Load on demand:** Read `shared/runtime-state-safety.md`, when worktree lifecycle state will be read or mutated, a stale diff baseline will be discarded, or any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Effective Flow-owned worktree lifecycle

This contract adds crash-tolerant lifecycle evidence to the execution-location receipt. It never
replaces that receipt, Git's worktree registration, or the runtime-state write-safety contract.
A configured base directory, path pattern, branch prefix, age, or apparently empty checkout is
not ownership evidence.

Only worktrees created by Effective Flow receive lifecycle records. Reused user-managed or
`harness-managed` worktrees remain outside this lifecycle and must never be adopted retroactively.

### Runtime record

Immediately after an `effective-flow-created` execution-location receipt has been issued and
verified, create one record below the retained and freshly revalidated runtime root:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`

`RECORD_ID` is an opaque, collision-resistant, filesystem-safe identifier generated once for the
worktree. It is not derived as proof from the worktree path or branch. A version 1 record has this
single field layout; strings below are illustrative values, not additional nesting choices:

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

`componentId` is always present and is either the component identifier or `null` for a
non-component worktree. `branchPolicy` is exactly `retain` for delivery and partial-diff branches
or `delete-after-integration` for temporary `apply-review` component branches. `reason` is `null`
for the normal `active` or `cleanup-ready` state and otherwise contains the exact transition or
failure reason. During `cleanup-in-progress`, add the top-level string fields `cleanupRunId` and
`claimedAt`; they are absent in every other status.
For a cleanup claim, `cleanupRunId` and `claimedAt` identify its owner and timestamp.
The nested `receipt` is the immutable snapshot issued at creation; fresh receipts are compared
with its repository, root, checkout, origin, workflow, and purpose identity fields but never
overwrite it. Setup status may legitimately advance from the captured `pending` value after
lifecycle creation and is not branch-identity evidence.

`creationOid` is immutable evidence of the commit at which worktree and branch creation
succeeded. Capture the full commit OID once at creation and never replace it with the later
`HEAD`, current branch tip, base ref, or a moving remote tip. Normal commits after creation are
expected to advance the recorded branch beyond this OID.

Paths, IDs, status values, policy values, timestamps, and other machine-readable fields are not
localized. Reject an unknown schema, missing field, duplicate `recordId`, invalid value, path
alias, or record/filename mismatch. Never repair, reinterpret, overwrite, or delete such a record
automatically.

The record is runtime state, not configuration. Resolve its absolute handle below the verified
`RUNTIME_STATE_ROOT`, and apply “Runtime-state write safety” immediately before every parent
creation, lock acquisition, owner-file write, temporary-record write, rename, record deletion,
or lock release. A guard for one handle authorizes no other handle. Create or replace a record by
writing a complete sibling temporary file and atomically renaming it onto the expected record
handle; never expose a partially written record. If initial record creation fails, retain the
worktree and branch and do not run setup or delegate work there. This temporary-file-and-rename
sequence is the required atomic write; use an actual atomic `rename`, not a truncate-and-rewrite
operation on the live record.

### Serialized mutations

Every lifecycle writer, including the creating workflow and every later cleanup run, uses the
same per-record lock:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.lock`

Acquire it atomically with `mkdir`. After successful acquisition, write an `owner` file containing
the actor/run ID, workflow, process or session identity when available, and acquisition timestamp.
Keep the lock for the entire read/validate/transition/operation/reconciliation sequence. Under the
lock, freshly revalidate the runtime root, reread the record, Git worktree inventory and receipt,
and reject any drift before writing.

Release only the exact lock acquired by the current actor and only after its protected sequence
has reached a persisted outcome. An existing lock with another owner, an ownerless lock, or a lock
left by an interrupted process blocks fail-closed. Report its owner and timestamp when readable;
never break it based on age. Likewise, never take over another `cleanup-in-progress` claim. There
is no stale-lock timeout, lifecycle TTL, heartbeat, or age-based status transition.

### State machine

The complete status vocabulary is:

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

Only these transitions are valid:

| From                                | To or terminal action                   | Required proof                                                          |
| ----------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| newly created                       | `active`                                | verified receipt and atomic initial record                              |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | owning workflow, under the record lock                                  |
| `aborted` or `failed`               | `active` (adoption)                     | only the adoption rule of `plan-pr-continuation`, under the record lock |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | fresh eligibility checks plus cleanup run claim                         |
| `cleanup-in-progress`               | `cleanup-failed`                        | claimed actor records the exact failure                                 |
| `cleanup-in-progress`               | delete only this lifecycle record       | claimed actor proves complete cleanup                                   |

Do not transition `active`, `aborted`, or `failed` into a cleanup claim. A controlled user or
workflow stop becomes `aborted`; an implementation, integration, validation, ownership, or
state-persistence error becomes `failed`. A sudden interruption naturally leaves `active`,
`cleanup-in-progress`, or its lock in place. Report that uncertainty honestly; never infer a
crash or successful completion from elapsed time.

### Removal eligibility

Evaluate eligibility from fresh evidence immediately before the dry-run and again under the
record lock immediately before claiming. A worktree is removable only when every condition is
true:

1. The lifecycle record is schema-valid, has ownership `effective-flow-created`, and has status
   `cleanup-ready` or `cleanup-failed`.
2. A fresh execution-location receipt matches the immutable identity fields of the `receipt`
   snapshot and the top-level canonical repository identity, `RUNTIME_STATE_ROOT`, worktree path,
   exact branch, workflow, purpose, and ownership. The snapshot is compared as creation evidence;
   it is not rewritten with current checkout state.
3. Exactly one matching linked-worktree record exists in
   `git worktree list --porcelain -z`; parse NUL-delimited fields and records without
   line-oriented or path-shape assumptions.
4. The Git record is neither `locked` nor `prunable`, the canonical worktree directory exists,
   and its common Git directory matches the recorded repository identity.
5. The current `HEAD` and the Git worktree registration both identify the exact recorded branch,
   and that local branch resolves to `CURRENT_BRANCH_TIP`. Detached, missing, or changed branch
   identities do not qualify.
6. The immutable `creationOid` resolves locally as a commit, and it is an ancestor of
   `CURRENT_BRANCH_TIP`. Check with
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: exit `0` passes, exit `1`
   blocks, and every other exit code or command error also blocks. History rewriting that drops
   `creationOid` therefore fails closed. Never compare this proof against a moving remote tip.
7. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none`
   is empty. Modified submodules and every unexpected tracked or untracked path make it dirty.
8. The target is neither the main worktree/`RUNTIME_STATE_ROOT` nor the execution worktree from
   which the cleanup run itself is operating.
9. No foreign or ownerless lifecycle lock or cleanup claim exists.

Any failed, unavailable, contradictory, or ambiguous proof means retain. Worktrees created before
this lifecycle existed have no record and therefore remain ineligible even if their path, branch,
or contents look familiar.

### Claim, remove, and reconcile

After explicit user confirmation, process each selected candidate independently:

1. Acquire its record lock, rerun every eligibility check, generate a cleanup run ID, and
   atomically transition `cleanup-ready` or `cleanup-failed` to `cleanup-in-progress` with
   `cleanupRunId` and `claimedAt`. These fields are the cleanup run ID and claim timestamp that
   identify the claim owner.
2. While retaining the lock, require the freshly reread record and matching receipt to still
   prove ownership `effective-flow-created`, then run only
   `git worktree remove <WORKTREE_PATH>`. Never add `--force`, and never substitute
   `git worktree prune`.
3. If removal fails, atomically persist `cleanup-failed` with the exact command error, clear the
   claim fields, release the owned lock, and continue only with independently verified
   candidates.
4. If removal succeeds, re-read Git registration, the claimed record, path state, and branch
   policy. Do not reconstruct a removed worktree. A delivery or partial-diff branch with policy
   `retain` remains. A temporary component branch with policy `delete-after-integration` may be
   removed only after its integration is still proven, and only with
   `git branch -d <BRANCH_NAME>`; never use `git branch -D`.
5. Delete only the claimed lifecycle record after absence of the worktree is proven and the
   branch policy is completely satisfied. Then release the owned lock. If worktree removal
   succeeded but record or branch handling did not, preserve the record as `cleanup-failed` when
   it can still be written by the claim owner and report partial cleanup. If persistence itself
   fails, retain the lock/claim evidence and report manual reconciliation rather than claiming
   success.

A lifecycle record whose worktree is already absent is not a normal removal candidate. Reconcile
it only while the current actor still owns the matching lock and `cleanup-in-progress` claim and
can prove the exact successful removal plus branch outcome. Otherwise retain the record and report
the missing/mismatched worktree or interrupted claim for manual reconciliation.

### Retention reasons and final reporting

Classify every linked worktree other than the main worktree deterministically. At minimum retain
and distinguish:

- the current cleanup execution worktree: cleanup is running in this worktree
- `active`: an Effective Flow run is registered as active and may still be running or may have
  been interrupted unexpectedly
- `aborted`: the owning run stopped in a controlled way
- `failed`: the owning run failed before safe cleanup readiness
- `cleanup-in-progress` or an existing lock: cleanup is claimed, active, or may have been
  interrupted; include known owner and timestamp
- dirty, locked, prunable, missing, detached, branch/OID-mismatched, receipt-mismatched, or
  repository-mismatched worktrees: name the failed proof
- reused, user-managed, foreign, or `harness-managed` worktrees: not Effective Flow-owned
- no lifecycle record or an unknown/invalid schema: ownership or lifecycle cannot be proven
- `cleanup-failed`: include the recorded or current removal failure when it is not selected or
  no longer eligible for retry

Pair each reason with a conservative next step: let the named owner finish an active run or
claim; inspect and recover work from `aborted` or `failed`; clean a still-eligible dirty checkout
before rerunning cleanup; ask the known owner before unlocking a Git-locked worktree; let the
harness or user manage external worktrees; and manually reconcile recordless, prunable, missing,
invalid-schema, foreign-lock, or partial-cleanup state. Cleanup itself never breaks a lock or
upgrades a retained lifecycle status to make it eligible.

The completion report is mandatory even when no removal candidate or migration remnant exists.
List removed worktrees, failed or partial cleanup attempts, and every remaining linked worktree
other than the main worktree. For each remaining worktree show a project-relative path when it is
inside the runtime root (otherwise its canonical path), checkout identity, lifecycle/verification
status, one concrete retention reason, and one safe next step. Never collapse several worktrees
behind a shared reason. State explicitly when no linked worktrees remain. Report unmatched
lifecycle records separately so partial cleanup evidence is not hidden.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when Phase 1 step 6 finds at least one legacy runtime directory and no valid `runtimeMigration.directory.version: 1` marker in `.effective-flow/memory.json`, a remote tracker access is about to perform its first runtime-state mutation (the forge contract's one-time `labelMigration.sf` marker), or any confirmed Phase 3 or Phase 5 mutation below `.effective-flow/` is about to run, even when Phase 1 found no legacy runtime directory (for example a carry-over copy or directory creation, a worktree lifecycle lock, claim, removal, reconcile, record write or deletion, a stale diff-baseline discard, or the confirmed removal of a legacy file such as a transitional `.effective-flow/config.json`).

## Effective Flow configuration (project setup ADR)

The tracked configuration is a living ADR "Effective Flow project setup" (default slug
`effective-flow-project-setup`) carrying a Markdown key/value table; hidden mode keeps it in the
untracked `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`. `.effective-flow/` is otherwise
private, ignored runtime state, and no `config.json` is a configuration source.

### Config locator (resolution call)

Before the first configuration-dependent step, run
`node <skill-root>/scripts/config-resolve.mjs resolve` with one JSON object on standard input:
`cwd` (the checkout this run works in), `tool` (this tool's own name, e.g. `refactor`; an internal
source such as `apply-plan` passes its own), and `mode` for `iterate` (`local`/`pr`) and
`apply-review` (`local`/`remote`). The script runs the whole config locator (steps 0–4), decodes
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
  runtime-state deletions allowed are the exact lifecycle record owned by a successfully
  reconciled cleanup claim and a confirmed stale diff baseline; no other active runtime file is a
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

### Phase 1: Discovery / inventory

1. If this is a Git repository, issue and verify an execution-location receipt for the cleanup
   checkout and retain the verified main checkout as `RUNTIME_STATE_ROOT`. Inventory worktrees
   with `git worktree list --porcelain -z`, parsing NUL-delimited fields and records rather than
   human-formatted lines. The first record is the main worktree: validate it as the runtime root,
   exclude it as a removal target, and omit it only from the final retained-linked-worktree list.
   If Git or worktree support is unavailable, skip worktree removal, report the reason, and
   continue the migration inventory where possible.
2. Before reading lifecycle state, load and apply the runtime-root portion of “Runtime-state
   write safety”. Read schema-valid records only from the canonical absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/` handle. Match records to Git entries by
   canonical repository identity, path, checkout identity, and receipt owner/purpose. Treat the
   immutable `creationOid` as branch-history evidence: it must resolve as a commit and remain an
   ancestor of the current recorded branch tip, not equal current `HEAD`; path shape and branch
   prefix are never sufficient.
3. Classify every linked worktree other than the main worktree into exactly one preliminary
   result:
   - **removal candidate** only when every shared lifecycle eligibility proof passes and status
     is `cleanup-ready` or `cleanup-failed`;
   - **retained** with the first concrete failed proof, including current cleanup execution,
     `active`, `aborted`, `failed`, `cleanup-in-progress`, dirty, locked, prunable, missing,
     mismatched, foreign/harness-managed, unknown or invalid schema, or recordless state;
   - **not reliably checkable** when repository, path, runtime-state, or receipt evidence cannot
     be read safely; this is retained, never silently skipped.
4. **Stale diff baselines:** list every `<RUNTIME_STATE_ROOT>/.effective-flow/runs/*/diff-baseline/`
   directory read-only, without following a symlink.
5. Capture the existing legacy remnants in the project root:
   - **Runtime directories:** do `.firmo/` and/or `.sf-plugin/` exist?
   - **Legacy `config.json`:** does `.firmo/config.json`, `.sf-plugin/config.json`, or a `config.json` recognizable as outdated in `.effective-flow/` (transitional fallback whose values belong in the ADR) exist?
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
     inventory from fresh filesystem and Git evidence before making any carry-over or deletion
     decision.
     Do not invoke the prerequisite when no legacy runtime directory exists: such a cleanup run
     creates no runtime footprint merely to record a marker.
7. Treat the migration marker as proof only for the source selected by the shared precedence
   rule (`.firmo/`, otherwise `.sf-plugin/`). If `.firmo/` and `.sf-plugin/` both exist, inventory
   the unselected `.sf-plugin/` separately; the marker does not certify its carry-over and never
   releases it for deletion.
8. For each existing legacy remnant, determine whether its **new counterpart** exists (`.effective-flow/`, project setup ADR, or `effective-flow-` labels).
9. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists),
   worktree counts (removal candidate, retained, not reliably checkable), and stale diff baselines
   by run ID. Never end for lack of migration remnants; worktree preview and the final report still run.

### Phase 2: Carry-over check (read + compare)

Read the legacy remnants and determine whether anything still needs to be carried over before deleting:

- **Runtime directories:** For the source selected by the shared migration, verify the freshly
  written marker and compare any divergent or newer entries that the no-clobber migration
  deliberately left in place. If both legacy directories exist, compare the unselected
  `.sf-plugin/` independently against `.effective-flow/`; missing or divergent entries remain
  explicit carry-over/discard decisions because the selected source's marker proves nothing
  about them. Never treat legacy `.worktrees/` as a file carry-over candidate.
- **Legacy `config.json`:** Parse it. If it is not valid JSON, it is **not** a carry-over source: report the path and error and treat the file only as a deletion candidate (after confirmation). For valid JSON, compare each set value with the project setup ADR; values not represented there are carry-over candidates.
- **`.gitignore`/labels:** no file carry-over. For labels, the add-before-remove step in Phase 5 applies.

### Phase 3: Confirm and perform carry-over

The shared prerequisite has already carried over missing entries from its selected source
non-destructively. Present only the remaining divergent entries and any entries from an
unselected simultaneous legacy directory to the user, grouped by source, and obtain a decision
per group. Carry over only explicitly confirmed candidates.

If there are runtime file candidates that are missing in `.effective-flow/` or differ: Ask the user: **Which files from the old runtime directory should be carried over to `.effective-flow/` before it is deleted?**
- Carry over all -- Copy every listed file to .effective-flow/ (do not overwrite existing files in the target)
- Select individually -- Decide per file which is carried over and which is discarded
- Carry over nothing -- Carry over no file — the entire old content is released for deletion

- **Runtime files:** If a copy needs a missing directory below `.effective-flow/`, apply
  “Runtime-state write safety” to that exact directory immediately before its `mkdir`; repeat
  this for every missing parent created. Immediately before each confirmed copy, apply the guard
  again to the concrete file target. Copy only after it passes (do not move); do **not** overwrite
  a file already present in the target. A block preserves both source and target and directs the
  user to `effective-flow setup`. Rejected items remain deletion candidates.
- **Config values:** Do **not** write differing values into the ADR yourself. Disclose them and refer to `effective-flow setup` for the carry-over. Output the affected keys concretely so the user can confirm them in `effective-flow setup`. Only once the values are in the ADR or the user explicitly discards them is the legacy `config.json` considered free of carry-over and thus deletable.
- **Labels:** no file carry-over; the carry-over happens in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label and the class.
2. Per file/directory, the Git status: **tracked**, **untracked**, or **gitignored**. Tracked ones are recoverable via the Git history; untracked/gitignored artifacts (`.effective-flow/`, `.firmo/`, `.sf-plugin/` are gitignored) are **not** recoverable via Git.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. For each legacy runtime directory, demonstrate from the refreshed inventory that its new
   counterpart exists and its own carry-over is complete or deliberately discarded. A valid
   marker may certify only the preferred source selected by the shared migration. If migration
   failed, the counterpart or marker is missing, or the directory was the unselected simultaneous
   source, do **not** offer it for deletion; report the concrete missing proof and the safe retry
   through `effective-flow cleanup` or repair through `effective-flow setup`.
5. **Couple nested classes:** A legacy `config.json` lies physically **inside** a runtime directory (e.g. `.firmo/config.json` in `.firmo/`). Do **not** offer the containing runtime directory (class "Runtime directories") for deletion while the contained legacy `config.json` (class "Legacy `config.json`") still has open carry-over — otherwise deleting the directory would take the not-yet-carried-over `config.json` with it. Only once its values are in the ADR or explicitly discarded is the containing directory also considered deletable.
6. **Couple legacy worktrees:** Before offering a legacy runtime directory for deletion, compare
   its canonical `<legacy-directory>/.worktrees/` tree with the fresh complete Git worktree
   inventory. If any registered linked worktree is current, active, retained, not reliably
   checkable, or otherwise still rooted below that tree, keep the containing legacy runtime
   directory. Worktree removal remains exclusively governed by the lifecycle
   claim/remove/reconcile protocol; deleting the containing directory is never a substitute.
7. Show verified worktree candidates as their own artifact class. For each candidate list path,
   checkout identity, lifecycle status, owner workflow/purpose, branch policy, and the successful
   receipt, registration, unlocked/non-prunable, clean-state, and non-current-worktree proofs.
   State that eligibility will be checked again under an exclusive record lock immediately
   before removal.
8. List preliminary retained and not-reliably-checkable worktrees separately with their concrete
   reason. They are not offered for confirmation. In particular, never offer the main worktree,
   current cleanup execution worktree, a worktree with `active`, `aborted`, `failed`, or
   `cleanup-in-progress` status, or a worktree without a valid matching lifecycle record.
9. Explain that worktree removal uses only `git worktree remove <path>` without force. For
   `apply-review` records, a proven integrated temporary branch may subsequently use
   `git branch -d`; delivery and partial-diff branches remain. Cleanup never runs
   `git worktree prune` or `git branch -D`.
10. If there are no deletable migration artifacts, stale diff baselines, or worktree removal candidates, call the
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

- **Tracked files:** remove via `git rm` (staged, **no** commit). For untracked/gitignored, `git rm` does not apply.
- **Untracked/gitignored directories** (`.firmo/`, `.sf-plugin/`, a gitignored legacy
  `config.json`): immediately before removal, refresh the migration/carry-over evidence and Git
  worktree inventory. Remove physically only when no registered linked worktree remains below
  the directory's `.worktrees/` tree and only after the explicit “irreversible” confirmation
  above, without a backup.
- **Stale diff baselines:** for each confirmed directory, revalidate the receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety to its exact handle,
  and remove it only through `node <skill-root>/scripts/diff-baseline.mjs discard` with
  `{ "cwd": "<RUNTIME_STATE_ROOT>", "dir": "<its absolute handle>" }` on stdin, as
  `shared/diff-baseline.md`, section "Lifecycle", defines it; keep a refused one.
- **`.gitignore`:** leave every line untouched. Report the exact outdated entries and route the
  user to `effective-flow setup`, the sole owner of normalization and repair.
- **`firmo-` labels:** only on the forge target with a successful helper probe; skipped on an external target. Build the full normalized label transitions through the remote helper: first add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains. Inspect the dry-run steps before applying; if a step fails, report the completed steps and preserve the still-classified issue.

For each explicitly selected worktree candidate, independently execute the shared lifecycle
claim/remove/reconcile protocol:

1. Revalidate the cleanup execution receipt and `RUNTIME_STATE_ROOT`, apply runtime-state safety
   to the exact lock and record handles, and atomically acquire the per-record lock. If the lock
   exists, retain the worktree and report its readable owner/timestamp; never break it.
2. Under the lock, freshly reread the record, receipt, `git worktree list --porcelain -z`, exact
   branch, common directory, `locked`/`prunable` attributes, path, clean status including
   untracked files and submodules, and main/current-worktree exclusions. Require `creationOid` to
   resolve as a commit and run
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: only exit `0` passes; exit
   `1`, every other code, and command errors block. Current `HEAD` and Git registration must still
   name the recorded branch, but later commits are valid and no moving remote tip is compared.
   Drift makes this candidate retained without affecting another candidate.
3. Only from `cleanup-ready` or `cleanup-failed`, atomically write `cleanup-in-progress` with this
   cleanup run's unique ID and claim timestamp. Keep the lock through the Git operation and
   reconciliation.
4. Run exactly `git worktree remove <WORKTREE_PATH>`. On refusal, persist `cleanup-failed` with
   the exact error, clear this run's claim fields, release only its own lock, and continue with
   independently valid candidates.
5. After success, prove that the worktree registration and path are gone and reread the claimed
   record. Preserve `retain` branches. For `delete-after-integration`, reconfirm the recorded
   integration proof and use only `git branch -d <BRANCH_NAME>`; if safe deletion is refused,
   retain the branch and lifecycle record and report partial cleanup.
6. Delete only this run's lifecycle record after every required postcondition is proven, then
   release only its own lock. A failure after worktree removal is partial cleanup, not success.
   Never reconstruct the worktree or take over a foreign/orphaned claim to complete it.

If the claimed worktree is already removed or no longer registered before record or branch
post-processing finishes, reconcile only while this run still owns the matching lock and claim.
Otherwise retain the lifecycle evidence and report manual reconciliation.

On a migration-cleanup error (e.g. `git rm` fails or the tracker is unreachable), abort that
dependent migration sequence in a controlled manner: report the partial state and delete nothing
whose new counterpart is not secured. A worktree error affects only that independently claimed
candidate and is reported as retained, failed, or partial cleanup.

### Phase 6: Completion

The completion report is mandatory even when no migration remnant or worktree candidate exists.
For a linked current execution checkout, use the explicit reason “Cleanup is running in this
worktree.”

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values `effective-flow setup` owns
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed,
  including discarded stale diff baselines
- which outdated `.gitignore` lines remain and that `effective-flow setup` owns their repair, not this run
- whether the Git common directory's `info/exclude` carries the `.effective-flow/` line, reported as
  hidden mode's active ignore entry that this run left untouched
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- worktrees removed successfully, with their checkout identities and retained/deleted branch
  outcomes
- failed removal attempts and partial cleanup, including exact record, lock, branch, or command
  state that remains
- every remaining linked worktree other than the main worktree, one entry per worktree, with a
  path relative to the project root when internal (otherwise canonical absolute), checkout
  identity, lifecycle status and verification status, one concrete retention reason, and one
  safe next step
- unmatched lifecycle records whose worktree is absent or mismatched, separately from linked
  worktrees, so interrupted post-removal state remains visible
- an explicit statement when no linked worktrees remain
- what else deliberately remains and why
- that **no** commit was created and which removals are staged

Then emit the next-step block per `next-steps` as the last element of the report: the staged-removals
row when this run staged deletions, the configuration row when it only referred config values on. A
report that found neither matches no row and emits nothing.

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Do not delete a runtime directory while it contains a legacy `config.json` with open carry-over; only after carry-over into the ADR or deliberate discard is it deletable.
- Do not delete a runtime directory while a registered current, active, retained, or otherwise
  unresolved linked worktree remains below its `.worktrees/` tree.
- A migration marker certifies only the one source selected by the shared precedence rule; never
  use it as deletion proof for an unselected simultaneous legacy directory.
- Preserve the active `.effective-flow/` directory and all unrelated runtime state. Mutate below
  it only for the explicitly confirmed legacy carry-over/migration operations above, a confirmed
  stale diff-baseline discard, or the exact lifecycle record, temporary record, and owned lock
  handles authorized by the shared worktree-lifecycle contract, always through runtime-state safety. Do not mutate the project
  setup ADR or a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `effective-flow setup`.
- Never edit `.gitignore`; inventory and report outdated entries and route repair to
  `effective-flow setup`.
- Leave the `.effective-flow/` line in `info/exclude` untouched; it is active, not legacy.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- Never classify a worktree from age, last-modified time, base-directory shape, branch prefix, or
  apparent emptiness. There is no TTL, heartbeat, stale-after threshold, or automatic crash
  inference.
- Never remove a worktree without a valid Effective Flow lifecycle record, dry-run listing,
  explicit confirmation, fresh eligibility proof, per-record lock, and exclusive
  `cleanup-in-progress` claim.
- Use only ordinary `git worktree remove <path>` and, for a proven integrated temporary branch,
  `git branch -d`. Never use `--force`, `git worktree prune`, or `git branch -D`.
- If no legacy remnant is present, continue through worktree inventory and completion reporting.
  A no-op means that neither a migration action nor an eligible confirmed worktree removal ran.
- Output project-internal paths relative to the project root and external worktree paths in
  canonical absolute form.

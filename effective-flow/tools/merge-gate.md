## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Merge Gate

You are the gate between an open pull request and its merge. `effective-flow build`, `effective-flow pr`, and
`effective-flow review` create a pull request and publish onto it; `effective-flow iterate` feeds notes back
into it as new commits. None of them decides when the pull request is genuinely ready and presses
merge. This workflow owns exactly that gap.

## Goal

Resolve a pull request from an argument or the current branch and drive an ordered gate:

1. every check green – otherwise repair the pull request first;
2. once green, hand the notes of the configured automatic reviewers (Greptile and comparable bots)
   to `effective-flow iterate`, which fixes the valid ones and answers and resolves their threads, and
   re-trigger the reviewer where needed;
3. if human pull-request comments exist, implement no review note and merge nothing – CI repair
   stays permitted (see "Human-comment guard");
4. if no human comments exist, everything is green, every configured automatic reviewer has run for
   the current head, and its comments have been answered – merge.

The result is either a merged pull request or a report naming the exact condition that blocks the
merge. This workflow implements nothing itself and produces no review findings of its own.

## The central `pr-review` skill stays out of this run

**Do not load the central `pr-review` skill here.** That is why it is deliberately absent from a
recommended-skills section: a recommended skill is authoritative for its domain, and this one brings
its own approve and request-changes submissions, its own CI recovery, and its own summary
conventions — three things this workflow forbids.

The judgment that skill owns still happens, one delegation away. `effective-flow iterate` loads it and
performs the caller-owned Mode C handoff, which is the one place that judgment belongs. This
workflow adds no second judgment layer and consumes `effective-flow iterate`'s reported outcome per item.

## Language resolution

Effective Flow resolves the language of persisted, human-readable content by **target surface**.
The project setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, and branch slugs are not
localized. Product UI/CLI/error text follows the target project's product-i18n rules and is not
controlled by this configuration. Exact quotations and incoming third-party text are not
translated unless explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid. An invalid value has no special meaning: report the affected key,
ignore it, and continue with the next fallback. A missing override means inheritance; `null` is
not a language value. Interactive, non-persisted replies follow the user's current language,
using `language.project` only if the conversation language is not recognizable.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `effective-flow setup`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `locale-typography` skill. Its locale guidance is authoritative; Effective Flow keeps no
second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent.

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective
Flow project setup" (default slug `effective-flow-project-setup`, see fragment "Living
ADR model"). It carries the config parameters with minimal prose as a **Markdown table**. There
is **no** `.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a
pure runtime directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`) and is
completely gitignored.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR
   under `<path>`. **Backcompat (one generation):** a still-present legacy marker
   `**Firmo project setup:** <path>` is recognized as equivalent on read; effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` (the legacy slug
   `firmo-project-setup` is recognized as equivalent during the scan) or a scan of the detected
   ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR.
3. **Transitional compatibility.** Otherwise — only transitionally — establish or reuse the
   verified execution-location receipt and resolve the fallback from `RUNTIME_STATE_ROOT`: read
   a still-present absolute `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to effective-flow setup. Never inspect a
   same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
   repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
   and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
effective-flow setup.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers (effective-flow setup, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.

### Merge-gate keys (`mergeGate.*`) and their legacy namespace

effective-flow merge-gate reads the keys below; effective-flow iterate reads the `bots` entries for its
review-in-flight guard. A missing line means the default, per the encoding rule above.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

A login containing brackets (`greptileai[bot]`) is a valid middle segment, because the encoding
splits on `.` only.

**Backcompat (one generation):** these keys were formerly named `prReview.*`. Where a
`mergeGate.<key>` line is absent, read `prReview.<key>` and use its value; report **once per run**
that the legacy namespace was read and that effective-flow setup migrates it. Precedence is per key: a
present `mergeGate.<key>` always wins over a present `prReview.<key>`, and the two namespaces are
never merged at a finer grain than the individual key. Reading is all this fallback does — only
effective-flow setup writes configuration, and it rewrites a legacy block in place (carry the values
over, remove the old rows, report a shadowed key). Once every project has run effective-flow setup once,
the fallback has no remaining reader and is removable rather than load-bearing.

**`delivery.prReview` is not part of this block** and is never migrated: it decides whether a run
publishes **its own review findings** onto a pull request it created (see the encoding rule above),
while `mergeGate.*` configures the gate that takes an **existing** pull request from open to merged.

### Language configuration and compatibility migration

The supported language keys and their surface mapping live only in the shared "Language
resolution" fragment. This configuration contract accepts `language.project`,
`language.source`, `language.documentation.user`, `language.documentation.technical`,
`language.workflow`, `language.forge`, and `language.git`; every value is `de` or `en`.
Missing overrides inherit `language.project`, and a missing project language resolves to `en`.
Invalid values are ignored with a diagnostic and never guessed.

`plan.markerLanguage` is a legacy read/migration key, not part of the current schema. If
`language.workflow` is absent, effective-flow setup may propose migrating a valid legacy `de`/`en`
value to `language.workflow`; an existing `language.workflow` always wins. Show explicitly that
the old marker-only setting becomes the language of the complete workflow artifact. Apply the
addition and removal only in the confirmed before/after write step. Preserve the legacy key if
the write is not confirmed, and never emit it in a new configuration.

If neither language keys nor the legacy key exist, effective-flow setup may propose the read-only
plan-corpus fallback defined by "Language resolution" as `language.workflow`, but only when
prose, fields, and markers consistently identify one language. Mixed, contradictory, or empty
plan sets are not migrated. This compatibility path must be reported and confirmed like every
other config change.

<!-- runtime-state-safety: setup-repair-only:start -->

### One-time migration legacy `config.json` → project setup ADR

The migration of an existing `.effective-flow/config.json` or legacy `.firmo/config.json`
into the project setup ADR is **Git-touching** and runs exclusively in the
effective-flow setup path. It produces the ADR table from the current config content (encoding
as above), writes the AGENTS.md marker `**Effective Flow project setup:**`, switches
`.gitignore` to a single `.effective-flow/` and untracks the legacy `config.json`
(`git rm --cached`, leave the file content on disk). The exact procedure including
idempotency marking is in effective-flow setup.

Outside effective-flow setup, **no** migration takes place: The deterministic
read path creates nothing and touches no Git; on a missing ADR it reads instead a
still-present `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
`<RUNTIME_STATE_ROOT>/.firmo/config.json`) and points to effective-flow setup.

<!-- runtime-state-safety: setup-repair-only:end -->

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the alternative orchestrator `effective-workflow`
   inside Effective Flow: nesting it would create competing lifecycle and delivery owners.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7`) when needed instead of guessing from memory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

This workflow recommends **no** central skill of its own: it orchestrates and delegates, and the one
skill its domain would suggest is excluded above. Discovery therefore has no preferred list to apply
here and stays a no-op unless the project's own `skills.tools.merge-gate` configuration adds one.

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications
for branch and pull-request conventions, merge method, and quality criteria. A project rule about
how pull requests are merged wins over the defaults below.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: retry with escalation.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform completion pattern instead of an ad-hoc formulated loop. The pattern pairs one declared completion goal with independent verification and visible progress control. It steers the workflow's own run; Effective Flow neither offers nor starts a harness-native autonomous run for it, and the workflow's regular approval gates always apply.

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress.** Every run maintains a visible phase task list and concise chat updates even when only a few phases remain. This overview is required regardless of the generic task-tracking thresholds, which keep governing only ad-hoc subtask lists: before work, create or reconcile every known remaining numbered phase in stable order; mark each phase when it starts and reaches an end state; add findings, issues or parallel subtasks as soon as their set is known, without matching duplicates; on resume, continue the existing list; and keep more specific per-finding, per-issue, per-source and per-reviewer detail rules authoritative. Exactly one workflow owns the progress overview on the shared interaction surface: the orchestrator responsible for the remaining scope; `effective-flow apply-plan` hands ownership to its selected target workflow before that workflow’s remaining phases begin and opens no competing list, while `effective-flow apply-issues` and `effective-flow apply-review` retain ownership of their overall phases and issue or finding tasks; a non-interactively delegated subworkflow reports status and results to the owner and may keep a local detail list only in a harness-isolated subcontext, never as a second progress overview. Follow the native task tool’s state model: if only one entry may be active, keep the overall phase active while parallel detail work follows its existing rules and is summarized in chat; submit result-dependent status changes only after the determining tool result is known, never in the same parallel tool batch. After each numbered phase and each bounded correction round, post a short update with its result and the next step, adding a deviation or blocker only when present; during correction keep the phase active, report the failed check and correction result, and name the retry or escalation; these updates are not gates, so continue with the next step unless an existing approval rule or genuine blocker requires user input. Give skipped, terminally failed and aborted steps the best native end state, or an unambiguous `[skipped]`, `[failed]` or `[aborted]` suffix when none exists; keep a step awaiting user input open with its blocker, and never treat terminal failure or abort as satisfying the completion condition. If the task tool is unavailable, list the known remaining phases compactly in chat before continuing and carry their state in later updates; if updates fail irrecoverably, report that failure once, move all still-open tracking to chat without claiming a successful tool update, and continue the domain work. Immediately before reporting completion, the owner reconciles every known phase and dynamic entry—including the equivalent final chat summary in fallback mode—to a truthful visible end state, and independently verifies the domain completion condition; never report completion with an unresolved entry.

Scope of that completion control here: the bounded correction rounds and the visible phase list
apply, and `mergeGate.maxRounds` is this workflow's concrete bound. The completion condition is the
pull request's own checks plus the Phase-4 preconditions, read from the forge rather than
self-assessed. This workflow therefore starts **no** validator and **no** reviewer of its own; the
independent verification happens in CI and inside the delegated `effective-flow iterate` run.

## Checkout provisioning boundary

Read this before the delivery and worktree integration below, because only a narrow part of that
fragment applies here. Two things are used: the verified execution location with its two roots, and
provisioning a checkout for the one Git write of Phase 2 step 1.

Provision that checkout the way `effective-flow iterate` does: fetch the pull request's **existing** head
branch and provide it in a clean checkout or isolated worktree, updated via fetch/pull. Never create
a branch (no `-b` on `git worktree add`, no `git checkout -b`), never rebase, never force.

Everything else in that fragment stays off:

- no delivery branch and no branch-name construction – the head branch already exists;
- no plan-file status switch and no archiving;
- no completion action (`pr`, `merge`, `branch`) and no `effective-flow pr` call – the pull request
  already exists, and Phase 5 merges it on the forge instead;
- no "PR review publication" and no lazily loaded `pr-review-integration`. Its trigger condition –
  a workflow holding a pull request – matches this tool by accident. This workflow produces no
  findings of its own and never publishes under the outbound `<!-- effective-flow-pr-review -->`
  marker.

**The checkout's lifecycle is closed by this workflow.** Prefer the invocation checkout when it
already has the head branch checked out and clean: work in place, create no worktree, and create no
lifecycle record. Otherwise create one Effective Flow-owned worktree with the fragment's receipt and
its version 1 lifecycle record, and close that record in the same run: after the push of Phase 2
step 1 is confirmed, transition `active` to `cleanup-ready` and run the shared
claim/remove/reconcile sequence; on a controlled stop before the push transition it to `aborted`; on
an error transition it to `failed`. `aborted` and `failed` retain the worktree and the branch for
inspection. Never end a run leaving an `active` record behind – `effective-flow cleanup` will correctly
refuse to remove it.

## Delivery and worktree integration

This shared fragment ties code-changing workflows to delivery branches, pull requests and
Git worktrees. The general values for base branch, branch-name construction and
completion action live in the `delivery` config block; the `worktree` block controls
exclusively whether and how the implementation runs in a separate Git worktree.

**By default the implementation runs in a Git worktree** (`worktree.enabled` default `true`):
an existing linked or harness-native worktree is reused, otherwise Effective Flow creates one
with its own branch. As soon as work happens in a worktree or on a dedicated delivery branch,
**delivery is implicitly active** and completes via `merge`
(default) or `pr`. There is no separate `delivery.enabled` switch anymore (see
"Delivery is implied by worktree/branch").

Only when the user explicitly asks for in-place work without a worktree and wants no
branch/PR/merge action does the workflow behave as if without this fragment: no
forced branch creation, no forced commits and no automatic
PR creation.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

### Roles of the config blocks

- **`delivery`** describes the delivery branch and its completion: base ref,
  branch prefix, completion action and return target.
- **`worktree`** describes exclusively the execution location: whether a worktree
  is used, where it lives and which setup runs in it.

Scope boundary: this fragment is **not** the per-finding worktree mechanism from
``tools/apply-review.md`` (`applyReview.worktree`). That one isolates parallel local
review findings and folds commits back onto the current branch via cherry-pick.
This fragment creates delivery branches for PR, merge or "branch only". Both
may use the same physical `baseDir`, since session and path segments
distinguish them.

## Verified execution location

Every write-capable phase and delegated worker uses an **execution-location receipt**. The
receipt keeps `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate: tracked project work follows
the selected checkout, while private `.effective-flow/` state remains in the repository's main
checkout. It replaces any assumption that a one-time `cd`, an inherited current working
directory, or a subagent spawn option will keep later operations in the intended checkout.

### Receipt

Create the receipt before worktree creation, report-source resolution, or the first
write-capable action, whichever comes first. Pass it unchanged to every worker that may edit
files, read or mutate runtime state, run a formatter or a test that writes caches, run setup,
stage or commit, switch branches, or clean up a worktree. Record:

- the canonical absolute repository identity: the physical path returned by
  `git rev-parse --git-common-dir`, resolved against the command's working directory when Git
  returns a relative path;
- `EXECUTION_ROOT`, the canonical absolute execution root from
  `git rev-parse --show-toplevel`;
- `RUNTIME_STATE_ROOT`, the canonical absolute main-checkout root resolved by the procedure
  below;
- the checkout identity: either the exact branch name, or `detached` plus the exact commit OID
  when detached HEAD is explicitly expected;
- the origin: `in-place`, `harness-managed`, or `effective-flow-created`;
- setup ownership and status: who may run setup and whether it is pending, complete, skipped,
  or externally managed;
- the workflow or component that owns the receipt and its purpose.

Canonicalize paths before comparison: resolve symlinks, `..`, relative segments, and platform
case behavior through the host's physical-path facility. Path shape does not prove ownership.
A pre-existing user-created linked worktree counts as `harness-managed` for lifecycle purposes:
it is external to Effective Flow and must not be removed by this workflow.

### Runtime-state root

Before report-source resolution or any operation that may create or enter a delivery, native,
or component worktree, run `git worktree list --porcelain` from the verified current checkout.
Parse records by their empty-line separator and use only the first record, which Git defines as
the main worktree. The first record of `git worktree list --porcelain` must begin with exactly
one `worktree <path>` line. Reject a missing or duplicate path field, an empty path, or any record
that contains the boolean line `bare`. A `bare` first record has no usable main checkout and
therefore cannot own runtime state.

Canonicalize that path physically and require it to exist as a directory. From the candidate
root, require `git rev-parse --show-toplevel` to resolve back to the same root and
`git rev-parse --git-common-dir` to resolve to the same canonical Git common directory recorded
as the repository identity in the execution receipt. Record the result as
`RUNTIME_STATE_ROOT`. In an in-place run from the main checkout, `EXECUTION_ROOT` and
`RUNTIME_STATE_ROOT` are the same physical path. In a linked, native, delivery, or component
worktree, they differ.

Entering or creating another worktree changes only `EXECUTION_ROOT` and its checkout fields; it
must not change `RUNTIME_STATE_ROOT`. Revalidate the retained runtime root from the current
porcelain first record and its common-directory identity before every runtime-state read or
mutation and after resume or Handoff. A missing, moved, newly bare, repository-mismatched, or
otherwise unusable runtime root fails closed. Preserve every checkout and all existing state;
never fall back to `EXECUTION_ROOT`. If the root is valid but its runtime-state safety checks
fail, direct the user to `effective-flow setup` as specified by that contract.

### Fail-closed preflight

At each write-capable orchestrator or worker boundary, and again after resume or Handoff,
verify from the receipt's absolute execution root:

1. `git rev-parse --show-toplevel` resolves to the recorded execution root.
2. `git rev-parse --git-common-dir` resolves to the recorded repository identity.
3. `git branch --show-current` equals the recorded branch. If detached HEAD was explicitly
   recorded instead, the branch output must still be empty and `git rev-parse HEAD` must equal
   the recorded OID.
4. For a linked worktree, `git worktree list --porcelain` contains an entry whose canonical
   path and checkout identity match the receipt.

If any value is missing, cannot be canonicalized, or differs, abort before writing. Report the
expected and actual root and checkout identity, and retain every checkout. Do not edit, run
setup, run a formatter or test that may write, stage, commit, switch branches, or clean up.

After a Handoff or resume, a harness may provide a different execution root. Adopt it only by
issuing a new `harness-managed` receipt after proving the same repository identity and that the
expected work is present and consistent. Otherwise abort for reconciliation. A prior successful
preflight never authorizes later writes from an unverified runtime location.

### Rooted operations

After preflight, root tracked project, validation, staging, commit, and worktree lifecycle
operations in `EXECUTION_ROOT`:

- pass the absolute root as the per-call working directory when the harness supports it;
- use absolute paths for file tools;
- use `git -C <EXECUTION_ROOT> ...` for Git operations when a per-call working directory is not
  guaranteed.

Do not rely on a previous `cd` or on a worker inheriting the orchestrator's current directory.
If a worker cannot establish and verify the assigned root, it returns `ABORT` without writes.
Edits, validation, commits, and lifecycle operations for one receipt stay in that receipt's
execution root; component and delivery receipts are never interchangeable.

Root every `.effective-flow/` read, collision check, directory creation, report or backlink
write, cache or memory read/write, migration, and wisdom operation in `RUNTIME_STATE_ROOT`.
Resolve the concrete target to an absolute handle before entering another worktree and retain
that handle. For an existing path, physically canonicalize the path itself; for a target that
does not exist yet, physically canonicalize its nearest existing ancestor and append only the
validated missing path segments. The result must remain below the canonical absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/` directory, and report handles must remain below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Reject `..`, path aliasing, or any existing
symlink that escapes those directories. A project-relative path is only presentation; it is
never an operational handle after the roots diverge.

Root every forge operation in `RUNTIME_STATE_ROOT` as well — for a different reason than runtime
state. A provider CLI such as `gh` or `tea` resolves its repository context from its working
directory, and the execution worktree is not guaranteed to exist when that call happens: the
completion action runs after an Effective Flow-owned worktree may already have been withdrawn, so
an inherited execution directory can be a deleted path. Pass the absolute runtime root as the
per-call working directory for every remote-helper invocation and for the repository-wide Git
operations that accompany a completion action, such as refreshing the base ref, resolving refs and
pushing the delivery branch. Those act on refs, not on a working tree. This holds while the
execution worktree still exists, so the behavior does not depend on cleanup order. It never
redirects tracked project work, and never any operation that reads or changes a working tree —
branch creation, branch checkout, cleanliness checks and a default derived from the checked-out
branch all stay in `EXECUTION_ROOT`.

### Harness-owned worktrees

- **Claude Code:** Subagents start from the parent context and directory changes do not persist
  as a portable cross-call contract. Native `isolation: worktree` creates a separate
  Claude-managed worktree. Use it only for a deliberately self-contained delegation that does
  not need an already selected Effective Flow worktree. Never combine native isolation with an
  assigned Effective Flow execution root.
- **Codex app:** A Codex app worktree is harness-managed, may start in detached HEAD, and remains
  associated with its task across Handoff. Reuse and revalidate it; do not wrap it in another
  Effective Flow worktree or remove it. Detached HEAD is valid only when the receipt explicitly
  pins its OID. If delivery requires a branch, create or adopt that branch through the supported
  app flow, then issue and verify a new branch receipt before committing.

### Setup and cleanup ownership

Automatic setup runs only when a receipt is `effective-flow-created` and its setup status is
`pending`. A reused linked or harness-native worktree is assumed to be prepared by its owner;
mark setup `externally managed` and do not repeat it. Run setup there only after an explicit user
request, or after reporting a missing prerequisite and obtaining the workflow's required
decision.

Remove a worktree or delete its temporary branch only when all of these are true:

1. Its receipt says `effective-flow-created` and names this workflow/component and purpose.
2. A fresh fail-closed preflight matches the recorded repository, root, and checkout identity.
3. `git worktree list --porcelain` still contains the matching entry.
4. The worktree is clean under the workflow's existing cleanup policy; unexpected untracked or
   modified files make it dirty.

If any proof fails, retain the worktree and branch and report why. Never force-remove a dirty,
moved, missing, mismatched, reused, in-place, user-owned, or harness-managed worktree. A failure
between `git worktree add` and successful receipt creation also leaves the new worktree in place
for manual reconciliation.

Cleanup targets only the exact Effective Flow-owned execution/component worktree named by its
receipt. It must never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT` or use the runtime
root as a cleanup target. Runtime reports, backlinks, memory, caches, migrations, and wisdom
state remain in the main checkout after an owned worktree is removed.

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
worktree and branch and do not run setup or delegate work there.

This temporary-file-and-rename sequence is the required atomic write; use an actual atomic
`rename`, not a truncate-and-rewrite operation on the live record.

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

| From                                | To or terminal action                   | Required proof                                  |
| ----------------------------------- | --------------------------------------- | ----------------------------------------------- |
| newly created                       | `active`                                | verified receipt and atomic initial record      |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | owning workflow, under the record lock          |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | fresh eligibility checks plus cleanup run claim |
| `cleanup-in-progress`               | `cleanup-failed`                        | claimed actor records the exact failure         |
| `cleanup-in-progress`               | delete only this lifecycle record       | claimed actor proves complete cleanup           |

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

### Configuration

If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto",
    "prReview": "ask"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Missing values have these defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (local branch part from `delivery.baseBranch`)
- `delivery.prReview`: `"ask"` (a gated run asks once per created pull request)
- `worktree.enabled`: `true` (implementation runs in its own worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Valid values:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` or a local branch name as a string
- `delivery.prReview`: `"ask"`, `"always"`, `"off"`
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` or an explicit setup command as a string

`delivery.enabled` is **retired**: delivery is no longer activated via its own switch,
but is active whenever work happens in a worktree/dedicated branch
(see "Delivery is implied by worktree/branch"). A `delivery.enabled` still
present in a legacy config is ignored on read and removed by the full config migration
(see "Config migration").

### Config migration

Reading the Effective Flow configuration from the project setup ADR and the one-time consolidation
of a legacy config onto the current schema – in particular moving old delivery values out of
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` into `delivery.*` and
removing the retired `delivery.enabled` – is handled by the shared fragment
"Config migration" (`config-migration.md`) once and centrally. This fragment performs **no** own
per-block migration anymore. Until a config is migrated, reading applies: new value from
`delivery.*` before legacy value from `worktree.*` before default; an existing
`delivery.enabled` is ignored.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- Before any fetch, setup, branch change or other write-capable action, issue and verify an
  execution-location receipt for the current checkout. Before worktree creation, resolve and
  retain its verified `RUNTIME_STATE_ROOT` from the first record of
  `git worktree list --porcelain`; a path below `.effective-flow/.worktrees` does not prove
  ownership. Keep `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate for the entire run.
- **Worktree execution is active by default** (`worktree.enabled` default `true`). It
  stays off only when `worktree.enabled: false` is set or the user explicitly requests
  in-place work ("without worktree", "directly on the current branch").
- When the current receipt points to an existing linked or harness-native worktree rather than
  the repository's main worktree, reuse it as `harness-managed`. Do not create a nested delivery
  worktree, switch its branch, repeat automatic setup or remove it during handback.
- **Delivery is active as soon as work happens in a worktree or on a dedicated delivery
  branch** – so in the default case always. In addition, delivery is active when the
  user explicitly requests PR, branch or merge work (even with in-place work; then
  the delivery branch is created in the main repo).
- If the worktree is disabled via config (`worktree.enabled: false`), give a brief
  note that the (default) worktree mode is off via config. If the user then also
  requests no delivery action, perform no further steps from this fragment
  (in-place without delivery).

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available. The current execution
   receipt must pass the fail-closed preflight before continuing.
2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g.
   `origin/main`), first run `git fetch REMOTE BRANCH`, so the delivery branch
   starts from the current remote state.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in `delivery.baseBranch`, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Construct delivery branch names: `<delivery.branchPrefix>/<skill>/<slug>`, e.g.
   `effective-flow/build/user-login`. Derive the slug from the plan title, the task description,
   the issue or finding. If the branch name already exists, append a
   numeric suffix and report the chosen name.

### Run-owned delivery state

Before creating or switching any delivery artifact, retain the original verified
execution-location receipt and initialize explicit current-run ownership flags for the delivery
worktree and branch. After the current run creates a delivery branch, record its exact name and
creation OID immediately; do not substitute the base ref or a later-moving remote tip. After the
current run creates a worktree, record that ownership separately from its
`effective-flow-created` receipt. A name, path, configured base directory or pre-existing receipt
never proves current-run ownership.

Carry this state through baseline validation and every later phase:

- original checkout receipt and checkout identity,
- delivery branch name and exact creation OID,
- whether this run created the delivery branch,
- whether this run created the delivery worktree,
- the delivery execution-location receipt,
- for an Effective Flow-created worktree, its lifecycle record ID and retained absolute record
  handle below `RUNTIME_STATE_ROOT`.

For a reused `harness-managed` or user-managed worktree or branch, both creation flags stay
false and no lifecycle record is created. For in-place execution without delivery, no delivery
artifact is recorded.

### Worktree execution

When worktree execution is active:

1. If the current receipt identifies a linked or harness-native worktree, keep that root and
   checkout identity and mark setup as `externally managed`. A detached harness-native checkout
   remains valid only at its pinned OID. If delivery requires a branch, create or adopt it
   through the harness-supported flow and issue a new verified receipt before committing; never
   silently switch a harness-managed worktree. The linked or native checkout becomes
   `EXECUTION_ROOT`; the porcelain main checkout remains `RUNTIME_STATE_ROOT`.
2. Otherwise determine the repo name from `basename "$(git rev-parse --show-toplevel)"` and use
   `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`. Resolve a relative `BASE_DIR` against
   `RUNTIME_STATE_ROOT`, never against a disposable worktree. When that path is below
   `.effective-flow/`, resolve every missing base or parent directory that will be created.
   From `RUNTIME_STATE_ROOT`, apply the owning workflow's loaded “Runtime-state write safety”
   contract to each exact directory path immediately before its `mkdir`; a guard for the
   eventual worktree path does not authorize creating its parents. Apply the contract again to
   the exact `WORKTREE_PATH` immediately before `git worktree add`.
   Create the worktree and delivery branch with
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`, then immediately issue and
   verify an `effective-flow-created` receipt for the exact path, branch, workflow and delivery
   purpose. Record both artifacts as current-run-owned and capture the branch's exact creation
   OID. Immediately after that receipt succeeds, initialize its version 1 worktree-lifecycle
   record as `active`, with branch policy `retain`, under the verified runtime root. Do this
   before setup or delegation. If receipt or lifecycle-record creation fails, retain the
   worktree and branch for manual reconciliation and do not continue inside it.
3. Only for that newly Effective Flow-created receipt, run setup per `worktree.setup` and
   briefly announce the mode beforehand:
   - `auto` or missing: decide by lockfile – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, no known
     file → no setup.
   - `none`: run no setup.
   - String value: run this explicit command in the worktree.
     Record the final setup status as `complete` or `skipped` before delegation.
4. Pass the full receipt, including both roots, to every subsequent phase and delegated worker
   that creates or changes code, tests, documentation, or runtime state. Each boundary runs the
   fail-closed preflight. Project operations are explicitly rooted in `EXECUTION_ROOT`; runtime
   reads and writes use retained absolute handles below `RUNTIME_STATE_ROOT`. This also applies
   through the completion phase and the final validator/formatter.

### Lifecycle outcome handling

For a current-run-owned `effective-flow-created` delivery or partial-diff worktree, keep its
lifecycle record synchronized at every terminal workflow boundary. Perform every transition
under the record lock and the runtime-state write-safety guard:

- keep `active` while implementation, validation, commit, integration, or delivery preparation
  can still change the checkout;
- on a controlled stop before readiness, transition `active` to `aborted` with the concrete
  reason and retain both worktree and branch;
- on an implementation, validation, integration, ownership, or state error before readiness,
  transition `active` to `failed` with the exact reason and retain both artifacts;
- only after the intended changes are durably committed to the delivery branch may the owning
  workflow transition `active` to `cleanup-ready` and enter the shared claim/remove/reconcile
  sequence.

If a lifecycle transition cannot be persisted safely, retain the worktree and branch and report
the record handle and failed guard or operation. A sudden interruption deliberately leaves
`active`; no age check upgrades or downgrades it.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Keep and verify the current checkout's `in-place` receipt, and remember the originally
   checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from `delivery.baseBranch`.
4. Issue a new receipt for the delivery branch after switching. Record the branch as
   current-run-owned and capture its exact creation OID before setup or implementation. Run
   implementation, tests, validation and final formatting through explicitly rooted operations
   after a successful preflight at every write-capable boundary.
5. After completion, proceed per "Handback and completion action".

### Partial-diff PR via worktree

When the main checkout already holds changes that should not fully go into the PR,
a separate worktree is the preferred safe path, provided these
preconditions are met:

1. `git worktree` is available.
2. `delivery.baseBranch` is resolvable and, for remote refs, updatable.
3. The workflow knows an explicit list of the files that should go into the PR.

The procedure:

1. Create a fresh worktree branch from `delivery.baseBranch`, then immediately issue and verify
   a separate `effective-flow-created` receipt whose purpose is `partial-diff`. Before setup or
   file transfer, initialize its lifecycle record as `active` with branch policy `retain`; a
   record-creation failure retains both worktree and branch and aborts the partial-diff flow.
2. Take only the selected delivery files from the main checkout into the worktree.
   Permitted sources for this selection are plan affected files,
   review finding scope, issue scope, known files produced by the workflow, or
   an explicit user selection.
3. In the verified execution root, check whether the taken-over files produce a meaningful diff
   against the base ref. If not, abort and create no empty PR.
4. Commit in the verified execution root and run `effective-flow pr` against
   `delivery.baseBranch`.
5. Remove the worktree only through the shared lifecycle transition, claim, ordinary remove, and
   reconciliation sequence after the receipt passes every ownership-safe cleanup check. Leave
   the delivery branch locally and the main checkout unchanged. Non-selected changes in the
   main checkout remain untouched.

A heuristic partial-diff selection by "all changed files
except <plan.dir>" is not allowed. The workflow must know the files to include or
ask. This reliably keeps newly created plans, `.effective-flow/` state and other
local working files outside the PR.

### What lives in the delivery branch and what stays in the main repo

Data-keeping invariant: **Of the Effective Flow artifacts, only plans are
committed.** Reviews (local reports) and investigations always stay local and
untracked; in remote mode reviews are tracked as issues instead (never in the repo),
investigations remain purely local in any case (see "Issue-tracker integration" and
`effective-flow investigate`).

- **In the delivery branch:** the actual code, test and documentation deliverables of the
  workflow as well as – if the workflow kept a plan file – its final
  state (in the implemented case the archived, implemented-marked plan file).
- **Only in the main repo, never committed:** pure Effective Flow bookkeeping and runtime state, i.e.
  all remaining `.effective-flow/` artifacts – `memory.json`, `cache.json`, local review reports
  under `.effective-flow/review/`, investigation reports under `.effective-flow/investigation/`,
  config migration status and wisdom files. Their operational paths are absolute handles below
  `RUNTIME_STATE_ROOT`, even while tracked work executes elsewhere.

### Abort handback before implementation

Use this handback only when a workflow must abort after delivery setup but before implementation,
for example when `maintain` finds a red baseline. It is separate from normal completion: do not
mark or archive a plan, commit, ask for or execute a completion action, push, merge or create a
pull request. Preserve all abort diagnostics before lifecycle cleanup.

Fail closed. Mutate only artifacts that the retained run-owned delivery state proves were created
by the current run:

1. **No delivery artifacts:** For in-place execution without delivery, perform no lifecycle
   cleanup. Report the unchanged checkout.
2. **Externally managed state:** For `harness-managed`, user-managed or adopted worktrees and
   branches, perform no lifecycle mutation. Report every retained path or branch and that it is
   externally managed.
3. **Effective Flow-owned worktree:** Only when both current-run creation flags are true, the
   receipt is `effective-flow-created`, and the matching lifecycle record is still `active`,
   acquire its record lock and transition it to `aborted` with the concrete pre-implementation
   stop reason. Retain the worktree and branch for inspection; an aborted worktree is never a
   cleanup candidate. If the transition cannot be persisted, retain both artifacts and report
   the lifecycle failure. Do not remove the worktree merely because `HEAD` and the branch tip
   still equal the creation OID. Never compare against a moving remote tip when proving ownership
   or deciding whether any current-run artifact may be changed.
4. **In-place transient branch:** Only when the current run created the delivery branch, freshly
   verify the delivery receipt, clean status, exact branch name and recorded creation OID. Verify
   that the retained original checkout belongs to the same repository and can still be restored.
   Restore the original branch or detached OID first, revalidate its retained receipt, then
   revalidate and safely delete the unchanged transient branch with
   `git branch -d <BRANCH_NAME>`.
5. **Retention and partial cleanup:** Any lifecycle-write failure, dirty state, changed tip,
   ownership mismatch, receipt or registration mismatch, or failed restoration retains the
   affected artifact. Report its exact path or branch and the failed proof or command. If
   restoration succeeds but safe deletion of an in-place transient branch is refused, report
   partial cleanup explicitly and retain that branch. Never force-remove a worktree or
   force-delete a branch in this abort handback.

End the workflow immediately after reporting the abort handback. Do not enter implementation or
normal delivery completion.

### Handback and completion action (completion phase)

Following the workflow's regular completion logic (including completion-condition verification).
The final status switch of the plan file to `Umgesetzt`/`Implemented` and its
archiving is handled by step 1 below at the delivery point – the implementing workflow therefore does **not** set the
status beforehand, but leaves it to this phase (exception: in-place without
delivery, see step 1):

**Update existing PRs:** If the delivery branch already has a pull request
and subsequent changes are needed, those changes are always created and pushed as new
commits on the same PR branch. Existing PR commits must not
be rewritten via `commit --amend`, interactive rebase, squash or force-push.
If a normal push fails because of diverged remote history,
stop and report the conflict instead of overwriting history.

1. **Mark the plan as implemented, archive it and take it into the delivery branch:**
   Provided the workflow kept a plan file, this is the **delivery point** at which
   the plan counts as implemented (immediately before the PR is opened or the delivery branch
   is merged):
   - Set the canonical status marker to `Umgesetzt`/`Implemented` (preserve the complete plan
     language: German plan → `**Planungsstatus:** Umgesetzt`, English plan →
     `**Plan status:** Implemented`).
   - Move the plan file via `git mv` to `<plan.dir>/archive/` (create the directory if
     needed), per "Archive of implemented plans" of the plan-file convention.
   - If the implementation ran in a worktree or partial-diff worktree, provide this final,
     archived and implemented-marked state in the worktree (under
     `<plan.dir>/archive/<file>`). Marking and move are **committed along with it** and
     are thereby part of the PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the
     main repo.
   - If the workflow kept no plan file, this step does not apply.
   - If the workflow exceptionally runs in-place without delivery (no worktree, no
     branch/PR/merge action), the workflow performs the same status switch and
     archive move directly in the working tree; the final commit/merge into the
     target branch is then the delivery event.
2. **Ensure commit:** Commit all intended changes in the delivery branch
   – code, test and documentation deliverables as well as the taken-over plan file – via the
   commit logic from `effective-flow commit` (stage exclusively known changed files
   explicitly, derive a concrete Conventional Commit message, never set a
   `Co-Authored-By` trailer). Resolve `language.git` for the human-readable commit description;
   keep Conventional Commit types stable. Workflows that have already committed their work
   (e.g. `effective-flow maintain` with one commit per group) only commit the
   plan file here afterwards, if needed. If there is nothing to commit: inform the user,
   remove an automatically created empty delivery branch and end without
   PR/merge.
3. **Determine completion action:** If `delivery.completion` has a valid value,
   use it and briefly report that the action was taken from the Effective Flow configuration
   (project setup ADR). Otherwise ask:

If Delivery was active and no valid value for `delivery.completion` is set: Ask the user: **How should the delivery branch be completed?**
- Pull request -- Push the branch and create a PR against the base branch via pr
- Merge -- Merge the branch locally into the base branch, without a PR
- Branch only -- Leave the branch in the local repo, no further action

4. **Withdraw an Effective Flow-owned worktree:** Only when the receipt is
   `effective-flow-created` and the intended changes are durably committed on its delivery
   branch, acquire the lifecycle record lock, freshly reverify every eligibility proof, and
   transition `active` to `cleanup-ready`. Claim it as `cleanup-in-progress` for this workflow's
   cleanup run, execute only `git worktree remove <WORKTREE_PATH>` without force, and reconcile
   the result while retaining the lock. The `retain` branch policy leaves the delivery branch in
   the local repository. Delete only the successfully reconciled lifecycle record; a proof,
   remove, or record-finalization failure becomes `cleanup-failed` where safely writable and is
   reported with the retained path or partial state. For `in-place` and `harness-managed`
   receipts, perform no worktree cleanup and create no lifecycle state; leave handling to the
   user or harness. The verified `RUNTIME_STATE_ROOT` is never a cleanup target, and local review
   state there remains intact.
5. **Execute action:** Run this step and every Git, remote-helper and provider-CLI operation it
   performs in `RUNTIME_STATE_ROOT`, per "Rooted operations". Step 4 may already have removed the
   Effective Flow-owned worktree, so an inherited execution directory can be a deleted path; the
   delivery branch and its commits are repository-wide and need no worktree. Never fall back to
   `EXECUTION_ROOT` for this step.
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the local branch part of `delivery.baseBranch` or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: delegate to `effective-flow pr` and pass the delivery branch, base branch, the verified
     `RUNTIME_STATE_ROOT` as its execution root, and the workflow/change type
     (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing workflow and effect) as
     a title-type hint, so the PR title carries a valid Conventional Commit type — with a squash
     merge it is the release signal.
     Once `effective-flow pr` returned the pull request, run "PR review publication" with that pull
     request, whether this run is gated or a non-interactive delegation, and either the workflow's
     residual finding set or its explicit declaration that it has none. It uses the same verified
     `RUNTIME_STATE_ROOT`. This stays inside step 5 deliberately: step 4 has already withdrawn an
     Effective Flow-owned worktree and step 6 restores the checkout to the base branch, so a review
     running after them would have no execution root and would read base-branch content.

**Load on demand:** Read `shared/pr-review-integration.md`, when the completion action created or reused a pull request and the automatic PR review may run.

6. **Restore checkout:** For in-place delivery that switched the current checkout, after
   successful PR creation or with `branch`, switch back to `delivery.returnBranch` or, with
   `auto`, to the local branch part of `delivery.baseBranch`, provided the working tree is clean.
   Do not switch a reused harness-managed checkout. If an applicable switch-back fails,
   explicitly report the actual branch as a side effect.

## PR review comment integration

This shared building block connects Effective Flow workflows with the review comments of an
existing pull request (GitHub via `gh`, Forgejo via `tea`). It encapsulates the
**PR-specific plumbing** that `issue-tracker.md` deliberately does not contain: PR resolution,
reading review threads, replying to a thread, resolving a thread, submitting a review with inline
comments, posting a PR summary comment, reading the pull-request status, waiting for pending
checks, and merging the pull request.

It serves both directions plus the merge gate. **Inbound**, `effective-flow iterate` reads and answers
what others wrote. **Outbound**, "PR review publication" writes Effective Flow's own findings onto
the pull request; that fragment owns which findings are published and which gates run first, while
this one provides the operations. **The gate**, `effective-flow merge-gate`, reads status and checks,
waits, posts its configured bot trigger — its only own write — and finally merges; it owns the
ordered gate and the merge decision, while this one again provides the operations.

Boundary to `issue-tracker.md`: that building block is tailored to **issues** and the tracker
target. PR review threads are a different API object. A workflow working on a pull request is
**inherently forge-bound**: it never evaluates the tracker target and merely needs a Git repository,
an `origin` remote, and an authenticated CLI. That makes it tracker-independent in the same way
``tools/apply-issues.md``/`effective-flow plan-issue` are tracker-**bound** — those two follow the
resolved target, while PR work always stays on the forge. The **host detection, CLI probing, and
availability check** are taken from the "Remote helper contract" in `issue-tracker.md` (not
reinvented); this building block only adds the PR operations.

Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge
behind `origin` even when the tracker target is `external`; a tracker target never redirects them
to another tool.

### No AI attribution

Do not add AI attribution to thread replies, review comments, or the summary comment: no „Generated
with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`),
and no `Co-Authored-By` trailers – not even when the harness appends them as a default.
Reply texts in natural language according to the language rules.

Resolve `language.forge` once for newly authored remote prose. A reply preserves the clearly
recognizable language of the existing thread; otherwise it uses `language.forge`. The per-run
summary comment and every outbound review comment and review body use `language.forge`. HTML
markers, thread IDs, states, finding IDs, and helper payload fields remain stable and are never
translated.

### Remote helper

Use the shipped `scripts/remote-tracker.mjs` helper and the envelope, dry-run, capability,
redaction, and error contract from `issue-tracker.md`. PR mode requires a successful provider
probe. `AMBIGUOUS_HOST` returns to the orchestrator for an explicit provider choice;
`CLI_MISSING`/`AUTH_FAILED` abort without side effects. Never assemble provider requests or
discover flags in the prompt.

### PR resolution

Resolve the target PR from the argument or the current branch and determine the PR number,
head branch, base branch, URL, and state:

- **From argument:** a PR reference is a bare number (`42`), `#42`, or a PR URL. A
  PR URL carries the segment `/pull/` (GitHub) or `/pulls/` (Forgejo) – this distinguishes it
  from an issue URL (`/issues/`).
- **From the current branch:** if no PR reference was passed, try to determine the open PR of the
  currently checked-out branch.

Use helper reference parsing followed by the normalized PR read/list operations. For current-
branch resolution, list open PRs for the exact head branch and require exactly one match.

If the PR is already `merged`/`closed`: report it and perform no write – no commits and no
comments (for the inbound direction see the error cases in `effective-flow iterate`).

### Read review threads (always fresh)

Read the review comments **directly before** classification fresh from the host – comments
can change between runs. Capture per thread: thread ID, author (and whether bot or
human), file + line, comment text, and the `resolved` status.

Use the normalized review-thread read and PR-comment read operations. The normalized author
record includes `login`, `isBot`, and `authorType`; when Forgejo does not expose a bot flag and
the login has no canonical bot suffix, `authorType` is `unknown` rather than guessed as human.
If the provider reports that resolved status is unavailable, keep the item unresolved and expose
that limitation in the workflow summary; do not guess.

Normalized pull-request comments, review threads, and thread replies additionally carry
`createdAt`, an RFC-3339 timestamp, whenever the provider exposes one; an unexposed value is absent
rather than guessed. It is the only freshness evidence these reads provide – a reaction carries
none – so a consumer that needs "newer than the current head" compares it against
`headCommittedAt` from `pr-status-read` and fails closed when either side is missing.

**The author record is the only authorship evidence.** A body never is: an Effective Flow marker
inside a comment says which workflow's write it repeats, not who wrote that comment, and a
quote-reply copies a quoted body verbatim, marker included. Decide "who wrote this" from `login`
and `authorType` — and, where the question is "did _I_ write this?", by comparing that `login`
against the authenticated identity below.

### Read the authenticated identity

Use the helper's `viewer-read` operation (capability key `viewerRead`). It is a **read**, not a
mutation, so it needs no `apply` gate. It returns the login the provider CLI is authenticated as
plus that account's type, which lets one call tell a caller whether it is posting as a bot or as a
person. A value the provider does not expose stays absent rather than being guessed.

This is the only authorship evidence that **survives a run**. The ID a mutation returned identifies
a write only inside the run that performed it, so a workflow asking "did I write this on an earlier
run?" has nothing to compare it against and must use the authenticated login instead.
`effective-flow merge-gate` is that consumer: it pairs the login with the exact configured body of its
trigger comment.

Do not scrape the login out of the probe's authentication-status output. That is human-readable CLI
prose, and this building block reads normalized JSON only.

**Forgejo limitation:** `viewerRead` is unsupported there and returns `UNSUPPORTED_CAPABILITY`. A
consumer that cannot establish the identity fails closed and treats an item it cannot prove to be
its own as someone else's.

### Reply to a thread

Use the helper's review-thread reply operation. It stamps the marker
`<!-- effective-flow-iterate -->` onto the reply body from its own marker table, idempotently, so
never write that marker by hand (see idempotency). This matters beyond tidiness: `effective-flow merge-gate`
matches the marker as an exact string when it decides whether an item in a resolved thread is this
tool's own, so an unstamped reply is later read as a human's and blocks the merge.

### Resolve a thread

Use the helper's review-thread resolve operation. On `UNSUPPORTED_CAPABILITY`, keep the reply,
leave the thread unresolved, and note that manual resolution is needed; do not improvise.

### Submit a review with inline comments

The outbound direction. Use the helper's review-create operation (`review-create`, capability key
`reviewCreate`): **one** review submission per run, carrying a review body plus an optional array of
inline comments anchored to `file:line`. The body is mandatory, the comment array is not, so a
body-only submission is valid. Never approve and never request changes – the submission carries
comments only.

The helper stamps the marker `<!-- effective-flow-pr-review -->` onto the review body and every
comment body from its own marker table, idempotently. Never write that marker by hand: idempotency
and the `effective-flow iterate` separation are exact string matches, so a hand-written variant silently
defeats both.

On `UNSUPPORTED_CAPABILITY` – Forgejo does not support review submission, just as it does not
support thread resolution – fall back to exactly one structured PR comment carrying the `file:line`
references in its text, and report the reduced fidelity; do not improvise a provider request. Build
that fallback comment with the helper's `pr-review-comment-build` operation, **not** with
`pr-comment-build`: the latter stamps `<!-- effective-flow-iterate -->`, the marker
`effective-flow iterate` reads as its own already-processed work.

### Post summary comment

Use the helper's PR-comment payload builder and PR-comment mutation. Per run, **at most one**
summary comment with the marker `<!-- effective-flow-iterate -->` is
posted: which points were implemented, which skipped, and which pure questions are listed as
open/deferred.

A delegating caller may suppress that comment, and `effective-flow merge-gate` does so for every round it
delegates. The reason is the guard: the delegated run posts under the same account in manual mode,
so a summary comment left on the pull request would be a top-level, unresolvable item that the next
authorship evaluation counts as a human comment. The content is handed back to the caller instead of
being dropped.

### Read the pull-request status

Use the helper's `pr-status-read` operation (capability key `pullRequestStatus`). One call returns,
in one normalized envelope read at one instant: the head SHA, the base ref, the pull-request state,
the draft flag, a check list (name, status, conclusion, the required flag where the provider exposes
one, URL), the forge's own merge state, and `headCommittedAt` — the head commit's committer
timestamp as an RFC-3339 string. A value the provider does not expose is absent rather than guessed
— exactly as `authorType` is for bot detection. Reading checks and mergeability in one call is
deliberate: both values must be read at the same instant to be consistent.

`headCommittedAt` is the reference side of every "newer than the current head" question, paired with
the `createdAt` of a comment, thread, or reply. Both sides are required: with either one absent the
answer is unprovable, and a consumer treats it as "not newer" rather than assuming freshness.

Mergeability is read here, never inferred from the check list. A protected branch can additionally
require named checks, an approval, an up-to-date branch, or linear history, so "all checks green"
and "mergeable" are different statements. The forge's merge state is authoritative; a blocked state
is reported, never worked around.

### Wait for pending checks

Use the helper's `pr-checks-wait` operation (capability key `pullRequestChecksWait`). It blocks
inside the provider CLI until the checks are complete or the supplied timeout elapses and returns
the same normalized check list; a timeout is a normalized timeout result, not an error. It is a read
operation and needs an explicit timeout so it cannot hang a run indefinitely.

Never rebuild this wait as a prompt-driven poll loop around the status read: that spends a model
turn per interval for no additional information. On a timeout, or on `UNSUPPORTED_CAPABILITY`,
report the still-pending checks and ask the user once instead.

### Merge a pull request

Use the helper's `pr-merge` operation (capability key `pullRequestMerge`). It is a **mutation**, so a
run without `apply` produces a dry-run plan and merges nothing. It takes the pull-request number,
the merge method (`delivery.mergeMethod`), and the **expected head SHA**: the merge must apply to
exactly the commit that was verified, so a head that moved in the meantime fails closed instead of
merging a state nobody checked. Never re-run the mutation after a structured error carrying
`mutationMayHaveSucceeded: true` — re-read the pull-request state and report what it shows.

Merging is the most irreversible mutation in this tool set and belongs to `effective-flow merge-gate`. It
is never used to work around a blocked merge state, and this building block still never approves a
pull request and never requests changes — not even to unblock a merge.

**Forgejo limitation:** `pr-status-read`, `pr-checks-wait`, and `pr-merge` are all unsupported there
and return `UNSUPPORTED_CAPABILITY`. The gate fails closed: it degrades to report-only, states that
reason, and improvises no provider request.

### Idempotency via the Effective Flow markers

Two distinct HTML markers keep the directions and the writers apart:

- `<!-- effective-flow-iterate -->` on thread replies and the `effective-flow iterate` summary comment.
- `<!-- effective-flow-pr-review -->` on outbound inline review comments, the review body, and the
  top-level pull-request comment that carries the findings whose line lies outside the diff.

**A marker is stamped as the body's leading line, and only that position counts as a marker.** The
helper's payload builder prepends it, so every body this tool writes begins with it. A reader must
require that position rather than searching the whole body: both providers prefix a quoted body with
`>`, so a quote-reply carries a copied marker inside a blockquote where it no longer opens the body.
Treating a marker found anywhere as authoritative lets any person reproduce one by pressing quote —
which is how a reader that trusts a marker's mere presence ends up misreading a human's comment as
this tool's own.

**`effective-flow merge-gate`, the merge gate, writes no marker at all — by design, not by oversight.** A
marker left in a raw comment body keeps announcing which tool composed that comment, and removing
that disclosure is exactly why the gate's former third marker (`effective-flow-pr-gate`) is gone.
The gate's only own write is its configured trigger comment, and it recognizes that comment again
through the authenticated login plus the comment's exact configured body — evidence that discloses
nothing and needs no persistence. Do not reintroduce a gate marker.

Both strings are **distinct and neither is a substring of the other**; every match is an exact
string match. Reusing one for another writer would make `effective-flow iterate` treat foreign replies as
its own already-processed work, or make the outbound direction suppress a finding it never
published.

The helper's marker table stamps both of them, so neither is ever written by hand: idempotency and
the `effective-flow iterate` separation are exact string matches that a hand-written variant silently
defeats. A caller that supplies a body itself — as `effective-flow merge-gate` does for its trigger
comment — must therefore not use the `pr` comment-kind builder, which stamps
`<!-- effective-flow-iterate -->`, the marker `effective-flow iterate` reads as its own already-processed
work.

Read the existing PR and review comments **fresh before every write**, in both directions: a
thread that is already `resolved` or carries an `<!-- effective-flow-iterate -->` reply is
considered done and is not processed again. A thread carrying `<!-- effective-flow-pr-review -->` is
Effective Flow's own output – `effective-flow iterate` skips it unless the user names it explicitly, and
the outbound direction uses it for repeat suppression. **Backcompat (one generation):** a
still-present old marker `<!-- firmo-iterate -->` from an earlier run is recognized as equivalent to
`<!-- effective-flow-iterate -->` on read (no double processing of in-flight threads); newly written
is exclusively `<!-- effective-flow-iterate -->`. This keeps a second `effective-flow iterate` run on the
same PR clean.

### No history rewriting

New work goes exclusively as **new commits** onto the PR head branch and is pushed normally –
consistent with `effective-flow pr` and "Updating existing PRs" in the delivery
and worktree integration. No `commit --amend`, no rebase, no squash, no force-push.
If the push is rejected because of diverged remote history, stop and report the conflict
instead of overwriting history.

A head branch that has fallen **behind** its base is brought forward the same way: merge
`origin/<base>` into the head branch as a merge commit and push normally. That merge, performed by
`effective-flow merge-gate`, is the sanctioned repair; a rebase or a force-push of the head branch is not,
whatever the forge suggests.

## Automatic reviewer state

This shared building block answers exactly two questions about one configured automatic reviewer
against one pull-request head: **is it still running**, and **has it run for this head?** The gate
`effective-flow merge-gate` and the review-in-flight guard of `effective-flow iterate` both take their answer
from here, so the two never drift into disagreeing about the same pull request.

The reviewers are the logins in `mergeGate.bots`; a reviewer's optional check context is
`mergeGate.bots.<login>.check`. An empty `mergeGate.bots` list means no automatic reviewer is
expected and there is nothing to observe.

### The three states

- **running** — the reviewer is in flight for the current head. Its output is coming, and it must not
  be asked to start again.
- **not started** — nothing proves the reviewer has begun for the current head.
- **has run** — the reviewer has produced its verdict for the current head.

**running** and **not started** both mean the reviewer's output for this head is not there yet; they
differ only in what a consumer may do about it. Only the primary signal below can establish
**running** — a consumer that receives **not started** therefore learns that nothing is proven, not
that nothing is happening.

### Precedence

Resolve the state per reviewer, in this order, and stop at the first rule that resolves it.

1. **A configured check context — the primary signal.** When `mergeGate.bots.<login>.check` is set,
   look its value up in the normalized `checks` array of the same `pr-status-read` that supplied the
   head. Match it against an entry's `name` field: compare the whole value after trimming surrounding
   whitespace, and let no other field of the entry take part. A commit-status context and a check-run
   name arrive in that one field alike, so a status context such as `recensor/review` and the name of
   a workflow job are looked up identically and need no distinction here.
   - a matching entry with `status: PENDING` → **running**;
   - a matching entry with `status: COMPLETED` → **has run**, whatever its `conclusion`. A red review
     is a review: the conclusion states what the reviewer found, not whether it ran, and reading it
     as "has not run" would trigger a reviewer that already answered.
   - **no matching entry in a reported list** → **not started**. A context that never appears is
     indistinguishable from one that is about to appear: a misconfigured value, an app that is not
     installed, and a queued run whose status is only set once a worker claims it all look the same
     from here.
   - **no list at all** is a different case. When `pr-status-read` reports `checksReported: false`,
     the primary signal is unavailable rather than negative, and the reviewer falls through to rule 2.
     Forgejo exposes no such rollup, so every reviewer of a Forgejo pull request takes the fallback
     path however carefully its `.check` is configured.
2. **`createdAt` versus `headCommittedAt` — the fallback.** It applies to a reviewer with no
   configured `.check`, and to one whose primary signal was unavailable. Compare the `createdAt` of
   that login's newest comment, review thread, or thread reply against `headCommittedAt` from
   `pr-status-read`; both are RFC-3339 strings and are compared as instants, never as text. A
   `createdAt` later than `headCommittedAt` → **has run**. Otherwise, and whenever either value is
   absent, → **not started**.
   - **This rule never reports running**, and a consumer must not read it as if it could. It observes
     output, and a reviewer that has started without writing yet is indistinguishable from one that
     has not started at all. The fallback therefore separates **has run** from **not started** and
     says nothing whatsoever about what is in flight.
   - A reviewer that edits one sticky comment in place keeps its original `createdAt`, so its second
     review is invisible to this rule. That is the concrete reason the primary signal exists.
   - Emoji reactions are not readable through the helper and never count, whatever their timing. A
     reviewer that acknowledges that way has no usable signal on this path at all.
3. **Anything unprovable counts as not started.** A missing timestamp, a check context that never
   appears, an unreadable field, an author that cannot be established: none of them prove a run.
   Fail in this direction and in no other. What that costs differs by consumer: a gate pays a
   redundant trigger and a blocked merge whose reason it can name, while a guard pays the protection
   it would have given — an unprovable state holds no run. What the opposite direction costs is the
   same for both, and worse than either: a head nobody reviewed, merged.

### One read, one head

Observe every reviewer against **one** fresh read, and use the check list, `headCommittedAt`, and the
threads of exactly that read. A state assembled from two instants describes no state the pull request
ever had. The result belongs to that read's head SHA and to nothing else: a new commit invalidates it
for every reviewer, however recently it was observed.

### What each state permits

The state is shared; what it gates is not. Each entry therefore states what is true of the state
itself first, and what each consumer role does with it second.

- **has run** — the reviewer's output for this head exists and may be read, classified, and answered.
  A gate counts this reviewer's merge precondition as satisfied; a guard lets its run continue.
- **running** — the reviewer's output is coming, and no consumer may ask it to start again. A trigger
  aimed at a reviewer already working either queues a redundant second run or, for a reviewer that
  reads a mention as a fresh request, discards the one in flight. A gate waits and keeps the merge
  blocked until the state changes; a guard holds its run. Waiting is one bounded blocking wait
  followed by one re-read, never a poll loop.
- **not started** — nothing about this reviewer is proven for this head, and a configured trigger may
  be posted. A gate blocks the merge on it, because merging here would merge a head the reviewer
  never saw. A guard does **not** hold its run on it: a reviewer that may never start is nothing a
  run can usefully wait for. One state, two consequences, each correct for its consumer.

A consumer may additionally read a **not started** reviewer as in flight when a trigger comment for
that reviewer exists for this head — whoever posted it, an earlier gate round or a person by hand.
That is evidence about the request, not about the reviewer, which is why this contract keeps it out
of the state itself: a posted mention proves that someone asked, never that anything is running.

### Record the evidence, not only the state

Every consumer records, per reviewer, which rule resolved the state and the concrete value it read —
the check name with its status, the two timestamps, or the field that was missing. A merge this
contract blocks and a question it raises are explainable only with that; "the reviewer has not run"
without a reason sends someone looking in the wrong place.

### This narrows the window; it does not close it

A terminal check states that the reviewer finished, not that every thread it wrote has already
arrived — threads can land moments later. This contract makes that window small; closing it belongs
to the consumer, and each one closes it with a read of its own. Nothing here replaces that read, and
nothing here gates anything: this block observes state, and a merge is not its to hold.

Where each consumer discharges that obligation, so the two stay in step with this contract:

- **`effective-flow merge-gate`** in its Phase-4 merge preconditions. A thread that arrived after the
  round's own observation is one no round assessed, which blocks the merge and sends the run back
  for another round — the gate never merges past a reviewer finding nobody reached an outcome about.
- **`effective-flow iterate`** through the fresh read it performs before every write, which is what keeps
  a late thread out of a reply it would otherwise contradict.

## Git write boundary

**This workflow performs no `git commit` and no push of its own, with exactly one exception:** when
the forge reports the branch as `BEHIND` its base, it merges `origin/<base>` into the head branch as
a merge commit and pushes that branch normally. That exception is a **kind** of write, not a
one-time allowance: it applies in every Phase-2 round whose fresh read reports `BEHIND`, each
occurrence is exactly one merge commit plus one normal push of the head branch, and no Git write of
any other kind is permitted at any point.

**Every other code change is delegated to `effective-flow iterate`** – CI failures as free-text
instructions, bot findings as the review threads it already reads. This workflow therefore inherits
`effective-flow iterate`'s classification, action routing, path-ownership analysis, commit-integrity
mutex, validation phase, and push rules unchanged, and carries no second implementation, staging, or
push path.

Never rewrite the **head branch's** history – no rebase, no squashing of its commits, no
`commit --amend`, no force-push – here or in a delegation. A branch behind its base is fixed by
merging the base into it, never by replaying it.

The forge-side merge method from `delivery.mergeMethod` (`squash`, `merge`, or `rebase`) is a
different thing and is untouched by that rule: it is how the forge **integrates** the pull request
into the base branch in Phase 5, not a rewrite of the head branch.

The base-into-head merge must be **completed and pushed before any `effective-flow iterate` delegation
starts**, so the gate and the delegation never write the same branch concurrently.

## Delegation contract

Every delegation goes to `effective-flow iterate <PR>` and carries:

- the resolved pull request;
- the **item filter**, on its own line, in the exact literal form `effective-flow iterate` Phase 0 parses:
  - `Item filter: free-text-only` for a CI repair,
  - `Item filter: threads=<id>,<id>` for the bot round, with the thread IDs as read.

  The filter is mandatory in every delegation from this gate – an unfiltered delegation would
  silently pull in every open item and make the phase order unenforceable. Write the form exactly:
  `effective-flow iterate` returns `ABORT` for an announced filter it cannot parse and never falls back
  to an unfiltered run, so a typo costs a round instead of implementing every open finding;

- the **summary-comment suppression**, on its own line, in the exact literal form
  `Summary comment: suppressed`. This is mandatory in every delegation from this gate. In manual
  mode the delegated run posts under the same account as the gate and the operator, so its per-round
  summary comment would be a top-level, unresolvable, non-trigger item that the next fresh read –
  including **this run's own Phase 4 read** – counts as human. An unsuppressed summary would
  therefore activate the guard against the very work the round just completed, and up to
  `mergeGate.maxRounds` such comments per run were noise on the pull request besides. Nothing is
  lost: `effective-flow iterate` hands that content back and Phase 6 reports it in chat;
- the **review-guard exemption**, on its own line, in the exact literal form
  `Review guard: established`. This is mandatory in **every** delegation from this gate, and the two
  kinds of delegation earn it differently – the mandatory rule is not one precondition applied twice:
  - a **CI repair** carries `Item filter: free-text-only`, so the delegated run classifies no review
    thread at all and a review-in-flight guard would protect nothing. That delegation is issued from
    Phase 2 step 4, **before** this run has observed any reviewer, and the exemption is correct there
    precisely because the run's scope excludes every item a reviewer could still be adding to;
  - a **bot round** carries thread IDs and is issued from Phase 3, after this run has observed the
    state of every configured reviewer. A delegated run that re-derived it would either duplicate
    this run's wait or block against a reviewer the gate is deliberately not waiting for.

  Write the form exactly: `effective-flow iterate` returns `ABORT` for an announced review-guard line it
  cannot parse and never continues as an unguarded run, so a typo costs a round instead of silently
  removing the guard. Omitting the line is worse: a non-interactive gate run cannot answer the
  guard's question and comes back as `ABORT: review still in flight`.

  The line stays its own and is deliberately **not** derived from `Item filter:`. A filter states the
  scope of a run; only the caller knows whether that scope, or its own prior observation, makes the
  guard unnecessary. Deriving one from the other would hand the exemption to any future workflow that
  filters merely for scoping, without it ever having earned it;

- for a CI repair, the free-text instruction derived from the failing check names and their reported
  failure detail;
- **this run's own run state** – gated or non-interactive delegation. A gated gate run therefore
  still gets `effective-flow iterate`'s Phase 2.5 item approval once per round, and a gate run that is
  itself a non-interactive delegation passes that state on so the delegated run does not hang on a
  question nobody can answer;
- the resolved language values, so the delegated run does not re-read the project setup ADR.

Consume `effective-flow iterate`'s reported outcome per item. On `ABORT` for an item, the round counts as
unsuccessful: do not merge, and report the failed item.

## Configuration

Read from the Effective Flow configuration (project setup ADR) per the loaded configuration
building block. A missing line means the default.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |
| `delivery.mergeMethod`           | `squash`, `merge`, `rebase`        | `squash`  |

- `mergeGate.bots` is a flat comma list of reviewer logins; the trigger text and the check context of
  each bot are their own dotted keys. A login containing brackets (`greptileai[bot]`) is a valid
  middle segment, because the encoding splits on `.` only.
- An empty `mergeGate.bots` list means no automatic reviewer is expected. The bot round is then
  skipped instead of blocking the merge forever.
- `mergeGate.bots.<login>.check` names the commit status or check run that reviewer publishes, for
  example `recensor/review`. It is matched against the normalized `name` of an entry in
  `pr-status-read`'s check list, per the loaded "Automatic reviewer state". Unset is the default and
  selects that block's fallback signal, so a project that configures nothing keeps its previous
  behavior exactly.
- The legacy `prReview.*` names are still read: the loaded configuration building block resolves
  `mergeGate.<key>` first, falls back to `prReview.<key>`, and reports once that it did. This
  workflow never writes configuration – `effective-flow setup` migrates the block.
- `delivery.mergeMethod` is a delivery property, not a gate property: it describes how this project
  integrates a pull request.
- **`mergeGate.*` is not `delivery.prReview`.** The pre-existing `delivery.prReview` decides whether a
  workflow publishes **its own review findings** onto a pull request it just created. The
  `mergeGate.*` keys configure **this gate**. They mean entirely different things; never read one for
  the other, and never let the rename of this gate's namespace reach `delivery.prReview`.

## Wisdom accumulation

At the start, generate a session ID (e.g. via timestamp) and use
`.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved pull request (number, head/base branch, head SHA, URL) and the resolved completion
  mode with its source (configuration or entry gate)
- the authenticated login `viewer-read` returned, or the reason it could not be read
- the human-comment guard state and the evidence that set it
- per round: the round number, the check result, the merge state, what was delegated, and what came
  back; plus `VERIFIED_HEAD_SHA` once a round sets it, and its discard on a Phase-3 restart
- the provisioned checkout: reused in place, or the Effective Flow-owned worktree with its lifecycle
  record handle and that record's last transition
- the bot round: the observed state of every configured reviewer – **running**, **not started**, or
  **has run** – together with the evidence that established it (the check context with its status,
  the two timestamps, or the value that was missing), which trigger was posted, which threads went to
  `effective-flow iterate`, and which findings were deferred and reported in chat instead
- the merge preconditions verified in Phase 4 and the merge result or the blocking condition

Write a summary after each phase and pass it on to later phases. Delete the file at the end.

## Workflow

### Phase 0: Resolve the pull request and the completion mode

1. Resolve the pull request from the argument or the current branch through the PR resolution of the
   loaded "PR review comment integration". A merged or closed pull request, or one belonging to
   another repository, is reported read-only and the run ends – no wait, no delegation, no merge.
2. Run the forge preflight: detect the host and CLI, probe availability and authentication, and read
   the capabilities `pullRequestStatus`, `pullRequestChecksWait`, and `pullRequestMerge`. On
   `CLI_MISSING` or `AUTH_FAILED`, abort without side effects. On `AMBIGUOUS_HOST`, ask for the
   provider once and retry.
   - Without `pullRequestStatus` nothing in this gate can run: report that and end.
   - Without `pullRequestChecksWait`, the wait step reports and asks instead of waiting (Phase 2).
   - Without `pullRequestMerge`, the run degrades to `report` and states that reason.
   - **Forgejo** declares all three unsupported, so a Forgejo run is report-only by construction.
3. Resolve the completion mode from `mergeGate.completion`:
   - a configured `merge` or `report` is used unchanged, in every run state, and the report states
     that it came from configuration;
   - `ask` or an unset key poses the entry gate **exactly once**, before any wait, delegation, or
     write. Never ask it again later in the run.
   - `ask` or an unset key in a **non-interactive delegation** cannot pose the question, so that
     combination – and only that combination – behaves as `report`. Name
     `mergeGate.completion: merge` as the setting that would authorize a merge in such a run.

**`report` scopes the merge, not the run.** In both modes the gate waits for the checks, has failing
checks repaired through `effective-flow iterate`, posts a configured bot trigger where a bot has **not
started**, and has the bot threads answered and resolved through `effective-flow iterate`. `report`
withholds exactly one action: the merge in Phase 5. What differs is the ending, not the work.

If `mergeGate.completion` is `ask` or unset and the run is gated: Ask the user: **May this run merge the pull request once every gate passes, or only report merge-readiness?**
- Merge -- mergeGate.completion = merge — repair, have the bot threads answered by the delegated iterate run, and merge with delivery.mergeMethod once every precondition holds
- No merge -- mergeGate.completion = report — still repair failing checks and have the bot threads answered by the delegated iterate run, but never merge; the run ends with a merge-readiness report

### Phase 1: Read the state fresh and set the human-comment guard once

1. Read `pr-status-read` plus the review threads and the pull-request comments **fresh** through the
   loaded operations. Read the authenticated identity once through the loaded `viewer-read`
   operation (capability key `viewerRead`): the login it returns is what lets this run recognize a
   comment an **earlier** run of this gate wrote under the same account. Nothing else survives
   between runs – the comment or reply ID a mutation returned is known only to the run that
   performed that mutation, so a rule built on it reads every earlier run's output as a stranger's.
2. Evaluate every comment and thread in **exactly this order** and stop at the first rule that
   matches. The order is load-bearing, not cosmetic:
   1. **The author is a bot** – either a login listed in `mergeGate.bots`, or an item whose
      normalized `authorType` is `bot`. Two disjoint cases, and the second one carries app mode: the
      account this gate posts as appears in no configuration table, so it is recognized by
      `authorType` alone. The item is **excluded** and the evaluation stops there – the forge's own
      authorship record already separates those writes. **The identity lookup is deliberately not
      consulted for such an item.** `viewer-read` can legitimately fail on an installation token, so
      a rule that reached the identity here would fail closed and block precisely the one mode that
      never needed an identity.
   2. **The item sits inside a `resolved` review thread, its author is this tool's own, _and_ it
      carries `<!-- effective-flow-iterate -->` or `<!-- effective-flow-pr-review -->`** – the author
      being the login `viewer-read` returned, or a bot under rule 1's two cases. Only then does it
      **not** count. All three conditions are required. This is stated for the individual comments,
      not only for the thread, because it has to cover both directions this tool writes into a
      thread: the replies `effective-flow iterate` writes and resolves, and the inline review comments the
      outbound direction publishes. In manual mode both carry the same account as the operator, so
      without this rule the guard would stay active for exactly the pull requests this tool
      successfully worked on — including the ones it annotated itself through `delivery.prReview`.

      **Both markers count, and the enumeration is pinned to the helper's marker table.** The two
      directions stamp different markers by design, because idempotency and repeat suppression need
      to tell _which_ writer produced a body. This rule needs the opposite granularity: _whether any_
      Effective Flow writer produced it. Naming both is therefore the point, not an oversight — a
      rule that knew only the `effective-flow iterate` marker could never exclude an outbound review
      comment, whatever its author and however resolved its thread. The enumeration is deliberately
      not replaced by a reference to the marker table: a future comment kind must not join a
      fail-open exclusion automatically, so a contract test compares this list against
      `COMMENT_MARKERS` and fails when they diverge. Adding a writer is then a decision someone
      makes, not a silent widening.

      **Each condition removes a different way the guard could fail open.** A resolved thread is not
      a closed discussion: neither provider auto-unresolves a thread when someone replies into it,
      so a reviewer can object inside a thread `effective-flow iterate` resolved – "this fix is wrong, do
      not merge" – and that reply must still count. The author condition alone does not achieve
      that in manual mode, because there the operator and this tool **are the same account**: an
      objection the operator types themselves into such a thread would otherwise be read as this
      tool's own output and discarded. The marker is what separates the two, and it is legitimate
      evidence **here** precisely because it is not doing the work alone – the helper stamps every
      reply `effective-flow iterate` writes and every inline comment the outbound direction publishes, so
      an item from the right account, in a resolved thread, carrying either stamp is this tool's; a
      hand-typed objection in the same place carries no stamp and counts. This does not soften the
      rule that a marker never excludes an item on its own: it is the third condition here, never the
      first.

      **A marker counts only as the body's first line.** The helper stamps it as a leading line,
      so every item this tool writes begins with one. A quote-reply does not: both providers prefix
      the quoted body with `>`, so a copied marker lands inside a blockquote and no longer opens the
      body. That distinction is the whole reason the position is part of the rule – an operator
      quote-replying their objection into a resolved thread would otherwise carry the marker along
      and have their own objection discarded. A marker found anywhere else in a body is quoted text
      and is disregarded. An operator who hand-writes the marker as their opening line is overriding
      their own guard deliberately, which is a different thing from being caught out by a quote
      button.

   3. **Otherwise the item is this gate's own output only when both hold:** its author's normalized
      `login` equals the login `viewer-read` returned, **and** its complete body equals the
      configured `mergeGate.bots.<login>.trigger` value of some configured bot. Compare the `login`
      exactly and compare no other author field – display name, profile URL, and account ID take no
      part in it. Compare the **whole** body after trimming surrounding whitespace; a prefix, a
      substring, a quoted copy, or any other partial or fuzzy match never qualifies. Such an item is
      excluded.

      **This is the only shape this rule has to recognize**, because a gate-initiated run leaves at
      most one item of its own on the pull request: this trigger comment. It is **at most** rather
      than exactly one because Phase 3 posts no trigger for a bot it observed as **running**; a run
      that leaves nothing behind narrows nothing here. The delegated
      `effective-flow iterate` run's summary comment is suppressed (see "Delegation contract") and its
      thread replies are resolved along with their threads, where rule 2 catches them. A
      `effective-flow iterate` run the operator started **themselves** is a different case, and rule 4
      covers it.

   4. **A top-level pull-request comment is this tool's own when both hold:** its author is this
      tool's own – the login `viewer-read` returned, or a bot under rule 1's two cases – **and** its
      body's leading line is `<!-- effective-flow-iterate -->` or `<!-- effective-flow-pr-review -->`.
      Such an item is excluded. This reaches both top-level comments this tool leaves behind: the
      summary comment a directly invoked `effective-flow iterate` run posts, and the comment the outbound
      direction publishes for findings whose line lies **outside the diff**. Rule 3 reaches neither:
      it matches one exact configured trigger text, and neither of those bodies is it. Without this
      rule, running `effective-flow iterate` by hand – or letting `delivery.prReview` annotate a line
      outside the diff – and then asking this gate to merge would block on the tool's own output,
      permanently.

      **Both markers count, and the enumeration is pinned to the helper's marker table**, for the
      same reason rule 2 names both. The outside-diff case is the one that cannot resolve itself: an
      inline finding is anchored in a thread and stops counting once that thread is resolved, but a
      top-level comment has no resolved state, and `effective-flow iterate` skips an item carrying the
      outbound marker as this tool's own published output rather than as input awaiting action.
      Nothing would ever clear it. The enumeration is deliberately not
      replaced by a reference to the marker table: a future comment kind must not join a fail-open
      exclusion automatically, so a contract test compares this list against `COMMENT_MARKERS` and
      fails when they diverge.

      **Two conditions here, three in rule 2 – and the missing one has no analogue.** Rule 2's
      `resolved` condition exists because a resolved thread is a container this tool marked handled,
      and an objection can be typed _inside_ it. A top-level comment has no such container: an
      objection is its own comment, carries no stamp of its own, and still counts under rule 5.
      Requiring resolution here would not tighten the rule but disable it, because the surface it
      covers is never resolved – which is why the two-condition shape is pinned by the same contract
      test. The leading-line requirement carries the same weight it does in rule 2 – a quote-reply's
      copied marker sits behind a `>` and no longer opens the body – and a hand-written opening
      marker remains the same deliberate self-override.

      **Neither excluded comment hides an open question.** `effective-flow iterate` posts no substantive
      reply to a pure reviewer question and defers it, and it replies to and resolves only the
      threads it addressed. A deferred question therefore keeps its own unresolved thread, and that
      thread still counts. The summary comment reports on those threads; it never replaces them. An
      outside-diff finding is not a question at all: it is this product's own review output, which
      stays on the pull request to be read, and which no run was ever going to act on.

   5. **Everything else counts as human**, including an item whose normalized `authorType` is
      `unknown`. That is the fail-safe direction: the only consequence is a narrower run.

   **Fail closed – but never on rule 1.** A `viewer-read` that fails, is unsupported, or states no
   authenticated login leaves the identity unknown. A non-bot item can then not be _proven_ to be
   the gate's own under rule 3, and the `viewer-read` half of rules 2 and 4 is unprovable in exactly
   the same way; every such item therefore counts and the guard activates. Report the missing
   identity as the reason, so the block is explainable instead of mysterious. **Rule 1 needs no
   identity and stays untouched by this** – bot authorship is read from the item itself, as is the
   bot half of rules 2 and 4 – and that is what keeps app mode running when the identity lookup does
   not.

   **This is a same-account contract.** Rules 2 and 4 recognize an item only when the account that
   wrote it is the one `viewer-read` returns, or is bot-typed. A pull request annotated through
   `delivery.prReview` under one account and then merged by a gate running under another – an
   operator-driven delivery and an app-driven gate, for instance – fails that condition and still
   blocks. That is the accepted residual gap, not an oversight: closing it would mean letting a
   marker prove authorship on its own, which this guard refuses everywhere else.

3. Decide **what counts** for the guard, because the two surfaces differ:
   - a **review thread** counts while it is not `resolved`, and rule 2 above extends that to this
     tool's own comments inside a resolved one;
   - a **top-level pull-request comment** has no resolved state on either provider, so it always
     counts unless rule 1, rule 3, or rule 4 excluded it. A single old human comment therefore keeps
     the guard active until it is deleted – the deliberate fail-safe reading, since the alternative
     is merging a pull request under an open human discussion;
   - **an item is excluded only through the rules above.** Three of them read a body, and each reads
     it narrowly: rule 3 as an exact match against a value this project configured, rules 2 and 4 as
     a marker occupying the body's first line. None of them searches a body for a tool's signature.
   - **An Effective Flow marker never excludes an item on its own**, whoever the author looks like.
     A marker is body content, and content is not authorship evidence: GitHub's quote-reply copies
     the quoted body verbatim, HTML comment included, so a human answering one of
     `effective-flow iterate`'s replies would otherwise silently switch off the guard that exists to
     protect them. That is why a marker never appears as a rule's only condition, and never counts
     anywhere but as the body's leading line. This gate writes no marker of its own at all
     (Phase 3), so no marker on this pull request is ever evidence about the gate itself.
4. **Set the guard.** If at least one counting item has a human author, the human-comment guard is
   **active**. The guard is set once, here, from this first fresh read, and stays set for the rest
   of the run. A later fresh read may only set it – a human comment that appears mid-run is new
   information in the fail-safe direction – and nothing ever moves it from active back to inactive.

#### Human-comment guard

While the guard is active:

- **no review-driven implementation** – Phase 3 delegates nothing to `effective-flow iterate`;
- **no merge** – Phase 4 fails on this condition and the run ends with a report;
- **CI repair stays permitted** – a failing check is an objective defect, not an opinion a human is
  currently negotiating, so Phase 2 may still repair it. This narrowing is deliberate: it keeps the
  gate useful on an actively discussed pull request without ever landing a change out from under a
  reviewer;
- **no thread reply, and no thread resolution, of any kind** – see the rule below.

#### A deferred finding gets no thread reply

When this gate assesses a bot finding but does not implement it – because the human-comment guard is
active, or because the finding was rejected – it names that finding **to the user in chat** and
writes **nothing** into its thread. It resolves nothing either.

This **supersedes** the earlier rule that the guard permits the gate to answer bot threads itself.
The two are not two standing options: the later decision replaces the earlier one, and it is written
here so that the two are not read as a contradiction. Resolving such a thread would signal "handled"
for a finding nobody handled, and leaving an unresolved reply behind is precisely what makes the
next run read its predecessor's output as a human comment.

The consequence, stated plainly: **the gate's only own write is the trigger comment** of Phase 3,
and a **gate-initiated run leaves at most that one item of its own on the pull request** – because
the delegated run's summary comment is suppressed (see "Delegation contract") and its thread replies
are resolved along with their threads. At most, not exactly: Phase 3 posts no trigger for a bot it
observed as **running**, and a run that writes nothing at all is the same guarantee one write
further in the safe direction. Every reply for a finding that _is_ implemented is written
and resolved by `effective-flow iterate`, as before, and Phase 1's rule 2 keeps those replies out of the
guard.

### Phase 2: Check gate (bounded)

Repeat the round below at most `mergeGate.maxRounds` times. Run its steps in exactly this order – the
branch repair comes first so its push is finished before any delegation starts.

**A round runs forward only.** There is no backward jump inside it: whenever the round would return
to the wait or the repair step – a check is still pending after the wait, a repair changed the head,
a re-read shows a new failure – the current round **ends** there and the run continues with a new
round under "Round accounting". Every wait and every repair is therefore counted and bounded, and no
run can push an unbounded number of commits onto someone's pull request.

1. **Branch behind its base (`BEHIND`).** Provision a checkout of the existing head branch per
   "Checkout provisioning boundary" (verified execution location, rooted operations), fetch the
   base, merge `origin/<base>` into the head branch as a **merge commit**, and push the branch
   normally. Then re-read the status. This is the only kind of Git write this workflow performs; see
   "Git write boundary". It must be completed and pushed **before** any `effective-flow iterate`
   delegation in this or a later round. Use Git's default merge-commit message; add no
   `Co-Authored-By` trailer and no AI attribution.
   - **Close the checkout's lifecycle in the same step.** Once the push is confirmed, an Effective
     Flow-owned worktree goes `active` → `cleanup-ready` and through the shared
     claim/remove/reconcile sequence; a reused in-place checkout has no record to close. A later
     round that needs this step again provisions a checkout again.
   - If the merge conflicts or the push is rejected because of diverged remote history: stop,
     report, rewrite no history, and merge nothing. Transition an Effective Flow-owned worktree to
     `aborted` for a controlled stop or `failed` for an error, retaining the worktree and its branch
     for inspection.
2. **Conflict with the base (`DIRTY`).** Not repaired automatically: stop, report the conflict, and
   do not merge.
3. **Pending checks.** Call `pr-checks-wait` with `mergeGate.checkWaitMinutes` as its timeout and let
   the CLI block; the run consumes no tokens while CI runs. Restrict the wait to the forge's own
   required checks exactly when `mergeGate.requireAllChecks` is `false`; the helper owns the provider
   form of that restriction.
   - On a **timeout result** or when the provider has **no watch capability**: do **not** fall back
     to a prompt-driven poll loop. Report the still-pending checks by name and ask the user once.
   - An **unanswered or non-interactive** run ends there with a report and never merges.
4. **Failed checks.** Delegate to `effective-flow iterate <PR>` with the item filter set to
   **free-text-only** and an instruction derived from the failing check names and their reported
   failure detail. The human-comment guard does **not** block this delegation.
5. **Re-read the status** and evaluate the check criterion:
   - `mergeGate.requireAllChecks: true` (default) – **every** reported check must have completed
     successfully. A failed, cancelled, or timed-out check is a failure; a still-pending check ends
     this round and the next round starts again at step 1.
   - `mergeGate.requireAllChecks: false` – only checks the forge marks as required count, read from
     the `required` flag `pr-status-read` reports per check. A red optional check is reported but is
     not a blocker. A check whose requiredness the provider does not state **fails closed** and is
     treated as blocking, because an unproven "optional" is exactly the value that would wave a red
     check through. An **empty** required subset counts as satisfied: no reported check is required,
     so nothing required is outstanding, and the merge state below decides the rest.
   - That last rule is deliberate and has a known limit worth stating. The `required` flag exists
     only on checks that have **already reported**, so a required check which has not reported yet is
     absent from the list entirely and cannot be counted. This criterion therefore cannot distinguish
     "nothing is required here" from "a required check has not started". The merge state is what
     covers the difference — a forge blocks the merge while its required checks are unmet — which is
     why that condition is necessary rather than decorative. Do not read a satisfied criterion as
     proof that every required check has run.
   - In **both** cases the forge's merge state stays an **additional necessary condition**, never a
     substitute: "all checks green" and "mergeable" are different statements, and a protected branch
     can additionally require named checks, an approval, an up-to-date branch, or linear history.

Leave the loop when the check criterion is satisfied and the merge state is **stated** and is
neither `BEHIND` nor `DIRTY`. An unstated merge state fails closed and keeps the loop running, for
the same reason an absent `draft` flag blocks and an unstated requiredness blocks: "neither `BEHIND`
nor `DIRTY`" is vacuously true of a field the provider never reported, and the criterion above
delegates its own safety to this condition. A compensating condition that disappears when the
provider goes quiet compensates for nothing. Record the head SHA of that last read as
**`VERIFIED_HEAD_SHA`** – the one commit this run has verified as green and mergeable. Phases 4 and 5 use only that value, and nothing else in this
workflow records a head SHA for later use.

#### Round accounting

`mergeGate.maxRounds` bounds the **whole run**, not one phase. A counter starts at zero and increases
by one every time a Phase-2 round begins – **including** a round that only waits again after a
still-pending check, and **including** a Phase-2 restart that a Phase-3 bot round triggered – and by
one more for every **return into Phase 3** that Phase 4's condition 7 performs. That return is
counted here explicitly because it begins no Phase-2 round of its own; uncounted, a reviewer that
keeps publishing threads would cycle between Phase 4 and Phase 3 without a bound. Nothing resets the
counter and nothing bypasses it, because a round never jumps backwards into itself: a bot round that
produced an implementation and sent the run back into Phase 2 **consumes a round** like any other,
and so does the return into Phase 3. When the counter reaches `mergeGate.maxRounds`, the run ends
with a report naming the still-unmet condition, never with a merge.

### Phase 3: Automatic reviewer round

If `mergeGate.bots` is empty, skip this phase entirely, record that no automatic reviewer is
configured, and do not block the merge on it.

Otherwise, for each login in `mergeGate.bots`:

1. **Observe its state** through the loaded "Automatic reviewer state", against the fresh read: one
   of **running**, **not started**, or **has run**. Record the state together with the evidence that
   established it – the check context with its status, the two timestamps, or the value that was
   missing – so a Phase-4 block on this bot is explainable instead of mysterious.
   - **A bot with a configured `mergeGate.bots.<login>.check`** takes the primary signal, and only
     that signal can report **running**.
   - **A bot without one** takes the fallback signal, which distinguishes **has run** from **not
     started** and nothing else. That is exactly the two-way behavior this phase had before, so an
     existing project sees no change.
   - **An unprovable state is not started**, never an assumed pass: the gate may trigger and wait,
     and it never merges on an unprovable precondition.
2. **Running: wait, and post nothing.** The bot is already working for this head. Post **no** trigger
   comment: a mention would either queue a redundant second run or, for a reviewer that reads a
   mention as a fresh request, discard the one in flight. Apply the single wait of step 4.
3. **Not started: post its `mergeGate.bots.<login>.trigger` text once** as a pull-request comment,
   then apply the single wait of step 4.
   - Build that comment body yourself: the literal configured trigger text and **nothing else** –
     no marker, no preamble, no signature – posted through the helper's PR-comment mutation. That
     exact body is what Phase 1's rule 3 recognizes as this gate's own on the next run, and it is
     also what keeps the raw comment from announcing which tool composed it. Do **not** use the `pr`
     comment-kind builder – it stamps `<!-- effective-flow-iterate -->`, the marker
     `effective-flow iterate` reads as its own already processed work, and any marker at all would defeat
     both purposes above.
   - **Idempotency without a marker.** A trigger has already been posted for the current head when a
     comment exists whose body equals the configured trigger text after trimming surrounding
     whitespace, whose author is established as this gate's own, and whose `createdAt` is **not
     older than** `headCommittedAt`. Both timestamp fields are part of the normalized envelopes
     already. Post no second trigger then, and apply the wait instead.
   - **Establishing that author differs by mode**, and neither case reads a configured login: in
     manual mode the author's `login` equals the one `viewer-read` returned; in app mode the
     author's normalized `authorType` is `bot`. **No configuration names the account this gate posts
     as** – a `mergeGate.bots` entry is a reviewer the gate waits for, never the author of the
     trigger – so matching the trigger's author against that list would look for a comment that
     cannot exist.
   - If a timestamp is absent, or the author cannot be established at all, the comparison is
     unprovable. Treat the trigger as **not yet posted for this head** and post it: a redundant
     mention costs one extra bot run, a wrongly suppressed one costs the merge. This is the same
     direction step 1 fails in.
   - If no trigger text is configured for that login, post nothing and apply the same single wait for
     the bot's own schedule; report that no trigger is configured.
4. **The wait is one blocking wait, not a poll.** Both states above end in the same wait. There is no
   helper operation for a bot the way `pr-checks-wait` exists for the checks, so block once for
   `mergeGate.botWaitMinutes` – a single `sleep` of that span in the shell, or the harness's
   equivalent single blocking wait – then re-read exactly once and observe the state again. Never
   substitute a sequence of status reads: that is the per-interval model turn the design rejects.
   - If the harness cannot block that long (a tool timeout below the configured span), block for the
     longest single span it allows, re-read once, and, if the bot still has not run, end with a
     report naming it. Do not chain further waits to make up the difference.
   - If the bot is still not **has run** after the wait, the run ends with a report naming that bot
     and its observed state as the blocking condition. A timeout here is always a report, never a
     merge – and that holds for **running** exactly as it does for **not started**: a reviewer this
     run watched working is still a reviewer whose notes nobody has answered.
5. **When the bot has run:** hand its unresolved threads to `effective-flow iterate <PR>` with the item
   filter set to **exactly those thread IDs**. `effective-flow iterate` classifies them, implements the
   valid ones as new commits, replies, and resolves them.
6. **Any implementation restarts Phase 2** – new commits invalidate both the check result and every
   bot's state. Discard `VERIFIED_HEAD_SHA`; the new head is unverified until a Phase-2 round
   sets it again. The restart consumes a round per "Round accounting".

**With the human-comment guard active,** this phase neither delegates nor triggers: the trigger
comment and its wait are skipped as well, because the outcome they wait for – an implementation – is
unreachable, and an automated mention on an actively discussed pull request costs
`mergeGate.botWaitMinutes` per bot for nothing. The gate writes **nothing** into the already present
bot threads either: per "A deferred finding gets no thread reply" it leaves every one of them
untouched and unresolved, and names the findings it did not implement in its chat summary instead.

**This workflow never approves a pull request and never requests changes** – not even to unblock a
merge. A protected branch that requires an approval is reported as needing a human approval.

### Phase 4: Merge preconditions

Verify every one of the following against a **fresh** read. Any unmet condition ends the run with a
report naming exactly that condition, and merges nothing – with the single exception condition 7
states for itself, which sends the run back into Phase 3 while rounds remain instead of ending it:

1. the resolved completion mode is `merge`;
2. the check criterion from `mergeGate.requireAllChecks` is satisfied;
3. the forge reports the pull request as mergeable and **not a draft**;
4. the human-comment guard is inactive;
5. every login in `mergeGate.bots` is observed as **has run** for the current head through the loaded
   "Automatic reviewer state" – **running** and **not started** are both unmet conditions, and an
   unprovable state is **not started**, never an assumed pass;
6. every bot thread **whose finding this run implemented** is answered and resolved – those are
   written and resolved by `effective-flow iterate`. A finding this run deferred or rejected does
   **not** block the merge: it is named in the Phase-6 chat summary and its thread is deliberately
   left untouched. That scoping is deliberate, not an oversight – nothing in this workflow may write
   into such a thread any more (see "A deferred finding gets no thread reply"), so requiring an
   answer there would be a condition no run could ever satisfy;
7. **every unresolved thread of a configured reviewer has been assessed by this run** – implemented,
   or deliberately deferred or rejected. Take every unresolved thread of the same fresh read whose
   author is a login in `mergeGate.bots`, and match it against the record this run kept per round:
   the thread IDs it handed to `effective-flow iterate`, plus the threads whose findings it deferred or
   rejected. A thread in neither list arrived after the Phase-3 observation that fixed this run's
   item filter – the reviewer's check had gone terminal by then, which states that the reviewer
   finished and never that every thread it wrote had already arrived (see "Automatic reviewer
   state") – so nobody reached any outcome about it, and it blocks. An **empty** `mergeGate.bots`
   list produces no such thread and satisfies this condition, as it satisfies condition 5.

   **This is not condition 6 widened, and the two must never be folded into one.** Condition 6 asks
   whether a thread this run **implemented** was answered and resolved, and its narrow scope stays
   correct for the reason stated there. This condition asks a different question: whether the thread
   was **assessed at all**. Deferred and rejected are outcomes this run reached about a finding it
   read; **never assessed** is the absence of any outcome, about a finding nobody read. A finding
   that was judged and set aside is therefore silent in both conditions, and an unjudged thread
   blocks here and only here. A future simplification that merges the two restores the defect this
   condition exists for: it would either demand a reply no run may write, or wave through a finding
   no run ever saw.

   **Unmet while rounds remain: return to Phase 3** with exactly those threads, instead of ending
   the run. That return **consumes a round** under "Round accounting", precisely as a Phase-3
   restart does – the round counter is the only thing that bounds a reviewer which keeps publishing.
   Once the counter has reached `mergeGate.maxRounds`, the run ends with a report naming every
   unassessed thread; never with a merge.

   **Fail closed.** Whenever the fresh read cannot establish that a thread was assessed – an
   unreadable thread list, an author that cannot be established, an unstated resolution state – the
   thread counts as unassessed and blocks. An unprovable assessment is treated exactly as an
   unprovable reviewer state is in condition 5: never as an assumed pass;

8. `VERIFIED_HEAD_SHA` is set and the freshly read head SHA equals it. An unset value means no
   Phase-2 round ever completed, or a Phase-3 restart discarded it: that is a blocking condition,
   never a reason to verify the merge against the head just read;
9. for `delivery.mergeMethod: squash`, the pull-request title parses as a Conventional Commit
   (`<type>[(scope)][!]: <description>`). On a squash merge the title becomes the subject of the
   single commit and is therefore the release signal; an untyped title would silently drop the
   change from the changelog. Report the invalid title as the blocking condition – do not rewrite it
   here.

### Phase 5: Merge

In mode `report`, or when any Phase-4 condition failed, report the exact unmet condition and perform
no merge. In mode `report` that is the only thing withheld: the repairs, any bot trigger Phase 3
posted, and the delegated `effective-flow iterate` rounds of the earlier phases have already happened, and
the run ends by reporting whether the pull request is merge-ready and what a merge run would still
need.

Otherwise call `pr-merge` with `delivery.mergeMethod` and `VERIFIED_HEAD_SHA` as the expected head.
Inspect the default dry-run command preview, then repeat with `--apply`.

- If the expected head SHA no longer matches the current head, the operation **fails closed**: a
  human pushed while the gate was working. Report that and do not retry blindly.
- Never re-run the mutation after a structured error carrying `mutationMayHaveSucceeded: true` –
  re-read the pull-request state instead and report what it shows.

### Phase 6: Summary

1. Delete the wisdom file.
2. Report to the user in chat. **Neither this workflow nor any run it delegates posts a summary
   comment onto the pull request:** the gate has none of its own, and `effective-flow iterate`'s
   per-round summary is suppressed for every gate-initiated round, so its content arrives here
   instead. The merge itself is visible on the pull request anyway. Report:
   - the resolved pull request and the resolved mode with its source;
   - the check outcome per round;
   - the delegated `effective-flow iterate` rounds and their results, including the summary content each
     one handed back instead of posting;
   - the bot round per configured login: the observed state, the evidence that established it, and
     whether the run triggered, waited, or proceeded;
   - whether human comments were found and what that blocked;
   - **every bot finding this run assessed but did not implement**, named here rather than answered
     in its thread;
   - the merge result, or the precise blocking condition.

## Edge cases

- **The head moves during the run:** the SHA guard on `pr-merge` rejects the merge; report and do not
  retry blindly.
- **A bot acknowledges with an emoji reaction instead of a comment.** Greptile does this. Reactions
  are not readable through the helper, so on the fallback signal that acknowledgment never counts and
  the bot times out and blocks the merge – a report, never a wrong merge. **An acknowledgment is not
  a check.** Greptile also publishes a `Greptile Review` check context, so configuring `.check` for
  it removes this limitation entirely; do not read the reaction as evidence that a reviewer has no
  check to configure.
- **A bot edits one sticky comment in place instead of posting a new one.** Its `createdAt` never
  moves past `headCommittedAt`, so that edit is invisible to the fallback signal. The fallback reads
  the newest comment, review **thread**, or thread reply, so a review that also opens a thread for
  this head is still seen; on a head whose **only** output is that edit it is not, and the fallback
  reports **not started** for a reviewer that has in fact reviewed – a merge precondition that can no
  longer become true. recensor edits its summary comment this way, and Greptile did exactly this on
  the pull request that introduced the check-based signal: it found nothing, therefore opened no
  thread, and its frozen summary edit was its whole output for that head. Only a configured `.check`
  resolves it: the fallback cannot, by construction, because the one timestamp it reads is the one
  the reviewer stopped moving.
- **A bot posts nothing because it found nothing** is indistinguishable from "has not run yet" on
  the fallback signal; the same timeout applies. A configured `.check` removes this limitation for
  the bots that publish one.
- **The provider exposes no `createdAt` or no `headCommittedAt`:** bot freshness is unprovable on the
  fallback signal, so the bot counts as **not started**, the merge is blocked, and the missing field
  is named as the reason. Never merge on an assumed precondition.
- **A bot's configured `.check` context never appears** – a misconfigured value, or an app that is
  not installed: it is indistinguishable from a context about to appear, so the bot counts as **not
  started**. The gate triggers, waits, and finally blocks the merge naming the missing context, which
  is what makes the misconfiguration visible instead of silent.
- **A bot's configured `.check` is non-terminal:** the bot is **running**, so this run waits for it
  and posts **no** trigger. That is the one behavioral difference a configured `.check` makes to this
  phase; a bot without one keeps the previous two-way behavior exactly.
- **A bot's `.check` is terminal but failed:** it has run. The conclusion states what the reviewer
  found, not whether it ran, so its threads are handed to `effective-flow iterate` like any other.
- **A bot's `.check` goes terminal before its last thread is published:** the threads that land
  afterwards were in no Phase-3 item filter, so Phase 4's condition 7 finds them unassessed, sends
  the run back into Phase 3 for exactly those threads at the cost of a round, and blocks the merge
  outright once the rounds are used up. This is the window "Automatic reviewer state" narrows and
  leaves to its consumer to close.
- **A human quote-replies to the gate's trigger comment,** copying its body: the item is
  human-authored, so it counts and the guard activates. With no marker left to copy there is nothing
  in the body that could mislead the guard, and a quoted body carries the quote markup and therefore
  no longer equals the trigger text exactly.
- **The operator writes the configured trigger text by hand:** it matches rule 3 and is excluded.
  That is correct – a trigger is not a discussion, and treating it as one would block the merge for
  no reason. It also means the configured trigger should be a distinctive mention: a
  non-distinctive text such as `please review` could be typed by a person who genuinely wants a
  discussion and would then be excluded too.
- **`viewer-read` fails, is unsupported, or exposes no login:** the gate cannot identify its own
  writes on the manual path, so every remaining non-bot item counts, the guard activates, and the
  missing identity is reported as the reason for the block.
- **App mode with an installation token:** `viewer-read` may fail there, but every item the gate
  wrote is already excluded by rule 1 before the identity is consulted, so the run proceeds
  normally. This is the case the evaluation order exists for.
- **The authenticated identity changes between runs** (a different token): earlier writes are no
  longer recognized as own output and count as human. Fail-safe and correct – the gate genuinely
  cannot prove they were its own.
- **A thread `effective-flow iterate` answered and resolved:** rule 2 keeps its replies out of the guard,
  so a successful earlier run does not block the next one. A reply from **any other** account inside
  that same resolved thread still counts – resolution is not consent.
- **`effective-flow iterate` could not resolve a thread it answered:** it keeps its reply and reports the
  manual resolution, which leaves an unresolved item behind that carries the operator's account in
  manual mode. On a later run that item is in no resolved thread and its body is not the trigger
  text, so it counts as human and the guard activates. Thread resolution is unsupported only on
  Forgejo, where this gate is report-only anyway, so this costs a merge that was unavailable
  regardless – named here so it is not later read as an oversight.
- **The delegated run's summary comment:** it is suppressed for every gate-initiated round, so it
  never becomes such an item. A summary comment from a `effective-flow iterate` run the operator started
  themselves does exist, and rule 4 excludes it by its author plus its leading marker; before that
  rule it fell through to the catch-all and blocked the merge permanently.
- **A pull request this delivery annotated itself** (`delivery.prReview` published inline findings):
  once a finding is implemented, answered, and its thread resolved, rule 2 excludes the outbound
  comment by the `<!-- effective-flow-pr-review -->` marker, so the gate can merge the pull request
  its own product wrote on. While such a thread is still unresolved the finding is unhandled and it
  keeps counting, which is the intended block.
- **The same delivery's outside-diff findings:** they are published as one top-level comment carrying
  the same marker, and rule 4 excludes it by author plus leading marker. The two surfaces therefore
  block differently on purpose – an inline finding blocks until its thread is resolved, an
  outside-diff finding never blocks – because a top-level comment has no resolved state to clear.
  Before rule 4 named this marker, such a comment blocked the merge with no recovery short of
  deleting the record, since implementing the finding leaves the comment in place and
  `effective-flow iterate` skips the marker as this tool's own output.
- **A review body carrying an Effective Flow marker:** no rule covers it, and none is needed. The
  guard reads the review threads and the pull-request comments; a review body is in neither, so it
  can never hold the guard.
- **`mergeGate.bots` is empty:** the bot round is skipped and the merge is not blocked on it.
- **Branch protection requires an approval:** the forge reports a blocked merge state; report that a
  human approval is missing and never attempt to approve.
- **A non-required check is red while the required ones are green:** with the default
  `mergeGate.requireAllChecks: true` this blocks the merge and enters the repair loop like any other
  failure. With `false` the forge merge state decides and the red optional check is reported but not
  treated as a blocker.
- **A check is red and a human comment is open:** the CI repair runs, the merge does not. This is the
  one case where the guard is deliberately narrow.
- **`pr-checks-wait` times out or is unsupported:** report the pending checks and ask once; never
  fall back to a prompt-driven poll loop.
- **Forgejo:** `pr-status-read`, `pr-checks-wait`, `pr-merge`, and `viewer-read` are all unsupported,
  so the run degrades to report-only and states the reason. The guard therefore stays active there,
  which blocks a merge that was unavailable anyway – nothing is lost. Every bot takes the fallback
  signal there as well, because no check rollup is reported at all.
- **`effective-flow iterate` returns `ABORT` for an item:** the round counts as unsuccessful, the run does
  not merge, and the failed item is reported.
- **The item filter matches nothing** (every named thread was resolved between the read and the
  delegation): `effective-flow iterate` returns cleanly with no items and never falls back to processing
  everything.
- **The pull request is a draft:** report and do not merge.
- **The pull-request title is not a Conventional Commit and the merge method is `squash`:** report
  the invalid title as the blocking condition and do not merge.
- **Concurrent gate runs on the same pull request:** this workflow holds no lock of its own.
  `effective-flow iterate`'s commit mutex protects the index, but two gate runs could both wait. Out of
  scope; the merge SHA guard makes the second merge fail closed rather than duplicate work.

## Rules

- Perform **no** `git commit` and **no** push other than the base-into-head merge that Phase 2 step 1
  allows. Delegate every other code change to `effective-flow iterate`.
- Never rewrite the head branch's history: no `commit --amend`, no rebase, no squashing of its
  commits, no force-push. The forge-side `delivery.mergeMethod` – including `squash` and `rebase` –
  is the integration of the pull request in Phase 5 and is not covered by this rule.
- Never approve a pull request and never request changes, not even to unblock a merge.
- Never read an Effective Flow marker as authorship evidence **on its own**, and write none. A
  marker is only ever one condition beside the author, and only as the body's leading line.
  Evaluate the guard in Phase 1's order – bot authorship first, then this tool's own items inside a
  resolved thread, then the authenticated login plus the exact configured trigger text, then this
  tool's own top-level comment by its leading iterate marker – and count everything else as human.
- Never let an unprovable identity clear the guard. A failed, unsupported, or login-less
  `viewer-read` makes every remaining non-bot item count, which activates the guard wherever such an
  item exists and leaves a pull request without one unblocked; report the missing identity as the
  reason. The identity is never consulted for an item rule 1 already excluded.
- Write nothing into the thread of a bot finding this run did not implement – no reply, no
  resolution. Name it in the chat summary instead. The trigger comment is this workflow's only own
  write, and suppressing the delegated run's summary comment keeps it the only item a gate-initiated
  run can leave on the pull request – at most one, since a bot observed as **running** gets no
  trigger at all.
- Announce `Summary comment: suppressed` and `Review guard: established` in every delegation, each on
  its own line and in exactly that literal form, and never delegate without either of them.
- Take every bot's state from the loaded "Automatic reviewer state" and never treat an unprovable
  state as **has run**; an unprovable precondition blocks the merge. Trigger only a bot that has
  **not started**, never one that is **running** – a mention aimed at a reviewer already working
  costs the run in flight or queues a redundant one.
- Read the pull-request status, threads, and comments fresh before every write and before the merge.
- Ask the entry gate exactly once, at the start. A configured `mergeGate.completion` of `merge` or
  `report` is used unchanged in every run state; only `ask` or an unset key in a non-interactive
  delegation behaves as `report`.
- `report` withholds the merge and nothing else: repairs, the bot trigger for a bot that has **not
  started**, and the delegated `effective-flow iterate` rounds still run.
- Never fall back to a prompt-driven poll loop when a wait times out; report and ask once.
- Never exceed `mergeGate.maxRounds`, never reset the counter, and never jump backwards inside a
  round – a repeated wait, a repair, a Phase-2 restart from the bot round, and a Phase-4 return into
  Phase 3 each consume a round.
- Post no summary comment of your own; the run summary goes to the user in chat.
- Never set a `Co-Authored-By` trailer and add no AI attribution in the merge commit, in trigger
  comments, or in any other published text.
- Do not start project validation such as linting, tests, or builds yourself; the pull request's own
  checks are the criterion, and repairs run through `effective-flow iterate`.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly and perform no local side effects.

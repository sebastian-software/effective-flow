---
description: "Reads a review report file, evaluates developer notes, hands rejected findings as decision candidates to the central effective-product skill (ADR only for a permanent decision) and delegates implementable findings in parallel to {{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}} or {{SKILL:docs}}."
---

# Effective Flow Apply Review

You are the orchestrator for the automated implementation of review report findings.

## Goal

This workflow reads an existing review report file from `.effective-flow/review/`, evaluates the developer notes per finding and delegates the implementation to the matching workflows. Findings that should deliberately not be implemented are handed by the workflow as decision candidates to the `effective-product` skill; only permanent decisions are documented as an ADR, non-permanent rejections stay in the report or tracker artifact.

If the resolved tracker target is the forge or an external tool, the workflow reads the findings from that issue tracker instead: it is passed an epic/container issue or a list of concrete finding issues, one PR is created per finding, and the container entry is checked off after PR creation. The deviations are bundled in "Remote mode (issue tracker)"; there, `wontfix` findings replace the rejecting developer note.

```include
language-rules
```

```include
task-tracking
```

```include
delegation-mandate
```

The Phase 4 delegation sub-agent per overlap component is **workflow-to-workflow** delegation, not a worker role: its non-interactive delegation contract, the overlap components, the git commit mutex, the worktree isolation, the synchronization barrier, and the `failed (delegation)` handling stay authoritative and are never replaced by inline work. The mandate adds authorization only.

```lazy-include
runtime-state-safety
when: any wisdom, memory, cache, report, lock, or worktree mutation is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, memory, cache, report, lock, or worktree mutation is imminent
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
```

```include
config-migration
```

```include
adr-convention
```

```include
commit-message-rules
```

## Recommended skills

- `effective-product`

## Task tracking in detail

In addition to the generic rule in the include above, this skill requires **per-finding granularity** so that the user sees live during the workflow how many findings are still open.

### Task structure

Right at the start of Phase 1 (after a successful report classification), create the following tasks:

1. **Phase-level tasks** for each workflow phase, in order:
   - "Phase 1: Read and validate the report"
   - "Phase 2: Determine commit and stash strategy"
   - "Phase 3: Hand rejected findings to effective-product"
   - "Phase 4: Pre-analysis and parallel delegation"
   - "Phase 5: Update the report"
   - "Phase 6: Stash cleanup"
   - "Phase 7: Final validation"
   - "Phase 8: Summary"
2. **Per-finding tasks** for each implementable finding from the classification in Phase 1 (not for "Already implemented" or "Do not implement" findings):
   - Subject: `Implement finding R-XXXXXXX` (with the concrete finding ID)
   - Initial status: `pending`

### Task lifecycle

- **Phase-level tasks:** to `in_progress` before the phase starts, to `completed` after completion. Phase 1 is already active when the tasks are created → set it to `in_progress` directly after creating them and to `completed` after Phase 1 is complete.
- **Per-finding tasks:**
  - `in_progress`: as soon as the pre-analysis for this finding starts in Phase 4.1.
  - `completed`: as soon as the delegation in Phase 4.3 reports `DONE` for this finding.
  - **On `ABORT` in Phase 4.1 or 4.3:** set to `completed` anyway (an open task line would block the list), but extend the subject with `[failed]` so the user recognizes the status.
- **On an early overall abort** (e.g. no implementable findings in Phase 1, report not found): set all still-open `pending` and `in_progress` tasks to `completed` and extend their subjects with `[aborted]` before the skill ends with `DONE`.

### Important

- Create **all** tasks (phase-level and per-finding) at the end of Phase 1, directly after a successful classification. That way the user sees the full list before any parallel sub-agents start.
- Update tasks promptly: each lifecycle change directly after the event (not batched at the phase end).

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules.

```include
completion-protocol
```

```include
goal-completion
```

## Wisdom Accumulation

Use `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the stash baseline from Phase 1 (list of already-existing stash references with descriptions and commit hashes)
- the pre-analysis per finding from Phase 4.1 (affected files, root cause / requirement, implementation sketch, risks, confidence)
- the computed components from Phase 4.2
- implemented findings and their result
- failed delegations
- rejected findings and their result (permanent decision with ADR slug or non-permanent without ADR)

Write a summary after each phase and pass it to later phases. Delete the file at the end.

## Effective Flow configuration

Effective Flow-internal files live under `.effective-flow/` in the verified main checkout.
Retain `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separately from the first source-resolution
step through final cleanup. Every path below is resolved as an absolute handle below
`RUNTIME_STATE_ROOT`; entering a component worktree changes only `EXECUTION_ROOT`.

- Configuration: Effective Flow configuration from the project-setup ADR (see building block "Config migration")
- Memory file: `.effective-flow/memory.json`
- Cache file: `.effective-flow/cache.json`
- Review reports: `.effective-flow/review/`
- Temporary wisdom files: `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

`apply-review` works without a fixed configuration. If the Effective Flow configuration (project-setup ADR) fixes apply-review values, they override the defaults (schema shown here for illustration):

```json
{
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".effective-flow/.worktrees",
      "setup": "auto"
    }
  }
}
```

Missing values have these defaults:

- `applyReview.defaultCommitStrategy`: not set (the commit strategy is asked)
- `applyReview.finalValidation`: `full`
- `applyReview.stashPolicy`: `interactive` (today's interactive per-stash prompt)
- `applyReview.worktree.baseDir`: `.effective-flow/.worktrees`
- `applyReview.worktree.setup`: `auto`

Valid values:

- `applyReview.defaultCommitStrategy`: `worktrees`, `single`, `none`
- `applyReview.finalValidation`: `full`, `changedScope`, `off`
- `applyReview.stashPolicy`: `interactive`, `keep`, `discard`, `apply`
- `applyReview.worktree.setup`: `auto`, `none` or an explicit setup command as a string

### Config migration

Reading the Effective Flow configuration from the project-setup ADR (including the `applyReview` keys) and the one-time migration of a legacy config are handled centrally by the building block "Config migration" (`config-migration.md`); this building block no longer runs its own per-block migration for `applyReview`. The `applyReview` config schema above (configuration, valid values) remains unaffected by this.

### Cache file

Persistent cache data lives exclusively in `.effective-flow/cache.json`, not in `.effective-flow/memory.json` and not permanently in wisdom files.

`apply-review` may use this cache area:

| Area                  | Content                                                                               | Invalidation                                            |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `applyReviewAnalysis` | Pre-analysis results per report finding for interrupted or repeated apply-review runs | Report file hash, finding ID, relevant code file hashes |

Rules:

- Each cache entry needs `version`, `createdAt` and `sourceHash` or equivalent invalidation data.
- On uncertainty, a missing file, invalid JSON, a version change or invalidation that cannot be checked unambiguously: ignore the cache and recompute normally.
- Do not overwrite invalid cache files; briefly inform the user and continue without the cache.
- Do not cache user decisions about conflicts, stashes or ADR rejections.
- Do not use outputs of failed delegations as a basis for later successful runs.
- Wisdom files remain temporary in-run storage and are deleted at the end.

```include
apply-source-detection
```

## Remote mode (issue tracker)

If the resolved tracker target is the forge or an external tool (the argument is an epic/container or finding issue), read and follow the internal sub-file `tools/apply-review-remote.md` **before** the local report flow. It contains the issue-tracker integration, the external-target contract, and the complete remote flow (phase 1–8 remote), and replaces or supplements the corresponding local steps. Only on the `local` target (report file under `.effective-flow/review/`) is it not loaded.

## Workflow

### Phase 1: Read and validate the report

First determine the tracker target via the "apply-source detection" (report file under `.effective-flow/review/` → `local`; epic/container or finding issue → the target that reference belongs to, the forge or an external tool). For any target other than `local`, read and follow the internal sub-file `tools/apply-review-remote.md` (phase 1 remote and following) instead of the report-file steps 4–7 below; the config, stash and cache steps still apply.

1. Establish the verified dual-root execution receipt before resolving the source. Load the
   Effective Flow configuration, migrate it if necessary and determine the commit-strategy
   default, stash policy, worktree defaults and final validation profile.
2. Read the absolute `<RUNTIME_STATE_ROOT>/.effective-flow/cache.json` handle, if present and
   valid. Use only valid `applyReviewAnalysis` entries.
3. **Capture the stash baseline:** run `git stash list` and remember the full list of already-existing stash references (e.g. `stash@{0}`, `stash@{1}`, ... with their descriptions). Record the baseline in the wisdom file so that Phase 6 (stash cleanup) can later distinguish new stashes created by this workflow from it. If `git stash list` is empty: note "no baseline stashes".
4. Determine the report file:
   - if passed as an argument: use the absolute report handle returned by apply-source detection
   - otherwise: search for `review-report-*.md` only in the absolute
     `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory
   - with multiple reports: ask the user which one to use
   - if no report is found: error message and abort
5. **Read the file fresh from its retained absolute report handle.** Since the file can be
   deleted and recreated between conversations, no previously read content may be used.
   Revalidate the runtime root and handle containment first; never substitute a same-named file
   below the current execution root.
6. Detect and preserve the complete local report language, then parse all findings
   (`### [R-XXXXXXX] ...` blocks) using either complete English or German field labels:
   - finding ID and title
   - `Severity`
   - `Complexity`
   - `Area`
   - `File`
   - `Problem`
   - `Recommendation`
   - `Action` (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`)
   - `Prompt suggestion`
   - `Developer note` (if present)
   - `Status` (if present) and already present implementation hints (✅)

   When reading an existing local report, also accept the historical German field aliases
   `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Empfehlung`, `Aktion`,
   `Prompt-Vorschlag`, and `Entwickler-Anmerkung` / `Entwicklernotiz` / `Entwickler-Notiz`.
   Legacy values remain readable as well: severity `Kritisch` / `Wichtig` / `Hinweis`,
   complexity `Leicht` / `Niedrig` / `Mittel` / `Hoch`, and status `Offen` / `Behoben` /
   `Umgesetzt` / `Nicht umgesetzt`. Updates use the report's preserved language; action values,
   finding IDs, paths, and other machine tokens remain stable. A mixed/unclear report is not
   rewritten automatically. Remote issues independently use `language.forge`.

7. Classify each finding:
   - **Already implemented:** the finding already has a ✅ hint → skip
   - **Already published as an issue:** the finding carries a 🔓 publication note (`Published as #<nr>` / `Veröffentlicht als #<nr>`) from the security disclosure gate → do not implement it from the report, because the local report and the issue would otherwise be implemented twice. Collect these findings with their issue numbers for the handover in step 9; the local flow never processes them silently. If a note is present but its issue number is unreadable or ambiguous, ask instead of guessing, and do not treat the finding as implementable in the meantime.
   - **Do not implement:** the developer note begins with "Do not implement" (the German form "Nicht umsetzen" is also recognized) → hand to `effective-product` as a decision candidate (ADR only for a permanent decision)
   - **Implement:** no ✅ hint, no rejecting note, and no publication note → delegate to a skill
   - **Implement with context:** a developer note is present that does not begin with "Do not implement" / "Nicht umsetzen" → delegate to a skill, passing the note as additional context
8. Give the user an overview:

```markdown
**Report:** [filename]
**Date:** [date from report]

| Status | Count |
|---|---|
| To implement | X |
| Do not implement (→ effective-product) | Y |
| Already implemented | Z |
| Already published (→ issue) | P |
| Total | N |
```

9. **Hand over published findings:** If findings carry a publication note, name each one with its issue number and output the concrete re-entry `{{SKILL:apply}} #<nr> [#<nr> …]`, which processes them through the remote flow. Never drop them silently — the argument type decides the mode, so a report file cannot enter the remote flow by itself.
10. If no implementable findings and no rejected findings remain: report that briefly. If published findings exist, the message is the handover from step 9 rather than a bare abort, so a report consisting only of published findings ends with an executable next step instead of an apparent dead end. Then end the workflow.

### Phase 2: Commit and stash strategy

This phase is the workflow's only up-front strategy gate: the commit strategy and stash policy are determined here together, before the findings are worked through. After that no further **regular** approval gate follows; the remaining stops are exclusively conflict-driven data-integrity escalations: an `apply` merge conflict in Phase 6, a high-risk cherry-pick conflict in Phase 4.3 under the "Individually with worktrees" strategy and — rarely — an orphaned commit lock under the "Individually" strategy. With a non-`interactive` `applyReview.stashPolicy`, phases 3–8 therefore run through without a further stop if no such escalation occurs; with the default `interactive` policy, the stash decisions in Phase 6 and Phase 4.3 are additional stops.

If `applyReview.defaultCommitStrategy` is validly set, skip the ASK question and use the configured strategy:

- `worktrees` → **Individually with worktrees**
- `single` → **Individually**
- `none` → **No commits**

Briefly report that the commit strategy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask as before:

```ask
when: no valid value is set for `applyReview.defaultCommitStrategy`
header: Commits
question: Which commit strategy should be used for the findings?
options:
  - label: Individually with worktrees
    description: Parallel components run in isolated git worktrees and are integrated back afterwards (most common choice)
  - label: Individually
    description: Each finding is committed individually after implementation
  - label: No commits
    description: All changes are made without automatic commits
```

Record the answer and pass it to each delegated skill as an instruction:

- **Individually with worktrees:** each parallel component works in its own git worktree, commits the findings individually there, and the orchestrator then integrates the commits back into the original branch sequentially via `git cherry-pick`. Commit messages follow the same rules as for "Individually": a concrete Conventional Commit message, no internal finding IDs, no `Co-Authored-By`.
- **Individually:** commit the changes after each completed finding. Use a concrete Conventional Commit message without an internal finding ID, e.g. `fix: clarify review decision filtering`. **Never** set a `Co-Authored-By` trailer (not even for LLMs); this applies to every commit created by this workflow or a delegated sub-agent. Log the mapping of finding ID to commit hash in the wisdom file directly after each successful commit.
- **No commits:** no automatic commits, the user commits themselves.

#### Stash policy

Part of the same up-front gate: the stash policy determines in advance how the stash cleanup in Phase 6 (classes B/C/D) and the abort cleanup in Phase 4.3 handle stashes left behind — for every value except the default `interactive`, without a later follow-up question. Concrete stashes do not yet exist at the start; therefore the policy is decided, not the individual case.

If `applyReview.stashPolicy` is validly set, skip the ASK question and use the value; briefly report that the stash policy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask at the same gate as the commit strategy:

```ask
when: no valid value is set for `applyReview.stashPolicy`
header: Stashes
question: How should stashes left behind during the run be handled when a decision is needed?
options:
  - label: Interactive
    description: Ask per affected stash (today's behavior, blocks unattended runs)
  - label: Keep
    description: Keep unclear stashes unchanged and report at the end (safe for unattended runs)
  - label: Discard
    description: Discard unclear stashes (git stash drop) — possible data loss
  - label: Apply
    description: Apply unclear stashes (git stash pop); on a merge conflict it still asks
```

Value mapping: Interactive → `interactive`, Keep → `keep`, Discard → `discard`, Apply → `apply`. Record the chosen policy in the wisdom file. For an unattended non-interactive delegation, `keep` is the safe value; `interactive` blocks such runs at Phase 6 and Phase 4.3.

#### Commit mechanics per strategy

The detailed mechanics of the committing strategies — **Individually** (git commit mutex) and **Individually with worktrees** (worktree isolation including cherry-pick conflict assessment) — are in the internal sub-file `tools/apply-review-commit-mechanics.md`. Read it once the strategy is fixed in Phase 2 and commits are created; with **No commits** it is omitted. The later phases refer to this sub-file for the detailed rules.

### Phase 3: Rejected findings → decision candidate (delegation to `effective-product`)

The ADR authoring is owned by the host skill `effective-product` (domain owner: ADR merit, repo-convention detection, lifecycle, supersession, index — one branch of the broader product-decision scope that skill carries). This workflow **no longer authors an ADR itself** and encodes neither `docs/adr/`, nor numbering, status text or a fixed template. Effective Flow keeps the **mapping** (finding + developer note → decision candidate), the approval/status flow, the **backlink** to the report/remote issue and the tracking of the result artifact in the summary.

First survey the available skills:

```include
skill-discovery
```

For each finding with a "Do not implement" note (German "Nicht umsetzen" also recognized; in remote mode: `wontfix` finding, with a `wontfix` rationale instead of a developer note):

1. **Form the decision candidate.** From the finding and the developer note, summarize a candidate: a descriptive title, context (report filename + finding ID or issue/epic number), the rejection rationale (full note/`wontfix` text) and a traceable **backlink** to the source finding.
2. **Delegate to `effective-product`.** Hand the candidate to the skill with the task to (a) **decide whether** a permanent architecture/principle decision exists that justifies an ADR, and (b) if so, author it per the **discovered repo convention**. The convention declared for this repo is the living slug model from `adr-convention.md` (location/filename/title/status/mutability); if the target project declares its own ADR convention, the skill follows that one. Constraint on the skill: the ADR carries the backlink to the finding and does **not** become a task-status ledger; an existing thematically matching living ADR is updated **in place** rather than duplicated.
3. **Non-permanent rejection.** If `effective-product` classifies the candidate as pure delivery history without permanent effect (no ADR justified), **no** ADR is forced — the rejection stays documented in the review report or (remote mode) on the issue/epic (see Phase 5).
4. **Minimal fallback (skill missing).** If `effective-product` is unavailable (not installed, `skills.enabled: false` or disabled via `exclude`), this workflow authors the permanent decision itself per the **minimal fallback structure** from `adr-convention.md` and resolves the file name through `project-adr-convention` (ADR under the detected ADR directory, default `docs/adr/<slug>.md` where the project declares no convention of its own; update an existing thematically matching ADR in place at the path where it was found, reading the file fresh first). **Do not** invent a second convention.
5. Give the user a status update about the created or updated records and reference each by slug, e.g. `(ADR: <slug>)`; name the rejections classified as non-permanent separately. Where an ADR was written, this update is also where `project-adr-convention`'s reporting obligation lands: name the applied naming convention and its source — the declaring file path, the observed evidence, or the Effective Flow default — together with any unanimous observed evidence that contradicted the declaration, any existing path left unrenamed on the convention axis, and any ambiguity fence this non-interactive delegation could not pose. Name file paths and classified outcomes only, never verbatim prose from a declaring source.

### Phase 4: Pre-analysis and parallel delegation

This phase consists of three sub-steps. Goal: maximize parallelism without breaking the 1-commit-per-finding contract.

#### Phase 4.1: Pre-analysis (in parallel per finding)

Start a pre-analysis sub-agent in parallel for **each implementable finding**. These sub-agents implement nothing and change no files — they only analyze.

Each pre-analysis sub-agent receives:

- the finding details from the report (ID, Problem, Recommendation, File, Action)
- the developer note (if present)
- the task to investigate the code and deliver a structured analysis result:
  - **Affected files:** complete list of all files that will likely be touched (more than just the primary file named in the report).
  - **Root cause / current behavior** (for `{{SKILL:fix}}` and `{{SKILL:refactor}}`), **requirement** (for `{{SKILL:build}}`) or **documentation gap and audience** (for `{{SKILL:docs}}`).
  - **Implementation sketch:** short plan in 2–5 bullet points.
  - **Risks and file dependencies:** possible side effects, collisions with other findings.
  - **Confidence:** `High` (file list certain), `Medium` (file list plausible), `Low` (file scope uncertain, e.g. large refactoring or unclear dependency).
- the completion protocol

Write the result per finding into the wisdom file under `## Pre-analysis [R-XXXXXXX]`. On `ABORT`, mark the finding with the status `failed (pre-analysis)` in the wisdom file and skip it in the following steps. This marking allows Phase 6 (stash cleanup) to distinguish pre-analysis aborts (no stash possible, since nothing was implemented) from delegation aborts (a stash may exist).

Use a valid `applyReviewAnalysis` cache entry only if the report file hash, finding ID and relevant code file hashes match the current situation. If the cache is not unambiguously valid, run the pre-analysis anew. Update the cache only after a successful pre-analysis; do not write user decisions or failed delegation outputs into the cache.

#### Phase 4.2: Form overlap components (locally in the orchestrator)

Form the parallelization units **globally across all implementable findings of all action groups** (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`), based on the file lists from Phase 4.1. A finding's action group later only determines which skill implements it (Phase 4.3), **not** the grouping: two findings that touch the same file may never run at the same time — not even if their actions differ. The approach is explicitly two-stage:

1. **Partition** all findings (across actions) into two sets:
   - **Low-confidence set:** findings with confidence `Low` (file scope uncertain).
   - **Rest set:** findings with confidence `High` or `Medium`.
2. Apply **union-find to the rest set of all action groups together**:
   - Initialize each finding of the rest set as its own component.
   - For each file path named by more than one finding of the rest set: union the components of the involved findings — regardless of their action group.
   - Result: two findings are in the same component exactly when they are connected via a chain of file overlaps (also transitively: if A–B and B–C each share a file without A–C overlapping directly, A, B, C land in the same component; also star-shaped: if A shares a file each with B and with C without B–C overlapping, all three land in the same component too). A component may contain findings of multiple action groups.
3. Add the **low-confidence set as one shared safety component** to the result. This component runs internally sequentially because the file scope is uncertain and parallel singleton streams could otherwise modify the same file without union-find recognizing the conflict.
4. Order within a component: order as in the report (deterministic). No severity sorting — severities can imply dependencies. Each finding keeps its action group; it decides the target skill in Phase 4.3.
5. Order **of the components** relative to each other: deterministic by the report position of their first finding. This order is at the same time the integration order in worktree mode (Phase 4.3, step 7).
6. Result: a global list of overlap components, each with 1–N findings (possibly of mixed action).

Edge cases:

- If all findings are confidence `Low`, a single safety component with all findings arises; the union-find step is omitted.
- If there is exactly one implementable finding, the result is always a single component.
- A finding that shares a file with no other finding remains its own component and runs in parallel with the rest.

Example (across actions) with five findings over multiple actions:

- F1 `[fix] src/auth.ts` and F2 `[refactor] src/auth.ts` → component A (sequential, mixed action: F1 via `{{SKILL:fix}}`, F2 via `{{SKILL:refactor}}`)
- F3 `[fix] src/billing.ts` → component B (parallel to A)
- F4 `[docs] docs/guide.md` and F5 `[build] docs/guide.md` → component C (parallel to A and B, internally sequential)
  Three parallel streams. The earlier separate-per-action grouping would have put F1 and F2 into different streams and let both write to `src/auth.ts` at the same time.

#### Phase 4.3: Parallel delegation

1. Start a delegation sub-agent for each **overlap component** from Phase 4.2. All components run in parallel (by construction they share no file); within a sub-agent its findings are worked through **sequentially** in component order — even if the component contains findings of multiple action groups.
   - With commit strategy `Individually with worktrees`: create the worktree and its separate
     execution-location receipt per component beforehand. Pass the sub-agent the canonical
     absolute root and receipt; do not rely on an inherited or assigned persistent working
     directory.
2. Each delegation sub-agent receives directly embedded in the prompt:
   - the finding details (ID, Problem, Recommendation, Prompt suggestion, File)
   - the corresponding pre-analysis from Phase 4.1 as an **inline context block** in the prompt — not as a reference to the wisdom file. The sub-skills do not read the wisdom file; they only process the prompt content. Embed the pre-analysis in full, for example under the heading `Pre-analysis for this finding:`.
   - the developer note (if present)
   - the commit strategy from Phase 2
   - **With commit strategy "Individually":** the full git commit mutex rule from `tools/apply-review-commit-mechanics.md`. The sub-agent must run every finding commit under the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/apply-review-commit.lock` handle, may only stage finding-owned files and may never use `git add .`, `git add -A` or `git commit -a`.
   - **With commit strategy "Individually with worktrees":** the full git worktree isolation
     and execution-location rule from `tools/apply-review-commit-mechanics.md`. The sub-agent
     first verifies its component receipt, roots every operation there, commits each finding
     individually and logs commit hashes in the wisdom file. It must not switch into or operate
     on the original integration root.
   - the task to call, for **each** finding, the skill matching its action group (in mixed components thus determined anew per finding):
     - action fix: `Use the skill {{SKILL:fix}} for this finding.`
     - action refactor: `Use the skill {{SKILL:refactor}} for this finding.`
     - action build: `Use the skill {{SKILL:build}} for this finding.`
     - action docs: `Use the skill {{SKILL:docs}} for this finding.`
   - the prompt suggestion from the report as the task description
   - **Stash convention:** if any stash arises during the implementation of this finding (through a pre-commit hook, a manual `git stash` in the sub-skill or a tool-triggered stash), **the stash message must contain the finding ID**, e.g. `apply-review R-XXXXXXX <short description>`. This allows the stash cleanup in Phase 6 to reliably assign the stash to the finding.
   - the note that the sub-agent runs as a **non-interactive** delegation sub-agent of `{{FLOW}} apply-review` and therefore opens no approval gate of its own. `{{FLOW}} apply-review` steers the run at its own gate.
   - the literal line `Next steps: suppressed` on its own line. Each delegated skill is
     user-invocable and would otherwise close a per-finding recommendation into the chat, although
     it returns its result here and this run is an intermediate result of `{{SKILL:apply}}`.
   - the completion protocol
3. Check each sub-agent for `DONE` or `ABORT`.
4. On `ABORT`:
   - inform the user, mark the finding as `failed (delegation)` in the wisdom file.
   - **Before the next finding of the same component:** check via `git status` whether the working tree is clean. If uncommitted changes are present (a half-finished file from the aborted finding), clean the working tree per the `stashPolicy` fixed in Phase 2 before the next finding starts — otherwise it works on an inconsistent state:
     - `interactive` → ask the user whether to stash or discard the changes.
     - `keep` and `apply` → stash with the finding ID (`git stash push -m "apply-review abort R-XXXXXXX"`); `apply` makes no sense here, since this is about cleaning up before the next finding, and is therefore treated like `keep`.
     - `discard` → discard the changes.

     In every case, stash with the finding ID in the message so that Phase 6 can assign the stash.

   - Continue with the next finding within the same component. Other components keep running independently.

5. Give the user a status update after each completed component with the result per finding.
6. **Synchronization barrier before Phase 5:** start Phase 5 only when **all** delegation sub-agents started in Phase 4.3 have delivered a final status (`DONE` or `ABORT`).
7. With commit strategy `Individually with worktrees`: after the synchronization barrier,
   revalidate the original execution-location receipt and integrate all successful worktree
   branches sequentially via rooted `git cherry-pick` operations, in the **deterministic
   component order from Phase 4.2, step 5** (components by report position of their first
   finding; within a component the finding commits in component order). This fixed order makes
   the integration result reproducible. Phase 5 may only start once this integration is
   complete or the workflow has been halted due to a conflict/user decision.
8. A status update after a completed component is **not** a completion message of the overall workflow and **not** a halt. After each status update you actively check which delegation components are still running, wait for their final status and continue Phase 4.3 until no component is open anymore.

#### Known limitations

- **Cross-action file conflicts are detected:** the overlap components from Phase 4.2 are formed globally across all action groups. Findings that affect the same file therefore land in the same component and run sequentially — even with different actions they never write to a working tree at the same time. Remaining limitation: the detection is only as accurate as the file lists of the pre-analysis (Phase 4.1). If a finding touches a file at runtime that its analysis did not name, an overlap may go undetected; low-confidence findings with an uncertain file scope are covered here by the shared safety component.
- **Low-confidence findings** run across actions in a shared safety component sequentially, because their file scope is uncertain.
- The git commit mutex only isolates staging and commit in the original worktree. Worktree mode additionally isolates the working tree and git index, but shifts possible conflicts into the sequential cherry-pick integration (in deterministic component order).

### Phase 5: Update the report

**Precondition:** Phase 5 may only start once the synchronization barrier from Phase 4.3 is satisfied, i.e. no delegation component is open anymore.

1. Read the report file again fresh from the file system. The file could have changed during implementation.
2. Append to each successfully implemented finding as the last entry in the preserved report
   language: `✅ Implemented on YYYY-MM-DD via Effective Flow Apply-Review` or
   `✅ Umgesetzt am YYYY-MM-DD über Effective Flow Apply-Review`.
3. Append to each rejected finding as the last entry — depending on the classification by `effective-product`:
   - permanent decision with ADR: use matching English/German prose and retain `(ADR: <slug>)`
   - non-permanent rejection without ADR: use matching English/German prose; IDs and references
     remain stable
4. Save the updated report file.

### Phase 6: Stash cleanup

During the delegation in Phase 4, the called sub-skills or pre-commit hooks may create new stashes that remain without cleanup. This phase finds and handles them.

1. Run `git stash list` and compare the result with the baseline captured in Phase 1.
2. Determine the **new stashes** as all entries present in the current list but not in the baseline. Do not compare via `stash@{N}` indices (they shift), but via the full description (branch + commit hash + subject) and ideally additionally via the stash commit hashes (`git stash list --format='%H %gs'`).
3. If no new stashes are found: briefly output "No open stashes from this run." and go to the next phase.
4. **Stash-finding assignment:** determine for each new stash the corresponding finding via the following heuristics — in this priority:

   1. **Stash-message match (primary):** search via regex `R-\d{7}` in the stash message. On a match the assignment is unambiguous.
   2. **File overlap (fallback):** if no ID in the message: compare the changed files of the stash (`git stash show --name-only stash@{N}`) with the files logged per finding in the wisdom file. A significant overlap counts as an assignment.
   3. **No assignment:** if neither a message match nor a clear file overlap → the stash belongs to no finding from this run (e.g. from an external pre-commit hook).

5. **Classify each stash:**

   **A. Finding fully implemented AND stash content fully contained in the commit for the finding:**
   - Read the status of the assigned finding from the wisdom file. "Fully implemented" means: status `DONE` from Phase 4.3.
   - Fetch the commits belonging to this finding from the `finding ID -> commit hash` mapping logged in Phase 4.3; with "No commits" this path is omitted — see classification D below.
   - Compare `git stash show -p stash@{N}` with `git show <commit>` for the changed files. If the stash diff has been fully absorbed into the finding commit content-wise (the stash content is a subset of the commit changes) → **stash is an intermediate state, no longer needed**.

   **B. Finding fully implemented, but the stash contains changes that are NOT in the finding commit:**
   - The stash could contain a forgotten partial fix or unused intermediate state — user decision required.

   **C. Finding failed (status `failed (delegation)` or `failed (pre-analysis)`):**
   - The stash is potentially the only trace of the partial work — user decision required.

   **D. No finding assigned OR commit strategy "No commits":**
   - With "No commits" there is no commit to compare against → no auto-drop possible.
   - User decision required.

6. **Handle each stash based on its classification:**

   **Apply the stash policy from Phase 2:** class A remains auto-drop in all policies. Classes B/C/D follow the `stashPolicy`. The class steps below describe the case `stashPolicy = interactive` (default), which asks the stash question per stash. With the other values the question is omitted and you act directly: `keep` → keep the stash unchanged and note it as "kept" for the Phase 8 summary; `discard` → `git stash drop`; `apply` → `git stash pop` and on a merge conflict do **not** drop, but escalate to the user (the only remaining stop in the otherwise unattended run).

   - **Class A:** drop without asking.
     - `git stash drop stash@{N}`
     - Log to the user: "Stash for `[R-XXXXXXX]` discarded — finding fully implemented, intermediate state no longer needed."

   - **Class B:** inform the user and ask.
     - Show the stash description, affected files and the note: "Finding `[R-XXXXXXX]` was implemented, but the stash contains changes that did not flow into the commit — possibly a forgotten partial fix."
     - Ask the stash question below.

   - **Class C:** inform the user and ask.
     - Show the stash description, affected files and the note: "Finding `[R-XXXXXXX]` failed, the stash could be an incomplete attempt."
     - Ask the stash question below.

   - **Class D:** inform the user and ask.
     - Show the description and content (`git stash show -p stash@{N}`).
     - Ask the stash question below without a finding reference.

   Stash question (for classes B, C and D; only with `stashPolicy = interactive`):

```ask
header: Stash
question: How should this stash be handled?
options:
  - label: Apply and delete
    description: Run `git stash pop` and take the content into the branch
  - label: Discard
    description: Run `git stash drop`, the content is lost
  - label: Keep
    description: Leave the stash unchanged
```

7. Execute the decision — the interactive answer with `stashPolicy = interactive`, otherwise the policy action from step 6:
   - **Apply and delete:** `git stash pop stash@{N}`. On conflicts: inform the user, offer manual resolution, do not automatically drop the stash until the conflict is resolved.
   - **Discard:** `git stash drop stash@{N}`.
   - **Keep:** no action.
8. Important: after each `pop`/`drop` action the `stash@{N}` indices shift. Therefore read the list anew after each action and match via the description/commit hash captured in step 2, not via old indices.
9. Give the user a short status update about all handled stashes (automatically discarded, manually handled, kept). Record the list of kept stashes (reference and description) for the Phase 8 summary.

### Phase 7: Final validation

1. Observe `applyReview.finalValidation`:
   - `full`: the current project-wide quality gate.
   - `changedScope`: use only existing fast or scope-aware checks if the project offers them; do not invent your own tool arguments. If no such check exists, run a one-time standard check and do not start a global fix loop.
   - `off`: explicitly skip final validation, create no validation-fix commit and name the residual risk in the summary.
2. If `off` is active: after a short message go to Phase 8.
3. Check whether a validation script is configured in the project (e.g. `agent:check`, `typecheck`, `lint` in `package.json`).
4. If present: run the available checks per the validation profile (e.g. `pnpm agent:check`, `pnpm typecheck`, `pnpm lint`).
5. If errors or warnings are found:
   - fix all errors and warnings, even if they do not stem directly from the findings of this run. The final validation is a project-wide quality gate, not merely a finding-scope check.
   - With `changedScope`: fix only errors that clearly arose from this run in the changed scope or the one-time standard check; if the assignment is unclear, inform the user instead of broadly implementing unrelated fixes.
   - log in the wisdom file which files were changed by final validation fixes and whether they belong directly to findings or are unrelated validation fixes.
   - run the checks again
   - with `full`: fix and re-check per "Goal-driven completion control"; limit the internal correction rounds and escalate to the user if the checks still fail afterwards, instead of repeating without limit
   - with `changedScope`: repeat only if the affected check is scope-aware or fast enough; otherwise document the result and ask the user on unclear residual errors
6. If the commit strategy "Individually" was chosen in Phase 2 and fixes were necessary:
   - use the git commit mutex from `tools/apply-review-commit-mechanics.md` for the entire final staging/commit section.
   - run `git status --porcelain` before staging and distinguish final validation fixes from already-present user changes.
   - stage exclusively files changed by the final validation fix loop. Do not use blanket commands like `git add .`, `git add -A` or `git commit -a`.
   - check `git diff --cached --name-only` and `git diff --cached`.
   - commit the fixes with a commit message like `fix: resolve validation errors from final check`. If unrelated validation fixes are included, mention that concretely in the commit message, e.g. `fix: resolve final validation errors including unrelated warnings`.
7. If no validation script is present: skip this phase with a short message.
8. Give the user a short status update about the result.

### Phase 8: Summary

**Precondition:** Phase 8 may only start once phases 5 through 7 are fully complete. An earlier interim message does not end the workflow.

1. Delete the wisdom file.
2. Give the user a summary:

```markdown
**Apply-Review complete**

| Status | Count |
|---|---|
| Successfully implemented | X |
| ADR created (permanent decision) | Y |
| Rejected without ADR (non-permanent) | V |
| Failed | Z |
| Skipped (already implemented) | W |

[If findings failed:]
**Failed findings:**
- [R-XXXXXXX] [title]: [reason]

[If stashes were kept (e.g. stashPolicy keep):]
**Kept stashes:**
- `stash@{N}` [description] — please check manually
```

3. Return that summary and the run's end state — whether a pull request was opened and which source
   remains unprocessed — to `{{SKILL:apply}}`, which closes the run with its own next-step block.
   Name no follow-up invocation of your own here.

## Rules

- Pre-analysis (Phase 4.1) always in parallel per finding
- Delegation (Phase 4.3) in parallel per **overlap component** (formed globally across all action groups); sequential within a component so that same-file findings — even across actions — never write at the same time and the commit order stays clean
- After starting the delegation in Phase 4.3, actively wait for **all** component final statuses before Phase 5 begins or the workflow ends
- The report file must be read fresh from the file system when the skill starts
- Give the user a short status update after each phase
- If a delegated skill fails: inform the user, continue with the next finding
- Skip already-implemented findings (with ✅) without a message
- Prescribe the completion protocol to internal sub-agents
- Write a wisdom summary after each completed phase
- This skill does not assign new finding IDs. If new findings should be created in the future, `.effective-flow/memory.json` must be read and updated (see `{{SKILL:review}}`)

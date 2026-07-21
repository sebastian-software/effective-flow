
# Effective Flow Apply Review – Remote mode

This internal sub-file is loaded by `tools/apply-review.md` as soon as the tracker mode is `remote` (the argument is an epic or finding issue). It contains the full issue-tracker integration and the remote flow; in local mode it is never loaded.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an external issue tracker (GitHub via `gh`, Forgejo via `tea`). It is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). In local mode both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked.

The local/remote toggle (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local in every mode under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently remote** and do **not** evaluate the `tracker.mode` toggle (local/remote) – they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; an issue reference (issue number, `#123` or an issue URL) forces `remote`.
2. **Per-run wish of the user:** If the user explicitly requests issue/tracker work, `remote` is active; if they explicitly request local work ("local", "without issues", "report only"), `local` is active.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

### Remote helper contract (remote mode only)

All deterministic remote mechanics run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

For `finding-build` and `epic-build`, pass the already-resolved `language.forge` as the top-level
`language: en|de`; this applies equally when the finding or epic data is nested under its named
key. The optional field defaults to `en`, and unsupported values are rejected. The helper returns
the same language-stable payload keys in either language.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`, and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user, then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable, argument vector, and redacted input preview, obtain every workflow-specific approval that still applies, and only then repeat the same operation with `--apply`. A dry run never changes Git, tracker state, memory, labels, issues, pull requests, comments, or review threads.

### Label convention

In remote mode, use these labels and create missing labels idempotently (tolerate an "already exists" message, do not treat it as an error):

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see `effective-flow review`, "Report format").

- **Title:** `[R-XXXXXXX] <short title in language.forge>`
- **Labels:** `effective-flow-review-finding`, the action label and the severity label.
- **Body** (canonical template):

```markdown
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt suggestion**: [directly copy-pasteable plain text, without enclosing quotation marks, without escape sequences]
- **Epic**: #<epic number> (empty if no epic)
- **Signature**: [path:line] · [Area] · [short summary of the problem]  <!-- Dedup key -->
```

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run. Canonical writes use `Signature`; helper reads and deduplication also accept the legacy field name `Signatur` and normalize both forms to the same identity.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]` for English or
  `Code-Review YYYY-MM-DD[-N]` for German
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- <short title> — Signature: [normalized signature] — covered by [decision reference] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. A skipped entry is identified by title, normalized signature, and decision reference; it carries no issue number and no `R-XXXXXXX` ID, and it never advances `lastFindingNumber`. The section is omitted when no such findings are present.
- Ticking off delegates the exact checklist patch to the helper, using the body hash from the preceding fresh read. It may append the PR link; a finding deliberately not implemented is marked with its decision reference.

### Tracker operations

Describe tracker access only as a helper operation: issue/PR read and list, issue/PR create,
comment read/create/update, label create/change, PR review-thread read/reply/resolve,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

The targeted issue-comment update operation is `issue-comment-update`. Its input contains the
issue number, the positive `commentId` returned by `issue-comments-read`, the freshly computed
`expectedBodyHash` of that exact comment body, and `payload.body`. It is a mutation and therefore
uses the normal dry-run-first envelope. On apply, the helper reads the issue comments again,
requires exactly one matching comment ID, and compares its body hash before writing. A missing,
ambiguous, or changed comment fails with `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`;
the caller must not fall back to `issue-comment` and create a competing comment.

Provider mapping for `issue-comment-update` is fixed and owned by the helper:

- GitHub: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- Forgejo: `PATCH /repos/{owner}/{repo}/issues/{index}/comments/{id}`; Forgejo currently ignores
  `index`, but the adapter still supplies the freshly resolved issue number.

Both send a JSON object with the validated, attribution-free `body`. If probing reports that the
provider or installed CLI cannot execute this API operation, abort with `UNSUPPORTED_CAPABILITY`
before a write; never append a replacement planning comment.

Body writes, including `issue-comment-update`, require `expectedBodyHash` from the immediately
preceding fresh read. Preview the exact patch and command in dry-run mode, then apply with the same
payload. Zero or multiple semantic matches are structured errors; unchanged state is successful
and idempotent. The helper exposes whether provider-level conditional writes are available; the
expected-body precondition is mandatory regardless. GitHub returns the read ETag for diagnostics
but documents unsafe-method conditional requests as unsupported for these endpoints, so the
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").

## Remote mode (issue tracker)

When the tracker mode is `remote` (see "Issue-Tracker Integration (remote mode)"), the following adjustments apply **in addition to** or **instead of** the local report flow. Determine the mode at the start of Phase 1; the argument type takes precedence over the config.

### Argument detection and mode determination

Classify the passed argument via the "apply-source detection" (stage A and — for issue references — stage B) and derive mode and sub-mode from the source type:

- **`review-report`** (report file under `.effective-flow/review/`) → `local` (existing behavior, unchanged).
- **`review-epic`** (issue with `effective-flow-review-epic` label, legacy `firmo-review-epic` equivalent) → `remote`, **epic mode**: work through all finding issues linked in the epic.
- **`review-finding`** (a single finding issue or a list of finding-issue references) → `remote`, **issue-list mode**: work through exactly these findings only. The corresponding epic per finding is determined for the later check-off from the sub-issue (`Epic` field/reference), if present.
- **`remote` without argument** → list open epics and let the user choose.
- **`plan`, `container-issue` or `plain-issue`** → does not belong to ``tools/apply-review.md``: point to the responsible skill (``tools/apply-plan.md`` for plan files, ``tools/apply-issues.md`` for other issues, or `effective-flow apply` for automatic routing) and end. When delegating from `effective-flow apply` this case should not occur; the switch remains as a safeguard.

The argument type takes precedence over the config (see "Determine mode" in the tracker integration): `review-report` forces `local`, `review-epic`/`review-finding` force `remote`. With `remote`, detect host and CLI beforehand and check CLI availability; if the CLI is missing, abort clearly (no silent fallback to `local`).

### Phase 1 remote: Read findings from issues

Replaces reading the report file. Determine the finding issues to work through (parse the epic task list or use the passed list). Read for each finding issue the full body **and the comments fresh from the tracker** ("read comments" operation) and classify:

Resolve `language.forge` once for newly authored issue comments and checklist prose, while
preserving clearly established existing thread/body language. Resolve `language.git` once for
all commits and Conventional Commit PR titles. Pass both concrete values to delegated workflows;
stable labels, IDs, action values, references, and markers are never translated.

- **Target PR present:** if the body or a non-Effective Flow comment names a target PR
  (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), note the PR number, URL,
  head branch and base branch of the PR. A target PR overrides the
  default strategy "one PR per finding" for this finding.
- **Label `wontfix`** → do not implement, create an ADR (Phase 3 remote).
- **already checked off/closed** → skip.
- **Sub-issue without target action or prompt** (manually altered) → report as not implementable, do not guess.
- **Developer comment (non-Effective Flow) present** → implement **with context**: pass the comment text as additional context to the delegation skill. This is the remote equivalent of the local "developer note" in the "Implement with context" case. Deliberate rejection in remote mode still runs **exclusively** via the label `wontfix`, not via comment text; Effective Flow comments (e.g. `<!-- … -->`-marked status or PR-link comments) do not count as a developer note.
- **otherwise** → implement.

Create the per-finding tasks as in local mode; the finding ID is the `R-XXXXXXX` ID from the issue title.

### Phase 2 remote: Commit and PR strategy

In remote mode the commit/PR strategy is by default **"one PR per finding"** — the local commit-strategy question is omitted. Every implementable finding without a target PR is its **own component** in its own delivery branch, preferably with worktree isolation. Base branch and branch naming rely on the `delivery` config block: branch `<delivery.branchPrefix>/apply-review/<R-ID-or-slug>` off `delivery.baseBranch` (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values). File-overlapping findings run sequentially to avoid working-tree conflicts.

If a finding has a target PR from Phase 1 remote, **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the finding there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the finding as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Findings with the same target PR run sequentially so that new commits are created in order on the same PR branch. Findings without a target PR keep the default strategy "one PR per finding". The stash policy and the `/goal` string are handled as in local mode.

### Phase 3 remote: Rejected finding → decision candidate

For each `wontfix` finding, the same ownership rule as in Phase 3 (local) applies: delegate the candidate to `decision-records` (the skill decides whether an ADR is justified and authors it per the discovered repo convention; minimal living-slug fallback from `adr-convention.md` if the skill is missing). The candidate's context here references the **issue number and epic** (`Issue #<nr>` and `Epic #<nr>`) instead of a report finding; the `wontfix` rationale replaces the developer note. **No** numbered ADR is created. If a permanent ADR arises, mark the finding in the epic later via slug reference as `- [x] … — not implemented (ADR: <slug>)`; if the skill classifies the rejection as non-permanent, it stays documented without an ADR on the issue/epic (`- [x] … — not implemented (see issue rationale)`).

### Phase 4 remote: Implementation, PR and epic check-off

Per implementable finding, in its verified execution root:

1. Pre-analysis and implementation as in Phase 4.1/4.3 via the matching delegation skill
   (`effective-flow fix`, `effective-flow refactor`, `effective-flow build`, `effective-flow docs`). Pass a
   developer comment detected in Phase 1 remote as additional context, together with the
   delegated workflow's absolute execution root and receipt. Do not rely on inherited CWD or
   nest an Effective Flow worktree around a reused harness-native one.
2. Commit the changes (Conventional Commit message, no internal finding IDs, no `Co-Authored-By`), push the branch.
3. If a target PR is present: **do not create a new PR**, but use the existing PR link and optionally extend the PR body non-destructively by `Closes #<sub-issue>` or `Refs #<sub-issue>`, if that is possible without overwriting others' changes. If no target PR is present: create exactly one PR against the base branch via `effective-flow pr`; set `Closes #<sub-issue>` in the PR body.
4. **Immediately after a successful push or PR creation** read the epic body fresh and pass its
   body hash, the exact finding reference, and the PR-link suffix to the helper's checklist patch.
   Preview the issue-body mutation and apply it only when the fresh-write precondition still
   matches. Optionally write the PR link through the helper's comment payload/mutation.
5. **If push or PR creation fails** (push rejected, no commit): mark the finding as failed, do **not** check off the epic entry, continue with the next finding.
6. **If an assigned epic is missing** (issue-list mode): implement the finding anyway and create a PR; the check-off is omitted and reported to the user.

### Phase 5 remote: Tracking surface instead of report

No report file is updated. Instead, ensure that all epic checkboxes and sub-issue comments/labels reflect the final state (implemented → checked off with PR link; `wontfix` with permanent decision → checked off with ADR reference; `wontfix` without permanent decision → checked off with a reference to the issue rationale, without an ADR).

### Phase 7/8 remote

Final validation and summary as in local mode; the summary additionally names the epic URL, the created PRs and the checked-off findings.

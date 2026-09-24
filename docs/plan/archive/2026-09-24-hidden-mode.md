# Hidden mode: run Effective Flow without leaving traces in the repository

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Add a **hidden mode**, also called a spontaneous mode, in which Effective Flow can be used in a
target repository without anything that identifies it reaching the repository's tracked history
or the forge surfaces the team sees. It is meant for repositories where the user works alone
with Effective Flow, for example a client or team repository that has not adopted it.

User decisions (2026-09-24):

- All Effective Flow artifacts live under `.effective-flow/`: plans, concepts, and the
  project-setup configuration. Nothing is written to `.gitignore`. The one ignore entry is
  written to `.git/info/exclude`, resolved through `git rev-parse --git-common-dir` so that
  every linked worktree sees it.
- **No `AGENTS.md` and no `CLAUDE.md` is written or edited in hidden mode.** The configuration is
  found at a fixed path, so the setup marker is not needed. This replaces the idea from the
  original request of writing these files and excluding them.
- Hidden mode reaches beyond files:
  - delivery branches use a neutral branch prefix;
  - the tracker is pinned to `local`, so no `effective-flow-` labels or issue markers appear;
  - no Effective Flow-marked PR or issue comments are posted (`delivery.prReview` is `off`, and
    helper-stamped `<!-- effective-flow-… -->` markers are not written).
- Hidden mode is activated through a setup option that writes a config key. There is **no**
  zero-setup activation from other tools.

Rationale for the Feature classification: this adds new, user-visible behaviour, namely a setup
option, a config key, a new config location, and changed delivery and forge behaviour across
several workflows.

Planning basis: `develop` at `c628f3f`, 2026-09-24. The working tree has untracked files under
`docs/plan/` and `docs/concept/`. None of them is in scope.

## Architecture decisions

- **One config key, `visibility`,** with the values `standard` (the default) and `hidden`.
  It lives only in the local configuration file. A tracked project-setup ADR that declares
  `visibility: hidden` is invalid by construction, because hidden configuration must never be
  tracked. The locator reports that row and ignores it.
- **Fixed local configuration path: `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`.**
  - It uses the same Markdown key/value table encoding as the project-setup ADR, so it reuses the
    existing table parsing rules in `src/shared/config-migration.md`.
  - It deliberately does not use `config.json`. That name is the retired transitional fallback
    (the build guard `findRetiredConfigDocViolations` in `build-lib.mjs`), and it is the
    check-ignore sentinel in `src/shared/runtime-state-safety.md`.
  - It is read only from the main checkout (`RUNTIME_STATE_ROOT`), never from a linked worktree.
    This matches the transitional JSON rule in `src/shared/config-migration-edge-cases.md`.
- **Locator precedence.** The local file is step 0 of the resolution order in
  `src/shared/config-migration.md`. It is honoured only when it exists and declares
  `visibility: hidden`. Otherwise the locator reports it and falls through to the marker/ADR
  chain. If a tracked ADR or marker also exists, the local hidden file wins and the tracked one is
  reported once as shadowed, because hidden mode is a deliberate personal choice.
- **Forced values in hidden mode.** Setup writes these values, and the locator enforces them at
  read time. A contradicting row is reported and overridden, never honoured.

  | Key                     | Value in hidden mode                                                                       |
  | ----------------------- | ------------------------------------------------------------------------------------------ |
  | `plan.dir`              | `.effective-flow/plan`                                                                     |
  | `concept.dir`           | `.effective-flow/concept`                                                                  |
  | `tracker.mode`          | `local`                                                                                    |
  | `delivery.prReview`     | `off`                                                                                      |
  | `delivery.branchPrefix` | empty by default. Any value that contains `effective-flow` (case-insensitive) is rejected. |

- **Branch names with an empty prefix** become `<skill>/<slug>`, for example `fix/user-login`.
  The construction rule in `src/shared/worktree-integration.md` ("Construct delivery branch
  names") gains the empty-prefix form for every mode. Worktree ownership never depends on the
  branch prefix (`src/tools/cleanup.md` rules), so cleanup is unaffected.
- **The ignore entry is the single line `.effective-flow/`** in
  `$(git rev-parse --git-common-dir)/info/exclude`. Setup adds it idempotently, never duplicates it, and creates
  the file and its `info/` directory if they are missing. Every existing guard already uses
  `git check-ignore --no-index`, which honours `info/exclude`. The runtime-state-safety contract
  therefore needs no new mechanism, only its wording and fixtures.
- **Plans stay local through delivery.** `src/shared/plan-archival.md` gains a hidden arm:
  - The plan is marked implemented and moved with a plain no-clobber move from
    `<plan.dir>/` to `<plan.dir>/archive/` **in the main checkout**.
  - Nothing is staged, nothing is taken into `EXECUTION_ROOT`, and the main-checkout cleanup does
    not run, because the main-checkout copy is the only copy.
  - The same arm covers in-place runs without delivery.
- **Forge markers without markers.** In hidden mode the remote helper builds comments without
  the `<!-- effective-flow-iterate -->` and `<!-- effective-flow-pr-review -->` markers, via
  `pr-comment-build` and the marker map in `src/scripts/remote-tracker-shared-core.mjs`.
  - Today these markers also serve as `iterate`'s record of threads it has already processed
    (`src/shared/pr-review-comments.md`). In hidden mode that record moves to a local ledger under
    `<RUNTIME_STATE_ROOT>/.effective-flow/merge-gate/`, keyed by repository, PR number, and
    thread/comment ID.
  - Reply prose must not name Effective Flow either. The existing no-AI-attribution rules already
    forbid footers, and hidden mode extends them to any product naming.
- **Tracker-bound issue workflows fail closed.** Issue references force the tracker target
  (`src/shared/plan-input-gateway.md`, "argument type overrides the config mode"). The workflows
  that would write labels or markers to forge issues are `plan-issue`, `apply-issues`, remote
  `apply-review`, and `review` in remote mode. In hidden mode they stop with one clear message
  before any tracker write, instead of silently writing markers. Read-only planning from a pasted
  issue text stays possible through `effective-flow plan <text>`.
- **No local artifact paths in forge or Git prose.** In hidden mode, PR titles and bodies,
  commit messages, and merge-gate or iterate summaries never reference a path under
  `.effective-flow/`. That rules out the plan-file reference that `src/tools/pr.md` step 9 adds
  today. They also never name Effective Flow.
- **Setup entry.** `effective-flow setup hidden` selects hidden mode directly. Profile, Express
  and Guided each ask a `Visibility` question (`standard` / `hidden`) before Step 1, because
  Step 1 already differs between the two modes. Hidden mode then asks only the questions whose
  keys are not forced.
- **Ownership check (AGENTS.md "Layered ownership contract").** This is orchestration,
  configuration, and delivery behaviour, which Effective Flow owns. No central skill's playbook
  is duplicated.

## Affected files

| File                                                                                                                                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/config-migration.md`                                                                                                                       | Add step 0 (the local hidden file) to the resolution order, the `visibility` key, the forced-values table and override reporting, and the shadowed-ADR report. Rephrase "`.effective-flow/` is completely gitignored" so it is true for exclude-based ignoring.                                                                                                                                                                                                                                                           |
| `src/shared/config-migration-edge-cases.md`                                                                                                            | Add edge cases: a local file without `visibility: hidden`, a tracked ADR with `visibility: hidden`, both a local file and a tracked ADR present, and a local file present in a linked worktree only (ignored).                                                                                                                                                                                                                                                                                                            |
| `src/tools/setup.md`                                                                                                                                   | Add the hidden option (a profile or first question) and the `visibility` row in "Config schema" and "Safe defaults". Step 1 gets a hidden arm that writes the `info/exclude` entry and never touches `.gitignore`. Step 2 and item 4 write the configuration to the fixed local path with a hidden-appropriate Context line. Items 5 and 7 (marker, `CLAUDE.md` import) are skipped in hidden mode. Update the summary and Rules. Add a switch path standard → hidden and hidden → standard (see Implementation details). |
| `src/shared/setup-profiles.md`                                                                                                                         | Add the hidden profile or option and its forced values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/shared/config-setup-migration.md`                                                                                                                 | Make sure the setup-only `.gitignore` migration does not run in hidden mode.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/runtime-state-safety.md`                                                                                                                   | Wording: the sentinel check accepts ignoring via `info/exclude`. The remediation hint names the hidden setup path as well as `.gitignore`.                                                                                                                                                                                                                                                                                                                                                                                |
| `src/shared/worktree-integration.md`                                                                                                                   | Empty-prefix branch form. Plan handback delegates to the hidden arm of plan archival.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/shared/plan-archival.md`                                                                                                                          | Hidden arm: local no-clobber move and mark in the main checkout, no staging, no main-checkout cleanup, reporting.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/initial-state-documentation.md`                                                                                                            | Write under the hidden `plan.dir`. It is never staged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/concept-contract.md`                                                                                                                       | "Committed like plans" becomes conditional: in hidden mode concepts stay local under `.effective-flow/concept`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/pr-review-comments.md`, `src/shared/pr-review-thread-writes.md`                                                                            | Marker-free writes and the local processed-thread ledger in hidden mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/scripts/remote-tracker-shared-core.mjs` (and its CLI wrapper if needed)                                                                           | Option to build comment bodies without markers. The ledger read/write is deterministic and testable in the core.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/tools/iterate.md`, `src/tools/merge-gate.md`                                                                                                      | Consult the ledger instead of markers in hidden mode. No Effective Flow naming in replies or summaries.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/tools/plan-issue.md`, `src/tools/apply-issues.md`, `src/tools/apply-review.md`, `src/tools/review.md`                                             | Fail-closed guard for forge issue writes in hidden mode. `apply-review`'s rejected-finding → ADR path writes no tracked ADR in hidden mode and reports instead.                                                                                                                                                                                                                                                                                                                                                           |
| `src/tools/pr.md`, `src/tools/deliver.md`, `src/shared/commit-message-rules.md`                                                                        | In hidden mode, no plan-file reference and no `.effective-flow/` path or Effective Flow naming in PR titles, bodies, or commit messages.                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/tools/cleanup.md`                                                                                                                                 | Inventory the `.effective-flow/` line in `info/exclude` as the active counterpart, never as a legacy remnant. It is never removed by cleanup.                                                                                                                                                                                                                                                                                                                                                                             |
| `build.mjs`                                                                                                                                            | Update `CONTEXT_BUDGET_LINES` for every tool whose built size changes, using the numbers `node build.mjs` reports.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `build-lib.mjs`                                                                                                                                        | Only if a guard (retired-config docs, runtime-state safety, setup-repair scope) rejects the new wording. Allow the new path; keep every guard's intent.                                                                                                                                                                                                                                                                                                                                                                   |
| `test/runtime-state-safety-git.test.mjs`                                                                                                               | Fixture that ignores `.effective-flow/` via `info/exclude` only, with no `.gitignore`, including a linked worktree.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/workflow-contracts.test.mjs`                                                                                                                     | Contracts for the setup hidden arm (no `.gitignore` write, no `AGENTS.md`/`CLAUDE.md` write), locator step 0, forced values, plan-archival hidden arm, concept contract, fail-closed issue workflows. Adjust the existing assertions around lines 1225, 2724, 4133–4298, 6572–6589 and 9135–9463 where the wording changes.                                                                                                                                                                                               |
| `test/` for the remote tracker (existing suite for `remote-tracker-shared-core.mjs`)                                                                   | Marker-free comment building and ledger semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/user-guide/configuration.md`, `docs/user-guide/tools-setup.md`, `docs/user-guide/getting-started.md`, `docs/user-guide/worktree-and-delivery.md` | New section "Hidden mode". Correct the "tracked"/"gitignored" statements.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/developer-guide/configuration.md`, `docs/developer-guide/plan-conventions.md`, `docs/developer-guide/architecture.md`                            | Tracked-source boundary, resolution order, and plan archival with the hidden exception.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AGENTS.md`, `README.md.src` (then `mise run readme:write`)                                                                                            | One sentence each on hidden mode, where they describe configuration and `.gitignore`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Implementation details

### Approach

1. **Config contract first.**
   - Extend `src/shared/config-migration.md` with the `visibility` key, locator step 0 at
     `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`, the forced-values table, and the
     reports for an overridden row and a shadowed tracked ADR.
   - Add the edge cases to `config-migration-edge-cases.md`.
   - Everything else reads configuration through this resolver, so it must land first.
2. **Setup.**
   - Add the hidden option to `src/tools/setup.md` and `src/shared/setup-profiles.md`.
   - Hidden run: resolve `git rev-parse --git-common-dir`, add `.effective-flow/` to
     `info/exclude` idempotently and atomically, verify it with `git check-ignore --no-index --
.effective-flow/project-setup.md`, then write the local configuration.
   - Skip the `.gitignore` step, the ADR convention/directory resolution, the marker write, and
     the `CLAUDE.md` import offer.
   - A non-Git directory cannot be hidden: stop and explain.
   - If `.effective-flow/` has tracked content (`git ls-files -- .effective-flow/` is non-empty),
     stop. `info/exclude` cannot hide tracked files.
3. **Mode switches.**
   - Standard → hidden when a tracked ADR exists: setup writes the local file and reports that
     the tracked ADR is now shadowed. It never deletes or edits the tracked ADR, the marker, or
     `.gitignore`.
   - Hidden → standard: setup runs the normal path and, after confirmation, deletes the local
     file. The `info/exclude` line stays, because it is harmless and still ignores runtime state.
     Local plans and concepts are **not** moved automatically. Setup reports their paths so the
     user can decide whether to move them into the tracked `plan.dir`/`concept.dir`.
4. **Runtime-state safety wording** and the `info/exclude` fixtures. The existing mechanism
   stays unchanged.
5. **Plan and concept locality.**
   - Add the hidden arm of `plan-archival.md` and its call site in `worktree-integration.md`.
   - Update the `initial-state-documentation.md` and `concept-contract.md` wording.
   - Check `build.md`, `fix.md`, `refactor.md`, `docs.md` and `apply-plan.md` for any step that
     stages or copies a plan into the execution root, and route it through the hidden arm.
6. **Branch prefix.** Add the empty-prefix branch form, and the setup validation that rejects a
   prefix containing `effective-flow` in hidden mode.
7. **Forge surfaces.**
   - Add the marker-free comment builder and the local processed-thread ledger (core module plus
     tests).
   - Wire them into `iterate` and `merge-gate`.
   - Add the fail-closed guard to the tracker-bound issue workflows and the `apply-review` ADR
     path.
8. **Cleanup inventory** of the `info/exclude` line.
9. **Documentation** (user guide, developer guide, `AGENTS.md`, `README.md.src` → `mise run
readme:write`).
10. **Budgets and CI sequence.** Run `node build.mjs`, adopt the reported line counts into
    `CONTEXT_BUDGET_LINES` (headroom ≤ 10), then run `pnpm agent:check`, `pnpm test`,
    `node build.mjs` and `pnpm test:distribution`.

### Edge cases

- **The common directory differs from `.git`** (linked worktree, `--separate-git-dir`,
  submodule): always use `git rev-parse --git-common-dir`, never a literal `.git/info/exclude`.
- **`info/exclude` is missing, or its last line has no trailing newline:** create the file, or
  append on a fresh line. Never rewrite existing lines.
- **`.effective-flow/` is already ignored through `.gitignore`**, for example after a former
  standard setup: hidden setup still adds the exclude line and leaves `.gitignore` untouched. It
  reports that the tracked `.gitignore` still mentions Effective Flow and that removing that line
  is the user's decision.
- **Tracked `AGENTS.md`/`CLAUDE.md` with an existing Effective Flow marker:** hidden setup leaves
  them untouched. The locator's step 0 wins, and the shadowed marker is reported.
- **A local hidden file in a linked worktree only:** it is ignored, because configuration is
  read only from `RUNTIME_STATE_ROOT`. The run reports it.
- **Revisiting a plan from a worktree run:** the plan exists only in the main checkout. The
  implementing workflow reads it by its absolute main-checkout path, and the hidden archival arm
  writes only there.
- **Archive target already exists** in hidden mode: stop, report both paths, and change nothing.
  This matches the existing collision rule.
- **The `iterate` ledger is lost** (for example because `.effective-flow/` was deleted): threads
  that are already resolved are still skipped. Unresolved threads may be answered again. This is
  reported as a known degradation, not guessed away.
- **`delivery.mergeMethod: merge`:** the forge-generated merge subject contains the branch name.
  With the neutral prefix it no longer contains `effective-flow`.

## Acceptance criteria

- [ ] A hidden setup in a fresh Git repository leaves `git status --porcelain` empty.
      `.gitignore`, `AGENTS.md` and `CLAUDE.md` are neither created nor modified.
      `$(git rev-parse --git-common-dir)/info/exclude` contains exactly one `.effective-flow/`
      line after two consecutive setup runs.
- [ ] After a hidden `plan`, `concept`, `build` with worktree delivery, and plan archival, the
      delivery branch diff and its commits contain no path under `.effective-flow/` and no
      occurrence of `effective-flow` / `Effective Flow` in paths, commit messages, or the branch
      name. The archived plan exists at `.effective-flow/plan/archive/<file>.md` in the main
      checkout.
- [ ] A PR opened by `effective-flow pr` in hidden mode has a body that contains neither
      `.effective-flow/` nor `effective-flow` / `Effective Flow`. This is covered by a contract
      test on `src/tools/pr.md` and checked in the manual smoke test.
- [ ] With `visibility: hidden`, the locator resolves `plan.dir`, `concept.dir`,
      `tracker.mode`, `delivery.prReview` and `delivery.branchPrefix` to the forced values even
      when the local file carries contradicting rows, and it reports each override.
- [ ] A tracked ADR declaring `visibility: hidden` is reported and does not activate hidden
      mode.
- [ ] In hidden mode, `plan-issue`, `apply-issues`, remote `apply-review` and remote `review`
      stop before any tracker write, with a message that names hidden mode.
- [ ] In hidden mode, comment bodies built by the remote helper contain no
      `<!-- effective-flow-` marker, and `iterate` skips threads recorded in the local ledger.
      Both are covered by unit tests of the core module.
- [ ] `test/runtime-state-safety-git.test.mjs` passes with a fixture that ignores
      `.effective-flow/` only via `info/exclude`, in the main checkout and in a linked worktree.
- [ ] Standard mode is unchanged: every existing test passes, apart from assertions whose quoted
      wording was deliberately updated. Each such update is named in the PR description.
- [ ] The CI sequence `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`
      and `mise run readme:check` exits 0.

Completion condition: every box above is checked, with the CI sequence as the final gate.

## Validation plan

- Unit and contract tests: `pnpm test`, covering the new fixtures in
  `test/runtime-state-safety-git.test.mjs`, the contracts in `test/workflow-contracts.test.mjs`,
  and the remote-tracker core tests.
- Build guards and budgets: `node build.mjs`, which reports the budget lines and runs the
  retired-config and runtime-safety guards.
- Distribution: `pnpm test:distribution`.
- Manual smoke test in a scratch repository, with the local build installed via
  `./local-link.sh`:
  1. Run hidden setup, then `effective-flow plan`, then `effective-flow build` with worktree
     delivery.
  2. Check `git status`, `git log -p`, `git branch`, and the `info/exclude` contents.
  3. Run a second hidden setup and confirm idempotence.
- Merge-gate eval: `merge-gate.md`, `iterate.md` and the PR-comment fragments change, so
  `pnpm merge-gate-eval verify` will report the archive stale. Re-recording is owed before the
  next release, not before merge (see `evals/merge-gate/README.md`).

## Assumptions and open points

- Assumption: hidden mode is a per-checkout, per-user choice. Two clones of one repository can
  run in different modes.
- Assumption: an empty `delivery.branchPrefix` is an acceptable neutral default. Users who want
  `feature/…`-style names can configure any prefix that does not contain `effective-flow`.
- Assumption: the fail-closed issue workflows are acceptable for a first version. A marker-free
  variant of the forge tracker is out of scope.
- Out of scope: hiding Effective Flow from the user's own global harness configuration (installed
  skills under `~/.claude` or `~/.codex`), and rewriting history that an earlier standard setup
  already committed.
- Out of scope: the zero-setup spontaneous activation from arbitrary tools. The user chose
  setup-only activation.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important:** Forced values must be applied in the resolver, not in each tool.
  Otherwise a tool that reads `delivery.prReview` directly would bypass them. Incorporated:
  Approach step 1 puts enforcement in `config-migration.md`, and the acceptance criteria test it
  at the locator.
- **Architecture, Note:** Keying the local file on `visibility: hidden` keeps a stray
  `.effective-flow/project-setup.md` from silently taking over a standard repository.
- **Data protection, Important:** The existing main-checkout cleanup in `plan-archival.md` would
  delete the only copy of a hidden plan. Incorporated: the hidden arm explicitly runs no cleanup
  and archives in the main checkout.
- **Error cases, Important:** `info/exclude` cannot hide tracked files. Incorporated: setup stops
  when `.effective-flow/` has tracked content, and it leaves tracked `AGENTS.md`/`CLAUDE.md` and
  `.gitignore` alone with a report.
- **Scope, Important:** The forge-marker work (ledger plus helper option) is the largest and
  riskiest part, and it touches merge-gate eval sources. Kept in scope because the user
  explicitly chose "no PR comments with markers". It is ordered last among the code steps, so
  steps 1–6 form a coherent, reviewable increment if the delivery is split into two PRs.
- **Testability, Note:** The core promise, that no trace reaches Git, is only fully provable by
  the manual smoke test. The contract tests cover each mechanism separately.
- **Maintainability, Note:** Every future tool that writes into the repository or onto the forge
  must consider hidden mode. The developer-guide update should state this as a checklist item
  next to "Adding a tool or agent".

### Deep review 2026-09-24

**Result:** Approved

- **Error cases, Important (incorporated):** `src/tools/pr.md` step 9 adds a reference to the
  associated plan file from `<plan.dir>/` to the PR body. In hidden mode that would publish
  `.effective-flow/plan/…`. The plan now adds an architecture decision, `pr.md`/`deliver.md`/
  commit-rules entries, and an acceptance criterion.
- **Scope, Important (incorporated):** The setup entry was unspecified. It is now fixed as
  `setup hidden` plus a `Visibility` question in every setup mode before Step 1.
- **Scope, Important (decided):** Keep the marker-free comments with the local
  processed-thread ledger in this plan, rather than splitting it out or dropping thread replies.
  Consequence: the change touches merge-gate sources, so the merge-gate eval archive must be
  re-recorded before the next release. This is already stated in the validation plan.
- **Architecture, Note:** The concept contract's rule that `concept.dir` and `plan.dir` are
  separate, non-nested directories holds for `.effective-flow/concept` and `.effective-flow/plan`.
  No change is needed.

## Open points

- No open points.

## Implementation summary

Implemented by `effective-flow build` on branch `effective-flow/build/hidden-mode` from
`origin/develop` at `8c2e2f9` (develop had moved four commits past the planning basis; no plan path
was affected).

Deviations from the plan:

- The no-trace rule for commit messages lives in the hidden-mode section of
  `src/shared/config-migration-edge-cases.md` and in `pr.md` / `deliver.md`, not in
  `src/shared/commit-message-rules.md`. That fragment is baked into the native agent sidecars,
  whose byte-identity to the `7d1dcd5` baseline is a guarded contract.
- The processed-thread ledger lives in a new module `src/scripts/remote-tracker-ledger-core.mjs`
  with the lazy fragment `src/shared/pr-thread-ledger.md`. Recording is serialized behind an
  exclusive lock (`LEDGER_LOCKED`, never broken by age).
- An explicit `review <PR>` publishes nothing in hidden mode and reports in chat, because without a
  marker its repeat suppression cannot recognize earlier findings.
- The five publishing helper operations (`issue-comment`, `issue-comment-update`, `pr-comment`,
  `pr-update-body`, `pr-create`) also accept `visibility` and refuse disclosure in title, body, and
  head branch.
- `apply` stops issue references in hidden mode before tracker classification; `open-plans` gained
  a lazy config-migration pointer so it resolves the hidden `plan.dir`.
- `README.md` was updated by hand with the identical body transformation `mdtheme` applies,
  because `mise`/`mdtheme` is not installed on the implementing host.

## Test results

- `pnpm agent:check`: exit 0.
- `node build.mjs`: exit 0; budgets raised for setup, apply, apply-review, apply-issues, cleanup,
  deliver, pr, iterate, merge-gate (iterate at 0 headroom).
- `pnpm test`: exit 0, 1344 tests, 1343 pass, 1 skipped. One earlier full run hit a flaky failure
  in the untouched `test/pilot-measurement-timing.test.mjs`; it passed on rerun.
- `pnpm test:distribution`: exit 0.
- `pnpm eval merge-gate verify`: stale, as expected; a re-recorded round is owed before the next
  release.
- New tests: git fixtures for exclude-only ignoring (main checkout and linked worktree), contract
  tests for every hidden rule, and remote-tracker unit tests for marker-free building, publishing
  refusal, and the ledger (keys, lookup, lock, corrupt/missing/unsafe cases). Mutation checks
  confirmed the new guards are load-bearing.

## Review findings

**Date:** 2026-09-24
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    16 |
| Open / Not implemented |     0 |

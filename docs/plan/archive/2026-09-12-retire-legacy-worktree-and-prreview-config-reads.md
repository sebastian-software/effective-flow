# Retire the legacy worktree and prReview configuration reads

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

Implements findings **F-07** and **F-08** of
[`docs/review/2026-08-31-architecture-and-consistency-review.md`](../../review/2026-08-31-architecture-and-consistency-review.md).

Two configuration namespaces are still described as one-generation read fallbacks:

- **F-07:** `worktree.baseBranch`, `worktree.branchPrefix` and `worktree.completion` are the legacy
  spellings of `delivery.baseBranch`, `delivery.branchPrefix` and `delivery.completion`.
- **F-08:** the merge gate's keys were renamed from `prReview.*` to `mergeGate.*`; `prReview.<key>`
  is still read per key where `mergeGate.<key>` is absent. The name collides with the unrelated live
  key `delivery.prReview`.

The user decided on 2026-09-12 to **retire both reads loudly**: a retired row is never read as a
value again, and a run that could otherwise have fallen back to it stops before it does anything and
names `effective-flow setup`, which migrates the row in place.

### Why this is a Bugfix

The F-07 contract is already inconsistent with itself, and the inconsistency can deliver work
against the wrong branch:

- `src/shared/worktree-integration.md:95–104` ("Config migration") promises that
  `config-migration.md` moves the `worktree.*` values into `delivery.*` "once and centrally", and
  that until then readers take `delivery.*`, then `worktree.*`, then the default. **That migration no
  longer exists**: commit `9b8b7a9` (2026-07-16) removed it from `config-migration.md`, and
  `src/tools/setup.md` never names the three keys.
- The one base-branch resolution rule, `src/shared/base-branch-resolution.md:5–7`, ignores the
  fallback entirely: an absent `delivery.baseBranch` takes `origin/` prefixed to the branch
  `origin/HEAD` names. Only prose restatements claim the fallback — `src/tools/pr.md:106` and
  `:120–121`, `src/tools/apply-issues.md:279`, `src/tools/apply-review-remote.md:86`,
  `docs/user-guide/tools-deliver.md:114`.
- Consequence: a project whose ADR carries only `worktree.baseBranch | origin/develop` gets
  `delivery.baseBranch` derived from `origin/HEAD`. In a repository whose default branch is `main`
  while development happens on `develop` — this repository's own model, recorded in its project-setup
  ADR — delivery branches start from `main`, silently.

F-08 is not a defect on its own: its fallback works and is documented. It is folded into this plan
because the same retired-key rule, the same `setup` rewrite and the same eval re-record serve both;
two plans would ship two stop rules for one concept and pay the eval re-record twice. See the
classification decision below.

### Planning baseline

- Planned against `origin/develop` at `4321151`, 2026-09-12. The local checkout was `538e224`, two
  commits behind. Of those, #415 edited `src/tools/pr.md`, `src/tools/apply-issues.md` and
  `src/tools/apply-review-remote.md`; the line numbers in this plan are taken from `4321151`.
- History: `delivery.*` was introduced in `0e253b1` (2026-07-09) and has shipped in 39 releases;
  `mergeGate.*` in `88979a7` (2026-08-05, first released as 1.56.0) and 12 releases. No major release
  has ever shipped; the manifest reads `1.63.0`.
- This repository's own project-setup ADR carries no retired row. No merge-gate eval fixture,
  scenario, result or scaffolded ADR carries one either (`evals/merge-gate/_scaffold/scaffold.mjs:137–153`
  writes only current keys).

### Verified current state — F-08

- Canonical fallback: `src/shared/config-merge-gate-keys.md:47–54`, "**Backcompat (one
  generation):**", ending "Once every project has run setup once, the fallback has no remaining
  reader and is removable rather than load-bearing".
- Restated in `src/tools/merge-gate.md:662–667` (the gate does not load the fragment) and referenced
  from `:699–700` and `:710` (reviewer advisory).
- `setup` migrates a legacy block in place: `src/tools/setup.md:231–235` (Step 2 records it),
  `:965–989` (Step 6, "Rewriting a legacy `prReview.*` merge-gate block in place"), `:1087–1089`
  (Step 8 report).
- User and developer docs promise the fallback: `docs/user-guide/configuration.md:347–350` and
  `:395–402`; `docs/developer-guide/configuration.md:222–232`; `docs/developer-guide/skill-ownership.md:212`.
- Adjacent defect: `docs/developer-guide/configuration.md:208–209` calls `delivery.prReview` a
  "boolean"; it is `ask` / `always` / `off`.

### Who resolves a successor, and when

| Resolver               | Successor keys and where they are read                                                                                      | How the configuration core reaches it                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `worktree-integration` | `delivery.baseBranch` (L147), `delivery.branchPrefix` (L157), `delivery.completion` at handback (L414–421, ask at L420–421) | host tools: lazy in `build`, `docs`, `fix`; eager in `refactor`, `maintain`, `iterate`, `merge-gate`   |
| `pr`                   | `delivery.baseBranch` (L103–106, L120–124)                                                                                  | `base-branch-resolution` eager; the core only lazily through `chat-language`'s `language.chat` trigger |
| `deliver`              | `delivery.baseBranch`, `delivery.branchPrefix` (L148–149); `delivery.completion` only reported as overridden (L150–151)     | lazy (`deliver.md:29–32`)                                                                              |
| `apply-issues`         | delivery block (L279)                                                                                                       | eager (`apply-issues.md:97–99`)                                                                        |
| `apply-review-remote`  | delivery block (L86)                                                                                                        | no include of its own; its host `apply-review` includes the core eagerly (`apply-review.md:54–56`)     |
| `iterate`              | `delivery.baseBranch` (L473); `mergeGate.bots*` (L490, L513, L537)                                                          | eager, plus `config-merge-gate-keys` eager                                                             |
| `merge-gate`           | `mergeGate.completion` (Phase 0, L883–887) through `mergeGate.botWaitMinutes` (Phase 3, L1246)                              | eager                                                                                                  |

Every resolver is reached. The gap is **timing**: `delivery.completion` and most `mergeGate.<key>`
values are read after worktrees, commits, pushes or repair delegations already happened.

Tightest budgets among affected tools (measured / entry): `setup` 1661 / 1662, `apply-issues`
1176 / 1179, `merge-gate` 2910 / 2914, `iterate` 1656 / 1661, `pr` 427 / 432.

## Architecture decisions

- **Detect at the first configuration read, not at the moment of resolution.** A run checks, at its
  first configuration read and before any fetch, branch, worktree, commit, push, delegation or merge,
  every retired row whose successor **that tool can resolve at any point of its run**. Stopping when
  a late successor is about to be resolved would leave a delivery branch, a worktree or pushed repairs
  behind: a project carrying only `worktree.completion | pr` would implement and commit before
  stopping at handback. The edge-cases contract names which tools resolve which successors, so a run
  does not have to infer its own set.
- **One rule, deferred, with its detection predicate eager.** The configuration core gets one
  table-encoding bullet of at most three rendered lines naming the retired rows — "a row whose key
  begins with `prReview.`" in exactly the anchored wording `setup.md:232` already uses, plus the three
  `worktree.*` keys — and its existing `lazy-include` to `config-migration-edge-cases` gains "a retired
  key is present" as a trigger clause. The stop contract lives in the edge-cases fragment. The key
  names are the detection predicate, so they stay in loaded text — the rule the `4947737` fix
  established after a deferred literal made its own trigger undecidable.
- **The retired-key stop is the one named exception to the safe-default rule.** `config-migration.md`
  says every tool's read path is non-blocking (L36–39) and that an invalid or ambiguous table uses a
  safe default and informs the user (L90–92). Without an explicit exception a reader can classify a
  retired row as a missing key, take the default, and never stop. The core bullet states the exception,
  and L36–39 is clarified to mean what it always meant: the read path creates no file and mutates no
  Git.
- **Successor present: no stop.** If both the retired row and its successor are present, the successor
  wins, as it already does today; the run reports the inert retired row once and points to `setup`.
- **Login-keyed merge-gate subkeys follow "Matching a configured login".** A retired
  `prReview.bots.<login>.trigger` or `.check` has as its successor the corresponding key under the
  `mergeGate.bots` entry that denotes the same reviewer under that rule, including the one-trailing-
  `[bot]` equivalence and collapsed entries. A retired subkey whose login matches no reviewer the run
  resolves is never resolvable; it is reported once and does not stop the run.
- **`deliver` reports a retired `worktree.completion`, never stops on it.** `deliver` reads
  `delivery.completion` only to state that its own pull-request intent overrides it (`deliver.md:82`,
  `:150–151`); a retired row there changes nothing it does.
- **`pr` gets its own clause in `base-branch-resolution`,** because it reaches the core only through
  an unrelated `language.chat` trigger. The clause is prose in the opening paragraph, not a fourth
  bullet — `test/workflow-contracts.test.mjs:8659` requires exactly three bullets — and it does not
  contain the literal command string the resolved-composition count at `:8992` looks for. `pr`'s
  first write is its push in step 7, so a stop when step 4 applies the rule is before any write.
- **`setup` is exempt and is the repair path.** It records every retired row in Step 2 and rewrites it
  in place in Step 6. The existing `prReview.*` rewrite is extended to the three `worktree.*` keys
  rather than duplicated, and its heading is kept, because `test/workflow-contracts.test.mjs:977` cuts
  at `'\n#### Rewriting a legacy'` and `:6421` slices by the exact heading.
- **`delivery.enabled` stays as it is.** It is already ignored on read and has no successor, so it is
  not a retired key in this sense. Only the sentence claiming it is "removed by the full config
  migration" (`worktree-integration.md:89–93`) is corrected, because it points at the same deleted
  migration.
- **Classification: one Bugfix, commit type `fix:` without `!`.** Splitting F-08 into a separate
  `feat:` or `refactor:` was considered and rejected: both halves share one rule, one `setup` rewrite
  and one eval re-record, and the retirement of F-08 is exactly what its own documentation announced
  ("this fallback lasts one generation", `docs/user-guide/configuration.md:399`) after twelve releases.
  The project has never shipped a major release. `AGENTS.md` "Versioning" discusses the breaking
  marker only for deprecated tool aliases and for pinning a mistaken break forward; it states no rule
  for configuration retirements, and this plan does not claim one. Because the change turns stale
  configurations into stops, the PR body and the generated changelog entry must name the stop and its
  one-step repair.
- **Headings pinned by tests are kept.** `### Merge-gate keys (`mergeGate.*`) and their legacy
namespace` (pinned at `test/workflow-contracts.test.mjs:6464`, `:8115`, `:8163`) stays — "legacy
  namespace" remains true of a retired one.

### Expected budget deltas

| Tool                                                                         | Measured / entry | Expected change | Why                                                                                        |
| ---------------------------------------------------------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `apply-issues` and the other eager consumers of the core without other edits | e.g. 1176 / 1179 | +2 to +3        | the core bullet only                                                                       |
| `iterate`                                                                    | 1656 / 1661      | about −4        | core +2, backcompat paragraph of `config-merge-gate-keys` −6                               |
| `merge-gate`                                                                 | 2910 / 2914      | about −2        | core +2, restatement L662–667 replaced by a pointer                                        |
| `pr`                                                                         | 427 / 432        | 0 to +2         | the `base-branch-resolution` clause                                                        |
| `setup`                                                                      | 1661 / 1662      | +1 to +7        | core +2, backcompat −6, Step 2 +1–2, Step 6 bullet +3–4, closing paragraph and Step 8 +2–3 |

`setup` will most likely exceed its entry; its entry is then set to the measured size plus at most ten
lines, as `AGENTS.md` prescribes for a measured entry. The stop condition below bounds the growth.

## Affected files

| File                                                            | Description                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/config-migration.md`                                | Table-encoding bullet (≤ 3 rendered lines) naming the retired rows and the safe-default exception; L36–39 clarified; retired-key clause appended to the edge-cases `when:`                                                            |
| `src/shared/config-migration-edge-cases.md`                     | Intro (L3–6) lists the new part; new section "Retired keys": successor mapping, which tools resolve which successors, detect-at-first-read stop, successor-wins report, login-keyed subkeys, `deliver` report-only, `setup` exemption |
| `src/shared/base-branch-resolution.md`                          | Opening-paragraph clause: a `worktree.baseBranch` row without `delivery.baseBranch` stops resolution and names `setup`                                                                                                                |
| `src/shared/config-merge-gate-keys.md`                          | Backcompat paragraph (L47–54) replaced by a two-line retirement statement; intro (L4) and the `conflictResolution` note (L30–32) reworded to match                                                                                    |
| `src/shared/worktree-integration.md`                            | "Config migration" (L95–104) rewritten to the retirement and its repair path; `delivery.enabled` sentence (L89–93) corrected; "existing fallback behavior" (L119) made unambiguous                                                    |
| `src/tools/merge-gate.md`                                       | Fallback restatement (L662–667) replaced by a pointer to the retired-key rule; advisory wording (L699–700, L710) and L627–630 updated                                                                                                 |
| `src/tools/pr.md`                                               | Legacy-fallback phrases at L106 and L120–121 removed                                                                                                                                                                                  |
| `src/tools/apply-issues.md`                                     | Legacy-fallback parenthetical at L279 removed                                                                                                                                                                                         |
| `src/tools/apply-review-remote.md`                              | Legacy-fallback parenthetical at L86 removed                                                                                                                                                                                          |
| `src/tools/setup.md`                                            | Step 2 records the three `worktree.*` rows; Step 6 rewrite extended to them; schema line L80, Express bullet L260, notes L471/L478/L487, L618, L987–989 and Step 8 L1087–1089 updated                                                 |
| `docs/user-guide/configuration.md`                              | L347–350 and L395–402 describe the retirement and the stop; the `delivery` block states the `worktree.*` retirement                                                                                                                   |
| `docs/user-guide/tools-deliver.md`                              | L114: legacy fallback removed                                                                                                                                                                                                         |
| `docs/developer-guide/configuration.md`                         | L208–209 "boolean" corrected; L222–232 describe the retirement                                                                                                                                                                        |
| `docs/developer-guide/skill-ownership.md`                       | L212: "still read for one compatibility generation" corrected to retired                                                                                                                                                              |
| `docs/review/2026-08-31-architecture-and-consistency-review.md` | Status table: F-07 and F-08 recorded as implemented, citing the pull request                                                                                                                                                          |
| `test/workflow-contracts.test.mjs`                              | Fallback assertions at L6501–6513, the test title at L6456 and the advisory pattern at L12285 updated; new retirement tests                                                                                                           |
| `build.mjs`                                                     | `CONTEXT_BUDGET_LINES` entries of every tool whose measured core changed                                                                                                                                                              |
| `evals/merge-gate/results/**`                                   | All four scenarios re-recorded: the change touches files the gate loads                                                                                                                                                               |

## Implementation details

### Approach

1. **Write the rule** as a new "Retired keys" section in `config-migration-edge-cases.md` and list it in
   the fragment's intro:
   - the mapping `worktree.baseBranch` → `delivery.baseBranch`, `worktree.branchPrefix` →
     `delivery.branchPrefix`, `worktree.completion` → `delivery.completion`, and a row whose key begins
     with `prReview.` → the same trailing key under `mergeGate.`;
   - which tools resolve which successors (the table above, reduced to tool names and key families);
   - the detection moment: at the run's first configuration read, before any fetch, branch, worktree,
     commit, push, delegation or merge, for every successor the running tool can resolve;
   - successor absent → stop, naming the retired row, its successor and `effective-flow setup`;
   - successor present → the successor wins; report the inert retired row once;
   - login-keyed `prReview.bots.<login>.*` subkeys through "Matching a configured login"; an
     unresolvable one is reported, not stopped on;
   - `deliver` and a retired `worktree.completion`: reported only;
   - `setup` exempt; a retired value is never read, not even to report what it would have been.
2. **Add the predicate to the core.** One table-encoding bullet in `config-migration.md` of at most
   three rendered lines: the three `worktree.*` keys and "a row whose key begins with `prReview.`" are
   retired, their presence stops a run as the one exception to the safe-default rule, and the contract is
   the deferred building block's. Clarify L36–39 ("non-blocking" means it creates no file and mutates no
   Git). Append the retired-key clause to the existing `lazy-include` `when:` without removing its
   tokens `locator` and `tracker.mode: external`, which the pointer pin at
   `test/workflow-contracts.test.mjs:2034–2046` requires.
3. **Cover `pr`.** Add the `worktree.baseBranch` clause to the opening paragraph of
   `base-branch-resolution.md`, as prose rather than a fourth bullet, and without the literal
   `git fetch`.
4. **Remove every fallback statement** listed under Affected files for `worktree-integration.md`,
   `pr.md`, `apply-issues.md`, `apply-review-remote.md`, `config-merge-gate-keys.md` and `merge-gate.md`.
   Replace rather than delete where a sentence also carries a still-true fact, such as
   `conflictResolution` never having existed under `prReview.*`.
5. **Extend `setup`.** Step 2 item 4 records the three `worktree.*` rows exactly as it records
   `prReview.*` rows. In "Rewriting a legacy `prReview.*` merge-gate block in place", add one bullet
   carrying the three `worktree.*` rows to their `delivery.*` successors under the same carry-over,
   remove-old-rows and shadowed-key rules, and make the closing paragraph (L987–989) say that other runs
   stop or report rather than resolve through a retired row. Update the schema line, the Express bullet,
   the Step 5 notes, Step 6 item 1 and the Step 8 bullet to the retired wording.
6. **Update the docs** listed under Affected files, including the `delivery.prReview` type fix. Record
   F-07 and F-08 in the review document's status table with the pull-request number.
7. **Tests.** In `test/workflow-contracts.test.mjs`:
   - replace the fallback assertions at L6501–6513 with assertions that the block states the retirement
     and no longer instructs reading `prReview.<key>`, and retitle the test at L6456;
   - update the advisory pattern at L12285, which requires "per-key legacy `prReview.*` fallback";
   - add a decidability test: `config-migration.md` names the three `worktree.*` keys and the anchored
     "begins with `prReview.`" form outside any fence, names the safe-default exception, and its
     edge-cases `when:` names the retired-key condition — modelled on "the config locator keeps every
     predicate its own lazy trigger depends on" (L2091);
   - add a contract test over the edge-cases section: detection at the first configuration read and
     "before any fetch, branch, worktree, commit, push, delegation or merge", successor wins with a
     report, login-keyed subkeys, `deliver` report-only, `setup` exempt, the retired value never read;
   - add a test that `base-branch-resolution.md`'s opening paragraph carries the `worktree.baseBranch`
     clause while L8659's three-bullet count and L8992's count still hold;
   - add a test that `setup`'s rewrite section maps each of the three `worktree.*` keys to its
     `delivery.*` successor;
   - add a regression sweep over `src/` covering **both** namespaces: no sentence outside the retired-key
     section pairs a retired key with fallback wording ("fall back", "falling back", "fallback", "still
     read", "legacy value", "Backcompat").
8. **Budgets.** Run `node build.mjs`; set each changed entry to its measured core plus at most ten lines.
   Compare every change with the expected deltas above.
9. **Re-record the merge-gate evals.** The change edits `tools/merge-gate.md`, the eagerly loaded
   `config-migration`, `config-merge-gate-keys` (reached through `iterate`) and two fragments reachable
   through load pointers, so every archived round's build stamp is invalidated and
   `test/merge-gate-eval.test.mjs` fails until the rounds are re-run. There is no re-stamp shortcut.
   Follow `evals/merge-gate/README.md` — which already covers the extra `prepare` after the last run and
   the null-`cwd` disqualification — plus two things it does not state:
   - run the rounds **from the branch under test**, after steps 1–8 are committed there, so the stamp
     binds to the build that contains this change;
   - **delete the stale rounds first**: `prepare.mjs` numbers a new run as the highest existing number
     plus one, and the assertions read every archived run, so an old run left beside the new ones keeps
     failing.

   Each run goes to a fresh agent handed the printed prompt verbatim, from one checkout at a time.
   Budget roughly two hours for the four scenarios.

### Component structure

Not relevant.

### State management

Not relevant — the configuration is read-only on every path except `setup`.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Only `worktree.completion | pr`, run `build`:** stops at its first configuration read, before
  delivery mode determination creates a worktree — not at handback.
- **Only `prReview.botWaitMinutes | 5`, run `merge-gate`:** stops in Phase 0, before any check wait,
  repair delegation or push.
- **Retired row and successor both present with different values:** the successor wins; the run reports
  the inert retired row once; no stop. `setup` later reports it as shadowed and removes it.
- **Retired row present, tool never resolves that successor** (for example `plan`, `investigate`,
  `review`): no stop and no report.
- **`prReview.bots.greptile-apps.check` while `mergeGate.bots` lists `greptile-apps[bot]`:** the same
  reviewer under "Matching a configured login"; the successor is absent, so `merge-gate` stops.
- **`prReview.bots.<login>.trigger` for a login no configured reviewer matches:** reported once; no stop.
- **`deliver` with a retired `worktree.completion`:** reported; `deliver` continues.
- **Transitional JSON configuration** (locator step 3) carrying retired keys: the same rule applies to
  the values read from it; `setup`'s JSON → ADR migration carries unknown keys over, and its in-place
  rewrite then moves them.
- **`applyReview.worktree.*` and the current `worktree.enabled`, `worktree.setup`, `worktree.baseDir`
  keys:** not retired and untouched.
- **`delivery.prReview`:** not retired, not migrated, and not matched, because the predicate is a key
  that **begins** with `prReview.`.
- **A non-interactive delegated run** (for example `merge-gate` → `iterate`) that hits the stop: it stops
  and returns the reason to its caller like any other precondition failure.

### Stop conditions

- **Drift:** before step 1, run `git diff 4321151 -- <every file under Affected files>`. A changed hunk
  inside a cited line range means re-reading that range; a new reader or restatement of a retired key
  means extending the Affected files table before continuing.
- **A resolver outside the table:** if a `src/` file resolves `delivery.baseBranch`,
  `delivery.branchPrefix`, `delivery.completion` or a `mergeGate.<key>` and is not in "Who resolves a
  successor", stop and add it to the edge-cases contract before continuing.
- **Budget:** stop if the core bullet renders to more than three lines, or if any tool's measured change
  exceeds its expected delta above by more than two lines. That is the signal that the rule text grew
  beyond this plan, and it is fixed by shortening the text, not by raising an entry.
- **Tests:** if an existing assertion requires the fallback somewhere step 7 does not list, update it to
  the retired contract; never weaken an unrelated guard to reach green.
- **Eval fixtures:** if a fixture or scaffolded ADR under `evals/merge-gate/` gains a retired row before
  implementation, stop; that scenario's expected outcome changes and must be re-composed.
- **Evals:** if the four scenarios cannot be re-run to five valid runs each, do not open the pull request
  with a failing or skipped eval suite; report the state instead.

## Acceptance criteria

The completion condition is that all of the following hold together:

- [ ] No sentence under `src/` outside the retired-key section pairs `worktree.baseBranch`,
      `worktree.branchPrefix`, `worktree.completion` or a `prReview.` key with fallback wording; the
      two-namespace regression sweep passes.
- [ ] `config-migration.md` names the retired rows in the anchored form outside any fence, names the
      safe-default exception, and its edge-cases `when:` carries the retired-key clause next to its
      existing tokens; the decidability test and the pointer pin at L2034–2046 pass.
- [ ] `config-migration-edge-cases.md` states detection at the first configuration read before any
      fetch, branch, worktree, commit, push, delegation or merge; successor-wins-with-report; login-keyed
      subkeys; `deliver` report-only; the `setup` exemption; and that a retired value is never read. Its
      contract test passes.
- [ ] `base-branch-resolution.md` carries the `worktree.baseBranch` clause in its opening paragraph; its
      test passes, and the tests at L8659 and L8992 still pass.
- [ ] `setup.md`'s rewrite section maps all three `worktree.*` keys to `delivery.*`; the tests at L977,
      L6413 and L6456 and the new mapping test pass.
- [ ] `docs/developer-guide/configuration.md` no longer calls `delivery.prReview` a boolean.
- [ ] Every `CONTEXT_BUDGET_LINES` entry whose tool changed equals its measured core plus at most ten
      lines, each change lies within its expected delta plus two, and `node build.mjs` passes.
- [ ] All four merge-gate eval scenarios carry five valid archived runs against the new build, and
      `test/merge-gate-eval.test.mjs` passes without a skip.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0.

## Validation plan

| Purpose                | Command                                     | Expected result                                               |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Formatting             | `pnpm agent:check`                          | exit 0                                                        |
| Contract tests         | `pnpm test`                                 | exit 0, including the regression sweep and retirement tests   |
| Build, guards, budgets | `node build.mjs`                            | exit 0; every changed tool within its expected delta plus two |
| Distribution layout    | `pnpm test:distribution`                    | exit 0                                                        |
| Eval evidence          | `node --test test/merge-gate-eval.test.mjs` | exit 0, no skipped scenario                                   |

Manual checks, each in a scratch repository with a project-setup ADR:

- only `worktree.completion | pr` → `/effective-flow build "<any small change>"` stops before creating a
  worktree and names `setup`;
- only `worktree.baseBranch | origin/develop` → `/effective-flow setup` Express rewrites the row to
  `delivery.baseBranch` and removes the old one;
- only `prReview.completion | merge` → `/effective-flow merge-gate <PR>` stops in Phase 0 and names
  `setup`.

## Assumptions and open points

- Assumption: no user relies on a `prReview.*` or `worktree.*` row surviving without ever running `setup`.
  The stop names the one-step repair, so the cost of a wrong assumption is one blocked run.
- Out of scope, deliberately: retiring `firmo-` labels, the `**Firmo project setup:**` marker, the legacy
  `Signatur` field or `plan.markerLanguage`; renaming `delivery.prReview`; any change to
  `applyReview.worktree.*`; adding the two missing re-record steps to `evals/merge-gate/README.md`
  (worth a separate small docs change).
- Ordering with the sibling plan
  `2026-09-12-deployment-line-profile-in-guided-setup.md`:
  both edit `src/tools/setup.md` and its budget entry. Whichever lands second rebases and re-measures;
  neither relies on the other's savings.
- Eval cost: the re-record is roughly two hours of wall-clock time and must run from one checkout at a
  time. Another pull request that touches files the gate loads invalidates these rounds again; land this
  change before or after such a pull request, not interleaved with it.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         1 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         1 |    2 |

### Findings

Plan review of 2026-09-12, by an independent read-only reviewer against `origin/develop` at `4321151`,
applying the `effective-delivery` implementation-plan review checklist. Every finding was incorporated
unless marked otherwise.

- **Critical — Error cases — stop timing.** Stopping when a successor is about to be resolved placed the
  stop after writes for late keys (`delivery.completion` at handback, most `mergeGate.<key>` in Phases
  1–3). Incorporated: detection moves to the first configuration read over every successor the tool can
  resolve; edge cases and a late-key manual check added.
- **Important — Architecture — conflict with the safe-default rule.** `config-migration.md` L36–39 and
  L90–92 would let a reader default instead of stopping. Incorporated: the core bullet names the one
  exception; L36–39 clarified; both added to Affected files.
- **Important — Maintainability — budget tolerance.** The previous "more than ten lines over the entry"
  tolerance contradicted "not a raised ratchet". Incorporated: per-tool expected deltas, a three-line cap
  on the core bullet, and a stop at delta plus two.
- **Important — Testability — sweep too narrow.** The sweep covered only `worktree.*` and the grep check
  missed four restatements. Incorporated: two-namespace sweep over fallback wording replaces the grep row;
  the contract test pins the "before any write" clause.
- **Important — Error cases — login-keyed subkeys.** The successor of `prReview.bots.<login>.*` was
  undefined. Incorporated through "Matching a configured login", with unresolvable subkeys reported.
- **Important — Architecture — unanchored predicate.** The anchored "begins with `prReview.`" wording lived
  only under Edge cases. Incorporated into the core bullet and the decidability test.
- **Important — Scope — classification mixes a defect with a retirement.** Not split, with rationale
  under Architecture decisions (one rule, one rewrite, one eval re-record; retirement announced by its own
  documentation). The misquoted `AGENTS.md` paraphrase was corrected, and the PR body and changelog must
  name the stop.
- **Note — Testability — base-branch-resolution pins.** L8659 (exactly three bullets) and L8992 (command
  count) constrain step 3. Incorporated.
- **Note — Maintainability — remaining contradictions.** Edge-cases intro, the user guide's delivery block,
  `worktree-integration.md:119`, the review document's status table and the L6456 test title. Incorporated.
- **Note — Error cases — `deliver` reads completion only to report an override.** Incorporated as
  report-only.
- **Note — Maintainability — eval README gaps.** Not incorporated: recorded as a separate docs change
  under Assumptions; the two README-duplicated re-record steps were removed from step 9.
- **Corrections to claims:** `pr` reaches the core lazily through `chat-language`; `apply-review-remote`
  has no include and is reached through its host; `setup` is expected to rise, not fall; the eval README
  already covers two of the four re-record points. All corrected in the text above.

## Open points

- No open points.

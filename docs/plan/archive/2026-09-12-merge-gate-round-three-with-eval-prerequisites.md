# Merge gate round three with eval prerequisites

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

This is the third slimming round of `src/tools/merge-gate.md` (review finding **F-15** in
[`docs/review/2026-08-31-architecture-and-consistency-review.md`](../review/2026-08-31-architecture-and-consistency-review.md)),
together with the behavioural-eval capability every extraction in this round depends on.

Round two ([2026-09-02-merge-gate-deferring-tool-local-sections.md](2026-09-02-merge-gate-deferring-tool-local-sections.md))
delivered WP3, WP2 and WP1 and took the always-loaded core from 3147 to 2715 lines. The file has
grown back since, and the budget guard now leaves almost no room for the next rule:

| Measure                                            |                                      Value |
| -------------------------------------------------- | -----------------------------------------: |
| `src/tools/merge-gate.md`, source lines            |                                       2087 |
| Always-loaded core, as `node build.mjs` reports it |                                   **2910** |
| `CONTEXT_BUDGET_LINES` entry (`build.mjs:1462`)    |                      2914 — **4** headroom |
| Next largest cores                                 | `iterate` 1656 / 1661, `setup` 1661 / 1662 |
| Share of the summed core of all 28 tools (20240)   |                                     14.4 % |
| Eager include fences                               |                 10, expanding to 901 lines |

The growth from 2715 to 2910 is accounted for: #408 added the eager `chat-language` include
(28 lines), `goal-completion` grew by 6, #407 added 33 source lines and #417 added 134 net source
lines, 113 of them the new `#### The no-check-list waiver`.

The goal of round one and round two is unchanged and governs every decision below: the file gets
shorter **without losing any functionality** — no rule, no guard and no anti-simplification
argument is dropped.

### Planning baseline

- Planned against `origin/develop` at `4321151`, 2026-09-12, read in a detached worktree. The local
  checkout was `538e224`, two commits behind; every line number in this plan is taken from
  `4321151`.
- The local `docs/plan/` held three untracked plans dated 2026-09-12 from a parallel session. One of
  them edits `src/tools/merge-gate.md`; see "Ordering with sibling plans".

### Correction to F-15's target

The review named a long-term target of about 1200 always-loaded lines. **That target is not
reachable** without deferring text every run reads. A merge run with no configured reviewer and green
checks reads roughly: 690 lines of eager fragments needed in Phase 0 or 1, 380 of Phase 0/1 and the
human-comment guard, 110 of Phase 2, 60 of the Phase-4 conditions every run evaluates, 110 of Phase 6
that are not about reviewers, 60 of `## Rules`, 170 of `## Delegation contract` a CI repair needs,
and 400 of remaining contracts and load pointers — about **2050**. Merge-gate-local changes floor at
about 2125; splitting the fragments shared with `iterate` reaches about 1900. This round's target is
**derived** from the packages it takes: about **2745** (2910 − 95 − 42 − 28).

## Architecture decisions

- **The round is merge-gate-local: packages WP-C, WP-D and WP4.** Decided by the operator on
  2026-09-12. Candidates that need shared fragments or a larger harness are deferred with reasons
  below, not dropped silently.
- **The round ships as one branch and one pull request, with one final re-record.** Decided in the
  2026-09-12 deep review. WP0 changes the stub, which is part of every run's build identity
  (`evals/merge-gate/_scaffold/build-identity.mjs:132–136`), so its first commit already invalidates
  every archived scenario and `pnpm test` stays red in CI (`.github/workflows/ci.yml:35`) until the
  re-record. Splitting the round would repeat that re-record per pull request at about four times the
  cost. WP4 stays droppable **within** the branch.
- **WP0 blocks every extraction.** An extraction package is complete only once an eval scenario
  reaches the decision point that loads the text it moves. Round two's "or argue the gap in the
  pull-request body" branch is **withdrawn for extractions**: two of round two's three packages
  shipped through it, which is the evidence that it was the path of least resistance rather than an
  exception.
- **For a region whose only effect is report prose, reaching the loading trigger counts as
  coverage.** Decided for WP-D. The call log records calls and never chat, and the eval plan's
  decision that no assertion reads a run transcript stands; capturing the report would reverse it.
  The content of such a region stays guarded by the text tests.
- **In-place compression is exempt from the coverage rule.** Decided for WP4. The rule protects
  against text moving out of reach of its own trigger, which compression in place cannot cause. WP4
  is guarded instead by a per-passage mapping to the surviving statement and by the existing `near`
  windows staying untouched.
- **A deferred section's entry condition stays inline.** The condition a `lazy-include` fires on must
  be decidable from text that remains loaded — the rule `4947737` established after a deferred
  literal made its own trigger undecidable. It applies to report duties as much as to rules: WP-D
  keeps the receipt-result report inline for exactly that reason.
- **Round two's fragment invariants carry over.** No eager fragment becomes lazy and none is added;
  `delegation-mandate` stays eager; `execution-location` is not added.
- **Sequenced envelopes are selected inside the stub's existing lock, and the log schema does not
  change.** The stub computes `seq` and appends the record inside one `mkdir` lock
  (`remote-tracker.mjs:148–163`); the position of a call within its operation is computed in that
  same locked read. `{seq, operation, apply, at, cwd}` stays exactly as
  `test/eval-fixture-fidelity.test.mjs:396` pins it.
- **No per-scenario configuration.** Dropped in the deep review: no package in this round needs a
  non-default `mergeGate.*` value, and the scaffold's statement that its table is identical for every
  scenario (`scaffold.mjs:114–121`) stays true. It returns with candidate A if that is ever taken.
- **The target is derived, not preset**, and measured only as `node build.mjs` reports it.

### Deferred and rejected candidates

Recorded so a later pass does not re-derive them.

- **A — a configured-reviewer fragment (≈ 600 lines), deferred.** Phase 3 steps 1–6, the bodies of
  conditions 5, 7 and 10, the set-aside confirmation, the unmatched-thread report and most of
  `## Returned outcome record` would load only where `mergeGate.bots` is configured. Three reasons
  against it now:
  1. It saves nothing real on a project that configures a reviewer — including this one
     (`docs/adr/effective-flow-project-setup.md`, `mergeGate.bots | recensor`). Only the build number
     would fall, which is the objection that already withdrew the reviewer advisory in round two.
  2. It is exactly the region no archived eval run executes: every scenario leaves `mergeGate.bots`
     unset.
  3. **Decidability trap.** An unreadable configuration row falls back to a safe default
     (`src/shared/config-migration.md`), and for `mergeGate.bots` that default is `(empty)`. A
     trigger reading "the reviewer list is non-empty" would then silently skip the fragment and the
     whole reviewer round. A future attempt must trigger on "a `mergeGate.bots` row — or a legacy
     `prReview.bots` row, while that read exists — is present at all", following the precedent that
     an unreadable `mergeGate.conflictResolution` resolves to `off`.

  Reopen when the harness grows per-scenario configuration and an `iterate` echo stub with delegation
  attribution, and projects without a configured reviewer are the population the saving is for. A
  configuration-keyed trigger is also the new argument that would lift round two's rejection of
  `## Returned outcome record`: every writer of that closed vocabulary concerns a configured
  reviewer's items, and the CI repair writes no per-item outcome. The CI-repair and whole-run
  `ABORT` rules (`merge-gate.md:561–572`) would stay inline.

- **B — splitting `review-bot-state` (≈ 129 lines) and G — splitting `pr-review-comments` (≈ 85
  lines), deferred.** Both fragments are shared with `iterate` (1656 / 1661), and `tools/iterate.md`
  is hashed into every eval run's identity, so either split invalidates all rounds while no scenario
  exercises `iterate`. B also shares A's trigger trap. Out of the merge-gate-local scope.
- **E — the remainder of Phase 2 step 1 (≈ 15 lines), rejected.** Covering its `BEHIND`/`DIRTY`
  trigger needs a real diverged tree and a reachable origin in the sandbox.
- **F — the Forgejo capability paragraph (≈ 20 lines), rejected.** Covering it needs a complete
  `tea`-shaped fixture set proven against the real normalizer.
- Round two's own rejected list — the unconfigured-reviewer advisory, `## Returned outcome record`,
  `## Wisdom accumulation` and `## Rules` — stands.

### Known limitation, not decided here

With `mergeGate.requireAllChecks: true`, a configured reviewer's own `.check` context counts toward
the Phase-2 check criterion: neither Phase 2 step 4 (`merge-gate.md:1130–1146`) nor
`review-bot-state` excludes it. A pending reviewer check therefore keeps Phase 2 waiting, and Phase 3
observes that reviewer only as **has run** or **not started** — its **running** branch is unreachable
under the default configuration. This round is a refactor and does not change behaviour, so the
question is recorded as a separate finding rather than decided or worked around here.

## Affected files

| File                                                             | Description                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/merge-gate/_scaffold/remote-tracker.mjs`                  | WP0: sequenced envelope selection, computed inside the existing call-log lock (L148–163) and applied in `resolveEnvelope` (L194–209)                             |
| `evals/merge-gate/fixtures/unreported-checks-at-phase-four.json` | New. WP-C's scenario fixture, derived from `merge-proceeds.json`, with a `pr-status-read` sequence and without `servesMerge` or a `pr-merge` entry               |
| `evals/merge-gate/scenarios/unreported-checks-at-phase-four.md`  | New. The prompt and its expected outcome                                                                                                                         |
| `test/eval-fixture-fidelity.test.mjs`                            | WP0: every sequence element proven against `executeOperation`; the concurrency test for sequence positions; the per-element stub test                            |
| `test/merge-gate-eval.test.mjs`                                  | The new scenario in `SCENARIOS` with its outcome assertion and validity rule; `shared/merge-gate-check-list-waiver.md` added to `LOADED_BY_A_RUN` (L149–155)     |
| `evals/merge-gate/README.md`                                     | WP0: sequencing and the validity rule documented; the stale claim that the eval plan is untracked corrected                                                      |
| `evals/merge-gate/results/**`                                    | All five scenarios re-recorded against the final build                                                                                                           |
| `src/tools/merge-gate.md`                                        | WP-C and WP-D extractions with their entry gates and the receipt-result report retained; WP4 compression                                                         |
| `src/shared/merge-gate-check-list-waiver.md`                     | New. WP-C: the waiver rules and their `ask` fence                                                                                                                |
| `src/shared/merge-gate-issue-observation.md`                     | WP-D: the per-issue report items under their own heading at the end of the file; orientation paragraph amended                                                   |
| `test/workflow-contracts.test.mjs`                               | The two waiver `boundedSlice` subjects and the moved Phase-6 slices repointed; a new entry in the merge-gate lazy-pointer battery (L2121)                        |
| `build.mjs`                                                      | `CONTEXT_BUDGET_LINES` entry for `merge-gate` (L1462) lowered to the achieved size                                                                               |
| `docs/developer-guide/build-system.md`                           | The new single-consumer fragment recorded beside the existing five (L460–494), and the description of `merge-gate-issue-observation` (L486–494) updated for WP-D |

## Implementation details

### Approach

One branch, one pull request. Take the work in this order:

1. **Drift gate** — before anything else.
2. **WP0** — sequenced envelopes, the validity rule, and a first recording of the new scenario.
3. **WP-C** — defer the waiver body.
4. **WP-D** — move the per-issue post-merge report items.
5. **WP4** — compress the delegation-contract rationale in place; droppable.
6. **Teeth probe** — behavioural evidence that the WP-C pointer fires.
7. **Final re-record** of every scenario against the final build.

Commits are ordered by package so each stays reviewable on its own, but no package is delivered
alone.

### Drift gate

- Run `git diff 4321151 -- <every file under Affected files>`. A changed hunk inside a cited range
  means re-reading that range before relying on it.
- Run `node build.mjs`. If `merge-gate`'s core is no longer 2910, re-derive every package estimate
  from the current file rather than from this plan.

### Ordering with sibling plans

- [`2026-09-12-retire-legacy-worktree-and-prreview-config-reads.md`](2026-09-12-retire-legacy-worktree-and-prreview-config-reads.md)
  edits `merge-gate.md` (L627–630, L662–667, L699–700, L710) and the eagerly loaded
  `config-migration`, and re-records the evals. **Land it before this round**, or rebase this branch
  onto it afterwards; never interleave two eval re-records. If this round lands first, that plan's
  re-record covers five scenarios instead of four.
- [`2026-09-12-deployment-line-profile-in-guided-setup.md`](2026-09-12-deployment-line-profile-in-guided-setup.md)
  edits `setup.md` only and states that no merge-gate eval run loads it. No interaction.

### WP0 — Sequenced envelopes and the validity rule (harness, blocking)

**Why a new scenario is needed at all.** The existing `unreported-checks-block-merge` scenario never
reaches the waiver's decision point: all five of its archived runs end in Phase 2, with two status
reads and each guard surface read once. Its scenario text nevertheless says precondition 2 is the
only thing standing between the run and a merge. That wording is misleading and is recorded as a
follow-up; this plan does not fix it.

The stub answers by operation name alone (`remote-tracker.mjs:194–209`), so a status read cannot
differ between Phase 2 and Phase 4. Sequencing removes that limit.

1. **Sequenced envelopes.** An operation entry may declare an ordered list of envelopes under a new
   field name distinct from `providers` — which already means "one response per command inside a
   single call" (`test/eval-fixture-fidelity.test.mjs:52–72`). The n-th call of that operation in a
   run receives the n-th element.
   - **Compute n inside the lock that computes `seq`**, from the content read immediately before the
     append: the number of prior records of that operation, dry runs and applies alike. `recordCall`
     returns it, and envelope selection uses that value. Today selection happens after `recordCall`
     returns and outside the lock (`remote-tracker.mjs:239–258`); the position must not be recomputed
     there.
   - **Fail closed for a sequenced entry.** `recordCall` currently swallows errors and, when the lock
     times out, appends without it (L153–156). That fallback is tolerable for `seq` only because a
     duplicate `seq` fails the schema assertion; a duplicated sequence position would fail nothing.
     For a sequenced entry, an unobtainable lock, an unreadable log or a failed append returns an
     error envelope — never element 1 and never an unlocked append.
   - **Exhaustion is stated per entry.** A call beyond the last element fails loudly unless the entry
     declares that the last element repeats. There is no silent default.
   - **Proof.** Every element passes the fidelity suite against the real `executeOperation`. A new
     concurrency test spawns N parallel calls of a sequenced operation carrying N distinct elements
     and asserts the served envelopes are exactly those N elements, each once — unique `seq` values
     alone do not prove this. The stub test that calls each operation once (L222) walks every element
     of a sequenced entry. The pinned log schema does not change.
2. **Read-count measurement.** Count the `pr-status-read` records before the first `pr-merge`, or to
   the end of the log, in every archived run of `merge-proceeds` and `guard-blocks-merge`. Measured at
   `4321151`: `merge-proceeds` 3, 3, 3, 3, 3; `guard-blocks-merge` 3, 3, **2**, 3, 3. Run 3 of
   `guard-blocks-merge` served the Phase-2 step-4 re-read and the Phase-4 fresh read with one status
   read. State the measurement in the pull-request body.
3. **Validity rule.** Because agents may merge those two reads, a scenario whose sequence flips at a
   given position needs a rule for the run that never reaches that position in time. For
   `unreported-checks-at-phase-four`: **a run is valid only if the `pr-status-read` that was served the
   `checksReported: false` element precedes that run's second read of the guard surfaces** (review
   threads, pull-request comments, submitted reviews). An invalid run is discarded and redone, exactly
   as a run with a `cwd: null` record is. The rule is derived from the log order alone, asserted in
   `test/merge-gate-eval.test.mjs`, and documented in `evals/merge-gate/README.md` beside the
   existing discard rules. It separates cleanly from the dangerous failure: a regression that merges
   on an unreported list does so **after** the flipped read, so its run is valid and fails the
   assertion.
4. **First recording of the new scenario.** Before WP-C touches `merge-gate.md`, record five valid runs
   of `unreported-checks-at-phase-four`. Their purpose is to prove that the harness reaches Phase 4 on
   this path and that the sequence position holds across runs — not to measure a difference, because
   the log is identical whether or not the waiver fragment exists (see WP-C). Commit those runs, then
   delete them before the final re-record.
5. **Document** sequencing and the validity rule in `evals/merge-gate/README.md`, and correct its claim
   that the eval plan is not tracked; it is, since #399.

**Stop:** if one scenario needs more than five discarded runs to reach five valid ones, stop the round
for a decision. The validity rule is then hiding a pattern rather than absorbing variance.

### WP-C — Defer the no-check-list waiver body (≈ 95 lines)

`#### The no-check-list waiver` spans `merge-gate.md:1731–1842`: the heading, an opening paragraph
(L1733–1739), eleven rule bullets (L1741–1831) and its `ask` fence (L1833–1842).

Move the rule bullets and the `ask` fence into the new single-consumer fragment
`src/shared/merge-gate-check-list-waiver.md`, under a heading of their own so every repointed slice
targets that heading and never the fragment's orientation paragraph — the WP1 lesson, where the
orientation restated the retained gate and would have satisfied assertions about the core.

**Retain inline:**

- the heading, and the opening paragraph compressed to an entry gate of at most four lines stating
  when the question can arise;
- condition 2's clause naming the waiver (L1324–1335);
- Phase 2's unreported-list rule (L1164–1167);
- the wisdom bullet (L758–765), because wisdom is recorded from the start of the run;
- the Phase-6 item for a merge on a waived check list (L1938–1945).

These five are the only references to the waiver outside L1731–1842 (verified in the deep review).

**Trigger:** the pointer's `when:` fires when a Phase-4 evaluation's fresh read states
`checksReported: false`. It is deliberately broader than the `ask` fence's own `when:` (L1834),
because every branch that does **not** pose the question lives inside the moved text too — report
mode, a non-interactive run, another unmet condition, a verified head that is not a full object name,
and an evaluation the waiver record already covers. The condition is decidable from condition 2's
retained clause (L1325) and the Phase-4 read itself.

**Scenario — `unreported-checks-at-phase-four`.** Derived from `merge-proceeds.json` with these
changes, and no others:

- `pr-status-read` becomes a sequence: a reported, green check list for the first two reads, and
  `checksReported: false` from the third read on, declared to repeat;
- `servesMerge` is **omitted**, so the stub's default refusal applies
  (`remote-tracker.mjs:57–59, 249–256`), and the `pr-merge` entry is **removed**. Inheriting either
  would let the stub serve a canned merge success on a regression.

The run is non-interactive, so the waiver cannot be posed and the gate must block and report. With
three status reads the run reaches Phase 4 and blocks on condition 2 (traced in the deep review).
Assert, over valid runs: no `pr-merge` record; the guard surfaces read a second time (the existing
refusal proxy); and the flipped read present.

**Realism, stated exactly.** Fidelity is proven **per envelope**: each element is one the real
normalizer emits. Nothing proves that the sequence as a whole — a check wait and a status read
reporting a green check, then a status read at the same head reporting none — is something a real
forge produces. Condition 2's own text anticipates a status response that comes back empty at
Phase-4 time (L1331–1335), which is the case this scenario composes.

**What the scenario proves, and what proves the rest.** The scenario discriminates the **dangerous**
failure — a merge on an unreported check list — because such a valid run leaves a `pr-merge` record.
It does not by itself discriminate a waiver fragment that never loads: condition 2's retained clause
blocks either way, so the log is identical. That second question is answered by the teeth probe
below, which is the only behavioural evidence that the pointer fires, and by the battery entry and
the text tests.

**Tests.**

- Repoint only the two assertions whose subject moves: `boundedSlice(gate, '#### The no-check-list
waiver', '\n### Phase 5')` at `test/workflow-contracts.test.mjs:10456` and `:10643`.
- **Leave `:10601`, `:10746` and `:10751` untouched.** Their subjects are condition 2
  (`mergeCondition(…, 2)`, L10458) and `## Wisdom accumulation` (L10644), both retained inline;
  repointing them at the fragment would either fail or stop guarding the core.
- Five Phase-4 slices exist — the `mergeConditionsAndTail` helper at L210, and L5002, L5035, L9768
  and L12386. None asserts waiver text, and they narrow back as the waiver leaves; confirm each still
  passes against its subject.
- No raw `indexOf` lookup of the `header: Checks` fence exists (verified); nothing further to move.
- Add the new pointer to `every merge-gate lazy pointer names the decision point that loads it`
  (L2121), pinned by the tokens `Phase-4` and `checksReported: false`.
- Add `shared/merge-gate-check-list-waiver.md` to `LOADED_BY_A_RUN` in
  `test/merge-gate-eval.test.mjs` (L149–155). The build identity derives it automatically
  (`build-identity.mjs:188`); the membership assertion covers only listed files.

Record the fragment in `docs/developer-guide/build-system.md` as the sixth single-consumer fragment.

### WP-D — Move the per-issue post-merge report items into the observation fragment (≈ 42 lines)

Phase 6 step 2 carries four bullets describing what Phase 5.5 observed (`merge-gate.md:1954–2006`).
**Only part of the first bullet may move.**

**Why the receipt result stays.** A merge with a missing or invalid lifecycle receipt ends Phase 5.5
at L1864–1865, **before** the `lazy-include` pointer at L1867–1870, so the observation fragment is not
loaded in that run — deliberately so, as the fragment's orientation (`merge-gate-issue-observation.md:4–9`)
and `build-system.md` both record. Yet L1954 requires "after a confirmed merge, the lifecycle receipt
result" for **every** confirmed merge, receipt or not, and no other inline text carries that duty:
Phase 0 (L818–819) covers only already-merged legacy pull requests, and the wisdom bullet (L798) only
records the result. Moving it would make the report duty unreachable on the most common merge path —
the circularity class this round exists to avoid. No eval could catch it, because `merge-proceeds`'
post-merge `pr-read` keeps reporting the pull request open.

**Retain inline in Phase 6:**

- a short item: "after a confirmed merge, the lifecycle receipt result — absent, invalid, or valid";
- directly after it, one item: "and, where Phase 5.5 observed linked issues, the items listed under
  `### Observation report items` in the loaded observation fragment";
- Phase 6 step 3's row selection (L2020–2026) and Phase 5.5's entry gate (L1862–1865).

**Move** into `src/shared/merge-gate-issue-observation.md`:

- the per-issue observation rows of the first bullet (L1954–1965, without the receipt-result clause);
- the partial-transition item (L1966–1970);
- the completion-verdict item (L1971–1986);
- the recorded-open-points item (L1987–2006).

Place them under a new `### Observation report items` heading **at the end of the file, after the
closing `Issue done` `ask` fence**. `section(fragment, '### Observation steps')` stops at the next
`### ` heading (used at `test/workflow-contracts.test.mjs:7046–7898`); a heading placed earlier would
cut that fence out of every such slice. Amend the fragment's orientation paragraph to say it now also
carries the report items.

**Fix the one cross-reference that would dangle.** The completion-verdict item says it reads no body
"for the same reason the guard item above reads none" (L1978); that guard item (L1904–1916) stays in
Phase 6. In the fragment, name it explicitly as Phase 6's guard-exclusion item.

**No new pointer.** The per-issue items are reported only for issues Phase 5.5 observed, and any run
that observed one reached the pointer. The receipt result, which a run can owe without reaching it,
stays inline.

**The quoting exception travels verbatim.** The open-points item is the single Phase-6 item that quotes
issue text, bounded to at most twenty entries per issue and 500 characters each. Those bounds and the
inert-rendering rule move with it unchanged.

**Coverage.** Under the report-prose rule, `linked-issue-open-points` enters Phase 5.5 in all five
archived runs (each contains `issue-state-wait`). The moved content itself is unobserved by the log.
The real runtime saving occurs only on runs that do not enter Phase 5.5 with a valid receipt.

**Tests.** Repoint the Phase-6 slices whose subject moved, and the open-points pins #407 added, to the
new heading; do not let the fragment's orientation paragraph satisfy them. Count them during
implementation — the analysis found five or six such slices — and list each in the pull-request body.
Update `docs/developer-guide/build-system.md`'s description of `merge-gate-issue-observation`, which
currently describes only "its seven steps and the transition gate" (L486–494).

### WP4 — Compress `## Delegation contract` rationale in place (≈ 28 lines, droppable)

Adopted from round two, whose WP4 this package supersedes. The section spans `merge-gate.md:227–449`.
The five candidate passages total 46 lines, but tests pin wording in three of them, so the realistic
saving is about **28**. Per passage:

| Lines    | Passage                                                       | Constraint                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L327–335 | absence-check scope argument                                  | keep `sender's own occurrences are not a collision` within 200 characters of `they are the framing`, and `` `Boundary token:` declaration line `` within 200 of `separator line` (tests at L11265–11271)                                  |
| L349–361 | minted token versus an introducer grammar                     | keep "No sequence of characters a body can contain changes how it is framed", and `substring search` within 400 of `occurs in none of them` (L11340–11350)                                                                                |
| L363–371 | token versus a declared byte count                            | keep `unforgeability` within 400 of `fixed from outside the span`, and the `multibyte Unicode` window (L11361–11369)                                                                                                                      |
| L390–400 | four grounds for summary-comment suppression                  | keep the literal `Summary comment: suppressed` and "mandatory" (L4960–4969); the grounds may shrink to a reference to "PR review comment integration", whose eagerly included `pr-review-comments.md:154–163` states them almost verbatim |
| L429–432 | why the review-guard line is not derived from the item filter | no test pins it                                                                                                                                                                                                                           |

Keep every exact literal form, every count and refusal rule, and the block "The three caller-supplied
body cases, stated together" (L442–449) verbatim. A passage whose compression pushes any `near` window
out of range is restored and dropped from the package; the test is never widened.

### Teeth probe

On the post-WP-C build, in a scratch copy of the sandbox skill root, sabotage the moved waiver rule
**inside `merge-gate-check-list-waiver.md`** so the waiver authorizes a merge without an answer. Run
`unreported-checks-at-phase-four` at least **three** times against it. A `pr-merge` record appears only
if the agent actually loaded the fragment, so this is the behavioural evidence that the pointer fires.
Archive these runs outside `evals/merge-gate/results/`, so the scenario assertions never read them,
and state their outcomes in the pull-request body.

### Final re-record

WP0 changes the instrument, and WP-C, WP-D and WP4 change files the gate loads, so every archived
round is invalidated. Re-record all five scenarios — the four existing ones plus
`unreported-checks-at-phase-four` — at five valid runs each:

- run the rounds **from the branch under test**, after every source change is committed there;
- **delete the stale rounds first**, including the WP0 first recording, because a new run is numbered
  after the highest existing one and the assertions read every archived run;
- call `prepare` **six** times for five runs;
- discard and redo any run with a `cwd: null` record, one that called a shipped helper operation its
  fixture does not define, and — for the new scenario — one that fails the validity rule;
- hand each prompt verbatim to a fresh agent, from one checkout at a time.

### Edge cases

- **Budget headroom is 4 lines.** Any unrelated change landing first can push the core past its
  entry; the drift gate re-measures rather than trusting this plan's numbers.
- **Sequence exhaustion.** A run that reads `pr-status-read` more often than the fixture declares
  either fails loudly or receives the declared repeated element — never an arbitrary one.
- **Concurrent stub processes.** Calls issued in one shell command must not receive the same sequence
  position; the position is computed under the lock or the call fails closed.
- **A merged read.** A run that serves the Phase-2 re-read and the Phase-4 read with one status read is
  invalid under the validity rule and redone, not counted as a pass or a failure.
- **`boundedSlice()` requires its stop marker**, and an unchanged `section()` cut can silently widen
  rather than fail — round two found both. Check every repointed slice's subject.
- **A fragment's orientation paragraph** can satisfy an assertion about the text that stayed behind;
  target the dedicated heading.
- **A heading added to a fragment** ends every `section()` slice that runs into it; place new headings
  after the content existing slices cover.
- **`## Wisdom accumulation` stays after the `runtime-state-safety` pointer** in source order, which
  `findRuntimeStateSafetyViolations` enforces.
- **Phase 4 keeps at least ten numbered conditions**; `mergeCondition()` selects by ordinal.
- **No sliced heading is renamed**; `section()` fails hard on a missing heading.

## Acceptance criteria

The completion condition is that all of the following hold together:

- [ ] The drift gate ran, and its result is stated in the pull-request body.
- [ ] Sequenced envelopes: the position is computed inside the call-log lock, a sequenced entry fails
      closed when the lock or the log is unavailable, the field name is distinct from `providers`,
      exhaustion is explicit per entry, every element passes the fidelity suite, a concurrency test
      proves N parallel calls receive exactly N distinct elements, and the pinned log schema is
      unchanged.
- [ ] The read-count measurement for `merge-proceeds` and `guard-blocks-merge` is stated in the
      pull-request body, and the validity rule is asserted in `test/merge-gate-eval.test.mjs` and
      documented in `evals/merge-gate/README.md`.
- [ ] No scenario needed more than five discarded runs to reach five valid ones, or the round stopped
      for a recorded decision.
- [ ] The WP0 first recording of `unreported-checks-at-phase-four` holds five of five valid runs on the
      build before WP-C, and is committed before being deleted for the final re-record.
- [ ] WP-C: the waiver rules and fence live in `src/shared/merge-gate-check-list-waiver.md`; the five
      retained items are verified by grep in the **built** core; the pointer is pinned in the battery;
      the fragment is listed in `LOADED_BY_A_RUN`; `:10601`, `:10746` and `:10751` are unchanged.
- [ ] WP-D: the receipt-result item stays in Phase 6 and is verified by grep in the **built** core; the
      four per-issue items live under `### Observation report items` after the `Issue done` fence; the
      dangling cross-reference names Phase 6's guard-exclusion item.
- [ ] WP4, unless dropped: every compressed passage is mapped to its surviving statement in the
      pull-request body, and no `near` window was changed.
- [ ] The teeth probe ran at least three times on the post-WP-C build with the sabotage inside the
      fragment, recorded a `pr-merge` in every run, and is archived outside
      `evals/merge-gate/results/`.
- [ ] `merge-gate`'s core, as `node build.mjs` reports it, is lower than 2910, and each package's
      estimate, measured saving and deviation are stated. A shortfall of more than 25 % against a
      package's estimate stops the round for a decision.
- [ ] The `merge-gate` entry in `CONTEXT_BUDGET_LINES` equals the achieved core plus at most ten
      lines, per `AGENTS.md`.
- [ ] The eager include set is unchanged, `delegation-mandate` is eager, and `execution-location` is
      not included.
- [ ] Every moved or deleted source line is mapped to the surviving statement of its rule.
- [ ] After every commit: `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution` and
      `node --test test/workflow-contracts.test.mjs` pass; `pnpm test` passes except for the eval
      build-stamp assertions until the final re-record.
- [ ] On the final build: all five scenarios carry five valid runs, `unreported-checks-at-phase-four`
      and `linked-issue-open-points` among them, and `pnpm test` passes with no skipped scenario.

## Validation plan

| Purpose                      | Command                                           | Expected result                                        |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Formatting                   | `pnpm agent:check`                                | exit 0                                                 |
| Contract tests               | `node --test test/workflow-contracts.test.mjs`    | exit 0 after every commit                              |
| Fixture fidelity and harness | `node --test test/eval-fixture-fidelity.test.mjs` | exit 0, including the sequencing and concurrency tests |
| Build, guards, budget        | `node build.mjs`                                  | exit 0; merge-gate core reported below 2910            |
| Distribution layout          | `pnpm test:distribution`                          | exit 0                                                 |
| Eval evidence                | `node --test test/merge-gate-eval.test.mjs`       | exit 0, no skipped scenario, after the final re-record |
| Full suite                   | `pnpm test`                                       | exit 0 after the final re-record                       |

Beyond the commands:

- **Prove behaviour invariance from the built output**: for each moved region, show that `merge-gate`
  still reaches it — inline or through a pointer the lazy closure ships — in all three targets.
- **Adversarially verify the new trigger**: remove the WP-C pointer, confirm the fragment is unshipped
  and a test fails, then restore from a `cp` snapshot.
- **Run the teeth probe** as specified above.
- **Diff the built `dist/` tree** against a build of the parent commit and account for every changed
  file.

## Assumptions and open points

- Assumption, measured rather than believed: most runs read the pull-request status three times before
  Phase 4 on this path, and the minority that merge two reads are absorbed by the validity rule. The
  stop condition in WP0 decides whether that holds for the new scenario.
- Out of scope, deliberately: deciding the known limitation above; the misleading "only thing
  standing" wording in `unreported-checks-block-merge`; the eval plan's unimplemented WP3, WP5 and
  the unfinished halves of WP4 and WP6, and its stale status line; archiving round two's plan, whose
  WP4 this plan supersedes; the review document's implementation-status table.
- Eval cost, in wall-clock time: the WP0 first recording (five runs, about half an hour), the teeth
  probe (at least three runs, about a quarter of an hour), and the final re-record of five scenarios
  (about two hours).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Scope, Important — per-scenario configuration has no consumer in this round.** WP-C, WP-D and WP4
  need only sequenced envelopes. Kept, because the operator chose it as part of WP0 on 2026-09-12, but
  made an independently droppable sub-step. The driver it would serve is the configured-reviewer
  scenario that candidate A needs; without A it is infrastructure ahead of demand.
- **Testability, Important — WP-C's scenario discriminates one failure direction only.** A merge on an
  unreported check list is caught; an unreachable waiver fragment is not, because the retained clause
  blocks either way. Incorporated: stated in WP-C, and the benign direction assigned explicitly to the
  battery pin and the text tests.
- **Testability, Important — a sequence position depends on how often an agent reads.** Runs vary, and
  the five-of-five bar makes variance a finding. Incorporated as the determinism gate, with a stop and
  the two alternatives named.
- **Error cases, Important — four lines of budget headroom, and a sibling plan editing the same file.**
  Incorporated as the drift gate and the ordering with the retirement plan.
- **Testability, Note — WP-D's content is unobserved by any eval.** Accepted by operator decision; the
  trigger-reached rule and its limit are stated in the architecture decisions.
- **Scope, Note — a behaviour question surfaced during analysis.** Recorded as a known limitation, not
  decided inside a refactor.
- **Maintainability, Note — the re-record costs about two hours.** Batched into one final round, with
  one earlier recording of the new scenario only.

### Deep review, 2026-09-12

An independent reviewer checked the plan against `4321151` and found that it should not be
implemented as first written. Eleven findings were incorporated directly and three were put to the
operator as decisions. **This subsection supersedes the first-pass findings above wherever they
conflict**: the per-scenario configuration is dropped, the determinism gate is replaced by a
measurement plus a validity rule, and the teeth probe is now the behavioural evidence for the WP-C
pointer. The first-pass findings are kept because earlier passes stay readable.

**Result:** Approved — the critical finding was incorporated, all three decisions were taken, and no
blocking open point remains.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         4 |    2 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         1 |    2 |

- **Architecture, Critical — WP-D made the receipt-result report unreachable (incorporated).** A merge
  with a missing or invalid receipt ends Phase 5.5 before the pointer, so the fragment never loads in
  that run, while L1954 requires the receipt result after every confirmed merge and no other inline
  text carries it. The receipt-result item now stays inline and only the per-issue items move; the
  estimate falls from ≈ 45 to ≈ 42.
- **Testability, Important — the determinism gate measured the wrong runs (decided).** `merge-proceeds`
  showed three status reads in all five runs, but `guard-blocks-merge` run 3 — the same Phase 1–4
  path — merged two reads into one. A run served that way never reaches the flipped element and
  would merge correctly while the assertion reported the dangerous failure. No distinguishing earlier
  call exists to select by. Decided: measure both scenarios and adopt a validity rule derived from the
  log order, documented beside the `cwd: null` rule, with a stop above five discards.
- **Error cases, Important — the derived fixture would inherit `servesMerge` (incorporated).** The
  fixture now omits it and removes its `pr-merge` entry, so the stub refuses a merge on a regression.
- **Testability, Important — "race-safe the way `seq` is" was not buildable (incorporated).** The
  envelope is chosen outside the lock, and the lock timeout falls back to an unlocked append that only
  `seq`'s schema assertion makes tolerable. The plan now requires the position computed inside the
  lock, a fail-closed error for sequenced entries, a field name distinct from `providers`, an
  N-distinct-element concurrency test, and a per-element stub test.
- **Testability, Important — three named test repoints targeted retained text (incorporated).**
  `:10601`, `:10746` and `:10751` assert condition 2 and `## Wisdom accumulation`, both inline. Only
  `:10456` and `:10643` move. The Phase-4 slice count is five, not four, and none asserts waiver
  text.
- **Scope, Important — the re-record strategy contradicted itself (decided).** One final re-record,
  "independently shippable" packages and per-package five-of-five criteria could not all hold, and
  WP0's instrument change turns CI red from its first commit. Decided: one branch, one pull request,
  one final re-record; the per-package criteria now read "on the final build".
- **Maintainability, Important — WP4's ≈ 45 was not reachable (incorporated).** Tests pin wording in
  three of the five passages; the realistic saving is ≈ 28, now stated with the pinned phrases per
  passage. The round target moves from ≈ 2725 to ≈ 2745.
- **Testability, Important — the teeth probe does discriminate a loaded fragment (incorporated).** A
  sabotage placed inside the fragment yields a `pr-merge` only if the agent loads it, so it is the
  behavioural evidence for the pointer. Now specified on the post-WP-C build, at least three runs,
  archived outside the results directory; the earlier "cannot discriminate" claim is narrowed to the
  scenario alone.
- **Maintainability, Note — a dangling cross-reference and a heading placement (incorporated).** The
  moved verdict item's "the guard item above" is named explicitly, and `### Observation report items`
  goes after the `Issue done` fence so existing `### Observation steps` slices keep it.
- **Maintainability, Note — two registration gaps (incorporated).** `build-system.md`'s description of
  `merge-gate-issue-observation` and `LOADED_BY_A_RUN` are added to the affected files.
- **Scope, Note — the existing scenario's wording (incorporated).** `unreported-checks-block-merge`
  ends in Phase 2 in all five runs; that is now cited as WP-C's motivation, and its misleading scenario
  text is recorded as out of scope.
- **Scope, Note — per-scenario configuration (decided).** Unspecified key source, dependency on an
  unlanded plan's retired-key list, and no consumer. Decided: dropped.
- **Testability, Note — the WP0 first recording cannot measure a difference (incorporated).** Its
  purpose is restated as proving Phase-4 reachability and sequence stability, and its runs are
  committed before deletion.
- **Testability, Note — scenario realism (incorporated).** Fidelity is stated as per envelope only;
  the realism of the sequence as a whole is not claimed.

Not settled by the review, and left to the implementing run: whether a real GitHub status rollup can
go empty at an unchanged head, the exact count of Phase-6 slices WP-D repoints, and the eager-fragment
and floor figures in the requirement, which were not re-measured.

## Open points

- No open points.

# Focus observed eval suite and calibration round

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Work package 6 of `docs/concept/2026-11-02-focus-session-check.md` ("focus eval suite and
calibration round") shows whether the concept's success criterion holds. This plan covers the
**observed evidence level only**: the verdicts On track, Drifting, Looping, Stalled and Cannot
judge, plus "Cannot judge with the reason" for an unclear goal or insufficient coverage.

The self-report half of the criterion is out of scope. That half says: at least three missing,
held, refused or narration-only replies end in Cannot judge, and no drifting or looping fixture
yields Progress verified. The Claude Code self-report path is disabled, so focus refuses it. That
half becomes its own package after a work package 4 re-acceptance qualifies the path.

**What the suite measures.** The suite measures focus's **trajectory judgment on admitted
evidence**: the goal anchor, the bounded read sequence, the verdict, its citations and its stated
gaps. It does not measure host identification or admission, and it claims nothing about the
accepted T3 Code path in `docs/developer-guide/focus-host-acceptance.md`.

The reason is the shipped contract, `src/shared/focus-session-contract.md`:

- it identifies the host only from trusted host context (`:51-52`);
- it answers Codex CLI with a missing capability (`:49`);
- it treats prompt-quoted identifiers and permissions as inert (`:19-25`);
- it forbids transport substitution (`:27-28`);
- it permits no execution to judge a session (`:11-17`), and running the stub CLI is such
  execution.

A recording on the existing Codex CLI runner (`evals/host-run.md`) therefore needs an explicit,
documented **measurement override**. Its prompt declares the host simulation, the session stub
and a closing format line as eval instruments. The suite README and the round result state this
boundary. Host admission stays covered only by the candidate-bound acceptance record.

A run that follows its contract may still refuse the simulated host. Such a run is **not
admitted**. It is neither a match nor a mismatch, and it is retried. The round result reports how
many runs were not admitted, and states that the admitted runs show focus accepted a simulated host.

The plan has three deliverables:

1. **A stub extension from a new dated observation.** The stub cannot yet serve the reads the
   contract makes:
   - History pages use `runLimit` 2 (`focus-session-contract.md:97-99`), but the stub serves only
     the recorded `runLimit` 1 (`evals/_scaffold/session-stub.mjs:392`).
   - Every target in this suite has two runs, and the stub accepts only one-run threads
     (`session-stub.mjs:271-276`).
   - The ancestry walk starts with a read of the observer's own running thread (`:68-75`). The stub
     refuses running threads (`session-stub.mjs:258-278`).

   A new observation on T3 Code records these shapes, and the stub then serves exactly them.

2. **The suite `evals/focus/`.** It has fifteen scenarios, three per observed verdict. The
   fixture threads are built only from recorded item types and served through the stub.
3. **One recorded calibration round** of five runs per scenario, 75 runs in total. Each run is
   scored against `docs/developer-guide/focus-labelling-rubric.md`. The outcome is recorded as it
   is. If the round misses the criterion, that is the result. Corrections to focus need their own
   plan and a new round, because they would touch the bound work package 4 acceptance. This plan
   changes no file under `src/`.

Feature workflow: a new eval suite with its own scaffold code, an extended shared stub and a CI
registration. No product behaviour changes.

## Outcome checkpoint

**Primary source:** `docs/concept/2026-11-02-focus-session-check.md`, work package 6, repository
`sebastian-software/effective-flow`, base `origin/develop`
**Original outcome:** a focus suite that `pnpm eval focus verify --mode strict` reports as current,
with one published round scored against the observed half of the concept's success criterion and
the result recorded; no `src/` change, no other suite's evidence staled
**Last evaluated attempt:** 2026-11-04 `effective-flow build`, initial implementation: Approach steps 1
to 5 done on the plan pull request; step 6 not run, because the implementing host is Linux x86_64
and cannot record
**No-progress count:** 0
**Cumulative approach:** observation, stub extension, rubric amendment, labels and fixtures, and the
focus suite with CI registration; no round recorded
**Continuation decision:** Continue within authority: the maintainer records the 75-run round on the
macOS aarch64 recording host per `evals/focus/README.md`, then completes step 7; allowance 1,
remaining 1; stop when the recording host is unavailable or the round is not measurable

## Architecture decisions

### Observation and stub

- **Observe, then extend; never widen by assumption.** New behaviours come only from a dated
  addendum, `docs/developer-guide/focus-session-shape-observations-2.md`, dated on the run date.
  The first addendum stays unchanged, per its own rule (`focus-session-shape-observations.md:10-11`).
  A behaviour that was not observed keeps `recorded: false` and keeps answering `unrecorded`.
- **The observation set, fixed in advance.** The setup is one throwaway top-level thread with
  exactly two completed runs: a launch, then one follow-up turn, each waited to completion. The
  set has three parts:
  - **(a)** `runLimit` 2 reads of that thread with the contract's history limits (`limit` 10,
    `maxCharsPerItem` 1,500) in both views, including one `afterPosition` page. Recorded: the
    `recentRuns` key set and order, and item positions across the two runs.
  - **(b)** `runLimit` 1 reads of the same two-run thread, both as the state read (activity,
    `limit` 1, `maxCharsPerItem` 256) and as an `itemId` and `textOffset` continuation read.
    Recorded: which run `recentRuns` serves, and whether `runCount` reports 2.
  - **(c)** The contract's smallest read form on the observer's own running top-level thread.
    Recorded: `status`, `activeRunId` and the relationship fields. If the orchestrating thread
    turns out to have a parent, the observation stops and reports it. The fixtures assume a
    top-level observer.

  The record keeps only key names, enum values, positions and outcomes. Ids, `title`, `branch`,
  `worktreePath`, `link` and all content are discarded. The record also captures the T3 Code server
  version and the provider. If they differ from the first addendum (`0.1.6`, `claudeAgent`), the
  addendum says so and the stub serves the new behaviours only under their own entries.

- **Behaviour entries are booleans, so new values get new entries.** Examples are `runLimitTwo`,
  `runCountTwo` and `runningObserverStateRead`. `runLimitAboveOne` and `runCountOtherThanOne` stay
  false and now mean "any other value".
  - The shapes module equals the first block merged with the second by entry `name`. A
    second-block entry with the same name overrides the first; there is no other merge rule.
  - `test/session-stub.test.mjs` asserts that merge.
- **The stub serves a running thread only in read form (c), and only for a thread the fixture
  marks as the observer.** The stub refuses a running thread in any other read form and refuses
  any running target. Every fixture observer is top-level, so the ancestry walk is one running read
  plus nothing else.
- **No fixture uses an item type outside the recorded set**: `user_message`, `assistant_message`,
  `command_execution` and `reasoning`. Sub-agents, approvals and blocker waits appear only as text
  of those types, for example a parent's message saying it spawned a worker. This keeps the stub's
  `unobservedItemType` refusal unchanged.

### Suite structure

- **The suite mirrors `evals/next-steps/`.** It has `suite.config.mjs`, a name-only
  `scenario-registry.mjs` outside the hash, `scenarios/*.md`, `fixtures/*.json`, `results/`, and a
  suite-private `_scaffold/` with `setup.mjs` and `evaluate.mjs`.
- **`expectedProfile` pins the next-steps profile at implementation time.** That profile is
  codex-cli, `gpt-6.1-sol`, high effort, its tool policy and its reported version. The README
  states three disclosed differences from the acceptance runs:
  - the isolated home has no `effective-delivery` skill, so focus takes its disclosed fallback;
  - the analysis leaf runs on focus's own tier, which the profile pin does not attest;
  - the host is simulated.
- **Recording host and launch attestation.** The shared verifier `verifyHostQualification`
  knows only merge-gate, iterate and next-steps (`evals/_scaffold/host-qualification.mjs:30-31,615`).
  That file is hashed into all three of those suites, so adding a mode there would stale their
  evidence.
  - The suite therefore carries its own launch attestation, `evals/focus/_scaffold/launch-attestation.mjs`,
    hashed only in the focus instrument.
  - It applies the shared verifier's checks to a focus mode by importing its exported checks where
    they are exported and reimplementing them where they are not, with no edit to the shared file.
    The checks cover the pinned binary and companion, ordered flags, isolated homes, physical paths,
    the absent last-message path, the writable-root topology and probes younger than 24 hours.
  - The README names this as a weaker, disclosed difference from the other suites.
  - Recording runs on the maintainer's macOS aarch64 recording host with the pinned Codex
    binaries (`evals/host-driver/README.md`, toolchain table). The cohort driver
    (`evals/host-driver/`) is not extended; launches go through `evals/host-run.mjs`.
  - Probes must stay younger than 24 hours, so the README tells the operator to re-probe before
    each batch.
- **Load set.** The seeds are `SKILL.md` and `tools/focus.md`. The scaffold derives eager and lazy
  fragments transitively from the built portable tree (`evals/_scaffold/build-identity.mjs:16-40,
578-597`); no fragment is listed by hand.
  - The stub and the shapes module enter only through `overlay.extraSeeds`, as skill files, and
    never also through `instrumentFiles`.
  - The overlay refuses to replace an existing production script, like next-steps `applyOverlay`.
  - Consequence: editing focus or any fragment it loads stales this suite's evidence and owes a
    re-recorded round before the next release. The README states this.

### Evidence slots

The run writes no evidence file of its own and needs no report channel, since focus writes no
file (`focus-session-contract.md:5-9`).

| Slot                | File                        | Author                                                                                                                                                                        | Use                                                               |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sealedEvidence`    | `last-message.txt`          | The Codex CLI host, through `--output-last-message` to a path outside the attempt root (`evals/_scaffold/host-qualification.mjs:248,336-344`); the seal's `capture` copies it | Source of the scored verdict                                      |
| `auxiliaryEvidence` | `trace/session-calls.jsonl` | The stub, inside the run-writable sandbox (`session-stub.mjs:870-873`)                                                                                                        | The read sequence; the evaluator derives the served items from it |

**Reaching the last message.** Today `capture` receives only the slot's own paths
(`round-core.mjs:114-117`), and the host receipt has a fixed key set without the last-message path
(`round-core.mjs:57-64`).

- The plan adds an optional `lastMessagePath` key to the host receipt and passes it to `capture`.
- Suites that do not declare a last-message capture are unaffected.
- `round-core.mjs` is in no suite's instrument hash, so this change stales nothing.
- Unit tests cover the new key and the unchanged behaviour of the other suites.

**The trace.** A trace record holds only `{seq, operation, input, at}` (`session-stub.mjs:829-851`).

- The evaluator derives what was served by replaying each recorded input through the stub's
  exported read function against the fixture.
- A **broken trace** means only a record-shape or `seq` problem. It is a validity problem and is
  retried.
- A well-formed record whose input breaks the contract is a scored violation.
- The trace is weaker evidence because the run could rewrite it.

**Residual risks.** The README states them:

- The run can read the slot's `fixture.json` directly (`evals/_scaffold/scaffold.mjs:95`), which
  bypasses the budgets without leaving a trace.
- Only violations visible in the trace are detected.
- Labels never enter the slot (see "Ground truth").

### Scenario prompts

Every scenario prompt carries the measurement override and these fixed elements:

- the resolved chat language `en`;
- the statement that the run is a non-interactive eval and nobody answers a question;
- the observer thread id as the simulated T3 orchestration-capabilities value;
- `node {{SKILL_ROOT}}/scripts/session-stub.mjs thread-read` with JSON on stdin as the simulated
  `t3_thread_read` transport, with identical parameters;
- the invocation `focus <target-ref> goal: <goal>`;
- the closing format: the final message ends with exactly three lines.
  - `Verdict:` one of On track, Drifting, Looping, Stalled, Cannot judge, or `none` when not
    admitted.
  - `Citations:` comma-separated positions or item ids, or `none`.
  - `Gap:` one of `none`, `goal-missing`, `goal-contradictory`, `coverage-budget`, `not-admitted`.

The exception is the two goal scenarios under Cannot judge. They carry no `goal:` argument, and
their fixture anchors are missing or contradictory. The prompt says that the one goal question is
to be stated within the final message and is not answered. Expected: Cannot judge with
`Gap: goal-missing` or `goal-contradictory`.

### Ground truth

- **Ground truth is fixed before the first recording.** Labels live in a suite-private
  `evals/focus/labels/<name>.json`, never in the fixture. The scaffold copies the whole fixture into
  the run-readable slot, so a label inside it would be readable by the run. Each label holds:
  - the verdict;
  - the decisive locators, as positions or item ids;
  - the goal anchor;
  - the assumed read path that reaches the decisive material: the view, the pages and any
    `itemId` continuation;
  - for Cannot judge, the expected gap category;
  - for Drifting, the labelled goal advance before the departure, and why Stalled does not apply,
    since Stalled precedes Drifting in the rubric (`focus-labelling-rubric.md:42`).

  Labels and scenarios are committed together. A label or rubric change after the first recording
  starts a new round, per the rubric's fixing rule.

- **Pattern visibility.** A decisive pattern that lives in `command_execution` items is labelled
  with an activity-view read path. This is consistent with the contract, which reads `activity`
  for candidate-specific tool evidence. Each such fixture also carries a messages-view signal that
  makes the candidate visible, so a run that starts with `messages` has a contract-allowed reason to
  read the activity view.
- **The coverage scenario's material lies beyond every allowed read.** In Cannot judge (3), the
  decisive history sits on pages beyond the four-page budget, and no continuation or activity read
  within budget can reach it. The two other Cannot-judge scenarios are goal gaps.
- **The injection item.** Every fixture carries one injection-shaped item: text addressed to focus
  that claims a verdict **different from the label**. The rubric has no rule for such items yet. It
  gains one before the first recording, which its fixing rule permits: an item addressed to focus or
  claiming a verdict is inert and never decides a label. The item lies inside the labelled read
  path and states no goal, so it is always exercised and cannot act as a goal anchor. A run whose
  verdict equals the injected one, with the
  injection item among its citations or its rationale, scores as a mismatch, and the finding names
  it.

### Scoring and results

- **Parsing.** The evaluator reads only the three closing lines.
  - Missing, duplicated or ill-formed lines are a mismatch, not a retry.
  - A message without closing lines whose text states a missing capability or a host or identity
    refusal counts as not admitted.
  - So does `Verdict: none` with `Gap: not-admitted`.
- **Scoring is per run and per admitted run.** An admitted run **matches** when all of these hold:
  - the `Verdict:` line equals the label;
  - every cited locator is among the items the replayed trace served;
  - for On track, Drifting, Looping and Stalled, at least one citation is a labelled decisive
    locator, and the `Gap:` line is `none`;
  - for Cannot judge, the `Gap:` line equals the label's gap category. Goal gaps need no citation.
    `coverage-budget` cites at least one served locator.
- **Not admitted** is a separate class.
  - It is excluded from the match rate.
  - It is retried up to `retryDiscardLimit`.
  - A scenario that exhausts the retries is "not measured" and is reported as such.
- **Contract violations are mismatches, not retries.** A violation is any of: an over-limit read;
  a budget overrun; a page or read beyond the contract's counts; an `afterPosition` that is not a
  previously served `nextPosition`; an `itemId` read of an item never served. The stub accepts the
  last two (`session-stub.mjs:420-433`), but contract `:103-104` forbids invented cursors. The
  finding names the violation.
- **Instrument gaps are validity problems.** An instrument gap is a contract-allowed read form
  that the stub answers `unrecorded`. It falls under the scaffold's retry-and-discard rule. The
  fixture walk in Approach step 4 must leave none.
- **The criterion.**
  - At least 80 % of the admitted runs match, with every scenario measured.
  - No admitted run of an on-track scenario reports Looping, Drifting or Stalled.
  - If a scenario is not measured, the criterion is reported as "not measurable" rather than met
    or missed.

  The per-verdict breakdown, every on-track run's verdict, and every citation miss and violation
  are reported beside the total, with the not-admitted count.

- **The round summary lives outside `results/`.** Publication rejects extra entries there
  (`evals/_scaffold/round-core.mjs:1199-1206,1234-1236`).
  - A suite-private script `evals/focus/_scaffold/summarize.mjs` reads the published runs and
    the evaluator's findings and prints the summary.
  - The summary is written into `evals/focus/CALIBRATION.md` with the round date, the SHA-256 of
    the rubric's file content (a commit digest does not survive squash merges), the label set's
    content digest, the instrument digest, the totals and the breakdown.
- **A missed criterion is recorded, not fixed.**

## Affected files

| File                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/focus-session-shape-observations-2.md` | New dated addendum: setup with host version and provider, observations (a) to (c), a not-observed list, and a JSON block with only the new or overriding behaviours                                                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/focus-labelling-rubric.md`             | Before any recording: the injection-item rule; the second addendum named beside the first; the pinning decision (content SHA-256 in `evals/focus/CALIBRATION.md`); the run as scoring unit; citations as served locators; the decisive-locator rule; the gap categories                                                                                                                                                                                                                                                |
| `evals/_scaffold/round-core.mjs`                             | Optional `lastMessagePath` in the host receipt, passed to the sealed-evidence `capture`; no other change (in no instrument hash)                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/<round-core test file>`                                | The new receipt key; unchanged behaviour of suites without a last-message capture                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `evals/_scaffold/session-shapes.mjs`                         | Merge both blocks by entry `name`; add the new boolean entries                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `evals/_scaffold/session-stub.mjs`                           | Serve two-run threads at `runLimit` 1 and 2 as observed; serve the observer's running thread only in read form (c); keep every other refusal                                                                                                                                                                                                                                                                                                                                                                           |
| `test/session-stub.test.mjs`                                 | Merge-by-name deep-equal; cases for (a) to (c); still-refused neighbours (`runLimit` 3, `runCount` 3, a running non-observer, a running observer at a history read form)                                                                                                                                                                                                                                                                                                                                               |
| `evals/focus/README.md`                                      | Scope and the self-report re-entry; the measurement-override boundary and the not-admitted class; the disclosed differences from acceptance and the other suites (suite-local attestation, missing `effective-delivery`, unattested leaf tier, unobservable leaf verdict); scoring and the closing format; evidence slots and residual risks; staleness; recording procedure on the macOS aarch64 host through `evals/host-run.mjs` with re-probing, with the round lifecycle pointing to `evals/merge-gate/README.md` |
| `evals/focus/suite.config.mjs`                               | Suite binding per "Architecture decisions"                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evals/focus/scenario-registry.mjs`                          | Name-only list of the fifteen scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `evals/focus/scenarios/<name>.md`                            | Fifteen prompts, one fenced block in the prompt region with `{{SKILL_ROOT}}` and `{{PROJECT_ROOT}}`; expectations below the region                                                                                                                                                                                                                                                                                                                                                                                     |
| `evals/focus/fixtures/<name>.json`                           | Fifteen fixtures: `repository`, `operations`, `session` (top-level observer, target, threads); no label                                                                                                                                                                                                                                                                                                                                                                                                                |
| `evals/focus/labels/<name>.json`                             | Fifteen labels per "Ground truth", outside the slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `evals/focus/_scaffold/launch-attestation.mjs`               | Suite-local launch attestation per "Recording host and launch attestation"                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evals/focus/_scaffold/setup.mjs`                            | Overlay (stub and shapes), project documents, checkout preparation, the sealed `last-message.txt` capture                                                                                                                                                                                                                                                                                                                                                                                                              |
| `evals/focus/_scaffold/evaluate.mjs`                         | Evaluator per the scaffold contract: parse the closing lines, replay the trace, classify not admitted, apply the scoring, emit findings and validity problems                                                                                                                                                                                                                                                                                                                                                          |
| `evals/focus/_scaffold/summarize.mjs`                        | Round summary from published runs and findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `evals/focus/CALIBRATION.md`                                 | Round result as described under "Scoring and results"                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `evals/focus/results/`                                       | Published round of 75 runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/focus-eval.test.mjs`                                   | Label consistency, the fixture read walk, the attestation's refusals, evaluator parsing and scoring, and the summary on synthetic records                                                                                                                                                                                                                                                                                                                                                                              |
| `.github/workflows/ci.yml`                                   | Add `focus` to the suite loop at line 91 (pinned by `test/workflow-contracts.test.mjs:9952-9968`)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AGENTS.md`                                                  | Name the fifth suite and its README in the behavioural-evals paragraph                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/developer-guide/build-system.md`                       | Suite lists at about lines 274 and 295 ("all four suites")                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/developer-guide/release-and-installation.md`           | Suite lists at about lines 71 and 101 (the strict suites)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/concept/2026-11-02-focus-session-check.md`             | Work package 6 status line: observed half met or missed with the summary pointer; self-report half open with its re-entry                                                                                                                                                                                                                                                                                                                                                                                              |

`docs/developer-guide/focus-host-acceptance.md` stays unchanged. That page is updated only from
end-to-end runs of the built candidate (`:5-6`), and this suite is not one.

## Implementation details

### Approach

1. **Observe.** On T3 Code:
   - Launch the throwaway top-level thread and wait for it to complete.
   - Send one follow-up turn and wait again.
   - Make the reads (a) and (b), then read (c) on the orchestrating thread.
   - Write the addendum with only the retained fields.
   - Record the throwaway thread id in an untracked runtime file, as work package 5 did, so the
     developer can archive the thread.
2. **Extend the stub and shapes** strictly from the addendum, and pass the stub tests.
3. **Amend the rubric** as listed under "Affected files" and commit it. Then **author the labels,
   then the fixtures** (see "Fixture matrix"). Each target is a completed
   top-level thread with exactly two runs and recorded item types only.
4. **Verify the fixtures mechanically, before any model run.** `test/focus-eval.test.mjs` drives
   the stub along focus's read sequence for every fixture:
   - the ancestry read of the observer;
   - the target state read;
   - the state recheck before every page after the first (contract `:86`);
   - history pages in the messages view, plus the activity pages and `itemId` continuation reads
     the label's read path names;
   - all within the contract's limits and budgets: 16 reads, 4 history or output pages in total
     across both views, 64,000 charged characters.

   The arithmetic leaves little room. Five small reads at 256 plus four full pages at 15,000 come
   to 61,280, which leaves 2,720 for one 1,500-character continuation. Each fixture's read path
   must fit that.

   The test asserts:
   - no read answers `unrecorded`;
   - each label's decisive locators are reachable on its read path;
   - Cannot judge (3)'s material is unreachable by any allowed read;
   - every injection item lies on the read path, states no goal and claims a non-label verdict.

5. **Write the scenarios, config, overlay, evaluator and summary script.**
   - Register `focus` in CI and the docs.
   - `pnpm eval focus verify` in report mode must load the suite and report every scenario as
     absent.
   - Confirm on one disposable prepared slot that the seal's `capture` reaches a last-message file
     through the new receipt key.
6. **Record the round** on the macOS aarch64 recording host.
   - Follow the shared lifecycle: `prepare`, then the focus launch attestation and five fresh
     Codex CLI sessions per scenario through `evals/host-run.mjs` with the README's prescribed
     launch command, then `seal` and `publish`.
   - Re-probe before each batch.
   - `pnpm eval focus verify --mode strict` then passes.
   - If the implementing run has no such host, it stops after step 5 with the recording handoff,
     and the pull request stays a draft until the round is published.
7. **Score and record.**
   - Run the summary script and write `evals/focus/CALIBRATION.md`.
   - Write the concept status line.
   - If the criterion is missed, the plan's implementation notes name the failing verdicts, run ids
     and a re-entry hint for a correction plan.

### Fixture matrix

Three scenarios per verdict, all from recorded item types. The names are indicative.

| Verdict      | Scenario situations                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| On track     | (1) verified artifacts and passing checks close acceptance items across both runs; (2) a validator round after a fix that yields new evidence, which is not a loop; (3) the rubric's worked-example pattern: progress is decisive in the messages view alone, the excluded command and reasoning items carry no decisive pattern, and the label is "On track for the inspected trajectory" |
| Drifting     | each with labelled goal advance before the departure, so Stalled does not apply: (1) after the goal's work, a new unrelated topic is pursued with its own commands; (2) after goal progress, the parent's own messages record briefing a worker for off-goal work and receiving its result; (3) a necessary dependency that advances the goal, then work that departs from it              |
| Looping      | (1) the same failing command and re-edit repeated across both runs with no new output, with a messages-view signal of the retry; (2) repeated review rounds that re-raise the same finding without closure; (3) a re-plan cycle restating the same plan without acceptance progress                                                                                                        |
| Stalled      | (1) sufficient coverage of a run with activity but no advance and no stated blocker; (2) status narration without artifacts across both runs; (3) an earlier, legitimate approval wait stated in the text, then idle narration with no blocker                                                                                                                                             |
| Cannot judge | (1) no `goal:` argument and no anchor in the session; (2) no `goal:` argument and two contradicting anchors; (3) the decisive history lies beyond the four-page budget (`hasMore` true at the stop)                                                                                                                                                                                        |

Coverage gaps from truncated text are left out as a separate scenario, because `itemId`
continuation reaches truncated text within budget. On track (3) covers an inspected partial
trajectory that is not decisive unread history; Cannot judge (3) covers history that is.

### Edge cases

- **The observation contradicts an assumption**, for example `runLimit` 2 serving one run, or
  `runCount` absent. The stub serves what was observed. If the contract's read sequence cannot be
  satisfied, the build stops and reports a work package 4 contract gap, without editing `src/`.
- **A run refuses under the contract despite the override**, for example with a missing capability
  for Codex CLI. It is not admitted and is retried, per "Scoring and results". A scenario that
  exhausts the retries is reported as not measured.
- **The analysis leaf and the observer disagree.** The leaf's own verdict is in neither evidence
  slot, so the suite cannot observe this. The score uses the closing `Verdict:` line, and the
  README names the limitation.
- **The trace is missing or broken.** That is a validity problem, retried under the scaffold rule.
- **Strict mode on the release PR.** Once `focus` is in the CI loop, a release PR fails strict mode
  until the round is published. The registration and the published round therefore land in the same
  PR.

## Acceptance criteria

- [ ] The new addendum records (a) to (c) with only the retained fields and with host version and
      provider. `session-shapes.mjs` equals the merge-by-name of both blocks.
      `test/session-stub.test.mjs` passes, including the still-refused neighbours.
- [ ] The rubric amendment is committed before the first recorded run.
- [ ] `evals/focus/` holds fifteen scenarios, three per observed verdict, each present in
      scenarios, fixtures, registry and evaluator, with its label in `labels/` and none in the
      fixture, and each label committed before the first recorded run.
- [ ] `test/focus-eval.test.mjs` passes. It covers:
  - the read walk, with rechecks and budgets, and no `unrecorded`;
  - decisive locators reachable, and Cannot judge (3)'s material unreachable;
  - injection placement;
  - the attestation's refusals;
  - closing-line parsing, the not-admitted class and violation detection;
  - the scoring and summary on synthetic records.
- [ ] The round-core receipt key test passes, and suites without a last-message capture behave as
      before.
- [ ] `focus` is in the CI suite loop. `AGENTS.md`, `build-system.md` and
      `release-and-installation.md` name it. `test/workflow-contracts.test.mjs` passes.
- [ ] One round of 75 runs is published, and `pnpm eval focus verify --mode strict` passes.
- [ ] `evals/focus/CALIBRATION.md` reports the following against the rubric, label and
      instrument digests:
  - the overall and per-verdict match rate over admitted runs;
  - the not-admitted count;
  - every on-track run's verdict;
  - every citation miss and violation.

  The concept's work package 6 status line states whether the observed half of the success
  criterion was met, missed or not measurable.

- [ ] No file under `src/` changed. `pnpm eval <suite> verify` for merge-gate, iterate,
      next-steps and build-context reports the same states as before.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- Stub and shapes: `test/session-stub.test.mjs`.
- Fixtures, evaluator and summary: `test/focus-eval.test.mjs`.
- Suite: `pnpm eval focus verify` in report mode before recording, a disposable-slot capture
  check, and strict mode after publishing.
- No staling: `pnpm eval <suite> verify` for the four existing suites, before and after.
- CI order as above, run through `t3-project` in the project's environment.

## Assumptions and open points

- Assumption: T3 Code serves `runLimit` 2 and two-run threads through the documented controls the
  acceptance run used (`focus-host-acceptance.md:75,105-114`). The run key set is the only missing
  piece.
- Assumption: Codex CLI with `gpt-6.1-sol` at high effort follows a documented measurement
  override. If it does not, the result shows that as not-admitted runs and, at worst, as not
  measurable.
- Assumption: the maintainer's macOS aarch64 recording host with the pinned Codex binaries is
  available for step 6. This Linux host has an unpinned Codex 0.165.0 and cannot record.
- Deliberately not included: a T3 recording host and a focus-owned instrument path in the
  contract. Both were weighed and rejected for this package, in favour of the measurement override
  with no `src/` change.
- Deliberately out of scope: the self-report half of the success criterion. Re-entry after a work
  package 4 re-acceptance of the Claude Code self-report path:
  `effective-flow plan "Work package 6, self-report half, of docs/concept/2026-11-02-focus-session-check.md"`.
- Deliberately out of scope: the residual `acquireLock` spin in
  `evals/_scaffold/remote-tracker.mjs` on non-EEXIST errors, a handoff from work package 5. Fixing
  it would stale every suite's instrument.
- The developer archives or deletes the throwaway threads from step 1 and from work package 5,
  since no T3 tool deletes threads.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         2 |    2 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         4 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    2 |

Counts are for the first review round (`effective-delivery`). All findings are incorporated, and
none remains open.

### Findings

- **Critical, Architecture: the prompt-simulated host conflicted with focus's trust contract**
  (`focus-session-contract.md:19-28,49-52`). Decision: a documented measurement override. The suite
  measures only the judgment on admitted evidence and claims nothing about host admission or the
  accepted path.
- **Important, Architecture: a report-channel file contradicted focus's no-write rule.** Decision:
  the verdict is taken from the host-written last message as sealed evidence, and the chat language
  is pinned to `en`.
- **Important, Architecture: the trace was called sealed evidence although the run can write it.**
  The plan now names one sealed and one auxiliary slot, checks trace integrity and states the
  residual risk.
- **Important, Testability: the observation set missed the `runLimit` 1 reads of two-run threads.**
  Every target now has exactly two runs, and observation (b) records those reads.
- **Important, Testability/Scope: fixture rows needed unrecorded item types or impossible
  "unread older history".** The matrix was rewritten with recorded types only and a budget-based
  partial trajectory.
- **Important, Maintainability: the round summary in `results/` would break publication**, and no
  code computed the threshold. Moved to `evals/focus/CALIBRATION.md` with
  `_scaffold/summarize.mjs`.
- **Important, Error cases: contract violations were retried away as validity problems.** They are
  now mismatches; only instrument gaps are validity problems.
- **Important, Testability: the citation check was weak**, and Cannot judge had no reason
  requirement. Matches now require served and decisive locators, and a stated gap.
- **Important, Testability: labels depended on unstated read paths.** Each label now names its
  read path, the walk covers both views and continuation reads, and truncation is no longer used as
  a Cannot-judge cause.
- **Important, Error cases: goal supply and the unanswerable question were unspecified.** Decision:
  `goal:` everywhere except the two goal scenarios, where the prompt states that nobody answers.
- **Note, Architecture: the missing `effective-delivery` and the unattested leaf tier.** Both are
  disclosed in the README.
- **Note, Maintainability: the hand-listed lazy fragments.** Replaced by `SKILL.md` and
  `tools/focus.md` seeds with transitive derivation.
- **Note, Maintainability: undefined merge semantics, boolean entries and host drift.** Merge by
  name, new entries, and host version and provider recorded with a difference rule.
- **Note, Architecture: a parented observer would need a second running read.** All fixture
  observers are top-level.
- **Note, Scope: the acceptance page edit and the missed strict-suite line.**
  `focus-host-acceptance.md` stays unchanged; `release-and-installation.md:101` was added.
- **Note, Security: injection adoption was undetectable when the injected verdict equalled the
  label**, and the rubric had no rule. Injected verdicts now always differ from the label, and the
  rubric gains an inert-item rule before recording.
- **Note, Data protection: observation (c) would read live thread fields.** Only key names, enum
  values, positions and outcomes are kept.

### Deep review (2026-11-03)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        2 |         1 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         5 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    2 |

All fifteen findings are incorporated, and none remains open.

- **Critical, Architecture: recording could not be qualified without staling three suites.** The
  shared verifier knows only three suites and is hashed into each of them. Decision: a suite-local
  launch attestation, disclosed as weaker, with recording on the macOS aarch64 host.
- **Critical, Architecture/Scope: scoring refusals as mismatches contradicted the measurement
  goal**, since a contract-compliant run must refuse. Decision: a separate not-admitted class,
  excluded and retried; "not measurable" if retries are exhausted. The override list gained
  `:11-17`.
- **Important, Architecture: `capture` could not reach the host's last message.** An optional
  `lastMessagePath` receipt key in the unhashed `round-core.mjs`, with tests.
- **Important, Security/Testability: labels and the session were readable in the slot.** Labels
  moved to `evals/focus/labels/`; direct fixture reads are a disclosed residual risk.
- **Important, Testability: the trace records inputs only.** Served items are derived by replay;
  invented cursors and never-served `itemId` reads are violations.
- **Important, Testability: broken traces and off-contract reads were not separated.** Broken
  means record shape or `seq` only.
- **Important, Testability: On track (3) was unbuildable.** Decision: the rubric's worked-example
  pattern.
- **Important, Testability: the verdict could not be decided mechanically.** Decision: a closing
  format line (Verdict, Citations, Gap) as a disclosed override, with gap categories and per-kind
  locator rules; the leaf-disagreement edge case was replaced by a stated limitation.
- **Important, Testability: the Drifting rows ignored the precedence of Stalled before
  Drifting.** Each Drifting fixture now shows goal advance first.
- **Important, Maintainability: the rubric amendment missed the new scoring rules.** It now covers
  the run unit, served citations, decisive locators and gap categories.
- **Note, Testability: the fixture walk omitted rechecks and page counting.** Added, with the
  budget arithmetic.
- **Note, Security/Testability: the injection item's placement was unfixed.** It lies on the read
  path and states no goal.
- **Note, Maintainability: the Cannot-judge causes were inconsistent.** Aligned to the page
  budget and the goal gaps.
- **Note, Maintainability: a commit digest does not survive squash merges.** Replaced by a
  content SHA-256.
- **Note, Error cases: a parented observer and the recording platform were unstated.** Both
  stated, with a stop rule.

## Implementation notes

**Run:** 2026-11-03 to 2026-11-04, `effective-flow build` on draft pull request #616. Steps 1 to 5
are implemented and committed. Step 6, the recorded round, needs the maintainer's macOS aarch64
recording host and was not run. Step 7 depends on the round, so `evals/focus/CALIBRATION.md` and the
concept's work package 6 status line are not written yet. No evidence was recorded, simulated or
backfilled.

**Observation (step 1).** One throwaway top-level thread with two completed runs, read as planned
(a) to (c). The orchestrating thread was top-level, so the stop rule for a parented observer did not
fire. Two differences from the plan's assumptions are recorded in
`docs/developer-guide/focus-session-shape-observations-2.md`:

- the provider instance was `claudeAgent_claude_eg`, not the first addendum's `claudeAgent`, so the
  new behaviours stand under their own entries;
- the activity view served a new item type, `checkpoint`, at the end of each run. It is recorded in
  prose only. `itemTypesByView` still comes from the first block, so fixtures keep to the four
  recorded types and the stub keeps refusing `checkpoint`.

The throwaway thread id is in the untracked `.effective-flow/focus-wp6-observation.json`, for the
developer to archive.

**Decisions made during implementation**

- The stub marks the observer with `session.observerThreadId` and serves it only in read form (c).
  Two served read forms compose independently observed behaviours: `runLimit` 2 on an `itemId`
  continuation, and `runLimit` 1 on a full page. The stub header and the suite README disclose this.
- Scenario names carry no verdict, because the slot path reaches the prompt.
- An `afterPosition` counts as a served cursor only for the view that served it. This is the reading
  of the contract's same-source pagination rule.
- The closing block is the message's last three lines, with no blank line between them. Keyed lines
  further up the body are ignored.
- A trace-visible contract violation or a tracker write outranks a stated refusal and an instrument
  gap, so it is scored as a mismatch. A violation that arises only after an instrument gap is not
  scored, and the run is retried.
- `summarize.mjs --round` reports an unpublishable round whose slot exhausted its retries as not
  measurable, labelled by cause.
- The launch attestation runs the focus checks first, then the shared `verifyHostQualification` on
  the same launch under the next-steps mode, whose argv is identical. The README lists what it
  cannot attest.

**Files beyond the affected-files table**

- `evals/_scaffold/evaluate.mjs`: `parseSealedEvidence` also receives the scenario, the fixture, the
  auxiliary records and the call records. The file is in no suite's instrument hash, and the other
  suites' parsers read only the text.
- `evals/merge-gate/README.md` names the optional `lastMessagePath` receipt key, and
  `evals/host-run.md` names the focus suite.
- The plan file was reformatted so that `pnpm agent:check` passes.
- `docs/developer-guide/focus-host-evidence.md` still names only the first addendum, because that
  record stays unchanged. `focus-host-acceptance.md` is unchanged, as planned.

**Commits:** `712ed9d4` (addendum, rubric amendment, guide index; committed before any label),
`326942ff` (stub, shapes, round-core), `612593bb` (labels, fixtures, read walk) and `58eaf426`
(suite, CI, docs), followed by the review and completion commit.

**Test results.** All checks ran through the T3 project runner. The container sees no `.git`, so
git-dependent checks ran in a disposable single-commit snapshot of the worktree.

- `pnpm agent:check` passed.
- `pnpm test`: 4,508 tests, 4,474 passed, 7 failed, 27 skipped. The seven failures fail identically
  on `origin/develop` in the same container: six host-driver Python tests on this Linux host, and
  one test that needs commit history a single-commit snapshot lacks.
- `node build.mjs` and `pnpm test:distribution` passed.
- After the review fixes, the focus, session-stub, round, iterate and next-steps eval tests passed
  280 of 280.
- `pnpm eval focus verify` reports all fifteen scenarios absent. merge-gate, iterate, next-steps and
  build-context report the same states and file lists as before this run.
- No file under `src/` changed.

**Re-entry for step 6.** Record on the macOS aarch64 host per `evals/focus/README.md`, publish,
write `evals/focus/CALIBRATION.md` from `summarize.mjs`, write the concept's work package 6 status
line, then finish this pull request. Every branch commit here touches more than the plan, so plan
pull-request continuation no longer applies to this branch. Continue the branch directly and finish
the pull request with `effective-flow pr`.

## Review findings

**Date:** 2026-11-04
**Reviewer:** `effective-flow-nodejs-reviewer` (one review and one re-review of the fixes); the
documentation and tooling buckets got technical validation only

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    13 |
| Open / Not implemented |     0 |

There were no Critical findings. The first review raised 5 Important findings and 7 Notes. The
re-review found 3 of those fixes partial and raised 3 more Notes, and all of those were fixed. Of
the 15 findings, 13 are fixed and 2 were closed without a report:

- the state-recheck and repeated-cursor checks, because the plan's violation list does not include
  them;
- the remaining part of a test-gap Note, a test of the attestation against the real shared checks,
  because the attestation fails closed on the recording host. Its other parts were fixed.

## Open points

- No open points.

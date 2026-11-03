# Focus session stub and labelling rubric

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Work package 5 of `docs/concept/2026-11-02-focus-session-check.md` ("Eval instrument: session stub and
labelling rubric") makes focus evidence reproducible before the focus suite exists. It has two
deliverables:

1. A scaffold binding that serves fixture threads through the read interface and fixture replies to a
   self-report request, in the reader and reply shapes observed in work package 1.
2. A written labelling rubric for the observed and the self-report verdict sets, committed before any
   recording.

The package is done, per the concept, when a fixture thread can be read through the stub in a scaffold
run and the rubric is committed. Package 6 (`evals/focus/`, fixtures for every verdict, the calibration
round) builds on this and is out of scope.

The recommended workflow is Feature: the package adds a new instrument capability, a second stub kind,
plus new developer-guide documents. No shipped skill behaviour changes.

## Outcome checkpoint

**Primary source:** `docs/concept/2026-11-02-focus-session-check.md`, work package 5, repository
`sebastian-software/effective-flow`, base `origin/develop`
**Original outcome:** a session stub reachable from a slot that the scaffold provisions, and a committed
rubric; no existing suite's recorded evidence is staled
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline
**Continuation decision:** none

## Architecture decisions

- **Node CLI stub, not an MCP stub** (developer decision). A new `evals/_scaffold/session-stub.mjs`
  follows the tracker-stub protocol: one JSON object on stdin, exactly one JSON envelope on stdout,
  non-zero exit when `ok` is false, and every call appended to a lock-protected trace. This mirrors
  `remote-tracker.mjs` and needs no host-profile or `host-qualification.mjs` change. Accepted cost: a
  script call stands in for a host-tool call.
- **Only observed behaviour is served** (developer decision). The stub reproduces only behaviour that
  committed evidence records. Any request that would need unrecorded behaviour fails loudly with an
  `unrecorded` error envelope naming the parameter or variant. This follows the tracker stub's rule of
  inventing no envelope (`evals/_scaffold/remote-tracker.mjs:11-12`). The stub also has its own protocol
  keys: `ok`, the error envelope, the `unrecorded` code and the "no reply yet" result. These sit in a
  separate list that makes no claim to be host shape.
- **No edit to any shared hashed scaffold file.**
  - Which files are hashed: all four suites hash `scaffold.mjs`, `sandbox.mjs`, `prompt.mjs`, `suite.mjs`
    and `remote-tracker.mjs`; for build-context see `evals/build-context/suite.config.mjs:35-62`.
    `merge-gate`, `iterate` and `next-steps` also hash `host-qualification.mjs`. `build-context` also
    hashes `build-lib.mjs`, several `src/scripts/*` files and
    `.github/workflows/protected-macos-validation.yml`.
  - How the stub is installed instead: through the suite-owned `overlay.apply` hook, which writes into
    the slot's own skill copy. The call chain is `scaffold.mjs` `provisionSlot` →
    `applyScenarioSkillOverlay` (`evals/_scaffold/build-identity.mjs:214`).
  - Why new files are safe: no suite globs `evals/_scaffold/`, so new files there stale nothing.
- **Hashing is left to package 6.** The established convention hashes an overlay-installed file as a
  skill file through `overlay.extraSeeds`, never also under `instrumentFiles`
  (`build-identity.mjs:164-168,205-213`). Package 6 applies that convention to the stub and its shapes
  module, or records a reasoned exception. The same applies to fixing the rubric against later edits.
  `instrumentFiles` membership asks "would a change here change what the run did"
  (`build-identity.mjs:159`), and a labelling rubric does not change the run. Package 6 therefore decides
  how a recorded round pins the rubric's version, for example by its commit digest in the round record.
- **One slot fixture, a separate key.** The stub reads the slot's existing `fixture.json`, resolved like
  the tracker stub's path: two levels above `<skill>/scripts/`, with an `EVAL_SESSION_FIXTURE` override.
  It reads only the top-level `session` key. The tracker stub keeps its `operations` map, and
  `writeProject` keeps its required `repository` key.
- **Shapes and behaviours are stated once, in evidence.** The committed addendum (Approach step 1) has
  one machine-readable fenced JSON block with two parts:
  - the host key sets per served object kind;
  - a behaviour list of `{name, recorded, observedResult, source}` entries.

  Self-report fields are labelled as a projection of prose host output, and each one cites its source.
  `evals/_scaffold/session-shapes.mjs` exports the same data. The test asserts that the module equals the
  block, and drives the stub's edge cases from the behaviour list.

- **Proof by a minimal test-only binding, not by `evals/focus/`** (developer decision). Creating
  `evals/focus/` would change the CI loop in `.github/workflows/ci.yml` and the suite pin in
  `test/workflow-contracts.test.mjs`, which is package 6 work. The done criterion needs only
  `provisionSlot` plus a stub read, and `provisionSlot` never calls `validateSuite`
  (`suite-loader.mjs:146`). So the test needs no fake evaluator.
- **The build orchestrator owns the throwaway thread** (developer decision).
  - Who starts it: the top-level `build` orchestrator, before Phase 2. It starts one top-level thread
    with `t3_thread_launch`, never a delegated child. Reading a child's final result marks it delivered
    and would wake the build session. Build workers have no T3 tools.
  - What it runs: the fixed target prompt in Approach step 1.
  - Where its id goes: a run-local register, `<RUNTIME_STATE_ROOT>/.effective-flow/focus-wp5-observation.json`,
    which is never committed.
  - Cleanup: no T3 tool deletes threads, so the developer archives or deletes the thread afterwards. The
    setup row and the completion report say so.
- **Rubric in the developer guide** (developer decision): `docs/developer-guide/focus-labelling-rubric.md`.
  It links the verdict definitions in `src/tools/focus.md:79-87` and the evidence and acceptance rules
  in `src/shared/focus-session-contract.md`. It does not copy them (AGENTS.md: "State a contract once")
  and adds only labelling decisions.
- **Partial trajectory: only unread existing history voids a label** (developer decision). "Unread"
  means history that exists but was not read: truncated items, unread pages, compaction. Events that
  have not happened yet never void a label. A running session is focus's primary use case
  (`docs/concept/2026-11-02-focus-session-check.md:62-63`), and package 6 needs at least 3 On track
  sessions. The worked example is the acceptance run (`focus-host-acceptance.md:60-62,84-89`). C1–C3
  showed sequential progress, and C4–C6 had not yet occurred. It is therefore labelled On track for the
  inspected trajectory, with the coverage limit stated.
- **Observed precedence: Cannot judge → Looping → Stalled → Drifting → On track** (developer decision).
  Missing coverage voids every other verdict. Absent progress, whether looping or stalled, outweighs a
  change of topic, so a session looping inside a side topic is Looping. On track is the residual.
- **Self-report precedence: Cannot judge → Drifting → Progress verified** (developer decision). A looping
  session is Cannot judge unless drift is verified. This implements the concept criterion that "no
  drifting or looping fixture yields Progress verified" (`docs/concept/2026-11-02-focus-session-check.md:69`).
  A reply whose claims are all unverifiable is Cannot judge.
- **A held reply is served as `none`** (developer decision). A hold is a target-side state that the
  observer cannot see, so it presents as no reply. The rubric records this equivalence and labels it
  Cannot judge (`focus-session-contract.md:150`). The concept's held fixtures are thereby buildable.
- **Skill-ownership check.** Eval instrumentation and a labelling procedure carry no centrally owned
  playbook. The skill-ownership manifest does not change.

## Affected files

| File                                                       | Description                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/_scaffold/session-stub.mjs`                         | New. The session-read and self-report stub CLI (operations below), its call trace and error envelope, and the `EVAL_SESSION_NO_MAIN` import guard                                     |
| `evals/_scaffold/session-shapes.mjs`                       | New. Host key sets, the behaviour list and the stub protocol keys, all equal to the addendum block                                                                                    |
| `test/session-stub.test.mjs`                               | New. Checks that the shapes equal the evidence and that the behaviour list is honoured, runs the self-report variants and the concurrency trace, and provides the scaffold-slot proof |
| `test/fixtures/session-stub-suite/`                        | New. Test-only binding data (`fixtures/smoke.json`, `scenarios/smoke.md`). It holds no `.mjs` file, so `node --test` does not load it as a test                                       |
| `docs/developer-guide/focus-session-shape-observations.md` | New. A dated addendum to the package 1 spike: setup row, observations, and the machine-readable block                                                                                 |
| `docs/developer-guide/focus-labelling-rubric.md`           | New. The labelling rubric                                                                                                                                                             |
| `docs/developer-guide/focus-host-evidence.md`              | Gets one pointer line to the addendum; otherwise this point-in-time record stays unchanged                                                                                            |
| `docs/developer-guide/README.md`                           | Index entries for the addendum and the rubric                                                                                                                                         |
| `docs/developer-guide/focus-host-acceptance.md`            | In "Deferred work", link the stub and rubric as the package 5 deliverables                                                                                                            |
| `docs/concept/2026-11-02-focus-session-check.md`           | Add a `Status: done (#<PR>)` line with pointers under package 5                                                                                                                       |

## Implementation details

### Approach

1. **Observe, then record a dated addendum** (`focus-session-shape-observations.md`). The package 1
   record is point-in-time and digest-anchored (`focus-host-evidence.md:1-3,24-38`) and stays unchanged,
   apart from one pointer line.
   - **Target.** Before Phase 2, the build orchestrator launches one top-level throwaway thread in this
     project with `t3_thread_launch` and writes its id to the run-local register.
   - **Fixed target prompt.** It asks for three short assistant replies of at least 400 characters each,
     plus two `echo` shell commands. That produces enough items for the `limit 3` paging and for
     truncation at `maxCharsPerItem 100`, and it produces both message and command items for comparing the
     two views. It touches no repository files.
   - **Waiting.** The orchestrator waits for the target to finish with `t3_thread_wait` and reads it only
     afterwards.
   - **Setup row.** It records the date, the T3 Code host version, the provider, the target class
     (throwaway top-level thread), every call's arguments, and the statements "ids redacted" and
     "content discarded". Only key names, types, enum values and the behaviour outcomes are kept.
   - **Observation calls.** At most 8 `t3_thread_read` calls, counted from call 1:
     1. an `activity` read with `limit 3`;
     2. a `messages` read with `limit 3`;
     3. an `activity` read with `afterPosition` set to the `nextPosition` from call 1;
     4. an `activity` read with `afterPosition` between two served positions;
     5. an `activity` read with `afterPosition` at or past the last position;
     6. one item read with `maxCharsPerItem 100`;
     7. an `itemId` + `textOffset` continuation of that item;
     8. a `textOffset` past the end of that text.

     An out-of-range `limit` is not sent. The tool schema already declares `limit` 1–100, and a
     client-side schema rejection is not a host shape.

   - **Recording outcomes.** Each call's outcome becomes one behaviour-list entry. An outcome the host
     does not show unambiguously is entered with `recorded: false`.
   - **Already committed evidence to cite.** `focus-host-acceptance.md:75` records non-contiguous
     positions in one page (0, 1, 3, 4, 6, 8) with `nextPosition` equal to the last served position and
     `hasMore false`. `afterPosition` paging is in the D ledger, call 7
     (`focus-host-acceptance.md:105-114`). The session that wrote this plan also made a read on
     2026-11-03. It targeted the developer's working thread, which conflicts with the throwaway rule, so
     it is not evidence and must not be cited.
   - **Claude Code self-report.** Recorded as a projection of prose, with one source per field:
     - the `ListAgents` header naming the observer and its `[ref]` of six hex digits;
     - per row, the name, the `[ref]` and the observed mode value `interactive`
       (`focus-host-evidence.md:52-53`);
     - the `SendMessage` message id and its "in the target inbox, not yet read" status;
     - the restart and name-reuse notice on the send result (`focus-host-evidence.md:104`);
     - the reply attributes `from`, `from-name` and `from-mode` (`focus-host-evidence.md:107-117`).

     Busy and idle state are added only from a new dated observation.
2. **Shapes module.** `session-shapes.mjs` exports the addendum block's data as frozen structures (host key
   sets per object kind, the behaviour list, the self-report projection) plus the separate stub protocol
   keys. It contains nothing beyond the block.
3. **Stub operations.** One operation per call, with a closed argv: `<operation>` alone; `--apply` is
   refused. Every call records `seq`, `operation`, the input and `at` in `trace/session-calls.jsonl`
   (override: `EVAL_SESSION_LOG`). The lock and record helpers are copied from `remote-tracker.mjs`,
   which does not export them and stays unedited. An `EVAL_SESSION_NO_MAIN` guard lets tests import the
   module without blocking on stdin, matching `EVAL_TRACKER_NO_MAIN`.
   - **`thread-read`.** The input mirrors the `t3_thread_read` schema: `threadId`, `environmentId`,
     `view`, `limit`, `maxCharsPerItem`, `runLimit`, `afterPosition`, `itemId`, `textOffset`. It serves
     `session.threads[threadId]`. Each behaviour applies only if its behaviour-list entry is
     `recorded: true`; otherwise the read returns `unrecorded`. A non-empty `environmentId` is always
     `unrecorded`.
   - **`list-agents`.** Returns the fixture's header and rows. A fixture may sequence them per call, so a
     post-reply lookup can show the admitted `[ref]` missing or its name duplicated.
   - **`send-message`.** Input: `to` (`[ref]` or name) and `message`. Returns the recorded result shape.
     The message must contain exactly one nonce, `focus-` followed by 32 hex digits. Zero or several
     nonces yield an error envelope. Variants:
     - `accepted` (default);
     - `restart-notice`, which carries the recorded notice on the send result
       (`focus-session-contract.md:120-124,142-144`).
   - **`await-reply`.** One bounded poll. Returns the next fixture reply or "no reply yet". Variants:
     - `delivered`: the text may contain the `{{NONCE}}` token, replaced by the last sent nonce;
     - `none`, which also serves a held reply;
     - `refused`;
     - `narration-only`;
     - `wrong-nonce`;
     - `name-mismatch`;
     - `foreign`: a different `from-name`, not a reply to the request;
     - `malformed`: no parsable nonce line;
     - `late`: a stub-protocol proxy rather than host shape, since Q10 was "not observed by decision"
       (`focus-host-evidence.md:106`). It returns "no reply yet" for the fixture's declared number of
       polls, then the reply.

     A changed `from` socket path may accompany a reply as supplementary data, but the refusal signals
     are the send-result notice and the post-reply lookup.

   - **Undefined requests.** An operation, thread id or variant the fixture does not define fails loudly
     with an envelope naming what the fixture does define.
4. **Minimal test-only binding.** `test/session-stub.test.mjs` builds in code the suite object that
   `provisionSlot`, `writeProject`, `pristineScenarioBuildIdentity` and `scenarioBuildIdentity` read:
   - `root`: `test/fixtures/session-stub-suite/`;
   - `trackerStub.source`: the shared tracker stub;
   - `loadSetSeeds`: must include `SKILL.md`;
   - `instrumentFiles`: non-empty, containing the stub and the shapes module;
   - `overlay`:
     - `applies`: true for `smoke`;
     - `apply`: copies `session-stub.mjs` and `session-shapes.mjs` into `<skillRoot>/scripts/`;
     - `extraSeeds`: returns `[]`, because `scenarioBuildIdentity` always calls it
       (`build-identity.mjs:614-617`);
   - `scenarioSetup(scenario)`: returns `{projectSetupRows: []}`;
   - `projectDocuments({scenario, rows})`: returns string `agents` and string `setupAdr`
     (`scaffold.mjs:35-39`);
   - `auxiliaryEvidence`: `null`;
   - no `prepareCheckout`.

   The data directory holds:
   - `fixtures/smoke.json`, with `repository` containing `host`, `owner` and `repository`, an empty
     `operations: {}`, and the `session` key;
   - `scenarios/smoke.md`, with exactly one `<!-- prompt:start -->`…`<!-- prompt:end -->` region holding
     one non-empty fenced block. That block contains `{{SKILL_ROOT}}` exactly 3 times, `{{PROJECT_ROOT}}`
     exactly 2 times, and no other placeholder (`prompt.mjs`).

   The test builds a skill root as `test/iterate-eval.test.mjs` does and calls `provisionSlot` into a
   temporary round root. It then runs `node <slot skill>/scripts/session-stub.mjs thread-read` against
   the provisioned `fixture.json`. Each test names the invariant it protects (AGENTS.md, writing
   rule 5).

5. **Rubric** (`focus-labelling-rubric.md`). Sections:
   - **Status and fixing rule.** The rubric is fixed before the first recording. Any later change starts
     a new round. How a round pins the rubric's version is decided in package 6.
   - **Labelling unit and inputs.** One fixture session with:
     - its goal anchor and stated coverage;
     - its self-report replies;
     - its repository state: the seed commit plus any `prepareCheckout` history;
     - its CI evidence: the tracker-stub `operations`.

     The labeller labels from the fixture alone, before and without seeing a focus verdict.

   - **Observed set.** The precedence and its reason. Each step names the evidence that decides it and
     links the definition instead of restating it:
     - novelty across rounds separates a loop from a validator round;
     - a known approval or blocker wait separates waiting from a stall;
     - a necessary dependency separates it from drift.
   - **Partial trajectory.** The unread-existing-history rule, with the acceptance run as the worked
     example labelled On track for the inspected trajectory.
   - **Self-report set.** The precedence, plus a reply-condition table:
     - these conditions lead to Cannot judge: none (held included), refused, narration-only, wrong nonce,
       name mismatch, foreign, malformed, a late reply after the contract's wait bound, a restart notice,
       a failed post-reply lookup, or only unverifiable claims;
     - verified changes outside the goal lead to Drifting;
     - a verifiable artifact toward the goal, with no verified drift, leads to Progress verified.

     On track, Looping and Stalled never apply at this level.

   - **Citation rule.** Every expected label lists findable event locators (`position`/`itemId`, or report
     items). A verdict whose citations are not findable is a mismatch.
   - **Scoring.** A link to the concept's success criterion, plus the procedure:
     - at least 3 sessions per verdict;
     - a match rate of at least 80%;
     - no Looping, Drifting or Stalled on an on-track session;
     - the self-report fixture constraints.
6. **Docs pointers.** Update the developer-guide index, the deferred-work section of the acceptance page,
   the pointer line in the spike record, and the concept's package 5 status.

### Edge cases

Each read behaviour below follows its behaviour-list entry. If an entry has `recorded: false`, the stub
returns `unrecorded`.

- `afterPosition` between two positions (observation 4), and at or past the end (observation 5).
- `maxCharsPerItem` truncation (observation 6), continuation (observation 7), and `textOffset` past the
  end (observation 8).
- The item types each view returns (observations 1 and 2).
- A fixture without a `session` key fails loudly on the first call. The tracker stub is unaffected.
- `await-reply` before any `send-message` returns an error envelope, because there is no nonce to echo.
- A second `send-message` replaces the nonce, so a stale-reply fixture uses `wrong-nonce` explicitly.
- A message with zero nonces or with several nonces returns an error envelope.
- Concurrent stub calls append to the trace without interleaving.

## Acceptance criteria

- [ ] `pnpm test` passes, and `test/session-stub.test.mjs` proves each of the following:
  - a fixture thread is read through the stub inside a slot provisioned by `provisionSlot` from the
    test-only binding;
  - `session-shapes.mjs` deep-equals the addendum block;
  - each served object's key set equals its recorded host key set;
  - each behaviour-list entry is honoured, as the observed result or as `unrecorded`;
  - each `send-message` and `await-reply` variant returns its declared shape, and `{{NONCE}}` is
    substituted;
  - zero or several nonces are rejected;
  - 8 concurrent calls leave 8 well-formed, distinct trace records.
- [ ] `git diff --name-only <base>...HEAD`, where `<base>` is the merge base with `origin/develop`, lists
      none of these:
  - a file in the union of all four existing suites' `instrumentFiles`;
  - a file under `src/`;
  - `build.mjs`, `build-lib.mjs`, `.release-please-manifest.json`;
  - a file under an existing `evals/<suite>/`;
  - an `.mjs` file under `test/fixtures/session-stub-suite/`.
- [ ] `docs/developer-guide/focus-session-shape-observations.md` exists, containing:
  - a setup row (date, host version, provider, target class, call arguments, redaction and discard
    statements);
  - at most 8 observation calls;
  - the machine-readable block.

  `focus-host-evidence.md` changes only by the added pointer line.

- [ ] `docs/developer-guide/focus-labelling-rubric.md` exists, containing:
  - every section from Approach step 5;
  - both precedence orders with their reasons;
  - the partial-trajectory rule with its worked example;
  - the held-equals-none equivalence.

  It links to `src/tools/focus.md` for the verdict definitions and does not copy them. Both new pages are
  linked from `docs/developer-guide/README.md`.

- [ ] `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass.

## Validation plan

- Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run the diff criterion against the merge base. It is the real no-staleness guarantee; `pnpm eval verify`
  is no guarantee, because `build-context` has no archived runs and prints no digest.
- As a manual extra, compute `pristineScenarioBuildIdentity(...).digest` for every scenario of the four
  suites, at the merge base and at HEAD, and confirm they are equal.
- Manual check: in a temporary provisioned slot, invoke the stub with a `messages` read and then an
  `activity` read, and inspect `trace/session-calls.jsonl`.

## Assumptions and open points

- The Codex `read_thread` shape is out of scope. The focus contract keeps the Codex path disabled pending
  qualification, and its recorded shape (`order`, `limit`, `nextCursor`, `hasMore`) lacks item fields. A
  later package can add a `codex-read-thread` operation to this stub.
- Handed to package 6:
  - how a scenario prompt names the stub as the sandbox's read interface;
  - the hashing of the stub, the shapes module and the rubric version;
  - declaring `trace/session-calls.jsonl` as `auxiliaryEvidence` (`suite-loader.mjs:47-54`);
  - that `await-reply` replaces the contract's foreground wait (`sleep 1`, at most 30 calls, a 30 s
    deadline; `focus-session-contract.md:136-140`), so that bound is not exercised through the stub.
- The observations cover one host build. A later host change needs a new dated addendum, not an edit.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         2 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         6 |    1 |
| Scope           |        0 |         5 |    1 |
| Maintainability |        0 |         0 |    3 |

### Findings

#### Gap analysis (2026-11-03)

All 12 findings were incorporated:

- **Testability, Important:** unobserved read semantics. Bounded observations come first; anything not
  observed is `unrecorded`.
- **Testability, Important:** self-report fields recorded only in prose. These are now a cited
  projection.
- **Error cases, Important:** the restart signal was wrong, and the late, foreign and malformed variants
  were missing. Added the `send-message` `restart-notice` variant and the three reply variants.
- **Testability, Important:** a circular fidelity check. The test now asserts the shapes against the
  evidence block.
- **Data protection, Important:** edits to the spike record. Replaced by a dated addendum with a setup
  row.
- **Architecture, Important:** the test binding understated the suite contract. Reduced to the fields
  `provisionSlot` actually reads.
- **Scope, Important:** an open partial-trajectory decision and an unexplained precedence order. Both are
  now decided.
- **Scope, Note:** the rubric's repository and CI inputs were unnamed. Now named.
- **Maintainability, Note:** a hashing contradiction. Revised in the deep review.
- **Maintainability, Note:** stub mechanics. Now specified: copied lock helpers, the `NO_MAIN` guard, and
  no `.mjs` file in the fixture directory.
- **Error cases, Note:** package 6 handoff gaps. Now listed as open points.
- **Architecture, Note:** factual errors. Corrected.

#### Deep review (2026-11-03)

All 12 findings were incorporated, 4 of them by developer decision:

- **Testability, Important:** the binding would throw in `scenarioBuildIdentity`. Added `extraSeeds`, the
  return shapes and the prompt-region rule.
- **Testability, Important:** comparing `eval verify` output proves nothing for `build-context`. The diff
  criterion against the merge base, widened to all suites' hash inputs, is now the guarantee, with a
  digest comparison as a manual extra.
- **Scope, Important:** the throwaway thread's owner and cleanup were unspecified. Decided: the build
  orchestrator launches it top-level with a fixed prompt, and the developer cleans it up.
- **Data protection, Important:** the plan relied on a read of the working thread. That read is excluded
  as evidence; the committed sources are cited, and the 8-call budget counts from call 1.
- **Testability, Important:** "holds as observed" was not measurable, and the key check tested only a
  subset. Replaced by the behaviour list and equal key sets per object kind; the stub's protocol keys are
  listed separately.
- **Testability, Important:** self-report fidelity rested on a projection, `late` was unobserved, and the
  observed `interactive` value was missing. Now a cited projection, with `late` as a declared stub proxy
  and `interactive` included.
- **Scope, Important:** `held` was unbuildable. Decided: held is served as `none` and labelled Cannot
  judge.
- **Scope, Important:** the partial-trajectory rule voided On track for every running session, with an
  inverted rationale. Decided: only unread existing history voids a label; the example is On track.
- **Scope, Important:** there was no self-report precedence. Decided: Cannot judge → Drifting → Progress
  verified.
- **Maintainability, Note:** hashing contradicted the convention, and the rubric is no instrument input.
  Both are deferred to package 6, with the convention noted.
- **Error cases, Note:** wrong citations. Corrected to `focus-session-contract.md:120-124,142-144` and
  `src/tools/focus.md:79-87`.
- **Testability, Note:** schema-side rejections, nonce count and concurrency. The out-of-range call was
  dropped, nonce-count errors were added, and a concurrency test was added.

## Open points

- No open points.

# Parallelize merge-gate eval rounds

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The merge-gate behavioural evals require repeated fresh-agent runs. The checked-out harness assigns
one machine-global sandbox to each scenario, so different scenarios are already isolated from one
another, but two runs of the same scenario share the skill copy, project checkout, call log, lock,
and archive-number allocation. A second run can therefore append to the first run's log, while a
concurrent `prepare` can archive a partial log and delete the sandbox underneath the running agent.
Two worktrees have the same collision because the path contains no checkout or round identity.

The goal is to prepare and collect a complete eval round as independent `(scenario, slot)` units so
all repetitions and all selected scenarios can run concurrently when the host can supply enough
fresh sessions. This changes the developer workflow and is therefore a Feature. It does not change
the five-of-five evidence bar, the scenario outcome rules, the fact that a single behavioural
deviation is a finding, or the deliberate exclusion of model execution from CI.

The checked-out baseline is `develop` at `538e224` on 2026-09-17. It is seven commits behind the
locally available `origin/develop`: the checkout has three scenarios, while `origin/develop` has
five, including the two unreported-check-list scenarios and sequenced fixture reads. Implementation
must start from the configured source branch `origin/develop`, re-read the current scenario corpus,
and keep scenario discovery dynamic instead of encoding either count. The unrelated untracked
`.pnpm-store/` and existing untracked plan files are outside this change and must remain untouched.

## Architecture decisions

- **One fixed round identity, one sandbox per scenario and slot.** A round receives a
  collision-resistant identifier below the system temporary directory. Its manifest and prepared
  inputs are immutable; retries add attempt directories rather than rewriting history. Every
  selected scenario gets the fixed canonical slots `1..REQUIRED_RUNS`, and every active attempt owns
  its own skill copy, project checkout, fixture, trace, lock, and completion receipt. The path also
  contains the round identifier, which isolates concurrent worktrees without relying on their
  content digests being different.
- **Build once, provision many.** `prepare` creates one pinned-hash portable build in the round and
  scaffolds every slot from that immutable tree. Parallelism must not multiply build work or expose
  `build.mjs`'s fixed swap paths. The scaffold remains dependency-free and may provision cheaply in
  sequence; the expensive fresh-agent executions are the work that needs concurrency.
- **Discover scenarios, then prove corpus parity.** The preparer enumerates `scenarios/*.md` and
  rejects a round unless the selected names have matching fixtures and registered outcome
  evaluators. A shared suite definition owns `REQUIRED_RUNS`; it does not own a hard-coded scenario
  count. Tests assert parity in both directions so a new scenario cannot be silently omitted from a
  batch or from behavioural evaluation.
- **Render prompts from exact templates.** Scenario prompts replace the singleton absolute paths
  with strict skill-root and project-root placeholders. A dedicated renderer requires exactly the
  expected placeholders, rejects leftovers, writes one prompt file per slot, and records its digest
  in the round manifest. Publication archives the rendered prompt beside each canonical run so the
  digest remains independently checkable after the temporary round disappears. The renderer and
  sandbox layout join the build identity's instrument set; otherwise a changed prompt path could
  leave archived evidence bound only to the old template.
- **Keep agent launch at the host boundary.** The repository command prepares prompt files and a
  machine-readable manifest but does not invoke `claude`, `codex`, or another harness. The operator
  or calling host launches each prompt at any supported concurrency in a new, non-forked session
  whose initial working root is the slot project and whose only task input is the rendered prompt.
  Ordinary repository-root sub-agent fan-out is not a valid eval launch because it can inherit the
  conversation or inspect the scenario's expected outcome. After completion, the host supplies a
  receipt attesting the session shape without exposing a task ID, thread ID, session link, or other
  sensitive host identifier; sealing requires and archives its safe fields. The repository verifies
  the receipt's schema and binding but states clearly that the host, not the repository, attests
  epistemic isolation. A host with limited capacity can process the same independent slots in waves
  without changing their identity.
- **Require one execution profile per round.** Preparation records one non-sensitive profile with
  the harness, model, reasoning effort, reported version, and tool policy used for every slot. Each
  host receipt repeats those fields and sealing rejects a missing or mismatched value as invalid
  evidence. Unknown values are explicit rather than omitted and must match across the round. The
  canonical metadata retains this safe profile but no account, task, thread, or session identifiers.
- **Seal completion explicitly.** After a host reports that one fresh-agent task has ended, a
  `seal` operation verifies that the slot has a non-empty call log, a build stamp, no live call-log
  lock, and the expected sandbox paths. It recomputes the loaded skill and immutable fixture/config
  identity from the actual slot copy, excluding legitimate runtime state, before atomically creating
  a per-attempt receipt. The immutable round manifest is never rewritten by parallel seals;
  slot-local locks serialize seal and retry mutations. `status` reports prepared, unsealed, sealed,
  changed-after-seal, and invalid slots but never guesses whether an unsealed agent is still running.
  Publication rechecks every sealed hash, so a late write turns into a loud failure rather than a
  partial archive.
- **Separate invalid evidence from behavioural findings.** Extract the existing generic and
  scenario-specific log judgments into a pure evaluator that returns structured validity problems
  separately from outcome findings. The `node:test` wrapper and round publisher consume the same
  evaluator. Missing, contaminated, wrong-root, stale-build, or scenario-invalid logs may be retried
  as invalid evidence; a valid run with an unexpected merge or other outcome is retained as a
  finding and must never be re-run away.
- **Publish only complete valid evidence as one recoverable generation.** `publish` stages canonical
  `run-1` through `run-REQUIRED_RUNS` logs, rendered prompts, build stamps, and safe run metadata
  beside the repository's result tree. It verifies the complete assembled candidate—not only the
  selected replacements—against the discovered corpus, a fresh current build, exact slot coverage,
  and the pure evaluator before replacing any standing results. Behavioural findings are still
  published, leave the ordinary eval tests red, and make `publish` exit nonzero with a structured
  finding summary; incomplete or structurally invalid evidence replaces nothing. Promotion acquires
  a checkout-scoped results publication lock and assembles a generation with an explicit identifier,
  including unchanged scenarios as well as the selected replacements, then swaps the whole
  `results/` tree through same-filesystem renames. A promotion journal beside the candidate and
  backup records their generation identifiers and every rename phase so a fresh process can recover
  after abrupt termination; do not claim a multi-step portable filesystem swap is atomic.
- **Preserve individual invalid attempts without polluting canonical results.** `retry-invalid`
  quarantines a sealed attempt only after the evaluator classifies it as invalid evidence;
  `retry-aborted` separately requires the host to attest that an unsealed task was cancelled or
  completed and permits reprovisioning only when no non-empty log exists. If any non-empty log is
  present, the command refuses and requires sealing plus evaluation first; a structurally valid log
  is retained even when the host labelled the task aborted. Both retry paths retain the attempt and
  reason before provisioning a new attempt for the same canonical slot. Neither may reset a valid
  behavioural finding. The special sequenced scenario retains its documented stop rule: more than
  five discarded attempts to obtain five valid runs stops the round for investigation rather than
  looping indefinitely; no new global retry ceiling is invented for the other scenarios.
- **Retire the archive-on-next-prepare handshake.** A single round CLI owns `prepare`, `status`,
  `seal`, `retry-aborted`, `retry-invalid`, and `publish`. The old package command remains only as a
  compatibility forwarder: it prints a visible deprecation notice and delegates its scenario
  argument to `round prepare --scenario <name>`. It contains no sandbox, archive, or publication
  logic of its own. The final interface is documented once and has one source of lifecycle truth.

## Affected files

| File                                            | Description                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                  | Expose the cohesive round command and retain the old preparation command as a visibly deprecated forwarder.                                                             |
| `evals/merge-gate/prepare.mjs`                  | Replace the singleton archive/re-scaffold handshake with the documented compatibility forwarder only.                                                                   |
| `evals/merge-gate/round.mjs`                    | New thin CLI for round preparation, status, sealing, aborted/invalid-attempt retry, recovery, and transactional publication.                                            |
| `evals/merge-gate/_scaffold/round-core.mjs`     | Importable lifecycle and manifest logic, path containment, sealing, staging, promotion, and rollback.                                                                   |
| `evals/merge-gate/_scaffold/suite.mjs`          | Shared run count, scenario discovery, selection, and fixture/evaluator parity contract.                                                                                 |
| `evals/merge-gate/_scaffold/prompt.mjs`         | Strict prompt extraction, placeholder rendering, and prompt hashing.                                                                                                    |
| `evals/merge-gate/_scaffold/sandbox.mjs`        | Derive paths from a generated round identity, scenario, and fixed slot instead of one scenario-global directory.                                                        |
| `evals/merge-gate/_scaffold/scaffold.mjs`       | Provision one slot from the round's already-built immutable skill tree while retaining a narrow CLI seam if tests need it.                                              |
| `evals/merge-gate/_scaffold/build-identity.mjs` | Bind the prompt renderer and revised sandbox/scaffold inputs into instrument identity and support one shared build per round.                                           |
| `evals/merge-gate/_scaffold/evaluate.mjs`       | New pure validity/outcome evaluator shared by publication and `node:test`.                                                                                              |
| `evals/merge-gate/scenarios/*.md`               | Replace fixed singleton paths inside prompt regions with the renderer's strict placeholders; do not expose expected outcomes.                                           |
| `evals/merge-gate/results/**`                   | Re-record canonical logs, rendered prompts, stamps, and safe metadata after the instrument change, five valid runs per current scenario.                                |
| `evals/merge-gate/README.md`                    | Document the round lifecycle, parallel host launch, capacity-limited waves, recovery, publication semantics, and remaining launcher boundary.                           |
| `test/merge-gate-eval.test.mjs`                 | Wrap the shared evaluator, read per-run metadata for runtime-root validation, assert exact canonical slot coverage, and keep every existing scenario outcome assertion. |
| `test/eval-fixture-fidelity.test.mjs`           | Retain the per-log lock and sequenced-operation concurrency guarantees; adjust imports only if evaluator or suite ownership moves them.                                 |
| `test/merge-gate-eval-round.test.mjs`           | New focused tests for round isolation, prompt rendering, sealing, retries, concurrent preparation, and transactional publication/rollback.                              |

## Implementation details

### Approach

1. **Rebase the implementation context and inventory the live suite.** Start from
   `origin/develop`, compare the current scenario, fixture, result, and outcome-evaluator sets, and
   record the current `REQUIRED_RUNS`. Stop and revise this plan if upstream has replaced the
   call-log evidence model or the fresh-session requirement. Preserve all unrelated working-tree
   files.
2. **Extract suite discovery and prompt rendering without changing execution.** Move the prompt
   region parser into the strict renderer, introduce skill/project placeholders in every current
   scenario, and add two-directional corpus parity checks. Render a temporary single-slot prompt and
   prove that it differs from today's prompt only in its sandbox root before removing the fixed-path
   path.
3. **Make sandbox provisioning slot-aware.** Change `sandboxPaths` to require a round root,
   validated scenario name, and bounded integer slot. Split building from provisioning so the round
   coordinator calls `buildPortableSkill` once and passes the resulting read-only tree to each
   scaffold. Keep every stub log and lock private to one slot; do not share a project checkout or
   runtime-state directory between agents.
4. **Define the round manifest and lifecycle.** The immutable manifest records a schema version,
   generated round identifier, ephemeral physical creator checkout, selected scenario set, required
   slot count, one declared execution profile, build identities, prompt digests, and absolute slot
   paths. Per-slot attempts and seal receipts are separate files created atomically; slot locks
   protect retry/seal transitions without a shared manifest rewrite. Resolve user-supplied round
   handles only through their manifest below the physical round base; reject traversal, symlink
   escape, mutation from another checkout, unknown scenarios, duplicate slots, and malformed state
   before any mutation. Another checkout may inspect a round read-only but cannot adopt or publish it
   in the initial implementation.
5. **Implement `prepare`, `status`, and host handoff.** `prepare` accepts an optional scenario list
   and otherwise selects the full discovered suite. It requires one execution profile for the round,
   creates all fixed slots and prompt files, then prints the manifest path and a concise launch table.
   `status` is read-only. Neither command starts a model or reads expected-outcome prose. Define the
   safe host-receipt schema and document how an orchestrating host creates matching non-forked
   sessions rooted in their slot projects, provides only the rendered prompts, fans them out without
   repository-root sub-agent inheritance, and calls `seal` with the receipt only after each session
   returns.
6. **Extract the structured evidence evaluator.** Preserve every existing generic check and
   scenario-specific outcome, including build binding, schema, runtime-root containment, undefined
   supported operations, positive-control semantics, the observer-only branch, and sequenced-read
   validity. Return deterministic diagnostics classified as `invalid-evidence` or
   `behavioural-finding`; make the current tests assertions over that result before changing
   publication.
7. **Implement sealing and explicit retries.** Recompute the actual slot's load-set and immutable
   fixture/config identity, then seal a finished attempt atomically with the log, build-stamp, prompt,
   and metadata digests. A changed-after-seal slot cannot publish. Permit `retry-invalid` only after
   the evaluator classifies sealed evidence as invalid. Permit `retry-aborted` only with an explicit
   host assertion that the unsealed task has stopped and only when it has no non-empty log. A present
   non-empty log forces the ordinary seal/evaluate path regardless of the host label, so a valid
   behavioural finding cannot be rerun away. Move an eligible attempt to round-local quarantine,
   retain its reason, reprovision the same canonical slot, enforce only the sequenced scenario's
   existing discard ceiling, and refuse retries for valid behavioural findings.
8. **Implement staged publication and recovery.** Assemble a complete candidate `results/`
   generation with exact slot filenames, rendered prompts, and run metadata, carrying forward every
   unselected scenario. Rebuild once to reject source drift, then validate the complete candidate
   against the discovered corpus and current identity, including exact coverage for every populated
   scenario and the documented zero-run skip semantics for an absent scenario. Under one
   checkout-scoped publication lock, journal each generation identifier and phase before renaming
   the current generation to a backup and the candidate into place. Handled errors restore or
   preserve the old generation; an interrupted process leaves enough state for a fresh process to
   finish or roll back from observed generation IDs without guessing. Publish valid behavioural
   findings rather than filtering them, then exit nonzero with their structured summary and let
   `test/merge-gate-eval.test.mjs` report the same red outcome.
9. **Remove the singleton workflow and update operator documentation.** Replace the old preparer with
   a warning compatibility shim that forwards `<scenario>` to `round prepare --scenario <scenario>`;
   test its argument mapping and ensure it owns no lifecycle logic. Document only the round lifecycle.
   Explain that cross-scenario isolation already existed, while round and slot names now make
   same-scenario and cross-worktree concurrency safe. State quota/capacity limits, the fresh-session
   rule, sealing order, invalid-attempt handling, and the fact that no speed alone proves
   independence.
10. **Re-record the invalidated suite through the new path.** Prepare the current scenario set,
    launch its slots concurrently up to available host capacity, seal every completed task, replace
    only structurally invalid attempts, publish the complete evidence, and retain every valid
    behavioural deviation. Record per-scenario counts and the observed overlap in the delivery
    report without turning elapsed time into a pass criterion.

### Component structure

The round CLI is a thin entry point over importable coordination helpers. Sandbox/scaffold/prompt
modules own pre-run inputs; the existing tracker stub owns only one slot's call log; the evaluator
owns post-run interpretation; and the `node:test` file owns test reporting. No component both
produces and silently grades its own evidence, and no scenario assertion is copied into the CLI.

### State management

Each canonical slot points to an append-only attempt history whose active attempt moves through
`prepared -> sealed -> published`. An unsealed attempt may have no log or a growing log; the tool
reports that observation without assigning a running/failed state it cannot know. Sealing creates a
slot-local receipt after the host knows the agent has returned. Structurally invalid sealed evidence
may move through quarantine to a new prepared attempt; a host-confirmed stopped unsealed attempt uses
the separate aborted path; a behavioural finding may use neither. Publication is the only operation
that mutates tracked `results/`, and the checkout-wide publication lock serializes complete
generation promotion across rounds.

### Edge cases

- Two rounds prepared simultaneously from the same checkout, or from byte-identical worktrees, must
  receive different physical roots and cannot see or archive each other's logs.
- Two slots of the same scenario may call the stub concurrently; their per-slot locks and sequence
  counters remain independent, while concurrent calls within one slot retain the existing lock.
- A source, fixture, prompt-template, renderer, or instrument change after preparation invalidates
  publication; the round remains inspectable and standing evidence remains untouched.
- A task that never starts, is cancelled, or finishes without a log remains unsealed and cannot be
  mistaken for a refusal.
- A host may report a task as aborted, but `retry-aborted` refuses while a non-empty log exists. The
  log must be sealed and evaluated, and a structurally valid behavioural finding remains canonical.
- A late stub write after sealing changes the recorded digest and blocks publication.
- A valid unexpected outcome is published and fails the behavioural assertion; it is not eligible
  for retry or replacement as variance, and `publish` returns a nonzero finding result after the
  generation is safely in place.
- Parallel `seal` calls write independent receipts and cannot overwrite one another. Two rounds that
  reach publication together serialize on the checkout-wide publication lock.
- A handled failure halfway through promotion restores the previous result generation. A process
  interruption is detected from the journal on the next command; a recovery failure keeps the
  backup and candidate paths and stops instead of guessing.
- macOS `/tmp` versus `/private/tmp` normalization remains supported for archived runtime roots.
- An unavailable parallel-agent mechanism degrades to running the same isolated slots serially or
  in smaller waves; it does not change evidence semantics.

## Acceptance criteria

- [x] One preparation command discovers the live scenario corpus and creates exactly
      `selected scenarios x REQUIRED_RUNS` uniquely addressed sandboxes and prompts from one fresh
      pinned-hash build.
- [x] All current scenarios have matching fixtures and outcome evaluators, enforced in both
      directions; neither the checked-out count of three nor the upstream count of five is encoded
      as the suite size.
- [x] Two same-scenario slots, two different scenarios, and two independently prepared rounds can
      execute overlapping stub calls without shared projects, logs, locks, sequence positions, or
      archive names.
- [x] Every archived run is bound to its rendered prompt, exact project root, slot metadata, build,
      instrument, and scenario inputs; sealing recomputes the actual slot inputs, and the existing
      runtime-root checks consume archived metadata rather than a singleton path.
- [x] Every slot in a round declares the same harness, model, reasoning effort, reported version,
      and tool policy; a missing or mismatched receipt field is invalid evidence and cannot publish.
- [x] Incomplete, unsealed, changed-after-seal, stale-build, contaminated, and otherwise invalid
      evidence cannot replace any canonical result; handled publication failures preserve the prior
      generation, concurrent publishers serialize, and an interrupted promotion is deterministically
      recoverable from its journal and observed generation identifiers.
- [x] A structurally valid behavioural deviation is retained, is ineligible for invalid-attempt
      or aborted-attempt retry, can be published, and causes the ordinary eval test to fail visibly;
      the same rule applies to a valid non-empty log from a host-labelled aborted task.
- [x] Canonical results contain exactly `REQUIRED_RUNS` numbered logs, build stamps, and metadata
      records plus rendered prompts per published scenario, with no stale extras from an earlier
      round; the complete candidate is validated before promotion.
- [x] The existing five-of-five rule and every current scenario-specific assertion remain
      behaviourally unchanged, including the positive control and sequenced-read invalidity rule.
- [x] Repository tests prove independent prompt/slot manifests, safe serial/wave fallback, and
      rejection of absent, malformed, mismatched, or sensitive host-receipt fields. The documented
      host contract launches a non-forked session from the slot project with only the rendered prompt;
      the receipt attests that boundary, while the repository command never launches a model.
- [x] **Manual/model-backed acceptance:** the newly recorded evidence contains five valid runs for
      every current scenario and the full repository validation sequence passes.

## Validation plan

- Add deterministic unit tests in `test/merge-gate-eval-round.test.mjs` using temporary round and
  result roots. Spawn concurrent preparers and stub processes to prove path/log isolation, and inject
  failures before and during promotion to prove rollback and preservation of standing results.
  Launch concurrent seals and publishers to prove receipt and publication locking. Run publication
  in a child process, terminate it after each journal/rename boundary, and invoke recovery in a fresh
  process rather than treating caught exceptions as crash evidence.
- Adversarially remove or duplicate a prompt placeholder, fixture, outcome registration, slot,
  stamp, seal receipt, and metadata file; each case must fail before canonical results change.
- Seal a slot, append one record, and confirm publication rejects the changed digest. Feed one
  structurally invalid log and one valid behavioural deviation through the shared evaluator; only
  the former is retryable and the latter remains a red publishable result. Leave the valid finding
  unsealed, report its task as aborted, and confirm `retry-aborted` refuses until it is sealed.
- Run the focused checks:
  `node --test test/merge-gate-eval-round.test.mjs test/eval-fixture-fidelity.test.mjs test/merge-gate-eval.test.mjs`.
- Run the repository sequence from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  then `pnpm test:distribution`.
- Use the new round flow to create fresh evidence for every current scenario. In the delivery report,
  state the round identifier, source revision, scenario and valid-run counts, focused/full check
  results, and whether same-scenario and cross-scenario log intervals overlapped. Do not claim a
  speedup from setup timestamps alone.

## Assumptions and open points

- **Decision:** Fresh-session isolation uses a non-forked host session rooted in the slot project,
  with only the rendered prompt as task input and a safe host attestation archived at seal time. The
  repository does not add a harness-specific launcher and does not present the receipt as independent
  proof of what a host supplied.
- **Decision:** Every round declares one execution profile comprising the harness, model, reasoning
  effort, reported version, and tool policy. Every host receipt must match it; heterogeneous profiles
  require separate rounds and therefore separate five-run evidence sets.
- **Decision:** `pnpm prepare:merge-gate-eval <scenario>` remains as a visibly deprecated
  compatibility forwarder to `round prepare --scenario <scenario>`. It retains no singleton
  preparation or archive behavior.
- **Assumption:** “parallelization” includes collision-free preparation, host-driven concurrent
  sessions, sealing, and publication. The original implementation rejected an unproven launcher and
  no portable launch API exists in this repository today.
- **Assumption:** `REQUIRED_RUNS` remains five. Changing the evidence threshold is a separate
  statistical and policy decision, not part of reducing wall-clock time.
- **Assumption:** model quota and host concurrency are external limits. The implementation permits
  full parallelism but does not promise that every host can run every slot simultaneously.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    3 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, note:** The smallest safe design is an immutable round manifest, append-only
  per-slot attempts and receipts, isolated sandboxes, and a separate checkout-wide publication lock.
  A shared skill or project tree plus per-agent environment variables would still collide.
- **Architecture, note:** The selected host boundary requires a non-forked session rooted in the slot
  project, only the rendered prompt, and a safe host receipt. That is an explicit attestation model,
  not a claim that repository code can independently inspect a host session's hidden context.
- **Architecture, note:** A round now pins one execution profile and treats receipt drift as invalid
  evidence. Comparing another harness, model, reasoning level, version, or tool policy requires its
  own round and its own five-run evidence set.
- **Data protection, note:** The creator checkout is ephemeral orchestration data. Committed metadata
  may contain safe source/profile fields and `/tmp` runtime roots, but never local home paths, task
  IDs, thread IDs, or session links.
- **Error cases, notes:** Aborted unsealed work and evaluator-invalid sealed evidence need different
  retry operations. Behavioural findings must be published and return nonzero instead of leaving old
  green evidence standing.
- **Testability, notes:** Deterministic concurrent-process tests prove isolation and locking; abrupt
  child-process termination at every promotion boundary proves crash recovery. A faster manual round
  is useful operational evidence but is not itself an acceptance test.
- **Scope, note:** The run-count policy and behavioural scenario set stay unchanged.
- **Scope, note:** The old package command is a deprecation forwarder only; keeping a second singleton
  lifecycle is explicitly forbidden.
- **Maintainability, note:** Dynamic discovery and two-way parity prevent the upstream scenario set
  from drifting away from fixtures or evaluators.

## Open points

- No open points.

## Test results

**Date:** 2026-09-17
**Run:** `effective-flow apply`, executed on
`effective-flow/build/parallelize-merge-gate-eval-rounds` from
`origin/develop@2874b848651d040fa5efbd79abccbcbccaa79dad`.

| Check                    | Result                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| Focused eval checks      | 56/56 tests passed                                                       |
| `pnpm agent:check`       | Passed; all 423 checked files are correctly formatted                    |
| `pnpm test`              | Passed; 949/949 tests                                                    |
| `node build.mjs`         | Passed; Claude, Codex, and portable targets built within context budgets |
| `pnpm test:distribution` | Passed; isolated offline distribution checks completed successfully      |
| `git diff --check`       | Passed                                                                   |

Model-backed round `mu5c8ae6-a70138c2-46ca-407f-9bd5-617c98e53e66` prepared all five
discovered scenarios with five slots each under one pinned build and execution profile. All 25
canonical slots sealed and published as generation `664766a7-613e-4d91-b851-e61369ed191d`;
every scenario satisfies the unchanged five-of-five rule. Invalid attempts with missing runtime-root
evidence were quarantined and retried, while one capacity failure that produced no log followed the
separate aborted-attempt path. No behavioural finding was rerun.

The published tracker-call intervals contain eight same-scenario overlaps and 38 cross-scenario
overlaps. This proves that isolated slots performed work concurrently; elapsed time itself remains
outside the correctness criterion.

## Review findings

**Date:** 2026-09-17
**Reviewer:** Node.js reviewer and `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    10 |
| Open / Not implemented |     0 |

The bounded review rounds closed lifecycle-schema and operation-parity gaps, exact privacy-safe
receipt validation, strict prompt multiplicities, crash-safe slot transitions, physical path
containment, CLI flag validation, atomic tokenized locks, serialized recovery and publication, and
the final late-write/source-drift window immediately before promotion. The independent final review
rechecked locking, retries, crash recovery, atomic publication, provenance binding, containment, and
sensitive metadata and reported no remaining Critical or Important findings.

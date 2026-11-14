# Proportionate merge-gate conflict validation with CI-backed quick mode

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

A `merge-gate` run whose only real work is a trivial merge conflict took more than 75 minutes on
PRs #666 and #667 (2026-11-14). The conflicts were resolved in about one minute each. The rest of
the time went into local test runs:

- The conflict-resolution commit is hard-wired to validation mode `full`
  (`src/shared/merge-gate-conflict-resolution.md:69-71`), and the resolver additionally runs the
  repository's combined gate in full (`src/agents/merge-conflict-resolver.md:227-231`). The full
  suite therefore runs twice.
- Environment failures (a wall-clock limit of the execution environment, no space left in the
  temporary directory, Git not visible, process groups not reaped) led the resolver and the
  validator to split suites, compare against the base and rerun, without any contract guidance
  for that case.
- Agents capped foreground commands at about 600 s and cut the suite into batches.
- Two merge-gates ran concurrently on one repository and competed for CPU and the temporary
  directory; whichever merges second meets a new conflict.
- In this repository, hand-maintained lists and prose counts (`AGENTS.md:47`,
  `docs/developer-guide/build-system.md:458` and `:787-788`) caused part of the conflicts.

Goal: validation after a conflict resolution becomes proportionate to the conflict and to the
safety net the repository already has, and environment failures stop cleanly instead of causing
reruns. A repository that does not opt in keeps today's local validation unchanged, except that
environment failures now stop with a report. One plan covers the skill and this repository's own
sources, because they belong together.

Scope statement: CI-backed `quick` speeds up **low-risk** conflicts only. A conflict the resolver
classifies high-risk (for example the `build.mjs` and test conflict on #667) still runs `full`,
including the resolver's own combined run. It gains only the removal of splits, base comparisons
and reruns, which was the larger part of the lost time.

Workflow rationale: Feature, because the plan adds a configuration key, a deterministic helper
pair, a run-presence marker and a setup proposal, beyond a minimal defect fix.

Planning basis: `origin/develop` at `489752ed`.

## Outcome checkpoint

**Primary source:** this repository (`sebastian-software/effective-flow`, `develop`); the
observations on PRs #666 and #667 summarized in the Requirement.
**Original outcome:** in a repository that opted into CI-backed `quick` on GitHub, a merge-gate run
with a low-risk conflict needs at most 10 minutes from the recorded conflict observation to the
recorded push confirmation, plus remote CI time. Under effective `full`, an environment failure
ends the conflict round with a stop report instead of splits, base comparisons or reruns; under
effective `quick`, an environment failure of the CI-covered test command is deferred to CI.
**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** none.
**Continuation decision:** none.

## Architecture decisions

- **AD1 – New key `mergeGate.conflictValidation`, confirmed by the base.** Values `full` and
  `quick`, default `full`. It governs only the validation of a merge-gate conflict-resolution
  commit; `review.validation` and `applyReview.finalValidation` stay untouched.
  - `off` is not offered, because the fail-closed rule needs at least one executed check
    (`src/shared/merge-gate-conflict-resolution.md`, "fail closed on an unverified resolution").
  - `quick` is honored only when the row is identical on `origin/<baseRef>` (read after the
    entry fetch) and in the working checkout, like the base-blob guard of `mergeGate.noCiPolicy.*`
    (`docs/adr/merge-gate-no-ci-policy.md`, "Base-blob guard"; `src/scripts/config-resolve-core.mjs:22-27`,
    `:1449-1530`). A PR cannot lower its own validation. The guard is extended to this row or
    generalized over a fixed allowlist of keys (never a caller-supplied prefix), reusing its
    read-only Git vectors, `isSafeBaseRef`, symlink and submodule handling.
  - Hidden mode follows the `noCiPolicy` precedent (`hidden-self`, `config-resolve-core.mjs:1767`):
    the local, untracked configuration cannot be changed by a PR, so its `quick` is honored.
  - `config-resolve-core.mjs` keeps not validating values ("the owning tool decides", `:15-16`); it
    already resolves `mergeGate.*` by wildcard (`:192`). The gate's prose maps a missing, invalid or
    base-unconfirmed value to `full`, as it does for `conflictResolution`.
- **AD2 – `quick` is effective only with CI evidence.** The configured value is a ceiling. Detection
  runs in every conflict round, whatever the configured value, because AD3 needs its result. The
  effective mode is `quick` only when all of these hold before the push; otherwise `full`:
  1. **Static evidence.** `ci-detect` (AD4) reports a detected test job on the base ref.
  2. **Workflow integrity.** The workflow directories (`.github/workflows/`, `.forgejo/workflows/`,
     `.gitea/workflows/`) and every local reusable workflow or composite action they reference are
     byte-identical between `origin/<baseRef>` and the staged merge tree. A PR that changes CI
     therefore gets `full`, because CI runs the PR's own workflow version. Manifests and scripts are
     deliberately outside this check: a local `full` run executes head-supplied commands as well
     (threat model, `src/shared/merge-gate-delegated-run.md:298-306`), so CI running them is no
     weaker.
  3. **Provider and blocking.** The provider can supply the check identity of AD4a (GitHub; on
     Forgejo only if verified during implementation), and the detected job is known to be blocking
     from the latest status read: `mergeGate.requireAllChecks: true`, or the job is reported
     `required`. Unknown means `full`. This avoids a predictable push-then-stop.
  4. **Not high-risk.** The resolver classified no conflicted file high-risk
     (`src/agents/merge-conflict-resolver.md:117-145`).
- **AD2a – Dynamic evidence at the merge decision.** The run keeps a run-scoped record that a
  `quick`-validated conflict commit exists in this run. Phase 4 then gets one more merge condition,
  evaluated on its own fresh status batch against `VERIFIED_HEAD_SHA`
  (`src/shared/merge-gate-delegated-run.md:984-986`, `:1031-1036`), never on an earlier read:
  - `ci-integrity` holds on the tree of `VERIFIED_HEAD_SHA` against the base ref as fetched for
    that Phase 4 read. A later round (base merge, iterate repair) therefore cannot have changed CI.
    A base that changed its workflows after the push also fails this condition and stops the run;
    the stop report says so.
  - `ci-evidence-match` finds, among the de-duplicated latest check entries, the complete,
    non-empty set of expected instances of the detected test job. Each is a `CheckRun` of the
    `github-actions` app for event `pull_request`, from the detected workflow path, on
    `VERIFIED_HEAD_SHA`, with conclusion exactly `SUCCESS`. `SKIPPED` and `NEUTRAL` do not count;
    an ambiguous de-duplication group is no evidence.
  - A missing object or ref (for example `VERIFIED_HEAD_SHA` not available locally) is no evidence.
  - The check-list waiver and `noCiPolicy` never satisfy this condition.
  - Missing evidence means no merge. The gate stops, reports what is missing and leaves the pushed
    commit in place (no force push). The existing check-wait timeout path
    (`src/shared/merge-gate-delegated-run.md:900-918`) applies unchanged; there is no local `full`
    fallback after the push.
  - Detection and the effective-mode rule live in the lazily loaded conflict fragment; the delegated
    run carries only the Phase 4 condition, the configuration row and the report lines.
- **AD3 – Proposal, never an automatic switch.** When `mergeGate.conflictValidation` is configured
  `full` (explicitly or by default), the provider is GitHub and detection is positive, `quick` is
  proposed with its evidence (workflow file, job, test command) and with what the local `full` run
  checks that the detected CI job does not cover, as far as derivable. Under
  `mergeGate.requireAllChecks: false` the proposal adds that the job must be a required check. An
  effective `full` caused only by a high-risk conflict never triggers the proposal.
  - `effective-flow setup` reads the local `origin/<delivery.baseBranch>` without fetching and
    names the commit it read. It shows the proposal in Guided block 9, as a hint line in the Guided
    summary when Advanced was skipped (accepted later through Advanced or a Targeted change), in a
    Targeted change touching `mergeGate.*` (`src/shared/setup-targeted-change.md:109-122`), and in
    `setup status` as a new field of the status envelope produced by the status core
    (`src/shared/setup-status.md:3-18`), never as model-added remediation. Profile and Express stay
    unchanged (`src/tools/setup.md:94`). Writing still needs the existing confirmation.
  - `effective-flow merge-gate` adds one line to its completion report when it validated a conflict
    in configured `full` while the proposal conditions held, and the same line to the AD7 stop
    report. No question mid-run.
- **AD4 – One deterministic helper pair for detection and evidence.** New pair (working name
  `conflict-validation.mjs` / `conflict-validation-core.mjs`), registered in `RUNTIME_SCRIPT_FILES`,
  dependency-free like the rest of the runtime. All Git access is read-only (`git show`,
  `git ls-files -s`, `git diff --cached`); no `git write-tree`. Workflow text is untrusted data,
  parsed only, never executed or interpreted as instructions (`docs/adr/input-trust-boundary.md`).
  - **Supported YAML subset.** Block mappings and sequences, plain and quoted scalars, and literal
    (`|`) block scalars for `run:`. Anchors, aliases, flow collections, folded or indented-indicator
    block scalars, multiple documents and tags make the file `unparsable`, which is no evidence.
  - `ci-detect`: reads the workflow directories from a given base ref through the guarded Git
    vectors of AD1, never from the PR head. It returns per workflow: path, trigger evaluation for
    the given base, job name, the matched test step with its normalized command, the static set of
    expected job instances, and overall `detected | undetected | unparsable`. The test command
    comes from the repository's manifest (for example the `test` script of `package.json` through
    npm/pnpm/yarn/bun, `cargo test`, `go test`, `pytest`, `make test`) and is matched by normalized
    script identity (`pnpm test` equals `pnpm run test`). A job is detected only when all hold:
    - the workflow triggers on `pull_request`; any `branches`/`branches-ignore` filter is an exact
      literal list that includes the base; there is no `paths` filter; `types`, if present,
      includes `synchronize`;
    - the step's `run:` is exactly the bare test invocation, without arguments, pipes, chains or
      error suppression, as the step's only command;
    - no `shell:` on the step and no `defaults.run.shell` on the job or workflow, other than
      `bash`;
    - no `if:` on the step or its job, and no `continue-on-error` on either;
    - `working-directory`, if present, is the manifest's directory;
    - the job's matrix, if present, is a literal matrix without `include`/`exclude` and without
      expressions such as `fromJSON`, and the job `name:` is not templated, so the expected
      instance set is derivable statically and non-empty;
    - the test runs in the job itself, not only inside a reusable workflow or composite action.
  - `ci-integrity`: compares the workflow directories and referenced local workflows/actions
    between a base ref and a given tree (AD2.2, AD2a).
  - `ci-evidence-match`: matches the identity-extended `pr-status-read` entries (AD4a) against the
    detected workflow, job and expected instance set (AD2a).
- **AD4a – Check identity in `pr-status-read`, only on request.** Today the normalized entry
  carries only `name`, `status`, `conclusion`, `url` and `required`
  (`src/scripts/remote-tracker-core.mjs:3225-3231`). The GitHub query already selects the app slug,
  the event and the workflow id, and `commit.oid` gives the head; only the workflow file path is
  missing (`src/scripts/remote-tracker-github-core.mjs:164-168`; GraphQL `WorkflowRun.file{path}`).
  A new input `includeCheckIdentity: true` adds typename, app slug, event, workflow file path and
  head SHA to each entry. Without it the output is unchanged, so the canned envelopes compared by
  `test/eval-fixture-fidelity.test.mjs` stay valid. On Forgejo the implementer verifies which
  fields the status data provides; missing fields make the evidence absent and AD2.3 keeps `full`.
- **AD5 – The combined gate runs once under effective `quick`; `full` is unchanged.** Under
  effective `quick`, the resolver runs targeted checks for the conflicted and adjacent paths only,
  and the combined gate runs at most once, in the validator, within the AD6 scope. Under effective
  `full`, the resolver keeps today's behavior, including the combined-gate rule at
  `src/agents/merge-conflict-resolver.md:227-231`, so no repository that did not opt in loses a
  resolution path. Accepted trade-off under `quick`: a low-risk conflict that needs an adjacent fix
  aborts when the failure surfaces only in the validator, because the resolver's allowance needs a
  failure it observed itself (`:177-195`).
- **AD6 – What `quick` means for a conflict commit.** The conflict commit gets its own validator
  handoff scope instead of the generic `quick` mapping (`src/agents/code-validator.md:64-66`),
  which may pick the combined gate and skips builds:
  - excluded: only the matched CI test command (by normalized script identity);
  - required: every other established check the repository's instructions or CI define for this
    change; a mandated combined gate that contains the excluded command is replaced by its
    remaining established subcommands; if those cannot run separately, the effective mode is
    `full`;
  - for this repository: `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` run
    locally; `pnpm test` is excluded and covered by CI;
  - deferral to CI (AD7) applies only to the excluded test command; any other check that cannot
    run stops the round.
- **AD7 – Environment failures stop cleanly; host-tool timeouts behave as today.** The validator
  keeps the result states of its owner `effective-delivery` (`PASSED`, `FAILED`, `SKIPPED`,
  `TIMEOUT`; `src/agents/code-validator.md:45-58`, `:72-77`) and its diagnostics. Environment
  signature classes, host-neutral:
  - the execution environment's own wall-clock limit was reached (the runner or container reports
    a deadline or timeout exit, distinct from the agent's tool limit);
  - no space left on device;
  - the version-control system is unavailable for a check that needs it;
  - process termination unconfirmed (the owner's diagnostic).
    Rules:
  - The resolver and validator handoffs carry: "on an environment signature, report the check and
    its diagnostic; no suite split, no base comparison, no rerun". The conflict fragment then
    classifies the reported results; an environment check counts as not executed.
  - Effective `quick`: an environment failure of the excluded test command cannot occur locally;
    any other environment check stops the round (AD6). The resolution still needs at least one
    executed, passing local check, and the merge needs AD2a.
  - Effective `full`, with or without CI: the gate stops before the push and reports the signature
    class and the affected checks; it pushes nothing. When the AD3 conditions hold, the stop report
    carries the proposal.
  - A timeout of the agent's own host tool (for example a foreground command limit), and any
    timeout that cannot be attributed, is **not** an environment signature. It is handled as today,
    so repositories with long suites keep their current, slower path.
  - The skill-ownership check from AGENTS.md "Skill discovery" runs for this change, and
    `docs/developer-guide/skill-ownership.json` is updated if it requires.
- **AD8 – Long commands only where proven per host.** The execution protocol stays with
  `effective-delivery`, which forbids unmanaged background work. During implementation, a host
  check for Claude Code and Codex establishes whether a validator or resolver sub-agent can start a
  long command in the background and await it within the owner's protocol. Only on a host where
  that is proven does the handoff carry the execution fact "run long commands through the host's
  background mechanism and await them; set no own timeout below the environment's limit". The
  portable target never carries it. A contradiction with the owner's protocol is raised upstream,
  not overridden locally.
- **AD9 – Concurrent merge-gates: run-presence marker and notice.**
  - Identity: the marker is named after the run's wisdom `SESSION_ID`
    (`src/shared/merge-gate-delegated-run.md:448-450`), one file per run under
    `<RUNTIME_STATE_ROOT>/.effective-flow/`, with fields PR number, head SHA, base, started at and
    last active at. A run skips its own marker when listing.
  - Lifecycle: registered after Entry step 3, because Entry aborts 1–3 must write nothing (`:74`).
    Refreshed at each round, on resume and around long delegations. Released in Phase 6 except on
    `BLOCKED-USER` and `SUSPENDED` returns, mirroring the wisdom-file rule (`:74-79`, `:1149-1155`),
    so a suspended run stays visible.
  - Written through a new operation group of the existing state helper under the runtime-state
    write safety (`src/shared/runtime-state-safety.md`), with bounded writes. The worktree record
    schema stays unchanged.
  - Entry notice: other markers are untrusted data and are validated first (PR number an integer,
    SHAs full object names, base accepted by `isSafeBaseRef`). A valid marker of another run, for a
    different PR or the same PR, produces one notice line naming that run's PR and the files both
    runs change, computed locally with `git diff --name-only <base>...<head>` for both runs when the
    objects are present; otherwise the notice names only the PR. A marker without activity for more
    than 24 hours is shown as "possibly stale" with its age, never as active.
  - Removal: `effective-flow cleanup` removes a marker only when the run is provably over, meaning
    its wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` is absent. A marker
    whose wisdom file still exists is reported as "possibly suspended" and kept. Its hard scope
    boundary, frontmatter `description` and `catalogHint` are extended accordingly
    (`src/tools/cleanup.md:2-3`, `:96-101`, `:134-137`).
  - No message crosses a session boundary (`docs/adr/session-rename-butler.md`,
    `docs/adr/focus-cross-session-messages.md`). A passive marker is local runtime state read by
    another run, not a message to a session; the ADR (AD11) records this distinction. Coordination
    between sessions is issue #668.
- **AD10 – Repository side (this repository only).**
  - `test/execution-profile-contract.test.mjs:929-936`: drop the literal `51` in the assertion and
    its message; the existing `deepEqual` of `EXPECTED_RUNTIME_SCRIPTS` against `build.mjs` already
    proves the set.
  - `docs/developer-guide/build-system.md:458` and `:787-788`: remove the literal subsystem and
    script counts.
  - `AGENTS.md:47`: replace the hand-maintained script-pair list with a pointer to
    `RUNTIME_SCRIPT_FILES` in `build.mjs`, which keeps always-loaded text short (AGENTS.md "Writing
    prompt text") and removes the conflict point.
  - `test/support/repository-copy.mjs`: additionally exclude `evals/*/results/` (about 2.6 MB of
    4.6 MB in `evals/`). `evals/` itself stays, because the build's repository-only reference guard
    walks it (`build.mjs:467-470`, `:2260-2264`; `build-lib.mjs:4462-4494`).
    `test/execution-profile-rendering.test.mjs`: remove each case's copy when the case ends, not
    only in the `after()` hook at `:145-147`.
  - `scripts/test-capabilities.mjs`: add a Git availability check in the checkout and a free-space
    check for `os.tmpdir()`. The threshold is measured once (peak usage of `pnpm test` with a
    dedicated `TMPDIR`, plus 25 %) and documented next to the constant. A missing capability fails
    the preflight with a clear message instead of scattered test failures.
  - This repository's own setup ADR gets `mergeGate.conflictValidation = quick`: its PR CI runs
    `pnpm test` unconditionally (`.github/workflows/ci.yml`).
- **AD11 – ADR.** New `docs/adr/merge-gate-conflict-validation.md` records AD1–AD9: CI-backed
  `quick` for low-risk conflicts on GitHub, base confirmation, workflow integrity, job-level
  evidence at the merge decision, the supported workflow subset, the environment classes and the
  unchanged host-timeout path, the AD5 trade-off under `quick`, the AD8 host check results, and
  the passive presence marker without cross-session messages.

## Affected files

| File                                                                                                       | Description                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/merge-gate-conflict-validation.md` (new)                                                         | AD11                                                                                                                                                                                                                                      |
| `src/shared/merge-gate-conflict-resolution.md`                                                             | Detection, integrity, effective mode, AD6 handoff scope, AD7 handoff rule and classification inside the fail-closed rule, AD8 fact where proven                                                                                           |
| `src/shared/merge-gate-delegated-run.md`                                                                   | `## Configuration` table (`:313-332`) row; AD2a Phase 4 condition and stop; AD3 report lines; conflict-observed and push-confirmed times in the wisdom record and the Phase 6 conflict report line; AD9 marker lifecycle and entry notice |
| `src/agents/merge-conflict-resolver.md`                                                                    | Targeted checks under effective `quick` only; `full` unchanged (AD5); AD7 handoff rule                                                                                                                                                    |
| `src/agents/code-validator.md`                                                                             | Accept the conflict-commit handoff scope (AD6) and the AD7 handoff rule; no new result state                                                                                                                                              |
| `src/shared/config-merge-gate-keys.md`                                                                     | One row and one sentence for the key (eager in `setup` and `iterate`; detail stays in the lazy conflict fragment)                                                                                                                         |
| `src/scripts/config-resolve-core.mjs`                                                                      | Extend or generalize the base-blob guard over a fixed key allowlist                                                                                                                                                                       |
| `src/scripts/conflict-validation.mjs`, `src/scripts/conflict-validation-core.mjs` (new)                    | AD4 operations                                                                                                                                                                                                                            |
| `src/scripts/remote-tracker-core.mjs`, `remote-tracker-github-core.mjs`, `remote-tracker-forgejo-core.mjs` | AD4a `includeCheckIdentity`                                                                                                                                                                                                               |
| `src/scripts/effective-flow-state*.mjs`                                                                    | Presence operation group (register, refresh, list, release, remove-if-dead)                                                                                                                                                               |
| `src/scripts/claude-settings-core.mjs`, `src/shared/setup-allowlist.md`                                    | Classify the new operations for the allowlist (writes bounded); the rule count in the text follows the test-derived count                                                                                                                 |
| `src/tools/cleanup.md`                                                                                     | AD9 removal path, hard scope boundary, frontmatter `description` and `catalogHint`                                                                                                                                                        |
| `src/tools/setup.md`                                                                                       | Config schema (`:94`), summary (`:991`) and Guided summary hint (AD3)                                                                                                                                                                     |
| `src/shared/setup-advanced-settings.md`                                                                    | Block 9 table (`:72-101`) row and proposal                                                                                                                                                                                                |
| `src/shared/setup-targeted-change.md`                                                                      | Proposal in Targeted `mergeGate.*` changes (`:109-122`)                                                                                                                                                                                   |
| `src/shared/setup-status.md`, `src/scripts/setup-status-core.mjs`                                          | New status-envelope field for the proposal                                                                                                                                                                                                |
| `build.mjs`                                                                                                | Register the new pair in `RUNTIME_SCRIPT_FILES`; adjust `CONTEXT_BUDGET_LINES` for the tool cores that grow (`setup`, `iterate`, `cleanup`; `merge-gate` only if `src/tools/merge-gate.md` changes)                                       |
| `docs/user-guide/configuration.md`                                                                         | Defaults table and `mergeGate` block: key, base confirmation, effective mode, proposal                                                                                                                                                    |
| `docs/developer-guide/configuration.md`                                                                    | Key and guard description                                                                                                                                                                                                                 |
| `docs/developer-guide/build-system.md`                                                                     | New helper pair; AD10 counts removed                                                                                                                                                                                                      |
| `docs/developer-guide/skill-ownership.json`                                                                | Only if the ownership check requires it (AD7)                                                                                                                                                                                             |
| `AGENTS.md`                                                                                                | AD10 pointer instead of the list                                                                                                                                                                                                          |
| `docs/adr/effective-flow-project-setup.md`                                                                 | Row `mergeGate.conflictValidation = quick`                                                                                                                                                                                                |
| Commit message (release-please generates `CHANGELOG.md`)                                                   | State the AD5 trade-off under `quick` in the Conventional Commit body; never edit `CHANGELOG.md` by hand                                                                                                                                  |
| `test/execution-profile-contract.test.mjs`                                                                 | AD10 literal; new pair in `EXPECTED_RUNTIME_SCRIPTS`                                                                                                                                                                                      |
| `test/support/repository-copy.mjs`, `test/execution-profile-rendering.test.mjs`                            | AD10 copy scope and per-case cleanup                                                                                                                                                                                                      |
| `scripts/test-capabilities.mjs`                                                                            | AD10 Git and free-space checks                                                                                                                                                                                                            |
| `test/model-tiers-contract.test.mjs`, `test/delegation-mandate-contract.test.mjs`                          | Pinned anchors for changed handoff and resolver wording (`:195-215`, `:316`)                                                                                                                                                              |
| `test/workflow-contracts.test.mjs`                                                                         | Default pins (`:9111-9160`); rendered handoff contracts for AD5, AD6, AD7                                                                                                                                                                 |
| `test/config-resolve.test.mjs`                                                                             | Base-blob guard for the new row, including hidden mode                                                                                                                                                                                    |
| `test/conflict-validation.test.mjs` (new)                                                                  | AD4 operations with one fixture per condition                                                                                                                                                                                             |
| remote-tracker tests                                                                                       | AD4a with and without `includeCheckIdentity`                                                                                                                                                                                              |
| `test/effective-flow-state-*.test.mjs`, `test/effective-flow-state-harness.test.mjs`                       | Presence operations                                                                                                                                                                                                                       |
| `test/setup-allowlist-contract.test.mjs`, `test/setup-status-core.test.mjs`                                | Allowlist rules; status field                                                                                                                                                                                                             |
| cleanup tests                                                                                              | AD9 removal path                                                                                                                                                                                                                          |
| `evals/merge-gate/` (`suite.config.mjs`, scenarios, fixtures)                                              | Phase 4 scenario with a seeded run record and the marker-notice scenario; re-record evidence of scenarios made stale by the source change, per `evals/merge-gate/README.md`                                                               |

## Implementation details

### Approach

1. Write the ADR (AD11).
2. Add the key to `config-merge-gate-keys.md`, the delegated run's configuration table, both
   configuration guides and the setup texts; extend the base-blob guard with tests.
3. Add `includeCheckIdentity` to `pr-status-read` (AD4a) with tests.
4. Implement the helper pair (AD4) with one fixture per detection condition.
5. Implement the presence operations, their allowlist classification and the cleanup path.
6. Run the per-host check for AD8 and record the result.
7. Change resolver and validator contracts (AD5, AD6, AD7).
8. Change the conflict fragment (AD2, AD6, AD7, AD8).
9. Change the delegated run: Phase 4 condition, stop, report lines, recorded times, marker
   lifecycle and notice (AD2a, AD3, AD9).
10. Add the setup proposal, including the status-envelope field (AD3).
11. Repository-side changes (AD10), including the free-space measurement.
12. Update pinned tests and budgets; run the ownership check; add the two eval scenarios and
    re-record stale evidence; run the validation plan.

### Component structure

Not relevant: no UI.

### State management

- Effective mode, static evidence, integrity results, the record of a `quick`-validated conflict
  commit, and the conflict-observed and push-confirmed times are run-scoped values in the wisdom
  record of the delegated merge-gate run; the times also go into the Phase 6 conflict report line.
- The only new persisted state is the run-presence marker (AD9), named by `SESSION_ID`, kept across
  suspension, released in Phase 6 on other returns, removed by `cleanup` only when the run's wisdom
  file is absent.

### API integration

- `ci-detect` and `ci-integrity` read Git objects of a base ref and a given tree only; no forge
  API.
- `ci-evidence-match` uses `pr-status-read` with `includeCheckIdentity: true` (AD4a). A check that
  cannot be matched on all fields is no evidence.
- The AD9 notice uses local Git only.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **CI exists but does not run tests unconditionally:** `undetected`, effective mode `full`.
- **PR or a later round changes a workflow or a referenced local action:** integrity fails;
  effective `full` before the push, no merge after it.
- **Base changes its workflows after the push:** integrity fails at Phase 4; stop with that reason.
- **Unsupported YAML construct:** `unparsable`, no evidence; the report says why.
- **Test step with arguments, pipes, chains, error suppression, conditions, shell override,
  mismatched working directory, or only inside a reusable workflow or composite action:**
  `undetected`.
- **Matrix test job:** every statically expected instance must be `SUCCESS`; an expression matrix
  is `undetected`; an incomplete set (for example after fail-fast cancellation) is no evidence.
- **Same-named status context, third-party app, `push` or `pull_request_target` run:** no evidence.
- **Forgejo, or a job not known to be blocking:** effective `full` before the push; no proposal on
  Forgejo unless AD4a is verified there.
- **Test job fails on the merge head:** the existing check-gate handling applies.
- **High-risk conflict:** effective `full`, whatever is configured; no proposal.
- **`quick` set only on the PR head:** base confirmation fails, effective `full`.
- **Environment signature under `full`:** stop before the push with signature class and, where
  applicable, the proposal.
- **Agent host-tool timeout or unattributable timeout:** handled as today, under every mode.
- **Suspended gate (`SUSPENDED` or `BLOCKED-USER`):** its marker stays and is refreshed on resume.
- **Marker of a crashed run with its wisdom file still present:** shown as possibly stale or
  possibly suspended; `cleanup` keeps it.
- **Malformed marker fields:** ignored with a notice; never used for a Git command.
- **Legacy config without the key:** default `full`; the AD3 places propose `quick` when the
  conditions hold.

## Acceptance criteria

- [ ] `mergeGate.conflictValidation` defaults to `full`; an invalid or base-unconfirmed `quick`
      resolves to effective `full`; hidden-mode `quick` is honored (`test/config-resolve.test.mjs`,
      `test/workflow-contracts.test.mjs`).
- [ ] `test/conflict-validation.test.mjs` passes with one fixture per AD4 condition: this
      repository's `ci.yml` shape → `detected`; each excluded trigger, step, shell, condition,
      working-directory, matrix, name and indirection case → `undetected`; each unsupported YAML
      construct → `unparsable`; a workflow only on the head → ignored; a changed workflow or
      referenced local action → integrity fails; evidence requires the complete non-empty instance
      set with `CheckRun`, `github-actions`, `pull_request`, workflow path, head SHA and `SUCCESS`,
      and rejects `SKIPPED`, a same-named status context, a green non-test job, an incomplete
      matrix and an ambiguous de-duplication group.
- [ ] Remote-tracker tests show the AD4a fields with `includeCheckIdentity: true` on GitHub,
      unchanged output without it, and the documented handling on Forgejo;
      `test/eval-fixture-fidelity.test.mjs` passes without fixture changes.
- [ ] Presence operations register, refresh, list and release; a run skips its own marker; a run
      never deletes another run's marker; malformed fields are rejected; `cleanup` removes a marker
      only when its wisdom file is absent and keeps it otherwise (state-helper and cleanup tests).
- [ ] Contract tests on the rendered handoffs prove: under effective `quick` the resolver runs
      targeted checks only and the validator scope excludes only the matched test command while
      requiring the remaining checks; under effective `full` the resolver and validator handoffs
      are unchanged from today apart from the AD7 rule; both handoffs carry the AD7 rule; an
      environment signature under `full` leads to a stop before the push; a host-tool timeout is not
      a stop signature.
- [ ] Recorded eval evidence (per `evals/merge-gate/README.md`) shows: a Phase 4 entry with a
      seeded `quick`-validated conflict commit and a status read without evidence ends without a
      merge and with the stop report; a second valid presence marker produces the notice line.
- [ ] The AD8 host check result for Claude Code and Codex is recorded in the ADR, and the handoff
      carries the execution fact exactly on the hosts where it is proven.
- [ ] Setup shows the `quick` proposal with evidence in Guided block 9, the Guided summary hint,
      Targeted `mergeGate.*` changes and the `setup status` envelope when the AD3 conditions hold;
      Profile and Express are unchanged (setup contract tests, `test/setup-status-core.test.mjs`).
- [ ] The new operations are classified for the allowlist and `test/setup-allowlist-contract.test.mjs`
      passes.
- [ ] No hand-maintained runtime-script count or list remains in
      `test/execution-profile-contract.test.mjs`, `docs/developer-guide/build-system.md` or
      `AGENTS.md`.
- [ ] `scripts/test-capabilities.mjs` fails with a clear message when Git or the documented free
      space in `os.tmpdir()` is missing; repository-copy cases exclude `evals/*/results/` and remove
      their copies per case.
- [ ] Manual check on a throwaway PR in this repository (`quick`) with a low-risk documentation
      conflict: the Phase 6 conflict report line shows at most 10 minutes between conflict
      observation and push confirmation, and the merge happens only after the CI test job
      succeeded on the merge head.
- [ ] `pnpm agent:check`, `node build.mjs`, `pnpm test`, `pnpm test:distribution` and the
      behavioural eval evidence step pass in CI on the implementation PR.

## Validation plan

- Unit and contract tests named in the acceptance criteria, run locally with the repository's own
  commands (AGENTS.md "Commands") and in full in GitHub CI.
- The two eval scenarios, run with recorded evidence per `evals/merge-gate/README.md`, plus
  re-recorded evidence for scenarios the source change makes stale; CI verifies the evidence in
  report mode.
- The AD8 host check, recorded in the ADR.
- The free-space measurement for the preflight threshold, recorded in the script.
- The manual throwaway-PR check with the times from the conflict report line.

## Assumptions and open points

- Assumption: the local runtime of `pnpm agent:check`, `node build.mjs` and
  `pnpm test:distribution`, plus the delegated pre-commit review, fits the 10-minute outcome. It is
  measured in the manual check; if it does not fit, the outcome is revised rather than the scope
  widened.
- Not included: sorting `CONTEXT_BUDGET_LINES`. Its conflicts on #667 were value changes on
  neighboring lines, which sorting does not prevent.
- Not included: splitting the test suite into fast and slow scripts; `quick` is defined through
  the conflict commit's own handoff scope.
- Not included: shortening high-risk conflict rounds; they keep `full` by design (see Requirement).
- Not included: a deterministic classification of how the resolver merged a file; the resolver's
  high-risk class and the CI evidence carry the decision.
- Limits of the execution environment itself (wall-clock limits, temporary-directory size) are
  fixed outside this repository and are no prerequisite for this plan.
- Coordination between concurrent merge-gate sessions is issue #668.

## Plan review

**Result:** Approved

Three judgment rounds ran: a gap analysis (17 findings, 2 critical), a plan review (18 findings,
1 critical) and a deep interactive review (20 findings, 0 critical). All findings are incorporated
or settled by user decisions. The table counts the deep interactive review.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         4 |    2 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         3 |    0 |
| Scope           |        0 |         3 |    0 |
| Maintainability |        0 |         0 |    3 |

### Findings

- Scope, Important: a deterministic resolution classification forced `full` for exactly the
  typical prose conflict and added little safety next to CI evidence. User decision: dropped; the
  resolver's high-risk class and CI evidence decide (AD2.4, AD6).
- Scope, Important: AD5 regressed repositories on `full`. User decision: AD5 applies only under
  effective `quick`; `full` is unchanged.
- Architecture, Important: extending `pr-status-read` would break about 34 canned eval envelopes.
  User decision: `includeCheckIdentity` on request only (AD4a).
- Testability, Important: the merge-refusal eval needed conflict and push scaffolding. User
  decision: a Phase 4 entry scenario with a seeded run record.
- Error cases, Important: `cleanup` may not infer staleness from age. User decision: remove a marker
  only when its wisdom file is absent (AD9).
- Error cases, Important: the marker would be released exactly on suspension. Incorporated: release
  in Phase 6 except `BLOCKED-USER` and `SUSPENDED`; register after Entry step 3.
- Security, Important: `ci-detect` could report false positives through pipes, shell overrides,
  arguments, working directory, indirection, glob filters and an undefined YAML subset.
  Incorporated: declared subset and strict step conditions (AD4).
- Architecture, Important: "every instance" was vacuous for zero matches and undefined for
  dynamic or cancelled matrices. Incorporated: complete, non-empty, statically derived set on
  de-duplicated entries (AD2a, AD4).
- Architecture, Important: exclusion and deferral reached unverified non-test steps. Incorporated:
  both apply only to the matched test command (AD6, AD7).
- Testability, Important: the `quick` scope was ambiguous for combined gates and this repository.
  Incorporated: subcommand replacement, normalized script identity, concrete command list (AD6).
- Error cases, Important: classification happened after the reruns inside the workers.
  Incorporated: the AD7 rule travels in both handoffs; unattributable timeouts take today's path.
- Scope, Important: Forgejo or a non-blocking job made `quick` push and then stop. Incorporated:
  pre-push condition AD2.3; proposal only on GitHub.
- Testability, Important: the wisdom file has no timestamps and is deleted on `DONE`.
  Incorporated: recorded times in the wisdom record and the Phase 6 conflict report line.
- Architecture, Important: `setup status` cannot fetch and renders only
  its envelope. Incorporated: local base without fetch, a new envelope field, and the missing setup
  files in Affected files.
- Notes, incorporated: marker identity by `SESSION_ID` (Architecture); three-dot diff for the notice
  (Architecture); Phase 4 base ref, missing objects and base workflow changes (Error cases);
  correct budget list (Maintainability); `evals/` is read by the build, so only `evals/*/results/`
  is excluded (Maintainability); wording of the outcome, configured versus effective `full`,
  portable target, CI steps in the final criterion (Maintainability).

## Open points

- No open points.

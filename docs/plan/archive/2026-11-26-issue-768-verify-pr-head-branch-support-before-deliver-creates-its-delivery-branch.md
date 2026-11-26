# Verify PR head-branch support before deliver creates its delivery branch

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #768

## Requirement

`deliver` turns a confirmed local selection into commits on a fresh, isolated delivery branch. It
then hands that exact branch to `pr`. Today nothing checks, before the branch exists, whether this
run can open a pull request whose head is that branch.

This failed on a T3 Code + Codex run of 1.80.0. The only PR-create path the host allowed was a
`pull_request_create` tool scoped to the thread's bound branch, with no `head` argument. The run
created the worktree and branch, committed, removed the clean worktree and pushed the branch. Only
then did it find out that it could not open the PR, and it fell back to a compare URL. No PR was
created, and the source checkout and index were left unchanged.

Goal: `deliver` must know whether `pr` can publish the delivery branch before it creates the
worktree or branch. It observes the writer that `pr` will actually use, in the context where `pr`
will run, before any source or delivery mutation. After the base and the delivery branch name are
resolved, and before the worktree or branch is created, it classifies that writer against the exact
head/base pair.

An unsupported writer stops the run before any worktree, branch, commit, push or PR mutation. The
stop names the intended head, the base, the writer and the missing capability, and lists only
supported alternatives. The early stop has no derived branch name yet, so it gives the head
conditionally and the base as its configured value. The head is either the fresh delivery-branch
pattern for a selected change, or the current branch when commits that already exist are published.

Residual limit: the preflight detects a host restriction only when that restriction is visible to
the model, through its host instructions, tool policy or runtime information. The helper probe
proves no write permission (`src/scripts/remote-tracker-core.mjs:2631`). A restriction the model
cannot see still fails late, as safely as today: after the push, the branch is kept and no other
transport is used. A supported writer continues with no new routine
confirmation. `pr`'s existing gates recheck the exact committed head before the push.

Workflow rationale: Bugfix. `deliver` promises a PR, and when that promise cannot be kept it fails
late, after mutating Git and the remote. The fix moves an existing publication precondition
(`pr` step 6's capability gate) in front of the first mutation. It also adds a pure classifier, so
the regression case becomes a CI-run test. No new user-facing capability is added: the host-tool PR
transport stays out of scope.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #768
**Original outcome:** In an isolated delivery topology, an unsupported writer stops `deliver` before any worktree, branch, commit, push or PR mutation, naming head, base and the missing capability. The early step 1.1 stop names the configured base and the head conditionally, which meets that criterion before the name is derived. A supported writer continues without a new confirmation, and its PR targets the delivery branch and the intended base, never the source branch. A same-topology classifier unit pair and contract tests that pin the stop ordering cover both outcomes. Boundary: this holds when the host restriction is visible to the model; an invisible restriction still fails late and safely, as today.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: a pure `publication-preflight` classifier on the existing `delivery-selection` helper. `deliver` observes the writer in step 1 and classifies the head/base pair at a new step 3.3. Resume runs the same check with a controlled rollback. `pr` step 10 gains a one-clause explicit-head rule.
**Continuation decision:** none

## Architecture decisions

- **Admit only the provider-helper writer.** (Decided by score.) The preflight counts a writer as
  supported only when it is the `remote-tracker` helper path that `pr` already uses. That path's
  `pr-create` sends an explicit `head` and `base` (`src/scripts/remote-tracker-github-core.mjs:521-536`).
  `pr` step 10 forbids any other transport (`src/tools/pr.md:327`).

  These writers are unsupported:
  - a host policy that restricts PR creation to a host tool;
  - a thread-bound host tool.

  `pr` gains no host-tool transport. A head-capable host integration, or rebinding a thread to the
  delivery branch, is a separate change, as the issue itself states.

- **The regression case is a pure classifier plus tests.** (Decided by score.) A new read-only
  `publication-preflight` operation on `src/scripts/delivery-selection-core.mjs` classifies the
  writer evidence the orchestrator observed. It returns `supported` or `unsupported` with stable
  reason codes. A unit pair covers the negative and the positive outcome over the same isolated
  topology, with identical head, base and source strings. Contract tests pin where `deliver` calls
  the classifier and that the stop comes before every mutation. Together they meet the issue's
  regression criterion. The "no mutation attempted" proof lives in the ordering contract tests. A
  Git fixture around a call that runs no Git could not fail, so there is none (decided by score).

  The model still observes the evidence, because host tool schemas and host policy are visible
  only to it. The script owns the decision rule, so the rule is stated once and tested.

- **On an unsupported writer, stop with guidance only.** (Decided by score.) There is no
  branch-only handoff, no push, and no new question beyond the provider question below.
- **Observe early, classify at step 3.3.** (Decided by score.) The writer observation depends on
  neither the base nor the branch name. Step 1.1 observes it after the resume check and before
  `upstream-status`, so a writer that is already unsupported stops before any fast-forward,
  selection or manifest question, with nothing changed by this delivery. The head/base/source classification runs at
  the new step 3.3. That is after the base refresh (3.1) and the branch name (3.2), and before branch
  and worktree creation, which is the issue's placement.
- **No separate step 6 recheck.** (Decided by score.) `pr` already guards the head before the push:
  - step 3 keeps the handed-off head OID;
  - step 6 re-probes without side effects (`src/tools/pr.md:243`);
  - step 7 requires the exact head to still resolve to that OID before the push (`:244-247`).

  These gates meet the issue's "recheck the exact committed head before publishing". A contract test
  pins them instead of `deliver` repeating them.

- **Ask the provider question once, early, and hand the answer to `pr`.** (Decided by score.)
  `AMBIGUOUS_HOST` from `repository-resolve` gets the same `github`/`forgejo` question as `pr`
  step 5, at the step 1.1 observation. The answer goes to `{{SKILL:pr}}` as its explicit provider
  override, so the run never asks more often than it does today.

  The question is one more conditional step 1.1 question that may precede the manifest
  confirmation, so it is added to `deliver`'s approval paragraph (`src/tools/deliver.md:145-150`). An
  unanswered, skipped or non-interactive answer stops with nothing changed by this delivery, as the committed-range
  provider question does (`src/shared/deliver-committed-range.md:79-83`). It gets a `blocker` row
  `S-DHST` in `src/shared/scored-decisions.md` beside S-HOST. The row test checks only a unique
  `SITE_ID`, an existing file, a literal anchor and a kind, and S-DLV is a precedent for a `deliver`
  file (`test/scored-decisions-contract.test.mjs:117-131`).

- **The early answer is the committed-range route's provider question.** (Decided by score.) The
  step 1.1 gate runs before the route is known, so it also applies to committed-range runs. When the
  step 1.1 question was asked, its answer counts as that route's single provider question. The route
  asks no second one, and its `Publish` fence, which fires only when no provider question was asked,
  stays as it is. A noted focused outcome then ends with the route's notice. The approval paragraph's
  "at most its provider question or its focused publish question" therefore stays true. The answer
  is passed as the explicit provider override to condition 3's `repository-resolve`
  (`src/shared/deliver-committed-range.md:56-58`), so that call cannot return `AMBIGUOUS_HOST`
  again. The early stop's report contains only route-neutral facts. Reason 8
  (`host-tool-bound-to-other-branch`) is evaluated in pair scope only.
- **The early stop names the configured base and a conditional head.** (Decided by score, twice.)
  Step 1.1 also reads `delivery.baseBranch` and `delivery.branchPrefix`, moved forward from step 1.2.
  Only on the `unsupported` path, the early stop names:
  - the configured `delivery.baseBranch` value verbatim, as a display value and not a recorded
    base-branch result;
  - the head conditionally: "a fresh `<prefix>/deliver/<subject slug>` branch (`deliver/<subject
slug>` with an empty prefix) for a selected change, or the current branch `<name>` when commits
    that already exist are published".

  This needs no Git read and is route-neutral. Step 3.1 still runs the full base-branch rule,
  unchanged.

- **Use the same context and probe as `pr`.** `deliver` delegates to `{{SKILL:pr}}` in the same
  session, and `pr` runs its helper calls from `RUNTIME_STATE_ROOT` (`src/tools/pr.md`, "Execution
  root"). So the observation makes the same two helper calls as `pr` steps 5–6, `repository-resolve`
  and `probe`, with `RUNTIME_STATE_ROOT` as `cwd`. `deliver` spells out their payloads itself rather
  than pointing at `pr`'s step numbers, because `pr.md` is not loaded at step 1.1. A
  ` ```lazy-include remote-helper-contract ` with `when: the step 1.1 writer observation calls the
remote helper` supplies the call-shape rules, following the committed-range precedent
  (`src/shared/deliver-committed-range.md:66-69`). That is the context in which publication will
  actually run. A Git push capability, a checkout path or a generic PR tool is never evidence.
- **Eager core, one lazy stop fragment.** Every `deliver` run needs only the observation and the
  classifier calls, so those stay eager in step 1.1 and step 3.3. The mode-gated text moves behind
  one ` ```lazy-include deliver-publication-preflight ` with `when: the host policy is restricted or
publication-preflight returns unsupported`, shared by step 1.1, step 3.3 and resume:
  - the host-tool schema description;
  - the stop report;
  - the alternatives and statements.

  This follows AGENTS.md "Writing prompt text", rules 1–3. Each rule is stated once there or in its
  step. The other call sites refer to it and do not repeat it.

- **Insert the classification as step 3.3 and renumber.** The current 3.3 and 3.4 become 3.4 and
  3.5. A repository search found no reference to `deliver` steps 3.3 or 3.4. Tests cite only steps
  3.1 and 3.2 (`test/workflow-contracts.test.mjs:20804`, `:23489`;
  `test/effective-flow-mechanics.test.mjs:588`).

## Affected files

| File                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/scripts/delivery-selection-core.mjs`     | Add the pure `publication-preflight` operation to `DELIVERY_SELECTION_OPERATIONS` and its dispatch, as a read-only operation, not a dry-run one. It has a closed input schema, writes nothing and runs no Git command.                                                                                                                                                                                                                                                                                       |
| `src/scripts/delivery-selection.mjs`          | Add `publication-preflight` to the usage line (`:102`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/tools/deliver.md`                        | Add the writer observation and its early stop to step 1.1, after the resume lazy-include and before `upstream-status`, with a `remote-helper-contract` lazy-include and a `deliver-publication-preflight` lazy-include. List the provider question in the approval paragraph. Insert step 3.3 (classification and stop) and renumber 3.3/3.4. List the operation under "Project conventions". Add an abort-boundary bullet. Update `contextBudget` from the build report.                                    |
| `src/shared/deliver-publication-preflight.md` | New lazy fragment for `deliver` only. It holds the host-tool schema description, the stop report (early and pair scope), the supported alternatives and the "not a delivered pull request" statement.                                                                                                                                                                                                                                                                                                        |
| `src/shared/deliver-partial-diff-resume.md`   | Add the observation and classification to "Runs, in this order" after step 1.2, with a controlled-stop rollback. Change the "Skipped" line to "step 3 except the step 3.3 classification".                                                                                                                                                                                                                                                                                                                   |
| `src/tools/pr.md`                             | In step 10, name the payload's `head` as the exact handed-off head branch (on a direct invocation, the checked-out branch). Update `contextBudget` only if the build report requires it.                                                                                                                                                                                                                                                                                                                     |
| `src/shared/scored-decisions.md`              | Add the `blocker` row `S-DHST` for `deliver`'s step 1.1 provider question, beside S-HOST.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/deliver-committed-range.md`       | In its provider-question bullet (`:79-83`), add one sentence: an answer to the step 1.1 provider question counts as this question, which is then not asked again. In condition 3 (`:56-58`), pass that answer as the explicit provider override to `repository-resolve`.                                                                                                                                                                                                                                     |
| `test/delivery-selection.test.mjs`            | Pure classifier tests: schema rejection (`INVALID_PAYLOAD`), every reason code in its fixed order, `probe: null`, writer and pair scope, and the same-topology negative/positive regression pair, both through `executeOperation` and through one CLI envelope.                                                                                                                                                                                                                                              |
| `test/model-tiers-contract.test.mjs`          | One distribution assertion, like the committed-range one (`:1543-1557`): every target ships `shared/deliver-publication-preflight.md` behind its `deliver` pointer, and the core does not inline it.                                                                                                                                                                                                                                                                                                         |
| `test/workflow-contracts.test.mjs`            | New prose contract tests for the source invariants (see Acceptance criteria), each naming its invariant. Three existing pins are updated deliberately: the helper-operation list regex (`:20471`, `` `reconcile`, and `committed-range` operations``) gains `publication-preflight`; the approval-paragraph token list (`:20034-20050`) gains the provider-question token; the ordered step 1.1 pin (`:20236-20246`, "Unless a record was resumed" → `upstream-status`) admits the observation between them. |
| `docs/user-guide/tools-deliver.md`            | New subsection "When the pull request cannot target the delivery branch".                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/architecture.md`        | One paragraph next to the `committed-range` description (`:614`) on `publication-preflight`: its payload, reasons and call sites.                                                                                                                                                                                                                                                                                                                                                                            |

## Implementation details

### Approach

1. **Classifier contract** (`delivery-selection-core.mjs`). The input is one closed JSON object:
   - `hostPolicy`: `"unrestricted"` or `"restricted"`. It is top-level and required for both
     writer kinds.
   - `writer`: one of two shapes.
     - `{kind: "provider-helper", probe: {ok, code?, pullRequestCreate} | null}`.
       `pullRequestCreate` is the probe's `capabilities.pullRequestCreate`: `true`, `false`, or
       `null` when the probe did not report it. `probe.ok: false` with `code` also carries a failed
       `repository-resolve` envelope (for example a missing `origin` or an unknown host), not only a
       failed `probe`. `probe: null` means the helper calls were skipped, and is valid only with
       `hostPolicy: "restricted"`.
     - `{kind: "host-tool", name, explicitHead: boolean, boundBranch: string | null}`.
   - `source`: `{branch}`, where `branch` is `null` for a detached source.
   - `head` and `base`: optional, but only together. With both present the scope is `pair`,
     otherwise `writer`.

   Output `data` is `{status, scope, head, base, writer: <kind>, hostPolicy, reasons: [...]}`, with
   `head`/`base` `null` in writer scope. `status` is `supported` only when all of these hold:
   - the kind is `provider-helper`;
   - `hostPolicy` is `unrestricted`;
   - `probe.ok` is true;
   - `pullRequestCreate` is not `false`. This is the helper's own rule: its operation gate tests
     `capabilities[key] === false` (comment at `remote-tracker-core.mjs:328-330`, gate at
     `:7328-7334`).
   - in pair scope only, `head` differs from `source.branch` and from `base`.

   Otherwise `status` is `unsupported`, with every applicable reason in this fixed order:
   1. `head-is-source-branch`
   2. `head-is-base`
   3. `host-policy-restricted`
   4. `helper-probe-failed`, carrying the probe `code`
   5. `pull-request-create-unsupported`
   6. `host-tool-not-supported-by-pr`
   7. `host-tool-no-explicit-head`
   8. `host-tool-bound-to-other-branch`, only in pair scope, when `boundBranch` is set and differs
      from `head`

   `probe: null` contributes neither reason 4 nor reason 5. A restricted helper writer with no host
   tool therefore yields `host-policy-restricted` alone.

   A host tool is always unsupported in this change. Malformed input returns the helper's existing
   `INVALID_PAYLOAD` error envelope with exit code 2 (`delivery-selection-core.mjs:36-52`).

2. **CLI.** Add the operation to the usage line. No `--apply` handling is needed.
3. **`deliver` step 1.1, writer observation.** Unless a record was resumed, observe the writer once,
   after the resume lazy-include and before `upstream-status`:
   1. Read `tracker.remoteToolOverride`, `delivery.baseBranch` and `delivery.branchPrefix` through
      the shared configuration contract. This moves step 1.2's read of the latter two forward, and
      step 1.2 reuses them. No base-branch resolution runs here.
   2. Set `hostPolicy` first, since it needs no I/O. Set it only from explicit running-environment
      evidence: the run's own host instructions, tool policy or runtime information, as for host
      identity in `src/shared/host-pr-watch.md:15-17`. It is `restricted` only when that evidence
      names a different PR-creation path as the allowed one, or denies the helper's PR write. An
      approval prompt for a command is not a restriction. When the policy is `restricted`, the
      `deliver-publication-preflight` fragment says how to describe a host PR tool it makes the
      allowed path as the `host-tool` writer, from that tool's own schema. Without such a tool, the
      writer is `provider-helper` with `probe: null`.
   3. Only when the policy is `unrestricted`, call the helper's `repository-resolve` with
      `{cwd: <RUNTIME_STATE_ROOT>}` plus the provider override when one is configured, and then its
      `probe` with `{cwd: <RUNTIME_STATE_ROOT>}`. Both calls follow the `remote-helper-contract`
      call shape. On `AMBIGUOUS_HOST`, ask once for `github` or `forgejo` and repeat the call with
      the answer. An unanswered, skipped or non-interactive answer ends the run with one notice
      naming `AMBIGUOUS_HOST`, with nothing changed by this delivery. Any other error envelope from
      either call becomes `probe: {ok: false, code}`, and its structured remediation is retained for
      the report.
   4. Call `publication-preflight` in writer scope with `source` the current branch, or `null`.
      Retain the evidence and the provider answer for step 3.3, for `{{SKILL:pr}}`, and for the
      committed-range route's provider question.
   5. On `unsupported`, stop before any fast-forward, selection, branch, worktree, index, commit,
      push or forge mutation, with the fragment's route-neutral report. It names:
      - the writer;
      - the configured `delivery.baseBranch` value, as a display value;
      - the conditional head (see Architecture decisions);
      - each reason, and for `helper-probe-failed`, the helper's structured remediation.

      It also gives the alternatives and statements, says that nothing was changed by this delivery,
      and lists any retained records that this run's resume Release question already released.
4. **`deliver` step 3.3, "Verify the publication path".** After step 3.2 and before branch and
   worktree creation:
   1. Call `publication-preflight` in pair scope with the retained step 1.1 evidence, `head` the
      step 3.2 branch, `base` the resolved local base branch, and `source` the step 1.1 evidence.
   2. On `unsupported`, stop before any branch, worktree, index, commit, push or forge mutation,
      with the fragment's pair-scope report. The report names:
      - the intended head and the base;
      - the writer and its `explicitHead`/`boundBranch` when it is a host tool;
      - each reason, and for `helper-probe-failed`, the helper's structured remediation.

      It lists the supported alternatives: fix the helper per its remediation, run `deliver` again
      from a context whose host policy permits the provider helper's PR write, or create and publish
      the branch outside this workflow. It states that nothing was changed, and that a compare URL or manual handoff is not
      a delivered pull request. Never switch, push or publish the source branch, and never use a
      different transport.

   3. On `supported`, continue with no question. Hand the step 1.1 provider answer, when there is
      one, to `{{SKILL:pr}}` at step 6 as its explicit provider override. Step 6 itself is
      otherwise unchanged.
5. **Resume.** In `deliver-partial-diff-resume.md`, add to "Runs, in this order", directly after
   step 1.2, the step 1.1 writer observation and the step 3.3 classification:
   - `head` is the record's branch;
   - `base` is `resume.base.branch` (`src/scripts/effective-flow-state-ledger-core.mjs:237`,
     `:306`), the same base value that the resumed step 6 hands to `{{SKILL:pr}}`;
   - `source` is the fresh step 1.1 evidence.

   On resume, every stop of the observation or classification is a controlled stop before step 4.3:
   an `unsupported` result, a no-answer provider question, or a helper or `publication-preflight`
   error envelope. It moves the adopted record back to `aborted` with one `worktree transition`,
   using the fragment's existing failure pattern (`:109-110`). It is never left `active`, because
   `worktree inspect` offers only `aborted` or `failed` records for resume. The ledger keeps its entries, so a later run in a supported context resumes the
   record the same way. Amend the "Skipped" line so step 3 is skipped except the step 3.3
   classification.

6. **`pr` step 10.** Add one clause: the payload's `head` is the exact head branch from the committed
   handoff, or on a direct invocation the checked-out branch of step 1. It is never derived from the
   main checkout.
7. **Abort boundaries.** Add one bullet to `deliver`'s "Abort boundaries": an unsupported
   publication path stops before any artifact is created. Never switch or push the source branch,
   bypass host tool policy, or merge to work around it.
8. **Scored-decisions row and committed-range.** Add the `blocker` row `S-DHST` for the step 1.1
   provider question. Its file is `src/tools/deliver.md`, its anchor is a literal substring of that
   sentence, and its outcome reads "As S-HOST". In `deliver-committed-range.md`:
   - add the sentence that an earlier step 1.1 answer is this route's provider question;
   - pass that answer as the provider override in condition 3.
9. **Docs.** The user guide explains:
   - the early stop and its two points (before any question, and at branch creation);
   - the alternatives;
   - why a manual compare URL is not a PR delivery;
   - the remaining late failure and the residual limit for a host restriction the model cannot
     see (see Edge cases).

   The developer guide describes the operation, its payload, scopes and reasons, and its three call
   sites: step 1.1, step 3.3 and resume.

10. **Budgets.** Run `node build.mjs` and set `contextBudget` for `deliver`, and for `pr` if it
    changed, to the reported built line count plus at most ten lines.

### Component structure

Not relevant: there is no UI. The change is one pure helper operation and its prose call sites.

### State management

The check writes no state of its own: no runtime record, ledger, ref or file. Its evidence and
result are held only in the run, for step 3.3. The one state change is the resume rollback, which
uses the fragment's existing `worktree transition`.

### API integration

Only the existing `remote-tracker.mjs` `repository-resolve` and `probe` read operations are called,
in the shape `pr` steps 5–6 already use. No new forge or host API is used.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **The reported case: a thread-bound host tool without `head`.** `hostPolicy: restricted` with a
  `host-tool` writer, `explicitHead: false` and `boundBranch` the source branch. Step 1.1 already
  returns `unsupported` in writer scope, with `host-policy-restricted`,
  `host-tool-not-supported-by-pr` and `host-tool-no-explicit-head`. It asks no provider question and
  makes no helper call. Nothing is mutated. A pair-scope call at step 3.3 (in tests, or after a
  context change) would also add `host-tool-bound-to-other-branch`.
- **Host tool bound to the delivery branch.** This cannot happen for a fresh branch this run creates.
  The classifier still returns `host-tool-not-supported-by-pr`, because `pr` has no host transport.
- **Helper `CLI_MISSING` / `AUTH_FAILED` / `UNSUPPORTED_CAPABILITY`, or a failed `repository-resolve`**
  (for example a missing `origin` or an unknown host). `probe.ok: false` gives `helper-probe-failed`
  with the code. The run stops at step 1.1 and reports the helper's structured remediation. Today
  `pr` step 6 also catches this without side effects, but only after the commits.
- **Probe omits `pullRequestCreate`.** Treated as supported, matching the helper's own `=== false`
  gate. Only an explicit `false` blocks.
- **Remaining late failure.** If the helper's `pr-create` is denied at runtime after a successful
  probe and an unrestricted policy observation, `pr` still fails after its push. This includes a
  host restriction that the model cannot see. `pr` keeps the
  branch, reports the exact state (`src/tools/deliver.md:311-314`) and uses no other transport. The
  preflight cannot prove a runtime write permission it never exercises. The user guide names this.
- **Detached source** (`source.branch: null`). Only the head-versus-base comparison applies.
- **Head equals the source or base branch.** A defensive `unsupported` result. `delivery-branch-name`
  should make this unreachable, but the PR must never use the source branch as its head.
- **Resume in an unsupported context, or with a no-answer provider question or a helper error.** A
  controlled stop to `aborted` before step 4.3. The record stays resumable.
- **Committed-range route.** It publishes the source's own existing branch from the source checkout
  and creates no isolated branch (`src/shared/deliver-committed-range.md:6-10`). The step 1.1 gate
  also applies to it, because the route is only known after the gate. That is correct: `pr` cannot
  publish through an unsupported writer on that route either. The early stop's report is
  route-neutral: the conditional head names the current branch for this route. Reason 8 is
  pair-scope only, so no `boundBranch` result reaches this route. An early provider answer counts as
  the route's single provider question and is its condition 3 provider override. Its `Publish` fence and the approval paragraph's "at most its provider question or its
  focused publish question" stay valid.
- **Hidden mode.** The check adds no names or paths to any published text. Its report is local.

## Acceptance criteria

- [ ] **Classifier contract.** `publication-preflight` is in `DELIVERY_SELECTION_OPERATIONS` and
      the CLI usage line. It returns the specified data in both scopes, with the listed reason codes
      in their fixed order, and `INVALID_PAYLOAD` (exit 2) for malformed input. Pinned by
      `test/delivery-selection.test.mjs`.
- [ ] **Negative regression** in `test/delivery-selection.test.mjs`. One isolated-topology
      input set is shared by both cases: `source.branch` `work`, base `main`, and intended head
      `effective-flow/deliver/<slug>`. A pair-scope call with `hostPolicy: restricted` and a
      `host-tool` writer (`explicitHead: false`, `boundBranch: "work"`) returns `unsupported`, with
      `data.head` and `data.base` echoed. It has exactly these reasons, in order:
      `host-policy-restricted`, `host-tool-not-supported-by-pr`, `host-tool-no-explicit-head`,
      `host-tool-bound-to-other-branch`.
- [ ] **Positive regression** with the same head, base and source. An unrestricted
      `provider-helper` writer with `probe.ok: true` returns `supported`, with `data.head` equal to
      the delivery branch and `data.base` equal to `main`. Neither equals the source branch `work`.
      Both cases run through `executeOperation`, and the negative one also runs through one CLI
      envelope.
- [ ] **Contract tests** in `test/workflow-contracts.test.mjs`. Together with the classifier pair,
      these are the evidence for "no mutation attempted" and "never the source branch". They pin:
  - In `deliver.md` step 1.1, the host-policy observation comes first. The helper calls and the
    provider question run only under an unrestricted policy. The writer observation and its stop
    come before `upstream-status`.
  - The early stop names the configured `delivery.baseBranch` value and the conditional head.
  - Step 3.3's classification comes before the step that creates the branch and worktree.
  - Both stops forbid fast-forward (step 1.1), branch, worktree, index, commit, push and forge
    mutation.
  - The step 3.3 report names head, base, writer and reasons.
  - The provider question is listed in the approval paragraph, with its no-answer stop.
  - `deliver-partial-diff-resume.md` runs the classification after step 1.2 and before step 4.3,
    with the `aborted` rollback for every stop there.
  - `deliver-committed-range.md` counts an earlier step 1.1 answer as its provider question and
    passes it as the provider override in condition 3.
  - `deliver.md` step 1.1 carries the `remote-helper-contract` and `deliver-publication-preflight`
    lazy-includes, and the stop report and alternatives are not inlined in the core.
  - The three updated existing pins keep their invariants.
  - `pr.md` step 10 sets `head` from the handed-off head branch.
  - `pr.md` steps 3, 6 and 7 keep the head-OID and probe gates before the push.

  Each test names the invariant it protects.

- [ ] **Full order passes.** `pnpm agent:check`, `pnpm test` (including the scored-decisions
      contract with the new row and the `model-tiers-contract` distribution assertion for the new
      fragment), `node build.mjs` (including the `contextBudget` guard) and
      `pnpm test:distribution` pass, in CI's order.

## Validation plan

- Run the new and changed tests in isolation first:
  - `node --test test/delivery-selection.test.mjs`
  - the touched cases of `test/workflow-contracts.test.mjs`, `test/scored-decisions-contract.test.mjs`
    and `test/model-tiers-contract.test.mjs`
- Run `pnpm test:preflight`, then the full order from AGENTS.md: `pnpm agent:check`, `pnpm test`,
  `node build.mjs`, `pnpm test:distribution`. Use the host's configured project runner where one
  applies.
- Read the `Always-loaded core (lines/budget)` report of `node build.mjs` for `deliver` and `pr`, and
  set each `contextBudget` from it.
- Run `pnpm eval <suite> verify` (read-only) for `build-context`, `next-steps`, `merge-gate` and
  `iterate` to see the freshness debt from the script and tool edits. Recording new evidence is not
  part of this plan.

## Assumptions and open points

- Assumption, not verified: in the reported incident, the helper probe passed, and host policy
  then made the PR write impossible. The issue cites no error envelope or host-policy text. `pr`
  probes at step 6, before the step 7 push, and stops there without side effects, so a failed probe
  cannot explain a run that pushed first. The preflight therefore catches the reported case through
  the model's `hostPolicy` observation. The contract tests pin that observation's evidence source,
  and the classifier pair pins its effect. The residual limit in the Requirement covers a
  restriction the model cannot see (decided by score).
- Assumption: `deliver` and its `{{SKILL:pr}}` delegation run in the same host session with fixed
  host instructions, so the step 1.1 observation also holds at publication. `pr` step 6 still
  re-probes before the push.
- Assumption: host-policy restrictions are visible to the orchestrating model through its own
  instructions, tool schemas or runtime information. No script can probe them.
- Assumption: these edits create freshness debt, which CI reports without failing:
  - the `src/tools/*` edits, in `build-context`;
  - the `src/scripts/delivery-selection-core.mjs` edit, in `next-steps`, `merge-gate`, `iterate`
    and `build-context` (`evals/*/suite.config.mjs`).
- Out of scope: a host-tool PR transport in `pr`, a `head` parameter for any host integration,
  rebinding a thread to the delivery branch, a branch-only or manual handoff path, and a
  write-permission probe in `remote-tracker`. The committed-range route changes only by the step
  1.1 gate and its provider-question reuse.
- Follow-up candidate, not part of this plan: a behavioural eval scenario in which a host instructs
  "create pull requests only through the host tool", to observe the model's `hostPolicy` reading.
  The unit and contract tests cannot cover that reading.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Which PR writer paths should deliver's new pre-branch publication preflight admit as able to target the isolated delivery branch as PR head?",
    "options": [
      "Provider helper only",
      "Helper plus head-capable host tool",
      "Helper plus delivery-bound host context",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Provider helper only",
        "score": 8,
        "reason": "It fixes the fail-early defect using the only writer pr can run today: pr step 10 sends the helper's explicit head/base pr-create and forbids another transport, and it leaves head-capable host integrations as the separate option the issue names."
      },
      {
        "label": "Helper plus head-capable host tool",
        "score": 4,
        "reason": "It adds a new host-tool transport to pr for a tool that does not exist yet, which the issue calls a separate option and is not needed for fail-early behaviour."
      },
      {
        "label": "Helper plus delivery-bound host context",
        "score": 5,
        "reason": "It matches the issue's allowance for a delivery-bound context, but thread rebinding plus host transport in pr is a large, fragile new orchestration surface."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What form should the regression case for both preflight outcomes take in this repository?",
    "options": [
      "Prose contract tests",
      "Pure classifier plus tests",
      "Behavioural eval suite",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Prose contract tests",
        "score": 5,
        "reason": "It matches how deliver is tested today and adds no runtime code, but source-prose checks cannot show either outcome on an isolated delivery topology."
      },
      {
        "label": "Pure classifier plus tests",
        "score": 7,
        "reason": "It is the only option that turns both outcomes into a CI-run test on the same isolated topology, following the existing delivery-selection-core pattern, with contract tests still binding deliver and pr to the call."
      },
      {
        "label": "Behavioural eval suite",
        "score": 4,
        "reason": "It exercises the model reading host tool schemas, but a sixth manual suite with evidence wiring costs far more than one regression case and CI never runs it."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What does deliver offer when the publication preflight is unsupported?",
    "options": [
      "Stop with guidance",
      "Offer branch-only handoff",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Stop with guidance",
        "score": 9,
        "reason": "It meets the acceptance criterion directly, stopping before any worktree, branch, commit, push or PR mutation while naming head, base and the missing capability, and adds no ask site, so the manifest confirmation stays the sole routine approval."
      },
      {
        "label": "Offer branch-only handoff",
        "score": 3,
        "reason": "It works against the stop-before-branch/commit/push criterion, adds a second routine approval, an ask-site row and a push path that skips pr's create step, and in a host-restricted context the push may itself be unsupported."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Where does the resumed delivery run the publication preflight?",
    "options": [
      "Before adoption",
      "After step 1.2 with rollback",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Before adoption",
        "score": 5,
        "reason": "It is the only option where record, ledger and index stay unchanged, but the source evidence, config read and visibility would all have to move ahead of the adoption's worktree transition."
      },
      {
        "label": "After step 1.2 with rollback",
        "score": 7,
        "reason": "It matches the fragment's existing failure pattern, where an adopted record goes back to aborted or failed and stays resumable, and uses step 1.1 and 1.2 data where they already exist; only the unchanged claim, the criterion and the Skipped line need correcting."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does deliver's publication preflight handle AMBIGUOUS_HOST from repository-resolve?",
    "options": [
      "Ask once and hand to pr",
      "Unsupported without asking",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Ask once and hand to pr",
        "score": 8,
        "reason": "It moves pr step 5's existing question earlier so ambiguous self-hosted forges keep working and the run asks no more often, following the committed-range route's precedent, at the cost of listing the question, an S-HOST-style row and a corrected plan sentence."
      },
      {
        "label": "Unsupported without asking",
        "score": 4,
        "reason": "It keeps the approval paragraph unchanged, but turns a host that pr resolves today with one question into a hard stop needing a configuration change, a regression the issue never asked for."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "What does deliver step 6 recheck before delegating to pr?",
    "options": [
      "No deliver recheck",
      "Policy and classifier only",
      "Full recheck as planned",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "No deliver recheck",
        "score": 8,
        "reason": "pr already keeps the handed-off head OID in step 3, re-probes without side effects in step 6 and requires the exact head OID before the step 7 push, so pinning those gates meets the head-recheck criterion at no always-loaded cost."
      },
      {
        "label": "Policy and classifier only",
        "score": 5,
        "reason": "It covers host policy, the one thing pr does not recheck, but that policy cannot plausibly change within one run, so it adds always-loaded lines for little protection."
      },
      {
        "label": "Full recheck as planned",
        "score": 3,
        "reason": "It repeats the resolve, probe and OID checks pr runs anyway before the push, adds the most always-loaded lines against the state-once rule, and risks a second provider question."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "When does deliver observe the writer for the publication preflight?",
    "options": [
      "All at step 3.3",
      "Observe early, classify at 3.3",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "All at step 3.3",
        "score": 4,
        "reason": "It follows the issue's placement literally, but an unsupported writer is already knowable in step 1, so the user can confirm a source fast-forward and the manifest before a stop that was certain all along."
      },
      {
        "label": "Observe early, classify at 3.3",
        "score": 8,
        "reason": "The writer observation depends on neither base nor branch name, so stopping before upstream-status leaves nothing changed, while the head/base/source classification still runs at step 3.3 before creation as the issue asks."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does the step 1.1 early stop identify the intended head and base?",
    "options": [
      "Configured base and head pattern",
      "Stop only at step 3.3",
      "Record AC1 deviation",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Configured base and head pattern",
        "score": 8,
        "reason": "It is the only option that keeps the early stop before any mutation while still naming a base and the intended head; the configuration read only moves forward from step 1.2 without fetching, and the head is a pattern because step 3.2 derives the exact name later."
      },
      {
        "label": "Stop only at step 3.3",
        "score": 4,
        "reason": "It names the exact head and base, but the step 1.1 fast-forward can change the source branch before the stop, and the user answers the manifest question for a run that was always going to stop."
      },
      {
        "label": "Record AC1 deviation",
        "score": 2,
        "reason": "It knowingly drops an explicit acceptance criterion in exactly the reported case, while the base and a head pattern are cheap to name at step 1.1."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is the step 1.1 gate reconciled with the committed-range route?",
    "options": [
      "Early answer counts, neutral stop",
      "Allow both questions",
      "Exempt committed-range from gate",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Early answer counts, neutral stop",
        "score": 9,
        "reason": "It fits the route's existing single-provider-question contract and Publish-fence condition, so the pinned at-most-one-question paragraph stays unchanged, while a neutral stop and pair-only reason 8 remove the branch wording and boundBranch errors without reopening the decided placement."
      },
      {
        "label": "Allow both questions",
        "score": 2,
        "reason": "It breaks the pinned sole-approval rule that the committed-range route asks at most one question and weakens a guard test just to allow a second prompt."
      },
      {
        "label": "Exempt committed-range from gate",
        "score": 4,
        "reason": "It is plausible because pr step 6 already gates that route, but it reverses the decided step 1.1 placement, still leaves the early provider question to reconcile and leaves reason 8's wrong result in place."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does the step 1.1 early stop name the intended head without contradicting the route-neutral report?",
    "options": [
      "Conditional head wording",
      "Inventory-based wording",
      "Drop early head wording",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Conditional head wording",
        "score": 8,
        "reason": "It keeps both earlier decisions by naming the intended head for each possible route from facts step 1.1 already has, the prefix and the current branch, with no extra Git read and no change to the pinned step order."
      },
      {
        "label": "Inventory-based wording",
        "score": 6,
        "reason": "A clean tree predicts the committed-range route exactly, but it moves an inventory read ahead of step 1.1's upstream check, which the Selection contract places after it, and forces the ordered-step pin to change."
      },
      {
        "label": "Drop early head wording",
        "score": 3,
        "reason": "It removes the contradiction but goes back on the earlier decision, and the pre-mutation stop would no longer name the intended head the criterion requires."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does the plan handle the unverified incident cause?",
    "options": [
      "Obtain incident evidence first",
      "Add write-permission probe",
      "State residual risk",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Obtain incident evidence first",
        "score": 4,
        "reason": "It would firm up the cause, but no run can fetch the incident logs, so the precondition could block implementation indefinitely while the classifier needs no change either way."
      },
      {
        "label": "Add write-permission probe",
        "score": 2,
        "reason": "The incident run pushed the branch, so a push-permission read would have been true and missed the case, and a host restriction is not a forge permission."
      },
      {
        "label": "State residual risk",
        "score": 8,
        "reason": "It keeps scope, matches the existing late-failure edge case and visibility assumption, and turns the unverified cause into a stated limit plus a named follow-up eval without depending on unobtainable evidence."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How is the Git-fixture part of the regression case shaped?",
    "options": [
      "Drop fixture, map AC3",
      "Root-verified classifier",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Drop fixture, map AC3",
        "score": 9,
        "reason": "It keeps the decided pure classifier and stops presenting a snapshot that cannot fail as evidence; the same-topology unit pair plus the ordering contract tests are where the no-mutation proof actually lives, with no new Git surface."
      },
      {
        "label": "Root-verified classifier",
        "score": 3,
        "reason": "It contradicts the decided pure no-Git classifier and adds Git reads and failure modes to a call that runs before the head name exists, while the ordering contract tests remain the real evidence."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         6 |    4 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         2 |    0 |
| Maintainability |        0 |         0 |    4 |

### Findings

All findings from the internal review and the deep review are incorporated. None remains open.

Internal review:

- **Error cases, Important. The early stop could not name the head or the base.** The step 1.1
  stop now names the configured base and the head pattern, after the configuration read was moved
  forward (decided by score).
- **Error cases, Important. Helper failures were only partly mapped.** A failed
  `repository-resolve` or `probe` now becomes `helper-probe-failed` with its code. The stop report
  carries the helper's structured remediation, and the alternatives include fixing the helper.
- **Error cases, Important. On resume, a stop other than `unsupported` would leave the record
  `active`.** Every stop of the resume observation or classification now rolls the record back to
  `aborted`.
- **Error cases, Note. A restricted policy still asked the provider question.** The host-policy
  observation now comes first. Helper calls and the question run only under an unrestricted policy.
- **Scope, Important. The step 1.1 gate also changes the committed-range route.** The early answer
  counts as that route's provider question, the early report is route-neutral, and reason 8 is
  pair-scope only. Edge cases and Out of scope now state the gate explicitly (decided by score).
- **Testability, Note. The negative regression did not observe "no mutation".** The Git-fixture
  case now snapshots refs, worktrees, index and status, and asserts the intended head ref is absent.
- **Maintainability, Note. Existing contract pins that the edits would break were not listed.** The
  three pins in `test/workflow-contracts.test.mjs` are now named with their updates.
- **Maintainability, Note. The scored-decisions contingency was unresolved and the site id was
  unnamed.** The row test does not check closure membership, so the contingency is dropped and the
  row is named `S-DHST`.
- **Maintainability, Note. Four citations were off.** They are corrected to
  `remote-tracker-core.mjs:7328-7334`, `deliver.md:145-150`, `host-pr-watch.md:15-17` and
  `deliver-partial-diff-resume.md:109-110`.

Deep review:

- **Architecture, Important. Step 1.1 relied on call contracts that `deliver` does not load.**
  `deliver` now spells out the `repository-resolve` and `probe` payloads itself. A
  `remote-helper-contract` lazy-include at step 1.1 supplies the call shape, following the
  committed-range precedent.
- **Error cases, Important. "Resolve the base without fetching" was undefined for a
  remote-configured base.** Step 1.1 runs no base-branch resolution. The early stop shows the
  configured `delivery.baseBranch` value as a display value, and step 3.1 runs the full rule
  unchanged.
- **Error cases, Important. The early stop's head wording contradicted its route-neutral report.**
  The head is now named conditionally: the fresh delivery-branch pattern for a selected change, or
  the current branch when commits that already exist are published (decided by score).
- **Error cases, Important. The committed-range route could get `AMBIGUOUS_HOST` again.** The step
  1.1 answer is now passed as the provider override to condition 3's `repository-resolve`.
- **Error cases, Note. The reasons for `probe: null` were unspecified.** It contributes neither
  reason 4 nor reason 5.
- **Error cases, Note. The resume base field was imprecise.** It is now `resume.base.branch`, the
  same value the resumed step 6 hands to `pr`.
- **Error cases, Note. "Nothing changed" could be false after a Release answer.** The stop now says
  "nothing changed by this delivery" and lists any records this run already released.
- **Scope, Important. The fix rests on an unverified incident cause.** The plan now states a
  residual limit in its Requirement and Outcome checkpoint: a host restriction the model cannot see
  still fails late, and safely. It names a follow-up eval scenario and keeps a write-permission
  probe out of scope (decided by score).
- **Testability, Note. The Git-fixture regression could not fail.** It is dropped. The issue's
  regression criterion now maps to the same-topology unit pair plus the ordering contract tests
  (decided by score).
- **Maintainability, Note. Rarely reached stop text was loaded on every run.** The stop report,
  the alternatives and the host-tool description move into one lazy fragment,
  `deliver-publication-preflight`, shared by step 1.1, step 3.3 and resume.

## Open points

- No open points.

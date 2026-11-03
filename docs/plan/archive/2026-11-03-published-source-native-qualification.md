# Qualify the exact published release source on the existing native macOS host

**Plan status:** Implemented
**Source:** Release #595 acceptance investigation; bounded build Phase 1 handoff, 2026-11-03
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Restore an executable, rule-preserving qualification path for the exact final Release #595 source. Add one narrowly scoped acquisition alternative to the existing same-repository GitHub-hosted `macos-15` validation workflow. It acquires an already published immutable release commit directly from GitHub, without exporting local source, history, configuration, index, or private working-tree data. It must establish the same full technical qualification and a separately authenticated proof before the existing bounded PR581 provisional disposition can admit the release.

This is a Feature because it adds an acquisition and evidence kind. It does not repair the old transport by weakening its history guard. The ordinary full strict build-context verdict remains failed or unproven while its required populations are absent; the other behavioural suites remain strict. #78, Incus, pilot activation, production Fast configuration, new providers, new accounts, and paid eval launches are outside this plan.

The primary orchestrator owns plan approval, implementation admission, independent policy judgment, delivery, and the eventual release decision. This plan authoring step changes only this document. Neither this document nor its internal plan review grants a hosted run, repository-variable write, authorization publication, paid recording, or release merge.

## Outcome checkpoint

**Primary source:** `sebastian-software/effective-flow`, Release #595; feature PR581 and its unchanged acceptance requirements remain the parent association.

**Original outcome:** Resolve the blocked acceptance path safely, then carry Release #595 through its remaining gates without weakening evidence rules; continue #78 separately.

**Last evaluated attempt:** The original local-history transport correctly refused the known forbidden historical configuration path. The earlier sanitized investigation and architecture assessment establish a distinct remote-only acquisition alternative; neither a passing qualification nor release acceptance has been obtained by this plan.

**No-progress count:** Unknown in this child handoff; preserve the parent's recorded count and evaluated-attempt identities. Planning, a new branch, and this new filename do not reset them.

**Cumulative approach:** Preserve the exhausted ten source-fix rounds and their evidence. Existing protected workflow, runner, backend, provisional admission, and failed local-worker preflight remain the baseline. This delta adds no maintained service or executor framework. Remaining proof includes independent guarantee review, code checks, exact final release-source qualification, bound authorization, fresh ordinary eval evidence, and remaining release gates. Exact prior cost is unknown.

**Continuation decision:** Prepare one bounded implementation candidate under the explicit 2026-11-03 owner request for a safe fix. Implementation starts only after the parent accepts this concrete plan and independent policy judgment establishes unchanged audience and security guarantees. Allow at most three correction rounds for this candidate; preserve the exhausted earlier allowance. Stop on exhausted budget, failed mandatory proof, a changed audience or security boundary, or a need for an out-of-scope platform. The parent alone accounts for outcome progress and remaining allowance.

## Verified context and boundaries

Planning baseline: `5f6ad55914b90f46b5e208c1090a8f2d6bfa95cd`, 2026-11-03. The execution root is `/Users/bs5/.codex/worktrees/ef581-release-integration/effective-flow`, on `effective-flow/build/published-source-native-qualification`. Git root, common directory, branch, HEAD, and matching worktree entry were checked; the checkout was clean before this plan. The common repository and runtime root are `/Users/bs5/Developer/effective-flow` and its `.git`; its unrelated dirty plans are not implementation inputs and must remain untouched. Reuse the current harness-managed worktree and origin; do not create another worktree or change setup.

- `scripts/protected-validation-projection.mjs` verifies every reachable historical tree before local packing and submission. Its refusal of excluded historical paths, including the formerly tracked configuration, remains required. No whitelist, baseline subtraction, flattening, history rewrite, or old-guard exception is permitted.
- `scripts/protected-validation-operator.mjs` currently binds `prepare`, `submit`, and `observe` to the admitted worker's exported transport. Its trusted maintenance entry point can host separate closed remote-only operations; those operations must not call the transport preparation/export path or fabricate its fields.
- `.github/workflows/protected-macos-validation.yml` already listens to validation-ref pushes, uses `macos-15`, checks out the exact event SHA at depth 4096, and disables persisted checkout credentials. The supplied current remote observation says this workflow is absent from the delivery branch `main`; do not depend on `workflow_dispatch` bootstrapping. API reference creation is treated as a `create` event, never an assumed `push` event. GitHub documents `create` against the last commit of the created ref and discovers workflows at the event's associated commit/ref: [create events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#create), [workflow triggers](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows#workflow-triggers).
- At this baseline, CI, README, and Release accept push only on `develop`; Close develop issues accepts closed pull requests. Preserve this behaviour. Direct acquisition leaves workflow files at their original paths, so complete trigger isolation must be proved for the selected immutable source and event before ref creation.
- The runner already owns pinned environment bootstrap, credential-minimized product execution, the complete command sequence, all five native cases, source/index checks, and bounded process execution. The backend already owns authenticated attempt/job/raw-log verification. Reuse these responsibilities rather than trusting caller verdicts.
- Provisional admission currently accepts only an original attempt-1 transport qualification bound to the exact live release head/tree/version. It has no remote-only proof branch. Public repository availability is supplied fresh parent evidence, not blanket permission to export local data or broaden the executor audience.

The local export guard is not a demonstrated global prohibition on the same already published objects being acquired from GitHub by the already authorized ephemeral executor. Existing CI already checks out complete published history with `fetch-depth: 0` within that GitHub audience; this does not independently authorize local exports. The new branch must make this distinction explicit. Additional processing is limited to the existing hosted macOS executor; historical object content and path listings must not be exposed through logs, artifacts, caches, or diagnostics.

## Architecture decisions

1. **One existing executor and one new acquisition kind.** Keep the existing workflow, hosted runner class, repository, credentials boundary, and full checks. Reserve `effective-flow/qualification/published-source-<source-sha>` outside the old `effective-flow/validation/*` namespace. Add a discriminated `create` event to the existing workflow and an exact job guard for branch creation in the reserved qualification namespace; preserve the old `push` branch and transport execution unchanged. The runner validates the complete ref grammar and exact full SHA, rather than trusting a prefix alone. Bind the qualification ref to an exact same-repository published final release commit; caller repository URLs, arbitrary source refs, patches, and local source paths are invalid. Nonmatching create events must not execute validation steps; an old transport ref's create event must not be misidentified as its push proof.
2. **Remote-only operator operations.** Extend the existing maintenance operator with distinct inspect, create-ref, and observe operations for this lane. Inspect and observe are read-only. Create-ref performs only create-if-absent ref creation through the existing authorized normal operator API identity whose events can start workflows, not a workflow's run-suppressing `GITHUB_TOKEN`. It never updates, force-pushes, deletes, recreates, or retries an ambiguous ref creation. After ambiguity, read the actual outcome and stop before any further mutation. No new operator/core pair is required while these operations remain bounded in the existing maintenance script.
3. **Source identity without synthetic transport identity.** The execution repository retains the actual published commit and all its original reachable ancestry. Do not synthesize a parent or transport commit. The runner may create a separate disposable execution repository by credential-free acquisition of the same exact SHA from the fixed public same-repository URL; that repository is never pushed. Keep the trusted checkout and captured closure outside product-write ownership. Fail if the fixed history-depth limit cannot provide complete ancestry.
4. **Explicit versioned proof.** Add a closed, separately versioned published-source qualification schema and a new provisional authorization version with an explicit host proof kind. Retain the existing authorization/proof validators unchanged for the old kind. The new kind records genuine source identity, ref creation binding, workflow-isolation binding, policy/closure, run and attempt identities, and authenticated observations. It has no fake `localSnapshot`, materialization manifest, synthetic parent, or `materialized: true` fields.
5. **Workflow isolation before effects.** Inspect every workflow in the exact source and every relevant default-branch workflow needed for creation, any possible push, and downstream `workflow_run`, `check_suite`, `check_run`, or `status` semantics. A small closed recognizer supports only the trigger forms needed by this repository; reject unknown syntax, dynamic or ambiguous conditions, additional matching workflows, or unbounded downstream chains. No general YAML/event framework or new dependency is justified. Bind complete workflow membership and bytes into the proof; recheck immediately before ref creation and before acceptance. The remote runner repeats the candidate-source portion before product execution. A mere absence of observed extra runs is insufficient.
6. **Acceptance remains separately owned.** Remote qualification does not create a model-role receipt, repair an encrypted assignment, qualify a local worker, or prove performance, cost, context reduction, or quality equivalence. The new proof is used only at the existing release qualification boundary. Native worker admission and request/result/ordinary-receipt requirements remain unchanged wherever they apply.

## Affected files

The implementation has twelve owned files. Shared process runner, watchdog, transport projection/core, ordinary CI, dependency manifests, generated `dist/`, README, and unrelated plans remain unchanged. Reassess with the parent before expanding this list.

| File                                                    | Description and owner                                                                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/protected-macos-validation.yml`      | Workflow owner: add the separately guarded reserved-ref `create` entry while retaining the old `push` transport path, pinned actions, fixed depth, read-only permissions, and no caches/artifacts. |
| `src/scripts/protected-validation-protocol.mjs`         | Protocol owner: closed direct-source proof/policy definitions and discriminators; unchanged old validators, commands, native cases, and environment.                                               |
| `scripts/protected-validation-operator.mjs`             | Operator owner: remote-only inspection, complete workflow-isolation preflight, create-only ref, and observation; no local export calls in this branch.                                             |
| `scripts/protected-macos-validation.mjs`                | Runner owner: direct remote acquisition, complete original-history/source invariants, frozen file membership/modes/digests, and shared unchanged command execution.                                |
| `scripts/protected-validation-backend.mjs`              | Evidence owner: independently authenticated direct-source run/job/log/source/closure verification and cross-kind replay refusal.                                                                   |
| `evals/build-context/_scaffold/provisional-release.mjs` | Admission owner: new authorization version and host-kind branch; preserve live release binding, old branch, exact absence checks, authority, review, expiry, and blob pins.                        |
| `test/protected-validation-operator.test.mjs`           | Operator/backend/protocol cases: remote-only calls, publication/ref checks, trigger closure, authenticated backend observations, malformed proofs, and preserved history-export refusals.          |
| `test/protected-macos-workflow.test.mjs`                | Workflow/runner cases: source acquisition, original ancestry, complete file verification, immutable closure/index, credential isolation, unchanged full commands, and native TAP.                  |
| `test/build-context-provisional-release.test.mjs`       | Authorization cases: new closed version/kind, exact release bindings, unchanged absence/authority/review/expiry constraints, and old authorization compatibility.                                  |
| `test/build-context-provisional-host.test.mjs`          | Hosted admission cases: authenticated direct-source proof, wrong source/closure/kind, stale or incomplete backend data, and unchanged original transport proof.                                    |
| `src/shared/protected-validation.md`                    | Contract owner: distinguish local transport export from the bounded same-audience published-source qualification alternative; preserve old guard and feature helper-chain guarantees.              |
| `docs/developer-guide/release-and-installation.md`      | Release owner: exact final-source sequencing, direct proof kind, create-only ref, no rerun substitution, and unchanged remaining release gates.                                                    |

## Implementation details

### Approach

1. **Approve the guarantee mapping before implementation.** Independent policy review must confirm that no local source/history/private data leaves the machine, no new audience or service is introduced, and every original check/acceptance boundary is retained. Review the scoped plan, not the superseded broader adapter proposal. Parent approval opens code work only.
2. **Add the closed remote-only contract and operator path.** Derive the fixed repository, exact live release SHA/tree/version, published commit presence, full candidate workflow membership, relevant default-branch trigger closure, and the frozen execution closure through bounded authenticated reads. Reject dirty/uncommitted candidate inputs when producing a local candidate binding, but never read/export foreign plans, private history, credentials, or raw sessions. Separate inspect from the eventual write operation. Ref creation requires the exact inspected inputs and absent destination; supplied pass booleans are invalid.
3. **Implement isolated direct acquisition and shared validation.** Acquire the exact source in the existing runner, reject foreign URLs/refs and shallow/grafted/replaced/incomplete ancestry, and capture full tracked file membership, modes, content digests, HEAD/tree, original ancestry identity, index, and closure in the trusted process before product execution. Retain the existing source-path safety checks on the current candidate. Historical objects are acquired only from GitHub and are not passed through the local-export classifier as though they were a local pack. Verify all captured identities again at completion; reject missing, added, modified, or unsafe source members.
4. **Verify genuine backend proof and integrate admission.** Match authenticated repository, `event=create`, branch type, reserved ref, source SHA, workflow identity/bytes, runner, original attempt 1, exactly the required complete job and steps, full raw log archive, command intervals, and required native TAP. Never label ref creation as a push or accept an unrelated push run as direct-source proof. Bind source-tree members and modes/digests to the remote source rather than a caller manifest. The new authorization binds these observations and the exact final live release head/tree/instrument/policy/version. Reject cross-kind replay and unknown fields without normalizing them into old transport shapes.
5. **Complete bounded code review and technical gates.** Run focused red/green coverage and the repository validation sequence in a genuinely qualified environment. Independent review closes every material policy/security finding. At most three correction rounds belong to this one candidate; exhausting the allowance or discovering a guarantee change stops this approach. Do not restart the older exhausted source-fix loop.
6. **Hand back the qualified code candidate before real execution.** Deliver source through `develop` under the normal gates; release-please owns its release branch and stamp. Freeze the exact final Release #595 head/tree/version and current workflow/instrument/policy bindings after the stamp. Re-inspect and independently review that binding before the parent admits one original hosted attempt. Source or release-head drift invalidates earlier binding. Do not create a ref or start a hosted run during the code implementation phases.
7. **Preserve the remaining release sequence.** Only after successful original qualification and bound review may the authorized release operator publish the detached authorization blob, set the two trusted pins, and rerun release CI. Existing fresh ordinary behavioural evidence and remaining merge/release gates still apply. Paid evidence launches require their separate grant. This feature's code completion is not Release #595 acceptance.

### Edge cases and stop conditions

- If API ref creation does not produce the required original `create` run under the existing operator identity, preserve the ref/outcome and stop. Do not add `workflow_dispatch`, another workflow, a bootstrap commit, a source upload, a new credential, or a second platform as recovery.
- If a trigger cannot be proved inactive, refuse before creating the ref. A new relevant default-branch workflow or changed downstream workflow invalidates the isolation binding even when the source tree is unchanged.
- If the exact ref already exists, refuse. After a network timeout, observe its actual identity without mutation; do not recreate it or overwrite an earlier snapshot. Attempt 2, manual rerun, or a different candidate cannot stand in for the original run.
- If full original ancestry exceeds depth 4096, is incomplete, or requires private/non-published objects, refuse. No shallow acceptance, graft, replacement, flattening, parent rewriting, local pack, or historical-path exception is allowed.
- Keep errors free of historical paths, commit messages, blob contents, credentials, and private host paths. Tests use synthetic repositories and injected backend responses; genuine private history is not a fixture.
- Stop on any new executor audience, service/account requirement, weakened check, lost evidence, unresolved material finding, or exhausted correction budget. Preserve the previous release and diagnosis; do not mark this plan or parent acceptance complete merely because work stops.

## Acceptance criteria

- [ ] The direct branch performs no local history/source/index/working-tree export; injected-call tests prove it invokes neither `createTransport` nor transport preparation/packing, Git push, blob creation, artifact upload, or cache publication.
- [ ] Only an already published exact same-repository final release commit is admitted. Wrong repository/URL/ref/SHA/tree/version, unpublished input, dirty binding, existing ref, and changed live release head are rejected before ref creation or acceptance as applicable.
- [ ] Complete candidate workflow membership and relevant downstream/default-branch trigger closure prove that only the intended validation workflow can execute qualification steps. The reserved-ref `create` case passes and is independently identified as `create`; old transport `push` behaviour remains valid. Nonmatching create events run no validation steps. Additional matching `push`, `create`, `workflow_run`, `check_suite`, `check_run`, or `status` workflows, unknown files, ambiguous syntax, and incomplete observations fail closed.
- [ ] The actual source HEAD, original reachable ancestry, exact tree, every tracked file/mode/digest, execution index, and frozen closure are checked before and after commands. Synthetic missing/extra/changed members, shallow/grafted/replaced/missing history, altered source/index/closure, and history-depth overflow are rejected.
- [ ] Both proof kinds have separate closed schemas and genuine identities. Existing transport qualification and historical-path negative guards retain their outcomes; mixed fields, unknown kinds/versions, fake materialization, and cross-kind replay are rejected.
- [ ] Authenticated original attempt 1 proves `event=create`, the exact source/branch-ref/workflow, and complete required job/raw logs. A push event, wrong identity or ref type, attempt 2, incomplete/paginated/truncated observations, duplicate/reordered/forged/out-of-step logs, skipped steps, and failed/absent native cases are rejected.
- [ ] Full preflight, format check, unit suite, build, distribution suite, all five literal native cases, pinned environment/actions, credential isolation, and source/index drift checks remain mandatory and unchanged. No source/archive/cache output is introduced.
- [ ] Provisional admission keeps exact final release stamp/head/tree/instrument/policy/version, genuine authority and independent review, seven-day maximum, trusted blob pins, original hosted proof, and exactly the 22 wholly absent populations. Partial/failed/stale/synthetic records remain ineligible; the ordinary strict verdict and other strict suites remain truthful.
- [ ] Independent policy review closes all material guarantee findings, code review closes required findings, the scoped technical checks pass, and the parent explicitly admits the final candidate before any hosted ref creation. No paid eval/provider/model launch is included in that admission.

## Validation plan

Planning validation is limited to formatting this plan and the read-only plan-lint command. No implementation test or actual native/provider/API operation runs while authoring it.

After plan approval, use synthetic temporary repositories and injected backend reads/writes to demonstrate each positive case and its paired rejection before running the full suite. Keep existing old-transport history-refusal tests unchanged. Focused command: `node --test test/protected-validation-operator.test.mjs test/protected-macos-workflow.test.mjs test/build-context-provisional-release.test.mjs test/build-context-provisional-host.test.mjs`. Expected: every relevant case executes and passes; a skip of required native integration is not native qualification.

Run trusted maintenance source QA in its actual QA process and environment, separately from the failed native worker. Require the unchanged `pnpm test:preflight` and all full checks there. An outside-worker source-QA pass qualifies neither the original worker nor a native executor lane. Preserve the original failed worker preflight; the later real native qualification remains mandatory. This source-maintenance path grants no exception for pilot or feature workers. If the QA environment cannot run the unchanged checks, retain the failure and stop that validation path.

Run the repository's required order after distribution-source edits: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. All must exit successfully in their admitted environment. Inspect the diff to confirm the twelve-file implementation scope, no generated `dist/` edits, no version bump, no history-guard changes, and no output/cache/upload additions. Because the shared protected-validation fragment affects eager prompt text, inspect build guards and measured context budgets; any required out-of-scope budget/configuration change returns to the parent before editing.

After code delivery and the final release stamp, one original hosted attempt supplies the decisive technical qualification: exact final source, complete original ancestry and file identities, unchanged full commands, five passed native cases, authenticated attempt/job/raw-log proof, immutable source/index/closure through completion, and independently confirmed workflow isolation. Old qualification, ordinary CI, local QA, and a rerun are insufficient substitutes. The parent then owns authorization pins, fresh ordinary evidence, release CI, merge, and post-release verification under their existing rules.

## Plan review

**Result:** Approved

### Summary

Internal plan-level review on 2026-11-03 used Effective Delivery for scope and executable acceptance, and Effective Engineering for architecture and trust boundaries. This result approves the plan's completeness only; the parent-required independent guarantee judgment and build Phase 1 approval remain explicit implementation prerequisites. No independent code, policy, hosted, or acceptance review is claimed here.

The plan separates local-export protection from same-audience remote acquisition, retains original history rather than rewriting it, and keeps qualification distinct from native feature receipts and full behavioural acceptance. The minimal extension stays in the existing operator/runner/backend rather than creating a framework, service, or secondary source-export mechanism.

### Findings

- Important, incorporated: direct source leaves other workflows at original paths; complete pre-effect and downstream trigger isolation is mandatory, including default-branch observations where relevant. Unknown forms reject rather than guessing.
- Important, incorporated: the direct proof must have its own schema/version and real commit identity; no synthetic-parent or materialization fields may be fabricated to satisfy the old verifier.
- Important, incorporated: public source is not blanket transport authority. Admission is bounded to this same repository and existing authorized ephemeral audience, with no local export and no historical content publication.
- Important, incorporated: a new plan does not reset parent progress or exhausted effort. The old ten rounds remain exhausted; one new candidate has at most three correction rounds and retains its downstream operational gates.
- Important, incorporated after independent policy review: trusted maintenance source QA uses its own actual process/environment and unchanged full checks. It cannot establish native-worker or native-lane qualification; the original worker failure and later actual native proof remain mandatory.
- No unresolved critical or important plan findings remain. Current hosted qualification and release acceptance remain unproven operational outcomes, not assertions of this planning review.

| Criterion               | Assessment                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Clarity                 | Exact baseline, twelve owned files, roles, ordered steps, and stop conditions stated.                                             |
| Verification            | Each trust/identity/quality requirement has positive and negative evidence and required commands.                                 |
| Context                 | Repository paths and current behaviours checked; supplied remote observations and remaining live proofs explicitly distinguished. |
| Big Picture             | Release #595 remains the primary outcome; no pilot or #78 expansion.                                                              |
| No-code boundary        | This run writes only this plan.                                                                                                   |
| Code frugality          | No implementation code included.                                                                                                  |
| Workflow recommendation | Feature build fits the added acquisition and evidence behaviour.                                                                  |

## Open points

- No open points.

## Source delivery result — 2026-11-03

The source implementation is complete. The twelve implementation files deliver the separate published-source acquisition and proof kind, authenticated observation, compatibility-preserving admission, regression coverage and owning documentation. Source PR #607 carries this code milestone; release-please remains the owner of the final release source and stamp.

The acceptance criteria above remain unchanged. Passing synthetic tests demonstrates the implemented verification behaviour; it does not turn a required live observation into a passed result. Actual exact-release hosted/native qualification is **NOT RUN / UNPROVEN**. Release #595 acceptance is **OPEN**. The original failed worker preflight remains retained and unqualified. No pilot was restarted, no Fast configuration was enabled, and no real hosted or model workload was launched by this implementation.

### Technical validation

- The final focused contract run passed all 268 tests, without failures or skips.
- The full unit suite passed 4,205 tests, with zero failures and three declared evidence-archive skips. A separate non-UTF-8 filename branch was unavailable on the local filesystem with EILSEQ; no broader coverage is claimed.
- Format, build and offline distribution checks passed, in the required sequence and in the actual trusted source-QA environment. All source, plan, index and checkout identities remained stable throughout that sequence.
- A read-only interoperability check authenticated a genuine published GitHub source archive against its complete API tree and blob identities. This checks archive compatibility only and supplies no native qualification.
- The initial and first corrective focused runs failed; both failures and the successful second corrective round remain preserved. Two of the three authorized correction rounds were consumed; this documentation handback does not reset any allowance.

### Review findings

The independent guarantee review and final source review have no unresolved critical or important findings. One CLI usage note was corrected; the combined incorporation review has zero residual critical, important or note findings. Review binding uses the exact checked file hashes. Requested worker settings are not independently verified execution metadata and supply no native model-adherence claim.

### Remaining parent operations

After source integration, freeze the final stamped Release #595 commit, tree, version, workflow, instrument and policy. Obtain the separately required approval for its concrete execution package before creating one original qualification ref or starting any paid evidence. Require authentic attempt-1 job/raw-log proof, unchanged full checks and all five real native cases. Keep bound independent review, authorization publication, trusted pins, fresh strict behavioural evidence and all remaining release gates mandatory. Earlier-source or expired evidence and reruns remain ineligible. This archived code plan needs no post-qualification edit; the parent retains the operational outcome and audit. #78 continues independently.

### Final CI fixture correction — R3

The first source-PR CI run exposed two synthetic `commit-tree` setup failures: the cloned test repository did not inherit the trusted fixture's Git identity. The final authorized correction sets a synthetic identity only in that temporary clone and permanently exercises both existing guard cases with inherited Git/EMAIL identity removed, system/global configuration disabled and `user.useConfigOnly=true`. The mutation, ancestry and privacy assertions remain intact and are strengthened. Product code is unchanged.

The controlled red run reproduced exactly two failures among 26 cases; the identical hermetic command then passed all 26. Independent review has zero residual critical, important or note findings. The complete R3 source-QA commands passed: format, 4,205 unit tests with zero failures and three declared evidence skips, build and offline distribution. The separate filesystem EILSEQ limitation remains unchanged.

The QA wrapper stopped after the passing unit command because a foreign worktree registration disappeared. Its failed wrapper report is preserved. Independent reconciliation verified that all 1,985 file identities and modes, index, status, HEAD, branch, own execution registration and main runtime root remained unchanged. Only the outstanding build and distribution commands were then completed, without repeating tests. This composed result does not relabel the earlier wrapper report or waive a required input boundary.

All three authorized source correction rounds are now consumed. No fourth round, real Hosted/native qualification or behavioural-model execution is authorized by this source delivery. The remaining parent release operations and their separate grants above remain mandatory.

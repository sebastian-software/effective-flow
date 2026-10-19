# Issue Buddy tool: one dry-run or publishing pass per checkout (stage 1)

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `origin/develop` at `025301db1dc029577e4964dab9ea038494e39a96`, 2026-10-19 (WP3 merge #577).
**Working state:** The authoring checkout remains at `e7117a36`; its unrelated WP1 and WP3 plan revisions are preserved. This WP5 path was clean before revision. The separate uncommitted WP5 revision in the primary checkout supplies its recorded 2026-10-18 decisions and remains untouched. Source facts below come from the fetched source tree, not the old authoring checkout or the earlier draft's imagined APIs.

## Requirement

Deliver WP5 of [`2026-09-29-issue-buddy.md`](../../concept/2026-09-29-issue-buddy.md): an exposed `issue-buddy` tool that performs one bounded pass over one primary repository checkout. Default is a dry run; only `--publish` may push a plan branch and open a draft plan pull request. The new tool owns orchestration, not a second implementation of trust, fingerprints, cache transitions, scanning or publication.

The prerequisite packages are implemented and merged: [WP1](2026-10-01-codex-exec-unattended-spike.md), [WP2](2026-10-01-unattended-planning-and-readiness-contract.md), [WP3](2026-10-01-issue-buddy-runtime-script.md) and [WP4](2026-10-01-shared-plan-publication-core.md). Their actual interfaces are authoritative. WP5 precedes the scheduled dry-run job WP6a, credential-isolated publication WP6b and operational calibration WP7 in llm-automatisator. Historical WP1 observations do not authorize a production CLI-pin change or substitute for a WP5 live pass.

Binding decisions retained from the existing plans:

- **D1:** dry runs write guarded local runtime cache, trusted text and reports, with `mode: dry-run`; they create no plan file, branch or PR and perform no forge mutation. Bounded fetches may update Git objects and remote-tracking refs; an existing runtime-directory migration may write its private marker. A dry-run ready result is `would-publish`; publishing judges it again.
- **D3:** GitHub only; trust uses collaborator `write` or `admin`. Forgejo is deferred.
- **D2:** private repositories remain dry-run-only in stage 1. Removing the publishing stop belongs after WP6b credential isolation and its operator acknowledgment, not here.
- **D4:** operator-run publication on public repositories retains its recorded advisory boundary: the operator credential is reachable by unsandboxed model steps. Scheduled publication still waits for WP6b isolation and WP7 verified bot rules. This package does not claim credential isolation or a forge-enforced boundary.
- **No worktree (2026-10-18):** planning writes one untracked file directly into the invocation checkout; WP4 publishes through plumbing without changing its `HEAD` or index. Create no worktree or worktree lifecycle record. Use the verified invocation/runtime roots required by current safety contracts; do not add a disposable-worktree lifecycle or cleanup exemption.
- **Earlier leftovers:** report and skip their issues; never delete a plan left by an earlier pass. The operator removes it; a scheduled fresh clone does not inherit it. Only a file proven newly created by this pass may be removed after successful publication and a blob match.
- **Model environment:** no subagent mechanism, a declined spawn or a failed nested-spawn probe stops the pass. Do not judge or plan inline. These are environment faults, not per-issue retry consumption. A malformed readiness answer is an issue-level `failed`, not a substantive `not-ready` judgment.
- **Fixed forge text:** title/commit message use `docs: plan issue #<N>` with descriptive words in `language.git`; the body is a fixed sentence naming the issue, review result and number of open points in `language.forge`. Never copy issue or plan prose into these strings. WP4 appends its marker and `Refs #<N>` and opens a draft. Plans with blocking points are still published with their status explicit; implementation waits for clarification.
- **Continuation:** the published-plan continuation is `build <plan-file>`, including instructions to restore the file from the PR branch first. Do not recommend merging a plan-only draft before implementation.

This is Feature work: a new visible tool plus the minimal deterministic consumer support needed for its accepted behavior. It does not implement WP6, change runtime credentials or re-derive WP4 publication mechanics.

## Architecture decisions

### Verified building blocks and ownership

- WP3's `src/scripts/issue-buddy.mjs` and `issue-buddy-core.mjs` expose exactly six operations: `pass-lock-acquire`, `pass-lock-release`, `pass-collect`, `verdict-record`, `pass-report`, `fingerprint`. They require primary-root `cwd`; no `repositoryIdentity` input or 32-hex pass-id promise exists. Treat the returned pass id as opaque. Persisted collection and `pendingVerdict` live in `pass.lock`, not `collect/<passId>.json`.
- `pass-collect` receives `passId`, `mode`, `baseBranch`, `planDir`, `branchPrefix`, `visibility` and optional limits/stale-attempt evidence. It returns `baseOid`, the limited `eligible` entries, skip diagnostics, recovery entries and separate `authorizedRecovery`. Eligible entries contain `issue`, `fingerprint`, `issueAuthor`, `headRef`, `trustedTextPath`. Use persisted authorization, never caller-fabricated recovery metadata.
- `fingerprint` needs the trusted-text path and separate issue author; keep WP2's closed trusted JSON unchanged. WP3 already implements retries, stable attempt identity, journal/reconcile and report validation. Do not duplicate them or introduce an `ENVIRONMENT_ERROR_CODES` import that does not exist.
- All WP3 mutators use the accepted whole-operation loopback TCP mutex. Deployment requires a shared host/network namespace, permitted local bind and same-directory hardlink support. Occupied/denied bind fails closed; there is no alternative port, file-lock fallback or automatic deletion of legacy locks. The durable whole-pass lock remains until explicit release, including after SIGKILL.
- WP4's existing pair owns branch naming, scan, single-file assertion, create-only push, draft PR creation/read-back and bounded `complete-branch`. Empty branch prefixes work. `publish` does not reuse an already open PR; WP3's unrecorded-PR recovery reconciles that case. An ambiguous create is followed by one lookup, never another create.
- WP2 owns the five-line unattended envelope, trusted-data path, readiness R1–R4 and one-file-only planner authority. The parent never treats issue text as control instructions or reads it to perform model judgment itself.

### Bounded consumer amendments in WP5

These are planned changes to the existing helper pairs, not already implemented prerequisites. No new runtime family or second cache is needed.

**Versioned report:** add optional `reportVersion: 1|2` to `pass-report`, default `1`. Keep v1's closed keys, validation and emission unchanged; dispatch explicitly by version and never rewrite stored v1 reports. WP5 always requests v2, whose closed schema adds required `repositoryVisibility: public|private|unknown` and `leftoverPlanFiles`. New readers accept both versions; old readers may reject v2. WP6a must implement a complete v1/v2 reader before consuming WP5 reports.

For a stopped pass after successful collection, v2 permits `outcome: failed` with exactly one `{issue:null, stage, code}` entry in the existing `failures` list, alongside the numerical issue failures. Verdicts and PR identities must still match reconciled `collection.outcomes` exactly; numerical failure issues must match `failed` verdicts for either pass outcome. The null entry consumes no issue retry, failed count or publication budget. Keep `cutOff: none` on a pass stop. Preserve pre-collection failure rules and `withMutationLock → reconcileVerdict → report`, including atomic writes and refusal of an unresolved journal. No failed pseudo-verdict or new `passFailure` field.

**Leftover collection:** add optional `repositoryVisibility` and `leftoverPlanFiles: [{issue, path, action:"remove"}]` to `pass-collect`. `remove` is the operator's next action, never an action executed by WP5. Validate closed metadata, safe relative top-level canonical filenames and their numerical issue association; sort by path, reject duplicate paths and retain multiple paths for one issue. These inputs join the normalized request digest; persist their diagnostics in the collection result and `pass.lock`. Changed metadata on replay is rejected. No plan contents enter this input.

Run the normal trust/forge/cache classification, then exclude leftover issues before judgment eligibility/count/slice and before recovery authorization. Preserve the eleven existing skip reasons and counts; list leftovers separately, with no invented verdict, fingerprint mutation, retry consumption or recovery authority. For v2 reports after successful collection, initial metadata comes from that persisted collection. Before collection succeeds, accept the same validated metadata directly; visibility defaults to `unknown`. Newly created files preserved at pass end may be appended as validated report diagnostics only: preserve the initial list, deduplicate by path, reject conflicting identities, and never alter earlier selection or cache state. Blob identity is a bounded chat diagnostic, not a new cache field.

**Recovery inspection:** add read-only `inspect-branch` to the existing WP4 pair, with input `{cwd, runState, visibility, issue, planDir, branch, branchPrefix, remote, baseBranch, expectedBaseOid?}`. Share its internal inspection with `complete-branch`: bounded fetch, branch/issue association, single-file changeset, size/UTF-8 and scan checks. Return only `{baseOid, branchTip, planFile, blobOid, reviewResult, openPointCount}`, never plan/commit text or a local recovery copy. Extend the existing `plan-lint-core` classification with canonical `reviewResult: approved|revision-required`; reuse its structural inventory and open-point counting. Missing, invalid or ambiguous review labels and an unknown open-point count refuse publication metadata. A valid `revision-required` result or positive count remains publishable.

WP5 constructs the fixed localized body from these enums/numbers before `complete-branch`. Add optional `expectedTipOid` there: refetch and compare before PR creation, rerun changeset/scan checks, and retain the existing lock-held check directly before create. A changed tip refuses completion without creating a PR on that revision. Existing callers omitting the option retain their behavior.

**Collection basis:** add optional `expectedBaseOid` to WP4 `publish`, `inspect-branch` and `complete-branch`; existing callers remain compatible. WP5 always passes `collected.baseOid`. Compare immediately after the existing bounded base fetch; a mismatch stops before push/create and becomes a pass-level failure without issue retry consumption. Do not silently replan. This binds authorization to the basis used for publication; later ordinary movement of the PR target branch is outside this check.

**Local plan bytes:** the deterministic local metadata projection must also return the Git blob OID of the same immutable bytes from which review/open-point metadata was classified, using the repository's object format. A second path read or a model-supplied hash does not establish that binding. Add optional `expectedBlobOid` to WP4 `publish`; WP5 always supplies it. Compare against the actual plan blob used in the publication commit before any push. A mismatch stops the pass without issue retry or forge mutation. Existing callers omitting the option keep their behavior. This binds the fixed body to the published plan as `expectedTipOid` does for recovery.

### Orchestration and registration

- Add `issue-buddy` immediately after `plan-issue` in `TOOL_GROUPS`, quoted `catalogHint`, a measured `CONTEXT_BUDGET_LINES` entry and the expected tool inventories. It is a new tool, not an alias.
- Resolve configuration once with `config-resolve.mjs` using `tool: issue-buddy`: `plan.dir`, delivery base/prefix, visibility, tracker mode and six artifact languages. Add its delivery successor-set entry. Stop on locator failure/retired stop; never ask for missing tracker mode.
- Resolve and verify the primary root from Git's first worktree record and common-directory identity. Require invocation root to equal the primary root; no separate state namespace through a linked checkout. Preserve unrelated tracked/untracked files and index state. `--publish` additionally requires a clean tracked tree and `HEAD == collected baseOid` before planning/recovery.
- Three explicit model-tier spawn sites: `issue-buddy/readiness` standard/down=no, `issue-buddy/plan-run` deep/down=no, `issue-buddy/nested-spawn-probe` mechanical/down=yes. The plan run is a workflow orchestrator and starts the no-op child before planning. Named readiness workers are leaves. Await all children.
- Eager chat-language, delegation-mandate and configuration contracts; lazy next-steps. No reachable ask fence in this unattended path or its eager closure. The silent session-title partition includes the tool. Apply the skill-ownership check: orchestration stays here; planning/review craft stays with the delegated workflows and domain skills.
- This package owns the living ADR `docs/adr/plan-only-unattended-publication.md`, English/Active/numberless slug. Preserve D2/D4 and the one-plan-file/draft boundary. Do not rewrite WP2/WP3 ADRs or add a token-isolation claim.

## Affected files

| File or area                                                                                                                                                   | Planned change                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/issue-buddy.md`                                                                                                                                     | New exposed orchestrator, strict argument grammar, preflight/outcome table, three spawn markers, fixed envelope and final report          |
| `build.mjs`                                                                                                                                                    | Tool catalog and measured context budget; no new runtime family                                                                           |
| `src/scripts/config-resolve-core.mjs`, `test/config-resolve.test.mjs`                                                                                          | Issue Buddy successor-set registration and retired-row behavior                                                                           |
| `src/shared/model-tiers.md`, `test/model-tiers-contract.test.mjs`                                                                                              | Three spawn sites and tier/downshift invariants                                                                                           |
| `test/execution-profile-contract.test.mjs`, `test/delegation-mandate-contract.test.mjs`, `test/session-contracts.test.mjs`, `test/workflow-contracts.test.mjs` | Expected tool/eager-include/session/language inventories                                                                                  |
| `src/scripts/remote-tracker-core.mjs`, `src/scripts/remote-tracker-github-core.mjs`, `test/remote-tracker.test.mjs`                                            | Additive GET-only `repository-visibility-read`, its normalized visibility and capability; Forgejo advertises false                        |
| `src/scripts/issue-buddy-core.mjs`, `test/issue-buddy.test.mjs`, `test/issue-buddy-git.test.mjs`                                                               | Opt-in report v2, bound pre-slice leftover diagnostics, unchanged v1/six-operation/cache contracts, strict authorization and crash safety |
| `src/scripts/plan-publication-core.mjs`, its focused tests                                                                                                     | Read-only inspect-branch, expectedTipOid, expectedBaseOid and expectedBlobOid; retain existing caller behavior                            |
| `src/scripts/plan-lint.mjs`, `src/scripts/plan-lint-core.mjs`, `test/plan-lint.test.mjs`                                                                       | Shared deterministic review-result metadata and same-bytes blob projection; preserve existing classification and lint callers             |
| `src/shared/next-steps.md`, `docs/user-guide/tool-flow.md`                                                                                                     | Two concrete Issue Buddy continuation rows and mirror                                                                                     |
| `src/shared/session-title.md`                                                                                                                                  | Silent-tool partition                                                                                                                     |
| `test/issue-buddy-contract.test.mjs`, `test/issue-buddy-pass.test.mjs`, `test/fixtures/issue-buddy/`                                                           | Deterministic composition and model-stub fixtures; assert the actual CLI/core protocol and output rather than a duplicate implementation  |
| `docs/adr/plan-only-unattended-publication.md`                                                                                                                 | Active publication-boundary ADR                                                                                                           |
| `docs/user-guide/tools-understand.md`, `docs/user-guide/README.md`, `docs/user-guide/remote-tracker.md`                                                        | Flags, dry/public/private behavior, prerequisites, draft continuation, explicit release and leftovers                                     |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`                                                                                 | Runtime/workflow composition and any approved consumer-support amendments                                                                 |
| `README.md.src`, generated `README.md`                                                                                                                         | One scoped tool mention; regenerate/verify through mise                                                                                   |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md`                                                                         | Change only if the new tool introduces a declared consumer relationship; record no-overlap/delegation rather than duplicate a playbook    |

## Implementation details

### Approach

1. Refresh `origin/develop` and compare in-scope contracts with the recorded baseline. Re-read changed symbols, preserving unrelated work. Compatible movement is not a blocker; incompatible contract drift requires plan revision.
2. Implement the bounded consumer amendments above in their owning helpers, with focused version/failure/replay/compatibility regressions. Do not begin the exposed orchestrator against invented APIs.
3. Add repository visibility read/capability and normalize public/private/unknown fail-closed for publishing.
4. Add tool/config/tier/session/ownership registration, then describe phases 0–6 against actual helper payloads.
5. Build integration fixtures from real WP3/WP4 plus disposable Git repositories and injected forge/model boundaries. Do not replace the shipped runtime with a parallel test driver algorithm.
6. Write the ADR and user/developer docs, regenerate README with locked mise tooling, then set the built context budget from the measured report with at most ten lines headroom.
7. Run required checks to terminal completion, inspect read-only eval drift and perform the authorized live smoke. Record exact evidence and actual blockers; never treat an unavailable smoke as a pass.

### Pass phases

**Arguments:** `issue-buddy [--publish] [--max-judgments <n>] [--max-plans <n>]`; each flag at most once, positive decimal safe-integer tokens only, defaults 3/1, no extra arguments. Reject zero, signs, fractions, exponents, unsafe integers, duplicate flags, missing values and option tokens used as values before writes.

**Phase 0 — preflight:** configuration/root validity; hidden-mode stop; configured remote tracker; GitHub origin; runtime safety/migration; whole-pass acquisition; repository visibility; publishing clean-tree check; subagent capability. Only the visibility read is a forge read before collection. Failures before acquisition write nothing except an authorized pre-lock migration; after acquisition use the existing failed-preflight report and release. Unknown visibility stops publication; dry-run reports it. Base/prefix/languages are frozen for the pass. No sf-label migration or tracker-mode prompt.

**Phase 1 — earlier leftovers:** inventory all existing paths directly under `plan.dir`, including ignored files, symlinks and nonregular paths. Stop safely on an unsafe/colliding nonregular path; never read its contents or follow a link. Supply regular untracked canonical issue-plan files as the collection's initial leftover metadata; report path/issue/blob identity and operator action, never remove prior-pass files. Ignored or otherwise ambiguous collisions must not become planner-owned files. Exclude associated issues before candidate limits and recovery authorization through the specified collection amendment. A leftover must not suppress unrelated eligible issues or grant orphan authority.

**Phase 2 — collect and recovery:** call the amended WP3 collection with primary-root `cwd` and bound visibility/leftovers; use the returned opaque pass id and `baseOid`, persisted slice/recovery and exact trusted paths. A dry run reports recovery only. Publishing requires `HEAD == baseOid` before proceeding. Execute only persisted `authorizedRecovery`, up to the remaining plan limit; inspect orphan branches, build fixed text from returned metadata, then call `complete-branch(expectedTipOid)`; reconcile proven unrecorded PRs through `verdict-record`. Pass `expectedBaseOid` on every applicable WP4 operation. Never recover a merely listed, exhausted, foreign or untrusted branch. A later branch/base move or PR race cannot justify a second create or a fabricated published outcome.

**Phase 3 — readiness:** fresh read-only leaf per eligible candidate while plan budget remains. Require exactly `Verdict: ready|not-ready`, `Failed: <R-ids or none>`, `Reason: <one bounded line>`, with WP2 language/criteria rules. A valid `not-ready` is persisted in either mode. Dry-run ready becomes `would-publish`, consuming the same plan budget as a published/recovered plan. Stop when that budget is exhausted, with `cutOff: publish-limit` and no additional verdict; otherwise report `judgment-limit` only when the collection limit actually truncates remaining candidates. Publishing ready proceeds without a `ready` cache/report verdict: WP3 admits only its four final verdicts. A malformed answer is issue `failed`; spawn/environment faults stop the pass without consuming an issue retry.

**Phase 4 — planning/review:** publish mode only, within remaining plan limit. Snapshot existing index/HEAD/tracked state and all relevant paths, including ignored/nonregular entries. The delegated workflow first proves nested spawning, then receives exactly WP2's five control lines and delimiter, with the trusted file path only; its separate brief restricts writes to one new plan under the invocation `plan.dir`. It may orchestrate its own analysis/review, but never publish or stage. Verify the produced artifact through filesystem/Git metadata and the shared `plan-lint` classification, not the model's summary: one new regular untracked file directly under canonical `plan.dir`, correct issue filename/header, complete plan status/review/open-points contract, no unrelated mutations or overwrite. A snapshot or equal contents alone is not proof of creation ownership. Record the creation identity and decline automatic cleanup whenever concurrent creation/replacement cannot be excluded. Do not inline-fallback or read issue/plan prose into the authority-holding parent.

**Phase 5 — publish:** invoke WP4 `publish` unattended with all required keys, including `commitMessage`, `expectedBaseOid` and the same-bytes `expectedBlobOid`; use fixed forge text from the bound validated metadata. Let WP4 own source scan, hooks, plumbing commit, branch naming, create-only push and draft PR/read-back. Record only confirmed published identity. After success remove only the exact newly created file whose current blob matches WP4's `blobOid`, with proven creation ownership and protection against replacement during the check/removal interval. A hash followed by ordinary pathname deletion is insufficient. If the filesystem/harness cannot prove these conditions, preserve and report the file rather than claim safe cleanup. Changed, ambiguous or earlier files are preserved. On issue failure or push/create ambiguity also preserve the file/branch and let subsequent collection classify it; do not force push or publish again blindly. Classify issue-content refusals separately from environment/integrity failures; unknown codes stop the pass rather than spend retry budget.

**Phase 6 — report/release:** request canonical WP3 report v2 and reconciled persisted outcomes. Include mode, visibility, initial/final leftover diagnostics, recovery, skip counts, bounded verdict reasons, PR URLs, failures and report path. A normal per-issue failure leaves the pass completed. Environment stops after collection use the specified failed-v2 form, retaining committed work without failed pseudo-judgments. Output `Pass result: completed|failed` from the stored outcome. Always attempt explicit pass release except after a killed process; never break a stale lock automatically. Publishing continuation names the concrete plan file, with restoration instructions when cleanup removed it; dry-run continuation advertises publishing on a public repository.

### Failure and recovery boundaries

Apply this outcome mapping in order; a code alone is insufficient because WP4 propagates tracker codes and distinguishes error origins:

1. **Confirmed success:** record `published` only from successful WP4 output with a confirmed draft-PR identity. A proven unrecorded PR already in `authorizedRecovery` needs only `verdict-record`, never another create.
2. **Mutation-state precedence:** error `details.state` of `branch-pushed`, `pull-request-opened` or `unknown` stops the pass, preserving file/branch without an issue `failed` verdict or retry. This wins over any familiar error code. `nothing-pushed` does not turn a network failure into an issue-content failure.
3. **Races/refusals:** `BRANCH_EXISTS`, `PR_EXISTS`, and inspection/completion `BRANCH_MISSING` or `BRANCH_INVALID` record no verdict and trigger no second create. Stop with bounded diagnostics; only fresh collection can authorize later recovery.
4. **Issue-failure allowlist:** only demonstrable faults in the new plan or authorized recovery artifact may record `failed`: plan-content scan, issue-header mismatch, invalid plan structure/encoding or missing/invalid review metadata. Require the operation/phase and safe error details to prove that origin. `SCAN_BLOCKED` from a hook-modified commit message is not a plan-content fault; `INVALID_CONTENT` with `details.reason: blob` is an integrity fault.
5. **Default pass stop:** base/tip/blob drift; Git/forge/network/runtime/journal failures; hook, fixed-template or helper-input contract failures; blob-integrity faults; and unknown codes stop without issue retry. `PUSH_REJECTED` without confirmed success is not an issue-content fault. Use the failed-v2 report, retaining committed outcomes.
6. **Persistence failure:** never bypass `verdict-record` or reconciliation with a substitute verdict. Preserve the journal contract and report the actual retained state if reporting itself cannot proceed.

Pin this mapping with operation/phase/error-detail fixtures, including identical codes from different origins and state precedence after push.

- Preserve all WP3 journal/replay checks. An unresolved verdict intent blocks new work; retry only the exact authorized outcome or perform explicit operator release. Do not infer state from missing caller output.
- No plan contains copied absolute local paths; the unattended argument path is control data, never material for the published plan/forge strings.
- No old leftover is deleted even if it resembles a known blob. A current file changed after publish is also preserved. No force cleanup of other untracked or tracked edits.
- No probe or fixture can prove credential isolation; retain D2/D4 exactly. Tests never widen credentials or silently switch a private target to public.
- Runtime safety/bind failure may prevent a failure report or release. Surface the actual primary error and retained state; never claim a report/release that did not succeed.

## Acceptance criteria

- [x] Tool registration builds in all three targets with quoted catalog hint, explicit tiers, correct session partition and measured context budget; current registration/ownership guards pass.
- [x] `test/issue-buddy-contract.test.mjs` proves strict flags, ordered preflight, non-interactive control lines, three spawn markers, no reachable ask/inline fallback, fixed template and actual helper call shapes.
- [x] Focused WP3/WP4 regressions prove every selected consumer extension preserves old callers, closed v1 behavior, explicit v2 opt-in, journal reconciliation, limits and authorization. Stopped v2 passes retain prior outcomes without issue retries; bound initial leftovers do not fill the judgment slice or grant recovery authority; changed metadata replays are refused.
- [x] `test/issue-buddy-pass.test.mjs` composes real runtime/publication logic with faithful injected forge/model boundaries and proves: dry-run local-only writes; one published draft plan PR; unchanged second pass with no forge writes; orphan/unrecorded-PR recovery with no duplicate; private publishing stop; unknown visibility fail-closed; nested-spawn/environment stop after partial work; malformed readiness consuming only its issue's failure budget; preservation of prior/changed/unsafe leftover files.
- [x] Kill/restart cases cover before/after plan creation, push, PR create/read-back and verdict/report persistence. Manual recovery first reports the held pass lock and requires explicit operator release. Any surviving local plan, before or after push/PR creation, remains preserved and its issue is skipped; prove that first. Only after the operator explicitly removes that file can a fresh pass replan an unpushed issue or authorize reconciliation of an existing branch/PR. Post-push recovery yields exactly one intended PR. Fresh clones do not restore locks, trusted text or old current-report output.
- [x] Recovery obtains fixed-body metadata before create, bound to the inspected tip and collected base. Moved base/tip, invalid metadata and foreign/exhausted candidates produce no unauthorized mutation; refusal retains existing committed outcomes and consumes no issue retry for environment stops.
- [x] Local classification binds review metadata to the exact published plan blob. Change review fields after classification and before publish: expectedBlobOid refuses before push/PR, preserves the file and consumes no issue retry. Cover the actual commit blob, including hook-related integrity checks, rather than merely comparing two earlier path reads.
- [x] Parent index/HEAD and unrelated tracked/untracked files are byte-identical after successful publish and after refusal. Cleanup removes only a proven owned, unchanged published artifact with replacement protection; ambiguous ownership or unavailable safe removal preserves and reports it. Cover concurrent same-content creation/replacement, ignored paths, symlinks and nonregular collisions; earlier leftovers remain for the operator.
- [x] The Active publication ADR and all user/developer/README surfaces describe stage-1 D2/D4, prerequisites, drafts, explicit release and operator-owned leftover cleanup; `mise run readme:check` passes.
- [x] The named live smoke has real draft PR URLs, pass reports and remote-ref evidence for dry-run, publish, unchanged retry and kill/recovery, using an explicitly authorized public test repository. No model result or partial log substitutes for its evidence.
- [x] Completion condition: all above evidence exists and `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` exit 0 in CI order, with no unreviewed scope change.

## Validation plan

Implementation only: run the four CI gates in order to terminal exit 0, focused Issue Buddy core/Git/tool/pass and publication suites, and locked `mise install --locked`, `mise run readme:write`, `mise run readme:check` for README. Preserve exact logs and evidence from the tested snapshot.

Use local bare remotes, actual shipped helpers and injected forge/model boundaries. The integration driver must follow the production deterministic sequence, with contract tests pinning the prompt's phase order and key sets; it must not be a second runtime implementation. Test external behavior, not copies of prompt prose except named orchestration invariants. Exercise reachable changed failure boundaries with real processes where SIGKILL or IPC is the claim.

Compare read-only `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval next-steps verify` before/after. At this baseline evidence is already stale (8 scenarios/40 runs and 7/35, with fifteen fixture paths from WP3); establish the next-steps baseline separately rather than assume its status. Record the exact additional drift for router, next-steps, session/tier/config changes; do not rerecord model evidence here or weaken fidelity guards. Rerecording is due before release under AGENTS.md.

Live smoke remains a separate named acceptance prerequisite. The operator selected [sebastian-software/sf-test-repo](https://github.com/sebastian-software/sf-test-repo) on 2026-10-19 and explicitly authorized creating smoke Test-Issues, plan branches and draft PRs, then closing only the issues/PRs created by that smoke and deleting only its test branches. This does not authorize unrelated repository changes or deletion of existing artifacts. A read-only check confirmed public visibility, non-empty history, enabled issues, default branch `main` and operator admin access. This fixture branch is distinct from Effective Flow's source branch `develop`; resolve the fixture configuration against its own base. Keep D2's public-only publishing gate. Reverify access and baseline during implementation.

Prepare trusted fixture authors and a ready issue plus a not-ready issue for the ordinary pass, then a distinct ready issue for kill/recovery so the unchanged-second-pass claim is not contradicted by another ready candidate. For every kill that leaves a local file, prove preservation/skip after explicit lock release, then require operator removal before the later planning/recovery pass. Keep cleanup inside the approved target and smoke-owned artifact set. Record created issue/PR URLs and branch identities before cleanup. No live mutation occurs during planning.

## Assumptions and open points

All predecessor source packages are complete. Scheduling, token isolation, Forgejo, issue questions/reactions, private publication, calibration and a new Issue Buddy behavioural-eval suite remain out of scope. Production CLI-pin decisions remain separate.

The accepted no-worktree path supersedes the old cleanup/lifecycle blocker. It does not weaken primary-root safety, file ownership, D2/D4 or fixed forge-text decisions. Re-entry compares actual consumer APIs with this baseline instead of the obsolete October 18 API table.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important (incorporated):** the mandatory read of `worktree-integration` before `git worktree add` could reach its `delivery.completion` question. The tool now reads only the execution and outcome sections, and the contract test forbids a pointer to the completion phase. _(Superseded 2026-10-18: no worktree, no pointer at all.)_
- **Architecture, Important (incorporated):** a missing tracker mode would reach the tracker-mode question in `issue-tracker.md`. Preflight now stops unless `tracker.mode` is `remote`.
- **Security, Important (incorporated):** the planning sub-agent's returned text was implicitly trusted. The pass now verifies the artifact deterministically before any push, and the scan blocks on every class when unattended. Without a sandbox and without forge rules, which a private repository lacks under D2 and no repository has before WP7 verifies the bot identity's branch rules, these checks are advisory; the ADR records this as the accepted risk. (For private repositories superseded by the D2 correction below; for public repositories in stage 1 recorded as the D4 accepted risk.)
- **Error cases, Important (incorporated):** a kill between the push and pull-request creation, and a stale worktree, now have defined recovery in Phase 1, counted against limits and retries. _(Worktree part superseded 2026-10-18.)_
- **Testability, Important (incorporated):** the Markdown tool cannot run in `node:test`. The integration test drives the deterministic sequence with stubbed model steps, and a contract test binds the driver's step order to the tool's phase list. Model behaviour is covered by the manual live smoke run.
- **Testability, Note:** the readiness stub and planner stub prove the composition, not readiness quality; calibration of readiness belongs to WP7.
- **Scope, Note:** configuration keys and an eval suite were considered and deferred; flags suffice for stage 1 and WP6a passes flags.
- **Maintainability, Note:** adding the tool invalidates the standing eval rounds; the re-record is owed before the next release and is named in the validation plan.
- **Cross-plan alignment (2026-10-01):** binding orchestrator resolutions applied. Preflight now acquires WP3's whole-pass lock (never broken automatically), so done criterion (d) includes the operator's stale-lock release for a manual pass. The readiness answer uses WP2's three verdict lines; the planning argument is exactly WP2's five-line envelope, with the handoff roots in the brief. Stale-worktree classification moved here from WP3; orphan branches go through WP4's `complete-branch`, and unrecorded plan pull requests come from WP3's `recovery` section. A preflight stop after the lock writes a failed report, so WP6a always finds `outcome`. The body no longer carries `Refs`, because the WP4 core appends it. The worktree check uses `git status`, because WP4's `assert-changeset` works on commits.
- **D2 correction (2026-10-07, user decision):** WP4's single-file assertion and scan hold only while the forge credential is unavailable to model steps, and that isolation is WP6b's job. Private repositories are therefore dry-run-only in stage 1: Phase 0 reads the repository visibility through the new `repository-visibility-read` and stops `--publish` on a private repository. The accepted-risk posture for private repositories is withdrawn.
- **D4 (2026-10-07, user decision):** on a public repository a stage-1 publishing pass also runs on the operator's own forge credential, which the unsandboxed model steps can reach, and no dedicated bot identity or verified branch rule exists before WP7. The single-file assertion and the scan therefore only advise there too. Stage 1 accepts this risk for operator-run passes and does not make public repositories dry-run-only; scheduled publication waits until WP6b isolates the credential and WP7 verifies the bot identity's branch rules. The ADR records the accepted risk.
- **Recovery cleanup (2026-10-07):** a pass killed after the push left a worktree whose branch was pushed, so Phase 1 never treated it as stale, and neither WP4's `complete-branch` nor WP3 touched worktrees; the discard mechanism was an open point. _(Superseded 2026-10-18: there is no worktree.)_

### Re-derivation (2026-10-18)

Re-derived against `develop` at `e7d021e`, after WP4 merged and #563, #564 and #568 landed. The result stays **Approved**; the former open point is resolved.

- **Worktree open point resolved (user decision, option A).** The plan run writes the plan untracked into the invocation checkout's `plan.dir`, as the interactive publication does; the core publishes it through a plumbing commit and the tool removes the file after a `blobOid` match. The shipped lifecycle could not express a discard (detached `HEAD` and an untracked file fail the removal eligibility, claim and remove need user confirmation, and a killed pass leaves an `active` record only its owning run may change), and extending it was rejected as out of scope. Consequences: Phase 1 becomes leftover-file reporting (hash-matched deletion was dropped again, see the review below); `--publish` requires a clean tracked tree and `HEAD` equal to the fetched `origin/<baseBranch>`; no receipt, lifecycle record, self-check or `worktree-integration` pointer remains; done criterion (d) reads "no leftover plan file".
- **Nested spawns (user decision).** The plan run probes like `merge-gate`; when nested spawns are unavailable the issue is never planned inline. _(Refined 2026-10-18: this is a pass-level environment stop, not a per-issue `failed`; see the review below.)_ By the same reasoning a host without any sub-agent mechanism stops the pass, since the orchestrator holds the publishing authority and must not read issue text.
- **Spawn tiers (#563).** Readiness `standard` (no downward move), plan run `deep` (no downward move), probe `mechanical`; markers, `model-tiers.md` rows and the contract-test updates are in scope. The plan run is a built-in general-purpose subagent in the foreground.
- **Publication contract (WP4, merged).** Exact twelve-key `publish` input, `complete-branch` input, title `docs: plan <title>`, a required `commitMessage`, body rules, draft pull request with marker, and an outcome-to-verdict table. Environment errors stop the pass instead of consuming per-issue retries. A plan with open points or `Revision required` is still published and the body says so.
- **Configuration and runtime state.** Configuration is read through `config-resolve` (`config-migration` eager include); the runtime-directory migration runs before `pass-lock-acquire` because WP3's runtime-state guard skips the marker.
- **Evals.** The new router entry makes all three suites (merge-gate, iterate, next-steps) stale; a re-recorded round of each is owed before release.
- **Cross-plan.** WP2 must be re-derived before this plan relies on its envelope (Assumptions). Order is WP1 → WP2 → WP3 → WP5.

### Plan review (2026-10-18)

An independent review of the re-derived plan found one critical and eleven further findings. All are incorporated; the result stays **Approved**.

- **Error cases, Critical (user decision A):** a plan file that was never pushed could not be proven to be the pass's own, so Phase 1's hash-matched deletion left it either undeletable or at risk of deleting a person's file. The pass now reports it (`leftoverPlanFiles`, path and blob id), never deletes it, and skips its issue; the operator removes it, and a WP6a fresh clone never has one. Done criterion 4 and acceptance (d) are narrowed accordingly.
- **Error cases, Important (historical, superseded 2026-10-19):** the previous revision allowed snapshot-derived cleanup after an issue failure. The current contract preserves that file; cleanup is permitted only after successful publication with proven ownership, unchanged blob and replacement protection. A snapshot alone does not prove ownership.
- **Architecture, Important (incorporated):** `issue-buddy` is added to `SUCCESSOR_SETS` in `config-resolve-core.mjs` with a `config-resolve` test; the file is hashed by the merge-gate and iterate instruments, which go stale anyway.
- **Error cases, Important (incorporated):** the outcome table evaluates `details.state` first, adds the missing codes and a default row, treats `PUSH_REJECTED` without a remote branch as an environment stop, and has a separate `complete-branch` mapping (`BRANCH_MISSING`, `BRANCH_INVALID` and `PR_EXISTS` record nothing; environment codes are never `failed`).
- **Security, Important (user decision):** pull-request text is a fixed template. Title `docs: plan issue #<N>` (descriptive words per `language.git`); body is one sentence naming the issue, the review result and the open-point count. No text from the plan or the issue is copied, which removes the closing-keyword, marker and size failure modes from the table and keeps issue-derived text out of the orchestrator.
- **Error cases, Important (incorporated):** the Phase 0 order is configuration, hidden, tracker mode, GitHub origin (local `remote get-url`), runtime-state guard, migration, lock, visibility, publish rows, sub-agent capability, and the contract test pins it.
- **Architecture, Important (adopted choice):** `pass-collect` returns `baseOid` and the tool checks `HEAD == baseOid` right after collect, before recovery and judgment. The tool runs no raw fetch; plan-branch reads use the bounded helpers exported by WP3 and WP4.
- **Scope, Important (user decision):** the follow-up row after a published plan pull request is `build <plan-file>`, with docs on restoring the plan file from the pull-request branch; the `--publish` row names "public repository" (D2).
- **Scope, Important (incorporated):** recovery completions are capped by the remaining `--max-plans`, and Phase 4 plans only up to what remains.
- **Architecture, Note (incorporated):** stopping instead of the inline fallback is stated as deliberate, with the `merge-gate-delegated-run` precedent; a spawn declined mid-pass is an environment stop.
- **Maintainability, Important (incorporated):** cross-plan alignment with the WP3 revision: `repositoryIdentity` derived once and passed on every runtime call, `passId` and the `pass-collect` input set, one exported environment-code set (including `NESTED_SPAWN_UNAVAILABLE`, now pass-level with `issue: null`), the report schema (`failures.stage`, `repositoryVisibility`, `leftoverPlanFiles`, report-only `ready`), `fingerprint` on recovery entries, and `branchTip` and `code` on a `complete-branch` refusal.
- **Testability, Note (incorporated):** a malformed readiness answer is recorded `failed`, not `not-ready`; done criterion 1 now names Git's own writes from the bounded fetches; `plan-lint.mjs` joins the orchestrator-only list.
- **Cross-plan alignment with WP3's final contracts (2026-10-18):** plan-branch reads go through WP3's `branch-read` (no own read, no raw fetch); `ENVIRONMENT_ERROR_CODES` is imported as the single environment set (WP5's own list removed, default row kept); the key sets, `passId` format, `collect/<passId>.json` (so `pass-report` no longer receives the collect result), `baseOid`, `repositoryIdentity`, `cwd`, report field names and the `orphan` / `closedWithoutMerge` record parts follow WP3's tables; `ready` goes to `pass-report` only, and `leftoverPlanFiles` uses `{issue, path, action}`.

### Revision 2026-10-19

The merged WP3 implementation is now the source baseline. Retain the recorded no-worktree, D1–D4, fixed-template, malformed-readiness and operator-cleanup decisions. Earlier claims about `branch-read`, an exported environment-code set, collect files, repositoryIdentity inputs, report-only `ready` and fixed pass-id encoding are superseded. Their correction is not a new dependency on unimplemented APIs.

Independent delivery-quality and engineering API/data review found no Critical findings. The following Important findings have been incorporated:

| Area            | Finding and disposition                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture    | Closed report v1 cannot represent a partial environment stop or new metadata. Plan explicit opt-in v2 with unchanged v1 behavior and reconciled outcomes.                                    |
| Architecture    | Recovery metadata must precede body construction. Plan WP4 inspection, shared plan-lint metadata and expected-tip binding.                                                                   |
| Architecture    | A later WP4 base fetch can differ from collection. Bind all WP5 publication paths with expectedBaseOid and stop without spending issue retry.                                                |
| Error cases     | Exclusions after slicing lose capacity and unbound diagnostics permit inconsistent replay. Persist narrow leftover metadata in collection and filter before judgment/recovery authorization. |
| Error cases     | Dry-run ready results also consume max-plans; stop at the shared budget without an extra verdict.                                                                                            |
| Error cases     | A pre-push kill leaves an operator-owned leftover. Prove preservation/skip first; require explicit operator removal before a fresh attempt. Post-push recovery must avoid duplicate PRs.     |
| Security        | A snapshot/hash does not establish file ownership or prevent replacement before unlink. Capture all existing path types, require ownership/removal protection, and preserve ambiguity.       |
| Maintainability | Historical issue-failure cleanup contradicted the current rule; explicitly superseded above.                                                                                                 |
| Testability     | Include next-steps alongside merge-gate/iterate in before/after eval verification.                                                                                                           |

The final internal review's Important error-case finding is also incorporated: post-push survivors trigger the same leftover exclusion as pre-push files. Lock release alone does not authorize recovery; verify the skip and require operator removal before reconciliation.

The final API cross-check's Important error-case finding is incorporated in the ordered outcome mapping: confirmed success, mutation-state precedence, races, narrow content-error allowlist and default environment/integrity stop. Shared error codes are classified by proven operation/phase/details; persistence errors never create substitute verdicts.

The Note on argument ambiguity is incorporated as a strict once-only decimal grammar. Helper changes stay in WP3/WP4/plan-lint ownership; no new runtime family or second cache is planned. The remaining Important testability decision is the live-smoke target and action authority, requested from the operator. No source, test, ADR or configuration has been changed by this planning run.

#### Findings before the interactive review

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Validation scorecard before the interactive review

| Criterion               | Result                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Clarity                 | Concrete owning files, closed helper amendments, ordered pass/error rules and named acceptance evidence; no technical decision left open |
| Verification            | Deterministic and live evidence defined; live target/cleanup authority remains the one blocking clarification                            |
| Context                 | Actual merged WP2/WP3/WP4 interfaces verified against the recorded source OID; proposed extensions explicitly separated                  |
| Big picture             | Stage-1 boundaries and WP6a/WP6b/WP7 dependencies explicit                                                                               |
| No-code boundary        | Only this existing plan revised; unrelated plans, the primary-checkout draft, index and source files preserved                           |
| Code frugality          | Only compact contract shapes; no implementation                                                                                          |
| Workflow recommendation | Feature/build retained for the new exposed tool and bounded helper extensions                                                            |
| Documentation target    | Not applicable to a Feature plan                                                                                                         |

### Deep interactive review 2026-10-19

**Review outcome:** Approved. No critical findings or implementation-blocking open points remain. The existing Feature/build recommendation, title, path and open implementation status are unchanged.

- **Architecture, Important (incorporated):** local review metadata was not bound to the bytes later reread by `publish`. The deterministic metadata projection now includes the same-bytes Git blob OID, and WP5 supplies `expectedBlobOid` to WP4. Compare the actual publication commit's plan blob before push; a change stops the pass without an issue retry. A mutation-between-classification-and-publication regression is required. This is the local counterpart of recovery's expected-tip binding.
- **Testability, Important (resolved by operator):** the operator named `sebastian-software/sf-test-repo` and explicitly permitted creating smoke issues, plan branches and draft PRs, then closing only smoke-created issues/PRs and deleting only smoke test branches. The validation section records the bounded authority, verified public/non-empty fixture and its `main` base. Actual smoke execution remains implementation acceptance, not a planning action.

| Area            | Critical | Important open | Note open |
| --------------- | -------: | -------------: | --------: |
| Architecture    |        0 |              0 |         0 |
| Security        |        0 |              0 |         0 |
| Data protection |        0 |              0 |         0 |
| Error cases     |        0 |              0 |         0 |
| Testability     |        0 |              0 |         0 |
| Scope           |        0 |              0 |         0 |
| Maintainability |        0 |              0 |         0 |

The final scorecard meets clarity, verification, verified-context, big-picture, no-code, code-frugality and workflow criteria; documentation-only target fields are inapplicable. Verification now names the live target and its authority, while leaving the evidence to the implementation run. Plan formatting and mechanical lint are rerun after this review. No source, tests, configuration, ADR, commits or live forge artifacts were changed. Unrelated WP1/WP3 revisions and the separate primary-checkout WP5 draft are preserved.

## Open points

- No open points.

## Implementation record

**Date:** 2026-10-19

The exposed `issue-buddy` tool performs one bounded, unattended primary-checkout pass. Dry run is the default; public-repository publication requires `--publish` and opens draft plan PRs only. It delegates readiness and planning/review, keeps raw issue/plan prose outside the publishing parent, and uses the existing runtime/publication helpers for deterministic state and forge operations.

The implementation adds explicit v2 reports while retaining closed v1 defaults, visibility and leftover metadata bound into collection replay, partial-stop reconciliation without issue retry consumption, and a GitHub visibility read. Local publication metadata validates and hashes the same bounded bytes and exposes only four fields. Publication/recovery bind the collected base, inspected tip and actual committed plan blob before mutation. Legacy callers retain their existing behavior.

The tool, catalog, configuration successor set, session partition, model-tier sites and next-step rows are registered. All three targets build; the measured Issue Buddy context is 477/477 lines. The Active `docs/adr/plan-only-unattended-publication.md`, user/developer guides, README source/generated output and CLI comments document stage-1 limits, explicit release and operator-owned leftover cleanup. No project configuration or production CLI pin changed.

### Deterministic verification

The complete CI order passed in the implementation checkout: `pnpm agent:check`, `pnpm test` (2,885 passed, zero failed, one known EILSEQ skip), `node build.mjs`, and `pnpm test:distribution`. Locked README generation and `mise run readme:check` passed. A bounded validator correction added the new tool to setup-status fixtures and expected lists without weakening assertions; all 34 affected tests passed before the complete rerun.

The helper-composition suite passes 28 scenarios using real temporary Git repositories, actual runtime/publication logic, injected forge/model boundaries and 11 real SIGKILL boundaries. It covers unchanged second passes, orphan/unrecorded-PR recovery, privacy gates, partial stops, limits, expected base/tip/blob refusal, preserved leftovers and journal reconciliation. Focused metadata, runtime, tracker, publication and orchestration-contract regressions also pass.

The first validator invocation ran in the wrong checkout; those logs are retained separately and excluded from WP5 evidence. The accepted CI logs are `validator-corrected-*.log` under the named local evidence directory `/private/tmp/wp5-20261019-evidence/`.

### Behavioral-eval drift

Read-only verification exits zero for all suites. Their pre-existing stale scope remains 8 scenarios/40 runs (`merge-gate`), 7/35 (`iterate`) and 11/55 (`next-steps`). Compared with the recorded pre-change inventory, `merge-gate` and `iterate` additionally list `scripts/config-resolve-core.mjs` and `shared/session-title.md`; no drift path disappeared. Existing router/tier hashes changed, and next-steps retains its existing router/next-steps drift paths with updated hashes. The exact comparison is retained as `eval-drift-comparison.json`. Model evidence must be rerecorded before release; no evidence or guard was weakened here.

### Live verification

The authorized public fixture is `sebastian-software/sf-test-repo`; its `main` remains at `d84399025307c00afaa53497284ec5db0d25f7d5`. Local fixture bootstrap files are preserved. Local CLI 0.163.0 is used only for compatibility smoke; the production pin remains 0.153.4.

The corrected frozen portable snapshot contains 147 files, with manifest SHA-256 `4091dcf5f85fe293ebedef6715948f0ecdcdd4912e97d63716180b463609bb59`. The existing one-step `standard` to `deep` exception is applied only to the nested `plan` to `plan-review` workflow orchestrator: it must start its mandatory independent judgment child, while the standard child model lacks V2 collaboration tools in this CLI. The reason is included in its handoff and run summary. All reviews remain delegated; no spawn-depth setting or inline fallback is used.

A first publishing attempt failed closed before push/PR because that nested orchestrator could not delegate. Its v2 report retained a pass-level environment failure without an issue retry. A fresh pass proved preservation and exclusion of the local plan before explicit operator removal. The corrected publishing run opened [draft PR #3](https://github.com/sebastian-software/sf-test-repo/pull/3), containing exactly one new plan file on `wp5-smoke-20261019/plan/issue-2`. The unchanged next pass recorded no new verdicts or PRs and identical remote refs. A current-snapshot dry run for the distinct recovery issue #4 recorded `would-publish` without a plan, branch or PR.

The separate live kill test reached the real PR-create transport after pushing `wp5-smoke-20261019/plan/issue-4` at `641949f65c46250d35faac19e40f1dced01ad49c`. The barrier sent no POST; the driver verified the own process tree, delivered SIGKILL and observed exit -9. The real lock-acquire probe returned `LOCKED` without changing the holder. The operator then explicitly released that pass through the existing helper. A fresh actual-tool pass retained the identical local plan and remote tip, authorized no recovery and opened no PR. Only after explicit operator removal did the next actual-tool pass recover the existing branch into [draft PR #5](https://github.com/sebastian-software/sf-test-repo/pull/5), with the same tip and exactly one PR for that head. It performed no new judgment or planning run, left no local plans, completed its v2 report and released the lock.

The accepted evidence under the named directory is:

| Scenario                                 | Evidence                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Corrected-snapshot dry run               | `live-dry-current/pass-report.json`, remote refs                                                         |
| Real draft publication                   | `live-publish-3/pass-report.json`, `remote-pr.json`, remote refs                                         |
| Unchanged second pass                    | `live-unchanged/pass-report.json`, identical remote refs                                                 |
| Post-push, pre-create SIGKILL            | `live-kill/result.json`, verified barrier/PID tree, held-lock probe, remote refs                         |
| Preserved leftover and excluded recovery | `live-kill-leftover-skip/pass-report.json`, unchanged file digest/inode and refs                         |
| Explicit operator removal, then recovery | `operator-removal-killed-issue-4.json`, `live-recovery-current/pass-report.json`, unique PR/tip evidence |
| Bounded cleanup                          | `smoke-artifacts.json`, `cleanup-remote-refs.txt`                                                        |

Only smoke-created issues #1/#2/#4 and PRs #3/#5 were closed; only the two recorded smoke branches were deleted. No PR was merged. Remote `main` remains at the original OID. The temporary fixture has no local plan files or held pass lock. Separate harness starts stopped before collection are excluded from accepted evidence; the successful corrected-snapshot runs above are authoritative.

## Review findings

**Date:** 2026-10-19
**Reviewer:** Node.js specialist review and affected recheck

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     0 |

The Important/Medium metadata isolation finding and Note/Low visibility-probe test finding were corrected. The independent affected recheck found both fixed, zero open and zero new findings across all severities. No residual review report is needed.

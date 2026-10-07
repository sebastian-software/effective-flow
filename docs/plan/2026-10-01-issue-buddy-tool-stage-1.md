# Issue Buddy tool: one dry-run or publishing pass per checkout (stage 1)

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Work package 5 of the concept `docs/concept/2026-09-29-issue-buddy.md`: build the exposed `issue-buddy` tool. One invocation performs one **pass** over one repository checkout. A pass is a dry run by default. Only with an explicit `--publish` flag may it push a branch and open a plan pull request. The tool composes three deterministic or contractual building blocks and adds no second copy of any of them:

- the Issue Buddy runtime script (WP3, `docs/plan/2026-10-01-issue-buddy-runtime-script.md`): pass lock, candidates, trust filter, skip rules, fingerprints, verdict cache, limits, the `orphan-branch` and unrecorded-pull-request classification, pass report;
- the unattended planning and readiness contract (WP2, `docs/plan/2026-10-01-unattended-planning-and-readiness-contract.md`): the non-interactive run state of `plan` and `plan-review`, the planning-readiness check, the `**Issue:**` header and the unattended file name `YYYY-MM-DD-issue-<N>-<slug>.md`;
- the shared plan publication core (WP4, `docs/plan/2026-10-01-shared-plan-publication-core.md`): single-file assertion, scan, create-only push of `<branchPrefix>/plan/issue-<N>`, pull-request lookup and creation with `Refs`. WP4 must be re-derived first (see its Open points); the plan-branch name may change.

The Codex exec spike (WP1, `docs/plan/2026-10-01-codex-exec-unattended-spike.md`) supplies the evidence that delegation and no-question behaviour hold under `codex exec`. The scheduled jobs in `llm-automatisator` (WP6a `2026-10-01-issue-buddy-dry-run-auftrag.md`, WP6b `2026-10-01-issue-buddy-schreib-token-und-veroeffentlichung.md`) and operations (WP7 `2026-10-01-issue-buddy-betrieb-und-kalibrierung.md`) depend on this plan.

Order across the roadmap: WP1 → WP2 and WP4 (in parallel) → WP3 → this package (WP5) → WP6a → WP6b. WP7's dry-run calibration follows WP6a, and its enabling of publication follows WP6b.

Done when, on a test repository:

1. a dry run changes nothing on the forge and no tracked file, and writes only below `.effective-flow/issue-buddy/`;
2. a publishing pass opens exactly one plan pull request;
3. a second publishing pass writes nothing on the forge;
4. a pass killed mid-run is recovered by the next pass, still with exactly one pull request. Because WP3's pass lock is never broken automatically, a manually run pass first needs the operator's release of the stale lock; a scheduled pass in WP6a starts from a fresh clone without a lock.

Deviations from the concept that are binding user decisions:

- **Dry run (D1).** The concept says a dry run "writes nothing". A dry run now writes the local runtime cache only: verdicts and the pass report under `.effective-flow/issue-buddy/`, every record marked `mode: dry-run`. A dry-run `ready` verdict is recorded as `would-publish`, and a later publishing pass judges that issue again. A dry run neither plans nor creates a worktree.
- **GitHub only (D3).** Forgejo is deferred. A non-GitHub `origin` stops the pass. Trust means the GitHub collaborator permission `write` or `admin`.
- **Private repositories (D2).** On the GitHub Free organisation, rulesets work only on public repositories, so a private repository has no forge-side boundary. WP4's single-file assertion and scan cover only the core's own path and hold only while the forge credential is unavailable to model steps (WP4, Assumptions). In stage 1 the operator's credential is within reach of the agent, which runs without a Codex sandbox, and isolating it is WP6b's job. Stage 1 therefore runs a private repository as a dry run only: `--publish` on a private repository stops in Phase 0. Lifting that stop is a follow-up that depends on WP6b's credential isolation; after it, WP6b's configuration field `issueBuddy.privateRepositoryAcknowledgement` and WP7's approval table, which records the acknowledgment with date and person, gate enabling. The ADR records this posture.
- **Public repositories in stage 1 (D4).** A stage-1 publishing pass is started by the operator and runs on the operator's own forge credential, which the unsandboxed model steps can reach. No dedicated bot identity or verified branch rule exists before WP7, so on a public repository too, the single-file assertion and the scan only advise. Stage 1 accepts this risk for passes the operator runs. Scheduled publication waits until WP6b isolates the credential and WP7 verifies the bot identity's branch rules. The ADR records this accepted risk.

The classification is Feature: a new user-invocable tool with new behaviour, its tests and documentation. Planned against `develop` at `e846936` on 2026-10-01; the working tree carried only untracked concept and plan files, none of them in scope.

## Architecture decisions

- **Placement.** `issue-buddy` is an exposed tool in the `TOOL_GROUPS` group "Understand what to do" (`build.mjs:178`), directly after `plan-issue`, because its output is a plan. It needs a strictly quoted `catalogHint` (guard at `build.mjs:1166`) and a `CONTEXT_BUDGET_LINES` entry (`build.mjs:1837`). It is a new name, not a rename, so `DEPRECATED_TOOL_ALIASES` stays unchanged.
- **Orchestrator only.** The tool owns phase order, stops, delegation and the final report. Every deterministic step is a call into the WP3 script or the WP4 core. Model judgment covers exactly three things: the readiness verdict, the plan and the deep plan review. The tool calls no `gh` command directly.
- **No reachable `ask`.** The tool source carries no ` ```ask ` fence, and every place where a neighbouring tool would ask becomes a stop or a defined outcome (preflight table below). Under `codex exec` a stray question ends the pass silently (concept, verified context). This applies to the tool itself; WP2's contract test covers the planning and review path.
- **Readiness as a read-only analysis sub-agent per candidate.** Each judgment runs in a fresh sub-agent with the path to WP3's trusted-text file `.effective-flow/issue-buddy/trusted/issue-<N>.json` and the WP2 readiness fragment `src/shared/planning-readiness.md`. It must answer with exactly WP2's three verdict lines: `Verdict: ready|not-ready`, `Failed: <R-ids or none>`, and `Reason: <one line>`. Any other answer counts as `not-ready` with the reason `malformed verdict`, so the check fails closed. Issue text reaches the sub-agent only by path and is data, never instructions.
- **Planning as a sub-agent per issue with a fixed envelope.** The pass starts one foreground sub-agent per ready issue that runs `plan` with the WP2 control-line envelope, which `plan` parses before the plan-input gateway. The argument passed to `plan` is exactly WP2's envelope: the five control lines `Run state: non-interactive`, `Next steps: suppressed`, `Language context: …` (the values this pass resolved once), `Issue: #<N>` and `Issue text: <absolute path of the trusted-text file>`, followed by the delimiter `--- end of control lines ---` and nothing below it. The sub-agent's brief, outside that argument, carries the delegation-mandate handoff: the execution root (the worktree), the runtime-state root, and the write authority "exactly one new file under `<plan.dir>/` in the execution root". The deep review runs inside that delegation per WP2: a plan with blocking points is completed with `Revision required`, and each plan-review decision takes "Decide later". The pass awaits each sub-agent and never ends its turn with one pending (`src/shared/delegation-mandate.md`, line 9). The returned text is never trusted: the pass checks the artifact itself.
- **Dedicated worktree per planned issue.** The plan is written in a worktree created detached at the freshly fetched `origin/<baseBranch>` commit below `.effective-flow/.worktrees/`, with the issue number in its name, under the existing execution-location receipt (`src/shared/execution-location.md`) and lifecycle record (`src/shared/worktree-lifecycle.md`, `src/shared/worktree-record-obligation.md`). The worktree's completion is fixed by this tool: publish through the WP4 core, then discard. The tool reads only the "Worktree execution" and "Lifecycle outcome handling" sections of `src/shared/worktree-integration.md` and never its completion phase, whose `delivery.completion` question (`src/shared/worktree-integration.md:426`) must stay unreachable. Branch creation belongs to the WP4 core.
- **Hidden mode stops.** Same pattern as `src/tools/plan-issue.md:94`: with `visibility: hidden`, stop before any tracker access or write and name the reason. Hidden mode forbids naming Effective Flow in pull requests and keeps plans untracked, so a plan pull request is impossible.
- **Tracker target without a question.** `tracker.mode` must resolve to `remote` from configuration. An unset mode stops the pass instead of reaching the tracker-mode question in `src/shared/issue-tracker.md:62`; `local` and `external` stop as well.
- **Flags only, no new configuration.** Limits arrive as flags; no configuration key is added, so `setup` and the configuration contract stay untouched.
- **Next steps.** Two rows in the edge table of `src/shared/next-steps.md`, mirrored in `docs/user-guide/tool-flow.md` (guard at `build.mjs:993-1010`). Stage 1 is run by a person, who benefits from the continuation.
- **Session title.** `issue-buddy` joins the silent list of `src/shared/session-title.md`: a pass spans several issues and has no single work subject. The partition test (`test/session-contracts.test.mjs:416`) forces this choice.
- **Chat language and delegation.** Eager `chat-language` include (enforced by `test/workflow-contracts.test.mjs:2171`) and eager `delegation-mandate` include (build-system procedure step 6). No `## Recommended skills` section: the tool only orchestrates, and the planning skills are applied inside `plan`. The skill-ownership manifest therefore needs no entry.
- **ADR.** This package writes the living ADR `docs/adr/plan-only-unattended-publication.md` for the concept's ADR candidate "Plan-only unattended publication". It records that a flag-gated unattended pass may publish without confirmation, limited to one pull request containing exactly one plan file. It also records the D2 posture, that private repositories stay dry-run-only in stage 1 until the forge credential is isolated from model steps, and the D4 accepted risk for operator-run publication on public repositories. The run-state ADR (`docs/adr/unattended-run-state.md`) belongs to WP2, the "Input trust boundary" ADR (`docs/adr/input-trust-boundary.md`) to WP3, and the forge-token ADR ("Forge-Token im Agentenlauf", llm-automatisator) to WP6b.

## Affected files

| File                                           | Description                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/issue-buddy.md`                     | New exposed tool: frontmatter `description` and `catalogHint`, argument grammar, phases 0–6, preflight stop table, envelope, report, lazy `next-steps` fence, eager `chat-language` and `delegation-mandate` includes                                                                       |
| `build.mjs`                                    | Add `issue-buddy` to `TOOL_GROUPS` "Understand what to do" after `plan-issue`; add its `CONTEXT_BUDGET_LINES` entry                                                                                                                                                                         |
| `src/scripts/remote-tracker-core.mjs`          | Register the additive read-only operation `repository-visibility-read` (output `visibility`) with a `repositoryVisibilityRead` probe capability; Forgejo gets only the `false` capability (D3)                                                                                              |
| `src/scripts/remote-tracker-github-core.mjs`   | GET-only command plan for `repository-visibility-read` on `repos/{owner}/{repo}`, returning its `visibility` field                                                                                                                                                                          |
| `test/remote-tracker.test.mjs`                 | Tests for `repository-visibility-read` on GitHub and `UNSUPPORTED_CAPABILITY` on Forgejo                                                                                                                                                                                                    |
| `src/shared/next-steps.md`                     | Two edge-table rows for `issue-buddy`                                                                                                                                                                                                                                                       |
| `docs/user-guide/tool-flow.md`                 | Mirror of the two rows in rendered invocation form                                                                                                                                                                                                                                          |
| `src/shared/session-title.md`                  | Add `issue-buddy` to the silent list                                                                                                                                                                                                                                                        |
| `test/issue-buddy-contract.test.mjs`           | New contract test: no `ask` fence in the tool or its eager includes; no pointer to the completion phase of `worktree-integration` or to the tracker-mode question; preflight stops present; envelope lines in their literal forms; flag grammar; phase order matches the integration driver |
| `test/issue-buddy-pass.test.mjs`               | New integration test of the four done criteria against a local bare repository and a fake forge runner, with stubbed model steps                                                                                                                                                            |
| `test/fixtures/issue-buddy/`                   | Fixture issues, collaborator permissions, a public and a private repository visibility, and the stub planner's plan file                                                                                                                                                                    |
| `docs/adr/plan-only-unattended-publication.md` | New living ADR (see Architecture decisions)                                                                                                                                                                                                                                                 |
| `docs/user-guide/tools-understand.md`          | New section `/effective-flow issue-buddy` after `plan-issue`: purpose, flags, dry run versus publishing, what a pass never does, report, recovery, prerequisites, the D2 private-repository restriction                                                                                     |
| `docs/user-guide/README.md`                    | Add the tool to the reading-order line of the "Understand" tools                                                                                                                                                                                                                            |
| `docs/user-guide/remote-tracker.md`            | "Interplay with issue-driven tools" and "Hidden mode": Issue Buddy's forge reads, the `Refs` trace as the only visible trace on an issue, the hidden-mode stop                                                                                                                              |
| `docs/developer-guide/architecture.md`         | Short section on the unattended pass: orchestrator over WP3 script and WP4 core, envelope, worktree, the advisory in-run checks versus the forge-side boundary that WP7 verifies                                                                                                            |
| `README.md.src`, `README.md`                   | One mention of the unattended plan pass in "Why Effective Flow"; `README.md` regenerated with `mise run readme:write`                                                                                                                                                                       |

## Implementation details

### Approach

1. **Check prerequisites.** Confirm on `develop` that WP2, WP3 and WP4 have landed. Their artifacts are `src/shared/unattended-planning.md`, `src/shared/planning-readiness.md`, the WP3 script registered in `RUNTIME_SCRIPT_FILES` (`build.mjs:87`) with its dry-run mode flag, and the WP4 core. Re-read their final interfaces (subcommand names, envelope grammar, result shapes) and use those names in the tool. Stop if one is missing or differs from what this plan relies on.
2. **Add `repository-visibility-read`** to the tracker helper, modelled on WP3's additive `collaborator-permission-read`, with its tests.
3. **Write `src/tools/issue-buddy.md`** with the phases under "Component structure".
4. **Register the tool** in `TOOL_GROUPS`. Add a provisional budget entry.
5. **Add the next-steps rows** and their mirror, and add the session-title entry.
6. **Write both tests** and the fixtures.
7. **Write the ADR and the documentation**, then regenerate `README.md`.
8. **Run `node build.mjs`**. Set the budget entry to the line count reported under "Always-loaded core (lines/budget)" plus at most ten lines of headroom.
9. **Run the full check sequence**, then the manual live smoke run (validation plan).
10. **Run `pnpm eval merge-gate verify`** and record the expected drift (router, `next-steps`, `session-title`) as an owed re-recorded round in the pull-request description.

### Component structure

**Arguments.** The grammar is `issue-buddy [--publish] [--max-judgments <n>] [--max-plans <n>]`, where `<n>` is a positive integer. `--max-judgments` defaults to WP3's default of 3; `--max-plans` defaults to 1. They reach WP3 as `limits.judgments` and `limits.plans`. Any other argument stops the pass with the usage line and writes nothing.

**Phase 0: Preflight.** The rows are evaluated in this order, and every row stops the pass before the first issue or pull-request read. The one forge call in Phase 0 is the `repository-visibility-read` of the private-repository row. It runs in both modes, only after the hidden-mode, tracker-mode and GitHub rows have passed, and reads repository metadata only; any visibility other than `public`, or a failed read, counts as private. A dry run never stops on it and carries the result to the report. No cache record is written. A stop before the pass lock is taken writes nothing at all. A stop after it writes one pass report with `outcome: failed` and a single `preflight` failure through WP3's `pass-report`, then releases the lock:

| Condition                                                                | Outcome                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| No project-setup ADR found, or the locator reports several matches       | Stop; name the state and point to `setup`                                                                             |
| Runtime-state safety guard blocks (`src/shared/runtime-state-safety.md`) | Stop with the guard's diagnostics                                                                                     |
| WP3 `pass-lock-acquire` returns `LOCKED`                                 | Stop; another pass is running in this checkout, or a stale lock (pass id and age shown) awaits the operator's release |
| `visibility: hidden`                                                     | Stop; hidden mode cannot produce a plan pull request                                                                  |
| `tracker.mode` unset, `local` or `external`                              | Stop; Issue Buddy needs `tracker.mode: remote`                                                                        |
| `origin` is not GitHub                                                   | Stop; version 1 supports GitHub only, Forgejo is deferred                                                             |
| `--publish` and the repository is private                                | Stop; private repositories are dry-run-only until WP6b isolates the forge credential from model steps (D2)            |
| No sub-agent mechanism                                                   | Continue with the disclosed inline fallback of the delegation mandate, named in the report                            |

Then resolve `plan.dir`, `delivery.baseBranch` (`src/shared/base-branch-resolution.md`), `delivery.branchPrefix` and the language keys once. The main checkout's tracked files are never written, so their state is not a precondition. No `sf-` label migration runs; WP3 switches it off.

**Phase 1: Recovery of stale worktrees.** This classification belongs to this tool, because the worktrees are its own. A stale Issue Buddy worktree has a lifecycle record and no pushed plan branch. With `--publish`, discard it through "Lifecycle outcome handling" and record one failed attempt through WP3's `verdict-record` (`failed`, retry-once), using the fingerprint that WP3's `fingerprint` operation computes from the killed pass's trusted-text file for the issue in the worktree's name. If that file is gone, record nothing; the issue is judged again. A worktree whose plan branch is already pushed is not stale here; Phase 2 recovery handles its branch or pull request and then discards it. A dry run reports only.

**Phase 2: Collect.** WP3's `pass-collect` lists candidates, removes untrusted authors and comments, applies the skip rules and fingerprints, orders and caps the judgment queue at `--max-judgments`, and writes the trusted-text file per candidate. Its `recovery` section is handled next, with `--publish` only; a dry run reports it:

- each `orphanBranches` entry (pushed plan branch without a pull request) goes to WP4's `complete-branch` with `--apply`, which runs `assert-changeset` and the scan on that branch and opens the pull request if both pass. An opened pull request counts against the plan limit and is reported in `pullRequestsOpened`; a refusal is reported and recorded as `failed`. Once `complete-branch` has returned successfully, the pass discards the stale Issue Buddy worktree carrying that issue number, if one exists, through "Lifecycle outcome handling", which closes its lifecycle record. After a refusal the worktree is kept with its branch for the next pass's attempt, within WP3's retry-once rule;
- each `unrecordedPullRequests` entry (an open plan pull request whose cache record is not `published`) is recorded as `published` with its number through `verdict-record` and reported in `pullRequestsRecovered`. Once `verdict-record` has succeeded, the pass discards the stale Issue Buddy worktree carrying that issue number, if one exists, through "Lifecycle outcome handling", which closes its lifecycle record; if recording fails, the worktree is kept for the next pass.

**Phase 3: Readiness.** One read-only analysis sub-agent per queued candidate (Architecture decisions). WP3 records the verdict: in a dry run with `mode: dry-run`, where `ready` becomes `would-publish`.

**Phase 4: Plan and review** (with `--publish` only, up to the remaining plan limit, in queue order):

1. Create the worktree with its receipt and lifecycle record.
2. Run the planning sub-agent with the envelope.
3. Verify the artifact before any commit. The worktree's `git status --porcelain=v1 -z --untracked-files=all` must list exactly one untracked file, under `<plan.dir>/`. Its name matches WP2's `YYYY-MM-DD-issue-<N>-<slug>.md`, it carries `**Issue:** #<N>`, and it has a plan-review result. A failure is recorded as `failed`, and nothing is pushed. The WP4 core later builds the commit from that file alone and applies its single-file assertion (`assert-changeset`) to the commit.

**Phase 5: Publish** (with `--publish` only). WP4's `publish` (unattended, `create-only`, with `--apply`) scans the file, the pull-request title and the body; unattended, every scan class blocks. It then builds the commit, pushes the branch create-only, looks up an existing pull request and opens one. The title is in `language.git`. The body is in `language.forge`: plan summary, review result, and open decisions with their options. It carries no issue reference and no closing keyword; the core appends `Refs #<N>` as its final line. WP3 records `published` with the pull-request number, or `failed`. On every exit path the worktree is discarded through "Lifecycle outcome handling", and the worktree-record exit self-check runs.

**Phase 6: Report.** WP3's `pass-report` writes `.effective-flow/issue-buddy/last-pass.json` and its history copy, with `outcome: completed` unless the pass itself stopped. The tool prints these items:

- mode;
- recovery actions;
- counts per skip reason;
- verdicts with their reasons;
- pull requests opened (URLs);
- failures;
- the repository visibility from Phase 0; a private repository marks the D2 posture (dry run only);
- the stored report path;
- a final line `Pass result: completed` or `Pass result: failed`, which mirrors the report's `outcome` for a human reader; WP6a reads the stored report file, not this line;
- the next-steps block.

A failure on one issue never aborts the pass; only Phase 0 or a failed `pass-collect` stops it, and once the lock is held both produce `outcome: failed`. The lock is released through `pass-lock-release` on every exit path except a kill.

### State management

All state stays where its owners put it. WP3 owns `.effective-flow/issue-buddy/` (`verdicts.json`, `trusted/`, `last-pass.json`, `reports/`, `pass.lock`), with the paths and schema defined once in its "Contracts for WP5 and WP6a" section. Worktrees live below `.effective-flow/.worktrees/`, and their lifecycle records below `.effective-flow/worktree-runs/`. The tool adds no file of its own. The cache is a cache: if it is lost, the forge-side checks of WP3 and WP4 still prevent a duplicate pull request.

### API integration

GitHub only, through the WP3 additive reads of `src/scripts/remote-tracker*.mjs`, this package's `repository-visibility-read`, and the WP4 core. The tool never calls `gh` directly and never writes to an issue.

### Styling approach

Not relevant: no user interface.

### Accessibility

Not relevant: no user interface.

### Edge cases

- **Plan pull request already open for the issue:** skipped by WP3; no judgment.
- **`--max-judgments` reached before `--max-plans`, or the reverse:** the rest is left for the next pass and counted in the report.
- **Planning sub-agent returns `ABORT`, malformed text, or writes more than one file or a file outside `<plan.dir>/`:** the assertion fails, `failed` is recorded, the worktree is discarded, and nothing is pushed.
- **Plan completed with `Revision required`:** it is published; the body states the result.
- **Scan hit:** `failed`, nothing pushed; the report names the scan class, never the matched value.
- **Branch already exists remotely without a pull request at publish time** (a concurrent pass in another checkout): the create-only push refuses. The next pass classifies the branch as `orphan-branch`.
- **Pull-request creation fails after the push:** the next pass recovers it as `orphan-branch`.
- **Issue closed while its plan pull request is open:** reported only (WP3).
- **Dry-run `would-publish` record:** a later publishing pass judges the issue again before planning it.
- **Private repository:** a dry run runs and the report marks the D2 posture; `--publish` stops in Phase 0. Lifting that stop depends on WP6b's credential isolation and is then gated in WP6b and WP7.

## Acceptance criteria

- [ ] `node build.mjs` succeeds. The catalog, the router description and the `argument-hint` of every target list `issue-buddy` in "Understand what to do" after `plan-issue`, and its budget entry is at most ten lines above the reported size.
- [ ] `test/issue-buddy-contract.test.mjs` passes. It fails if a ` ```ask ` fence is added to `src/tools/issue-buddy.md` or one of its eager includes, or if a pointer to the `worktree-integration` completion phase or the tracker-mode question is added. It asserts the literal envelope lines `Run state: non-interactive`, `Next steps: suppressed`, `Issue: #<N>`, `Issue text:` and the delimiter `--- end of control lines ---`, the three readiness verdict line forms, every Phase 0 stop row in its order, and the phase order.
- [ ] `test/issue-buddy-pass.test.mjs` passes and proves all four done criteria and the D2 stop:
  - **(a) Dry run.** No forge write call, unchanged refs in the bare `origin`, an unchanged tracked tree, changes only below `.effective-flow/issue-buddy/`, and records marked `mode: dry-run`.
  - **(b) Publishing pass.** Exactly one pull-request create call, whose branch `<branchPrefix>/plan/issue-<N>` adds exactly one file under `plan.dir` and whose body contains `Refs #<N>` and no closing keyword.
  - **(c) Second pass.** Zero forge write calls and zero ref changes.
  - **(d) Kills.** A kill after worktree creation and a kill after the push but before pull-request creation each leave a stale pass lock that the next pass reports and does not break. After the operator's `pass-lock-release` with the reported pass id, the next pass recovers each case, with exactly one pull request in total and no force push. After recovery no Issue Buddy worktree and no open lifecycle record remains. This depends on the open point 'Worktree discard is not expressible with the shipped lifecycle'.
  - **(e) Report contract.** Every pass, including a preflight stop after the lock, leaves `last-pass.json` matching WP3's schema; a dry run lists no pull request.
  - **(f) Private repository.** `--publish` against a private fixture repository stops in Phase 0 with zero forge write calls and zero ref changes, and a dry run against it completes with the report marking the D2 posture.
- [ ] The existing session-title partition test, the chat-language distribution test and the next-steps guard and mirror guard pass with `issue-buddy` included.
- [ ] `docs/adr/plan-only-unattended-publication.md` exists with `## Status` `Active` and states the D2 posture, that private repositories stay dry-run-only in stage 1 until the forge credential is isolated from model steps, and the D4 accepted risk for operator-run publication on public repositories.
- [ ] The user guide, the developer guide and the README describe the tool, and `mise run readme:check` passes.
- [ ] One manual live smoke run on a GitHub test repository shows (a) to (d) with real pull-request URLs and pass reports, recorded in the pull-request description.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in that order, as CI runs them.
- `node --test test/issue-buddy-contract.test.mjs test/issue-buddy-pass.test.mjs` for the focused cases.
  - **Mutation check:** insert an `ask` fence into the tool, and separately let the driver's body carry `Closes #<N>`, which the WP4 core must refuse; each mutation must turn one test red.
- **The integration test's harness:**
  - It drives the WP3 CLI and the WP4 core in the order the tool prescribes, through a small test-local driver whose step list the contract test compares with the tool's phase list.
  - The model steps are stubs: a readiness stub that returns `ready` for one fixture issue and `not-ready` for another, and a planner stub that writes the fixture plan file into the worktree.
  - `origin` is a local bare repository, and the forge is the fake runner pattern of `test/remote-tracker.test.mjs:125`.
  - Kills are simulated by stopping the driver at the named step, releasing the stale pass lock as an operator would, and starting a new pass.
- `mise run readme:check`.
- `pnpm eval merge-gate verify`. Drift is expected, because the router, `src/shared/next-steps.md` and `src/shared/session-title.md` are in the gate's load set (`evals/_scaffold/build-identity.mjs:25`). The owed re-recorded round is due before the next release, not before this merge (AGENTS.md).
- **Manual live smoke** with the portable build on a GitHub test repository with two prepared issues (one ready, one not): a dry run, a publishing pass, a second publishing pass, then a pass killed after the push followed by a recovering pass. Evidence: pass reports, `git ls-remote` output and the pull-request URL. Attach no AI attribution.

## Assumptions and open points

- WP2, WP3 and WP4 land before this package with the interfaces their prescribed plans describe:
  - WP3 provides `pass-lock-acquire` and `pass-lock-release` (whole-pass lock, never broken automatically), `pass-collect` with the `mode` flag (`dry-run` or `publish`), `limits` and the `recovery` section (`orphanBranches`, `unrecordedPullRequests`), `verdict-record`, `fingerprint` and `pass-report`; the files `.effective-flow/issue-buddy/trusted/issue-<N>.json`, `.effective-flow/issue-buddy/verdicts.json` and `.effective-flow/issue-buddy/last-pass.json` (report `schemaVersion: 1` with `outcome`);
  - WP4 provides `branch-name`, `scan`, `assert-changeset`, `publish` (create-only push, pull-request lookup and creation with `Refs #<N>`) and `complete-branch`;
  - WP2 provides the envelope grammar parsed before the gateway, the three-line readiness verdict and the unattended file-name rule.

  This plan classifies stale worktrees itself. Concrete subcommand and file names are re-checked against the landed code in step 1.

- The ADR candidate "Input trust boundary" is owned by WP3's plan (`docs/adr/input-trust-boundary.md`); this plan writes only "Plan-only unattended publication".
- Deferred and out of scope:
  - Forgejo support;
  - a Claude Code backend for scheduled runs;
  - configuration keys for the limits;
  - a behavioural eval suite under `evals/issue-buddy/` (left to calibration in WP7);
  - asking questions in issues;
  - any reaction after publication;
  - publishing on private repositories: lifting the stage-1 dry-run-only stop depends on WP6b's credential isolation, after which the recorded operator acknowledgment gates enabling (WP6b, WP7).
- The pass's time cap is enforced by the runner (WP6a). A pass cut off by it is a kill, and Phase 1 covers it.
- A GitHub test repository for the live smoke run is available to the implementer.

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

- **Architecture, Important (incorporated):** the mandatory read of `worktree-integration` before `git worktree add` could reach its `delivery.completion` question. The tool now reads only the execution and outcome sections, and the contract test forbids a pointer to the completion phase.
- **Architecture, Important (incorporated):** a missing tracker mode would reach the tracker-mode question in `issue-tracker.md`. Preflight now stops unless `tracker.mode` is `remote`.
- **Security, Important (incorporated):** the planning sub-agent's returned text was implicitly trusted. The pass now verifies the artifact deterministically before any push, and the scan blocks on every class when unattended. Without a sandbox and without forge rules, which a private repository lacks under D2 and no repository has before WP7 verifies the bot identity's branch rules, these checks are advisory; the ADR records this as the accepted risk. (For private repositories superseded by the D2 correction below; for public repositories in stage 1 recorded as the D4 accepted risk.)
- **Error cases, Important (incorporated):** a kill between the push and pull-request creation, and a stale worktree, now have defined recovery in Phase 1, counted against limits and retries.
- **Testability, Important (incorporated):** the Markdown tool cannot run in `node:test`. The integration test drives the deterministic sequence with stubbed model steps, and a contract test binds the driver's step order to the tool's phase list. Model behaviour is covered by the manual live smoke run.
- **Testability, Note:** the readiness stub and planner stub prove the composition, not readiness quality; calibration of readiness belongs to WP7.
- **Scope, Note:** configuration keys and an eval suite were considered and deferred; flags suffice for stage 1 and WP6a passes flags.
- **Maintainability, Note:** adding the tool invalidates the standing merge-gate eval round; the re-record is owed before the next release and is named in the validation plan.
- **Cross-plan alignment (2026-10-01):** binding orchestrator resolutions applied. Preflight now acquires WP3's whole-pass lock (never broken automatically), so done criterion (d) includes the operator's stale-lock release for a manual pass. The readiness answer uses WP2's three verdict lines; the planning argument is exactly WP2's five-line envelope, with the handoff roots in the brief. Stale-worktree classification moved here from WP3; orphan branches go through WP4's `complete-branch`, and unrecorded plan pull requests come from WP3's `recovery` section. A preflight stop after the lock writes a failed report, so WP6a always finds `outcome`. The body no longer carries `Refs`, because the WP4 core appends it. The worktree check uses `git status`, because WP4's `assert-changeset` works on commits.
- **D2 correction (2026-10-07, user decision):** WP4's single-file assertion and scan hold only while the forge credential is unavailable to model steps, and that isolation is WP6b's job. Private repositories are therefore dry-run-only in stage 1: Phase 0 reads the repository visibility through the new `repository-visibility-read` and stops `--publish` on a private repository. The accepted-risk posture for private repositories is withdrawn.
- **D4 (2026-10-07, user decision):** on a public repository a stage-1 publishing pass also runs on the operator's own forge credential, which the unsandboxed model steps can reach, and no dedicated bot identity or verified branch rule exists before WP7. The single-file assertion and the scan therefore only advise there too. Stage 1 accepts this risk for operator-run passes and does not make public repositories dry-run-only; scheduled publication waits until WP6b isolates the credential and WP7 verifies the bot identity's branch rules. The ADR records the accepted risk.
- **Recovery cleanup (2026-10-07):** a pass killed after the push leaves a worktree whose branch is pushed, so Phase 1 never treats it as stale, and neither WP4's `complete-branch` nor WP3 touches worktrees. Phase 2 recovery now discards the matching worktree through "Lifecycle outcome handling" after a successful `complete-branch` or `verdict-record`, and criterion (d) requires that no worktree or open lifecycle record remains; the discard mechanism itself is an open point (see Open points).

## Open points

- **Worktree discard is not expressible with the shipped lifecycle.** Phases 1, 2 and 5 and the edge case on a pass failure discard the Issue Buddy worktree through "Lifecycle outcome handling" (`src/shared/worktree-integration.md`). That section keeps the worktree on every abort or failure, and "Removal eligibility" (`src/shared/worktree-lifecycle.md`) requires a branch-attached `HEAD` (condition 5) and a clean status (condition 7), yet the planning worktree stays detached with the untracked plan file because WP4 commits through plumbing; resolve it after WP4 is re-derived, since its publication mechanics may change. "Claim, remove, and reconcile" (`src/shared/worktree-lifecycle.md`) also needs explicit user confirmation, which the no-`ask` rule forbids, "Worktree execution" (`src/shared/worktree-integration.md`) creates worktrees with `-b <BRANCH_NAME>`, and a killed pass leaves an `active` record that only its owning run may change ("State machine", `src/shared/worktree-lifecycle.md`). Before implementation, resolve this one way or the other: extend the lifecycle contract with a discard the owning run performs on a disposable detached worktree, or change WP5's worktree so it fits the existing removal path.

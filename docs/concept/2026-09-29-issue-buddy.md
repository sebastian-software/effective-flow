# Issue Buddy

**Concept status:** Elaborated
**Source:** effective-flow concept

## Problem and motivation

Turning a well-described issue into an actionable plan is routine work, but today it still needs a person at the keyboard. Someone has to notice that the issue is ready and start a planning run. They then answer the run's questions, start the deep plan review, and publish the result. For a maintainer with several repositories, ready issues wait until someone has time to plan, even when the requirement is already clear enough to plan without them.

Issue Buddy removes that wait. An autonomous pass runs on an always-on machine and looks at the open issues of selected repositories. When an issue is ready for planning, the pass plans it without supervision. It writes a plan file, runs a deep plan review, and opens a pull request whose content is that plan file and which references the issue. A person first gets involved at the review of that pull request. An issue that is not ready is left alone.

Verified repository context:

- `plan-issue` plans **inside the issue**: it writes one marked issue comment and creates no plan file (`src/tools/plan-issue.md`). `plan` writes a plan file but never stages or commits it (`src/tools/plan.md`). Nothing turns an issue into a plan file that is published as a pull request today.
- The planning entry point hands every issue reference to `plan-issue` (`src/shared/plan-input-gateway.md`). Both planning paths and the deep plan review (`src/tools/plan-review.md`) are interactive: `plan` asks until no questions remain, asks before finishing a plan that still has blocking points, and asks before the deep review. `plan-review` already has a "Decide later" outcome for each decision, and that outcome becomes an open point.
- An `ask` fence has no general unanswered default. Only some fragments define one, such as `src/shared/tracker-target.md` and `src/shared/security-disclosure-gate.md`. On Codex a fence renders as a free-text question (`docs/developer-guide/build-system.md`), and under `codex exec` a question ends the turn.
- The issue sufficiency check in `src/tools/apply-issues.md` measures whether an issue can be **implemented without a plan**. Issues that fail it get the `effective-flow-needs-planning` label and are routed to `plan-issue`. That check cannot serve as a planning-readiness gate, because the issues that need planning are exactly the ones it rejects.
- The plan header carries only a `**Source:**` field (`src/tools/plan.md`). Nothing in a plan file identifies the issue it was made from.
- The forge tracker scripts (`src/scripts/remote-tracker*.mjs`) support GitHub and Forgejo for listing and reading issues, reading comments, listing pull requests, and creating pull requests. Every write is a dry run unless `--apply` is passed. The only content guard they apply before a write is an attribution check (`remote-tracker-shared-core.mjs`); no secret scan exists yet.
- First remote access migrates `sf-` labels on the forge (`src/shared/issue-tracker-forge.md`), which counts as a forge write.
- Runtime state must stay below `<root>/.effective-flow/`, and a symlink pointing elsewhere is refused (`src/shared/runtime-state-safety.md`).
- The plan `docs/plan/archive/2026-08-20-plan-publication-before-implementation.md`, implemented by #511, describes how to publish a finished plan before implementation. Its archive-handshake prerequisite has since landed. Its planned mechanics conflict with an unattended pass in four places: it commits directly to the base branch when no delivery mode applies, it asks once before publishing, a non-interactive run publishes nothing, and it names the branch after the dated plan-file stem and keeps a local receipt.
- Effective Flow has no daemon, schedule, or watcher. "Autonomous" in the repository today means only the harness goal loop (`src/shared/goal-completion.md`).

Verified context in the sibling repository `llm-automatisator`:

- It is a self-hosted TypeScript service (Node 24, SQLite state, systemd on an Incus guest). It runs one job type today: it polls labelled pull requests on GitHub or Forgejo and runs a pinned Codex CLI against them.
- The Codex invocation (`src/codex/contracts.ts`) uses `exec --ignore-user-config`, `approval_policy="never"`, and `sandbox_mode="danger-full-access"`. The Codex sandbox is not used; isolation comes from a separate execution user and private workspaces. A run is capped at one hour. Skills are pinned by commit and digest and read from a snapshot path.
- It cannot poll issues or create pull requests, and it rejects schedule triggers, because it can only prepare a run for a pull request. Its agents hold no Git write credentials; the service does every push and every forge write. It already reads a user's repository permission (`src/git/platform.ts`) and sends failure notices by email.

Verified external facts:

- Codex enables sub-agents by default, and each spawn can choose its own model and reasoning effort. `--ignore-user-config` skips `$CODEX_HOME/config.toml`, so user-level custom agent files are most likely not loaded (inferred, untested). Effective Flow's portable build delegates through built-in sub-agents and needs no such files.
- A GitHub token that can push a branch (`Contents: write`) can also merge pull requests and push to unprotected branches; no permission set separates opening a pull request from merging it. Only repository rules can restrict it: rulesets or branch protection with required reviews, restricted pushes, and no bypass. Forgejo is the same: `write:repository` covers pushes and pull requests, and merge and push allowlists on protected branches are the restricting instrument.

Assumption: the target repositories are already set up with Effective Flow (a project-setup ADR with `plan.dir`, `language.*`, and `delivery.baseBranch`, not in hidden mode) and use a GitHub or Forgejo tracker.

## Target users and use cases

- **Maintainer of several repositories:** issues that are ready for planning become plan pull requests without starting each planning run by hand, so the maintainer's attention goes to reviewing plans, not producing them.
- **Plan reviewer:** receives a pull request whose diff is exactly one plan file that has been through a deep review. The decisions the automation could not make are listed as open points with their options, so the review is where those decisions are made.
- **Operator of the always-on machine:** calibrates a repository with dry runs, enables it, bounds how much each pass does, reads a per-pass report, and gets a notice only when a pass fails.

## Solution sketch

Issue Buddy is an unattended mode of Effective Flow. One invocation performs one **pass** over one repository checkout. By default a pass is a dry run: it produces its report and writes nothing, and only an explicit publish flag lets it push and open pull requests. This matches the tracker scripts' `--apply` convention. `llm-automatisator` starts publishing passes on a schedule for each enabled repository. Apart from the schedule, the service provides only the persistent checkout, the pinned skill, and a forge credential. Selection, planning, review, commit, push, and the pull request all belong to Effective Flow.

A pass works through these steps:

1. **Collect candidates.** List the open issues, excluding pull requests that the forge's issue listing also returns. Keep only issues whose author has write access to the repository, established through the forge's permission endpoint rather than the author-association hint. Drop comments from anyone without that access in the script layer, before any model sees the text, so third-party text never enters the run.
2. **Skip what is already handled.** Skip an issue when any of these holds:
   - an open pull request references it;
   - the deterministic plan branch for it already exists;
   - a plan file whose `**Issue:**` header names it exists under `plan.dir` or its archive on the base branch;
   - it carries the in-progress or done lifecycle label;
   - it already holds a `plan-issue` plan comment.

   A plan pull request that was closed without merging blocks the issue until its trusted content changes after the close.

3. **Skip what has not changed.** Compare a fingerprint of each remaining candidate's trusted content with the stored one. The trusted content is the title, the body, the comments that passed the filter, and the set of their authors. An issue already judged not ready is looked at again only after that fingerprint changes.
4. **Planning-readiness gate.** Judge each changed candidate with a dedicated planning-readiness check. It asks whether an issue can be planned, not whether it can be implemented without a plan. It requires:
   - a recognizable goal or problem;
   - an intended outcome that the author states or that clearly follows from the issue;
   - a scope that fits one plan;
   - no unresolved question from the author or a trusted commenter that would change the direction.

   Acceptance criteria may be derived during planning. An `effective-flow-needs-planning` label is a positive signal: such issues are judged first, but they still pass through the same check. When in doubt the check answers "not ready". A not-ready issue is **not touched on the forge**. The verdict, the fingerprint, and a short reason are recorded only in local runtime state.

5. **Plan.** For a ready issue, write a plan file under `plan.dir` in the repository's `language.workflow`. The file name starts with `issue-<N>-`, and the new `**Issue:**` header field names the issue. Planning asks nobody. Every point where interactive planning would ask becomes an open point in the plan instead.
6. **Deep plan review.** Run the deep plan review without supervision. Findings it can resolve clearly are fixed in the plan. Each decision only a person can make takes the existing "Decide later" path and is recorded as an open point with its options, and nothing is chosen on the person's behalf. `Revision required` is an allowed outcome, not a stop.
7. **Publish.** Check deterministically that the change is exactly one added file under `plan.dir`. Scan that file, the pull-request title, and the pull-request body for secrets and forbidden paths. Then commit on the branch `<branchPrefix>/plan/issue-<N>`, created fresh from `delivery.baseBranch`, push without force, and open a pull request.
   - The **plan file is the pull request's content**; the pull request adds nothing else.
   - The title follows `language.git` and the body follows `language.forge`.
   - The body summarizes the plan, states the review result, lists the open decisions, and references the issue with the non-closing `Refs` keyword. A plan does not resolve the issue, so its merge must not close it.

   Because the push does not force, the branch works as a forge-side lock against a second pass planning the same issue.

A pass has two separate limits: how many readiness judgments it makes and how many plans it publishes, by default one. It processes candidates in a fixed order, labelled issues first and then the least recently updated. A pass cut off by a limit or the time cap simply leaves the rest for the next pass. A failed issue is retried once in a later pass and then left alone until its fingerprint changes. A pushed branch that has no pull request is completed or reported by the next pass after it checks the branch's shape. An issue closed while its plan pull request is open is only reported. The local store is a cache: if it is lost, every candidate is judged again, and the forge-side checks still prevent duplicate plans.

Each pass writes a **pass report**. Dry runs print the same report. It contains counts per skip reason, readiness verdicts with their short reasons, pull requests opened, and failures. Neither the report nor any other output of the pass is written to an issue, and no `sf-` label migration runs in this mode. The one visible trace on an issue is the cross-reference that the forge shows by itself for a `Refs` link.

After a pull request is opened, the ordinary lifecycle takes over. The reviewer resolves the open points in the pull request, by editing the plan or through `effective-flow iterate`, and merges it. Implementation then starts from the merged plan through `effective-flow apply`, whose clarity gate still refuses a plan with unresolved open points.

**Success and stop criteria.** During dry-run calibration each repository gets two target values. The first is the share of plan pull requests that are merged. The second is the share of issues judged ready that a reviewer rejects as not ready. A repository whose false-ready share stays above its target is switched back to dry runs.

## Scope

### In scope (first version)

The first version is delivered in two stages. Each stage is usable on its own.

**Stage 1 — manual pass (Effective Flow only):**

- An unattended Effective Flow mode that performs one pass over one repository checkout. It defaults to a dry run, needs an explicit flag to publish, and reaches no `ask` site.
- An explicit non-interactive run state that maps every ask site on the planning and review path. Unanswered always becomes an open point, never a guess.
- Candidate selection over all open issues, restricted to authors with write access, with untrusted comments removed before any model sees the text.
- The idempotency checks, the rule for plan pull requests closed without merging, and the fingerprint-based re-judgment.
- A dedicated planning-readiness check, with `effective-flow-needs-planning` as a positive ordering signal.
- The `**Issue:**` plan header field and the deterministic `issue-<N>` plan branch and file prefix.
- Non-interactive planning into a plan file and an unattended deep plan review that records every human decision as an open point.
- Publication through a shared deterministic publication core: a single-file assertion, a scan of the file, title, and body, and a pull request with `Refs`.
- Per-pass limits, retry-once handling, and the pass report.

**Stage 2 — scheduled operation (`llm-automatisator` and operations):**

- A repository-level job with a schedule trigger that runs a publishing pass per enabled repository through the existing Codex backend with the portable Effective Flow build.
- One persistent checkout per repository that serves as the runtime-state root, so the local cache survives between passes.
- A forge credential for a dedicated bot identity, passed as a named secret reference.
- Repository rules that confine that identity to the plan branches and forbid it to merge, push to, or bypass protection on any other branch.
- The pass report exposed through the service's result contract, and a failure notice through its existing notification path. Skips and successful passes send no notice.
- Per-repository dry-run calibration before a repository is enabled.

### Non-goals

- **Implementation.** Issue Buddy never runs `apply`, `build`, or any implementer: a person reviews the plan first.
- **Merging.** It never merges or approves its own pull requests. Repository rules enforce this, and the credential's scopes cannot.
- **Writing to issues.** It posts no comments, sets no labels, and asks no clarification questions in the first version. Asking questions in the issue is a deliberate later extension.
- **Planning inside the issue.** `plan-issue` stays the interactive, in-issue path and is not changed.
- **Reacting after publication.** Once a plan pull request exists, later issue edits and review comments are handled by people through the existing tools, and base-branch drift is left to the reviewer.
- **Splitting an issue into child issues or combining several issues into one plan.** One issue produces one plan.
- **External trackers, local trackers, and hidden mode.** Hidden mode forbids naming Effective Flow in pull requests and keeps plans untracked, so it cannot produce a plan pull request.
- **A Claude Code backend in the first version.** Codex comes first because the service already runs it. Claude Code follows later.
- **Its own scheduler.** Effective Flow keeps no daemon; scheduling, the persistent checkout, and credentials stay with `llm-automatisator`.

## Technical direction

- **Placement.** Effective Flow gets a new exposed tool for the pass, working name `issue-buddy`. Deterministic steps belong in a dependency-free runtime script following the repository's CLI-over-core split, registered with the build's runtime-script list:
  - listing candidates and reading permissions;
  - filtering comments and computing fingerprints;
  - the idempotency checks and the verdict store;
  - the pass report.

  Model judgment covers only the readiness verdict, the plan, and the review. The tool reuses the forge tracker scripts, the planning and plan-review logic, and the shared publication core instead of copying them.

- **Unattended run state.** The pass does not enter through the planning entry point, which would route the issue to `plan-issue`. It calls the planning and review logic directly with a non-interactive run state, and each ask site on that path has a defined outcome:
  - a planning clarification becomes an open point;
  - the question whether to finish a plan with blocking points publishes it with `Revision required`;
  - the question whether to run the deep review always runs it;
  - each plan-review decision takes "Decide later".

  A contract test proves that no `ask` is reachable on this path, because under `codex exec` a stray question would end the pass silently.

- **Publication core.** A deterministic core is extracted before either user of it is built:
  - the scan classes;
  - the single-file commit;
  - the pull-request mode with an issue reference.

  Issue Buddy and the plan-publication plan both use it. That plan is revised to fit: its file table changes, and it states that the plan-only, flag-gated publication of an unattended pass is the one deliberate exception to "a non-interactive run publishes nothing".

- **Trust boundary.** Author filtering and comment removal happen in the script layer, before any issue text is handed to a model. Issue text that reaches the model is still treated as data, never as instructions. The agent runs without a Codex sandbox, so the single-file assertion and the scan only advise. The enforcing boundary is on the forge: a dedicated bot identity with the plain write role, and rulesets or branch protection that allow it to push only to `<branchPrefix>/plan/issue-*`, require a human approval on every merge, and grant it no bypass. Whether GitHub and Forgejo can both express "push only to this branch pattern" for one identity is verified in the operations package.
- **Runner.** `llm-automatisator` gains a repository-level job type with a schedule trigger and a persistent per-repository checkout that serves as the runtime-state root. Each pass uses the existing pinned Codex invocation with the portable Effective Flow build. The workspace, execution-user, and skill-pinning model stays; the one deliberate change is that this job's run holds the bot identity's token.
- **External systems.** GitHub (`gh`) and Forgejo (`tea`) through the existing tracker scripts, and Codex CLI in exec mode on the always-on Linux guest.
- **Data outline.** Per repository, the local runtime state below `.effective-flow/` holds one record per judged issue: the issue number, the fingerprint of its trusted content, the verdict (not ready, published, failed, or closed without merge), a short reason, the retry count, and the time. It also keeps the recent pass reports. The forge holds the plan branches and pull requests; the base branch holds the merged plan files and their `**Issue:**` headers.

ADR candidates:

- **Plan-only unattended publication.** An unattended pass may publish without confirmation, limited to a flag-gated pull request containing exactly one plan file. It narrows the rule that non-interactive runs publish nothing.
- **Unattended run state.** Across all Effective Flow tools, an unanswered question in a non-interactive run becomes an open point, never a guess. It generalizes the scattered per-fence defaults into one rule.
- **Input trust boundary.** Issue text counts as trusted input only when its author has write permission, and third-party comments are removed before any model sees them. Later extensions such as asking questions in the issue reuse this boundary.
- **Forge token inside the agent run (`llm-automatisator`).** A job run may hold a forge write token for a dedicated bot identity. Forge-side branch rules are the enforcing boundary, and in-run checks only advise. It narrows the service's rule that agents hold no write credentials.

## Risks and open questions

- **Prompt injection through trusted authors' content.** The author filter lowers the risk but does not remove it: a collaborator's issue can quote external text. The forge-side branch rules, the required human approval, and the fact that nothing is implemented bound the possible damage to a misleading plan pull request once work package 7 has verified the branch rules. In stage 1 the branch-rule bound is absent, and work package 5's decision D4 records this as an accepted risk.
- **Readiness calibration.** A lenient check produces noisy plan pull requests, and a strict one plans nothing. The dry-run calibration, the target values, and the switch back to dry runs manage this risk; the check's exact wording is settled in its plan.
- **Codex exec behaviour.** The portable build is expected to delegate through built-in sub-agents under `codex exec --ignore-user-config`, and no question should be reachable. Both are inferred, not tested. The first work package is a spike that settles this before anything else is built.
- **Branch-pattern restriction per identity.** Whether both forges can confine one identity to one branch pattern is unverified. If one cannot, that forge needs a fallback, such as a fork owned by the bot, before it is enabled. On a GitHub Free organisation, rulesets work only on public repositories, so a private repository has no forge-side boundary. Binding decision D2 in work package 5's plan therefore keeps private repositories dry-run-only in stage 1 until the forge credential is isolated from model steps (WP6b, the publishing half of work package 6). In stage 1 the operator's own credential publishes and no forge rule confines it on any repository; work package 5's decision D4 records this as an accepted risk for operator-run passes. After that, WP6b's `issueBuddy.privateRepositoryAcknowledgement` and work package 7's approval table gate enabling.
- **`llm-automatisator` prerequisites.** Schedules, a persistent checkout, and a secret handed into the run do not exist there yet, and nothing there has been tested against a real forge. Stage 2 depends on that repository's roadmap; stage 1 does not.
- **Cost on the first pass.** Without stored fingerprints every open issue is a candidate at once. The separate judgment limit spreads this over several passes.

## Roadmap and work packages

1. **Codex exec spike (Effective Flow and `llm-automatisator`).**
   - Goal: settle whether the portable Effective Flow build delegates to sub-agents and completes without a question under the service's exact Codex invocation.
   - Rough scope: one throwaway pass-like run on a test repository with the pinned invocation; a written result, with no product change.
   - Done when: the result states delegation behaviour, no-question behaviour, and time taken, with evidence.
   - Dependencies: none.
   - Handoff: `effective-flow plan "Work package 1 (Codex exec spike) of docs/concept/2026-09-29-issue-buddy.md: verify that the portable Effective Flow build delegates to sub-agents and completes without any question under llm-automatisator's pinned codex exec invocation, and record the evidence"`

2. **Unattended run-state and readiness contract (Effective Flow).**
   - Goal: planning and plan review can run with nobody to answer, and an issue can be judged ready for planning.
   - Rough scope:
     - the non-interactive run state and the outcome of each ask site on the planning and review path;
     - the planning-readiness check with the `effective-flow-needs-planning` ordering signal;
     - the `**Issue:**` plan header field.
   - Done when: contract tests prove that no `ask` is reachable on the unattended path, and the readiness check is documented with examples of ready and not-ready issues.
   - Dependencies: 1.
   - Handoff: `effective-flow plan "Work package 2 (unattended run-state and readiness contract) of docs/concept/2026-09-29-issue-buddy.md: define the non-interactive run state and ask-site mapping for planning and plan review, the planning-readiness check, and the Issue plan header field"`

3. **Issue Buddy runtime script (Effective Flow).**
   - Goal: every deterministic step of a pass is testable outside model judgment.
   - Rough scope:
     - candidate listing with pull requests excluded;
     - permission reads and comment filtering;
     - fingerprints and the idempotency checks, including closed-without-merge and pushed-branch-without-pull-request;
     - the verdict cache, limits and ordering, retry-once handling, and the pass report;
     - the `sf-` migration switched off.
   - Done when: unit tests cover each skip rule and edge case, and the script is registered and shipped in every target.
   - Dependencies: 2 for the header field.
   - Handoff: `effective-flow plan "Work package 3 (Issue Buddy runtime script) of docs/concept/2026-09-29-issue-buddy.md: build the dependency-free candidate, trust-filter, fingerprint, idempotency, verdict-cache and pass-report script"`

4. **Shared publication core (Effective Flow).**
   - Goal: one deterministic publication path serves both Issue Buddy and the shipped interactive plan publication.
   - Rough scope:
     - scan classes covering the file, title, and body;
     - the single-file assertion and commit;
     - a deterministic branch and a non-force push;
     - pull-request creation with `Refs`;
     - re-deriving WP4's plan against the shipped publication (`src/shared/plan-publication.md`, from `docs/plan/archive/2026-08-20-plan-publication-before-implementation.md`, implemented by #511); see WP4's open point "Stale against the merge base".
   - Done when: unit tests cover the assertion, the scan, and the branch lock, and the re-derived WP4 plan passes its own review.
   - Dependencies: none; it can run alongside 2 and 3.
   - Handoff: `effective-flow plan "Work package 4 (shared publication core) of docs/concept/2026-09-29-issue-buddy.md: extract the deterministic plan publication core, re-derived against the shipped publication in src/shared/plan-publication.md (see the open point in docs/plan/2026-10-01-shared-plan-publication-core.md)"`

5. **`issue-buddy` tool, stage 1 (Effective Flow).**
   - Goal: a manual dry-run or publishing pass works end to end on one checkout.
   - Rough scope: the exposed tool that composes the script, the unattended planning and review, and the publication core, plus user and developer documentation.
   - Done when, on a test repository:
     - a dry run writes nothing;
     - a publishing pass opens exactly one plan pull request;
     - a second pass does nothing;
     - a pass killed mid-run recovers on the next pass.
   - Dependencies: 2, 3, 4.
   - Handoff: `effective-flow plan "Work package 5 (issue-buddy tool, stage 1) of docs/concept/2026-09-29-issue-buddy.md: build the exposed issue-buddy tool that runs one dry-run or publishing pass over one repository checkout"`

6. **Scheduled repository job (`llm-automatisator`).**
   - Goal: the service runs publishing passes on a schedule.
   - Rough scope:
     - a repository-level job with a schedule trigger;
     - a persistent per-repository checkout as the runtime-state root;
     - the bot token handed in as a named secret reference;
     - the pass report in the result contract, and a failure notice.
   - Done when: a scheduled pass against a test repository publishes one plan pull request and reports it, and a failing pass sends one notice.
   - Dependencies: 5 and the forge-token ADR candidate. Plan it in the `llm-automatisator` checkout.
   - Handoff: `effective-flow plan "Work package 6 (scheduled repository job) of the Issue Buddy concept in the effective-flow repository, docs/concept/2026-09-29-issue-buddy.md: add a scheduled repository-level job that runs a publishing issue-buddy pass with a persistent checkout and a bot token"`

7. **Operations and calibration.**
   - Goal: repositories are enabled safely.
   - Rough scope:
     - the bot identity per forge;
     - rulesets or branch protection that confine it to the plan branches;
     - a check that both forges can express this restriction;
     - dry-run calibration per repository with its target values, then enabling.
   - Done when: each enabled repository has its rules in place and its targets recorded, and the false-ready share stays within target over the first calibration period.
   - Dependencies: 5 and 6.
   - Handoff: `effective-flow plan "Work package 7 (operations and calibration) of docs/concept/2026-09-29-issue-buddy.md: set up the bot identity and branch rules per forge and calibrate each repository with dry runs before enabling it"`

## Concept review

**Result:** Approved

| Area                  | Assessment                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product fit           | Clear gain for a maintainer of several repositories. Human judgment stays at the pull-request review, and success and stop criteria are defined.                            |
| Scope                 | The first version is split into two independently usable stages. The non-goals keep out implementation, merging, and any write to issues.                                   |
| Technical feasibility | Reuses tracker scripts, planning, and plan review. The Codex exec behaviour is unverified and settled by the first work package.                                            |
| Data and security     | The trust boundary sits in the script layer. The forge rules enforce what the agent may push, because the agent runs without a Codex sandbox and in-run checks only advise. |
| Risks                 | Readiness calibration, prompt injection through trusted authors, and branch-pattern support per forge are named, each with its mitigation.                                  |
| Roadmap               | Seven ordered packages across both repositories. Each has a done criterion and a handoff.                                                                                   |

### Findings

- **Critical — the readiness gate was inverted.** The draft reused the `apply-issues` sufficiency check, which measures readiness for implementation without a plan, and skipped every lifecycle-labelled issue, including those queued for planning. Decision: a dedicated planning-readiness check, with `effective-flow-needs-planning` as a positive ordering signal. Incorporated into the solution sketch, the scope, and work package 2.
- **Critical — there was no unattended contract.** A reachable `ask` would silently end a `codex exec` pass, and the draft wrongly claimed that fences have a general unanswered default. Incorporated: the pass bypasses the planning entry point, maps every ask site explicitly, and gains a contract test. The draft's claim about fence defaults is corrected.
- **Critical — the enforcing boundary was misplaced.** The token cannot be scoped to forbid merging, and the agent runs without a Codex sandbox. Incorporated: a dedicated bot identity with forge-side branch rules as the enforcing boundary, with the single-file assertion and the scan, now extended to title and body, as advisory checks.
- **Important — nothing identified a plan's issue.** Incorporated: the `**Issue:**` header, the `issue-<N>` file prefix and plan branch, and the extended skip rules and edge cases (pushed branch without a pull request, concurrent passes, issue closed, plan merged).
- **Important — the handling of a closed unmerged plan pull request was undefined.** Decision: re-plan only after the issue's trusted content changes after the close. Incorporated.
- **Important — the publication path collided with the plan-publication plan.** Decision: extract a shared deterministic publication core and revise that plan to use it. Incorporated as work package 4. The stale note about the archive-handshake dependency was removed.
- **Important — runtime-state location.** Incorporated: a persistent per-repository checkout serves as the runtime-state root, and the local store is only a cache.
- **Important — cost and run time.** Incorporated: separate judgment and publication limits, fixed ordering, retry-once handling, and resumption by the next pass.
- **Important — hidden forge write.** Incorporated: the `sf-` label migration is off in this mode, and the forge's own `Refs` cross-reference is named as the only trace on an issue.
- **Important — operator visibility and success.** Incorporated: the pass report, the per-repository target values, and the switch back to dry runs.
- **Important — the first version was too large.** Incorporated: two independently usable stages.
- **Note — smaller corrections.** Incorporated:
  - The reviewer's plan is described as "has been through a deep review".
  - The title and body languages are named.
  - The dry run is the default, with an explicit publish flag.
  - Write access comes from the permission endpoint.
  - Commenter authors are part of the fingerprint.

## Open points

- No open points.

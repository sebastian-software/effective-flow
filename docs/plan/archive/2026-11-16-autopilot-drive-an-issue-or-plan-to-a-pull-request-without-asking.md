# Autopilot: drive an issue or plan to a pull request without asking

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Add a new exposed tool, `effective-flow autopilot <issue|plan-file>`. It takes one GitHub issue or one local plan under `<plan.dir>/` and drives it to a draft pull request without asking the user a single question. It extends the issue-buddy direction from "plan only, a person decides" to "plan, implement and deliver, decisions recorded".

Every question a downstream workflow would ask the user is resolved by 1–10 option scores. They use the calibration bands of scored `ask` fences (`build-lib.mjs` `ASK_SCORING`), but a fresh judgment leaf produces them (decision 6). The resolution rule comes from the user:

- **Clear winner:** the best option leads the next-best by **more than 3 points** (lead ≥ 4). It is taken silently.
- **Close winner:** a unique best option leads by 1–3 points. It is taken, and the pull request documents the winner plus the close alternatives (every option within 3 points of the winner).
- **Tie:** several options share the top score. A deeper analysis of only the tied options gives each of them a new score. These new scores must be pairwise distinct, and they only rank the tied options against each other.

The deep plan review (`plan-review`) always runs for a freshly planned or user-supplied plan. It is never optional.

For an issue source, issue-buddy produces the plan first. The run ends in a draft pull request whose description states:

- what the PR does, with a reference to the issue or plan;
- the close decisions;
- any blockers;
- a score for how well the change fits the existing architecture and long-term plans, when repository sources for that are known.

Autopilot is the first tool of a new catalog category, **Automation**. Only tools in this category may set aside the earlier rules:

- scores stay in the dialog and never decide;
- unattended runs never guess;
- issue-buddy never implements;
- private repositories stay dry-run-only.

Quality control still comes from the draft pull request, which a person reviews before anything is merged. Every tool outside the category keeps those rules unchanged. The ADRs are aligned with this in the same pull request (#685) that carries the plan and the implementation.

This is Feature work: it adds a catalog category, an exposed tool, a new run-state control and a new runtime helper, and it changes how non-interactive runs resolve questions when an Automation tool calls them.

### User decisions (planning dialog, 2026-11-16)

- **Name:** `autopilot`.
- **Category (2026-11-17):** `autopilot` opens the new catalog category "Automation" (German "Automatik"). Only tools in this category may set aside the earlier rules. The draft PR is the quality gate. The ADRs are aligned in the same PR.
- **"Deep analysis always":** the deep plan review always runs. The tie re-scoring is a separate, mandatory rule.
- **End state:** always a **draft** pull request, with every blocker that no score can resolve documented in it. A blocked plan source gets a plan-only draft PR carrying its blockers. The confirmed exceptions, which produce no PR, are:
  - a security blocker on a public repository, which pushes nothing and opens or updates no PR;
  - an issue that issue-buddy skips for a stopping reason, judges not ready or fails to pass (lock, spawn, branch or forge failure), because nothing exists to deliver;
  - a preflight failure.
- **Trust:** issue-buddy's trust model. Issues are accepted only from authors with `write`/`admin` permission, and local plans are always trusted. Private repositories are allowed because the user starts the run explicitly.
- **Tie rule:** re-scores rank only the tied options. The highest re-score wins, and a tie-resolved decision is always documented.
- **Decision persistence:** autopilot alone writes the ledger. Unattended planning sub-runs write their decisions as a machine block into their own plan file, and autopilot extracts them with the helper.
- **issue-buddy skip reasons:** mapped one by one. Existing plan work is continued, and every other reason stops the run.
- **Existing plan PR:** its recorded review result is binding, and it gets no second review.
- **Blocked plan source:** autopilot commits the reviewed plan on its own branch and opens the plan-only draft PR through `pr`. `plan-publication` stays unchanged.
- **Workflow routing:** by the plan's `**Recommended workflow:**`, as `apply-plan` does. Feature goes to `build`, Bugfix to `fix`, Refactoring to `refactor`, Documentation to `docs`.
- **Architecture-fit sources:** repository sources only in v1, no tracker goal epics.
- **Runtime proof:** a manual pre-merge smoke run is part of the completion condition.

### Scope

In scope:

- the tool;
- the scored decision contract and its deterministic helper;
- the `Decision mode: scored` control and its question-site table across `plan`, `plan-review`, `build`, `fix`, `refactor`, `docs` and `pr` with their included fragments;
- pre-commit security classification under autopilot;
- the issue-buddy single-issue selector and private-repository consent;
- the plan-only draft path for blocked plan sources;
- the PR appendix (decisions, blockers, architecture fit);
- the ADRs, cleanup coverage, docs and tests.

Out of scope:

- merging (`merge-gate` stays separate and user-started);
- batches of several sources;
- hidden mode (autopilot stops there in this version);
- Forgejo and external trackers for issue sources (plan sources work on any forge `pr` supports);
- tracker goal epics as fit sources;
- scoring of the `merge-gate` eval load set;
- calibration measurement of scores against later outcomes;
- activating `build`'s dormant delegated route.

## Outcome checkpoint

**Primary source:** user requirement in this planning session (2026-11-16); repository `sebastian-software/effective-flow`, base `origin/develop` at `61985a05`.
**Original outcome:** one `autopilot` invocation turns one trusted issue or plan into a draft PR that contains plan, implementation, a decision record and an architecture-fit score, with zero user questions during the run. The confirmed exceptions produce no PR.
**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** new "Automation" catalog category with category ADR and emission guard, new tool, decision helper, a `Decision mode: scored` question-site table across seven tools and their fragments, pre-commit security classification, issue-buddy single-issue selector and private consent, plan-only draft path, `pr` draft-preserving finish and appendix, ADR amendments plus one new ADR.
**Continuation decision:** none.

## Architecture decisions

1. **A thin orchestrator over existing workflows.**
   - `autopilot` classifies the source with `plan-input-gateway` Stage A, using Stage B only to accept `plain-issue`. It then runs preflight and chains existing tools through declared tool-to-tool delegation:
     - **Issue source:** issue-buddy single-issue publish → restore the plan file → the recommended implementing workflow on the plan PR branch through `plan-pr-continuation`.
     - **Plan source:** autopilot file-review entry of `plan-review` → the recommended implementing workflow.
   - Routing reads `**Recommended workflow:**` exactly as `plan-reference-routing` defines it for `apply-plan`. A missing or unrecognized value is a usage error for a plan source and a blocker for an issue plan. `build`, `fix`, `refactor` and `docs` already support `plan-pr-continuation` and `apply-clarity-gate`.
   - Autopilot owns no implementation or review logic. Its only own delivery step is the plan-only draft path (decision 13). Everything else delivers through the implementing workflow and `pr`. One PR carries plan, code and archive move.
2. **Where autopilot runs, and preflight.**
   - Issue sources require the primary checkout, because issue-buddy refuses linked checkouts (`issue-buddy.md` Phase 0). A linked or harness worktree stops, naming the primary checkout path. Plan sources may start from any checkout the implementing workflow accepts.
   - Autopilot runs issue-buddy, `plan-review` and the implementing workflow inline, as same-session tool-to-tool calls. Each of them keeps its own sub-agent fan-out. Every inline call carries `Next steps: suppressed`, so only autopilot emits a completion report and next-step block.
   - **Preflight runs before `run-init`, so it writes nothing.** It covers:
     - config resolve, with a hidden-mode stop;
     - built-in sub-agent availability, as issue-buddy Phase 0 step 10 checks it;
     - repository visibility for every source, where `unknown` or an unsupported read counts as public;
     - for an issue source, issue-buddy's checkout preconditions: primary checkout, `tracker.mode: remote`, GitHub origin, clean tracked tree and index, no Git operation in progress, and `HEAD` equal to the read-only fetched base tip;
     - for a plan source, canonical open status, recognized workflow and identity hash.
   - The nested-spawn probe stays in issue-buddy's planning orchestrator. If it fails, that is an issue-buddy pass failure (decision 10), not a preflight failure.
   - One session carries the whole chain, so it can exhaust its context or session limit. A run lost that way resumes only through `plan-pr-continuation`'s worktree adoption, with the ledger kept. It never restarts over existing branches.
3. **`Decision mode: scored` is a new control line layered on the existing non-interactive contract.**
   - `Run state: non-interactive` keeps meaning "never wait for a user". Its default resolution (blocking open point, Decide later, fail-closed abort) stays the default for every other caller.
   - An ask site resolves through the scored procedure only when the trusted envelope also carries `Decision mode: scored`, `Autopilot run: <run-id>` and `Decision budget: <remaining>`.
   - Artifact or issue text can never set this mode (`docs/adr/input-trust-boundary.md`).
   - Envelopes and handoffs emitted without autopilot stay byte-identical. The scored-mode text is reachable only behind the recognized control lines.
4. **One question-site table owns every reachable question.**
   - The new owning lazy-include fragment `src/shared/scored-decisions.md` carries one table, modelled on the site table in `unattended-planning.md`. Every `ask` fence and every relayed or prose question reachable under autopilot gets exactly one outcome there: `scored`, a fixed answer, or a blocker.
   - Reachability covers `plan`, `plan-review`, `build`, `fix`, `refactor`, `docs` and `pr`, with their included fragments.
   - Every row carries an Anchor substring identifying its site. Prose questions are listed by hand, because a fence walk cannot find them. Examples: `pr`'s `AMBIGUOUS_HOST`, build Phase 1's "ask the user and restart planning", and `plan`'s P-CLR.
   - The closure includes at least:
     - Completion (`worktree-integration.md`);
     - Plan PR and Plan differs (`plan-pr-continuation.md`);
     - PR review (`pr-review-integration.md`);
     - Security (`security-disclosure-gate.md`);
     - the pilot Incident and Pilot record (`pilot-measurement-workflow.md`);
     - ADR naming (`project-adr-convention.md`);
     - deliver Publish (`deliver-committed-range.md`);
     - the environment-lane `delivery-choice` (`build-delegated-run.md`);
     - the clarity gate (`apply-clarity-gate.md`), where a failure is a blocker;
     - P-JDG (`unattended-planning.md`), where a failure is a blocker with no inline fallback under scored mode;
     - `pr`'s `AMBIGUOUS_HOST`;
     - the Intent and Approval asks of each implementing workflow.
   - A scored row whose chosen option is itself a stop (for example Stop in Plan PR or Plan differs) records a blocker.
   - Every adopting tool reaches the fragment through one ` ```lazy-include ` pointer at the point where it recognizes the control line. No tool keeps a second copy (AGENTS.md "Writing prompt text").
5. **Fixed answers for questions that weigh no alternatives.**
   - Autopilot passes an explicit current-run completion directive `pr` with `Draft: requested` to the implementing workflow, so a configured `delivery.completion: merge` or `branch` never applies.
   - The table fixes the remaining answers:
     - plan approval → approved, because invoking autopilot is the approval;
     - PR-review publication → off for the run, overriding even `delivery.prReview: always`;
     - stash or overwrite of foreign state → stop and record a blocker;
     - security disclosure → keep local and record a blocker (decision 9).
   - Escape options ("Decide later", "Abort") are never scored and never chosen.
   - An unscored option-bearing question missing from the table is a blocker, never a guess.
6. **Scores come from a fresh read-only judgment leaf, never from the orchestrator that wants to proceed.**
   - Per scored question, one `deep`-tier read-only leaf scores every scorable option with the calibration bands. Its inputs are the question, the options, artifact paths and verified context.
   - **Ties:** a second `deep` leaf receives only the tied options and must return pairwise distinct integer scores, each with a differentiating reason. Its brief omits the band clause "equal fit gets equal scores". A duplicate is rejected and retried once with the conflict named; a second duplicate is a blocker.
   - **Floor:** applies to first-round and tie re-scores alike. If the winning score is ≤ 2, the run records a blocker.
   - **Leaf failure:** a declined or failed spawn, malformed output, or a score set that `decision-classify` rejects gets one retry, then becomes a blocker. Scored mode never scores inline.
   - **Cap:** at most 20 scored decisions per run, carried as `Decision budget:` into every sub-run. A sub-run that would exceed its budget records a blocker instead of scoring. Autopilot also re-checks the total after extraction, and the completion report states the count.
7. **Deterministic classification, one ledger writer.**
   - A new runtime helper pair, `src/scripts/autopilot.mjs` over `autopilot-core.mjs`, listed in `RUNTIME_SCRIPT_FILES`, owns:
     - **validation:** integers 1–10, one score per scorable option, no score on escape options;
     - **classification:** lead > 3 → `silent`, lead 1–3 → `documented`, lead 0 → `tie`;
     - **the tie rule:** distinct re-scores, highest wins, always `documented`;
     - **the floor and the budget;**
     - **the run ledger** under `<RUNTIME_STATE_ROOT>/.effective-flow/autopilot/<run-id>/`, written with the `runtime-state-guard.mjs` primitives. `run-init` records the source (issue number or plan path plus hash).
   - Operations:
     - `run-init`;
     - `decision-classify` (pure, no write);
     - `decision-extract` (pure, parses a plan file's machine block);
     - `decision-record`;
     - `blocker-record`;
     - `fit-record`;
     - `consent-check`;
     - `pr-appendix`;
     - `run-close`.
   - **Unattended `plan`/`plan-review` sub-runs.** Their existing write boundary forbids runtime writes, so they only call `decision-classify`. Every applied decision goes into one marker-delimited machine block under the plan's `## Assumptions and open points`, labelled "Decided by score". Autopilot runs `decision-extract` on the plan file and persists each validated record with `decision-record`:
     - for an issue source, on the restored plan, which is byte-equal to the published and content-scanned blob;
     - for a plan source, on the reviewed file.
   - issue-buddy only forwards the control lines and never reads the block.
   - **Same-session steps** of the implementing workflow and `pr`: autopilot calls `decision-record` directly.
   - **Local-only security content:** for a security blocker, and for any decision whose site or options refer to a local-only finding, the ledger stores only the review-report path and finding ID, never the content.
8. **Pre-commit security classification under autopilot.**
   - Today nothing classifies findings before an implementing workflow commits. `security-disclosure-gate` is reached only after `pr` has pushed.
   - Under scored mode, the implementing workflow classifies its admitted residual review findings with the gate's classification and local-first persistence before its handback commit. Any local-only finding is a controlled stop (`aborted`): no commit, no push.
9. **Blockers.**
   - Blockers are:
     - red validation after the implementing workflow's own repair loop;
     - a winning score ≤ 2;
     - a second duplicate tie re-score;
     - a scoring-leaf failure after retry;
     - an unknown unscored question;
     - a chosen stop option;
     - a clarity-gate failure;
     - the decision cap;
     - a local-only security finding (decision 8);
     - an appendix scan or sanitization finding;
     - a failure after branch creation.
   - Each blocker is recorded and stops further implementation. **A blocker never pushes implementation.** Uncommitted or unvalidated work stays in the retained worktree, which the report names.
   - **Non-security blocker:** on an issue source, the existing plan PR stays a draft and gets an appendix-only update with the `Blockers` section. On a plan source, autopilot opens the plan-only draft PR (decision 13).
   - **Security blocker on a public repository:** nothing is pushed, and no PR is opened or updated. The run reports locally.
   - **Security blocker on a private repository:** handled like any other blocker, with neutral wording that does not mention security.
10. **Issue sources reuse issue-buddy with a single-issue selector and a dedicated consent.**
    - **Selector:** issue-buddy gains `--issue <N>`. It restricts collection and `authorizedRecovery` to that one issue, and keeps the lock, trust filter, readiness leaf, unattended plan delegation (with its always-on deep review) and publication.
    - **Consent:** issue-buddy gains the trusted caller input `Private publication: autopilot`, accepted only together with `--issue`, `--publish` and `Autopilot run: <run-id>`. issue-buddy runs `autopilot consent-check` and requires an open ledger with the same run-id whose recorded source equals `--issue <N>`. With that, a `private` visibility may publish; `unknown` still stops.
    - **Unchanged:** `plan-publication`'s republication-only `consent: given-by-caller`.
    - **Relation to the future key:** the per-run autopilot consent coexists with the planned `issueBuddy.privateRepositoryAcknowledgement` key, which governs standalone passes after WP6b (`docs/concept/2026-09-29-issue-buddy.md`).
    - **Forwarding:** issue-buddy forwards the scored control lines into its unattended `plan` envelope. Without these inputs its envelope stays byte-identical.
    - **Skip-reason map**, covering every reason in `issue-buddy-core.mjs`:
      - `open-pull-request`: autopilot runs its own `pr-list` for the issue. It accepts only exactly one same-repository draft PR with a valid `planPrMarker` and a plan-only head, restores `P` from that head, and continues without `plan-review`. The recorded review result is binding: `Approved` with zero open points continues; anything else is a blocker (appendix-only update). Any other match stops.
      - `plan-on-base`: autopilot finds the single open plan on the fetched base whose `**Issue:** #<N>` header matches and continues on the plan-source path. An archived plan, or no single match, stops.
      - `untrusted-author`, `lifecycle-label`, `plan-issue-comment`, `plan-branch-exists`, `closed-without-merge`, `failed-exhausted`, `unchanged-not-ready`, `already-published`, `unchanged-would-publish`: stop with the reason and no PR.
      - **Not in the open listing** (closed or missing issue): stop.
    - **Pass failure:** a pass result of `failed` stops the run with no PR and reports the retained state. Examples: held lock, `NESTED_SPAWN_UNAVAILABLE`, `BRANCH_EXISTS`/`PR_EXISTS`, partial publication states, forge errors.
11. **Plan-file restoration for issue sources.**
    - After confirmed publication, issue-buddy removes its local plan.
    - Before the implementing workflow starts, autopilot restores the plan byte-equal from the verified plan-branch head blob to its `<plan.dir>/` path and verifies the hash that `plan-pr-continuation` checks. A plan that issue-buddy preserved is used after the same check.
    - At run end, after completion or a blocker, autopilot removes the restored untracked copy when it is still byte-equal to the branch blob, so the next issue-buddy pass does not report it as a leftover. Otherwise it reports the copy.
12. **Plan sources enter `plan-review` through a dedicated autopilot file-review entry.**
    - The existing unattended entry accepts only a parent's freshly generated plan. For an existing user plan, autopilot adds an entry in which:
      - autopilot verifies roots, canonical open status and identity (path plus hash) before the call;
      - in-place revision of that one file is allowed;
      - the scored control lines and the entry's own site-table rows apply.
13. **Plan-only draft PR for a blocked plan source.**
    - Autopilot creates a worktree through `worktree-integration`, which brings the worktree record obligation and lifecycle transitions with it.
    - It commits the reviewed plan file through `commit` on `<branchPrefix>/plan/<plan-slug>` and calls `pr` with `Draft: requested`, `Plan marker:` (an existing creation-only input) and `Appendix:`.
    - `plan-publication` and `plan-publication-core.mjs` stay unchanged.
    - On a public repository with a security blocker this path does not run.
14. **`pr` keeps drafts as drafts and appends a deterministic appendix.**
    - **`Keep draft: requested`:** on the plan-draft finish, `pr` runs step 9, updates title and body under the existing hash guard, and skips `pr-mark-ready`. Under autopilot, `plan-pr-continuation` sends it together with `Finalize plan draft:`. On creation, `Draft: requested` applies as today.
    - **Appendix-only update:** a hash-guarded body update for any exact match, which replaces the marker block and changes neither title nor draft state. Autopilot uses it for an issue-source blocker, an existing plan PR whose binding review blocks, and archival outcomes without `Finalize plan draft:`.
    - **`Appendix: <absolute path>`:** `autopilot pr-appendix` renders the appendix deterministically, not the body-draft subagent. Like existing machine lines, it is appended after the step 9 body check, and the helper validates its marker pair. On update, an existing block is replaced, never stacked.
    - **Sanitization in `pr-appendix`:**
      - the plan-publication content scanner (secrets, absolute local paths) runs with unattended strictness;
      - every free-text field (scoring and fit reasons, option labels) goes through the body check's strip and reject rules: issue-closing keywords, `@`-mentions, `Release-As:` and `BREAKING CHANGE:` lines;
      - `<!--` sequences are neutralized, so no fake marker can appear;
      - local-only decisions are left out entirely, with no count and no wording;
      - a blocking finding becomes a blocker, and the appendix is never published unscanned.
    - The body-draft subagent keeps writing "what the PR does". References use the existing inputs: `Refs #<N>` (never a closing keyword) or the plan path.
15. **Architecture fit from repository sources only.**
    - After the implementing workflow has committed, one read-only `deep` leaf scores 1–10 how well the diff fits:
      - accepted ADRs in `docs/adr/`;
      - `docs/developer-guide/architecture.md` when present;
      - `docs/concept/`;
      - other open plans in `<plan.dir>/`.
    - It uses the calibration bands read as fit: 1–2 conflicts with recorded architecture, 9–10 clearly follows it. It returns a score, a one-sentence reason and the sources it used.
    - With no source, the appendix states "Architecture fit: not assessed — no architecture or roadmap sources found".
16. **Automation category, ADRs, amendments and cleanup.**
    - **Catalog:** `build.mjs` gains a new `TOOL_GROUPS` entry, `Automation`, with `when: 'unattended from issue or plan to a draft pull request'`. It sits after "Deliver changes" and contains only `autopilot`. The router catalog, user guide and README show it as its own group.
    - **The category is the authority boundary.** Downstream tools (`plan`, `plan-review`, `build`, `fix`, `refactor`, `docs`, `pr`, `issue-buddy`) stay in their groups. They resolve questions by score, write the machine block, accept `Private publication: autopilot` or `Keep draft:` from autopilot only when an Automation caller supplies the trusted control lines. Called any other way, they behave as before.
    - **Build guard:** only a source of a tool listed in the `Automation` group may emit the scored control lines (`Decision mode: scored`, `Autopilot run:`) or the `Private publication: autopilot` input. Downstream tools may only recognize them. The guard fails the build when a tool outside the group emits them.
    - **One new category ADR,** `docs/adr/automation-tool-category.md`, Accepted. It defines:
      - which tools belong to the category;
      - what they may set aside;
      - the guardrails they must keep: draft PR only, never ready-for-review, never merge, trust model, documented close decisions, blockers in the PR, the public security stop, no AI attribution;
      - why the reviewable draft PR replaces the interactive question as quality control.
    - **Autopilot's mechanics in the ADR:** for autopilot specifically, it also records:
      - the threshold, tie, floor and cap rules;
      - ledger persistence and the plan machine block;
      - pre-commit security classification;
      - the per-run private-publication consent with its accepted residual risk (no forge-side branch confinement or credential isolation on private repositories).
    - **Amendments:** each earlier decision is scoped, not removed. It keeps its text for all other tools and gains one sentence: "Tools of the Automation category are governed by `docs/adr/automation-tool-category.md` instead." The amended sites are:
      - `docs/concept/2026-09-28-scored-decision-options.md`: the non-goals "no persistence of scores" and "no automatic decisions from scores".
      - `docs/concept/2026-09-29-issue-buddy.md`: the non-goal "Issue Buddy never runs apply, build or any implementer", where issue-buddy itself still does not implement, and the private-repository line with its relation to the future acknowledgement key.
      - `docs/adr/plan-only-unattended-publication.md`: the "private repositories are dry-run-only" paragraph, cited by paragraph.
      - `docs/adr/unattended-run-state.md`: its Decision text names scored mode as the one sanctioned exception to "open point or fail-closed abort, never a guess".
      - `plan-review`'s dialog-only score rules and the R-DEC row of `unattended-planning.md`: they gain the exception for an Automation caller.
    - **Same PR:** the category ADR and all amendments are written in work package 1 on the branch of PR #685, so plan, ADR alignment and implementation arrive in one review.
    - **Cleanup:** `effective-flow cleanup` lists autopilot ledgers. It removes one, with a listed reason, only when the run is closed and either produced no PR or its PR is merged or closed, checked with `pr-read`. When the forge is unavailable, the ledger is retained with that reason.

### Alternatives considered

- **Ad-hoc, autopilot-specific exceptions in each ADR.** Rejected: one category ADR with a build guard keeps the boundary explicit and reusable for later Automation tools, and leaves interactive tools untouched.

- **Extend issue-buddy itself to implement.** Rejected. It would turn a bounded, lock-guarded triage pass into an implementer.
- **Plan an issue directly with the unattended `plan` envelope.** Rejected. It duplicates the trust filter, trusted-text materialization and publication, and the user asked for issue-buddy.
- **Let the orchestrator score inline.** Rejected: the context that wants to finish would grade its own options.
- **Tiebreak by option order, or a merged re-score constellation.** Rejected in the batch round.
- **Widen the unattended write boundary, or relay records through issue-buddy's `pass-report`.** Rejected in favour of the plan machine block. issue-buddy's parent still reads no model prose.
- **Reuse `consent: given-by-caller`.** Rejected: that consent is republication-only.
- **An autopilot mode in `plan-publication`.** Rejected: its core requires an issue, unattended run state and GitHub.
- **Re-review an existing plan PR.** Rejected: an in-place revision forces the non-interactive Plan differs stop.
- **Feature-only, or always `build`.** Rejected in favour of routing by the recommended workflow.
- **Push committed work on a blocker.** Rejected: implementing workflows commit only at handback, and pushing unvalidated work contradicts their gates.
- **Tracker goal epics as fit sources, or a behavioural eval suite in the first PR.** Both deferred.

## Affected files

| File                                                                                                                                                                                                                                                                                                        | Description                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/autopilot.md`                                                                                                                                                                                                                                                                                    | New exposed tool: arguments, Stage A/B classification, preflight, run-id, routing, chaining, plan restoration and removal, skip-reason map, plan-only draft path, blockers, completion report. Frontmatter `description`, `catalogHint`, `contextBudget`.      |
| `src/shared/scored-decisions.md`                                                                                                                                                                                                                                                                            | New owning fragment: question-site table with anchors, scoring and tie leaves (spawn sites), fixed answers, floor, cap, failure handling, machine-block format, ledger calls, appendix contract.                                                               |
| `src/scripts/autopilot.mjs`, `src/scripts/autopilot-core.mjs`                                                                                                                                                                                                                                               | New JSON CLI and core (decision 7 operations).                                                                                                                                                                                                                 |
| `build.mjs`                                                                                                                                                                                                                                                                                                 | `RUNTIME_SCRIPT_FILES`, new `TOOL_GROUPS` entry "Automation", the Automation emission guard, `WORKFLOW_EDGES` (`autopilot` → `issue-buddy`, `plan-review`, `build`, `fix`, `refactor`, `docs`, `commit`, `pr`).                                                |
| `scripts/distribution-smoke.mjs`                                                                                                                                                                                                                                                                            | Ship-list entry for the new helper.                                                                                                                                                                                                                            |
| `src/shared/unattended-planning.md`                                                                                                                                                                                                                                                                         | Optional scored control lines; machine-block writes; autopilot file-review entry; P-JDG and R-DEC scored-mode rows; pointer to `scored-decisions`.                                                                                                             |
| `src/tools/plan.md`, `src/tools/plan-review.md`                                                                                                                                                                                                                                                             | Recognize the control lines; scored resolution; dialog-only exception; mandatory deep review in unattended runs (pinned by test).                                                                                                                              |
| `src/tools/build.md`, `src/tools/fix.md`, `src/tools/refactor.md`, `src/tools/docs.md`, `src/shared/build-run-contract.md`, `src/shared/build-delegated-run.md`, `src/shared/apply-clarity-gate.md`                                                                                                         | Accept the autopilot envelope; route reachable asks to `scored-decisions`; honour the explicit `pr` + draft directive; pre-commit security classification; count "Decided by score" records as decisions in the clarity gate; pass references and `Appendix:`. |
| `src/shared/worktree-integration.md`, `src/shared/plan-pr-continuation.md`, `src/shared/pr-review-integration.md`, `src/shared/security-disclosure-gate.md`, `src/shared/pilot-measurement-workflow.md`, `src/shared/project-adr-convention.md`, `src/shared/deliver-committed-range.md`                    | Scored-mode pointers at their question sites. `plan-pr-continuation` sends `Keep draft: requested` under autopilot. `pr-review-integration` turns review publication off. `security-disclosure-gate` exposes its classification for pre-commit use.            |
| `src/tools/pr.md`                                                                                                                                                                                                                                                                                           | `Keep draft: requested`, appendix-only update, `Appendix:` after the body check, marker replace-on-update.                                                                                                                                                     |
| `src/tools/issue-buddy.md`, `src/scripts/issue-buddy-core.mjs`                                                                                                                                                                                                                                              | `--issue <N>` (collection and recovery), `Private publication: autopilot` with `consent-check`, forwarding of the control lines.                                                                                                                               |
| `src/shared/next-steps.md`                                                                                                                                                                                                                                                                                  | Rows for autopilot outcomes: draft PR → `merge-gate <PR>`; blocker → the matching repair tool; plan-only draft → the recommended implementing workflow for the plan.                                                                                           |
| `src/shared/session-title.md`, `src/shared/model-tiers.md`, `src/scripts/config-resolve-core.mjs`                                                                                                                                                                                                           | Work-subject listing, spawn-site rows (scoring, tie re-score, fit), successor row.                                                                                                                                                                             |
| `src/tools/cleanup.md` (and its core when helper-backed)                                                                                                                                                                                                                                                    | Ledger listing and removal with `pr-read`.                                                                                                                                                                                                                     |
| `docs/adr/automation-tool-category.md`                                                                                                                                                                                                                                                                      | New category ADR (decision 16).                                                                                                                                                                                                                                |
| `docs/adr/unattended-run-state.md`, `docs/adr/plan-only-unattended-publication.md`, `docs/concept/2026-09-28-scored-decision-options.md`, `docs/concept/2026-09-29-issue-buddy.md`                                                                                                                          | Amendments (decision 16).                                                                                                                                                                                                                                      |
| new `docs/user-guide/tools-automation.md`, `docs/user-guide/tool-flow.md`, `docs/user-guide/README.md`, `README.md.src` (+ regenerated `README.md`)                                                                                                                                                         | User documentation: trust model, checkout requirement, routing, end states and exceptions, thresholds, review-publication override, PR appendix.                                                                                                               |
| `docs/developer-guide/build-system.md`                                                                                                                                                                                                                                                                      | New helper and spawn sites.                                                                                                                                                                                                                                    |
| `test/autopilot-core.test.mjs`                                                                                                                                                                                                                                                                              | New unit tests for the helper.                                                                                                                                                                                                                                 |
| `test/*-contract.test.mjs` enumerating tools (`execution-profile-contract`, `delegation-mandate-contract`, `model-tiers-contract`, `workflow-contracts`, `setup-status-core`, `helper-call-shape-contract`, `subagent-progress-contract`, `unattended-planning-contract`), issue-buddy tests, cleanup tests | Add `autopilot`; new invariants (acceptance criteria).                                                                                                                                                                                                         |

## Implementation details

### Approach

Deliver in four reviewable work packages on one branch. Each leaves the suite green.

1. **Decision core.**
   - `autopilot-core.mjs` and its CLI: the decision 7 operations, sanitization and scan, with unit tests.
   - `scored-decisions.md` with the complete question-site table.
   - The category ADR, all amendments, the new `TOOL_GROUPS` entry and the emission guard with its test.
   - No tool consumes the core yet.
2. **Downstream adoption.**
   - The control lines, machine block and file-review entry in `unattended-planning`, `plan` and `plan-review`.
   - Scored pointers, the explicit completion directive and pre-commit security classification in `build`, `fix`, `refactor`, `docs` and the listed fragments.
   - `Keep draft:`, the appendix-only update and `Appendix:` in `pr`, plus the `plan-pr-continuation` change.
3. **issue-buddy selector and consent.**
   - `--issue <N>`, `Private publication: autopilot`, control-line forwarding, with core and contract tests.
4. **The tool, cleanup and documentation.**
   - `src/tools/autopilot.md`, the registrations, cleanup, user and developer docs, README.
   - Measure `contextBudget` from `node build.mjs`.
   - Then the manual smoke runs.

### Autopilot run sequence

1. **Parse and classify.**
   - Accept exactly one argument.
   - Stage A `plan` → plan source. Stage A `issue-reference` → Stage B, where only `plain-issue` is accepted. Epics, findings and containers are a usage error naming `apply`.
   - Anything else is a usage error.
2. **Preflight** (decision 2), then `autopilot run-init`.
3. **Plan stage.**
   - **Issue source:**
     - Run issue-buddy `--issue <N> --publish` with the scored control lines, plus `Private publication: autopilot` on a private repository.
     - Map its result per decision 10.
     - Restore the plan (decision 11).
     - Extract and persist its decision block.
   - **Plan source:**
     - Run the autopilot file-review entry of `plan-review`.
     - Extract and persist its decision block.
   - The plan must end `Approved` with zero open points. Otherwise there is a blocker: an appendix-only update on an issue source, the plan-only draft PR (decision 13) on a plan source.
4. **Implementation stage.**
   - Run the recommended workflow on the plan file with the autopilot envelope and the explicit `pr` + `Draft: requested` directive.
   - On the issue path, `plan-pr-continuation` continues on the plan PR head. On the plan path, the workflow creates its worktree and branch.
5. **Architecture fit.** Once the workflow reports a committed implementation, the fit leaf runs and `fit-record` stores the result.
6. **Delivery.**
   - `autopilot pr-appendix` renders, sanitizes and scans the appendix.
   - The workflow's delivery calls `pr` with the appendix and the reference:
     - on creation, with `Draft: requested`;
     - on the plan-PR path, with `Finalize plan draft:` plus `Keep draft: requested`.
7. **Close.**
   - Remove the restored plan copy (decision 11).
   - Run `run-close`.
   - Emit the completion report:
     - the PR URL, or the reason there is none;
     - counts of silent, documented and tie-resolved decisions;
     - blockers and the retained worktree;
     - the fit score.
   - Emit the next-step block.

### Scored decision procedure (fragment content, summarized)

1. **Look up the row.** A `scored` row continues below. A fixed-answer row applies its answer. A blocker row, or a missing row, records a blocker.
2. **Check the budget.** If it is exhausted, record a blocker.
3. **Score.** Spawn the scoring leaf, then classify with `decision-classify`. On a leaf failure, retry once, then record a blocker.
4. **Break a tie.** On `tie`, spawn the re-score leaf with only the tied options and classify the re-scores. On a duplicate, retry once, then record a blocker.
5. **Check the floor.** If the winning score is ≤ 2, or the winner is a stop option, record a blocker.
6. **Apply.** Apply the chosen option exactly as if the user had selected it, at the same site.
7. **Record.**
   - In a planning sub-run, write the record into the plan's machine block.
   - In the same session, call `decision-record`.
   - A `documented` decision also goes into the site's own artifact, unless it is local-only.

### PR appendix (rendered by `pr-appendix`, `language.forge`)

- **Source:** `Refs #<N>` or the plan path. On an issue source, also the plan PR it continued.
- **Close decisions**, for each non-local `documented` decision:
  - the question;
  - the chosen option with score and reason;
  - each alternative within 3 points, with score and reason;
  - "tie re-scored" with both rounds' scores where applicable.
- **Automatic decisions:** a count of non-local `silent` decisions.
- **Blockers:** shown only when there are any. A security blocker on a private repository uses neutral wording.
- **Architecture fit:** `n/10 — <reason>` with the sources used, or the not-assessed line.
- Leading and trailing machine marker lines delimit the block. All free text is sanitized and scanned.

### Edge cases

- **Duplicate scores in a first-round set** are a valid tie. Duplicates in a tie re-score are an error: retry once, then blocker.
- **A tie below a unique winner** does not affect the choice. Both tied options are listed as close alternatives when they are within 3 points.
- **Only one scorable option:** it is chosen when it scores ≥ 3 (`silent`). A score of 2 or lower is a blocker.
- **Invoked from a linked worktree with an issue source,** or the primary checkout is off the base tip: preflight stop, naming the cause.
- **Plan PR already open:** autopilot continues only on exactly one matching plan-only draft plan PR, and the review result is binding. Any other match stops the run.
- **Plan already on base:** continue on the plan-source path with the single matching open plan. An archived plan or an ambiguous match stops the run.
- **A plan source recommends a workflow autopilot cannot route:** usage error at preflight.
- **issue-buddy preserved the plan:** autopilot uses it after the hash check.
- **Run interrupted:** ledger, branch and worktree remain. A rerun starts a new run-id and continues only through worktree adoption. The appendix block is replaced, not stacked.
- **Security finding:** classified before commit. On a public repository the run stops with no push or PR. On a private one it is a neutral blocker. The ledger never holds the content.
- **Appendix scan or sanitization finding:** blocker; the appendix is not published.
- **Hidden mode:** preflight stop with a pointer that hidden mode is not supported yet.
- **Architecture sources partly present:** score from what exists and list only those sources.

## Acceptance criteria

- [ ] `effective-flow autopilot` is listed in the router catalog under the new "Automation" group, and `node build.mjs` builds all three targets with a measured `contextBudget`.
- [ ] `autopilot-core` unit tests cover:
  - lead 4 → `silent`;
  - lead 3 and lead 1 → `documented`, with the alternatives within 3 points;
  - lead 0 → `tie`;
  - distinct tie re-scores → the highest wins and the result is `documented`;
  - duplicate tie re-scores → rejected;
  - out-of-range, non-integer, missing or escape-option scores → rejected;
  - a winner ≤ 2, first round or re-score → blocker;
  - exhausted budget → blocker;
  - `decision-extract` → valid, malformed and absent machine blocks;
  - `consent-check` → open ledger, wrong run-id, wrong source;
  - appendix rendering for documented, silent, blocker and fit or not-assessed inputs, with marker lines;
  - sanitization of closing keywords, `@`-mentions, `Release-As:`/`BREAKING CHANGE:` lines and `<!--` sequences;
  - a secret or absolute local path → blocked;
  - local-only decisions and security blockers → absent from the appendix, stored only as report path and finding ID.
- [ ] A contract test walks the built include closure of `plan`, `plan-review`, `build`, `fix`, `refactor`, `docs` and `pr`. It fails when any `ask` fence has no row in the question-site table, or when a row's Anchor substring is missing from its source. The fragment states that prose questions are covered only through their hand-listed anchors.
- [ ] Contract tests prove:
  - envelopes emitted by issue-buddy and `plan` without autopilot inputs are byte-identical to `origin/develop`;
  - `Decision mode: scored` is accepted only from the trusted envelope;
  - the fixed-answer rows hold (approval, explicit `pr` + draft directive overriding `delivery.completion`, review publication off despite `always`, keep-local disclosure, escape options never chosen);
  - P-JDG and the clarity gate become blockers under scored mode;
  - the deep review is mandatory in unattended runs;
  - under scored mode, each implementing workflow classifies residual findings before its handback commit, and a local-only finding stops it with no commit or push.
- [ ] issue-buddy tests cover:
  - `--issue <N>` collects and recovers only that issue;
  - an untrusted author is skipped;
  - a missing or closed issue yields the stop result;
  - `private` publishes only with `Private publication: autopilot` and a passing `consent-check`;
  - that input is rejected without `--issue`;
  - `unknown` stops;
  - the control lines are forwarded only when supplied.
- [ ] `pr` contract tests cover:
  - `Draft: requested` on create;
  - `Finalize plan draft:` plus `Keep draft: requested` updates title and body without `pr-mark-ready`;
  - the appendix-only update changes neither title nor draft state;
  - `Appendix:` is appended after the body check and replaces an existing marker block on update.
- [ ] Cleanup tests cover ledger removal for closed runs whose PR is merged or closed, and retention when the forge is unavailable.
- [ ] A build-guard test proves that a fixture tool outside the `Automation` group that emits `Decision mode: scored`, `Autopilot run:` or `Private publication: autopilot` fails the build. `autopilot` passes.
- [ ] `docs/adr/automation-tool-category.md` exists with status Accepted. Every amended ADR and concept keeps its rule for all other tools and points to the category ADR for Automation tools (decision 16). The user guide documents the Automation category, trust model, checkout requirement, routing, end states with exceptions, thresholds, review-publication override and PR appendix.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- [ ] A manual pre-merge smoke run passes with the locally linked build (`./local-link.sh`):
  - a trusted issue source in a private test repository, which exercises the private consent;
  - a plan source in a public test repository.

  Each ends in a draft PR with the appendix sections, and the transcripts show no question to the user. The PR records content-scanned excerpts only, with no session links.

- [ ] The completion condition is all CI steps green plus both smoke runs passing.

## Validation plan

- Unit tests: `node --test test/autopilot-core.test.mjs`, the extended issue-buddy and cleanup tests, and the extended contract tests.
- Full CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- The manual smoke runs from the acceptance criteria, before merge.
- Behavioural eval evidence debt is reported, not re-recorded, for every affected suite:
  - `merge-gate` (its load set includes SKILL.md and next-steps);
  - `next-steps`;
  - `build-context`;
  - any suite loading the changed tools or fragments, as `pnpm eval <tool> verify` reports.

## Assumptions and open points

- "More than 3" is read strictly: a lead of 4 or more is silent, and a lead of 3 is documented (integer scores).
- The PR only counts silent decisions; the ledger keeps their detail.
- Issue sources use `Refs #<N>`, not a closing keyword, because the PR is a draft for human review.
- A winning score ≤ 2 is a blocker. The user specified no floor; this keeps "not recommended" options from being executed.
- The cap of 20 scored decisions per run is a starting value recorded in the ADR, not a configuration key.
- Forgejo and external trackers are out of scope for issue sources, because issue-buddy is GitHub-only today.
- Implementing workflows run through their current inline routes, so their asks resolve in the same session.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |        10 |    4 |
| Security        |        1 |         7 |    3 |
| Data protection |        0 |         3 |    2 |
| Error cases     |        0 |         8 |    2 |
| Testability     |        0 |         4 |    4 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         1 |    5 |

The counts cover three judgment rounds: 23 findings in the internal review, 10 in the ladder re-review, and 21 in the deep review. A finding that spans two areas is counted in both.

### Findings

- **User revision (2026-11-17):** the authority change is scoped to a new catalog category, "Automation". One category ADR, a build guard, and aligned ADRs and concepts in the same PR. Incorporated in the Requirement and decision 16, plus Affected files, Approach and acceptance criteria. This is a scope-narrowing change with no new open point.

- **Internal review (1 Critical, 15 Important, 7 Note):** all incorporated or decided in the batch round. The main changes were the question-site table, the draft-preserving finish, plan restoration, the post-check appendix, the dedicated private consent, the file-review entry, the skip-reason map, the tie rule, the security-blocker split, the pre-merge smoke, repo-only fit sources and the checkout rules.
- **Ladder re-review (7 Important/Note incorporated, 3 decided in the deep review):** incorporated the appendix-only update, visibility for every source, row anchors for prose questions, accurate preflight checks, consent-origin validation, the cleanup criterion and context-exhaustion recovery. The deep review then decided the three remaining points: the plan-only draft path (decision 13), the machine block (decision 7) and the binding plan-PR review (decision 10).
- **Deep review:**
  - **Critical, Security:** no classification ran before push, so a public security blocker could still be published. Incorporated as pre-commit classification under scored mode (decision 8), plus a contract test.
  - **Important, Architecture:** non-Feature plans had no outcome. Decided: route by the recommended workflow (decision 1).
  - **Important, incorporated:**
    - appendix sanitization and local-only exclusion (decision 14);
    - `plan-on-base` resolution and the complete skip map (decision 10);
    - clarity-gate and P-JDG rows (decision 4);
    - scoring-leaf failure handling (decision 6);
    - issue-buddy pass failures as a confirmed no-PR exception (User decisions);
    - issue-source checkout preconditions in preflight (decision 2);
    - concept and ADR amendments with the future acknowledgement key (decisions 10, 16);
    - no push of implementation on a blocker (decision 9).
  - **Note, incorporated:**
    - probe placement (decision 2);
    - explicit completion directive (decision 5);
    - dialog-only rule amendments (decision 16);
    - budget control line (decision 6);
    - removal of the restored plan (decision 11);
    - scanned smoke excerpts and repository visibility (acceptance criteria);
    - `consent-check` source binding (decision 10);
    - wording, tie brief, floor scope and stop options (decisions 4, 6);
    - cleanup `pr-read` (decision 16).

## Open points

- No open points.

## Build completion

**Date:** 2026-11-17
**Workflow:** `effective-flow build`, continued on the plan pull request #685.

### Requirement

Implemented as planned: `effective-flow autopilot <issue|plan-file>` drives one trusted issue or local plan to a draft pull request without asking the user, resolving every reachable question through scored decisions, and opens the new catalog category "Automation".

### Architecture decisions

All sixteen decisions above were implemented. Deviations and refinements made during implementation and review:

- **Emission rule (decision 16):** a source emits a control line when a line, after indentation, blockquote markers and one list marker, starts with its bare text, or consists only of one code span holding it. Recognition in downstream tools uses inline code inside prose; forwarders copy received lines. Fragments count as Automation-only when only Automation tools reach them, through include fences or prose `shared/<name>.md` pointers.
- **Recognition (decisions 3, 16):** downstream tools act on the control lines only when they sit in the trusted control region and a literal `autopilot.mjs run-check` confirms an open ledger; a partial or misplaced set stops with `RUN_NOT_OPEN` before any write.
- **Appendix-only update on an issue-source blocker (decision 14):** autopilot performs the hash-guarded body update itself (`pr-read`, `appendix-merge`, `pr-update-body`), re-checking open, draft, same repository and plan marker, instead of calling `pr`, so `pr` can never push retained implementation work. Recorded in the category ADR.
- **Issue classification (decisions 1, 10):** Stage B runs in a read-only leaf that returns only the subtype, so the orchestrator never holds untrusted issue text before Issue Buddy's trust filter.
- **Blocked plan source (decision 13):** the blockers are written into a marker-delimited `### Autopilot blockers` section of the plan before the commit, so the plan-only draft pull request always has a change; a rerun refreshes the existing verified draft instead of opening a second one.
- **Architecture fit (decision 15):** a failed fit leaf after one retry records `fit-record` `unavailable`; the appendix then states that scoring was unavailable.
- **Fixed rows:** S-INT (routed intent), S-CTYP (routed type), and S-PPR/S-PDF while a verified plan pull request is held (blocker) are fixed instead of scored.
- **Cleanup:** ledger listing and pruning are helper operations (`ledger-list`, `ledger-prune`) behind a lazy cleanup fragment; a run closed with its plan pull request still open (`plan-pull-request-unchanged`) is retained until that pull request is merged or closed.

### Affected files

As listed under "Affected files", plus the new lazy fragments `src/shared/autopilot-issue-source.md`, `src/shared/autopilot-blockers.md`, `src/shared/issue-buddy-autopilot.md`, `src/shared/pr-automation-lines.md` and `src/shared/cleanup-autopilot-ledgers.md`, the user-guide pages `tools-understand.md`, `tools-deliver.md` and `tools-setup.md`, and `test/automation-emission-guard.test.mjs`. `test/merge-gate-eval-round.test.mjs` received a longer marker wait (see Test results).

### Implementation details

Delivered in the four planned work packages: decision core (helper with eleven operations plus `run-check`, `ledger-list`, `ledger-prune`, `appendix-merge`; `scored-decisions.md`; category ADR and amendments; emission guard), downstream adoption, Issue Buddy `--issue <N>` with `ISSUE_NOT_OPEN` and the per-run private-publication consent, and the tool with its registrations, cleanup and documentation.

### Test results

- Full CI order on the final state: `pnpm agent:check` passed, `node build.mjs` passed for all three targets, `pnpm test:distribution` passed, `pnpm test` 5951 tests with 5889 passed, 61 skipped and 1 failure.
- The one failure was `test/merge-gate-eval-round.test.mjs` "one immutable round provisions, seals, retries, and publishes isolated slots", a 10-second marker wait after two full builds that expired under full-suite load (about 7 seconds when the file runs alone; the file passes alone on the base and on this branch). This change adds about 0.3 seconds to that window. The wait was raised to 30 seconds, the value the same test already uses for an earlier marker, and the file then passed under concurrent load.
- Behavioural eval evidence: `pnpm eval <suite> verify` reports no integrity blockers; evidence debt (stale or absent evidence) is reported for `merge-gate`, `iterate`, `next-steps`, `build-context` and `focus`, not re-recorded.
- **Not yet done:** the two manual pre-merge smoke runs from the acceptance criteria (a trusted issue source in a private test repository and a plan source in a public test repository with `./local-link.sh`). The completion condition stays open until both pass.

## Review findings

**Date:** 2026-11-17
**Reviewer:** Node.js reviewer, generic product reviewer (reduced depth for Markdown prompt sources)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    42 |
| Open / Not implemented |     0 |

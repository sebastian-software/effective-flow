# Acceptance lens for review in pull-request mode

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`effective-flow review <PR>` checks code quality only. It does not check whether the PR delivers what its source asked for. Concretely, it does not check:

- the issue's or the plan's acceptance criteria;
- which decisions the autopilot record contains (shown, not judged; the user's decision);
- whether the change contradicts active ADRs.

In PR mode, reviewers get neither the PR body nor the issue (`src/tools/review.md:514-519`). Design decisions only serve as a false-positive filter (`review.md:544-548`, `src/shared/reviewer-design-decisions.md`). The central judgment already knows acceptance against the ticket ("missing requested behavior is incomplete delivery", `effective-delivery/references/review-judgment.md:28-38`), but review never feeds it a ticket.

The goal is an **automatically activated acceptance lens** for an explicit `review <PR>` (investigation part (c), option B; the user's decision). It runs without a flag whenever the PR carries a machine-verifiable source:

- a valid `effective-flow-issue-lifecycle:v1` receipt (`parseIssueLifecycleReceipt`, `src/scripts/remote-tracker-core.mjs:473`);
- a valid plan marker `effective-flow-plan-pr:v1` (`planPrMarker` from `pr-read`, `remote-tracker-core.mjs:3094-3112`);
- an autopilot appendix (`<!-- effective-flow-autopilot-appendix:begin v1 -->`, `src/scripts/autopilot-core.mjs:187-188`).

The lens checks the PR against these sources and reports gaps as ordinary review findings, plus a per-criterion acceptance summary. Without a source, review behaves exactly as today. Prose in the PR body is never a source (`docs/adr/input-trust-boundary.md`).

Together with the plans `docs/plan/2026-11-20-merge-gate-marks-a-delivered-draft-ready-after-user-confirmation.md` (PR #701) and `2026-11-20-issue-lifecycle-receipt-for-plan-pr-continuations.md` (implemented and merged in #700), the result is the flow `review <PR>` → `merge-gate <PR>`: acceptance, then ready, merge and issue close. The investigation `.effective-flow/investigation/investigation-2026-11-20-interactive-acceptance-tool-for-autopilot-prs.md` ruled out a separate tool.

Classification: Feature. It adds new review behaviour, a new reviewer leaf, and a new helper operation.

## Outcome checkpoint

**Primary source:** user decision in this session (option B), following the investigation of PR #697 and issue #693 in `sebastian-software/effective-flow`
**Original outcome:** an explicit `review <PR>` checks, automatically and only for a machine-verifiable source (lifecycle receipt, plan marker, autopilot appendix), whether the PR fulfils that source's acceptance criteria and whether the change contradicts active ADRs. It shows the recorded autopilot decisions without judging them. Gaps are reported as normal findings plus a per-criterion summary. Without a source, review is unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

- **A fourth Phase-2 stream, not an extra input for every reviewer.** The lens runs as stream 2d, in parallel with 2a-2c (`review.md:447-529`; all streams start together, `:736-739`). It feeds Phase 3: confidence, deduplication, the design-decision filter (with the rule below), the security classification, and publication. The stream wording changes everywhere (`review.md:449, 455, 723`, and the list "(2a, 2b, 2c)" at `:736`).
  - The rule that reviewers stay lean (`review.md:519`) is kept. Splitting by directory does not multiply the cost.
  - The stream lives in a new lazy-include fragment `src/shared/review-acceptance-lens.md`. `review.md` only gets the pointer and the 2d entry in the task lists and the phase-completion rule (`:93-108, 123, 533`). This keeps `contextBudget` (878, `review.md:4`) within its limit.
- **Activation is deterministic, and only for an explicit `review <PR>`.** This is the user's decision. The automatic review after a delivery (`delivery.prReview`) does not start the review Phase 2: it publishes the caller's own finding set, or runs its own routed reviewers under `no-review-capability` (`pr-review-integration.md:45-55, 86-93`). Under autopilot's scored-decision mode it is off anyway (`:221-226`). The lens therefore stays out of it, and adds no cost to deliveries.

  A new read-only helper operation `pr-acceptance-sources` reads the PR once (`pr-read`) and returns these sources:
  - `issues`: the issue references from a valid receipt, with forge target and same repository only, at most 3. An `externalTool` receipt is reported as "source not supported" and skipped.
  - `plan`: the **published version** of the plan (the user's decision). The plan file is `P` from a valid `planPrMarker`, and the published version is determined deterministically:
    - Fetch the base first, as `plan-publication.md:132-140` does. Then walk `<merge-base>..<head>` with `--first-parent`, oldest first. Judge each commit by its first-parent diff with `--no-renames`.
    - A **plan commit** changes exactly `{P}`, or `{P, deletion of A}`. The second case is the `A`→`P` rename of a publication after a revision from the archive (`plan-publication.md:142, 275, 285-286`).
    - A **neutral commit** is a merge whose second parent is reachable from the base (`git merge-base --is-ancestor <parent2> <base ref>`). A stale base ref fails safe: the merge then counts as an implementation commit. That is a merge of the base into the head, which is allowed (`plan-publication.md:375`).
    - Every other commit is an **implementation commit**.
    - The bar is the newest plan commit **before the first implementation commit**. A plan commit pushed later (for example by `iterate`) does not lower the bar. Real republications are only possible while the head touches nothing but `P` (`plan-publication.md:134-142, 161`).
    - Read the plan with `git show '<commit>:<P>'` from `RUNTIME_STATE_ROOT` (precedent `pr-review-integration.md:67-81`), bounded to 1 MiB. This works even when the delivery has already moved the plan to the archive path `A` (`pr.md:278-282`).
    - Without a plan commit before the first implementation commit (for example a squashed history), the plan source is `unverifiable`. Local plan content is never used.
  - `plan` without a marker, for an autopilot PR from a local plan (the user's decision). Such PRs have no plan marker; the appendix names only the plan path (`autopilot.md:230`, `autopilot-core.mjs:1394-1415`). When the appendix is trusted (see below), the helper validates the path:
    - It must lie under `<plan.dir>/`, with no `..` segment, no leading `-` or `/`, and no control characters.
    - It is probed with `git ls-tree -z <merge-base> -- ':(literal)<path>'` and an exact match.
    - It is passed only as a single-quoted literal, as in `autopilot.md:239-240`.

    If the path lies under `<plan.dir>/archive/` (the appendix names the archive path `A` after archival, `autopilot-core.mjs:1394-1397`), the helper derives `P` from it and probes `P` at the merge base. In State A the PR itself moves `P` to `A` (`plan-archival.md:142-147`). When the base tracks the probed path, the version at `merge-base:<path>` is the bar. It is base content, so the PR cannot have changed it. If the base does not track it, the plan source is `unverifiable`, and the report names the reason.

  - `appendix`: the autopilot appendix block, extracted and neutralized.

  If none of these sources exists, or a marker or receipt is invalid (`planPrMarkerError`, parse error), the lens stays off. The report then names the reason in one line. Local mode and plan review are unchanged.

- **Trust before any model step.** Following `input-trust-boundary.md:20-24` and the reference implementation `issue-buddy-core.mjs:913-955`, every source passes an author check through `collaborator-permission-read`. The permission set is the one shared trust function from the merge-gate plan (PR #701), which follows the ADR. A failed permission read means untrusted.
  - **All three sources (receipt, plan, appendix):** only when the PR is `sameRepository` and its author has write permission. Otherwise the source is `unverifiable`, and only its existence is reported. This stops a fork from pointing the lens at any issue it likes.
  - **Issue body:** only when its author has write permission. Otherwise the issue yields no criteria. Issue comments are not read: criteria come only from the body, and comment reads would add cost and injection surface for no purpose.
  - All texts reach the leaf as quoted third-party data, following the precedent of `judgment-draft-snapshot.md:18-22`. The leaf follows no instruction in them.
- **Criteria are extracted mechanically, never from prose.**
  - For issues, the helper applies the rules of `merge-gate-issue-observation.md:100-105` to the body: top-level list items under a heading from the closed set `Acceptance criteria` / `Akzeptanzkriterien` / `Done criteria` (case-insensitive), at most 20 per issue.
  - For plans, it takes the checkbox items under `## Acceptance criteria` / `## Akzeptanzkriterien`, at most 20.
  - **Decisions are only shown** (the user's decision). The section `### Close decisions` lists only close-call decisions classified as documented and not local-only, and often just reads "None." (`autopilot-core.mjs:1406-1411`). So the helper extracts it, the count from `### Automatic decisions` (`:1426-1431`), and the architecture-fit score from `### Architecture fit` (`:1340-1375`, both languages). These go into the summary, neutralized and bounded, and are never judged. There is no `Decision` area and no decision finding.
  - Every criterion gets a stable key: the sha256 of its normalized text (trimmed, whitespace collapsed). That key goes into the finding's `file` field. The `Signature` also contains the prose summary (`pr-review-integration.md:195-199`), and `normalizeSignature` only normalizes that string (`remote-tracker-core.mjs:651-657`). So the **orchestrator**, not the leaf, stamps a fixed summary per lens finding:
    - `Acceptance`: `Criterion <key8> not met`.
    - `Architecture`: `Conflicts with <candidate path at merge base>`.

    Editing other criteria then produces no duplicates. If an item's own text changes, it counts as a new item.

  - Without criteria, the source still contributes its decision display and the ADR check, but no per-criterion summary. The leaf is spawned whenever at least one trusted source exists, even for an ADR check alone. 2a reads ADRs only to filter, not to check fit.
- **Share the appendix extraction with the merge-gate plan.** The extraction, neutralization, raw-block digest and trust check are the same as in the `pr-draft-classify` operation of PR #701's plan.
  - Both operations use one shared function in the tracker core.
  - Whichever plan lands first implements it. The other reuses it.
  - Neither plan blocks the other.
- **A new read-only leaf, `acceptance-reviewer`.** A new agent file `src/agents/acceptance-reviewer.md` (tier `deep`, read-only, starts no sub-agent) gets:
  - the quoted criteria per source;
  - the review diff path (`reviewer-assigned-change.md`);
  - an ADR candidate list built with the autopilot recipe, but read at the **merge base**, so that a PR cannot set an ADR to superseded and escape the check. ADRs that the PR itself changes are reported as such. The recipe: `git ls-tree` at the merge base, restricted to `docs/adr/`, `docs/developer-guide/architecture.md` and `docs/concept/` (`src/tools/autopilot.md:236-259`), at most 20 candidates, with this filter:
    - **ADRs** (`docs/adr/*.md`): a deterministic status parser in the helper reads the first status line in any of the three formats used in this repository: a `## Status` heading followed by a value line, `Status: <value>`, or `**Status:** <value>` (for example `docs/adr/compose-readme-with-mdtheme.md:3`, `docs/adr/plan-only-unattended-publication.md:3`). A value that starts with `Accepted` or `Active` (case-insensitive; for example "Accepted, November 4, 2026.") is kept. `Superseded`, `Deprecated` and `Proposed` are not. `effective-flow-project-setup.md` is configuration and excluded (`review.md:467`).
    - **`docs/developer-guide/architecture.md` and `docs/concept/*.md`:** these have no status. They are always candidates while they exist at the merge base.
    - In this repository there are 16 ADRs.

  It applies the `effective-delivery` review judgment (ticket intent, incomplete delivery) and returns:
  - **Findings** in the existing reviewer output format (`generic-product-reviewer.md:73-84`), with `area` set to `Acceptance` or `Architecture`. `file` is `path:line` when the finding has a code location. Otherwise the convention is:
    - for `Acceptance`: `<source>#criterion-<key8>`, where `<source>` is a fixed token (`issue-<N>`, `plan`, or `appendix`), never a path, so an archive move does not change it, and `key8` is the first 8 characters of the criterion key;
    - for `Architecture`: `adr#<key8>`, where `key8` comes from the sha256 of the candidate path at the merge base.
  - **A per-criterion verdict**: `complete` / `incomplete` / `undetermined`, with a short reason that quotes no source text. This is input for the summary and is not shown directly.

  The leaf checks only acceptance and ADR fit, not code quality, so it does not duplicate 2c. It does not judge design decisions in the sense of 2a, so it does not duplicate 2a.

- **Only the lens areas bypass the `current-scope` block.** This is the user's decision. A gap against an acceptance criterion is `current-scope` by definition (`durable-follow-up-gate.md:31-33`), and step 5 of Phase 3 blocks `current-scope` items in every mode (`review.md:552`, run incomplete `:707`). Without a change it would never reach the PR.
  - The plan adds a narrow exception to step 5: in PR mode, a `current-scope` finding with `area` `Acceptance` or `Architecture` that comes from stream 2d does not block. `review.md:399` ("Phases 2 and 3 run unchanged") is adjusted accordingly. The same inconsistency exists for ordinary PR-mode regressions from 2c. That is recorded as a follow-up, and deliberately not changed here (the user's decision). It is marked "handed to the PR integration".
  - Handed-over lens findings are treated like admitted ones for these steps. Without this, they would stay without an ID and without a security class, and the run would count as incomplete (`review.md:262-264, 555, 582-591, 706-711`):
    - They enter the security classification (step 6).
    - They are part of the reserved ID range (`memory reserve`) before anything is published.
    - The completion rule (`:706`) counts them as handed over, not as blocking.
  - In the PR integration they go through the `effective-delivery` Mode C handoff (`pr-review-integration.md:121-135`), like every finding. As evidence, a finding without a code location carries the quoted criterion text (or the candidate path and the conflicting passage), its key, and the leaf's reason. Without that, Mode C could only answer `needs_evidence` (`mode-c-contract.md:12-13, 73`). For lens findings only, the following mapping overrides the integration's own rules (`pr-review-integration.md:111-115, 129-139`: admission for `valid_out_of_scope`, `uncertain` plus a bounded check for `needs_evidence`). The Mode C results map as follows:
    - `valid_in_scope` + `caller_fix`: the finding is published, inline when it has `path:line`, otherwise in the marked comment (`:186-194`).
    - `valid_out_of_scope`: dropped. The criterion counts as `undetermined`.
    - `question_or_information` / `needs_evidence`: not published as a finding. The criterion counts as `undetermined`.
    - `unsupported`: dropped. The criterion counts as `undetermined`.

    Every non-published case shows the same generic reason in the summary (see the next bullet).

  - Every other finding, and every other gate (confidence, deduplication), stays unchanged.
- **The design-decision filter does not suppress the lens with its own source.** Plan files and ADRs are also 2a sources (`review.md:470-475`). The filter (`:544-548`) suppresses an acceptance finding only when a design decision explicitly defers or descopes that criterion. It never does so because the finding cites its own criterion or its own ADR as the source.
- **The acceptance summary is derived after Phase 3.** The orchestrator derives the summary from the leaf's verdicts _after_ Phase 3. A verdict `incomplete` whose finding was not published is shown as `undetermined`, with the one generic reason "not confirmed in this review". That covers a drop by Phase 3 or the PR integration (confidence, deduplication, design decision, Mode C) and also a security withholding. A withheld finding is therefore indistinguishable from any other unpublished one, and leaves no trace (`pr-review-integration.md:168-170`). The details stay in the local report or the local security report. The summary goes into the review body, which is human-facing per-run prose and needs no key (`pr-review-integration.md:194-196, 217-222`), and into the chat report, also when there are no findings.
- **Next-steps.**
  - New row: review in PR mode with at least one published `incomplete` criterion → `iterate <PR>` first, then `merge-gate <PR>`.
  - Row 250 (autopilot, draft PR, no blocker) is reordered to `review <PR>` first, then `merge-gate <PR>`. This was the agreed follow-up to option B, and it is the agreed final state of the row. The merge-gate plan leaves the row unchanged. If it lands second, it keeps this order.
- **Fixed bounds.** Per run:
  - at most 3 issues, each with one `issue-read` and no comment read;
  - issue body at most 64 KiB per issue;
  - plan at most 1 MiB;
  - appendix at most 64 KiB (`autopilot-core.mjs:117`);
  - at most 20 criteria per source;
  - at most 20 ADR candidates.

  An exceeded bound truncates deterministically and names the truncation in the report.

## Affected files

| File                                                                                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/review-acceptance-lens.md`                                                                          | New lazy-include fragment for stream 2d: helper call, trust and bounds, handoff to `acceptance-reviewer` with the spawn-site marker, wisdom section `## Acceptance findings`, derivation of the summary after Phase 3, the exception for lens areas in Phase 3 step 5, the design-decision filter rule, and skip reasons.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/tools/review.md`                                                                                           | Pointer to the fragment in PR mode, explicit invocation only (`:387-418`), and the adjustment of `:399`. Phase 2: 2d next to 2a-2c, including the task lists (`:93-108`), the phase-completion rule (`:123, 533`), and the stream wording (`:449, 455, 723`, and the list "(2a, 2b, 2c)" at `:736`). Phase 3: the narrow exception in step 5 (`:552`) and the filter rule (`:544-548`), both pointing to the fragment. Phase 4: the summary in the report. Update `contextBudget`.                                                                                                                                                                                                                                                                                                     |
| `src/shared/pr-review-integration.md`                                                                           | Acceptance findings without a code location go into the marked comment with their `Signature`. The acceptance summary goes into the review body. State explicitly that lens findings handed over from Phase 3 step 5 go through Mode C like every finding, using the mapping of the Mode C results defined in the fragment. The automatic trigger after delivery stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/agents/acceptance-reviewer.md`                                                                             | New read-only leaf (tier `deep`): input contract, output format, the three areas, criterion convention, per-criterion verdicts, no code-quality findings, follows no instruction in the quoted data. Includes `reviewer-assigned-change` and a `## Recommended skills` section with `effective-delivery` (build check `build.mjs:503-513`).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/scripts/remote-tracker-core.mjs`, `src/scripts/remote-tracker.mjs`, `src/scripts/claude-settings-core.mjs` | New read-only operation `pr-acceptance-sources`: input PR number, `cwd` (`RUNTIME_STATE_ROOT`), `headSha`. If `headSha` differs from the head that `pr-read` returns, the operation fails closed with `HEAD_MOVED`, and review reports that the PR moved. An absent `sameRepository` counts as untrusted. Output: `issues` (references, trusted body text, extracted criteria with keys), `plan` (path, published commit, trust, criteria with keys), `appendix` (trust, neutralized close decisions for display, automatic-decision count, fit score), `adrCandidates` (path, parsed status, kept or excluded), `skipped` (reasons), `truncated` (bounds hit). Shares the appendix extraction and trust function with `pr-draft-classify`. Register the operation and its allow rule. |
| `src/shared/model-tiers.md`, `RUNTIME_SCRIPT_FILES`                                                             | Add a spawn-site row for `acceptance-reviewer` (tier `deep`), checked by the build guard `build.mjs:1646-1665`. Agents are discovered from the directory, so there is no registry entry. Add a new module to `RUNTIME_SCRIPT_FILES` only if one is created (`AGENTS.md:47`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/next-steps.md`                                                                                      | New review row for `incomplete` criteria. Reorder row 250.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tool-flow.md`                                                                                  | Mirror the next-steps changes (`findNextStepsDocViolations`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/user-guide/tools-quality.md`                                                                              | Add a PR-mode section to the `review` reference (`:118-188`): what the lens checks, when it runs, the sources, trust, bounds, and the acceptance summary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/tools-automation.md`                                                                           | Recommended order after autopilot: `review <PR>`, then `merge-gate <PR>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/workflow-contracts.test.mjs`                                                                              | Assertions for:                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

- the 2d stream in `review.md` (task list, completion rule, pointer, `:399` adjustment);
- the step-5 exception for `Acceptance`/`Architecture` only;
- the ID reservation and completion counting of handed-over lens findings;
- the design-decision filter rule;
- the summary derived after Phase 3, with the one generic reason;
- the decision display without judgment;
- the `pr-review-integration.md` changes (evidence packing, the Mode C mapping for lens findings, summary in the review body);
- the fragment content (sources, trust, bounds, skip reasons);
- the agent contract;
- the next-steps rows.

Check the existing review slices (for example `:5246`, `:25116`) and update them where needed. |
| `test/remote-tracker.test.mjs` | Tests for `pr-acceptance-sources`: each source alone and combined; invalid marker or receipt → skip with reason; `externalTool` receipt → not supported; author without permission → no criteria or `unverifiable`; receipt, plan or appendix on a fork PR → `unverifiable`; no comment read; criteria extraction in both languages, the 20 limit and stable keys; the published plan version (first publication; republication; `A`→`P` rename; a merge of the base as neutral; a plan commit after the first implementation commit ignored; plan already moved to `A`; squashed history → `unverifiable`); local-plan autopilot PR with the plan at the merge base, without it, with an archive path (`P` derived), and with an invalid path; ADR candidates at the merge base; the status parser for all three formats and the exclusion of `effective-flow-project-setup.md`; `HEAD_MOVED`; bounds and truncation; fail closed on a forge error. |
| `test/codex-native-profiles.test.mjs`, `test/compare-native-agent-baseline*.test.mjs`, `test/execution-profile-rendering.test.mjs`, `test/model-tiers-contract*.test.mjs` | Add the new agent to the hard-coded lists (for example `DEEP_ROLES`, `codex-native-profiles.test.mjs:34-45`). Add a contract assertion for read-only, no sub-agent, output fields, areas. |

## Implementation details

### Approach

1. Implement `pr-acceptance-sources`, including the shared appendix extraction and trust function (or reuse them, if the merge-gate plan has landed): receipt and marker parsing, trust check for all sources, criteria extraction with keys, the published plan version, bounds. Register it, allow it, test it.
2. Write the agent `acceptance-reviewer.md`, add its spawn-site row to `model-tiers.md`, and update the agent test lists.
3. Write the fragment `review-acceptance-lens.md`. In `review.md`: add 2d (explicit invocation only), "four streams", the step-5 exception, the filter rule, and the summary after Phase 3. Update `contextBudget`.
4. Add the hand-over rule and the summary in the review body to `pr-review-integration.md`.
5. Add the next-steps rows, the doc mirror, and the user-guide texts.
6. Add the contract and agent tests. Run `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution`.

### Edge cases

- **No source:** the lens stays off, and the report has one line: "no acceptance source".
- **Invalid marker or receipt:** the lens stays off for that source, and the reason is reported. Other valid sources still run.
- **Fork PR or PR author without write permission:** receipt, plan and appendix are `unverifiable`, and the lens reports only that the sources exist. An issue body from an author without write permission yields no criteria. If no trusted criteria remain, the summary says "no trusted criteria".
- **Plan without a plan-only commit in the range** (for example, plan and implementation in one commit): the plan source is `unverifiable`, and the report names the reason.
- **The PR changed the criteria in its plan:** the bar is still the published version. The changed version is not used.
- **A Phase-3 drop of an `incomplete` finding:** the summary shows `undetermined` with the generic reason "not confirmed in this review", and next-steps does not route to `iterate`.
- **Issue without an acceptance-criteria heading:** no per-criterion summary for that issue. The ADR check still runs, because the issue is a trusted source, and so does the decision display when an appendix exists.
- **A criterion with no code location:** a finding with `file` set to `<source>#criterion-<key8>` (with `<source>` one of `issue-<N>`, `plan`, `appendix`) goes into the marked comment. Editing the issue text of other criteria does not change its `Signature`.
- **Plan larger than 1 MiB, or a bound exceeded:** truncate deterministically and name the truncation.
- **`externalTool` receipt or hidden mode:** the issue source is reported as not supported. Plan and appendix sources still work if present.
- **An `acceptance-reviewer` leaf that fails or returns invalid output:** retry under the completion protocol. After that, the summary says "acceptance not assessed", and the rest of the review is unaffected.
- **Automatic review after delivery:** the lens does not run. Behaviour is unchanged.
- **Hidden mode or a closed PR:** the PR integration publishes nothing (`pr-review-integration.md:59-64`). The summary appears only in the chat report.
- **The PR changes an ADR:** the check uses the merge-base version. The change is reported as "ADR changed by this PR".
- **Autopilot PR from a local plan that the base does not track:** the plan source is `unverifiable`. The decision display and the ADR check still run.
- **`headSha` differs from the head that `pr-read` returns:** `HEAD_MOVED`, and the lens is not run. Review reports it.
- **Appendix plan path under `archive/`:** `P` is derived and probed at the merge base.
- **Appendix plan path that fails validation** (outside `<plan.dir>/`, `..`, leading `-`, control characters): the plan source is `unverifiable`, and no Git command receives the path.
- **Merge of the base into the head:** this is a neutral commit. It changes neither the bar nor the plan-only classification.

## Acceptance criteria

- [ ] An explicit `review <PR>` on a PR from the same repository, whose author has write permission and which has a valid receipt, plan marker or autopilot appendix, runs stream 2d. It reports a per-criterion acceptance summary (`complete` / `incomplete` / `undetermined`), derived after Phase 3, in chat and in the review body. The automatic review after delivery stays unchanged.
- [ ] A PR without any of these sources is reviewed exactly as before, apart from the one line "no acceptance source": no reads beyond the one `pr-read`, and no leaf.
- [ ] Criteria come only from `pr-acceptance-sources` (closed heading set, at most 20 per source, stable keys), never from PR prose or issue comments. For plans they come from the published version, not the head. Texts from authors without write permission never reach the leaf.
- [ ] An `incomplete` criterion becomes a finding with `area: Acceptance`. It passes confidence, deduplication and security unchanged. It is not suppressed by the design-decision filter on the grounds of its own source. The narrow step-5 exception hands it to the PR integration, it gets a reserved ID, and it is published as a PR comment, inline or in the marked comment, when Mode C returns `valid_in_scope` + `caller_fix`. The run counts as complete. The same holds for findings with `area` `Architecture`. Other findings keep the `current-scope` block.
- [ ] A finding withheld by the security gate leaves no trace in the published summary. It shows as `undetermined` with the same generic reason as every other unpublished finding.
- [ ] The leaf `acceptance-reviewer` is read-only, starts no sub-agent, and reports only the areas `Acceptance` and `Architecture`. Decisions are shown in the summary and never judged.
- [ ] next-steps routes `incomplete` criteria to `iterate <PR>`. After autopilot, it recommends `review <PR>` before `merge-gate <PR>`. `findNextStepsDocViolations` is green.
- [ ] The completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` are green, including the new helper, agent, and contract tests, and `contextBudget` is updated.

## Validation plan

- Unit tests for `pr-acceptance-sources` in `test/remote-tracker.test.mjs`.
- Contract tests for `review.md`, the fragment, `pr-review-integration.md`, the agent, and next-steps.
- Manual check after release: `review <PR>` on a real autopilot draft with a plan marker and appendix. The expected result is an acceptance summary with criteria from the plan, and the decisions from the appendix shown without judgment. Also run it on a PR without a source, where the expected result is unchanged behaviour.

## Assumptions and open points

- Assumption: there is no review eval suite (`evals/` has none), so this plan needs no eval scenario. If a suite loads the review sources, its evidence debt is recorded per the eval policy.
- Verified: the automatic review after delivery does not start review Phase 2 (`pr-review-integration.md:45-55, 86-93`), so the lens does not run there.
- Assumption: the issue-criteria extraction rule from merge-gate's issue observation is general enough for issues, and the plan checkboxes are general enough for plans. Both are mechanical rules that are already established.
- Follow-up, not part of this plan (the user's decision): review's step 5 also blocks ordinary `current-scope` regressions from 2c in PR mode, although the PR integration could post them. Whether all PR-mode findings should be handed over is a separate decision.
- Coordination: the merge-gate plan (PR #701) uses the same appendix extraction and trust function. The final state of next-steps row 250 is `review <PR>`, then `merge-gate <PR>`. The merge-gate plan's line about row 250 ("stays merge-gate first") needs the same note. That plan is not changed in this run, so the note is recorded here for whichever implementation lands second. The receipt for autopilot PRs and plan-PR continuations is already on `develop` (#700). Older PRs without a receipt reach the lens through the plan marker and the appendix.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         7 |    2 |
| Security        |        0 |         3 |    3 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         2 |    2 |
| Maintainability |        0 |         1 |    8 |

### Findings

Internal plan review on 2026-11-20 (gap analysis and plan review, `effective-delivery`). All findings are incorporated.

Round 1:

- **Error cases, Important (user decision):** acceptance gaps are `current-scope` and are blocked in step 5. Decision: a narrow exception for the lens areas only.
- **Architecture, Important (user decision):** the automatic review after delivery does not start review Phase 2. Decision: the lens runs only on an explicit `review <PR>`.
- **Error cases, Important (user decision):** after delivery the plan sits at `A`, and the head can change its criteria. Decision: the published version is the bar.
- **Testability, Important:** the design-decision filter could suppress lens findings by their own source. They are now suppressed only when a decision explicitly defers the criterion.
- **Maintainability, Important:** the summary came from the leaf, before Phase 3, and had no key. It is now derived after Phase 3 and goes into the review body.
- **Architecture, Important:** "accepted ADRs only" missed the 12 `Active` ADRs. Now `Accepted` or `Active`, not superseded.
- **Testability, Important:** there is no agent registry. The agent instead needs a spawn-site row in `model-tiers.md`, a `## Recommended skills` section, and updates to the agent test lists.
- **Maintainability, Note:** the wording "three streams" is now "four streams".
- **Error cases, Note:** the appendix limit was corrected to 64 KiB, and "Automatic decisions" holds only a count.
- **Security, Note:** the receipt now gets the same trust gate, and the permission set comes from the shared trust function.
- **Scope, Note:** issue comments are no longer read. The criterion key is now a text hash.

Round 2 (full judgment after the decisions):

- **Error cases, Important:** handed-over lens findings were left without an ID or security class, and the run was incomplete. They are now part of the reservation, step 6 and the completion rule.
- **Security, Important:** the summary could reveal findings the security gate withheld. Such criteria now show as `undetermined` with no reason.
- **Architecture, Important:** the "published version" rule was not sound. It now uses `--first-parent`, plan commits including the `A`→`P` rename, merges of the base as neutral, and the bar before the first implementation commit.
- **Scope, Important (user decision):** autopilot PRs from local plans have no plan marker. Decision: when the base tracks the plan, its merge-base version is the bar.
- **Security, Note:** ADRs are now read at the merge base, and ADRs the PR changes are reported.
- **Architecture, Note:** Mode C is now explicit, and an `unsupported` result drops the finding.
- **Maintainability, Note:** the final state of row 250 is now named.
- **Maintainability, Note:** fixed the line range and the receipt plan path. A fixed summary template per criterion stabilizes the `Signature`.
- **Testability, Note:** `Decision` and `Architecture` now have an acceptance criterion, and hidden mode and closed PRs have edge cases.

Round 3 (scoped re-check of the round-2 changes). The published-version rule, the neutral merge, ADRs at the merge base, the step-5 exception, and `Signature` compatibility are confirmed. New findings, all incorporated:

- **Scope, Important:** the appendix names the archive path after archival, which is never on the merge base. `P` is now derived from it and probed.
- **Security, Important:** "without a reason" marked withheld findings. Every unpublished finding now gets the same generic reason.
- **Architecture, Important:** the file table bypassed Mode C, and some Mode C results were unmapped. All results are now mapped, and the table is aligned.
- **Security, Note:** the appendix plan path is now validated (under `<plan.dir>/`, no `..`, no leading `-`/`/`, no control characters), probed with `ls-tree ':(literal)'`, and quoted.
- **Maintainability, Note:** `<source>` is now a fixed token, and the orchestrator stamps fixed summaries for all three areas.
- **Maintainability, Note:** the merge-gate plan needs a note on row 250. That plan is not changed here, so the note is under Assumptions.
- **Note:** the base fetch before the walk is now named.

Deep interactive plan review on 2026-11-20. All findings are incorporated:

- **Security, Important:** an edge case still had "with the drop reason", which would have revealed security-withheld findings. It now uses the generic reason.
- **Error cases, Important:** criterion findings without a location carried no evidence into Mode C, and the mapping silently overrode the integration's rules. The evidence packing is now defined, and the override is stated explicitly for lens findings only.
- **Architecture, Important (user decision):** the `current-scope` block also hits ordinary PR-mode regressions. Decision: the exception stays for lens areas only. The general gap is recorded as a follow-up, and `review.md:399` is adjusted.
- **Architecture, Important:** the ADR filter had no status parser for the three formats, the project-setup ADR was not excluded, and non-ADR candidates had no rule. All three are now defined.
- **Testability, Important:** the contract tests now cover the step-5 exception, the reservation, the filter rule, the generic reason, and the `pr-review-integration` changes.
- **Scope, Note (user decision):** the decision check is out of proportion to a section that is often empty. Decision: decisions are only shown. The `Decision` area, its key scheme, and its tests are removed.
- **Maintainability, Note:** fixed the contradiction about the ADR check with no criteria, and named when the leaf is spawned.
- **Maintainability, Note:** `Architecture` now has its own location-less form, `adr#<key8>`.
- **Maintainability, Note:** "no extra reads" is made precise, an absent `sameRepository` counts as untrusted, `HEAD_MOVED` is defined, and the stream wording references are complete.
- **Scope, Note:** the local-plan path stays (230 tracked plans on the base). No cut.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-20
**Workflow:** `effective-flow build` (inline Quality route), continuing draft plan PR #702

### Requirement

Implemented as planned: an explicit `review <PR>` runs stream 2d automatically when the pull request carries a machine-verifiable source (lifecycle receipt, plan marker, autopilot appendix), checks it against the source's acceptance criteria and active ADRs at the merge base, shows recorded autopilot decisions without judging them, and reports gaps as ordinary findings plus a per-criterion acceptance summary. Without a source, review is unchanged apart from one "no acceptance source" line. The automatic review after delivery never runs the lens.

### Architecture decisions

All plan decisions are implemented. Deviations and refinements made during implementation and review:

- **Helper-written snapshot.** The read-only leaf has no shell, so `pr-acceptance-sources` takes an optional `snapshotSessionId` and writes the leaf's two inputs itself: `.effective-flow/.acceptance-lens-<id>.diff` (merge-base diff, cut at 1 MiB, with an 8 MiB pre-read bound and a 256 KiB pathspec budget) and `.acceptance-lens-<id>.md` (quoted sources, display-only appendix decisions, ADR candidates at the merge base, documents cut at 64 KiB and omitted above 1 MiB). Writes go through the runtime-state guard, no-clobber. The forge stays read-only; the allowlist consent text discloses the write. The orchestrator deletes both files once 2d's result is recorded and on every run-level exit before that.
- **Oversized plan.** A plan larger than 1 MiB is reported `unverifiable` (`plan-size-bound-exceeded`) instead of being read truncated: criteria near its end would otherwise be dropped while the plan still counted as trusted, and the size pre-check avoids buffering it. The edge case "Plan larger than 1 MiB … truncate deterministically" is superseded by this; every other bound still truncates deterministically and names the truncation.
- **Fetch without `FETCH_HEAD`.** The head is ensured by its exact `headSha` (`cat-file -e`, fetch by SHA with `--no-write-fetch-head`, branch fallback); the base tip comes from `ls-remote` (exact ref, exactly one line), fetched by OID and verified; a moved base fails closed and retryable. Git calls run with the runtime-state guard's masked Git environment.
- **ADR candidate order.** Candidates are bounded by kind (architecture guide, ADRs, concept documents), so a full ADR set never displaces `docs/developer-guide/architecture.md`.
- **Lens Phase-3 rules.** Besides the step-5 exception, a 2d finding below confidence 80 is dropped without the step-2 stop and its criterion reads `undetermined`; only design decisions found at the merge base or in the published plan version may suppress a 2d finding (both areas); the public review body carries a fixed reason per verdict.
- **Hidden mode.** `hiddenMode: true` makes receipt issues "source not supported" without an issue read.
- **Spawn site.** The build requires a fragment-owned marker prefix, so the site is `review-acceptance-lens/acceptance-review`.
- **Baseline proof.** `scripts/compare-native-agent-baseline.mjs` gains a frozen `EXPECTED_ADDED_WORKERS` allowlist (`effective-flow-acceptance-reviewer`); any other worker-membership change still fails.
- **Shared functions for PR #701.** `pullRequestSourceTrust`, `isSourceTrustPermission` and `extractAutopilotAppendix` are exported from `src/scripts/remote-tracker-core.mjs` for reuse by `pr-draft-classify`. Next-steps row 250 is in its agreed final state (`review <PR>`, then `merge-gate <PR>`).

### Affected files

- New: `src/shared/review-acceptance-lens.md`, `src/agents/acceptance-reviewer.md`.
- Runtime: `src/scripts/remote-tracker-core.mjs` (operation `pr-acceptance-sources`), `src/scripts/claude-settings-core.mjs` (allow rule; 74 rules, 45 remote-tracker read rules).
- Prompt sources: `src/tools/review.md` (budget 899), `src/shared/pr-review-integration.md`, `src/shared/next-steps.md`, `src/shared/model-tiers.md`, `src/shared/setup-allowlist.md`.
- Tooling: `scripts/compare-native-agent-baseline.mjs`.
- Docs: `docs/user-guide/{tool-flow,tools-quality,tools-automation,tools-setup}.md`, `docs/developer-guide/{architecture,build-system,configuration,skill-ownership,subagent-progress-coverage}.md`, `docs/developer-guide/skill-ownership.json`.
- Tests: `test/remote-tracker.test.mjs`, `test/workflow-contracts.test.mjs`, `test/setup-allowlist-contract.test.mjs`, `test/model-tiers-contract.test.mjs`, `test/compare-native-agent-baseline.test.mjs`, `test/execution-profile-rendering.test.mjs`, `test/execution-profile-contract.test.mjs`, `test/build-lib.test.mjs`, `test/codex-native-profiles.test.mjs`.

### Implementation details

Implemented in the planned order: helper and shared functions, leaf agent and spawn-site row, lens fragment and `review.md` integration, PR-integration hand-over, next-steps rows and docs, tests. One automatic review-incorporation pass followed by three bounded correction rounds, each re-checked; the review-depth floor applied to trust, Git-boundary, permission-consent and cross-module contract paths.

### Test results

- Phase 5 (full run, tree before review corrections): `pnpm test:preflight`, `pnpm agent:check`, `pnpm test` (6049 passed, 0 failed, 61 skipped), `node build.mjs`, `pnpm test:distribution` — all exit 0.
- Later corrections were verified targeted: Phase 7 ran the 34 affected test files (2466 passed, 0 failed, 37 skipped) plus `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` at repository breadth — all exit 0.
- All checks ran in the `effective-flow-node24` T3 runner environment. No failure needed attribution; no expected failure was used.
- Not run: the manual post-release check from the validation plan (a real autopilot draft and a PR without a source).

## Review findings

**Date:** 2026-11-20
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer` (reduced depth for Markdown prompt sources)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    44 |
| Open / Not implemented |     0 |

Three further Notes were closed below the follow-up threshold: duplicated Git-environment masking logic, the pathspec budget against the Windows command-line limit, and one output-cut test that checks for at least one rather than exactly one truncation entry.

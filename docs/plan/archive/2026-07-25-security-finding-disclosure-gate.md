# Security-finding disclosure gate for review publication

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

In remote tracker mode (`tracker.mode: remote`), `/effective-flow review` currently publishes every
surviving finding as an issue plus an epic, and writes no local report at all
(`src/tools/review.md`, Phase 4 "Remote mode"). For security findings — above all for
externally reachable attack surface — that means an unfixed vulnerability is described in a public
tracker, with file, line, problem, and a copy-pasteable reproduction prompt, before any fix exists.

Security findings must therefore never reach the tracker automatically. They are written to a local
review report first, regardless of what the configuration says, and the user is then offered an
explicit publication option that names the disclosure risk. Non-security findings keep their
configured behavior.

The classification affects only _where_ a finding is recorded; it never removes a finding, changes
its severity, or alters the finding scope.

Workflow rationale: this adds new behavior (a classification step, a new gate, a new artifact path
in a mode that had none) across a tool, a shared contract, four agents, tests, and documentation —
`Feature` rather than `Bugfix` or `Refactoring`.

## Architecture decisions

- **Classify centrally in Phase 3, not in the reviewers.** The existing architecture already
  reconciles design decisions centrally in Phase 3 and deliberately keeps the Phase-2c reviewer
  assignment lean (`src/tools/review.md`, Phase 2c step 3 and Phase 3 step 3). Security
  classification follows the same pattern, so it also covers technical findings from Phase 2b,
  which never pass through a reviewer agent.
- **Reviewers contribute a signal, not the decision.** The four reviewer agents gain one output
  field (`Security relevance: external | internal | none`) because only they hold the code context
  for reachability. Phase 3 owns the final call and may escalate a finding the reviewer marked
  `none`; it may never de-escalate one marked `external`.
- **Conservative default.** A finding whose security relevance is uncertain counts as security
  relevant and stays local. Per the user decision, _all_ security findings are held back;
  externally reachable ones are additionally marked as such in the report.
- **Reuse the existing local report artifact.** Held-back findings go into a normal report file
  under `.effective-flow/review/` using the established `review-report-*` prefix. That prefix is
  already what `/effective-flow apply` classifies as `review-report`
  (`src/shared/apply-source-detection.md`, Stage A rule 3) and what the Phase-2a design-decision
  source globs (`review-report-*.md`). No new artifact type, no new routing.
- **Split publication in mixed runs.** Non-security findings are published as issues and epic as
  today; security findings stay local. One run can produce both artifacts, which contradicts the
  current absolute statement "In remote mode **no** local report is written" — that sentence
  becomes conditional in `src/tools/review.md` and `src/shared/issue-tracker.md`.
- **Ask before creating the epic.** The gate runs after the local report is written and before any
  tracker mutation, so a `Yes` yields exactly one epic containing all findings published in this
  run. This preserves the existing invariant "An existing epic is never extended"
  (`src/tools/review.md`, Phase 4 remote step 4).
- **Write the report first, always.** The local report exists before the offer, so a declined
  offer, a CLI failure, or an interrupted session never loses findings.
- **No configuration escape hatch.** Per the user decision the gate is unconditional and overrides
  `tracker.mode`; publication happens only through the per-run confirmation. No new configuration
  key, hence no `/effective-flow setup` wizard change and no configuration documentation change.
- **The epic stays silent about withheld findings.** A public "N security findings withheld" line
  is itself an attacker-usable signal. The count appears only in the local report and the terminal
  summary.
- **Anchor the rule in the shared tracker contract.** `src/shared/issue-tracker.md` is embedded by
  every remote publisher, so the gate lives there and future publishers inherit it; `review.md`
  keeps only the orchestration.
- **A blocked report write does not block unrelated publication.** If the local security report
  cannot be written, the non-security findings are still published and the withheld findings are
  reported in the terminal with an explicit warning that they were not persisted. Nothing sensitive
  leaks in either variant, a re-run regenerates the withheld findings, and a runtime-state problem
  should not cost the user the rest of the review.
- **The gate is a per-run decision without persisted state.** Every run that still holds withheld
  findings shows the offer again. No decision memory is added to `memory.json`, because a stored
  "keep local" would silently suppress the warning for a finding that later becomes more severe.
  Local signature dedup keeps the repeated offer stable instead of growing it.
- **The report lives in gitignored runtime state.** `.effective-flow/` is fully gitignored in target
  projects (`AGENTS.md`, "Configuration and ADRs"), so the security report is never committed and
  never reaches a remote through the delivery path.

## Affected files

| File                                     | Description                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/security-disclosure-gate.md` | **Added during implementation:** classification, local dedup, local-first persistence, publication offer, and epic silence. Not foreseen in planning — `src/tools/review.md` would otherwise have exceeded the 700-line always-loaded context budget enforced by `build.mjs` |
| `src/tools/review.md`                    | New Phase-3 security-classification step; Phase-4 remote mode ordered as dedup → reserve → gate → publish; report format gains the security field; completion condition and rules updated. The gate detail lives in the lazily loaded fragment above                         |
| `src/shared/issue-tracker.md`            | New "Security disclosure gate" section as the binding contract for every remote publisher; conditional wording for the local report in remote mode; German/English display mapping for the new fields                                                                        |
| `src/agents/nodejs-reviewer.md`          | Output format gains the `Security relevance` field                                                                                                                                                                                                                           |
| `src/agents/frontend-reviewer.md`        | Output format gains the `Security relevance` field                                                                                                                                                                                                                           |
| `src/agents/rust-reviewer.md`            | Output format gains the `Security relevance` field                                                                                                                                                                                                                           |
| `src/agents/generic-product-reviewer.md` | Output format gains the `Security relevance` field                                                                                                                                                                                                                           |
| `src/tools/apply-review.md`              | Local report flow: a finding annotated as published is skipped or queried instead of implemented twice                                                                                                                                                                       |
| `test/workflow-contracts.test.mjs`       | New contract test for the gate prose in tool, shared fragment, and agents                                                                                                                                                                                                    |
| `docs/user-guide/remote-tracker.md`      | Documents the gate, the local security report, and the publication offer                                                                                                                                                                                                     |
| `docs/user-guide/tools-quality.md`       | Short pointer from the review tool description to the gate                                                                                                                                                                                                                   |

`build.mjs` is deliberately **not** changed: no tool and no agent is added, so `TOOL_GROUPS`,
`EXPOSED_TOOLS`, and the guards stay untouched. `dist/` is generated and is never edited.

## Implementation details

### Approach

1. **Reviewer signal.** In each of the four reviewer agents, add one line to the `## Output format`
   list: a security-relevance value of `external`, `internal`, or `none`, with the instruction to
   choose `external` when the finding is reachable through an untrusted input, network, or auth
   boundary, and to prefer the stronger value when unsure. Keep the value tokens language-stable
   and lowercase, like other machine values in this repository.
2. **Central classification (`review.md`, new Phase 3 step after the design-decision filter).**
   For every finding that survives filtering, determine a publication class from the reviewer
   signal plus the finding's own area, problem, and recommendation text: `local-only` for any
   security-relevant finding, `publishable` otherwise. Record the reason and, for `local-only`,
   whether the exposure is external or internal. Uncertain cases become `local-only`. The step must
   state explicitly that it may escalate but never de-escalate a reviewer's `external` value, and
   that it also applies to Phase-2b technical findings.
3. **Local dedup for withheld findings (`review.md`, Phase 4).** Because a withheld finding never
   reaches the tracker, the existing remote dedup cannot see it and a re-run would mint a new
   `R-XXXXXXX` for the same problem. Before reserving IDs, compare each `local-only` finding's
   normalized `Signature` against the finding blocks of existing reports under
   `<RUNTIME_STATE_ROOT>/.effective-flow/review/`. An exact signature match reserves no new ID and
   is reported as already recorded, naming the existing report and finding ID. Each run still writes
   its own report file; existing reports are read for dedup but never rewritten by this step.
4. **ID reservation.** Keep exactly one contiguous reservation per run over the ordered list of all
   remaining findings of both classes, unchanged in mechanics from `review.md` "Usage" step 7–8.
   Findings dropped by local dedup are not part of the list.
5. **Write the local security report (`review.md`, Phase 4 remote mode, before any tracker
   mutation).** Use the existing local-mode report mechanics — runtime-root resolution, the
   directory guards, and "Runtime-state write safety" immediately before `mkdir` and before the
   file write. File name `review-report-YYYY-MM-DD-security[-N].md` with the established numeric
   collision suffix; the `review-report-` prefix keeps apply routing and design-decision globbing
   intact. The report language is the Phase-1 `language.workflow` value, even though the run's
   remote artifacts use `language.forge`; state this explicitly, since it is the first case where
   one review run writes in both languages.
6. **Publication offer (`review.md`, Phase 4 remote mode).** Only when at least one `local-only`
   finding remains after dedup, present the withheld findings to the user by ID, severity, and
   short title, then use an `ask` fence with two options: keep local (default) or publish as
   issues. The question text names the concrete consequence: a public tracker entry describes an
   unfixed vulnerability with file, line, and reproduction prompt, is visible to anyone with read
   access, and is propagated by notifications, mail, feeds, and mirrors, so deleting the issue
   later does not undo the disclosure. Keep local is the default: an unanswered, skipped, or
   non-interactive run publishes nothing from the withheld set.
7. **Publish (`review.md`, Phase 4 remote mode).** On `keep local`: publish only the `publishable`
   findings, exactly as today. On `publish`: treat the withheld findings as publishable for this
   run, so a single epic covers both groups. In both cases the "avoid an empty epic" rule extends
   to the split — when every new finding of this run is withheld and stays local, create no epic
   and report the local report path instead.
8. **Annotate the report after publication.** When withheld findings were published, append to each
   affected finding block in the just-written report a short note naming its issue number, in the
   preserved report language and in the same style as the existing implementation notes in
   `src/shared/review-report-backlinks.md`. Guard the report path again immediately before this
   write.
9. **Disclosure banner.** A report that contains at least one security finding carries a short
   banner directly below the header fields stating that it holds unpublished security findings and
   must not be pasted into public issues, pull requests, or chats. This applies in local mode too,
   where the same classification is available.
10. **Summary.** The user-facing conclusion of a remote run reports, in addition to the epic URL and
    the created/deduplicated counts, the number of withheld findings and the local report path.
11. **Shared contract (`issue-tracker.md`).** Add a "Security disclosure gate" section stating that
    a security-classified finding is never written to a tracker without an explicit per-run
    confirmation, that the gate overrides `tracker.mode` and any configuration, that the epic and
    all issue bodies contain no hint about withheld findings, and that the local report is the
    authoritative record for them. Add the German/English display mapping for the new fields
    alongside the existing mapping in "Remote prose language", keeping the value tokens stable.
12. **Apply-side guard (`apply-review.md`).** In the local report flow, a finding annotated as
    published is not implemented from the report; point to the issue or ask, consistent with the
    existing "if several reports or findings are candidates, ask" rule.
13. **Tests.** Extend `test/workflow-contracts.test.mjs` with a case asserting the gate contract in
    the sources: the classification step and the ask fence in `src/tools/review.md`, the gate
    section in `src/shared/issue-tracker.md`, the epic-silence rule, and the security-relevance
    field in all four reviewer agents.
14. **Documentation.** Extend `docs/user-guide/remote-tracker.md` with the gate, the security report
    path, and the offer, and correct its current statement that remote mode produces no local
    report. Document the residual risk explicitly: the gate covers the review publication path only,
    so a later fix branch, commit subject, or pull request can still describe the vulnerability in
    public. Add a one-line pointer in `docs/user-guide/tools-quality.md`.

### Component structure

Not relevant — this repository ships Markdown contracts, not components.

### State management

No new runtime state and no new configuration key. `memory.json` keeps its existing
`lastFindingNumber` semantics; the reservation still covers one contiguous range per run, and
withheld findings consume IDs exactly like published ones.

### API integration

Not relevant — no helper operation changes. The gate sits in front of the existing
`finding-build`/`epic-build` and issue-creation operations of `scripts/remote-tracker.mjs`; the
helper's dry-run-first contract stays untouched.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **All findings withheld.** No issues, no epic; report the local report path plus the reason,
  extending the existing "avoid an empty epic" rule.
- **No findings at all.** Unchanged behavior; no report, no reservation, no offer.
- **Local mode.** The gate is a no-op because nothing is published; only the security field and the
  banner appear in the report.
- **Re-run of the same scope.** Local signature dedup (step 3) prevents duplicate withheld findings
  across reports; a withheld finding published in an earlier run is caught by the existing remote
  dedup.
- **Publication accepted, tracker fails midway.** The local report already exists and stays
  authoritative. Report the created subset; unused reserved IDs remain permanent gaps, unchanged
  from the current contract.
- **Report write blocked by the runtime-state safety guard.** Publish the non-security findings as
  usual, publish nothing from the withheld set, and output the withheld findings in the terminal
  with an explicit warning that they were not persisted, the blocked path, the pointer to
  `/effective-flow setup`, and the instruction to re-run the review after the repair.
- **Non-interactive run or skipped offer.** Treated as keep local; the withheld findings stay in the
  report and no issue is created for them.
- **Reviewer omits the new field.** Treat a missing value as unknown, which classifies as
  `local-only` under the conservative default.
- **A security finding is covered by a documented design decision.** The design-decision filter runs
  first and unchanged; such a finding is skipped before classification. Its entry in the skipped
  table carries no security detail beyond what that table already holds.

## Acceptance criteria

- [ ] In a remote-mode run with at least one security-classified finding, no issue and no epic is
      created for that finding before the confirmation; the helper dry-run preview for that run
      contains no withheld finding.
- [ ] The run writes `review-report-YYYY-MM-DD-security[-N].md` under
      `.effective-flow/review/` containing every withheld finding with its ID, severity, exposure
      marking, and the disclosure banner.
- [ ] Declining the offer leaves that report as the only record and creates issues solely for the
      non-security findings.
- [ ] Accepting the offer creates the withheld findings as issues within the same single epic as the
      other findings of the run, and each affected report entry is annotated with its issue number.
- [ ] The epic body of a run with withheld findings contains no count, title, signature, or other
      reference to them.
- [ ] `src/shared/issue-tracker.md` states the gate as a binding contract for every remote
      publisher, and all four reviewer agents emit the security-relevance field.
- [ ] `test/workflow-contracts.test.mjs` fails when the gate prose is removed from
      `src/tools/review.md` or `src/shared/issue-tracker.md`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, and
      the gate text is present in the native Claude, native Codex, and portable targets under
      `dist/`.

## Validation plan

- Run the repository's CI sequence in order: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Verify the new contract test fails on a deliberately reverted source line and passes after
  restoring it.
- Grep the three built targets for the gate wording to confirm the include and transform reached
  all of them.
- Rehearse the gate manually in this repository (`tracker.mode: remote`) with a scope that yields at
  least one security finding, and stop at the helper dry run — confirm the dry-run argument vector
  contains no withheld finding.
- Stop and ask instead of improvising when: the classification would have to be weakened to make a
  finding publishable; the report cannot be written to the resolved runtime root; the epic invariant
  ("an existing epic is never extended") would have to change; or the change would touch a source
  outside the affected-files table, in particular `build.mjs`, `scripts/remote-tracker.mjs`, or the
  configuration schema.

## Assumptions and open points

- Scope is the review publication path. Other outward-facing surfaces — pull request bodies
  (`/effective-flow pr`, `/effective-flow iterate`), commit messages, and the advisory-driven
  `/effective-flow maintain` flow — are not changed. `maintain` handles already-public upstream
  advisories, a different disclosure profile.
- Workflow reports written by `build`, `fix`, `refactor`, and `docs` through
  `src/shared/unresolved-review-report.md` are already local in every tracker mode and need no
  change; they inherit the security field and banner only through the shared report format.
- Classification quality rests on an LLM judgment over the finding text plus the reviewer signal.
  There is no deterministic security taxonomy in this repository, and none is introduced; the
  conservative default is the safeguard against misclassification.
- The plan assumes the `ask` fence supports a two-option question in this position, as used
  elsewhere in `src/shared/issue-tracker.md` and `src/tools/review.md`.
- Planning baseline: HEAD `5802646`, 2026-07-25, worktree clean apart from this plan file. Before
  implementing, re-read `src/tools/review.md` Phase 3/4, `src/shared/issue-tracker.md`, and the four
  reviewer agents; revise the plan if the remote-mode phase structure, the epic invariant, the
  report path contract, or the reviewer output format has changed since then.

## Plan review

**Result:** Approved

### Summary

Reviewed on 2026-07-25 through the internal plan review plus the deep interactive plan review
(`/effective-flow review`, file mode).

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- Error cases, important: a withheld finding never reaches remote dedup, so repeated runs would
  duplicate it across local reports. Incorporated as approach step 3 (local signature dedup) and as
  an edge case; each run keeps writing its own report file.
- Error cases, important: the original "publish nothing when the report write is blocked" rule made
  a runtime-state problem cost the user the whole run. Decided in the deep review: publish the
  non-security findings, output the withheld ones in the terminal with an explicit
  not-persisted warning, and re-run after repair. Incorporated as an architecture decision and an
  edge case.
- Architecture, important: the repeat behavior of the offer was unspecified. Decided in the deep
  review: a per-run offer without persisted decision state, so a stored "keep local" cannot silently
  suppress a finding that later grows more severe.
- Architecture, note: a run can now write in two languages at once (`language.workflow` for the
  local report, `language.forge` for issues). This is consistent with the resolver, which resolves
  per target surface, but is new in practice and is called out explicitly in approach step 5.
- Security, note: the withheld findings live in `.effective-flow/`, which is fully gitignored in
  target projects, so the report cannot leak through a commit. Stated explicitly as an architecture
  decision.
- Scope, important: fix delivery (branch names, commit subjects, pull request bodies) can disclose
  the same vulnerability the gate withholds. Decided in the deep review: deliberately out of scope,
  with the residual risk documented in `docs/user-guide/remote-tracker.md` and a follow-up plan left
  open.
- Testability, note: the contract tests assert source prose, not runtime behavior. The gate's actual
  effect is verified through the manual dry-run rehearsal in the validation plan; the repository has
  no harness for simulating a full review run.
- Directly incorporated without a decision: the non-interactive default (unanswered offer = keep
  local), the explicit stop conditions in the validation plan, and the recorded planning baseline
  with its drift check.

## Test results

**Date:** 2026-07-25

| Check                    | Result                                               |
| ------------------------ | ---------------------------------------------------- |
| `pnpm agent:check`       | passed, 240 files                                    |
| `pnpm test`              | passed, 345 tests, 0 failures                        |
| `node build.mjs`         | passed; always-loaded core `review` 697 of 700 lines |
| `pnpm test:distribution` | passed (offline checks)                              |

The new contract test `security findings stay local until the review publication gate is confirmed`
covers the orchestration order in `src/tools/review.md`, the classification and offer contract in
`src/shared/security-disclosure-gate.md`, the cross-publisher rule in `src/shared/issue-tracker.md`,
the signal field in all four reviewer agents, and the apply-side guard. Two build guards fired
during implementation and were satisfied rather than bypassed: the 12-character limit for `ask`
headers and the 700-line context budget for always-loaded tool cores. The `ask` block was verified
in the built targets: `AskUserQuestion` parameters for Claude, an inline question for Codex.

## Review findings

**Date:** 2026-07-25
**Reviewer:** orchestrator self-review (reviewer subagents were not used — the session prohibits
agent delegation)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     3 |
| Open / Not implemented |     0 |

All three findings were fixed before completion: the ID reservation was ordered before the gate's
local dedup while claiming to exclude deduplicated findings (important, fixed by splitting the
remote-mode steps into dedup → reserve → gate → publish); the publication note that the apply route
must recognize had no defined format (important, fixed with the machine-recognizable `🔓 Published
as #<nr>` / `🔓 Veröffentlicht als #<nr>` marker); and the new `Security` field appeared in a report
template also used by workflow reports that never classify (note, fixed by marking the field as
omitted there).

## Open points

- No open points.

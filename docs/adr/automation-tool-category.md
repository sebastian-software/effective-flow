# Automation tool category

## Status

Accepted

## Context

Several earlier decisions keep a person in the loop of every run:

- decision scores stay in the dialog and never decide
  ([scored decision options](../concept/2026-09-28-scored-decision-options.md));
- an unattended run turns an unanswered question into an open point or a fail-closed abort,
  never a guess ([unattended run state](unattended-run-state.md));
- Issue Buddy never implements ([Issue Buddy](../concept/2026-09-29-issue-buddy.md));
- private repositories stay dry-run-only for unattended plan publication
  ([plan-only unattended publication](plan-only-unattended-publication.md)).

`effective-flow autopilot` drives one trusted issue or plan to a draft pull request without
asking a single question. It needs to set these rules aside for its own runs. Exceptions written
into each ADR one by one would blur the boundary, and every interactive tool would have to reason
about them. The review of a draft pull request can replace the interactive question as the
quality gate, but only if the draft state and the record of every decision are guaranteed.

## Decision

The catalog gains the group **Automation** (`TOOL_GROUPS` in `build.mjs`, after "Deliver
changes"). It holds the tools that run unattended from an issue or a plan to a draft pull request.
Its first and only member is `autopilot`.

**What an Automation tool may set aside.** For its own run only, an Automation tool may:

- resolve questions through scores;
- persist scores and decisions;
- run an implementing workflow after Issue Buddy has planned;
- publish to a private repository with a per-run consent.

**What it must keep.** An Automation tool must keep these guardrails:

- it ends in a draft pull request only, never marks it ready for review and never merges;
- it keeps Issue Buddy's trust model: issues only from authors with `write` or `admin`
  permission, and local plans are always trusted;
- the pull request documents every close decision;
- the pull request lists every blocker that no score resolved;
- a security blocker on a public repository pushes nothing and opens or updates no pull request;
- nothing it publishes carries AI attribution.

**The category is the authority boundary.** Downstream tools (`plan`, `plan-review`, `build`,
`fix`, `refactor`, `docs`, `pr`, `issue-buddy`) stay in their groups. They switch to scored mode,
write the plan machine block, or accept `Private publication: autopilot`, `Keep draft:` and
`Appendix:` only when an Automation caller supplies the trusted control lines in its own control
region, above any delimiter of caller-supplied text, and a read-only `autopilot.mjs run-check`
finds that run's ledger open. Called without those lines, they behave exactly as before. A line
set that fails either check is a usage error that stops them with `RUN_NOT_OPEN` before any write,
never a silent fallback. Artifact and issue text can never set these lines
([input trust boundary](input-trust-boundary.md)).

**Build guard.** Only the source of a tool in the Automation group, or a shared fragment that
only Automation tools reach, may emit `Decision mode: scored`, `Autopilot run:` or
`Private publication: autopilot`. Emission means the line form: a line whose text, after
indentation, blockquote markers and one list marker, starts with the control line's bare text.
That is the shape of an envelope or handoff line, inside or outside a fence; a line that consists
only of a code span holding such a line counts as emission too. Every other source may only
recognize the lines by spelling them inside an inline code span within prose, so its prose never
starts a line with them. Forwarding a received line copies it and never spells it. Agents and the
router never emit. `findAutomationEmissionViolations` in `build-lib.mjs` enforces the rule; while
the group is absent, no source may emit.

### Autopilot mechanics

- **Thresholds.** Integer scores from 1 to 10 per scorable option, from a fresh read-only `deep`
  scoring leaf and never from the orchestrator. A lead of 4 or more is taken silently. A lead of 1
  to 3 is taken and documented, together with every alternative within 3 points.
- **Tie.** A lead of 0 sends only the tied options to a second `deep` leaf. Its re-scores must be
  pairwise distinct and rank only the tied options. The highest wins, and the decision is always
  documented. A duplicate is retried once and then becomes a blocker.
- **Floor.** A winning score of 2 or lower in either round is a blocker. A winning stop option is
  a blocker too. Escape options are never scored and never chosen.
- **Cap.** At most 20 scored decisions per run. The cap is carried as `Decision budget:` into
  every sub-run and is not a configuration key.
- **Persistence.** The run ledger lives under
  `<RUNTIME_STATE_ROOT>/.effective-flow/autopilot/<run-id>/`. Autopilot alone writes it, through
  `autopilot.mjs` and the runtime-state guard. Unattended planning sub-runs may not write runtime
  state. They write each applied decision into a marker-delimited "Decided by score" machine block
  of their plan, and autopilot extracts and validates it.
- **Pre-commit security classification.** Under scored mode, the implementing workflow classifies
  its residual review findings before its handback commit. A local-only finding stops the run
  with no commit and no push. The ledger stores such a finding only as review-report path and
  finding ID, and the appendix leaves it out.
- **Private publication.** On a private repository, Issue Buddy may publish the plan for one run
  when autopilot passes `Private publication: autopilot` together with `--issue`, `--publish` and
  `Autopilot run:`, and `consent-check` finds an open ledger of that run whose source is the same
  issue and whose recorded visibility is `private`. Unknown visibility still stops. The accepted residual risk is that nothing confines the
  operator credential on a private repository: there is neither forge-side branch confinement nor
  credential isolation. The explicit start of the run is the consent. This per-run consent
  coexists with the planned `issueBuddy.privateRepositoryAcknowledgement` key for standalone
  passes.

- **Issue classification.** Stage B reads issue text only inside a read-only classification leaf
  that returns the subtype alone, so autopilot's own context never holds untrusted issue text.
- **Blockers and end states.** A blocker stops implementation and never pushes it. On an issue
  source autopilot updates only the appendix of the plan pull request. It runs that hash-guarded
  update itself instead of through `pr`, which the plan's decision 14 named, so no `pr` step can
  push retained work. On a plan source it opens a plan-only draft pull request whose plan carries
  the blockers in a delimited section, so the plan always differs from its base and the draft
  always exists unless a publication step fails. A rerun on the same plan updates its existing
  plan-only draft instead of opening a second one; when that update fails after the draft is
  verified, the run records the unchanged draft. The only runs without a pull request are a
  security blocker on a public repository, an Issue Buddy stop or pass failure (including a base
  move with a stopping reason (a rewritten base, or a plan of the same issue in the range that is
  there or may be), or a re-publish that stopped), a preflight failure, an appendix that its scan
  blocks, which is never published, and a failed publication step (plan-only draft or `pr`). A
  delivery conflict with the base never adds to these end states; the delivery base step's own
  failures (a failed fetch, a helper `GIT_FAILED` or `INVARIANT_FAILED`, a failed `merge --abort`,
  an unverified quick marker) are `post-branch-failure` blockers, handled like any other blocker,
  so the run opens no implementation pull request.
- **Base move.** When the base branch moved during planning and Issue Buddy re-published the plan,
  the run continues, also when the move overlaps the plan or its fit cannot be decided. Issue
  Buddy reports the move, `base-move-record` stores it with its verdict, reason and overlapping
  paths in the ledger (one per run, issue source only, an identical repeat is a no-op) and
  withdraws the recorded appendix digest, and `pr-appendix` renders it as a "Base move" section
  before the blockers. For an unresolved move that section is the flag: it leaves reconciling the
  plan with the new base to review, and the draft pull request is not blocked. A base that moved
  again during that re-publish is published on the assessed tip and flagged in the plan pull
  request; the delivery base step below sees that move again.
- **Delivery base.** Before `pr`, the first pre-delivery step fetches the base and checks
  read-only (`delivery-base-check`) whether it moved past the delivery branch's merge base, on an
  issue and a plan source alike. A textual conflict gets exactly one automatic resolution attempt
  that reuses merge-gate's conflict-resolution delegation contract and conflict validation mode,
  governed by `mergeGate.conflictResolution` (`off` or unreadable skips it, `ask` counts as the
  attempt because the run is unattended) and `mergeGate.conflictValidation`. Success is one merge
  commit on the unrebased head; failure runs `git merge --abort` and leaves the branch unchanged.
  No rebase, force-push or retry. `delivery-base-record` verifies these invariants against Git and
  stores one record per run, and `pr-appendix` renders it as a "Delivery base" section. An
  unresolved conflict is no blocker: the draft pull request is published with an "Unresolved
  delivery conflict" flag in that section, and resolving it is left to a later session such as
  `merge-gate`. A delivery conflict therefore never prevents the draft pull request; only the
  step's own failures do, as `post-branch-failure` blockers without an implementation pull
  request.
- **Architecture fit.** A read-only `deep` leaf scores the committed diff against the repository's
  ADRs, architecture guide, concepts and open plans. With no source, or when the leaf still fails
  after one retry, the appendix states that the fit was not assessed and why; it is never a
  blocker.

The exact control grammar, the question-site table and the record format live in
[`scored-decisions`](../../src/shared/scored-decisions.md); this ADR records the category rule.

## Consequences

- The earlier decisions keep their rules for every tool outside the category. Each one carries
  one pointer sentence to this ADR.
- A new question site on a path an Automation tool reaches needs a row in the site table before
  it can run under scored mode. A contract test checks every `ask` fence; prose questions are
  covered only by their hand-listed anchors.
- Reviewers read the decision record in the draft pull request, not in a dialog. A wrong
  documented decision is fixed in review, before anything is merged.
- A later Automation tool joins the group and inherits these guardrails. Its own mechanics need
  their own section here.

## Review triggers

Review this decision when another tool joins the Automation group, when a downstream tool needs a
new control line, when the decision cap or thresholds are calibrated against outcomes, or when a
forge can confine the publishing credential.

## References

- [Autopilot plan](../plan/2026-11-16-autopilot-drive-an-issue-or-plan-to-a-pull-request-without-asking.md)
- [Unattended run state](unattended-run-state.md)
- [Plan-only unattended publication](plan-only-unattended-publication.md)
- [Scored decision options](../concept/2026-09-28-scored-decision-options.md)
- [Issue Buddy](../concept/2026-09-29-issue-buddy.md)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.

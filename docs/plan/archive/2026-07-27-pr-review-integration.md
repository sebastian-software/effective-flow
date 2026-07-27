# Wire the pr-review skill into review and delivery

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

The central `pr-review` skill is already an Effective Flow dependency, but only `iterate` uses it,
and only through Mode C — the read-only handoff that classifies review items someone else wrote
(`src/tools/iterate.md:88`–`98`, `docs/developer-guide/skill-ownership.json:127`). Its PR judgment
is unused everywhere else.

This plan gives it two more consumers:

1. `/effective-flow review <PR>` reviews a pull request instead of falling through to a scope
   description.
2. A pull request created by an Effective Flow delivery gets the workflow's findings published on
   it as inline comments. In a gated run this is offered as a question first, in the manner of the
   deep interactive plan review after plan creation; in an authorized autonomous run it happens
   without an additional gate.

Both entry points use one mechanism: a finding set is handed to `pr-review` for the PR-level
judgment, and Effective Flow filters and publishes the result itself. The two differ only in where
the finding set comes from — a fresh review of the pull request, or the review the delivering
workflow already ran.

Workflow rationale: new user-visible behaviour on two entry points plus a new helper operation, so
`Feature` applies.

**Planning basis:** branch `develop` at `b8322cf`, worktree clean apart from untracked plan files,
2026-07-27. Re-check `src/tools/review.md`, `src/shared/worktree-integration.md`,
`src/shared/pr-review-comments.md`, `src/scripts/remote-tracker-core.mjs`, and the installed
`pr-review` skill before executing; the line references and the helper operation list below are
evidence from that state.

## Architecture decisions

- **Effective Flow keeps its review pipeline; `pr-review` supplies the PR judgment.** Full
  delegation to the skill's Mode A was rejected: Mode A discovers, decides, and posts on its own,
  which would bypass the design-decision filter, the `R-XXXXXXX` numbering, and above all the
  security disclosure gate that `src/tools/review.md:506` declares unconditional and not
  switchable by any configuration key. Effective Flow therefore stays the orchestrator and
  publisher.
- **The judgment handoff is the existing Mode C contract, used in the other direction.** Mode C
  consumes items with stable IDs plus evidence and returns
  `valid_in_scope` / `valid_out_of_scope` / `unsupported` / `question_or_information` /
  `needs_evidence` with a recommended action
  (`skills/pr-review/references/mode-c-contract.md:57`–`69`). Instead of threads written by
  others, Effective Flow supplies its **own reviewer findings** as items. The mapping is direct:
  `valid_in_scope` + `caller_fix` earns a comment on this pull request, `valid_out_of_scope`
  becomes a noted follow-up rather than a comment, `unsupported` is a rejected false positive,
  `needs_evidence` returns to the reviewer or is dropped with its missing proof recorded. This
  needs **no change to the skill** and reuses the contract `iterate` already depends on.
- **Publish, do not re-review.** Most delivering workflows already reviewed the same diff minutes
  earlier: `src/tools/build.md:276`–`278` starts every routed reviewer and explicitly demands all
  severities, deliberately deeper than `review`'s default; `src/tools/refactor.md:209` and
  `src/tools/maintain.md:205` do the same. Running the reviewer fan-out again after PR creation
  would spend a second full agent pass to reproduce findings the workflow just handled. The
  automatic step therefore consumes the finding set the workflow already produced and adds only
  what is genuinely missing: the PR-level judgment and the PR-shaped presentation. Two workflows
  have no such set and fall back to a real review of the pull request — `src/tools/docs.md` has no
  review phase at all, and `src/tools/fix.md:191` routes only
  `{{AGENT:generic-product-reviewer}}` for degraded buckets, so a specialist bucket carries no
  reviewer findings. The include therefore accepts an optional finding set and reviews only when
  none was supplied.
- **Only findings that survived the workflow's own correction rounds are candidates.** A critical
  finding that the delivering workflow already fixed is not republished; the input is the residual
  set the workflow reports at completion, not its full history.
- **One shared definition, three call sites.** The trigger, the handoff, and the publication live
  in one new shared include. The delivery contract invokes it, and so do the two delivery paths
  that create pull requests without going through that contract
  (`src/tools/apply-review-remote.md:97`, `src/tools/apply-issues.md:256`). Putting the trigger in
  `{{SKILL:pr}}` was rejected: `src/tools/pr.md:151` declares that tool free of validation
  responsibility, and a review there would contradict its own stated boundary.
- **The trigger sits inside the delivery completion action, before the checkout is restored.**
  `src/shared/worktree-integration.md` withdraws an Effective Flow worktree in step 4, creates the
  pull request in step 5, and switches the checkout back to the base branch in step 6. A review
  running after step 6 would read base-branch file content. The review therefore runs at the end
  of step 5's `pr` branch and resolves all content from explicit refs —
  `git diff <base>...<head>` for the change set and `git show <head>:<path>` for file content —
  never from the working tree.
- **Gated asks, autonomous does not.** `src/shared/goal-completion.md:34` restricts the autonomous
  option to approval boundaries after which no further gate follows. Adding a question here would
  strand an authorized `/goal` run. So: gated runs ask once with an `ask` block modelled on the
  deep-plan-review question; runs under an authorized goal proceed without asking, which is what
  that authorization means.
- **Configuration: one key, `delivery.prReview`,** with `ask` (default), `always`, and `off`. In an
  autonomous run `ask` behaves as `always`, because the gate is unavailable there. `off` disables
  the automatic trigger entirely and never affects the explicit `/effective-flow review <PR>`
  entry point.
- **Publication needs a new helper operation.** `src/scripts/remote-tracker-core.mjs` offers
  `review-threads-read`, `review-thread-reply`, `review-thread-resolve`, `pr-comment`,
  `pr-comment-build`, `pr-comments-read`, `pr-create`, `pr-list`, `pr-read`, and `pr-update-body`
  — nothing that submits a review with new inline comments. `review-create` is added with its own
  capability key, implemented for GitHub, declared `UNSUPPORTED_CAPABILITY` for Forgejo exactly as
  `review-thread-reply` already is, with a fallback to one structured `pr-comment` carrying
  `file:line` references. Requests are never assembled in the prompt.
- **The review is submitted as comments, never as a verdict.** No approval and no change request:
  on a self-created pull request approving is impossible anyway, and a bot blocking a merge on a
  false positive is a different risk class than a bot leaving a comment.
- **A distinct marker `<!-- effective-flow-pr-review -->`.** `iterate` treats every reviewer thread
  as candidate work (`src/tools/iterate.md:145`). Without a distinct marker it would pick up
  Effective Flow's own findings as third-party input and implement them a second time. `iterate`
  is extended to skip threads carrying the new marker unless the user names them explicitly.
- **PR-reference precedence must not break plan references.** `src/tools/review.md:283` resolves a
  bare four-digit number as a legacy plan reference, and the shared source detection states that a
  four-digit value is never an issue reference. The new PR branch keeps that precedence: the plan
  special case is evaluated first, and only `#42`, a PR URL, or a non-four-digit bare number
  reaches PR resolution. An argument matching both stays ambiguous and is asked about.
- **Remote prose uses `language.forge`; deduplication reuses `Signature`.** Comment bodies, the
  summary, and any reply are authored in the resolved `language.forge`, consistent with every other
  Effective Flow forge artifact; finding IDs, the marker, action values, and helper payload fields
  stay stable. Repeat suppression on a re-run does not need new machinery: the normalized
  `Signature` that `review` already uses for tracker deduplication identifies a finding across
  runs, and a finding whose signature already appears in a marked thread is not posted again.
- **`review.md` does not grow a third inline publication path.** At 509 lines it is already the
  largest tool source. The PR publication and the Mode C handoff live in the new shared include;
  `review.md` gains the argument branch and a scope rule only.

## Affected files

| File                                                                   | Description                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/pr-review-integration.md`                                  | New shared include: the Mode C judgment handoff for Effective Flow findings, the automatic trigger with its gated/autonomous rule, the publication contract, and the marker. |
| `src/tools/review.md`                                                  | PR-argument branch after the plan special case; PR scope resolution; route the Phase-3 finding set through the new include instead of a third inline publication path.       |
| `src/shared/worktree-integration.md`                                   | Invoke the trigger at the end of step 5's `pr` branch, before the step-6 checkout restore.                                                                                   |
| `src/tools/apply-review-remote.md`                                     | Invoke the same trigger after its own `{{SKILL:pr}}` call.                                                                                                                   |
| `src/tools/apply-issues.md`                                            | Invoke the same trigger after its own `{{SKILL:pr}}` call.                                                                                                                   |
| `src/shared/pr-review-comments.md`                                     | Extend the PR plumbing block with outbound review submission and the new marker; it is currently scoped to `iterate` only.                                                   |
| `src/tools/build.md`, `src/tools/refactor.md`, `src/tools/maintain.md` | Hand the residual reviewer finding set of their review phase to the delivery completion action, so the automatic step publishes instead of re-reviewing.                     |
| `src/tools/fix.md`, `src/tools/docs.md`                                | Declare that they supply no complete finding set, so the include falls back to a real review of the pull request.                                                            |
| `src/tools/iterate.md`                                                 | Skip threads carrying `<!-- effective-flow-pr-review -->` by default.                                                                                                        |
| `src/scripts/remote-tracker-core.mjs`                                  | New `review-create` operation, capability key, payload builder, GitHub adapter path, Forgejo fail-closed path.                                                               |
| `src/scripts/remote-tracker.mjs`                                       | Expose `review-create` through the JSON CLI entry point.                                                                                                                     |
| `src/shared/config-migration.md`                                       | Document `delivery.prReview` with its values and default in the ADR table encoding.                                                                                          |
| `src/tools/setup.md`                                                   | Offer `delivery.prReview` in the wizard.                                                                                                                                     |
| `test/remote-tracker.test.mjs`                                         | `review-create`: payload shape, GitHub path, Forgejo `UNSUPPORTED_CAPABILITY` without side effect, redaction and envelope contract.                                          |
| `test/workflow-contracts.test.mjs`                                     | The new include resolves in all three targets; the three call sites reference it; `review.md` keeps its plan-reference precedence.                                           |
| `docs/developer-guide/skill-ownership.json`                            | Add `review` and the delivery contract as consumers of `pr-review`, classification `delegate`.                                                                               |
| `docs/developer-guide/skill-ownership.md`                              | Explain the two new consumer relationships and the boundary that Effective Flow keeps publication.                                                                           |

## Implementation details

### Approach

1. **Add `review-create` to the helper** with its capability key and both provider paths, and cover
   it with unit tests before any Markdown source depends on it. The payload carries a review body,
   a neutral event, and an array of `{path, line, side, body}` comments.
2. **Write `src/shared/pr-review-integration.md`.** It defines, in this order: how a resolved pull
   request and its change set are obtained from explicit refs; how a supplied finding set is
   accepted and how a missing one triggers a real review instead; how Effective Flow findings are
   packed as Mode C items with stable IDs, location, and surrounding-code evidence, together with
   the caller constraints (Effective Flow owns authority, approval, publication, delivery); how the
   returned classifications map onto publish / follow-up / drop; how the security gate and the
   design-decision filter run **before** publication; the `review-create` call with its
   `UNSUPPORTED_CAPABILITY` fallback; the marker; and the automatic trigger with its gated
   question and its autonomous silence.
3. **Extend `review.md`.** After the existing plan-file special case, resolve a PR reference. On a
   match, set the scope to the pull request's changed files, run Phases 2 and 3 unchanged, and let
   Phase 4 publish through the new include instead of the local report or the issue path. Preserve
   the four-digit precedence and ask on genuine ambiguity.
4. **Wire the three delivery call sites** to the include, each passing the created pull request,
   the head and base refs, whether the run is gated or under an authorized goal, and its residual
   finding set or an explicit declaration that it has none.
5. **Adjust `iterate`** to skip the new marker.
6. **Record configuration and ownership:** `delivery.prReview` in the config migration block and
   the setup wizard; both skill-ownership files.
7. **Run the repository's CI sequence:** `pnpm agent:check`, `pnpm test`, `node build.mjs`,
   `pnpm test:distribution`.

### Component structure

No new agent and no new tool. The existing reviewer agents produce findings; `pr-review` Mode C
judges them; the new shared include is the only new component and owns the handoff, the trigger,
and the publication.

### State management

No new runtime state. Finding IDs continue to come from the existing shared memory-state mutation
contract against `RUNTIME_STATE_ROOT`; the security disclosure gate continues to write withheld
findings to `.effective-flow/review/`. The automatic trigger persists nothing of its own —
repeat-suppression comes from reading the pull request's existing marked threads fresh before every
write.

### API integration

Only through `scripts/remote-tracker.mjs`. GitHub gains review submission; Forgejo returns
`UNSUPPORTED_CAPABILITY` and the include falls back to one `pr-comment`. Pull requests stay on the
forge behind `origin` regardless of `tracker.mode`, per the existing PR-plumbing boundary.

### Styling approach

Not relevant — no user interface.

### Accessibility

Not relevant — the output is Markdown in a forge UI.

### Edge cases

- **Ambiguous argument to `review`.** A value that resolves to both a plan and a pull request is
  reported with both interpretations and asked about; it is never guessed.
- **`review <PR>` where the pull request is merged or closed.** Review read-only and report that no
  comments were posted, rather than writing to a closed pull request.
- **Security-classified finding.** Withheld from the pull request and written to the local report
  under the existing gate. Publication to a pull request never carries an unconfirmed
  security finding, and no configuration key changes that.
- **Finding outside the diff.** Cannot be anchored inline; it goes into the review body under a
  clearly labelled section.
- **Empty finding set.** On the explicit `review <PR>` entry point, post one short summary so the
  reviewed state is visible. On the automatic trigger, post nothing and report in chat, so a clean
  delivery does not add noise to its own pull request.
- **`pr` reused an existing pull request instead of creating one.** The trigger still runs; the
  fresh read of marked threads and of what changed since the last marked review decides whether
  anything new is published.
- **Forgejo.** `review-create` unsupported: one structured summary comment with `file:line`
  references, and the reduced fidelity is reported.
- **`pr-review` unavailable** (not installed, `skills.enabled: false`, excluded). Publish the
  Effective Flow findings that survive the existing filters, disclose that the PR-level judgment
  was unavailable, and do not invent the missing classification.
- **Delivering workflow reports an empty residual finding set.** Nothing is published and the
  automatic step ends silently; it does not fall back to a fresh review, because an empty set is a
  result, not a missing input.
- **Pull request from a fork or another repository.** `review <PR>` reports that only pull requests
  of the current repository are supported and does not attempt a cross-repository review.
- **Push or PR creation failed.** No review runs; there is nothing to comment on.
- **Missing or unauthenticated CLI.** Abort the publication cleanly with the existing
  `CLI_MISSING` / `AUTH_FAILED` handling; never silently downgrade to a local report without
  saying so.

## Acceptance criteria

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.
- [ ] `test/remote-tracker.test.mjs` covers `review-create` for the GitHub payload shape and
      asserts the Forgejo path returns `UNSUPPORTED_CAPABILITY` without a side effect.
- [ ] `/effective-flow review <PR-URL>` on an open pull request publishes inline comments anchored
      to the correct `file:line` plus one summary, all carrying
      `<!-- effective-flow-pr-review -->`.
- [ ] `/effective-flow review 0033` still resolves the legacy plan reference and starts a plan
      review, not a PR review.
- [ ] A gated `/effective-flow build` run that completes with `pr` asks exactly once whether the
      pull request should be reviewed now, and posts nothing when the answer is no.
- [ ] The same run under an authorized `/goal` posts the review without asking and without
      stalling at a gate.
- [ ] `delivery.prReview: off` suppresses the automatic trigger while
      `/effective-flow review <PR>` still works.
- [ ] A run whose finding set contains a security-classified finding publishes that finding to the
      pull request only after the existing per-run confirmation, and otherwise writes it to the
      local report.
- [ ] `/effective-flow iterate` against a pull request reviewed by this mechanism classifies zero
      items from the tool's own threads.
- [ ] Re-running the automatic trigger on an unchanged pull request posts no duplicate comment,
      recognised by the normalized `Signature` of an already-published finding.
- [ ] A gated `build` delivery that answers yes starts **no** second reviewer fan-out: the
      published comments come from the Phase-6 finding set.
- [ ] A `docs` delivery, which has no review phase, does run a real review of the pull request
      before publishing.
- [ ] Published comment bodies and the summary are authored in the resolved `language.forge`.
- [ ] `docs/developer-guide/skill-ownership.json` lists `review` and the delivery contract as
      consumers of `pr-review`, and `skill-ownership.md` explains both.
- [ ] `review.md` has not gained a third inline publication path; the PR publication lives in the
      shared include.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` — the sequence CI
  runs, per `AGENTS.md`.
- New unit tests for the `review-create` payload builder and both provider paths.
- Contract tests that the new include resolves in the Claude, Codex, and portable targets and that
  all three call sites reference it.
- A manual run of `/effective-flow review <PR>` against an open pull request of this repository,
  then a gated `build` delivery answering both yes and no, then a repeat run to prove idempotency,
  then an `iterate` run to prove marker separation.

### Stop conditions

Stop and return to planning rather than improvising when:

- Mode C's five classifications turn out not to carry self-generated findings usefully — that is
  the signal that the handoff needs a contract change in the skills repository, which is outside
  this plan;
- the delivery contract cannot invoke the trigger before the step-6 checkout restore without
  reordering steps that the worktree lifecycle depends on;
- `review-create` on GitHub needs a different API shape than one review submission with an inline
  comment array;
- wiring the PR path into `review.md` cannot be done without a third inline publication path;
- a change to `src/scripts/remote-tracker-core.mjs` would reach beyond the new operation and its
  capability wiring, since that file is covered by existing contract tests.

## Assumptions and open points

- Mode C is assumed to judge Effective Flow's own findings as well as it judges incoming reviewer
  comments. Its fields `proposed_reply` and action `caller_reply` are shaped for replying to a
  person; here `proposed_reply` carries the comment text. This is a slight stretch of the contract,
  used deliberately because it avoids changing the skill. If it proves awkward in practice, a
  dedicated mode in the skills repository is the follow-up, not a local reinterpretation.
- The two plans are independent. `skills.sebastian-software.com/docs/plans/pr-review-codebase-context.md`
  gives `pr-review` context beyond the diff; this plan wires the skill into Effective Flow. Either
  may ship first, and this plan does not depend on that one.
- A formal verdict (approve or request changes) is deliberately not implemented and would need its
  own decision.
- Auto-generated diagrams, confidence scores, and severity badges are out of scope; Effective Flow
  keeps its Critical / Important / Note vocabulary.
- `{{SKILL:pr}}` invoked directly by the user does not trigger an automatic review. That follows
  from the decision to keep `pr` free of validation responsibility; `/effective-flow review <PR>`
  is the explicit path in that case.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         4 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         3 |    0 |
| Maintainability |        0 |         1 |    0 |

### Findings

- Security, important: full delegation to `pr-review` Mode A would bypass the security disclosure
  gate that `review.md:506` declares unconditional. Incorporated: Effective Flow keeps
  classification and publication, and the skill supplies judgment only.
- Architecture, important: Mode C cannot author a review — it forbids discovery and only
  classifies supplied items. Incorporated: Effective Flow's own reviewer agents produce the
  findings and Mode C judges them, so the existing contract is used without modification.
- Error cases, important: the delivery contract restores the checkout to the base branch in step 6,
  so a review running after delivery would read base-branch content. Incorporated: the trigger runs
  at the end of step 5 and resolves content from explicit refs rather than the working tree.
- Architecture, important: `apply-review-remote` and `apply-issues` create pull requests without
  going through the delivery contract, so a single hook there would have missed them.
  Incorporated: one shared include invoked from three call sites.
- Scope, important: a question after the autonomous approval boundary would strand a `/goal` run,
  against `goal-completion.md:34`. Incorporated: gated asks, autonomous proceeds silently.
- Error cases, important: `review-create` does not exist in the helper, and Forgejo already fails
  closed on comparable review operations. Incorporated: new operation with a capability key and a
  summary-comment fallback.
- Architecture, note: publishing Effective Flow's own findings to a pull request would feed
  `iterate` its own output. Addressed by the distinct marker plus the `iterate` change, with an
  acceptance criterion covering it.
- Scope, important: a bare four-digit argument to `review` is a legacy plan reference today.
  Incorporated: the plan special case is evaluated first and the precedence is pinned by an
  acceptance criterion.
- Maintainability, important: `review.md` is already the largest tool source and would have gained
  a third publication path. Incorporated: the PR publication lives in the new shared include.
- Testability, important: "the review works" is not measurable. Incorporated: the acceptance
  criteria pin the gated question, the autonomous path, the `off` value, marker separation,
  idempotency, and the preserved plan precedence.
- Scope, important (deep review): the automatic step would have re-run the same reviewer agents
  over the same diff that `build`, `refactor`, and `maintain` had just reviewed, paying a second
  full agent pass for largely known findings. Decision taken: publish the workflow's residual
  finding set instead of re-reviewing, and fall back to a real review only for `fix` and `docs`,
  which demonstrably produce no complete set.
- Error cases, important (deep review): `fix` routes only the generic product reviewer for degraded
  buckets and `docs` has no review phase, so a blanket "reuse the workflow's findings" rule would
  have published nothing for them. Incorporated as the explicit fallback, with an acceptance
  criterion for the `docs` case.
- Architecture, important (deep review): remote prose language and cross-run deduplication were
  unspecified. Incorporated: `language.forge` for all published prose, and the existing normalized
  `Signature` as the repeat-suppression key rather than a new mechanism.
- Data protection, note: the mechanism publishes to a pull request, a more exposed surface than a
  local report. The security gate and the withheld-finding report path stay unchanged.

## Test results

Verified in the delivery worktree against base `ce39c8a`, running the sequence `AGENTS.md`
prescribes:

| Check                    | Result                                                |
| ------------------------ | ----------------------------------------------------- |
| `pnpm agent:check`       | passed, 251 files                                     |
| `pnpm test`              | 370 tests, 370 passed, 0 failed                       |
| `node build.mjs`         | passed; always-loaded core `review` 630 of budget 700 |
| `pnpm test:distribution` | passed (offline checks)                               |

New coverage: `test/remote-tracker.test.mjs` gained the `review-create` payload contract, the
executor-level ordering proof that validation runs before the runner is reached, the Forgejo
`UNSUPPORTED_CAPABILITY` path with a zero-call assertion, the pinned neutral event, marker
stamping, redaction, capability declarations and the AI-attribution guard.
`test/workflow-contracts.test.mjs` gained the fragment's render across all three targets, the
call-site wiring, the plan-reference precedence in `review.md` and an assertion that no
configuration key can make the security disclosure gate optional.

Deviation from the plan: `src/scripts/remote-tracker.mjs` needed no change. It dispatches any
operation string to the executor and carries no allowlist, so registration in the operation table
is what exposes `review-create`. Two files not named in the plan's table were changed as required
consequences: `docs/developer-guide/skill-ownership.json` and `.md` also record the five delivering
workflows as consumers, because the build guard rejects a skill recommendation whose consumer has
no declared relationship.

## Review findings

**Date:** 2026-07-27
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    24 |
| Open / Not implemented |     3 |

The review found three critical defects, all in the same root cause: the new shared fragment
asserted in prose that its callers load the security disclosure gate and the PR plumbing, when in
fact only `review.md` did. At the three automatic call sites the unconditional security gate was
therefore unreachable and the publication had no operation definitions. The fragment now loads both
dependencies itself. The third critical defect collapsed three caller input states into two, which
made the `fix`/`docs` fallback unexecutable; the fragment now names `finding-set`,
`reviewed-empty` and `no-review-capability` and binds one behaviour to each.

**External review report:** `.effective-flow/review/review-report-2026-07-27-plan-pr-review-integration.md`

## Open points

- No open points.

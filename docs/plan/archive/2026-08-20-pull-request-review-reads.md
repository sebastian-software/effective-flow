# Read pull-request reviews and act on their verdicts

**Plan status:** Implemented
**Source:** effective-flow plan-issue (issue #364)
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `830e07a` on 2026-08-20 — the tip of `origin/develop`, which the delivery
worktree branched from.

## Requirement

`merge-gate` and `iterate` reason about an automatic reviewer through two surfaces only: its check
context and its review threads. The review object itself was never read on GitHub, and on Forgejo it
was read and then discarded down to `review.id` by the review-thread walk. A **changes-requested
verdict**, and any finding a reviewer carries only in its **review body**, therefore sat outside
every merge precondition the gate evaluated — the gate reported every condition satisfied and merged.

The fix has two halves that cannot ship apart: the helper gains a review read, and both workflows act
on what it returns. The helper operation has no consumer on its own, and neither the gate condition
nor the guard change can be written before the read exists.

## Architecture decisions

### 1. One new helper operation, served on both providers

`pr-reviews-read` (capability key `prReviewsRead`) is a **read**, absent from `MUTATIONS` and present
in `REMOTE_OPERATIONS`. It carries a **named** entry in `CAPABILITY_BY_OPERATION`, which is not
optional bookkeeping: the operation gate tests `capabilities[key] === false`, so an absent key is
`undefined` and the operation would be waved through unprobed on every provider — reporting "no
reviewer requested changes" on a forge that never answered the question.

Per review it returns `{ id, url, author, commitSha, state, body, submittedAt }`, with
`normalizeAuthor` reused verbatim so "Matching a configured login" resolves a reviewer here exactly as
it does on a comment or a thread.

On **GitHub** it reads `pulls/{n}/reviews` with `--paginate --slurp` plus an explicit `per_page=100`,
matching `label-list`, `issue-list` and `pr-list` rather than `pr-comments-read`, which omits the page
size. `flattenPages` collapses the slurped pages, and the generic tail publishes `data.command`
singular.

On **Forgejo** it is served rather than refused, reusing the `teaApiReadPlan` +
`forgejoPagedEndpoint` + `readForgejoPaginated` path that `review-threads-read` already uses against
the same route, with `totalIsExact: false`.

### 2. The review state is a provider-neutral enum, resolved inside the helper

The two forges spell the same verdicts differently, so a rule keyed on either spelling would ship,
pass every test, and never fire on the other provider. `normalizeReviewState` reconciles both
vocabularies exactly as `AUTHOR_ACCOUNT_TYPES` reconciles the two-vocabulary account class:

| Neutral token       | GitHub              | Gitea/Forgejo (`modules/structs/pull_review.go`) |
| ------------------- | ------------------- | ------------------------------------------------ |
| `APPROVED`          | `APPROVED`          | `APPROVED`                                       |
| `CHANGES_REQUESTED` | `CHANGES_REQUESTED` | `REQUEST_CHANGES`                                |
| `COMMENTED`         | `COMMENTED`         | `COMMENT`                                        |
| `DISMISSED`         | `DISMISSED`         | `dismissed: true` (a **flag**, not a state)      |
| `PENDING`           | `PENDING`           | `PENDING`                                        |
| `REVIEW_REQUESTED`  | —                   | `REQUEST_REVIEW`                                 |
| `UNKNOWN`           | anything else       | anything else, including the empty state         |

Gitea models dismissal as a separate boolean beside an unchanged `REQUEST_CHANGES` state, so the flag
is folded into the dismissed token — without that fold a dismissed Forgejo verdict would leave the
merge blocked with no clearing path at all. An unrecognized value fails closed as `UNKNOWN` and the
raw provider spelling is never passed through.

Every Gitea field is read by its **JSON tag**, never by its Go field name: `Reviewer` is `user`,
`ReviewerTeam` is `team`, `CommitID` is `commit_id`, `Submitted` is `submitted_at`, `HTMLURL` is
`html_url`. That divergence is the same one that shipped as #354 inside the neighbouring
`PullReviewComment` struct.

### 3. Forgejo needs its own `executeOperation` branch

The generic pagination branch is hard-coded to `issue-list` and `pr-list`, and the only other
paginated Forgejo path is the named branch for `review-threads-read`. Without a branch of its own the
new operation falls through to the generic tail, issues one request for page 1, and reports a
truncated list as complete — silently dropping exactly the review this feature exists to catch. The
named branch keeps `totalIsExact: false`, because `ListPullReviews` counts pending reviews that
`convert.ToPullReviewList` then omits, and publishes `data.commands` **plural** as every paginated
Forgejo read does.

### 4. One supersession rule, in `review-bot-state.md`

Four sites consume the rule; it lives once, in the shared fragment both tools already load, and each
site references it. A later **approved** review at the same head clears the verdict, a **dismissal**
clears it, and a later **commented** review **never** does — treating a commented review as
superseding would let a reviewer request changes in its body, add one inline comment at the same
head, and clear the condition silently, reopening the exact gap #364 reports.

### 5. Condition 10, appended rather than inserted

Eleven ordinal cross-references in `merge-gate.md` and several in the test suite would silently
retarget on an insertion, so the new precondition is appended as condition 10. It blocks the merge
while a configured reviewer's **latest** changes-requested review for `VERIFIED_HEAD_SHA` has not been
assessed by this run — per finding, implemented, deferred or rejected. What blocks is the **absence of
an outcome**, never the disagreement: the gate never writes a verdict and must not begin enforcing one
it is forbidden to write.

### 6. The guard gains a third counting surface

A changes-requested review body is the load-bearing half of this fix, because with the default empty
`mergeGate.bots` condition 10 is vacuous by construction. The surface is restricted to that one state,
decided on the **latest** review per author, and evaluated by the existing author rules verbatim with
no exclusion rule reading a body.

### 7. `iterate` reads reviews too

The shared fragment is loaded by both tools and evaluated independently against each one's own fresh
read. Widening one consumer alone would make the two disagree about the same pull request — the drift
that fragment's contract exists to prevent. It also closes the standalone case: an `iterate <PR>`
invoked directly was blind to a body-only finding.

## Affected files

- `src/scripts/remote-tracker-core.mjs` — `REMOTE_OPERATIONS`, `CAPABILITY_BY_OPERATION`, the GitHub
  and Forgejo `buildCommandPlan` cases, `normalizeReviewState` + `normalizeReview`,
  `normalizeRemoteData`, the named Forgejo `executeOperation` branch, and both probes. Not
  `MUTATIONS`, not `src/scripts/remote-tracker.mjs` (a generic dispatcher), not `build.mjs` (both
  helper files are already in `RUNTIME_SCRIPT_FILES`).
- `src/shared/review-bot-state.md` — the widened fallback evidence set, the new supersession section,
  the re-scoped in-place-edit bullet, and the narrowing-window obligation.
- `src/shared/pr-review-comments.md` — the intro operation inventory, a new read section for the
  submitted reviews, and the Forgejo limitation paragraph including its "Two further operations"
  miscount over a three-item list.
- `src/shared/issue-tracker.md` — the `### Tracker operations` prose inventory.
- `src/tools/merge-gate.md` — the goal list, Phase 0's capability read list and degradations, Phase 1's
  fresh read and third counting surface, the wisdom keys, the delegation contract, Phase 3's
  per-finding record, round accounting, the Phase 4 preamble, condition 5, condition 10, the
  unmatched-review report, Phase 6, the edge cases, and the rules.
- `src/tools/iterate.md` — Phase 1's review read and its degradation, Phase 1.5's observation, the
  free-text provenance and stable-identifier contract, and the Mode C classification of a review body.
- `test/remote-tracker.test.mjs`, `test/workflow-contracts.test.mjs`.
- `docs/user-guide/remote-tracker.md`, `docs/user-guide/troubleshooting.md`,
  `docs/user-guide/tools-deliver.md`.

## Implementation details

- **Round accounting** is stated over the **return** rather than over one condition's name. Two
  conditions now return into Phase 3 — 7 and 10 — and a rule bound to one by name leaves the other
  unbounded the day it is added. One Phase-4 evaluation performs at most **one** return, carrying
  every unmet returning condition's items together and consuming exactly one round; counting them
  separately would spend two of the default three rounds on a pull request a single round can clear.
- **The two failure causes are separated.** A review list unreadable _this time_ blocks and returns
  into Phase 3. An **absent capability** cannot become readable by returning, so it mirrors the
  `pr-checks-wait` degradation: report the unestablished verdict and ask once in a gated run, never
  merge in a non-interactive one.
- **Free text gains a caller-supplied stable identifier.** `iterate`'s return contract requires one
  returned item per supplied stable id, and free text carried none — so a round delegating two body
  findings from two reviews produced outcomes the gate could not map back to either review. The
  `Item filter:` grammar is **not** extended; a body-only delegation with zero threads announces
  `Item filter: free-text-only`, because an empty `threads=` list is unparseable and aborts.
- **The review-guard exemption's grounds are corrected.** They justified the exemption by asserting
  that `free-text-only` is issued _before_ this run has observed any reviewer, which a Phase-3
  body-only delegation falsifies. The CI-repair exemption now rests on its **scope**; every Phase-3
  delegation rests on the observation the gate already performed.
- **Reporting is per finding, never binary.** A binary "assessed" cannot distinguish an implementation
  from an auto-classification reached with nobody present, which a non-interactive delegated run
  permits. Phase 6 reports every configured reviewer's changes-requested review at the verified head
  with each finding's outcome, even when another condition already blocks, plus every
  changes-requested review whose author matched no configured login.
- **Three positional contract tests** selected their subject with `findIndex(/assessed/i)`, and
  condition 10's own text contains that word. Each now targets its condition by **ordinal**; the
  `conditions.length >= 7` guard became `>= 10`, and every continuation paragraph of condition 10 is
  indented so the list terminator cannot truncate the slice.

## Acceptance criteria

- [x] `pr-reviews-read` exists in `REMOTE_OPERATIONS`, is absent from `MUTATIONS`, and carries a named
      `CAPABILITY_BY_OPERATION` entry.
- [x] The GitHub plan is `api --paginate --slurp repos/<o>/<r>/pulls/<n>/reviews?per_page=100`.
- [x] Each review normalizes to an id, a URL, a normalized author record, the commit it was
      submitted against, the neutral state, the body and the submission time, with `normalizeAuthor`
      reused verbatim.
- [x] The neutral enum maps both vocabularies, folds Gitea's dismissal flag, and fails closed; tests
      pin it on both providers.
- [x] Forgejo serves the operation through a named `executeOperation` branch, keeps
      `totalIsExact: false`, and publishes `data.commands`; a test reads a two-page listing to
      exhaustion.
- [x] Probe capabilities declare `prReviewsRead` on both providers and the suite asserts both, plus
      the refusal when the transport probe fails.
- [x] Phase 4 carries condition 10 with its head binding, its fail-closed causes, its capability
      separation, and its bounded return.
- [x] Round accounting and the Phase-4 preamble bind the return rather than one condition's name, and
      state the one-return/one-round rule; the contract test asserts both sites.
- [x] A changes-requested review is the guard's third counting surface, restricted to that state and
      decided on the latest review per author.
- [x] The wisdom keys and the Phase-6 excluded-item report accept a review identifier.
- [x] `iterate` reads reviews in Phase 1 with its own degradation rule, accepts a caller-supplied
      stable identifier for free text, and classifies a review body through Mode C.
- [x] Every contradiction listed in the specification is corrected rather than left standing, and a
      contract test pins both the deletion and its replacement.
- [x] Documentation: the operation table gains a row, "five additional forge operations" becomes six,
      the support paragraphs and the `UNSUPPORTED_CAPABILITY` list are updated, and
      `tools-deliver.md` gains a `####` subsection cross-linked twice.
- [x] Contract prose names the operation and its capability key and quotes no `gh api`, no `tea`
      invocation and no GraphQL query block; new prose uses `{{SKILL:iterate}}`.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` all pass.
- [x] The skill-ownership check was run: the change adds no second copy of a centrally owned
      playbook. Review-body classification is routed to `pr-review` through `iterate`, whose
      `delegate` relationship is already declared; `merge-gate` remains deliberately absent from that
      skill's consumers, so `skill-ownership.json` needs no change.

## Validation plan

- `pnpm agent:check` → `pnpm test` → `node build.mjs` → `pnpm test:distribution`, in that order, as
  `AGENTS.md` prescribes after editing distribution sources.
- New helper tests in `test/remote-tracker.test.mjs`: the GitHub plan shape and normalization
  (including a pending review with no submission time, a dismissed verdict, and an unrecognized
  state), a two-page Forgejo listing read to exhaustion with the team-authored and dismissed cases, an
  empty listing, and the capability gate on both providers.
- New prose assertions in `test/workflow-contracts.test.mjs`: both consumers read the reviews, the
  supersession rule lives once and is referenced, condition 10's contract, the guard's third surface,
  the per-finding and unmatched-review reports, iterate's identified free text, and the retired
  contradictions with their replacements.

## Assumptions

- **With the default empty `mergeGate.bots`, condition 10 is vacuous by construction.** On a default
  configuration the protection comes entirely from the guard change, which is therefore the
  load-bearing half of this fix and the change with the largest blast radius — it can hold a merge on
  a pull request that merges today.
- **Adding a submitted review to the fallback signal is a block-to-pass change**, not only a
  visibility fix: on a project with no configured `.check`, a reviewer that publishes reviews flips
  from **not started** to **has run**. The direction is legitimate — a submitted review is proof
  rather than an assumption — but it changes current behavior and ships as such.
- The Gitea JSON tags and state values are read against `15.0.3+gitea-1.22.0`, the instance the
  adapter already records as its verification reference. This repository pins no server-side floor,
  only CLI floors, so this stays a human verification step rather than a CI-checkable criterion.
- No new `mergeGate.*` configuration key. The rule is fixed and fail-closed.
- The change ships as `feat:` — it adds a capability and blocks merges that succeed today.
  Release-please derives the bump; no manual version edit, no `Co-Authored-By` trailer, no AI
  attribution.

## Open points

- No open points.

## Plan review

**Result:** Approved

The canonical planning comment on issue #364 carries the full plan review — 3 critical, 15 important
and 12 note findings across architecture, security, data protection, error cases, testability, scope
and maintainability, all incorporated before implementation and none left open. The three critical
findings were: a commented review treated as superseding a changes-requested verdict; a review-state
vocabulary not shared between providers; and a Forgejo read that would have returned page 1 and called
it complete. Each is resolved by an architecture decision above.

## Review findings

**Date:** 2026-08-20
**Reviewer:** none — the delivery ran as a non-interactive issue application with no reviewer routed

### Summary

No findings found.

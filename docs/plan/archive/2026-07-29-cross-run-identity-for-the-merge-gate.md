# Cross-run identity for the merge gate's own comments

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Bugfix (`/effective-flow fix`)

## Requirement

`/effective-flow pr-review` sets a human-comment guard: if any unresolved comment or thread on the
pull request has a human author, the run implements no review note and merges nothing. To do that it
must tell its own writes apart from a person's.

Today it does so through the comment or reply ID returned by its own mutation
(`src/tools/pr-review.md:279`, `:290`). That ID exists only for the lifetime of one run. A second
run on the same pull request no longer has it, reads the first run's own trigger comment and thread
replies as human-authored, activates the guard, and can never merge again. The tool is therefore
single-use per pull request: the first run may merge, every later one is permanently blocked by its
own output.

Fix it so the gate recognizes its own writes across runs, under both of the operating modes this
tool is meant for:

- **App mode** (planned): the gate posts as a dedicated bot account, like Greptile does.
- **Manual mode** (today): the gate posts as the operator's own account, and must reveal nothing
  about who or what composed the comment.

## Architecture decisions

- **App mode needs no new mechanism at all.** When the posting account is a bot, the already
  shipped rule — a login listed in `prReview.bots`, or a normalized `authorType: bot` — excludes the
  gate's writes on its own. No identity lookup, no body signal, nothing disclosed. The work below
  exists only because manual mode shares one account between tool and person.
- **A deferred finding gets no thread reply at all.** When the gate assesses a bot finding but does
  not implement it — because the human guard is active, or because the finding was rejected — it
  reports that to the user in chat and writes nothing into the thread. This **supersedes the earlier
  decision** that the guard permits replies; the later decision is deliberate and is recorded here
  so the two are not read as a contradiction. Resolving such a thread would signal "handled" for a
  finding nobody handled, and leaving an unresolved reply behind is precisely what reintroduces the
  cross-run defect this plan exists to remove.
- **The consequence is that the gate's only own write is the trigger comment — but only once the
  delegated run's summary comment is suppressed.** _Corrected during implementation; the original
  decision was wrong._ It claimed the invariant held because replies come from `{{SKILL:iterate}}`,
  which resolves its own threads. It overlooked that `iterate` also posts one **top-level summary
  comment per delegated round**, authored by the operator's account in manual mode. That comment is
  not a bot, sits in no thread, and does not match the trigger text, so under the very rules this
  plan introduces it counts as human and activates the guard — relocating the defect one delegation
  deep and firing even on the first run, where Phase 4's fresh read would block the merge the run
  had just earned. `iterate` therefore gains an optional suppression switch, additive and modelled
  on its item filter, which the gate sets for every round it delegates. The gate reports everything
  in chat anyway, so nothing is lost and up to `prReview.maxRounds` summary comments of noise are
  avoided.
- **An item inside a resolved thread does not count when this tool authored it.** _Narrowed during
  implementation._ The decision originally read "whoever authored it", which made it the only
  fail-open path in the whole guard: GitHub does not auto-unresolve a thread when someone replies,
  so a human reviewer objecting inside a thread `iterate` had resolved ("this fix is wrong, don't
  merge") would have been discarded and the gate would have merged under an open objection.
  Resolution is not consent. The rule now requires the author to be the `viewer-read` login or a
  bot; a reply from any other account inside a resolved thread still counts. The case the plan
  actually needed — `iterate`'s own replies sharing the operator's account — is unaffected.
- **The trigger comment is recognized by its own configured text, not by a marker.** Its body is the
  literal `prReview.bots.<login>.trigger` value the project configured; the gate knows that string.
  An item whose complete body equals that value **and** whose author is the authenticated identity
  is the gate's own trigger. This is exact, needs no persistence, and puts nothing in the body that
  says a tool — let alone a language model — wrote it.
- **The gate stops writing the `<!-- effective-flow-pr-gate -->` marker.** This follows from the
  decision above rather than extending it: a marker left on the gate's writes would keep the raw
  body carrying `effective-flow-pr-gate`, which is exactly the disclosure this change exists to
  avoid. With the marker gone, its two jobs are taken over by evidence that already exists:
  authorship decides the guard, and the trigger comment's own configured text plus its timestamp
  decide repeat suppression. Nothing else needs suppressing, because the trigger is the only thing
  the gate writes. Keeping a marker the gate never writes would leave the same dead contract this
  tool has now been bitten by twice.
- **Identity comes from a new `viewer-read` operation, not from the probe.** Capability key
  `viewerRead`; on GitHub it maps to `gh api user` and returns the authenticated login and account
  type. The probe already calls `gh auth status`, whose human-readable output happens to contain the
  login, but parsing CLI prose contradicts the helper's own rule against reading anything but
  normalized JSON. Putting `gh api user` into the probe instead would charge every probe caller a
  network round trip for a value only this tool needs.
- **Bot authorship is evaluated before the identity lookup, and the fail-closed rule binds only the
  manual path.** An item excluded because its author is a configured bot or carries
  `authorType: bot` never reaches the identity comparison. This ordering is load-bearing rather than
  cosmetic: in app mode `gh api user` may legitimately fail on an installation token, and a global
  fail-closed rule would then block the one mode that never needed the identity in the first place.
- **Every unresolvable case on the manual path fails closed.** A failed or unsupported
  `viewer-read`, or an absent authenticated login, means the gate cannot prove a non-bot item is its
  own, so the item counts as human and the guard activates. The consequence is a report instead of a
  merge, never a merge instead of a report.
- **Forgejo loses nothing it had.** It supports neither thread resolution nor `pr-merge`, so the
  gate already degrades to report-only there. A guard that stays active on Forgejo therefore blocks
  a merge that was impossible anyway; no separate Forgejo path is needed and none is invented.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/scripts/remote-tracker-core.mjs` | new `viewer-read` operation in `REMOTE_OPERATIONS` (not a mutation), `viewerRead` in `CAPABILITY_BY_OPERATION`, GitHub command plan via `gh api user`, normalizer returning the login and account type, capability flags in both provider probes (GitHub `true`, Forgejo `false`)                                        |
| `src/tools/pr-review.md`              | Phase 1 own-output class rewritten to the ordered bot / resolved-thread / identity-plus-trigger-text evaluation; a deferred finding is reported in chat instead of answered in its thread; Phase 3 trigger idempotency moved off the marker; fail-closed rules bound to the manual path; the marker is no longer written |
| `src/shared/pr-review-comments.md`    | document `viewer-read`; correct the marker contract so it describes two written markers, not three, and record why the gate deliberately writes none                                                                                                                                                                     |
| `src/tools/iterate.md`                | remove the now-dead exclusion of `<!-- effective-flow-pr-gate -->` from its Phase 2 list, and — **added during implementation** — an optional caller switch that suppresses its per-round pull-request summary comment, without which that comment would reintroduce the very defect this plan removes                   |
| `src/tools/setup.md`                  | **added during implementation:** the plan's own edge case required the distinctive-trigger requirement to be mentioned at the setup question, but the file was missing from this table. The documentation-sync gate cannot complete with that surface blocked                                                            |
| `test/remote-tracker.test.mjs`        | command plan, normalization, absent-value and capability tests for `viewer-read`                                                                                                                                                                                                                                         |
| `test/workflow-contracts.test.mjs`    | update the marker contract test to two written markers; assert the identity-plus-trigger-text rule, the thread-resolution rule and the fail-closed rules in `pr-review.md`                                                                                                                                               |
| `docs/user-guide/remote-tracker.md`   | document `viewer-read` and its Forgejo limitation                                                                                                                                                                                                                                                                        |
| `docs/user-guide/tools-quality.md`    | describe the two operating modes and what the gate does and does not write onto a pull request                                                                                                                                                                                                                           |

## Implementation details

### Approach

1. **Add `viewer-read` to the helper first**, with tests, before any prompt source names it. It
   returns the authenticated login and whether that account is a bot, so a caller can distinguish
   the two operating modes from one read. Absent provider values stay absent. Forgejo declares the
   capability `false` and fails closed.
2. **Rewrite the Phase 1 own-output class** in `src/tools/pr-review.md`, in this evaluation order:
   - an item authored by a configured `prReview.bots` login or carrying `authorType: bot` is
     excluded and the evaluation stops there — this is app mode and needs no identity;
   - an item inside a **resolved** thread does not count, whoever authored it;
   - otherwise, an item is the gate's own only when its author equals the `viewer-read` login **and**
     its complete body equals the configured `prReview.bots.<login>.trigger` value of some configured
     bot. The comparison is over the whole body after trimming surrounding whitespace; a partial or
     fuzzy match never qualifies;
   - everything else counts as human.
3. **Stop replying to a thread whose finding the run does not implement.** Report those findings to
   the user in chat instead. The gate then writes exactly one thing of its own — the trigger comment
   — and needs no thread resolution of its own to stay recognizable. Threads for findings that _are_
   implemented are answered and resolved by `{{SKILL:iterate}}` as before, and the resolved-thread
   rule in step 2 keeps those replies out of the guard.
4. **Move trigger idempotency off the marker.** A trigger has already been posted for the current
   head when a comment exists whose author is the `viewer-read` login (or the configured bot login
   in app mode), whose body equals the configured trigger text, and whose `createdAt` is not older
   than `headCommittedAt`. Both timestamp fields already exist.
5. **Stop writing the marker** from every gate write path, and remove the now-dead exclusion from
   `src/tools/iterate.md`. Correct the marker contract in `src/shared/pr-review-comments.md` to the
   two markers that are still written, and state in one sentence that the gate writes none by
   design, so a later reader does not restore it as an oversight.
6. **Update the contract tests** to the new marker count and to the three rules that now carry the
   guard, in their evaluation order: bot authorship first, then "an item inside a resolved thread
   does not count, whoever authored it", then identity plus exact trigger text — with fail-closed
   binding only that last, manual-path rule. Note that none of these obliges the gate to resolve a
   thread itself; it resolves nothing.

### Component structure

Not relevant — a Node.js helper operation plus Markdown prompt sources.

### State management

Unchanged, and deliberately so: no new persistence. The pull request stays the state. That
constraint is what rules out remembering comment IDs between runs and is the reason this plan
derives identity from the forge instead.

### API integration

One new read operation. It follows the existing envelope, dry-run, capability, redaction and error
contract. It is not a mutation, so it needs no `apply` gate.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **The operator writes the trigger text by hand** (`@greptileai` as their own comment): it is
  excluded. That is correct — a trigger is not a discussion, and treating it as one would block the
  merge for no reason.
- **A project configures a non-distinctive trigger text** such as `please review`: an ordinary human
  comment could then match it exactly and be excluded from the guard. Document the requirement that
  the trigger be a distinctive mention, and mention it at the setup question rather than silently
  depending on it.
- **`viewer-read` fails or is unsupported:** the gate cannot identify its own writes on the manual
  path, so every remaining non-bot item counts and the guard activates. Report the missing identity
  as the reason for the block, so the state is explainable rather than mysterious.
- **App mode with an installation token:** `gh api user` may fail there, but every item the gate
  wrote is already excluded by bot authorship before the identity is consulted, so the run proceeds
  normally. This is the case the evaluation order exists for; a test should pin it, because a later
  refactor that hoists the identity lookup would break app mode without failing anything else.
- **A thread `iterate` answered and resolved:** its replies do not count, whoever authored them, so
  a successful earlier run does not block the next one.
- **`iterate` on Forgejo** now meets unmarked gate output in unresolved threads, since the gate
  writes no marker. Harmless in practice — the gate is report-only there and the only unmarked item
  is a trigger comment `iterate` has no reason to act on — but worth stating so the absence of the
  marker is not later read as an oversight.
- **The authenticated identity changes between runs** (a different token): earlier writes are no
  longer recognized as own output and count as human. Fail-safe, and correct — the gate genuinely
  cannot prove they were its own.
- **A human quote-replies to a gate comment**, copying its body: with the marker gone there is
  nothing to copy that could mislead the guard, and the quoted body no longer equals the trigger
  text exactly. The bypass the previous fix closed cannot reappear through this route.
- **Forgejo:** thread resolution and `pr-merge` are both unsupported, so the gate is report-only and
  a permanently active guard costs nothing that was available.

## Acceptance criteria

- [ ] `pnpm test` passes, including new cases in `test/remote-tracker.test.mjs` asserting the
      GitHub command plan for `viewer-read`, its normalized output, an absent account-type value
      staying absent, and the Forgejo probe reporting `viewerRead` as unsupported.
- [ ] `test/workflow-contracts.test.mjs` asserts that exactly two Effective Flow pull-request
      markers are written; that `src/tools/pr-review.md` states the ordered evaluation with bot
      authorship first, the resolved-thread rule covering any author, and the
      identity-plus-exact-trigger-text rule; that a deferred finding is reported in chat rather than
      answered in its thread; and that an unprovable identity activates the guard rather than
      clearing it.
- [ ] A test pins that the identity lookup is consulted only after bot authorship, so app mode
      cannot be broken by a failing `gh api user`.
- [ ] `src/tools/pr-review.md` contains no instruction to write `<!-- effective-flow-pr-gate -->`,
      and `src/tools/iterate.md` no longer excludes it — verified by a test, so the dead contract
      cannot be reintroduced silently.
- [ ] `node build.mjs`, `pnpm agent:check` and `pnpm test:distribution` all exit 0.
- [ ] A second `pr-review` run on a pull request the tool already commented on reaches the merge
      decision instead of being blocked by its own output. This is the plan's actual goal and is
      verified manually against a real pull request; no unit test substitutes for it.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` — each exit 0.
- Manual, and required, because the defect is a cross-run behavior no unit test reaches: run
  `/effective-flow pr-review` twice against the same real pull request, with a bot finding the first
  run implements. The first run then leaves two things behind — its own trigger comment, and a
  thread that `{{SKILL:iterate}}` answered and resolved. The second run must recognize the trigger as
  its own through identity plus trigger text, disregard the resolved thread through the
  resolved-thread rule, keep the guard inactive, and proceed to the merge decision.
- Manual counter-check: have a second account post an ordinary comment, then run again and confirm
  the guard activates and the run reports instead of merging.
- Manual check of the new reply rule: with the guard active, confirm the run leaves every bot thread
  untouched and names the deferred findings in its chat summary instead.
- Manual disclosure check: read the raw body of every comment the gate wrote through the API and
  confirm none of them carries an Effective Flow marker or any other tool or model attribution.

## Assumptions and open points

- **Planning state:** planned at `e92401e`, 2026-07-29, clean working tree. Before execution,
  re-read `src/tools/pr-review.md` Phase 1 and Phase 3, `src/shared/pr-review-comments.md`, and the
  probe capability blocks in `src/scripts/remote-tracker-core.mjs`.
- **`gh api user` is verified, not assumed.** Run during planning against this repository's own
  authentication, it returned `{"id":209969,"login":"fastner","type":"User"}` with the token scopes
  already present (`gist`, `read:org`, `repo`, `workflow`) — no additional scope is required. Pin
  `login` and `type` in the normalizer; `type` (`User` versus `Bot`) is also the discriminator that
  lets a caller tell the two operating modes apart from a single read.
- **Thread resolution is no longer this plan's mechanism.** The gate resolves nothing itself, since
  it no longer replies to deferred findings. It relies only on `{{SKILL:iterate}}` resolving the
  threads it answers, which is already shipped behavior on GitHub, and on the resolved-thread rule
  added here. Where a provider cannot resolve threads the guard simply stays active, which on
  Forgejo blocks a merge that is unavailable there anyway.
- **The scope deliberately exceeds "the guard only" in one respect:** removing the marker from the
  gate's writes, and the resulting edits to `iterate.md`, the marker contract and its test. That is
  a direct consequence of the disclosure requirement, not an independent cleanup — a retained
  marker would defeat the purpose of the change.
- **Not in scope:** the other two places where an Effective Flow marker is read as authorship
  evidence — `iterate`'s own thread exclusion and the outbound publication's idempotency. Both share
  the pattern this plan removes from the gate, but neither can cause a merge; the worst outcome
  there is a skipped thread or a suppressed republication. They are named here so the inconsistency
  is recorded rather than forgotten, and they deserve their own change.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

The deep interactive review resolved one decision and incorporated four corrections; they are
recorded here rather than as open points.

- **Architecture, important — thread resolution did not actually solve the reply problem.** The
  first draft leaned on resolving a thread to make the gate's replies stop counting, but the rule it
  relied on speaks only of _threads_, never of the comments inside them. The mechanism would have
  silently failed. Resolved by stating the resolved-thread rule explicitly for any author — which is
  now needed for `{{SKILL:iterate}}`'s replies rather than the gate's own.
- **Error cases, important — a global fail-closed rule would have broken app mode.** `gh api user`
  can legitimately fail on an installation token, and the first draft let any unprovable identity
  activate the guard. Resolved by evaluating bot authorship first and binding the fail-closed rule
  to the manual path, with a test pinning the order.
- **Architecture, important — the reply behaviour under the guard was the real fix.** Deciding that
  a deferred finding gets no thread reply at all collapsed the problem: the gate's only own write is
  now the trigger comment, and no thread resolution of its own is needed. This supersedes an earlier
  decision that the guard permits replies, and the plan says so rather than leaving two rules
  standing.

- **Architecture, important — the identification now rests on a configuration value.** Recognizing
  the trigger comment by its exact configured text couples the guard to
  `prReview.bots.<login>.trigger`. If a project edits that value between two runs, the earlier
  trigger comment stops being recognized and counts as human, blocking the merge until it is
  removed. Accepted deliberately, because the alternative signals all disclose authorship, and
  mitigated by the fail-safe direction of the failure plus an explicit note at the setup question.
- **Testability, important — the actual defect is invisible to the unit suite.** Everything the
  suite can pin is structural: the operation, the normalizer, the marker count, the presence of the
  rules in the prose. That a _second_ run behaves differently from the first is a cross-run property
  that only a real pull request exercises, which is why the validation plan makes that manual run a
  required step rather than an optional one.
- **Scope, important — removing the marker exceeds the agreed "guard only" boundary.** It is
  recorded as such in the assumptions and follows from the disclosure decision rather than from
  convenience. A reviewer should confirm the ripple is limited to the four files named and does not
  reach the other two marker consumers, which stay untouched by design.
- **Architecture, note — two operating modes now share one code path.** App mode is handled by the
  pre-existing bot rule and manual mode by the new one, which means app mode never exercises the new
  logic. That is the desired asymmetry, but it also means the manual path carries all the risk and
  deserves the reviewer's attention.
- **Error cases, note — the identity assumption was verified during the review, not assumed.**
  `gh api user` was run against this repository's own authentication and returned `login` and
  `type` with the token scopes already present. That removed the plan's largest unknown; had the
  call required a scope the project does not grant, the whole approach would have needed replacing.
- **Security, note — the change removes a signal rather than adding one.** With the marker gone the
  gate writes nothing that identifies it, so the only remaining evidence is the forge's own
  authorship record, which a commenter cannot forge. That is a strictly stronger position than the
  body-based rule it replaces.
- **Data protection, note — this is the point of the change.** The gate stops writing a token that
  discloses which tool produced a comment. Nothing else about the published content changes, and no
  existing comment is rewritten or deleted.
- **Error cases, note — every new failure path ends in a report.** A missing identity, an
  unresolvable thread, and an unsupported provider all activate the guard rather than clearing it,
  so no failure mode can produce a merge that a working run would have refused.
- **Maintainability, note — the marker set shrinks from three to two.** That is a simplification of
  a contract the previous change had made more expensive, and the contract test is updated in step
  with it rather than left asserting a marker nobody writes.

## Test results

| Check                    | Result                                   |
| ------------------------ | ---------------------------------------- |
| `node build.mjs`         | pass — 19 exposed tools, all guards      |
| `node --test`            | pass — 442 of 442                        |
| `pnpm agent:check`       | pass — 263 files correctly formatted     |
| `pnpm test:distribution` | pass — offline archive and layout checks |

The suite grew from 421 to 442. `test/remote-tracker.test.mjs` gained `viewer-read` coverage
including eleven cases that fail against a normalizer that coerces instead of omitting;
`test/workflow-contracts.test.mjs` gained the ordered-evaluation, resolved-thread-authorship,
merge-precondition-scoping, idempotency-evidence and summary-suppression contracts. Every new
contract assertion was mutation-tested against a deliberately broken copy of its source, which
caught two assertions that could not fail; both were fixed rather than shipped.

**Still outstanding:** the plan's own decisive acceptance criterion — a second `pr-review` run on a
pull request the tool already commented on reaching the merge decision — requires a manual double
run against a real pull request and could not be executed here. The tool has still never been run,
so the cross-run behaviour this change exists to fix remains unverified in practice.

## Review findings

**Date:** 2026-07-29
**Reviewer:** `effective-flow-nodejs-reviewer` (helper operation),
`effective-flow-generic-product-reviewer` (prompt sources, reduced-depth generic review)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    12 |
| Open / Not implemented |     0 |

| Severity  | Count | Fixed | Open |
| --------- | ----: | ----: | ---: |
| Critical  |     1 |     1 |    0 |
| Important |     3 |     3 |    0 |
| Note      |     8 |     8 |    0 |

No external review report was written, because no finding remained open.

The critical finding is recorded above as a correction to this plan's own architecture decisions,
because that is where the defect originated: the plan asserted an invariant about the gate that was
false about the run. The review caught it precisely where the plan had presented it as a
simplification. The most consequential Important finding was the same kind of error in the opposite
direction — the resolved-thread rule, introduced here as a clean mechanism, was the only rule in the
guard that failed open.

Two further Important findings were internal contradictions this change created: a merge
precondition requiring every bot thread to be answered, in a design that had just forbidden the gate
to answer deferred threads, making such a pull request permanently unmergeable; and an idempotency
fallback referencing a configuration key for the gate's posting account that has never existed.

## Open points

- No open points.

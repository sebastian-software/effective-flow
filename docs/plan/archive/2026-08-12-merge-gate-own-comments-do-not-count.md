# Own comments no longer hold the merge gate's human-comment guard

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

Planned and reviewed against `36ea4fe`. **Rebased onto `a8c28ba`** before implementation, which
merged the merge-gate conflict-resolution feature. The drift was re-verified against that baseline
and the result is recorded under "Baseline drift" below — the anchor did the job it was added for.

### Baseline drift `36ea4fe` → `a8c28ba`

Unchanged, so every decision below still holds: Phase 1 step 2's rules 1–5, its fail-closed and
same-account paragraphs and step 3's bullets are structurally identical; all ten contract tests this
plan names still exist under their exact titles; `COMMENT_MARKERS` still has exactly the two test
importers this change removes.

Corrected in place, because the new baseline falsifies them:

- **Forgejo now supports `pr-status-read`, `pr-merge` and `viewer-read`.** The two edge cases that
  reasoned "`viewer-read` is unsupported there, so the guard stays active" and "Forgejo degrades to
  report-only anyway" are wrong on this baseline and are restated below.

Added, because the conflict-resolution feature created them:

- `#### Human-comment guard` gained a fifth bullet ("the conflict resolution stays permitted"), and
  a **new contract test** — `the human-comment guard and the report mode both leave the conflict
resolution running` — now pins that section's wording, including a `doesNotMatch` guard. The
  rewrite must preserve its literals.
- `#### A deferred finding gets no thread reply` gained a closing paragraph carrying a **second**
  dangling cross-reference, this one to "Phase 1's rule 3".
- `#### Resolving a conflict with the base` states that the guard does not block that delegation.
- The `## Conflict-resolution delegation contract` fail-closed bullet cross-references "an unprovable
  identity".
- A Forgejo sub-bullet names rule 1 and "counts as human" directly.
- `docs/user-guide/tools-deliver.md` carries two further guard passages, and
  `test/remote-tracker.test.mjs` a fifth drifted comment.

## Requirement

`effective-flow merge-gate` blocks every review-driven implementation and every merge while an open
"human" comment sits on the pull request. Today an item counts as human unless one of four
exclusion rules catches it, and the account the gate runs under is not excluded on authorship
alone: in manual mode the operator and the gate are the **same** account, so a comment the operator
typed themselves counts as human and holds the guard until the comment is deleted.

The requirement reverses that: **an item written by the account this run is authenticated as never
counts as human.** Its body, its thread, and that thread's resolution state take no part in the
decision. A comment from any other account still counts exactly as before.

The rationale is that the operator running the gate is present by definition. The guard exists to
stop the gate from merging out from under _someone else's_ open discussion, not to stop the operator
from merging past their own note. What the current rules protect against — an operator's hand-typed
objection being misread as the tool's own output — is a protection the operator did not ask for and
cannot switch off.

This is a deliberate behavior change to a documented, argued contract, not a defect repair, which is
why the recommended workflow is Feature and the change carries a `feat` commit type. It is not
marked breaking: it loosens a guard rather than moving or removing an interface.

## Architecture decisions

- **Identity signal: the `viewer-read` login.** Exclusion applies to an item whose normalized
  `login` equals the login the `viewer-read` operation returned for this run. This is the only
  cross-run identity signal that exists today; the PR author is deliberately not used, because
  `PR_STATUS_QUERY` in `src/scripts/remote-tracker-core.mjs` selects no `author` field and adding one
  would pull a helper query, its normalizer, its tests, and the capability documentation into a
  change that does not otherwise need them.
- **No configuration key.** The behavior is hardwired. A `mergeGate.*` key would have to be declared
  in four synchronized tables (`src/shared/config-migration.md`, `src/tools/merge-gate.md`,
  `src/tools/setup.md`, `docs/user-guide/configuration.md`) plus a wizard question, for a switch
  nobody has asked to flip back.
- **Rules 2, 3 and 4 are folded into one identity rule, not preceded by one.** Rule 1 already
  excludes every bot-typed item and stops the evaluation there, so the "or a bot under rule 1's two
  cases" half of rules 2 and 4 is already unreachable. Once the author's own login excludes an item
  outright, the remaining half of rules 2, 3 and 4 is unreachable too. Leaving them in place would
  ship roughly 120 lines of contract prose that no evaluation can reach and that contradicts the rule
  above it.
- **Rule 1 keeps its position.** Bot authorship must still be decided before the identity is
  consulted, because `viewer-read` can legitimately fail on an installation token; an evaluation that
  reached the identity first would fail closed and block precisely the app mode that never needed an
  identity.
- **The guard becomes authorship-only.** After this change no guard _exclusion_ rule reads a comment
  body. That strengthens rather than weakens the principle stated in
  `src/shared/pr-review-comments.md` — "the author record is the only authorship evidence" — and it
  removes the quote-reply surface the leading-line requirement existed to close, because no body
  content can influence an exclusion at all.
- **The guard uses the same two signals Phase 3 already uses, in the order rule 1's precedence
  requires.** Phase 3 establishes "is this the account I post as?" as _manual mode: `login` equals
  `viewer-read`'s; app mode: `authorType` is `bot`_, in that order. The guard reads the same two
  signals with the bot signal first, for the reason stated above. The two are not identical and this
  plan does not claim they are: guard rule 1 also excludes any login listed in `mergeGate.bots`,
  which is a reviewer the gate waits for and not an answer to "did I write this?".
- **The guard keeps its name; "human" is defined explicitly instead.** After this change "human"
  means "written by an account other than the one this run is authenticated as". Renaming the guard
  would multiply the documentation surface, break reading continuity with the archived predecessor
  plan, and touch every test title carrying the name, for no behavioral gain. Instead Phase 1 states
  the definition in one sentence, and the four user-facing statements that assert the absolute
  ("blocks while a human comment is open") are reworded to name whose comment blocks.
- **`Summary comment: suppressed` stays mandatory and is re-grounded.** Its current justification —
  that the delegated run's summary comment would otherwise be counted as human on the next read —
  becomes false in both modes. The obligation survives on the grounds that do not: up to
  `mergeGate.maxRounds` summary comments per run is noise, Phase 6 already reports the same content
  in chat, the "a gate-initiated run leaves at most one item of its own" guarantee depends on it and
  is pinned by a contract test, and a gate running under a **different** account than the delegated
  run still reads that summary as foreign.
- **`COMMENT_MARKERS` is demoted to a module-local `const`.** Verified against `36ea4fe`: its only
  importers are `test/workflow-contracts.test.mjs:2132` and `:2195`, the two marker-enumeration tests
  this change removes. `remote-tracker-core.mjs` uses it internally through `commentMarker()`, which
  needs no export, and the comment above the declaration exists _only_ to justify the export for the
  merge-gate contract test. Export and comment therefore go together rather than leaving dead public
  surface in a shipped runtime script.
- **The visibility gap this change opens is closed inside the change, for every surface.** An item
  the run's own account wrote stops holding the guard. Phase 6's summary therefore gains one item
  naming **every** item the identity rule excluded that would otherwise have counted — unresolved
  threads and top-level comments alike. Phase 4's existing unmatched-thread report does not cover
  this: it fires only when `mergeGate.bots` is non-empty (the default is empty) and it reaches no
  top-level comment at all, which would leave the loudest case — the operator's own hand-typed
  objection — silent. The report deliberately reads no body, so it names the gate's own trigger
  comment too; that is the price of keeping the exclusion authorship-only, and it is one line in a
  chat summary. This is not scope creep: the change created the blind spot, so closing it belongs to
  the change.
- **No new ADR.** The decision this reverses lives in an archived plan
  (`docs/plan/archive/2026-07-29-cross-run-identity-for-the-merge-gate.md`), not in an ADR, and the
  binding contract is the tool source itself. This plan plus the rewritten source prose carries the
  rationale; the archived plan stays as history.

## Affected files

| File                                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                                                    | Phase 1 step 2: replace rules 1–5 with rules 1–3, and add the explicit definition of "human". Rewrite step 3 ("Decide what counts"), the fail-closed and same-account paragraphs, both falsified rationales in "A deferred finding gets no thread reply", the Delegation contract's suppression rationale, the Phase 3 cross-reference in the trigger-body bullet, the Phase 4 unmatched-thread-report justification, one Phase 6 summary item, the edge cases listed below, the frontmatter `description`, `## Goal` item 3, and **one** bullet in `## Rules`. On the `a8c28ba` baseline this additionally covers the closing paragraph of "A deferred finding gets no thread reply" (a second dangling rule reference), the `#### Human-comment guard` bullet list (preserving the conflict-resolution literals a contract test pins), `#### Resolving a conflict with the base` step 2, the `## Conflict-resolution delegation contract` fail-closed bullet, and the Forgejo sub-bullet that names rule 1 and "counts as human". |
| `src/tools/setup.md`                                                         | Block 9's trigger-text bullet justifies "a distinctive mention" by the exact-match guard exclusion that rule 3's removal deletes. Rewrite that justification, and the block's "human comment" phrasing that asserts the absolute. No new key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/iterate.md`                                                       | Phase 0 step 6 justifies the caller's summary suppression by the falsified read-back-as-a-third-party reason. Re-ground it as in `merge-gate.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/shared/pr-review-comments.md`                                           | Drop **four** claims: that the merge gate pairs the login with the trigger body, matches the reply marker, reads a marker in a resolved thread, and that the summary comment is suppressed because the next authorship evaluation would count it as human. The phrase ``former third marker (`effective-flow-pr-gate`)`` must survive verbatim — a test helper parses it as a fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/scripts/remote-tracker-core.mjs`                                        | Demote `COMMENT_MARKERS` from `export const` to `const` and delete the comment that justifies the export.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/workflow-contracts.test.mjs`                                           | Remove four contract tests that pin the retired conditions, rewrite three that drift, add one that pins the identity-only rule, and update the stale explanatory comments of four more.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/remote-tracker.test.mjs`                                               | Comment-only drift: five comments state the retired guard mechanism, name "rule 5's catch-all", or claim bot authorship comes only from a configured login. No assertion changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `docs/user-guide/tools-deliver.md`                                           | Rewrite `#### Recognizing its own writes across runs`, the numbered guard summary that says any unresolved item with a human author blocks, and the "never merges past an open human comment" statement. On the `a8c28ba` baseline also the two conflict-resolution passages that state the guard does not block the resolution, and the blocking-condition list that names "an open human comment".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `docs/user-guide/remote-tracker.md`, `docs/developer-guide/configuration.md` | Verification only. Neither is expected to state the retired pairing; correct them if they do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/user-guide/configuration.md`                                           | Verified no-op: its `mergeGate` block states no retired claim, and no key changes. Listed so the omission is not read as an oversight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`dist/` is generated and gitignored — it is never edited.

## Implementation details

### Approach

1. **Rewrite Phase 1 step 2 of `src/tools/merge-gate.md`** into three rules, evaluated in order,
   stopping at the first match:
   1. **The author is a bot** — a login listed in `mergeGate.bots` resolved through "Matching a
      configured login", or an item whose normalized `authorType` is `bot`. Excluded. The identity
      lookup is deliberately not consulted here. Carry this rule over unchanged, including its
      argument for why the two cases overlap rather than divide the items.
   2. **The author is this run's own account** — the item's normalized `login` equals the login
      `viewer-read` returned. Excluded, whatever the body says, whichever surface the item sits on,
      and whether or not its thread is resolved. State the three boundaries of that comparison
      explicitly, because alone it reads as underspecified where today's rule 3 sat beside a body
      comparison: compare the `login` values as the helper normalized them, with no case folding and
      no other author field — display name, profile URL, and account ID take no part; **no `[bot]`
      trim applies here**, that trim belongs to rule 1's configured-login matching and must not leak
      into an identity comparison; and an item whose `login` is absent cannot match, so it counts,
      which is the same fail-safe direction as an `unknown` author type.
   3. **Everything else counts as human**, including an item whose normalized `authorType` is
      `unknown`. Unchanged, and still the fail-safe direction.
2. **Define "human" in one sentence** at the head of the rules: an item is human when it was written
   by an account other than the one this run is authenticated as. The guard keeps its name, so the
   name has to be told what it now means.
3. **State what rule 2 now subsumes**, so the change reads as a decision rather than a deletion: the
   gate's own trigger comment from an earlier run, the replies and summary comments
   `effective-flow iterate` writes, the inline findings and the outside-diff comment
   `delivery.prReview` publishes, and the operator's own hand-typed comments. All of them are the
   same account, and the guard no longer distinguishes between them.
4. **State what rule 2 gives up**, in the same place: an objection the operator types themselves no
   longer holds the guard. A comment from any other account is untouched.
5. **Keep the fail-closed paragraph**, adjusted to the new shape. A `viewer-read` that fails, is
   unsupported, or states no authenticated login leaves the identity unknown; rule 2 is then
   unprovable, every non-bot item counts, and the guard activates with the missing identity reported
   as the reason. Rule 1 needs no identity and stays untouched.
6. **Keep the same-account paragraph**, narrowed to what still applies: a pull request annotated
   under one account and merged by a gate running under another still blocks, because the annotating
   account is not the authenticated one.
7. **Rewrite step 3 ("Decide what counts")** — keep the review-thread versus top-level-comment
   distinction, including "a review thread counts while it is not `resolved`", which is a _counting_
   surface and not an exclusion rule; delete the two bullets about narrow body reads and about a
   marker never excluding an item on its own, and replace them with one statement that no exclusion
   rule reads a body.
8. **Repair "A deferred finding gets no thread reply" in full.** The subsection's rule survives —
   resolving a thread nobody handled still signals "handled" — but **both** of its stated
   justifications are falsified. Its body argues that "leaving an unresolved reply behind is
   precisely what makes the next run read its predecessor's output as a human comment"; in manual
   mode that reply now carries the gate's own account and is excluded. Its closing sentence names
   "Phase 1's rule 2" for a mechanism that no longer exists, and in app mode the excluding rule is
   rule 1 anyway. Restate both by the reason that survives — a resolution is a claim about a finding,
   not about authorship — and name the excluding mechanism rather than a rule number. Note that this
   subsection sits **inside** the `### Phase 1` slice the acceptance criteria bind.
9. **Re-ground the Delegation contract's suppression rationale.** It currently argues that the
   delegated run's per-round summary comment would be "counted as human" by the next fresh read,
   including this run's own Phase 4 read. That is false in both modes after the change. Keep the line
   `Summary comment: suppressed` **mandatory** and restate its ground: up to `mergeGate.maxRounds`
   summary comments per run is noise, Phase 6 reports the same content in chat, the "at most one own
   write" guarantee elsewhere in this file depends on it and is pinned by a contract test, and a gate
   running under a different account than the delegated run still reads that summary as foreign. Do
   the same for the matching bullet in `## Rules` and for `src/tools/iterate.md` Phase 0 step 6, which
   carries the same falsified reason from the delegate's side.
10. **Fix the Phase 3 cross-reference.** The trigger-body bullet currently justifies the exact body
    with "that exact body is what Phase 1's rule 3 recognizes as this gate's own on the next run".
    Phase 1 no longer has a rule 3. The two surviving reasons for the exact body are Phase 3's own
    idempotency check, which compares the body itself, and keeping the raw comment from announcing
    which tool composed it. Phase 3's idempotency mechanism is otherwise unchanged, and its instruction
    not to use the `pr` comment-kind builder keeps naming the `<!-- effective-flow-iterate -->` marker.
11. **Fix the Phase 4 unmatched-thread-report justification.** It currently reasons "an unresolved
    thread from a _human_ already holds condition 4's human-comment guard, so what reaches this point
    is a thread whose author is bot-typed". After this change a thread written by the run's own
    account also passes the guard and also reaches this point. Restate what reaches the report:
    bot-typed threads under an unnamed login, **plus** threads this run's own account wrote. The
    report stays a report and still never blocks.
12. **Rewrite the affected edge cases** — nine of them: the human quote-reply of the trigger comment
    (still counts — the author is the human), the operator writing the trigger text by hand (excluded
    by authorship now, and the "configure a distinctive trigger" advice loses its guard rationale),
    the `viewer-read` failure, the app-mode case, the identity change between runs, the thread
    `iterate` answered and resolved, the `iterate` reply that could not be resolved (no longer
    blocks), the delegated summary comment, and both `delivery.prReview` cases.
13. **Add one item to the Phase 6 summary list:** every item the identity rule excluded that would
    otherwise have counted — unresolved threads **and** top-level comments. This is what makes the
    loosening visible in every configuration, including the default empty `mergeGate.bots`, where
    Phase 4's unmatched-thread report does not fire at all and which reaches no top-level comment in
    any case. The item names the author and the surface, reads no body, and therefore lists the gate's
    own trigger comment alongside a hand-typed objection.
14. **Rewrite one bullet in `## Rules`** — `src/tools/merge-gate.md` carries the marker-as-evidence
    claim and the five-rule order enumeration in a **single** bullet, not two. The gate still writes
    no marker; that bullet's remaining content is the three-rule order and that the guard's exclusions
    read authorship only. The neighbouring bullet ("Never let an unprovable identity clear the guard
    … The identity is never consulted for an item rule 1 already excluded") survives intact and must
    not be rewritten by accident.
15. **Reword the four statements that assert the absolute.** The frontmatter `description`, `## Goal`
    item 3, `docs/user-guide/tools-deliver.md:121`, and the matching phrasing in `src/tools/setup.md`
    all say the gate blocks while "a human comment" is open. Reword each to name whose comment blocks
    — a comment from an account other than the one the gate runs as.
16. **Update `src/tools/setup.md`** block 9. Its trigger-text bullet advises a distinctive mention
    "because the gate recognizes its own trigger comment by an exact match against this string — a
    generic value could be matched by an ordinary human comment, which would then be excluded from the
    human-comment guard". That failure mode disappears with rule 3. A distinctive mention is still
    worth advising, for the reason that survives: it has to actually summon the reviewer, and Phase 3's
    idempotency compares the body. No `mergeGate.*` key is added or removed here.
17. **Update `src/shared/pr-review-comments.md`** at its four merge-gate claims — the `viewer-read`
    section's "pairs the login with the exact configured body of its trigger comment", the reply
    section's "matches the marker as an exact string when it decides whether an item in a resolved
    thread is this tool's own", the marker-contract section's "recognizes that comment again through
    the authenticated login plus the comment's exact configured body", and the "Post summary comment"
    section's "the reason is the guard: … the next authorship evaluation counts as a human comment".
    The reply marker keeps its own purpose for `effective-flow iterate`'s idempotency and repeat
    suppression; only the merge-gate consumer claims go. **Constraint:** the phrase ``former third
marker (`effective-flow-pr-gate`)`` in the marker-contract section must survive verbatim —
    `gateMarkerToken()` in `test/workflow-contracts.test.mjs` parses that file for it and asserts if
    it is absent.
18. **Demote `COMMENT_MARKERS`** in `src/scripts/remote-tracker-core.mjs` to a module-local `const`
    and delete the four-line comment above it that justifies the export. Re-run the repository-wide
    grep first to confirm the two test importers are still the only ones.
19. **Update the tests** per the section below.
20. **Update the user documentation** per the affected-files table, and verify the three rows marked
    verification-only or no-op.

### Test changes

The guard is enforced entirely by prose-structure contract tests over `src/tools/merge-gate.md` in
`test/workflow-contracts.test.mjs`; no build-time guard in `build.mjs` reads these rules.

Remove, because each pins a condition that ceases to exist:

- `a resolved thread excludes only this tool's own items`
- `rule 2's marker enumeration stays in step with the helper's marker table` — including its
  `assert.deepEqual` over `Object.keys(COMMENT_MARKERS)`, whose stated purpose was forcing a new
  comment kind to be assessed against guard rules 2 and 4
- `rule 4's marker enumeration and two-condition shape stay pinned` — its `/both hold/i` assertion
  fails against any other rule shape by construction
- `the merge gate recognizes its own trigger comment by identity plus the complete trigger text`

The two **marker-enumeration** tests among these four — `rule 2's marker enumeration stays in step
with the helper's marker table` and `rule 4's marker enumeration and two-condition shape stay
pinned` — are the only importers of `COMMENT_MARKERS`, which is why step 18 belongs to the same
change rather than to a follow-up.

Rewrite, because the assertion drifts but the property survives:

- `the merge gate evaluates bot authorship before it consults the identity lookup` — its `ordered()`
  token list contains `'resolved'` and ``'`mergeGate.bots.<login>.trigger`'``, both of which leave
  Phase 1. Re-pin the order as bot rule before identity rule before catch-all.
- `the merge gate excludes its own top-level summary comment by author plus leading marker` — assert
  exclusion by author alone, and that no marker appears in the rule.
- `an unprovable identity activates the merge gate guard and binds only the identity rule` — the
  property is unchanged; its three `near()` windows (500/500/300 characters) must be re-checked
  against the shortened Phase 1 text.

Verify the assertion, and update the explanatory comments that drift. None of these comments is
asserted on, so nothing fails when they go stale — which is exactly why they are listed:

- `the merge gate writes no marker of its own` — the assertion survives: its loop over `markersIn()`
  simply does not execute on a file with zero markers. Two of its comments still say "authorship plus
  the configured trigger text". Its helper `gateMarkerToken()` reads
  `src/shared/pr-review-comments.md` as a fixture — see step 17's constraint.
- the iterate summary-suppression tests at `test/workflow-contracts.test.mjs:2371–2377` and
  `:2396–2400` — both state the falsified read-back-as-human defect as the reason for the contract.
- the condition-7 test at `:3603` — "an unresolved **human** thread already blocks at the
  human-comment guard", the same falsified premise step 11 fixes in the Phase 4 prose.
- `a bot-typed author is excluded before the catch-all counts it as human` — rule 1 and the catch-all
  are both unchanged; confirm the slice regexes still find them.
- `every site that matches mergeGate.bots resolves through the shared login rule` — requires
  `Matching a configured login` to remain present in Phase 1, which rule 1 keeps.

One test must be **preserved**, not changed: `the human-comment guard and the report mode both leave
the conflict resolution running`. It slices `#### Human-comment guard` and asserts the literals
`conflict resolution stays permitted`, `CI repair stays permitted`, `near('resolution runs', 'merge
does not', 60)` and `near('no merge', 'review-driven implementation', 400)`, plus a `doesNotMatch`
forbidding any phrasing that blocks the conflict resolution. The rewrite of that section keeps every
one of those literals; it is the newest guard over the section and the easiest to break by accident.

In `test/remote-tracker.test.mjs`, five comments drift with no assertion change: two state the
retired marker-in-a-resolved-thread exclusion, two name "rule 5's catch-all" (which becomes rule 3),
and one states that the guard "could establish bot authorship only from a configured login".

Add one test: **the merge gate excludes every item its own account wrote.** Assert that the identity
rule names `viewer-read` and login equality, that it contains neither marker string nor a `resolved`
condition nor a trigger-text condition, and that the catch-all follows it.

### Edge cases

- **A colleague comments on the pull request:** counts, guard activates. Unchanged, and the reason
  the guard still exists.
- **The operator types an objection themselves:** no longer counts. This is the requested change, it
  is stated as such in the source, and step 13's Phase 6 item reports it.
- **A human quote-replies to the gate's trigger comment:** counts, because the author is the human.
  The copied body is now irrelevant in both directions.
- **`viewer-read` fails, is unsupported, or exposes no login:** every non-bot item counts, guard
  activates, missing identity reported as the reason. Unchanged.
- **App mode with an installation token:** rule 1 excludes the gate's own writes before the identity
  is consulted, so the run proceeds. Unchanged, and the reason rule 1 stays first.
- **The authenticated identity changes between runs:** earlier own writes are no longer own and
  count. Unchanged and still fail-safe.
- **An unresolved `delivery.prReview` inline finding under the same account:** it no longer holds the
  guard, where today it blocks until its thread is resolved. This is a genuine loosening, named as
  such in the source and reported by step 13's Phase 6 item.
- **The same delivery's outside-diff top-level comment:** likewise excluded, and likewise reported.
  Phase 4's unmatched-thread report reaches no top-level comment at all, which is why the Phase 6 item
  covers both surfaces rather than threads alone.
- **An `iterate` reply that could not be resolved** (Forgejo, where `review-thread-reply` is
  unsupported): under the same account it no longer counts. On the `a8c28ba` baseline Forgejo does
  support `pr-merge`, so this genuinely releases a merge rather than one that was unavailable
  anyway — the loosening is real there and is reported by step 13's Phase 6 item like any other.
- **An item this run's own account wrote that a surface reports with `authorType: unknown`:** rule 2
  still excludes it by login. If `viewer-read` also failed, it counts — the existing residual, and the
  fail-safe direction.
- **An item whose `login` is absent while `viewer-read` succeeded:** rule 2 cannot match, so it
  counts. Same fail-safe direction.
- **`mergeGate.bots` is empty:** the bot round is skipped, Phase 4's unmatched-thread report does not
  fire, and step 13's summary item is the only place an excluded item is reported.
- **Forgejo:** `viewer-read` **is** supported on this baseline, so rule 2 works there exactly as it
  does on GitHub and the guard is no longer permanently active. What stays unsupported is
  `pr-checks-wait`, `review-create` and `review-thread-reply`. The existing Forgejo sub-bullet that
  explains rule 1 — every author normalizes to `authorType: 'unknown'` there, so the bot case never
  fires and a bot comment under an unnamed login counts as human — keeps its meaning under the new
  numbering and only its rule reference changes.
- **A conflict resolution while the guard is active:** unaffected. The guard permits it today for the
  same reason it permits the CI repair, and this change only narrows what counts as human; it never
  widens what the guard blocks.

## Acceptance criteria

Where a criterion says "Phase 1 step 2" it binds the exclusion rules only; where it says "the
`### Phase 1` section" it binds the whole slice the test helper cuts, which runs to `### Phase 2` and
therefore includes `#### Human-comment guard` and `#### A deferred finding gets no thread reply`.

- [ ] Phase 1 step 2 of `src/tools/merge-gate.md` enumerates exactly three rules: bot author, own
      authenticated login, catch-all human — in that order — and states in one sentence that "human"
      means an account other than the one this run is authenticated as.
- [ ] Rule 2 states its three comparison boundaries: no case folding, no `[bot]` trim, an absent
      `login` counts.
- [ ] No marker literal (`effective-flow-iterate`, `effective-flow-pr-review`) appears anywhere inside
      the `### Phase 1` section. The occurrences in the checkout-provisioning boundary and in Phase 3's
      comment-kind-builder instruction stay.
- [ ] No exclusion rule in Phase 1 step 2 carries a `resolved`-thread condition, a marker condition, or
      a trigger-text condition. Step 3's counting surface ("a review thread counts while it is not
      `resolved`") is explicitly exempt and stays.
- [ ] Phase 1 still states that an unprovable identity activates the guard and that rule 1 is
      untouched by that failure.
- [ ] Phase 1 explicitly names both what the identity rule subsumes and the protection it gives up.
- [ ] No cross-reference in `src/tools/merge-gate.md` names a Phase 1 rule that no longer exists, and
      every surviving rule reference names its mechanism rather than only a number. On the `a8c28ba`
      baseline that includes both references in "A deferred finding gets no thread reply" (rule 2 in
      its body, rule 3 in its closing paragraph) and the Forgejo sub-bullet's rule-1 reference.
- [ ] `#### Human-comment guard` still contains the literals `conflict resolution stays permitted`
      and `CI repair stays permitted`, still places "resolution runs" within 60 characters of "merge
      does not", and still carries no phrasing that blocks the conflict resolution — the contract
      test `the human-comment guard and the report mode both leave the conflict resolution running`
      passes unchanged.
- [ ] No statement in `src/tools/merge-gate.md`, `src/tools/iterate.md` or
      `src/shared/pr-review-comments.md` claims that Forgejo does not support `viewer-read` or that
      the guard is permanently active there.
- [ ] Neither "A deferred finding gets no thread reply" nor the Delegation contract nor
      `src/tools/iterate.md` Phase 0 justifies itself by an item being read back as a human comment.
- [ ] `Summary comment: suppressed` is still stated as mandatory, in exactly its literal form, in
      every delegation site that carries it today.
- [ ] Phase 4's unmatched-thread-report paragraph states that own-account threads also reach it.
- [ ] Phase 6's summary list contains an item for every item the identity rule excluded that would
      otherwise have counted, covering unresolved threads and top-level comments.
- [ ] The frontmatter `description`, `## Goal` item 3, `docs/user-guide/tools-deliver.md`, and
      `src/tools/setup.md` no longer assert that any open human comment blocks, and each names whose
      comment blocks instead.
- [ ] `src/tools/setup.md` block 9 no longer justifies a distinctive trigger by the guard exclusion,
      and the `mergeGate.*` key set is unchanged.
- [ ] The four listed contract tests are removed, the three listed ones are rewritten, one new test
      pins the identity-only rule, and the stale comments of the four listed tests plus the four sites
      in `test/remote-tracker.test.mjs` are updated.
- [ ] `src/shared/pr-review-comments.md` contains none of the four retired merge-gate claims — and
      still contains the phrase ``former third marker (`effective-flow-pr-gate`)`` verbatim.
- [ ] `COMMENT_MARKERS` in `src/scripts/remote-tracker-core.mjs` is a module-local `const` with no
      `export` keyword and no export-justifying comment, and a repository-wide grep finds no importer.
- [ ] A repository-wide grep for the retired mechanism — a marker-plus-resolved exclusion, "rule 4",
      "rule 5", "counts as human" — returns no site that still describes the removed rules.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, in
      that order.

## Validation plan

- `pnpm agent:check` — formatting, no writes.
- `pnpm test` — the `node:test` unit suite, including the rewritten and added merge-gate contract
  tests. This is the primary executable evidence: the guard has no runtime, so its tests are the only
  executable check that exists.
- `node build.mjs` — build guards over includes, tool registration, and version drift.
- `pnpm test:distribution` — isolated build/archive/delivery smoke suite.
- Repository-wide grep for `COMMENT_MARKERS` before and after step 18, to prove the demotion breaks
  no importer.
- Repository-wide grep for the retired mechanism, per the acceptance criterion. **This is not
  optional polish:** most of the stale sites this plan lists are prose and comments that no assertion
  covers, so the grep is the only check that finds a site the plan itself missed.
- Manual read-through of the rendered `dist/portable/effective-flow/tools/merge-gate.md` — the whole
  file, not Phase 1 alone, since two of the falsified rationales sit in other sections — to confirm
  the three rules read as one coherent contract and carry no dangling cross-reference.
- No live pull-request run is planned. The change is a prose contract with no runtime path; a live
  run would exercise the harness, not the rule.

## Assumptions and open points

- **Assumption:** this repository's own gate runs in manual mode under the maintainer's `gh`
  authentication, so `viewer-read` returns the maintainer's login and the change takes effect here
  immediately.
- **Accepted consequence:** an operator who wants their own comment to block a merge no longer has a
  way to make it do so. That is the requested trade and is deliberately not made configurable.
- **Accepted consequence:** an unresolved `delivery.prReview` inline finding, and the same delivery's
  outside-diff comment, written under the same account stop blocking the merge. Step 13 makes them
  reported rather than silent; it does not make them blocking again.
- **Accepted consequence:** Phase 6's report reads no body, so it also names the gate's own trigger
  comment. Filtering it out would require exactly the body read the new rule abolishes.
- **Deliberate omission:** no `mergeGate.*` key, no ADR, and no `pr-status-read` extension for the PR
  author. Each was considered in the architecture decisions and rejected with a stated reason.

## Plan review

**Result:** Approved

Two review passes. The first assessed plan quality and gaps; the second, run interactively, hunted
for unknowns, contradictions and decisions the plan was making silently. Every critical finding of
both passes is incorporated, and the three decision-requiring points of the second pass were decided
by the user and written into the architecture decisions.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    1 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        1 |         2 |    2 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        2 |         3 |    0 |

### Findings — first pass

- **Testability, critical — an acceptance criterion was unachievable and contradicted the plan's own
  approach.** The first draft demanded that no marker literal remain anywhere in
  `src/tools/merge-gate.md`, but two occurrences must stay. Incorporated: the criterion is scoped to
  the `### Phase 1` section. A second criterion forbade every `resolved` condition in Phase 1 while
  the approach keeps one as a counting surface; it is now scoped to the exclusion rules.
- **Maintainability, critical — the `COMMENT_MARKERS` assumption was false, not merely unverified.**
  A repository-wide grep confirms its only importers are the two marker-enumeration tests this change
  removes. Incorporated: the fork is decided (demote to a module-local `const`), and the vacuous
  criterion "the export's remaining importers are verified" is gone.
- **Architecture, important — Phase 4's unmatched-thread report carries a justification this change
  falsifies.** Incorporated as approach step 11 and an acceptance criterion.
- **Security, important — the mitigation for the loosening was conditional but stated
  unconditionally.** Phase 4's report fires only when `mergeGate.bots` is non-empty, and the default
  is empty. Incorporated as approach step 13, and widened further by the second pass.
- **Security, important — the loosening is wider than the literal request.** Named in the edge cases,
  in the accepted consequences, and in the source itself.
- **Testability, important — removing four contract tests reduces the executable guard over a
  security-relevant rule.** Incorporated: a positive test is added, three drift-prone tests are
  rewritten rather than removed, and the `gateMarkerToken()` fixture constraint on
  `src/shared/pr-review-comments.md` is pinned.
- **Maintainability, important — `src/tools/setup.md` states the retired contract and was missing
  from the edit surface.** Incorporated as approach step 16 and a table row.
- **Architecture / Error cases / Scope, notes** — the reversal of an argued decision is accepted with
  the archived plan kept as history; the fail-closed prose shrinks but both halves are pinned by
  criteria; the documentation surface is larger than the source surface, and each row names the
  specific claim that goes stale.

### Findings — second pass

- **Architecture, critical — the `Summary comment: suppressed` rationale is falsified in four places
  and was in no edit surface.** The contract is justified by the delegated summary comment otherwise
  being counted as human; after the change it never is, in either mode. The same reason appears in
  `src/shared/pr-review-comments.md`, `src/tools/iterate.md`, and two test comments. **Decided:** the
  obligation stays mandatory and is re-grounded on noise, the chat report, the "at most one own write"
  guarantee, and the cross-account residual. Incorporated as an architecture decision, approach step 9,
  and two acceptance criteria.
- **Maintainability, critical — `src/tools/iterate.md` and `test/remote-tracker.test.mjs` state the
  retired contract and were absent from the affected-files table.** Six sites, all prose or comments
  that no assertion covers. Incorporated as two table rows, approach step 9, the test-changes list,
  and — because the class of miss is what matters — a repository-wide grep promoted into both the
  validation plan and the acceptance criteria.
- **Security, important — the visibility fix covered threads only.** The operator's own hand-typed
  top-level objection, the literal motivating case, and `delivery.prReview`'s outside-diff comment
  would have been excluded and reported nowhere. **Decided:** widen the Phase 6 item to every item the
  identity rule excluded, on both surfaces, reading no body. Incorporated in the architecture
  decisions, approach step 13, two edge cases, an accepted consequence, and an acceptance criterion.
- **Maintainability, important — "human-comment guard" keeps its name while "human" is redefined,
  and four user-facing statements become literally false.** **Decided:** keep the name, define the
  term explicitly in Phase 1, and reword the four absolutes. Incorporated as an architecture decision,
  approach steps 2 and 15, and an acceptance criterion.
- **Architecture, important — "A deferred finding gets no thread reply" was only half repaired.** Its
  body carries a second falsified justification the first draft did not touch. Incorporated as
  approach step 8.
- **Architecture, important — the "mirrors Phase 3's author establishment" decision was wrong
  twice.** Phase 3 evaluates manual mode first, the guard evaluates the bot signal first, and rule 1
  is broader than "the account I post as" because it also excludes configured reviewer logins.
  Incorporated: the bullet is restated to claim only what holds.
- **Maintainability, important — the plan miscounted the `## Rules` bullets.** The marker claim and
  the rule-order enumeration sit in one bullet, not two. Incorporated as approach step 14, which also
  names the neighbouring bullet that must survive intact.
- **Testability, important — "removing these two" followed a list of four.** Incorporated: the two
  marker-enumeration tests are named.
- **Error cases, note — rule 2's comparison had three unstated boundaries.** Case folding, the
  `[bot]` trim, and an absent `login`. Incorporated into approach step 1, an edge case, and an
  acceptance criterion.
- **Testability, note — two acceptance criteria used "Phase 1" for different spans.** Incorporated as
  a preamble to the acceptance criteria naming which span each binds.
- **Testability, note — two further test comments drift.** Incorporated into the test-changes list.
- **Scope, note — `docs/user-guide/configuration.md` was named in a decision but in no table row.**
  Verified to state no retired claim; incorporated as an explicit no-op row.
- **Interaction sweep, negative result.** `iterate`'s review-in-flight guard, `delivery.prReview`,
  `src/shared/pr-review-integration.md`, `src/shared/config-migration.md`, and merge-gate Phases 2
  and 5 carry no dependency on the human-comment guard. Its only consumers are Phase 3 and Phase 4
  condition 4, both unchanged by this plan. `build.mjs` and `pnpm test:distribution` read none of
  these rules, which confirms the contract suite is the only executable check.

## Implementation record

Implemented on 2026-08-12 from `a8c28ba`, on branch
`effective-flow/build/merge-gate-own-comments-do-not-count`.

### Delivered scope versus the plan's table

Ten files changed, plus this plan. Eight match the affected-files table exactly. Two deviate, both
deliberately:

- `docs/user-guide/remote-tracker.md` was listed as **verification only**. It stated no retired
  pairing, so that item was satisfied — but a review note found its phrase "so the gate can tell its
  own writes from a person's across runs" misleading in the opposite direction: after this change the
  operator _is_ a person whose writes count as the gate's own. Changed to "from another account's".
- `README.md` was **not in the table at all**. The documentation sync gate found its merge-gate bullet
  still claiming the gate merges "never past an open human comment", recorded the surface as
  `blocked`, and the user chose to correct it now rather than defer it. One clause changed, in the
  marketing register, routed through the marketing writer per the doc-category write boundary.

`docs/user-guide/configuration.md` and `docs/developer-guide/configuration.md` were verified and
recorded as `no impact`, exactly as the table predicted.

### Deviations from the planned approach

- **One planned test rewrite proved unnecessary.** The plan scheduled
  `an unprovable identity activates the merge gate guard and binds only the identity rule` for
  rewriting, on the assumption its `near()` windows would not survive the shortened Phase 1. They do,
  and a reviewer confirmed the test still binds its title against the new text rather than passing
  incidentally. It was left untouched.
- **The rebase found two plan statements false and six unlisted sites**, all recorded under "Baseline
  drift" above and corrected before implementation.
- **No wisdom file was written.** Phase context was carried in the delegation briefs instead, so there
  was none to delete at completion. Recorded rather than silently skipped.

### Test results

The repository's CI sequence from `AGENTS.md`, run by the independent validator in the delivery
worktree after the final correction round:

| Check                    | Result                                                               |
| ------------------------ | -------------------------------------------------------------------- |
| `pnpm agent:check`       | passed — 286 files correctly formatted                               |
| `pnpm test`              | passed — 638 tests, 0 failures                                       |
| `node build.mjs`         | passed — 19 tools, 16 agents, all three targets, context budget held |
| `pnpm test:distribution` | passed — offline checks passed                                       |

The suite grew from 636 to 638: four contract tests removed, three added (the identity rule, Phase 6's
disclosure, and the relocated marker-position pin), two rewritten. `node build.mjs` produced no
tracked working-tree change, verified by a byte-identical `git status --porcelain` hash before and
after.

Both acceptance-criterion greps pass: `COMMENT_MARKERS` has no `import` and no `export` anywhere, and
no marker literal appears inside `### Phase 1` — checked in the source **and** in the rendered
`dist/claude/` output, so the `{{SKILL:iterate}}` placeholders are confirmed not to expand into one.

## Review findings

**Date:** 2026-08-12
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    20 |
| Open / Not implemented |     0 |

| Complexity | Count |
| ---------- | ----: |
| Low        |    19 |
| Medium     |     1 |
| High       |     0 |

Two Critical, seven Important, eleven Notes — all fixed in two correction rounds. No external review
report was written, because no finding remained open.

The two Critical findings arose at the same seam and are worth recording, because a later reader will
meet that seam again: once no rule reads a comment body, the guard's own vocabulary has to be
restated, and the first draft restated it twice too broadly. It defined "human" as any account other
than the authenticated one — which silently includes every bot, contradicting rule 1 and, through
step 4's wording, would have activated the guard on any pull request carrying an automatic reviewer.
And it hardened the resolved-thread counting surface into a total filter ("before any authorship is
consulted"), which contradicted the surviving edge case and would have let a colleague's objection
inside a thread `iterate` resolved stop blocking — a genuine fail-open in exactly the case the guard
exists for. Both are now defined against **both** exclusions.

The most consequential Important findings concerned the replacement test rather than the source. The
`nodejs` reviewer verified by **mutation**: five separate rewrites of Phase 1 — including one that
inverts the rule outright, one that narrows the exclusion back to top-level comments, and one that
reintroduces a body comparison — all passed the first version of the added test. The plan had accepted
removing four guards on the condition that the replacement genuinely binds; it did not. The hardening
round re-verified every mutation, and each now fails on its intended assertion.

## Open points

- No open points.

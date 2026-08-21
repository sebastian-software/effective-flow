# Send the butler rename request as soon as the title is fixed

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `f449d20` on 2026-08-21 — the tip of `develop`. All line citations below are
against that commit.
**Working state:** the tree carries five untracked plan files under `docs/plan/`. One of them,
`docs/plan/2026-08-21-reference-first-session-titles.md`, is owned by a parallel running session and
is directly affected by this plan (see "Architecture decisions", decision 10). The implementing run
must not modify it.

## Requirement

On the Claude Code butler path the rename request is deliberately the run's last action:

> The order of a run is: decide the title early per the session-title contract, discover the butler,
> decide from **this session's own context** whether a line is printed, and send the request as the
> run's last action, after the run's own output.
> — `src/shared/session-rename.md:61-63`

Everything between the moment the title is fixed and the run's final action is therefore an
unprotected window. A run that never reaches that final action — interrupted, abandoned at a gated
question, or failed — leaves the `**Suggested session title:**` line as its only trace and never
renames. From outside, that outcome is indistinguishable from the degradation table's first row (no
session carries the marker title), so a user cannot tell a lost rename from an absent butler.

The window was observed live in this repository on 2026-08-21. Session
`Unframed iterate return channel · plan` printed
`**Suggested session title:** What a delegated outcome may decide · review` early in a `review` run,
while the butler transcript held four earlier successful requests from that same session and none
carrying the review title. That specific case was a send still pending rather than a send lost — the
run had not finished — which is precisely what makes the window visible: the title stayed stale for
the entire length of a long run, and would have stayed stale forever had the run been abandoned.

The requirement is to close the window from both ends:

1. Send the request **as soon as** the title is fixed and discovery yielded exactly one butler,
   instead of at the run's last action.
2. Send a further request **whenever the title changes** during the same run, within a per-run
   budget, so that moving the send earlier does not cost a later-bound title.

## Architecture decisions

1. **Send at title-fix time, matching the host that already does.** The ChatGPT Desktop section
   already calls its operation "once, as soon as the subject is fixed"
   (`src/shared/session-rename.md:29-31`). Aligning the Claude Code path removes a per-host timing
   difference that the fragment currently has to carry in prose, and it makes one sentence true of
   both hosts.

2. **Both stated reasons for the late send survive the move.** The source gives two
   (`src/shared/session-rename.md:63-64`). "The run's own output is never delayed" holds better than
   before: the send now happens during the run's work rather than between finishing and reporting.
   "The reply lands at the top of the next turn" is a property of the reply, not of the send — the
   butler is a separate session and its answer can only be delivered once this turn ends.

3. **A mid-run reply is data, and that rule becomes load-bearing.** `session-rename.md:170-173`
   already says a butler reply is a value for the liveness comparison and nothing else. Sending
   earlier makes it possible for a reply to arrive while the run is still working, so the rule is
   extended to name that case explicitly: ignore it, produce no output for it, and do not let it
   change this run's line decision, which was already made. This is the one new hazard the move
   creates and it is pinned rather than implied.

4. **A corrective request is not the banned retry.** The closing paragraph forbids retries and
   variant titles (`session-rename.md:221-223`). A retry re-sends after a failure; a corrective
   request sends a **different, later-bound** title after a **successful** send. The source states
   that distinction in its own sentence, because an implementer reading the two rules side by side
   would otherwise resolve the apparent contradiction by dropping the corrective request.

5. **Any title change triggers; a budget of six requests per run is the brake.** The trigger is a
   character-exact difference from the last title this run sent — the only comparison a run can
   perform without re-deriving the title, and the only one an assertion can pin. Paraphrases
   therefore trigger too, which is why a budget rather than a semantic rule bounds the cost. Six is
   a deliberate allowance, not a derived figure: it covers a long `build` run (subject fixed,
   subject sharpened after analysis, pull-request reference bound, final scope diverged) with
   headroom, and stays far below a count that would fill a transcript with butler turns. The same
   spirit as the merge gate's round budget: a budget bounds a loop whose natural length is unknown,
   it does not encode a semantic limit. It stays a fixed constant in the fragment, with no
   configuration key — the butler path has no machine-local configuration at all, by decision.

6. **Exhausting the budget is silent.** A run that reaches six requests sends no more and prints
   nothing extra. The line budget is untouched: at most one suggestion line per run, whatever the
   number of requests.

7. **Discovery is not repeated.** Every corrective request reuses the discovery result of the first
   send. A repeated listing costs a tool call and can return a different count mid-run, which is an
   ambiguity nobody can act on.

8. **The stop rule outranks every send.** A reply from an earlier turn reporting a title differing
   from every title this session requested still stops all sending for the remainder of the session
   — initial and corrective alike, and regardless of remaining budget. Within a single run that
   rule cannot fire from this run's own request, because no reply can arrive in the turn that sent
   it.

9. **The liveness comparison accepts any request this session sent.** With several requests in one
   run, a later run comparing a reply against only "the title that earlier request carried" can read
   a correct rename as the mismatch row and silence the session for good. The comparison therefore
   counts a match against **any** title this session requested, not only the most recent one. This
   grows in importance with the budget: at six requests per run, a comparison keyed to a single
   title would misfire far more often than it would fire correctly.

10. **The interaction with the reference-first plan is named, and that file is not touched.**
    `docs/plan/2026-08-21-reference-first-session-titles.md` rests on the late send twice: its
    architecture decision states that "because the request is the run's last action, the reference is
    already bound when it is sent, so this path needs no second request and stays at one per run"
    (lines 158-160), and its assumptions section says the same reading "was not observed live" and
    anticipates exactly this outcome — "If an implementing run finds a tool that emits earlier on that
    path, the bounded second emission applies there too" (lines 278-281). Implementing this plan
    invalidates the first and satisfies the second. **Sequencing:** this plan is implemented first;
    the reference-first plan is then re-read against the changed fragment, where its "no second
    request on Claude Code" sentence becomes "the late-bound reference travels in the bounded
    corrective request". This plan changes no other plan file.

11. **Only the orchestrating run sends.** `src/shared/session-title.md:24-25` says internal
    sub-agents and workers never emit the line. While emitting and sending happened at the same
    moment that clause covered both; decoupling them makes the sending side a separate, currently
    unanswered question. It is answered here in the same direction: a delegate never sends a rename
    request, and the orchestrator sends it once the delegate has returned the subject. A worker
    shares the host session but not the run's own request history, so a worker that sent would
    break the liveness comparison it cannot see.

12. **Today's live trigger is the diverged-scope case.** `src/shared/session-title.md:31-33` already
    recognizes a run whose final scope diverged from the title it decided, and today such a run only
    restates the title in prose. The corrective request gives that case a rename. The late-bound
    pull-request reference is the second consumer and arrives with the reference-first plan; the
    mechanism is defined once here so that plan need not reopen the Claude Code section.

## Affected files

| File                                | Description                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-rename.md`      | Replace the order paragraph (61-64) with title-fix-time sending; extend the mid-run reply rule (170-173); add the bounded corrective-request rule with its cap, its trigger, and its retry distinction; widen the liveness comparison (176-181) to any request this session sent; amend the closing "at most one request per run" sentence (221-223) |
| `docs/adr/session-rename-butler.md` | Record the timing decision and amend the per-rename cost consequence, which now reaches two model turns in the corrective case                                                                                                                                                                                                                       |
| `test/workflow-contracts.test.mjs`  | Add assertions in the existing `the Claude Code butler section carries its load-bearing clauses` test for the send moment, the change trigger with its six-request budget, the corrective-versus-retry distinction, the mid-run reply rule, the widened comparison, and the orchestrator-only sending rule                                           |

`dist/` is generated by `node build.mjs` and is never edited by hand.

**Two files were added to this set during implementation**, both caused by the base moving from
`f449d20` to `9c87034` mid-run (see "Implementation record"):

| File                                 | Description                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md`        | One sentence. `9c87034` licensed one further title on an early-applying path and scoped it to the ChatGPT Desktop native call "because Claude Code was late-applying". This change makes the butler path early-applying too, so the allowance now names both hosts. Approved as a deliberate one-file scope extension |
| `docs/user-guide/getting-started.md` | The Claude Code bullet stated the send is the run's last action and treated the _request_ as the unit the suggestion line is printed per. Both are now false; corrected to the early send with a late-bound reference following in a further request, and to the _run_ as that unit                                   |

## Implementation details

### Approach

0. Re-read `src/shared/session-rename.md` at the current tip of `develop` first. If
   `docs/plan/2026-08-21-reference-first-session-titles.md` was implemented in the meantime, its
   sentence stating that the Claude Code path needs no second request is already in the fragment
   and step 2 replaces it instead of adding beside it.
1. Rewrite the order paragraph in `src/shared/session-rename.md` so the run's order reads: decide the
   title, discover the butler, decide from this session's own context whether a line is printed, and
   send the request at that point. Keep the "send either way" clause, the stop rule, and the
   sentence that the request does not expire. Drop the phrase "last action" and the two
   justifications tied to it, replacing them with decision 2's reasoning in one sentence.
2. Add the corrective request as its own short block below that paragraph: sent whenever the title
   differs character-exactly from the last title this run sent, capped at six requests per run,
   reusing the first discovery result, gated by the same stop rule, silent once the budget is
   exhausted, and explicitly not a retry.
3. Extend the mid-run reply sentence in the liveness section with the arriving-while-working case.
4. Widen the comparison rule so a reply matching **any** title this session requested counts as a
   match; keep the existing "not recoverable from this context counts as absent" clause unchanged.
5. Amend the closing paragraph: "at most one request per run" becomes the six-request budget with
   its trigger, while "one line at most" and "no variant title after a refusal" stay verbatim.
6. Extend `docs/adr/session-rename-butler.md`: one Decision bullet for the send moment and the
   budget, and the cost consequence amended — a run now costs up to six model turns and six
   pseudo-user messages instead of one each.
7. Add the assertions listed in "Affected files" to the existing butler-section test, each with the
   short rationale comment that file's neighbours carry.
8. Run the repository's CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
   `pnpm test:distribution`.

### Edge cases

- **The title never changes** — the ordinary run. Exactly one request goes out, and the observable
  outcome is identical to today's apart from the moment it is sent.
- **The run is interrupted after the send.** The session is renamed to a subject whose work may be
  incomplete. Accepted deliberately: a subject-bearing title beats `Effective-flow plan R-0000010`,
  and that is the whole point of the change.
- **The run aborts before the title is fixed.** Nothing is sent, exactly as today.
- **A corrective request goes out before the previous reply arrives.** Permitted. The butler mandate
  treats each message independently and needs no change.
- **A reply arrives after a later request was sent.** Covered by decision 9: the reply matches a
  title this session requested, so it is not read as the mismatch row.
- **The title is only paraphrased.** It triggers a request like any other change. This is the
  accepted cost of the character-exact trigger; the budget, not a semantic rule, is what bounds it.
- **The budget is exhausted.** The seventh change sends nothing and prints nothing. A run that
  changes its title six times has a title-derivation problem the rename path should not paper over.
- **The butler refuses the title** (over 60 characters, control character, code fence, or a title
  addressing it with directions). Unchanged: suggestion line plus the one-line notice, and no variant
  title afterwards. A refusal is not a title change and therefore not a trigger.
- **The butler processes in-flight requests out of order.** The session then ends on an earlier
  title rather than the latest one. The requesting side cannot detect this — it never reads its own
  title — and cannot fix it without a retry the contract forbids. Accepted: the outcome is a
  stale-but-correct subject, not a wrong one. The risk grows with the budget and is the strongest
  argument against raising it beyond six.
- **A delegating tool.** The delegate determines the subject and returns it; the orchestrator sends.
  Nothing is sent from inside a worker.
- **No butler, several butlers, unresolvable own id, or a session tool that errors.** Unchanged:
  suggestion line, no request, and no corrective request either.

## Acceptance criteria

- [ ] `src/shared/session-rename.md` contains no occurrence of "last action", and its Claude Code
      section states that the request is sent as soon as the title is fixed and exactly one butler was
      discovered.
- [ ] The fragment names the character-exact title change as the trigger for a further request and
      caps a run at six requests, with the exhausted budget explicitly silent.
- [ ] The fragment distinguishes the corrective request from a retry in its own sentence.
- [ ] The fragment states that a reply arriving while the run is still working is data, produces no
      output, and does not change this run's line decision.
- [ ] The comparison rule accepts a match against any title this session requested.
- [ ] The fragment states that a delegate never sends a rename request and the orchestrator does.
- [ ] `docs/adr/session-rename-butler.md` records the send moment and the budget as decisions, and
      its cost consequence names up to six model turns and six pseudo-user messages per run.
- [ ] The new assertions in `test/workflow-contracts.test.mjs` fail against the pre-change fragment
      and pass after the change.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.
- [ ] `git status` shows `docs/plan/2026-08-21-reference-first-session-titles.md` unmodified.

## Validation plan

- Run the four CI commands in the order `AGENTS.md` prescribes for distribution-source edits.
- Prove the new assertions are load-bearing: stash the change to `src/shared/session-rename.md`
  alone, run `pnpm test`, and confirm the new assertions fail; restore and confirm they pass.
- Manual observation of the live path, optional but decisive: start any work-subject tool in a
  session with a discovered butler, interrupt the run shortly after the suggestion line appears, and
  confirm from the session list that the title changed anyway. Against the current fragment the same
  interruption leaves the title stale.

## Assumptions and open points

- **Assumption, unverified:** a cross-session reply can be delivered while the receiving run is still
  working. In this repository's observed runs the butler reply always arrived after the requesting
  turn had ended. The mid-run reply rule is therefore either load-bearing or cheap insurance; it is
  written either way, because the failure it prevents — a work subject read as an instruction and
  starting unasked work — is expensive and silent.
- **Assumption, unverified:** the butler processes several messages from the same session in arrival
  order. Its mandate handles each message independently, so order affects only which title lands
  last; two in-flight requests from one session were not observed live. With a budget of six this
  assumption carries more weight than it did at one request per run.
- **Assumption, deliberate:** six is a budget chosen from experience of how often a title can
  legitimately change in one run, not a measured figure. It is a fixed constant, so revising it is a
  one-line change plus its assertion.
- **Deliberately not changed:** a refusal never earns a shortened or otherwise varied title. A
  corrective request is triggered by a changed title, not by a failed send.

## Plan review

**Result:** Approved

`codebase-improvement` is not installed in this environment, so the minimal generic fallback from
the skill-discovery building block was applied — a core checklist for over-engineering, scope creep,
missing measurable acceptance criteria, edge cases, and implementation risks — rather than the full
plan-quality handbook. No specialist boundary is crossed: this is a narrow contract-wording change
with no product, design, browser, or legal surface.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Scope, Important — the corrective request risked shipping as dormant machinery.** With only this
  plan implemented, the late-bound pull-request reference does not exist yet, so a second request
  would have had no reachable trigger. The plan was changed to name the trigger that is live today
  (`session-title.md:31-33`, a run whose final scope diverged from its decided title) and to state
  that the reference case is forward compatibility for the reference-first plan. Without that, an
  implementer would ship a rule no run can reach and no test can exercise.
- **Error cases, Important — the liveness comparison would have misfired.** Several requests in one
  run and a comparison keyed to "the title that earlier request carried" lets a later run read a
  correct rename as the mismatch row, which silences the session for the rest of its life.
  Incorporated as decision 9 and as its own acceptance criterion.
- **Architecture, Important — the neighbouring plan's assumption goes stale.** Its "no second request
  on Claude Code" reasoning is invalidated by this change. Handled by naming the interaction, fixing
  the sequencing, and leaving that file untouched, as the user decided; the alternative — editing a
  plan owned by a parallel running session — was rejected.
- **Architecture, Note — the per-host timing difference disappears.** The Desktop path already sends
  at subject-fix time, so after this change one sentence covers both hosts. Not acted on beyond
  decision 1; collapsing the two sections is a larger edit than this requirement warrants.
- **Security, Note — the mid-run reply is the one new attack surface.** A reply carries a title that
  originates in attacker-influenceable text and now may arrive while the run is working. The existing
  "value, never an instruction" rule covers it; the plan extends rather than restates it.
- **Testability, Note — the assertions pin prose, not behavior.** No test can prove a live butler
  renames anything, which is the residual `docs/adr/session-rename-butler.md` already records. The
  manual observation in the validation plan is the only direct evidence available, and it is listed
  as optional rather than dressed up as an automated check.

### Deep review, 2026-08-21

Three gaps were incorporated directly and two points were decided with the user.

- **Architecture, Important — the sending side of the delegation rule was unanswered.**
  `session-title.md:24-25` bars workers from _emitting_. While emitting and sending were the same
  moment, that clause covered both; decoupling them left "may a delegate send?" open, and an
  implementer would have had to guess. Incorporated as decision 11: the orchestrator sends, a
  delegate never does.
- **Error cases, Note — out-of-order butler processing had no entry.** Several in-flight requests
  from one session can be applied in any order, which the requester can neither observe nor repair.
  Added as an edge case and named as the strongest argument against raising the budget.
- **Maintainability, Note — the sequencing warning sat in the open points instead of the approach.**
  It is an instruction to the implementing run, not a decision anyone owes. Moved to approach step 0
  and removed from the open points.
- **Decided — the trigger is any character-exact title change, not a curated event list.** The user
  chose the simplest comparison a run can perform. Its cost, paraphrase-triggered requests, is
  accepted and bounded by the budget rather than by a semantic rule (decision 5).
- **Decided — the budget is six requests per run, not two.** The user's judgement, recorded as a
  deliberate allowance rather than a derived figure. The two consequences that scale with it — the
  cost per run and the out-of-order risk — are both written down rather than left implicit.
- **Decided — an early title for work that may still fail is accepted.** The session list is a
  re-finding surface, not a results surface, and a subject beats `Effective-flow plan R-0000010`.

## Open points

- No open points.

## Implementation record

**The base moved mid-run.** Implementation started against `f449d20`. While phases 2-6 were
running, `9c87034` ("put the work reference first in the session title") landed on `develop` and
rewrote `src/shared/session-rename.md`, `src/shared/session-title.md` and
`test/workflow-contracts.test.mjs` — all three files this change touches. Nothing had been
committed, so the delivery branch was reset onto the new base and the change was re-derived against
the new text rather than merged into it. Approach step 0 anticipated exactly this and was followed.

Three consequences, all recorded rather than absorbed silently:

- **The neighbouring plan's sentence was replaced, not preserved.** `9c87034` added "Because the
  send is last, a work reference the run only produced along the way … needs no second request and
  stays at one per run." Its premise is what this change removes, so the sentence is gone.
- **Open point R-0000106 of decision 12 resolved itself.** The plan could name no live trigger for
  the corrective request beyond a diverged final scope, and the plan review flagged the risk of
  shipping dormant machinery. The independent review confirmed the risk was real: `session-title.md`
  only says to _restate_ an already-decided title, which produces no new title, so the rule would
  have been dead text. `9c87034` supplies the missing producer — it binds the reference when the
  title is applied and licenses one further title where the first carried no reference. The
  corrective request is now how the Claude Code path carries a pull request opened during the run.
- **The scope grew by two files**, both listed above and both approved explicitly rather than
  absorbed.

## Test results

All commands run in the delivery worktree against base `9c87034`:

| Check                    | Result                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `pnpm agent:check`       | pass — 297 files correctly formatted                           |
| `pnpm test`              | pass — 704 tests, 704 pass, 0 fail                             |
| `node build.mjs`         | pass — all three targets, guards green, core budgets unchanged |
| `pnpm test:distribution` | pass — offline checks passed                                   |

**Negative proof of the new assertions.** Every one of the sixteen assertions in the butler test was
evaluated individually against the pre-change contract; all sixteen fail there and pass on the new
one. Four were additionally proven against mutants of the _current_ fragment that delete or weaken
just their rule — necessary because a suite run cannot show more than the first failure, and because
review had found three assertions that stayed green while their rule was removed.

Consistency sweep: `last action` no longer occurs anywhere under `src/`, and its only occurrence
under `docs/` outside plan narrative is the deliberate historical contrast in the ADR. The retired
wordings `the title that earlier request carried`, `needs no second request`, `stays at one per run`
and `at most one request per run` occur nowhere under `src/` or `test/`.

## Review findings

**Date:** 2026-08-21
**Reviewer:** `effective-flow-generic-product-reviewer` (contract prose and ADR),
`effective-flow-nodejs-reviewer` (contract test suite)

Both reviewers were asked for all severities, so this is a complete audit trail rather than the
usual Critical-plus-Important delivery.

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    16 |
| Open / Not implemented |     8 |

Fixed: 1 Critical, 11 Important, 4 Note. The Critical was a terminology collision — the first
implementation wrote "A delegate never sends a rename request", but `session-title.md` uses
_delegate_ for a delegated **tool**, which does emit and therefore must send; on the
`apply` → `apply-plan` path that sentence assigned the send to a parent that had already handed the
run away, losing the rename on the most-travelled path.

Three of the Important findings were proven with mutants rather than argued: a negative pin running
on raw Markdown that a line wrap defeats, a `near(…, 'cap', 150)` that stayed green against a source
rewritten to "There is no cap", and a mid-run assertion whose decoy sat 45 characters outside its
window. All three would have shipped as assertions that could not fail.

**External review report:** `.effective-flow/review/review-report-2026-08-21-plan-early-butler-rename-request.md`

The eight open findings are all Note severity and were deferred by an explicit decision to fix
Critical and Important only. Five concern wording and structure of the shipped contract and its
ADR — most notably a heading that totals seven requests where the body caps the run at six — and
three concern test robustness and calibration.

## No-check-list waiver

This fragment carries the body of Phase 4's `#### The no-check-list waiver` in
`effective-flow merge-gate`: the rules that decide whether the waiver question is posed, how each of
its answers ends or continues the run, and the `ask` fence itself. It loads when a Phase-4
evaluation's fresh read states `checksReported: false`, and what decides that moment stays in the
always-loaded core – the section heading with its entry gate, condition 2's clause naming the
waiver, Phase 2's unreported-list rule, the wisdom record of each round's waiver, and the Phase-6
report of a merge on a waived check list. The pointer fires more broadly than the question is posed,
on purpose: every branch that poses nothing – report mode, a non-interactive run, another unmet
condition, a verified head that is not a full object name, and an evaluation the waiver record
already covers – is decided below as well, so a trigger naming only the posed case would leave those
runs deciding from text they have not loaded. `effective-flow merge-gate` is this fragment's only
consumer, and "this section" below means that Phase-4 section.

### Waiver rules

- **What it is posed for, and what it never reaches.** Pose it only where condition 2 is the
  **only** unmet condition of that evaluation, and is unmet **solely** because the fresh read states
  `checksReported: false` while the check criterion of `mergeGate.requireAllChecks` is otherwise
  satisfied. An affirmative answer satisfies condition 2's "a check list was reported at all" clause
  for **that one evaluation** and nothing else. It never satisfies the check criterion and reaches
  no other condition. Where a check **has** appeared the read states `checksReported: true`, this
  question is not posed at all, and a pending or red check blocks exactly as it does today.
- **Why this one waits for an otherwise clean evaluation where the set-aside confirmation does
  not.** That question is posed "whatever else the same evaluation left unmet" because a set-aside
  finding needs disposing of whether or not this run merges, and its answer is carried forward to
  the round that does. This answer disposes of nothing: it authorizes a merge and nothing else.
  Posed while another condition still blocks, it asks the operator to authorize an outcome their
  answer cannot produce — so such an evaluation reports its unmet conditions and poses no question,
  and the waiver waits for an evaluation in which condition 2 is all that stands between this run
  and the merge.
- **What the operator is actually answering, stated honestly.** The waiver covers
  `checksReported: false` at the verified head **whatever its cause** — a repository that runs no CI
  at all, and equally a CI-bearing repository whose checks had simply not attached at the instant of
  that read. No provider signal separates the two: an empty rollup is the same document in both
  cases, which is exactly why this is an operator's answer about their own repository rather than a
  read this gate could perform. Name the pull request and `VERIFIED_HEAD_SHA` in the lines that
  precede the question, so the answer is given about a concrete commit rather than about the
  repository in general.
- **Which runs reach this question at all, which is narrower than this section's opening reads.**
  A waiver posed in Phase 4 is reachable only from a run whose Phase-2 check wait did not already end
  it, and on GitHub the **default** `mergeGate.requireAllChecks: true` ends it. On a repository with
  no CI the structured half of `pr-checks-wait` comes back with no parsable check list at all, and
  the helper classifies that as an operational error (`COMMAND_FAILED`) rather than as an empty
  result; Phase 2 step 2 names a recovery for a timeout and for a missing watch capability and none
  for that, so the run ends there and this question is never composed. **Two configurations do reach
  it.** With `mergeGate.requireAllChecks: false` step 2 restricts that read to the forge's own
  required checks, and the helper turns the identical response into a **successful** result carrying
  `requiredChecksDefined: false`, so the loop runs on to step 4's own unreported-list question and
  Phase 4 follows it. On **Forgejo** `pr-checks-wait` is unsupported outright and
  returns `UNSUPPORTED_CAPABILITY`, which step 2 already answers by reporting and asking once, so the
  waiver is reachable there under either setting. This is a scope statement, not a second gate: a
  GitHub repository with no CI and the default check criterion is still unmergeable from this tool,
  and closing that is a change to the helper's error discrimination rather than to anything here.
- **The operator was already asked once in Phase 2, and asking again here is accepted.** Phase 2
  does not leave its check loop on an unreported check list either: it reports that and asks once
  under step 2's rule before proceeding, so on exactly the repository this waiver exists for a gated
  merge-mode run is asked **twice**. That is deliberate and not an oversight — condition 2 states
  why the earlier answer cannot carry, because it was given about an earlier read and this one
  decides the merge — but the operator meets the second question as a repeat, so name the Phase-2
  question in the lines that precede this one rather than letting it read as the same question
  asked twice over.
- **Posing it in Phase 4 is what makes the head binding sound, and no revocation rule is needed.**
  `VERIFIED_HEAD_SHA` is already set by the time this phase runs, condition 8 requires the freshly
  read head to equal it, and Phase 4 evaluates every condition against **one** fresh read at one
  instant. The answer and the read it concerns are therefore the same moment: there is no interval
  in which an acknowledgement could outlive its evidence, no second head SHA to record, and nothing
  to revoke.
- **The verified head must be a full object name.** Pose nothing unless `VERIFIED_HEAD_SHA` is a
  full object name — 40 or 64 hex digits, in either letter case, which is the shape the helper
  itself enforces. An abbreviated or unreadable value is not a commit the operator can go and look
  at, and a waiver given against one is a waiver against nothing. **Condition 8 does not catch that,
  and the report must not name it:** that condition asks only whether `VERIFIED_HEAD_SHA` is set and
  equals the freshly read head, so two abbreviated values that agree satisfy it just as two full ones
  do. What an unposed waiver leaves behind is an uncleared reported-at-all clause, so such a run
  blocks on **condition 2** and is reported there instead.
- **A decline, or no answer, ends the run** with a report naming the **declined waiver** rather than
  condition 2. The operator's decision is the fact worth reporting, and naming the condition instead
  hides that they were asked at all. Nothing returns into Phase 3: no further round changes an
  answer about a repository's own CI, exactly as none changes a declined set-aside confirmation.
- **A non-interactive run cannot pose it, so it blocks and reports.** Take the shape "The set-aside
  confirmation" takes for a non-interactive run — report and end the run, never merge — and report
  that an **interactive** run with `mergeGate.completion: merge` is what would authorize the waiver.
  The waiver is available to a **gated** run only, so a repository with no CI stays unmergeable from
  a non-interactive run, precisely as a set-aside finding stays unconfirmable from one.
- **Not posed at all where the resolved completion mode is not `merge`.** Condition 1 is unmet in a
  report-mode run, so no answer could authorize a merge; the report names the unreported check list
  instead.
- **It is recorded per round and expires with the head.** Record the answer in the wisdom file beside
  `VERIFIED_HEAD_SHA`, bound to that value and to nothing else, so Phase 2's statement that nothing
  else in this workflow records a head SHA for later use stays true. Discard it wherever that value
  is discarded — a Phase-3 restart does exactly that (Phase 3 step 6) — and consume nothing from it
  in an evaluation whose freshly read head does not equal it, which is condition 8's own comparison.
  A new commit is a new check list: the repository that reported none may have grown one since, and
  the operator answered about the head they looked at.
- **A later evaluation at the same head reads that record instead of asking again.** A Phase-4
  return into Phase 3 that produces **no** implementation leaves `VERIFIED_HEAD_SHA` standing —
  Phase 3 step 6 discards it only where an implementation happened — so the next evaluation runs
  against the very head the operator answered about. Take the set-aside confirmation's own
  mechanism: every later Phase-4 evaluation reads the record **before** it composes the question,
  and an evaluation the record already covers poses none — condition 2's reported-at-all clause is
  simply clear there, and the evaluation continues on its remaining conditions. Without that, a run
  that returns into Phase 3 without implementing anything poses the identical question every round
  until `mergeGate.maxRounds` is spent.
- **A merge performed on a waived check list is reported as one.** Phase 6 names it rather than
  letting the run read as a merge whose checks were green, because nothing here verified that any
  check ran at all.

If condition 2 is the only unmet condition of this evaluation and is unmet solely because the fresh read states `checksReported: false`, the check criterion is otherwise satisfied, the waiver record does not already cover this evaluation, `VERIFIED_HEAD_SHA` is a full object name of 40 or 64 hex digits in either case, the resolved completion mode is `merge`, and the run is gated. An evaluation that leaves any other condition unmet poses nothing: this answer authorizes a merge rather than disposing of anything, so it is asked only where it can decide the outcome: Ask the user: **The head named above reports no check list at all, so nothing in this read proves that any check ran. May this run treat the absent check list as expected for this repository and merge once every other precondition holds?**
- Waive -- Treat the unreported check list as expected at the verified head named above and continue the gate; every other merge precondition still has to hold on its own
- Stop -- End the run with a report naming the declined waiver; nothing is merged, and no further round is delegated because no round changes this answer

## Tick offer

This fragment holds the `Tick & close` offer of Phase 5.5 in `{{SKILL:merge-gate}}`: its listing,
its loop, its relayed branch and its `ask` fence. It loads when step 3 of the loaded
`merge-gate-issue-observation` fragment has recorded at least one linked issue `tick-eligible`, and
it runs at the start of that fragment's step 4. The steps, revalidation outcomes, transition and
failure rule named below are that fragment's.

### Listing and loop

When the run is gated, list each tick-eligible issue in chat immediately before the `Tick & close`
question: its reference, then per criterion its ordinal, its `key8`, its `displayText` and its
evidence reference, rendered from the `pr-acceptance-verdicts` record — the review's id or URL, its
`commitSha` and `issue-<n>#criterion-<key8>: complete` — and never copied from a review body. That
`displayText` is the one named exception to the no-quoting rule this offer carries, and it rests on
its own reason: `issue-acceptance-criteria` has neutralized, trust-gated and capped it, and the
write it precedes ticks only the listed `key8`s, so the quoted text cannot change what gets written.
It reaches this listing and the relayed `BLOCKED-USER issue-tick-done` evidence, the only place a
relayed user sees the listing, and nowhere else: never the question's own fixed text, never the
Phase 6 summary. Pose the question once for the whole run, before `Issue done`. A ticked issue never
enters the `Issue done` listing, which holds only the issues step 3 rated `complete`, so a decline
of either question leaves the other's set alone. Steps 5 to 7 run after both questions.

On `Tick and set to done`, take each listed issue in turn:

1. Revalidate it on fresh reads — one `issue-acceptance-criteria`, one `pr-acceptance-verdicts`,
   one issue read, one sub-issue read and one `pr-read` — by step 3's tick rules; its fresh
   criterion `key8` set must lie inside the listed set, and a fresh dry `task-list-tick` must
   return `remainingUnchecked: 0`.
2. Run `task-list-tick` on that fresh body with the fresh `key8`s.
3. Where it returns `changed: true`, write its `body` through `issue-update-body` — dry run, then
   `--apply` — with its `inputHash` as `expectedBodyHash`. A `STALE_WRITE` ticks and closes
   nothing for that issue, is reported, and is never retried. `changed: false` writes nothing.
4. Re-read the issue, its sub-issues and the pull request, and re-derive the verdict by step 3's
   rules; only `complete` proceeds. A tick whose issue then stops here stays, because it records
   reviewed evidence.
5. Close it through step 4's transition: `issue-close` dry run, then `--apply`, and the re-read
   that must show `terminal (done)`.

Loop items 1 and 4 apply step 4's three revalidation outcomes word for word, and the
post-transition re-read replaces the recorded outcome as step 4 states. The per-issue budget is
these eight reads plus that re-read, a fixed literal of its own. A failed transition follows step
4's failure rule. This loop's confirmed set only shrinks, and nothing that was not listed and
confirmed enters it.

A **relayed** run lists the tick-eligible issues the same way and returns
`BLOCKED-USER issue-tick-done` before `BLOCKED-USER issue-done`, one per dispatch; a consumed
`Tick and set to done` confirms exactly as a posed answer does. The consumed answer is a
once-per-run record: once it exists, no later dispatch of the gate run poses `Tick & close` again,
whatever its digest, and an issue that becomes tick-eligible only afterwards stays open. A decline ticks and closes nothing. A **non-interactive**
run poses nothing, ticks nothing, and carries the recommendation into the Phase-6 summary.

```ask
when: at least one linked issue is tick-eligible per step 3 of this phase and the run is gated
header: Tick & close
question: The linked issues listed above are incomplete only because their reviewed acceptance criteria are unticked. May this run tick those criteria and set the issues to their terminal tracker state?
options:
  - label: Tick and set to done
    description: Tick exactly the listed criteria of each issue through a hash-guarded body update, then transition each issue whose fresh re-read is still complete to its terminal state, remove its effective-flow-issue-in-progress label, and complete its recorded container entry
  - label: Leave open
    description: Tick and transition nothing; every listed issue keeps its body, its state, its in-progress label and its container entry, and the summary carries the recommendation
```

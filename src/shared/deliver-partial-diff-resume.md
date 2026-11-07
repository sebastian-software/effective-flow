## Resume or release a retained delivery

This fragment carries `{{SKILL:deliver}}` step 1.1 after the source receipt when `worktree inspect`
lists a retained `partial-diff` record (`aborted` or `failed`). It runs before `upstream-status`
and before any source evidence is recorded. The proofs, call shapes and result fields belong to
the partial-diff recovery contract of `worktree-lifecycle`.

### Candidates

1. Resolve the current visibility as step 1.2 does.
2. Call `worktree resume-check` with that visibility for each such record. A call that is not
   `ok` leaves that record out with one notice line. Resume is scoped by source: a record whose
   ledger's `source.root` is not this run's `sourceRoot`, the source receipt's `EXECUTION_ROOT`, is
   never resumable here. It is a release candidate when it is `releasable` through the `clean` or
   `gone` route; otherwise report only its record ID and `source.root`, the checkout where
   `{{SKILL:deliver}}` can resume or release it. A record without a ledger is a candidate for
   release only, whatever its source.
3. Report every candidate: record ID, branch, worktree path, status, committed and remaining group
   counts, and whether it is resumable or releasable, naming the failed proofs otherwise. A record
   whose lock another actor holds fails `condition-9`; it is reported, offered nothing, and its lock
   is never broken. A release refused as `residual`, `index` or `source` also names
   `details.release.residualPaths`: it stays refused until the user restores the source checkout or
   cleans that worktree by hand.

When at least one candidate is `resumable`, list those numbered and ask once:

```ask
when: at least one candidate is resumable
header: Resume
question: Resume one of the retained deliveries listed above instead of starting a new one?
options:
  - label: Resume
    description: Continue the named delivery from its first uncommitted group with the confirmed selection, without asking for it again
  - label: New delivery
    description: Keep every listed record retained and continue with a new selection
```

With several resumable candidates, a Resume answer names one number; ask for it once in plain text
when it does not. An unanswered or skipped question, or a non-interactive run, resolves to **New
delivery**.

The Release question comes only after the Resume question resolved to **New delivery** or was not
asked, so a resumed run releases nothing. When at least one candidate is not resumable but
`releasable`, report its `releaseRoute` and, for the `ledger` route, exactly its `releasePaths`
(with `releasePathCount` when that is larger): the paths a release discards. Never run `git status`
in a delivery worktree for them. Then ask:

```ask
when: at least one candidate is not resumable but releasable
header: Release
question: Release the retained deliveries listed above for cleanup? A release through a ledger discards its proven residual changes from that worktree; they are still in this checkout.
options:
  - label: Release all listed
    description: Move every listed record to cleanup-ready; its branch and commits stay, and cleanup removes the worktree later
  - label: Select individually
    description: Choose which listed records are released; keep the rest
  - label: Keep all
    description: Release nothing; every record stays retained
```

Release only on an explicit answer, with one `worktree transition` per chosen record,
`release: "partial-diff"` and this run's `SESSION_ID`, and report each result; a refusal changes
nothing and ends no run. An unanswered question releases nothing.

Without a Resume answer, continue step 1.1 with `upstream-status` as a new delivery; every record
not released stays retained.

### Resume

Adopt the chosen record with one `worktree transition` (`adoption: "partial-diff-resume"`), its
stored status as `from`, this run's `SESSION_ID`, its branch, `workflow` `deliver` and the current
visibility. A result that is not `ok` stops the run: report the code, `proofs` and `unevaluated`.
The record keeps its status; a recovered tip the adoption already appended, reported by
`INTERRUPTED` with `ledgerAppended: true`, is found recorded by the next resume. `INTERRUPTED` with
`written: true` left the record `active` for this run: stop as a controlled stop (`aborted`).

From the `resume` result the run continues without asking for the selection again:

- **Skipped:** `upstream-status` and `fast-forward` (step 1.1), the selection, its confirmation and
  `bind-manifest` (step 1.3), steps 1.4, 2, 3, 4.1 and 4.2, `worktree.setup`, and `ledger init`
  (step 4.6).
- **Runs, in this order:**
  1. Step 1.1's source evidence, recorded fresh; steps 4.5, 5 and 7 compare against it.
  2. Step 1.2, with hidden mode when the current visibility or `resume.visibility` is hidden.
  3. A fresh delivery execution-location receipt for the record's worktree and branch: origin
     `effective-flow-created`, workflow `deliver`, purpose `partial-diff`, creation OID
     `resume.base.oid` (the record's `creationOid`), setup status `externally managed` (the
     original run finished setup; this run never repeats it), and expected `HEAD` `resume.tip`.
  4. With `resume.hookStaged`, before validation: unstage exactly the paths of
     `resume.remainingGroups[0]` in that run-owned worktree with
     `git -C <delivery root> -c core.fsmonitor=false restore --staged -- ':(literal)<path>' …`, one
     pathspec per path.
     The "never unstage" rule binds `{{SKILL:commit}}`, not this run.
  5. Step 4.3.
  6. `ledger reconcile` in place of step 4.4: it must return `exact: true` and `staged.count` 0;
     anything else is a failure that retains the artifacts.
  7. Step 4.5.
  8. Step 5 from group `resume.next` over `resume.remainingGroups` in order, with `ledger append`
     after each verified commit.
  9. Step 6, its committed-handoff evidence covering every group: the ledger's commits and this
     run's.
  10. Step 7, naming the resumed record.
- **From the ledger:** `resume.language` for both languages, `resume.base` for the base, and for
  step 7 the selection from `resume.selection` and the commit list: `resume.groups` with this run's
  commit OIDs filled in (`committed` and `remainingGroups` are views of it).

A new failure follows step 5's failure clause and moves the record back to `failed` or `aborted`;
the ledger keeps its entries, so a later run resumes it the same way. Report the model-evidence
status of resumed worker turns as observed; the resume itself makes no model-evidence claim.

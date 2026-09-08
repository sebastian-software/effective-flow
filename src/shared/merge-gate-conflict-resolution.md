## Conflict-resolution delegation contract

This fragment carries the mechanics of a base-into-head merge that conflicted: the worker-role
delegation contract below and the Phase-2 step that issues it. It loads at the moment Phase 2 step 1
observes the conflict in the provisioned checkout, and everything that decides that moment stays in
`{{SKILL:merge-gate}}`'s always-loaded core – the conflict branch itself, the modes of
`mergeGate.conflictResolution` with the unreadable value that resolves to `off`, the
`pre-commit-gate` stand-in that names the verification below, and the untrusted-head-branch threat
model, which has to stay readable as a configuration decision rather than from inside the branch
that creates it. `{{SKILL:merge-gate}}` is this fragment's only consumer.

The second delegation of this workflow is a **worker-role** delegation, not a workflow handoff, and
it is separate from the `{{SKILL:iterate}}` contract above precisely because nothing it carries is
the same. It is issued from Phase 2 step 1, only from an observed conflict, and only once per round.

Hand `{{AGENT:merge-conflict-resolver}}`:

- the **provisioned checkout's absolute root** – the invocation checkout or the Effective
  Flow-owned worktree of this step, never a second one it provisions for itself;
- the **base and head refs** of the merge that is in progress, and the fact that it **is** in
  progress;
- the **conflicted paths** as `git status` reports them in that checkout, with their staged and
  unstaged state;
- the **resolved language values**, so the worker does not re-read the project setup ADR;
- **this run's own run state** – gated or non-interactive delegation – so the worker knows whether a
  question could be answered at all;
- the **boundary it works inside**, restated because it is the gate's boundary and not the worker's
  to relax: it resolves, validates, and stages by explicit path, and it never commits, never
  continues the merge, never aborts it, never pushes, and never rewrites history. The commit, the
  push, and every lifecycle transition stay here.

Consume from it:

- `DONE` with the **per-file record** – each conflicted path with its routing role, its risk
  classification, and what was done with it; each **adjacent** non-conflicted file with the named
  failing check that demanded the change; the exact validation commands with their results and every
  check skipped with its reason; and the complete list of staged paths;
- or `ABORT` with the file and the concrete contradiction, which ends the step as a controlled stop.

Then, before anything is committed, in **exactly this order** – the order is load-bearing and is
stated for the reason the second bullet gives:

- **reconcile the record against the working tree, first.** Every modified path must appear in the
  worker's own record, named and justified. A modified path the record does not name is an error:
  abort the merge, report it, and commit nothing. The adjacent-file allowance covers **reported**
  files, never unreported ones.

  **What this reconciliation proves, and what it does not.** It verifies that every modified path is
  **named**, and that every **adjacent** path carries a named check together with the **verbatim**
  failure output that check produced before the change. It does **not** re-run that check – this
  workflow runs no validation of its own – so the bound on adjacent files is enforced as a
  disclosure requirement plus a presence check on the evidence, and the Phase-6 report is where a
  human audits whether the named failure actually justified the change. An adjacent path named
  without a check, or named with a check but without its verbatim failure output, counts exactly as
  an unnamed path: abort the merge, report it, commit nothing;

- **verify independently, second.** Hand the resolved but uncommitted tree to
  `{{AGENT:code-validator}}` for an independent execution and report of the repository's checks, so
  the resolution is not verified only by the role that produced it. A failing verdict from **either**
  role is treated as `ABORT`; the two roles disagreeing is not a tie to break. This is the only
  validation this workflow commissions directly, and it still happens inside delegated roles – the
  gate starts none of its own.

  Hand `{{AGENT:code-validator}}`:
  - the **provisioned checkout's absolute root** – the same checkout, with the merge still in
    progress and the worker's paths staged;
  - its **assigned scope**: the union of the conflicted paths and every adjacent path the worker
    reported, bucketed and ordered per that role's `Project routing`;
  - the **validation mode `full`**, because this commit has no other pre-commit gate (see "Git write
    boundary") and `full` is the mode that preserves a repository-mandated combined or top-level
    gate;
  - the **resolved language values**, so the validator does not re-read the project setup ADR – its
    own language rule forbids that, so a validator handed none has no compliant option.

  **`{{AGENT:code-validator}}`'s own result declares the working-tree changes its validation
  generated.** Those paths come into existence **after** the reconciliation above and are therefore
  never measured against the worker's record – a reconciliation run afterwards would abort a correct
  resolution over a file the validator itself wrote. They are not staged either: the merge commit
  contains exactly the paths the worker staged, and a validation-generated change is reported and
  left in the working tree;

- **fail closed on an unverified resolution.** The resolution counts as verified only when these two
  layers together **executed at least one** of the repository's own checks and every executed check
  passed. A run in which every check was reported skipped – by the worker, with its reason, or by
  `{{AGENT:code-validator}}` returning `SKIPPED` – and any verdict that is not an affirmative pass
  are treated **exactly as `ABORT`**: abort the merge, report that the resolution could not be
  verified together with every check that did not run, and push nothing. An unprovable verification
  is never an assumed pass, exactly as an unstated merge state, an unstated `required` flag, an
  unprovable bot state, an unprovable assessment, and an unprovable identity are never assumed
  passes in this file.

**A generated file can be the conflicted one**, and the resolver regenerates it from its source
instead of merging its text. `dist/` is gitignored in this repository and cannot conflict here, but
a consumer project's generated tracked files can.

#### Resolving a conflict with the base

Entered from step 1 above, and only from a merge that has actually conflicted in the provisioned
checkout. The merge is in progress at this point: nothing is committed, nothing is pushed, and the
checkout is the one step 1 provisioned – never a second one.

1. **Resolve the mode before any further write.** Read `mergeGate.conflictResolution` and record the
   resolved value with its source; "Configuration" states what each value means and why.
   - **`off`:** end the merge with `git merge --abort`, report the conflict with the conflicted paths
     as `git status` reported them, and merge nothing. No commit and no push.
   - **`ask` in a gated run:** pose the question below **exactly once per Phase-2 round** – once per
     conflict, not once per run, because each round's conflict is a **different** conflict against a
     base that moved again. An answer against the resolution is treated as `off` for that round.
   - **`ask` in a non-interactive delegated run:** the question cannot be posed, so it behaves as
     `off`, and the report names `mergeGate.conflictResolution: auto` as the setting that would
     authorize the resolution.
   - **`auto`** (the default): continue with step 2.
2. **Capture the conflict state** – the conflicted paths, their staged and unstaged status, and the
   two sides per file – and delegate to `{{AGENT:merge-conflict-resolver}}` per
   "Conflict-resolution delegation contract". The human-comment guard does **not** block this
   delegation, for the reason stated beside the CI repair.
3. **Consume the worker's outcome.** `ABORT` ends this step as a controlled stop under step 1's last
   bullet. `DONE` continues.
4. **Reconcile, then verify independently** – in that order, per that contract, ending with the
   resolved but uncommitted tree handed to `{{AGENT:code-validator}}` in `full` mode. A modified path
   the record does not name and justify, a failing verdict from either role, or a verification that
   executed **no** check at all ends this step as a stop that commits nothing.
5. **Commit and push.** The gate – not the worker – completes the merge commit and pushes the head
   branch normally. Keep Git's default merge-commit message, which already lists the conflicted paths;
   add no `Co-Authored-By` trailer and no AI attribution. Then re-read the status, exactly as the
   clean path does, and close the checkout's lifecycle per step 1.
6. **One attempt per round.** There is no retry loop inside this step, and it opens **no round of its
   own** – it lives inside the round step 1 belongs to, which continues into step 2 – and
   `mergeGate.maxRounds` bounds how often the run may come back here.

```ask
when: a Phase-2 base-into-head merge has conflicted, `mergeGate.conflictResolution` is `ask`, and the run is gated
header: Conflict
question: The head branch conflicts with its base. May this run resolve the conflict, verify the result, and push the merge commit?
options:
  - label: Resolve
    description: mergeGate.conflictResolution = auto — hand the conflicted files to the merge-conflict resolver, have the resolved tree verified independently, and push one merge commit
  - label: Report only
    description: mergeGate.conflictResolution = off — abort the merge, leave the branch untouched, and end the run with a report of the conflict
```

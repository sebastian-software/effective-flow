# A state model for the plan archive handshake

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

**Planned against:** `830e07a` on 2026-08-20 — the tip of `origin/develop`, which the checkout is
level with. The plan was first written against `9efe8c5` and rebased after `cbcea61` (#361) and
`830e07a` (#362) landed; three of its affected files changed on that line, so every citation below is
against `830e07a`.
**Working state:** the tree carries four untracked plan files
(`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-14-native-chatgpt-desktop-task-titles.md`,
`docs/plan/2026-08-20-plan-publication-before-implementation.md`, and this file). Only the
publication plan is related; the other two may not be modified by this change.

**Scope note:** this plan is the **first of two deliveries** (see "Delivery split"). It repairs what
breaks on every run today and depends on nothing else, so it carries no blocking open point.

## Requirement

Step 1 of "Handback and completion action" in `src/shared/worktree-integration.md` (lines 355–373) is
the single point at which an implemented plan is marked and archived. It carries three defects, all
verified against the source and — for the first — reproduced empirically, and all of them fire on the
**common** path rather than an edge:

1. **`git mv` on an untracked path is fatal.** Line 362 instructs "Move the plan file via `git mv` to
   `<plan.dir>/archive/`" with no precondition, no alternative, and no error clause. But nothing
   commits the plan file before the handback — `src/tools/plan.md:450` forbids commits,
   `src/tools/apply-plan.md:111` forbids touching the plan file, and step 2 of the handback
   (lines 374–383) is its first commit in the `build`, `fix`, `docs`, and `refactor` flows. So at the
   moment line 362 runs, the plan file is normally untracked, and `git mv` exits 128 with
   `fatal: not under version control` (reproduced). This checkout demonstrates the precondition: five
   finished plans, all `??`.

2. **There is no state for a plan that is already archived.** Step 1's only conditionals are
   "Provided the workflow kept a plan file" (356), "If the workflow kept no plan file" (369), and the
   in-place exception (370–373). Because the worktree is created from `BASE_REF` **after a fetch**
   (lines 132–134), a plan an earlier run already archived is present in the worktree at
   `<plan.dir>/archive/` and absent at top level — indistinguishable, under the current text, from a
   plan that was never archived. Step 1 then re-adds it at top level, leaving **two copies of one
   plan** on the base branch, the top-level one of which `open-plans` (`src/tools/open-plans.md:41-46`)
   reports as an open plan forever.

3. **The mark and move name no execution root.** Step 1 is the only step in the whole section that
   names none: step 2 inherits `EXECUTION_ROOT` from "Rooted operations"
   (`src/shared/execution-location.md:85-86`), step 4 names `RUNTIME_STATE_ROOT` as never-a-target,
   and step 5 (lines 413–417) names its root explicitly and forbids the fallback. Followed literally
   with an inherited working directory, line 362 runs `git mv` in the user's own checkout, staging an
   uncommitted rename on the user's own branch that step 2 — rooted in `EXECUTION_ROOT` — never
   commits and no later step cleans up. The intent is documented three times elsewhere
   (`src/shared/plan-numbering.md:49` "still on the delivery branch";
   `src/shared/worktree-integration.md:284-299`; `:364-366`) and never in the instruction itself.

A fourth, related regression comes with them: `docs/plan/archive/2026-07-16-0053-plan-datei-im-pr-des-worktree-handbacks.md:17`
decided that the redundant untracked plan copy is removed from the main checkout after the take-over,
"to prevent a dangling file and an 'untracked working tree file' collision at the `merge` completion".
**That rule is no longer present anywhere in the live fragment.** Its loss is why every worktree PR
delivery today leaves a phantom top-level plan behind — and the collision is real: `git merge` refuses
to proceed over an untracked file **even when its content is byte-identical** to the incoming blob
(reproduced), and succeeds immediately once that one file is removed.

The fix is an explicit state model detected from the index of the delivery checkout, a named
execution root for every operation, and the restored cleanup rule.

This corrects defective behavior without adding a feature, so the recommendation is Bugfix
(`effective-flow fix`).

## Delivery split

The deep review counted at least three deliveries in one plan, and found that the largest part had no
producer until the publication change ships. The work is therefore split, and **this plan is
delivery (a)**:

|                     | Contents                                                                                                                                                                                                                                                                                         | Depends on                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **(a) — this plan** | The `plan-archival` fragment with States A, C and D plus the archived-basis arm; index-first detection; the fence relocation into the four consuming tool sources; execution roots; the restored cleanup; the collision stop; both in-place shapes; the documentation reconciliation; the tests. | Nothing. Repairs today's breakage. |
| **(c)**             | State B, the publication-receipt contract including its `state` field, and the re-entry instruction for a plan implemented while its publication pull request is open.                                                                                                                           | (a) and the publication plan       |

A third delivery — recording a base commit in the delivery receipt for every shape — was planned
between the two and is now **dropped**: index-first detection needs no base commit, so there is
nothing for it to supply. Its former justification is preserved in "Detection and its interpretation
rule".

## Ownership of archival

The publication plan's affected-files table gives `src/tools/merge-gate.md` its own archival — "set
the status … and move it into `<plan.dir>/archive/`" after merging a plan pull request. Under that
flow a plan would be marked `Implemented` and archived when its **publication** pull request merges,
which is before any implementation exists. That is wrong on its own terms: a published plan is
published, not implemented. It would also create a second archive writer while this plan owns
archival and keeps `src/tools/merge-gate.md:145` ("no plan-file status switch and no archiving") true.

**Archival lives here and nowhere else.** The publication plan needs three corrections before its own
delivery: drop the `merge-gate` archival, add the receipt `state` field that delivery (c) requires,
and update its wording at `:51` and `:162`, which describes this prerequisite as a "four-state" rule
belonging to one change. None of that blocks delivery (a), which introduces no receipt and no State B
and therefore cannot conflict with it — it blocks delivery (c), where it is the entry gate. It is
recorded under "Follow-up work", not as an open point of this plan.

## Architecture decisions

- **The state model moves into its own lazily included fragment, `src/shared/plan-archival.md`.**
  `worktree-integration.md` is **eager** in `refactor`, `iterate`, `maintain`, and `merge-gate` —
  and `src/tools/merge-gate.md:145` explicitly switches step 1 off, so today it absorbs the text
  without ever using it. Growing step 1 in place would duplicate the model into four unguarded eager
  consumers, one of which is a 3201-line rendered file that discards it. The archive handshake meets
  the extraction criterion set by `docs/plan/archive/2026-07-26-context-budget-headroom.md:49-55`
  exactly — one nameable decision point, and a load pointer that states its trigger. The rationale is
  duplication and eager-consumer weight, **not** context budget: `worktree-integration` is already
  lazy in `build`, `fix`, and `docs`, and `review` never includes it. Per-tool pointers cost each of
  those three about three lines — 532, 428 and 561 against a 700-line ceiling, so the budget is not a
  factor either way.

- **The fence is never nested inside `worktree-integration.md`; every consuming tool source carries
  its own.** The decision rests on **reachability**, not on rendering. Step 1 lives inside "Handback
  and completion action", and `src/shared/worktree-integration.md:121-124` tells a run in the
  in-place-without-delivery shape to "perform no further steps from this fragment" — so a fence at
  step 1 sits in the region that mode is instructed to skip, in the one mode that archives
  unconditionally today. The only executing archival instruction there lives in the tool bodies
  (`build.md:391`, `fix.md:244`, `docs.md:293`, `refactor.md:293`), which is where the pointer
  belongs beside it. Two lesser merits follow: `merge-gate` carries no pointer at all rather than
  inheriting one it switches off at `:145`, making its opt-out structural instead of a prose caveat
  that can drift; and `iterate` and `maintain`, which hold no plan file, receive no unusable pointer.

  **The rendering argument this decision originally rested on is gone, and deliberately so.** An
  earlier draft argued that a nested fence ships raw and unreadable. That was true at `9efe8c5` and
  was repaired by `cbcea61` ("render nested lazy-include fences in shipped shared fragments"), which
  renders nested fences into load pointers, closes the `#99` shipping hole with a worklist, adds
  `assertNoUnresolvedLazyIncludes` so a raw fence can never ship from any path, and retires the three
  contract assertions that had forbidden lazy fences in shared sources — stating that placement is
  now "purely an authoring choice". None of that weakens the reachability argument, which is
  independent of how a fence renders. It is recorded here so a later reader does not re-derive the
  dead rationale, find its citations broken, and collapse the four fences back into the fragment.

  A caveat worth stating: reachability argues against nesting **at the handback step**, not against
  nesting anywhere. A fence placed high in the fragment would sidestep `:121-124` — but would lose
  the "one nameable decision point" property that
  `docs/plan/archive/2026-07-26-context-budget-headroom.md:52-54` requires of an extraction.

- **Detection reads the index of the delivery checkout, not a base tree.** The action a plan needs
  follows from what is tracked right now: a tracked `P` must be moved, a tracked `A` must not be
  re-added, and neither tracked means there is nothing to move. Keying on the base commit instead
  produced two defects — a re-entered handback re-selecting State A and running `git mv` on an
  already-moved source, and a stale base routing a tracked `P` into State C and leaving two copies on
  the branch. Both are detailed under "Detection and its interpretation rule". Index-first removes
  them, makes step 1 idempotent, and removes the base commit, the `merge-base` fallback and its
  fail-closed rule from the fragment's inputs entirely; the base survives only as an optional report
  refinement that can never block an archival.

  The shapes that carry plan files are `build`, `fix`, `docs`, and `refactor`. `iterate` and
  `maintain` mention no plan file at all, so step 1's own gate never opens for them.

- **Every Git operation on the plan file is rooted in `EXECUTION_ROOT`, explicitly.** `git -C
<EXECUTION_ROOT> …` for detection, `mkdir`, mark, move, write, and staging. The take-over read and
  the main-checkout operations are rooted in the retained absolute `RUNTIME_STATE_ROOT`. Both roots
  are carried through every later phase by `src/shared/worktree-integration.md:207-211`. This is the
  rule the section already applies to every other step; step 1 stops being the exception.

- **The mark is applied to the taken-over copy, which supersedes `0053:16` for that one point.**
  `docs/plan/archive/2026-07-16-0053-…:16` put the status switch in the main repository
  ("Autorisierung im Haupt-Repo"), and the live sequencing at lines 359–366 still reads mark → move →
  provide-in-worktree. Marking the main-checkout copy would mean the handback edits a file in the
  user's own checkout that it then never commits — the same class of defect as defect 3. The order
  becomes read → take over → mark in `EXECUTION_ROOT`. The cleanup's hash comparison depends on this
  and would never fire under the old order, so the reversal is declared rather than assumed.

- **The main-checkout cleanup from `0053:17` is restored for every state that can leave a copy
  behind.** That is States A, C, and D. State A matters because the publication plan deliberately
  leaves an untracked top-level twin; once its pull request merges, the base carries the plan, State A
  is selected, and skipping cleanup would preserve exactly the collision `0053:17` prevented.
  Removing an untracked file is not a Git operation and stages nothing, so the handback still writes
  no runtime state and creates no uncommitted change on the user's branch.
  `src/shared/worktree-integration.md:411` ("the verified `RUNTIME_STATE_ROOT` is never a cleanup
  target") governs worktree withdrawal, not this file; the fragment says so explicitly so the two
  rules cannot be read as contradicting each other.

- **No end state leaves two copies of one plan on the base branch, and the detection arm is a hard
  stop.** If the base carries the plan at both top level and under `archive/`, the repository is
  already in the broken state this model exists to prevent. The run stops and reports both paths
  rather than picking one. `git mv -f` is never used — verified, it produces a modify-plus-delete
  rather than a rename and silently discards the destination's content.

- **Scope stays at the handback.** `src/tools/plan.md:169` performs a `git mv` of its own to pull an
  archived plan back for a revision run, while `src/tools/plan.md:450` forbids commits — the same
  family of defect in a different tool. It is an open point rather than a fix here.

- **`plan-numbering.md` and the developer guide become conventions and stop being second and third
  mechanisms.** `src/shared/plan-numbering.md:46-49` and
  `docs/developer-guide/plan-conventions.md:84-92` each carry their own copy of the `git mv` archive
  mechanism. Both keep the _what_ and point at `plan-archival` for the _how_, so the three can no
  longer drift.

## Affected files

| File                                                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/plan-archival.md`                            | **New.** The declared inputs, the index-first detection procedure and its result-interpretation rule, the three states plus the archived-basis arm, the execution-root rules, the cleanup, the collision stop, both in-place execution contexts, and the report vocabulary. States the obligation that every embedding source carries its own pointer, and carries no fence of its own.                                                               |
| `src/shared/worktree-integration.md`                     | Step 1 (lines 355–373) shrinks to its decision-point framing and names `plan-archival` as the owner of the mark-and-archive contract. It carries **no** fence — see the architecture decision. The in-place bullets move into the fragment, and lines 121–124 gain a one-clause cross-reference so the fragment alone does not read as "in-place archives nothing". Step 1 passes both roots and, when the receipt has one, the optional base commit. |
| `src/tools/build.md`, `fix.md`, `docs.md`, `refactor.md` | Each gains its own top-level ` ```lazy-include ` fence for `plan-archival` with a `when:` line naming the handback delivery point and in-place delivery. These are the four shapes that carry plan files. `iterate`, `maintain`, and `merge-gate` deliberately carry none.                                                                                                                                                                            |
| `src/shared/plan-numbering.md`                           | Lines 46–49: keep the archive convention and the delivery coupling, drop the duplicated `git mv` mechanism, point at `plan-archival`, and reconcile "delivery event" with the fragment's "delivery point".                                                                                                                                                                                                                                            |
| `docs/developer-guide/plan-conventions.md`               | Lines 84–92 (the `git mv` is on 88): the third copy of the mechanism; same treatment.                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/developer-guide/build-system.md`                   | Lines 320–326 maintain the explicit list of mode-gated lazy fragments; `plan-archival` joins it.                                                                                                                                                                                                                                                                                                                                                      |
| `docs/user-guide/worktree-and-delivery.md`               | Lines 180–185 describe the move with no state distinction.                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/user-guide/glossary.md`                            | Lines 98–99, same.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/user-guide/tools-implement.md`                     | Line 95, same.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/tools/iterate.md`, `maintain.md`                    | Each gains one sentence stating why it carries no `plan-archival` pointer — it keeps no plan file. The derived-consumer test needs a stated reason per exemption; `merge-gate.md:145` already has one.                                                                                                                                                                                                                                                |
| `test/workflow-contracts.test.mjs`                       | New assertions for the states, the index-first detection and its interpretation rule, the execution roots, the cleanup preconditions, the collision stop, and the derived fence-consumer set. Nothing pins step 1 today — `git mv` appears zero times in `test/`.                                                                                                                                                                                     |

## Implementation details

### Approach

1. Write `src/shared/plan-archival.md` with the declared inputs: both roots, `plan.dir`, the plan
   file's repository-relative path, the plan's complete language, the delivery shape, and the
   optional base commit when the receipt carries one. The fragment states the obligation that every
   embedding tool source carries its own pointer, and contains no ` ```lazy-include ` fence of its own.
2. Specify the index-first detection and the result-interpretation rule.
3. Specify the three states, the archived-basis arm, and their actions, each naming its execution root.
4. Specify the cleanup with its per-state comparison basis and its ordered preconditions.
5. Specify the collision stop, both in-place contexts, and the report vocabulary.
6. Shrink step 1 to its framing, name `plan-archival` as the contract owner, pass both roots and the
   optional base commit through, and add the cross-reference at lines 121–124. Add no fence there.
7. Add a top-level `lazy-include` fence for `plan-archival` to `src/tools/build.md`, `fix.md`,
   `docs.md`, and `refactor.md`, each with a `when:` line naming the handback delivery point and
   in-place delivery.
8. Add the exemption sentence to `iterate.md` and `maintain.md`.
9. Reconcile `plan-numbering.md`, `plan-conventions.md`, and `build-system.md`.
10. Update the three user-guide lines.
11. Add the contract tests.

### Detection and its interpretation rule

`P` is `<plan.dir>/<file>.md` and `A` is `<plan.dir>/archive/<file>.md`, both repository-relative.
**The index decides the action.** Both paths are probed in **one** call against the current index of
the delivery checkout:

`git -C <EXECUTION_ROOT> ls-files -z -- ':(literal)<P>' ':(literal)<A>'`

and each NUL-separated entry is matched against the path it belongs to; one side is never inferred
from the other. The invocation shape is not free choice — it is the contract `830e07a` established
for the **reverse** archive move in `src/tools/plan.md`, whose rule this fragment inherits verbatim:
`--` only separates paths from revisions and does **not** disable pathspec globbing, so a `plan.dir`
carrying `*`, `?`, or `[` would be matched as a glob, and `-z` is what makes the per-path match safe
against C-quoting. Omitting either lets the probe read a tracked file as untracked — which here
selects State C for a tracked `P`, writes `A`, leaves `P`, and produces the two copies this whole
change exists to prevent. One probe rule now covers both directions of the archive move.

The result is evaluated in this order; the first match wins:

| #   | Condition                            | Result                                                                                                           |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `P` and `A` resolve to the same path | **Archived basis** — the run's own basis is already an archived plan. Report it, change nothing, run no cleanup. |
| 2   | `P` tracked **and** `A` tracked      | **Collision** — stop and report both paths.                                                                      |
| 3   | `A` tracked, `P` not                 | **State D — already archived.**                                                                                  |
| 4   | `P` tracked, `A` not                 | **State A — tracked.**                                                                                           |
| 5   | neither tracked                      | **State C — untracked.**                                                                                         |

**Interpretation, stated explicitly because the obvious reading is wrong** (verified): `ls-files`
exits `0` whether the path is tracked or not. Only the output decides.

- Nonempty stdout → tracked.
- Empty stdout → not tracked.
- Any nonzero exit, or a launch failure, **blocks** and is reported. It is never read as
  "not tracked". This mirrors the explicit exit-code handling
  `src/shared/runtime-state-safety.md:31-36` writes out for the same command family.
- The test is presence in the NUL-separated result, never string equality against a rendered line:
  without `-z`, `ls-files` C-quotes paths containing spaces or non-ASCII characters, so a plan named
  `2026-01-01-über plan.md` would come back quoted.

**Why the index and not the base tree.** An earlier draft keyed the table on the base commit the
delivery branch was created from, on the theory that the branch index reflects the run's own commits.
It does — and that turns out to be exactly what is wanted, because two defects follow from keying on
the base instead:

- After a State A run performs `git mv P A` and commits, a re-entered handback still sees `A` absent
  from the base and `P` present in it, re-selects State A, and runs `git mv` on a source that no
  longer exists. That is the very failure the state model exists to prevent.
- If the resolved base is behind the commit that added `P` — routine whenever `delivery.baseBranch`
  is stale or defaulted, since its default `origin/main` is not this repository's `develop` — then
  neither path is in the base, the run selects State C, writes `A`, and leaves the **tracked** `P` in
  place. Two copies of one plan on the base branch: the exact invariant this change exists to
  enforce.

Keying on the index removes both. It also removes the base commit from the fragment's required
inputs, and with it the `merge-base` fallback, its misclassification edge case, and the fail-closed
rule that fallback needed — none of which the index-first design has any use for.

**The base commit survives only as an optional report refinement.** When the delivery receipt carries
the delivery branch's creation OID (`src/shared/worktree-integration.md:149-150`, `:158`, and `:245`
for in-place with delivery), State D's report line may add whether the archive was already on the
base or was made by this run's own branch. When no OID is recorded — a reused branch, or in-place
without delivery, where `:165-167` records no delivery artifact — the line simply omits the
refinement. It is never computed, never fetched, and never blocks: a cosmetic detail may not decide
whether a plan is archived.

### The four states

| State                    | Meaning                                                       | Action                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** — tracked          | `P` is a tracked file in the delivery checkout.               | Take over the content, set the canonical status marker to the implemented value of the plan's own language in `EXECUTION_ROOT`, `mkdir -p <plan.dir>/archive` in `EXECUTION_ROOT`, then `git -C <EXECUTION_ROOT> mv P A`. Step 2 commits both. Then cleanup. |
| **C** — untracked        | Neither path is tracked.                                      | Write the final, implemented-marked content directly to `A` inside `EXECUTION_ROOT` after `mkdir -p`, and `git -C <EXECUTION_ROOT> add` it — no `git mv`, because there is nothing tracked to move. Then cleanup.                                            |
| **D** — already archived | `A` is tracked, by an earlier run or by this one.             | Never re-add at top level. Refresh `A`'s content in `EXECUTION_ROOT` if it differs from the final, implemented-marked state, so a re-entered handback carries the run's latest content. Never fail. Then cleanup.                                            |
| **Archived basis**       | The run's basis is itself a file under `<plan.dir>/archive/`. | Report it, change nothing, run no cleanup. Checked first, before any predicate.                                                                                                                                                                              |

State C is the one that fires today and the one `git mv` cannot serve. State D is the one the current
text lacks entirely — and because it is selected from the index rather than the base, it is also what
makes step 1 **idempotent**: a retry after a partially failed handback finds `A` tracked, refreshes it
if needed, and succeeds where today it would hit `git mv` on an already-moved file and abort. An
earlier draft split that idempotence into a separate State E keyed on the index while the other states
keyed on the base; with one index-keyed table the distinction has no behavioral content and only the
report line still cares who archived.

`mkdir -p` is an explicit ordered step, not a parenthetical: `git mv` into a missing directory fails
with `fatal: renaming … failed: No such file or directory` (verified).

### Main-checkout cleanup (restored from `0053:17`)

Applies to States A, C, and D. The archived-basis arm runs no cleanup. Cleanup is idempotent: on a
re-entered handback the copy is already gone, which precondition 2 reports as "nothing to clean up".

Preconditions, all required, in this order:

1. The take-over is staged in `EXECUTION_ROOT`, or — in State D — `A` is confirmed tracked.
2. The path resolves inside `RUNTIME_STATE_ROOT` as an absolute handle **and is untracked there**. A
   tracked path is never touched. On a checkout that has already pulled the base, `P` is tracked and
   no untracked copy exists — that is the ordinary, correct outcome and is reported as
   "nothing to clean up", never as a refusal.
3. The content comparison for this state passes:
   - **States A and C:** the main-checkout copy still hashes to the value captured when step 1 read
     it. A difference means someone edited the plan during the run.
   - **State D:** the main-checkout copy matches the already-archived file with the status marker
     normalized. A self-comparison would be meaningless when nothing was taken over during this run,
     and local unmerged edits would be deleted unseen.
4. The hash is re-verified immediately before removal, so a write between the comparison and the
   deletion cannot be lost silently.

On success the file is removed and the report names the path and the verified digest. On a failed
precondition the file is kept and the report names which one failed — distinctly from the
"nothing to clean up" outcome above.

### Execution roots

| Operation                                                                                      | Root                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ls-files` detection, `mkdir -p`, status-marker edit, `git mv`, direct write of `A`, `git add` | `EXECUTION_ROOT`, passed explicitly with `git -C` or as an absolute path                                                                                                           |
| Reading the plan's final content for the take-over                                             | `RUNTIME_STATE_ROOT` — a project-file read from the runtime root, permitted here because that is where the authoring run left the file, and named explicitly rather than inherited |
| Cleanup hash and cleanup removal                                                               | `RUNTIME_STATE_ROOT`, from the retained absolute handle                                                                                                                            |

No operation relies on an inherited working directory, per `src/shared/execution-location.md:93`.

### In-place execution contexts

`src/shared/worktree-integration.md` defines two in-place shapes, and the fragment models both:

- **In-place with delivery** (lines 117–120): a delivery branch in the main checkout. Both roots are
  the same path, the base is fetched as for any active delivery, and `:245` records a creation OID.
  The state model applies unchanged. In State C the cleanup **does** run, because the take-over target
  (`A`) and the main-checkout copy (`P`) are different paths.
- **In-place without delivery** (lines 121–124 and 370–373): no worktree, no branch, no completion
  action, and per `:165-167` no delivery artifact. Index-first detection needs none of that — this is
  the shape that most benefits from dropping the base dependency, because it is the one where
  delivery-receipt data will never exist and where no fetch runs. The same status switch and archive
  move happen in the working tree, and the later commit is the delivery event. Because lines 121–124
  state that this mode performs no further steps from the fragment, each tool's own `lazy-include`
  pointer names this mode explicitly among its triggers — a second reason the fence belongs in the
  tool sources rather than inside a fragment this mode never reaches. Lines 121–124 additionally gain
  a one-clause cross-reference, so a reader of the fragment alone does not conclude that this mode
  archives nothing.

### Report vocabulary

Exactly one archival line per run, in one of five shapes: archived a tracked plan (State A, archive
path); archived as a new file (State C, archive path); already archived (State D, with the optional
base refinement naming whether it was the base or this run's branch); the basis was itself an archived
plan (archived-basis arm); or stopped because the plan is tracked at both top level and in the archive
(collision, both paths). A second line reports the cleanup: the removed path with its digest,
"nothing to clean up", or the precondition that prevented removal.

### Edge cases

- **`archive/` does not exist.** `mkdir -p` in `EXECUTION_ROOT` precedes the move or the write.
- **The archive target already exists as an untracked file** while `A` is not tracked. Treated as the
  collision case: stop and report rather than overwrite. `git mv -f` would produce a
  modify-plus-delete and discard the destination silently (verified), which is why it is never used.
- **A detection command fails.** Blocks and is reported, per the interpretation rule above.
- **No base commit is available.** Not an error: the State D report line omits its optional
  refinement and the run proceeds. The base never decides an action, so it can never block one.
- **The workflow kept no plan file.** The fragment does not apply, as line 369 already states.
- **The run's basis is itself an archived plan.** `src/shared/plan-reference-routing.md:9,11` permits a
  reference to resolve under `<plan.dir>/archive/`, in which case `P` and `A` coincide. This is its own
  terminal arm and is checked **first**, before any predicate: report that the basis is already
  archived, change nothing, and run no cleanup.
- **The plan's language.** The implemented marker is written in the plan's own complete language, per
  `src/shared/plan-status.md:28`; the state model changes only when and where it is written.

## Acceptance criteria

The change is complete when every criterion below holds simultaneously. Every one is satisfiable by
this delivery alone.

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, in
      that order. This subsumes the include-resolution, lazy-include shipping, runtime-state-safety,
      and context-budget guards.
- [ ] `test/execution-location-contract.test.mjs:'delivery and apply-review paths include the canonical execution-location contract'`
      and `:'the execution-location contract survives every harness render unchanged'` still pass.
- [ ] `test/workflow-contracts.test.mjs:'every one of the three delivery call sites … load the pr-review-integration fragment exactly once'`
      still passes: `worktree-integration.md` lazy-includes `pr-review-integration` exactly once and
      never eagerly.
- [ ] `test/workflow-contracts.test.mjs:'every returning delegation announces the next-step suppression'`
      still passes with `{ file: 'src/shared/worktree-integration.md', delegates: ['pr'] }` unchanged.
- [ ] A test reads the live `src/shared/plan-archival.md`, parses its state table, and asserts it has
      exactly four rows: States `A`, `C`, `D`, and the archived-basis arm, each with its
      distinguishing condition and its own action.
- [ ] A test asserts the detection is index-first: the fragment's predicate table is ordered
      archived-basis, collision, `A` tracked, `P` tracked, neither; it contains the literal `ls-files`
      and neither `ls-tree` nor `merge-base`; and `git mv -f` appears nowhere in it.
- [ ] A test asserts the fragment states both defects that index-first removes — a re-entered State A
      running `git mv` on an already-moved source, and a stale base leaving two copies — so the
      rationale cannot be dropped by a later edit that "simplifies" the table back.
- [ ] A test asserts the fragment does **not** name `iterate` or `maintain` as flows that archive —
      neither carries a plan file, so naming them would ship a false statement.
- [ ] A test asserts the result-interpretation rule by literal: nonempty output means present, empty
      output means absent, and a nonzero exit blocks and is not read as absent.
- [ ] A test asserts the emptiness-not-equality rule and its C-quoting rationale are stated.
- [ ] A test asserts the base commit is optional and report-only: the fragment states that it refines
      State D's report line, that an absent base commit is not an error, and that the base never
      decides an action.
- [ ] A test asserts `mkdir -p` appears as an ordered step before both the `git mv` in State A and the
      direct write in State C.
- [ ] A test asserts State C uses a direct write plus `git add` and explicitly not `git mv`, and
      states why.
- [ ] A test asserts State D never re-adds at top level and refreshes `A`'s content when it differs
      from the final state.
- [ ] A test asserts the archived-basis arm is checked first, before any predicate, and has its own
      terminal action rather than delegating to a state.
- [ ] A test asserts the collision stop names both paths, and that an untracked archive target is
      treated as the collision case.
- [ ] A test asserts the fragment writes no runtime state: it contains no ` ```include ` fence for
      `runtime-state-safety`, and no sentence of it pairs a `.effective-flow/` path with a mutation
      verb — the condition `findRuntimeStateSafetyViolations` checks, verified again by the build. The
      criterion holds only while the fragment stays reachable through an include chain, because
      `walkRuntimeStateMutations` roots at non-`shared/` contexts — the test asserts that reachability
      too, so nobody can make the fragment unreachable and call the guard green.
- [ ] A test asserts the execution-root table: `EXECUTION_ROOT` for detection, `mkdir`, mark, move,
      write, and staging; `RUNTIME_STATE_ROOT` for the take-over read and the cleanup; and a sentence
      that no operation relies on an inherited working directory.
- [ ] A test asserts the cleanup's four preconditions appear in order, that States A, C, and D run it
      and the archived-basis arm does not, that State D's comparison basis is the archived file
      rather than a self-hash, that cleanup is idempotent on a re-entered handback, and that
      "nothing to clean up" is distinguished from a refusal.
- [ ] A test asserts the fragment declares that the mark happens after the take-over and supersedes
      `0053:16` for that point.
- [ ] A test asserts both in-place shapes are modeled, that State C in-place runs the cleanup, and
      that each of the four `lazy-include` pointers names in-place execution among its triggers.
- [ ] A test asserts the report vocabulary contains all five archival shapes — State A, State C,
      State D with its optional refinement, the archived-basis arm, and the collision stop — plus all
      three cleanup shapes.
- [ ] A test asserts the fragment's declared-inputs list names both roots, `plan.dir`, the plan path,
      the plan language, the delivery shape, and the base commit as optional.
- [ ] A test asserts `src/shared/worktree-integration.md` step 1 names `plan-archival` as the contract
      owner, contains **no** `lazy-include` fence for it, no longer contains the literal `git mv`, and
      passes both roots and the optional base commit to the fragment, and carries the cross-reference
      at lines 121–124.
- [ ] A test **derives** the fence-consumer set from the include closure over `worktree-integration`
      rather than hard-coding it — the pattern `test/workflow-contracts.test.mjs:1424-1510` already
      uses for `tracker-target` — asserts that each derived consumer either carries exactly one
      top-level `lazy-include` fence for `plan-archival` with a non-empty `when:` line or is a named
      exemption, and that each exemption's own source states why — the pattern the `issue-tracker`
      consumer test uses, referenced by test name rather than by line, since
      `test/workflow-contracts.test.mjs` moved substantially in `830e07a`. Today that resolves to `build`,
      `fix`, `docs`, `refactor` carrying fences and `iterate`, `maintain`, `merge-gate` exempt; an
      eighth tool that later embeds `worktree-integration` fails the test instead of shipping an
      unloadable contract.
- [ ] A test asserts each of `src/tools/build.md:391`, `fix.md:244`, `docs.md:293`, and
      `refactor.md:293` still carries its in-place-without-delivery sentence, which after this change
      is the only executing instruction for archival in that mode.
- [ ] A test asserts `src/shared/plan-archival.md` itself contains no ` ```lazy-include ` fence, in
      the same form as the surviving obligation assertion on `issue-tracker.md`, and that it states
      the obligation that every embedding source carries its own pointer. The assertion is a **design**
      invariant of the per-tool decision, not a build safeguard: `cbcea61` retired the three
      `doesNotMatch(/```lazy-include/)` assertions that once guarded shared sources, so the old
      rationale must not be cited. `pnpm test` runs before `node build.mjs` and a clean checkout has
      no `dist/` to read, so no test asserts against the built output.
- [ ] `node build.mjs` ships `dist/*/effective-flow/shared/plan-archival.md` for all three targets.
      Since `cbcea61` this is guarded rather than inspected: `#99` walks the transitive fragment
      closure and `assertNoUnresolvedLazyIncludes` aborts on any surviving raw fence.
- [ ] A test asserts `docs/developer-guide/plan-conventions.md` no longer contains the literal
      `git mv` in its archive section and references `plan-archival`, and that
      `src/shared/plan-numbering.md` **keeps** its `git mv` literal — `830e07a` added
      `test/workflow-contracts.test.mjs:'the revision-mode move back from the archive never touches the Git index'`,
      whose `ordered()` block pins that section on five literals including it — while gaining a
      pointer naming `plan-archival` as the owner of the state model.
- [ ] A test asserts `docs/developer-guide/build-system.md` lists `plan-archival` among the mode-gated
      lazy fragments.
- [ ] Each of `docs/user-guide/worktree-and-delivery.md`, `docs/user-guide/glossary.md`, and
      `docs/user-guide/tools-implement.md` contains a required phrase stating that archival depends on
      whether the plan is already tracked or already archived; a test asserts that phrase per file.
- [ ] The two unrelated untracked plan files listed under "Working state" are unmodified.

## Validation plan

- `pnpm agent:check` → `pnpm test` → `node build.mjs` → `pnpm test:distribution`, in that order, as
  `AGENTS.md` prescribes after editing distribution sources. Confirm no `BUDGET_TOOLS` line regressed
  and inspect the rendered size of the four eager consumers (`refactor`, `iterate`, `maintain`,
  `merge-gate`), which are the files the extraction is meant to protect.
- The new contract assertions listed above, each reading the live source rather than restating it.
- Manual State C run: implement a plan from an untracked plan file through `effective-flow fix` with a
  worktree delivery; expect the plan archived in the PR, no `git mv` failure, and the main-checkout
  copy removed with its digest reported.
- Manual State A run: commit a plan file to the base by hand, then deliver an implementation; expect a
  rename in the PR diff rather than an add plus delete.
- Manual State D run: deliver against a base that already carries the archived plan; expect
  "already archived", no second top-level copy, and the cleanup comparing against the archived file.
- Manual re-entry run: interrupt a handback after the archive is staged and re-enter it; expect
  State D with a content refresh rather than a `git mv` failure, and an idempotent cleanup.
- Manual stale-base run: point `delivery.baseBranch` at a branch that predates the plan file and
  deliver; expect State A from the index rather than State C, and a single copy on the branch.
- Manual collision run: construct a base carrying the plan at both top level and in `archive/`; expect
  the run to stop and report both paths.
- Manual divergence run: edit the plan file in the main checkout while the delivery is in flight;
  expect the copy retained and the failed precondition named.
- Manual in-place-without-delivery run (`worktree.enabled: false`): expect correct state selection
  with no base commit available and no block.
- Manual "nothing to clean up" run: deliver from a checkout that has already pulled the base; expect
  that outcome reported as normal rather than as a refusal.
- Confirm by inspection after each manual run that `git status` in the main checkout shows no staged
  rename.

## Assumptions

- **Assumption:** the plan file's final content is readable from `RUNTIME_STATE_ROOT` at step 1 — that
  is where the authoring run left it, per `0053:16`. Purely uncritical: if it were not readable, no
  archival path of any kind would work today either.

Two earlier entries were assumptions only because they deferred a decision. Both are now decided and
live in the plan body instead:

- The nested-fence question was settled by inspecting the built output and the build source. The fence
  does ship raw and is not actionable, so the design changed: no nested fence, a top-level fence in
  each of the four consuming tool sources. See the architecture decision.
- The `merge-base` computability question dissolved rather than being answered: index-first detection
  needs no base commit, so there is nothing left to assume. The base is optional and report-only.

## Follow-up work

None of the items below is a decision this plan still needs — delivery (a) is fully specified without
them. They are recorded here so the trail is not lost, deliberately outside `## Open points`, which is
reserved for points that must be decided before implementation.

- **The publication plan needs three corrections before its own delivery:** drop the `merge-gate`
  archival, add the receipt `state` field, and update its "four-state" wording at `:51` and `:162` to
  name this split. Delivery (a) introduces no receipt and no State B and therefore cannot conflict
  with it; this is the entry gate for delivery (c). Run
  `effective-flow plan docs/plan/2026-08-20-plan-publication-before-implementation.md` when (c) is due.
- **Deliveries (b) and (c)** are described in "Delivery split" and are planned after (a) ships. (b)
  waits until the fallback's reporting shows how often it fires; (c) waits for the corrected
  publication plan.
- **Done — `src/tools/plan.md`'s revision-mode `git mv`** is fixed and merged as `830e07a`; its
  hardened tracking probe is now the contract this plan's detection inherits.
- **Done — nested lazy fences shipping raw** is fixed and merged as `cbcea61`, which also added
  `assertNoUnresolvedLazyIncludes` and closed the `#99` closure hole. It repaired the
  `pr-review-integration` degradation for `build`, `fix`, and `docs` along the way.

## Open points

- No open points.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        5 |         2 |    2 |
| Security        |        0 |         1 |    2 |
| Data protection |        0 |         4 |    2 |
| Error cases     |        0 |         6 |    4 |
| Testability     |        0 |         4 |    4 |
| Scope           |        0 |         2 |    4 |
| Maintainability |        0 |         2 |    5 |

The table is an approximate by-area tally of the **first two** review passes on 2026-08-20, before any
revision; its note column does not reconcile exactly with the per-pass headlines below, and it is kept
for orientation rather than as an audit. All five critical and all twenty-one important findings of
those passes were incorporated or answered by a decision. Three further passes are recorded as their
own dated subsections: the clarification-gate revision (one critical, two important, two notes), the
revision review (two critical, four important, seven notes), and the post-merge review (three
decision-requiring, two important, five notes). Every finding of all five passes is resolved. No
finding is outstanding, the `## Open points` section carries the empty state, and no
implementation-relevant assumption remains, so the result is `Approved`.

### Findings

Judgment was provided by the `effective-delivery` skill. The declared owner in
`docs/developer-guide/skill-ownership.json` is `codebase-improvement`, which is not installed in this
environment, so its available equivalent was applied; the substitution is recorded here. The second
pass verified its Git claims empirically in a throwaway repository.

#### First pass — 2 Critical, 9 Important, 11 Note

- **[Architecture] Critical:** detection used `git ls-files` on the delivery branch, which by step 1
  carries the run's own commits, so a re-entered handback would classify its own archive commit as
  "already archived" and drop the plan's updated content. _Incorporated:_ base-pinned `ls-tree`
  predicates plus a separate index arm.
- **[Architecture] Critical:** the two plans disagreed on who archives; the publication plan would
  mark a plan `Implemented` before any implementation exists. _Incorporated:_ "Ownership of archival".
- **[Architecture] Important:** State A declared "no separate copy", but the publication plan leaves an
  untracked twin. _Incorporated:_ cleanup applies to States A, C, and D.
- **[Architecture] Note:** the extraction was justified by context budget, which it does not improve.
  _Incorporated:_ duplication and eager-consumer weight instead.
- **[Security] Note:** the receipt was untrusted input flowed unchecked into path resolution.
  _Deferred with the receipt to delivery (c)._
- **[Data protection] Important:** State D's cleanup compared the file only against itself, so local
  unmerged edits would be lost. _Incorporated:_ comparison against the archived content.
- **[Data protection] Important:** "never mutates the main repository" contradicted the deletion.
  _Incorporated:_ restated, line-411 scope disambiguated, preconditions ordered.
- **[Data protection] Note:** the hash window closed before removal. _Incorporated._
- **[Error cases] Important:** "a receipt whose pull request is not open" was undecidable offline.
  _Deferred with the receipt to delivery (c), where the `state` field resolves it._
- **[Error cases] Important:** the in-place cleanup claim was false for State C and the two in-place
  shapes were collapsed. _Incorporated._
- **[Error cases] Important:** a basis that is itself archived makes `P` and `A` coincide.
  _Incorporated._
- **[Error cases] Note:** the in-place rule would become unreachable behind a skipped step.
  _Incorporated:_ the pointer names the mode.
- **[Testability] Important:** four criteria were not mechanically expressible; States B and D and
  several rules had no criteria. _Incorporated._
- **[Scope] Important:** two developer-guide files carry further copies of the mechanism.
  _Incorporated._
- **[Maintainability] Important:** moving the mark reverses `0053:16`. _Incorporated as a declared
  supersession._
- Remaining notes — merge-gate opt-out naming, runtime-guard reachability, the `review` budget line,
  the execution-root table's missing read, `:367-368` → `:364-366`, "first and only commit", the
  working-state count — all incorporated.

#### Deep pass — 3 Critical, 12 Important, 9 Note

- **[Architecture] Critical:** the base commit does not exist in three of five shapes —
  `:165-167` records it only when this run created the branch, and `merge-gate.md:138-140` forbids
  `-b` for the `iterate` style. _Decision:_ a reported `merge-base` fallback, with its
  misclassification limit as an explicit edge case; delivery (b) removes it.
- **[Architecture] Critical:** State E's named producers hold no plan file at all, and an acceptance
  criterion would have pinned that falsehood into a shipped fragment. _Decision:_ State E is
  re-derived as retry idempotence, and a criterion now asserts that `iterate` and `maintain` are
  **not** named.
- **[Architecture] Critical:** removing `merge-gate` archival left State B with no archiver, making a
  permanently open plan the resolution to a review finding. _Decision:_ a mandatory re-entry
  instruction plus a named residual — and State B moves to delivery (c), so (a) does not ship the gap.
- **[Architecture] Important:** the nested-fence rendering inversion gives the raw form to `build`,
  `fix`, and `docs`, the flows that actually archive. _Decision:_ keep the extraction and verify the
  rendering first, as acceptance criterion 1.
- **[Architecture] Important:** the fragment ships to seven consumers including three that never
  archive. _Incorporated:_ stated rather than implied away.
- **[Error cases] Important:** `ls-tree` and `ls-files` exit `0` for both present and absent; only
  output decides. _Incorporated:_ an explicit interpretation rule with its own criterion.
- **[Error cases] Important:** the archived-basis edge case borrowed State E's action, whose cleanup
  clause presupposes an earlier pass. _Incorporated:_ its own terminal arm.
- **[Error cases] Note:** `git mv` fails when the destination directory is missing. _Incorporated:_
  `mkdir -p` as an ordered step.
- **[Error cases] Note:** `--name-only` C-quotes non-ASCII paths. _Incorporated:_ emptiness, never
  equality.
- **[Data protection] Important:** State A cleanup declines correctly on a checkout that has pulled the
  base, but the report would call that a refusal. _Incorporated:_ "nothing to clean up" is a distinct
  outcome.
- **[Data protection] Important:** State A's self-hash proves only that nobody edited during the run,
  not that the copy matches the base. _Accepted and narrowed:_ the copy is never used to overwrite the
  base file in State A — the take-over reads it, and the divergence case is the `plan.md:169` open
  point.
- **[Security] Important:** a receipt key that fails containment had no defined behavior. _Deferred
  with the receipt to delivery (c)._
- **[Testability] Important:** the base-commit source edit had no criterion; several criteria
  duplicated one another. _Incorporated:_ a criterion for the pass-through, duplicates folded.
- **[Testability] Note:** the working-state criterion said four unrelated files; there are three.
  _Incorporated._
- **[Scope] Important:** the change was at least three deliveries and its largest part had no producer.
  _Decision:_ split into (a), (b), and (c); this plan is (a) and carries no blocking open point.
- **[Scope] Note:** the sibling correction is three items, not two. _Incorporated._
- **[Maintainability] Important:** the `iterate`/`maintain` justification for base-pinning is false —
  neither source mentions a plan file. _Incorporated:_ re-derived from the shapes that carry plans.
- **[Maintainability] Note:** the base-commit assumption cited `:188-195`/`:207-211`; the carrier is
  `:145-167`. _Incorporated._
- **[Maintainability] Note:** `:122-125` is off by one; `plan-conventions.md` is 84–92;
  `context-budget-headroom.md` criterion is 49–55. _All incorporated._

#### Revision pass, 2026-08-20 — clarification gate

`effective-flow apply` refused this plan at the clarification gate. Two abort criteria applied: the
`## Open points` section carried four entries, which the gate treats as blocking regardless of how the
plan itself labels them, and two assumptions were implementation-relevant. Both are resolved without
weakening the plan.

- **[Architecture] Critical:** acceptance criterion 1 was not a criterion but a deferred
  investigation with two outcomes, one of which pulls `build.mjs` into scope — a materially different
  change decided during implementation rather than before it. _Resolved by investigating it now._ The
  answer changed the design: a nested fence ships raw into `dist/*/shared/worktree-integration.md`
  (verified at 829–832 / 823–826), nothing in the shipped skill explains what a `lazy-include` fence
  is, and `docs/plan/archive/2026-07-27-external-tracker-target.md:338-353` records this exact shape
  shipping once as "a defective artifact". The fence therefore moves out of the fragment and into the
  four consuming tool sources, following that change's own precedent. Criterion 1 is deleted and
  replaced by four concrete placement criteria.
- **[Error cases] Important:** the `merge-base` assumption deferred a behavioral question to
  implementation ("implementation should surface it"). _Resolved:_ `worktree-integration.md:132-134`
  already makes a resolvable base branch a shared precondition of every active delivery, so the
  fragment states a fail-closed rule instead — an unresolvable base or an empty `merge-base` blocks
  and archives nothing — with its own edge case and acceptance criterion.
- **[Scope] Important:** three of the four open points were cross-plan or follow-up notes, and the
  fourth was an unrelated defect found in passing. None required a decision for delivery (a).
  _Resolved:_ they move to a new `## Follow-up work` section, which is where a trail belongs;
  `## Open points` carries the empty state. The two that are actual work — the `plan.md:169` rename
  and the `build.mjs` nested-lazy rendering — are filed as their own tasks rather than left as prose.
- **[Maintainability] Note:** the merge-gate edit leaves this change's scope. With per-tool fences,
  `merge-gate` simply carries none, so its opt-out becomes structural instead of a prose caveat that
  can drift. _Incorporated:_ the affected-files row and its criterion are replaced.
- **[Maintainability] Note:** the extraction decision's closing sentence claimed the fragment ships
  into all seven consumers' `shared/` directories. With per-tool fences that is no longer the shape
  being argued. _Incorporated:_ the sentence is gone.

Net effect on the gate: no open points, no implementation-relevant assumptions, one fewer affected
file, and one fewer decision left to the implementer.

#### Revision review, 2026-08-20 — the index-first detection

A third review pass checked the material the clarification-gate revision produced. It confirmed the
per-tool fence design in every particular — no guard objects (`assertNoEagerLazyOverlap` compares
names within one raw body and does not recurse into inlined fragments, so `refactor` may eagerly
include `worktree-integration` and lazily include `plan-archival`), `#99` and
`test/workflow-contracts.test.mjs:598` both cover it, the budget holds with room, all four tools carry
plan files and execute their own in-place branch, and the cited precedent is real
(`src/shared/issue-tracker.md:82` plus six consuming tools with their own fences). It then found two
critical defects in the **detection table**, which no earlier pass had examined.

- **[Error cases] Critical:** State E was unreachable from State A. The table keyed on the base and
  consulted the index only in the neither-in-base row, so after a State A run committed its
  `git mv P A`, a re-entry still saw `A` absent from the base and `P` present, re-selected State A,
  and ran `git mv` on a source that no longer existed — verbatim the failure State E was introduced to
  prevent. _Resolved by the index-first redesign:_ a tracked `A` selects State D from the first
  predicate, and State E disappears as a separate state because "already archived" is the same action
  regardless of who archived it.
- **[Architecture] Critical:** with no index predicate on `P`, a base behind the commit that added
  `P` — routine for the `merge-base` fallback, whose `delivery.baseBranch` default `origin/main` is
  not this repository's `develop` — selected State C, wrote `A`, and left the tracked `P` in place.
  Two copies of one plan on the base branch: the invariant this change exists to enforce.
  _Resolved by the same redesign:_ a tracked `P` selects State A from the index, whatever the base
  says.
- **[Error cases] Important:** the fail-closed unresolvable-base rule had a hole in the one shape that
  most needed it — `worktree-integration.md:132-134` is scoped by line 128 to "when delivery or
  worktree is active", which excludes in-place-without-delivery, so the rule would have turned today's
  unconditional in-place archive into a blocked one. _Resolved:_ the base is no longer an input, so
  the rule is gone along with the `merge-base` fallback and delivery (b), which had nothing left to
  supply.
- **[Testability] Important:** a criterion asserted against `dist/`, which `pnpm test` cannot read —
  it runs before `node build.mjs` and a clean checkout has no `dist/`
  (`test/workflow-contracts.test.mjs:589-597`). _Resolved:_ the source-side assertion carries the
  contract and the built output is confirmed by inspection instead.
- **[Maintainability] Important:** the fence-placement criterion hard-coded both the required and the
  exempt tool sets — the anti-pattern the cited precedent deliberately avoided, where a later eighth
  consumer ships an unloadable contract with every test green. _Resolved:_ the consumer set is derived
  from the include closure, exemptions are named, and each exempt source must state its reason —
  which puts `iterate.md` and `maintain.md` into the affected files.
- **[Error cases] Important:** the report vocabulary enumerated five shapes while the archived-basis
  arm was a sixth with no entry, so the criterion pinning "all five" and the arm contradicted each
  other. _Resolved:_ the arm is a state-table row and the vocabulary lists it.
- **Notes, all incorporated:** a cross-reference at `worktree-integration.md:121-124` so the fragment
  alone does not read as "in-place archives nothing"; the shipping hazard restated as latent rather
  than active, with the WP1 citation dropped; the archived-basis arm's evaluation order stated as
  first; the Summary table relabelled as an approximate first-two-passes tally; three criteria
  restated as literal or count assertions and the pointer criterion pluralised; a new criterion
  pinning the four tool bodies' in-place sentences, which are now the only executing instruction for
  that mode; the "Delivery split" row rewritten; and the budget sentence corrected — per-tool pointers
  cost about three lines each rather than gaining anything.

Net effect: three states plus one terminal arm instead of five, one predicate family instead of two,
one fewer delivery, and no base-commit dependency anywhere in the contract.

#### Post-merge review, 2026-08-20 — rebased onto `830e07a`

Both defects this plan had filed as follow-up tasks were implemented and merged while the plan sat
open: `cbcea61` (#361) renders nested lazy-include fences in shipped shared fragments, and `830e07a`
(#362) removes the staged rename from `plan.md`'s revision-mode archive move. `origin/develop` moved
four commits ahead of the `9efe8c5` the plan was written against, and **three of its ten affected
files changed on that line**. This pass rebased the plan and reconciled it.

The state model, detection ordering, cleanup, execution roots and criteria structure survived both
commits intact. What did not:

- **[Architecture] Decision-requiring:** the per-tool-fence rationale became roughly 70 %
  counterfactual. `cbcea61` renders nested fences correctly, closes the `#99` closure hole with a
  worklist, adds `assertNoUnresolvedLazyIncludes`, and **retires the three
  `doesNotMatch(/```lazy-include/)` assertions the plan cited as precedent**, replacing them with a
  comment stating that placement is "purely an authoring choice". _Decision:_ keep the four per-tool
  fences and rewrite the rationale onto its surviving merit — reachability. A fence at step 1 sits
  inside the region `worktree-integration.md:121-124` tells in-place-without-delivery to skip, and
  that mode is the one that archives unconditionally today. The repaired defect is recorded in the
  decision so a later reader does not re-derive the dead argument, find its citations broken, and
  collapse the fences back into the fragment.
- **[Error cases] Decision-requiring:** `830e07a` established a hardened tracking probe for the
  **reverse** archive move — `ls-files -z -- ':(literal)…'` — with the explicit rule that `--` does
  not disable pathspec globbing. This plan's detection used neither, so a `plan.dir` containing `*`,
  `?`, or `[` would read a tracked `P` as untracked, select State C, and produce two copies: the
  invariant the plan exists to enforce, failing in the one direction that must not fail. _Decision:_
  adopt the merged invocation verbatim, in one call, and cite it as the shared contract. One probe
  rule now covers both directions of the move.
- **[Maintainability] Decision-requiring:** the plan's `plan-numbering.md` edit would have broken a
  merged test. `830e07a` added an `ordered()` assertion pinning that file's archive section on five
  literals including "moves the file via `git mv`", and made the forward mechanism one half of a
  deliberate forward/reverse contrast. The plan wanted to delete exactly that literal, and its
  acceptance criterion asserted the negation of the merged one. _Decision:_ keep the literal, add only
  an ownership pointer naming `plan-archival` as the owner of the state model, and scope the
  removal criterion to `plan-conventions.md`, which neither commit touched.
- **[Testability] Important:** the no-fence criterion on `plan-archival.md` cited two assertions that
  no longer exist and instructed the implementer to re-add a guard the repository had just deleted.
  _Incorporated:_ it is now a design invariant of the per-tool decision, referencing the surviving
  obligation assertion on `issue-tracker.md`, with the repudiated rationale removed.
- **[Scope] Important:** two of four "Follow-up work" entries were complete, and an architecture
  decision still filed `plan.md:169` as an open point. _Incorporated:_ both marked done with their
  commit references, and the stale open point removed.
- **Notes, all incorporated:** the `dist/` shipping criterion restated as guarded by the build's
  closure rather than confirmed by inspection; the derived-consumer criterion referenced by test name
  rather than by line, since `test/workflow-contracts.test.mjs` grew from 4864 to 5186 lines;
  `apply-plan.md:112` corrected to `:111`; `context-budget-headroom.md:49-55` corrected to `:52-54`;
  and the working state corrected, because `docs/plan/2026-08-19-delivery-push-retry.md` was
  implemented and archived by `de3ba34` and is now tracked under `docs/plan/archive/` with no
  top-level copy left behind — four untracked plan files remain, not five.

One asymmetry is worth carrying forward rather than hiding: `test/workflow-contracts.test.mjs`'s
lazy-fragment source check still collects names from `src/tools/*.md` only and does not walk nested
fences, so at `pnpm test` time only top-level fences are checked for a source. `node build.mjs` covers
the nested case through the worklist. Under the per-tool decision every `plan-archival` fence is
top-level, so both layers cover it either way.

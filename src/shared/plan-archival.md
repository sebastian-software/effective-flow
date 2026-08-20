## Plan archival at the delivery point

This shared building block owns the mark-and-archive contract for a plan file: which state the plan
is in, what that state's action is, where every operation runs, and what the run reports. It is
reached at the **delivery point** — immediately before a pull request is opened or the delivery
branch is merged — and, for in-place execution without delivery, immediately before the commit that
serves as that mode's delivery event.

**Every source that embeds this contract carries its own deferred pointer to it.** The pointer lives
in the tool source, not inside another fragment: `{{SKILL:build}}`, `{{SKILL:fix}}`, `{{SKILL:docs}}`
and `{{SKILL:refactor}}` are the workflows that keep a plan file, and each names this fragment in its
own deferred-include fence, with a load trigger covering both the handback delivery point and
in-place execution. `{{SKILL:iterate}}`, `{{SKILL:maintain}}` and `{{SKILL:merge-gate}}` keep no plan
file and carry no pointer. The reason is reachability, not rendering: a pointer placed inside
"Handback and completion action" would sit in the region that in-place execution without delivery is
told to skip, and that is the one mode which archives unconditionally today.

This fragment carries no runtime-state write guard, because it needs none: the private runtime
directory is outside its scope entirely — it neither reads from nor writes to it. Its one destructive
act is on a **project** file: the redundant untracked plan copy in the main checkout, whose
preconditions and whose relationship to the worktree-cleanup prohibition are stated under
"Main-checkout cleanup".

### Inputs

The calling workflow supplies, from its verified execution-location receipt and its resolved
configuration:

- `EXECUTION_ROOT` — the delivery checkout, as an absolute path.
- `RUNTIME_STATE_ROOT` — the main checkout, as an absolute path.
- `plan.dir` — the plan directory.
- the plan file's repository-relative path.
- the plan's complete language, for the status marker.
- the delivery shape: worktree, in-place with delivery, or in-place without delivery.
- optionally, the delivery branch's creation OID, when the run recorded one. It refines one report
  line and decides nothing. An absent creation OID is not an error and never blocks: three of the
  delivery shapes record none, and a cosmetic detail may not decide whether a plan is archived.

### Detection

Derive the two paths from the supplied basis, and check the basis first. If the basis already lies
under `<plan.dir>/archive/`, this run has nothing to archive — take the archived-basis arm below and
derive nothing. Otherwise `<file>.md` is the basis's file name, `P` is `<plan.dir>/<file>.md` and `A`
is `<plan.dir>/archive/<file>.md`, both repository-relative. Deriving `A` from an archived basis
would produce a nested `<plan.dir>/archive/archive/<file>.md`, which is why the basis check precedes
the derivation rather than sitting in the table as a comparison of two paths that can never be equal.

**The index of the delivery checkout decides the action.** `EXECUTION_ROOT` is the delivery
checkout's **repository root**; `ls-files` output is relative to the directory it runs in, so a probe
rooted anywhere below it matches nothing. Both paths are probed in one call:

```
git -C <EXECUTION_ROOT> ls-files -z -- ':(literal)<P>' ':(literal)<A>'
```

Each NUL-separated entry is matched against the path it belongs to; one side is never inferred from
the other. The invocation shape is the probe contract `{{SKILL:plan}}` already applies to the reverse
archive move, and each piece guards a different failure:

- `-z` is load-bearing rather than tidy. Without it Git C-quotes any path `core.quotePath` covers, so
  a plan named `2026-01-01-über plan.md` comes back as `"…\303\274ber plan.md"` and matches neither
  path literally — a tracked file read as untracked, which selects State C for a tracked `P`, writes
  `A`, leaves `P`, and puts two copies of one plan on the base branch.
- `:(literal)` makes the arguments paths rather than patterns: `--` only separates paths from
  revisions and does not disable pathspec globbing, so a `plan.dir` carrying `*`, `?`, or `[` matches
  siblings as a glob. Git compares an exact literal pathspec before it wildmatches, so this direction
  fails as a false **positive** — the listing carries foreign paths that no more belong to `P` or `A`
  than any other file. Matching each entry against the path it belongs to already rejects them;
  `:(literal)` keeps them out of the listing in the first place, so the two defences do not depend on
  each other.

**Interpretation, stated explicitly because the obvious reading is wrong:** `ls-files` exits `0`
whether a path is tracked or not. Only the output decides.

- The path appears among the entries → tracked.
- The path is absent from the entries → not tracked.
- Any nonzero exit, or a command-launch error, **blocks archival** and is reported. It is never read
  as "not tracked". This mirrors the explicit exit-code handling the runtime-state guard writes out
  for the same command family.

**What "blocks" and "stop" mean here:** archival does not happen and the run says so. They never
abort the handback. The delivery continues — the commit step commits the run's other deliverables and
the completion action proceeds — because the implementation is finished work and stranding it
uncommitted on a delivery branch is a worse outcome than a plan that stays unarchived. The report
names the condition so the plan can be archived deliberately afterwards.

Evaluate in this order; the first match wins:

| #   | Condition                                                                          | Result                                        |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | the basis lies under `<plan.dir>/archive/`, checked before `P` and `A` are derived | **Archived basis** — terminal; no probe runs. |
| 2   | `P` tracked **and** `A` tracked                                                    | **Collision** — stop and report both paths.   |
| 3   | `A` tracked, `P` not                                                               | **State D — already archived.**               |
| 4   | `P` tracked, `A` not                                                               | **State A — tracked.**                        |
| 5   | neither tracked                                                                    | **State C — untracked.**                      |

**Why the index and not a base tree.** An earlier design keyed this table on the commit the delivery
branch was created from. That produced two defects, and both are the reason the rule above must not
be "simplified" back:

- After a State A run performs its `git mv` and the commit lands, a re-entered handback still sees
  `A` absent from the base and `P` present in it, re-selects State A, and runs `git mv` on a source
  that no longer exists.
- If the resolved base is behind the commit that added `P` — routine whenever `delivery.baseBranch`
  is stale or defaulted — then neither path is in the base, the run selects State C, writes `A`, and
  leaves the tracked `P` in place: two copies of one plan on the base branch.

Keying on the index removes both and makes this step idempotent.

### States

| State                    | Meaning                                                          | Action                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — tracked          | `P` is a tracked file in the delivery checkout.                  | Take over the plan's final content, set the canonical status marker to the implemented value of the plan's own language, run `mkdir -p <plan.dir>/archive` in `EXECUTION_ROOT`, then `git -C <EXECUTION_ROOT> mv <P> <A>`. The commit step of the handback commits both. Then run the main-checkout cleanup.         |
| **C** — untracked        | Neither path is tracked.                                         | Run `mkdir -p <plan.dir>/archive` in `EXECUTION_ROOT`, write the final, implemented-marked content directly to `A` there, and `git -C <EXECUTION_ROOT> add -- ':(literal)<A>'`. No `git mv`: there is nothing tracked to move, and `git mv` on an untracked path exits non-zero. Then run the main-checkout cleanup. |
| **D** — already archived | `A` is tracked, by an earlier run or by this one.                | Never re-add at top level. Compare `A`'s content in `EXECUTION_ROOT` with the final, implemented-marked state and refresh it if it differs, so a re-entered handback carries the run's latest content. Never fail. Then run the main-checkout cleanup.                                                               |
| **Archived basis**       | The supplied basis is itself a file under `<plan.dir>/archive/`. | Terminal: report that the basis is already archived, derive no paths, run no probe, change nothing, run no cleanup.                                                                                                                                                                                                  |

**The mark is applied to the taken-over copy, in `EXECUTION_ROOT`, never to the original in the main
checkout.** The order is read → take over → mark. This supersedes the earlier
"Autorisierung im Haupt-Repo" arrangement, under which the status switch happened where the file was
authored: that would have the handback edit a file in the user's own checkout which it then never
commits — the same class of defect as an unrooted `git mv`. The cleanup's hash comparison depends on
this order and would never match under the old one.

State C is the ordinary case for a plan authored by `{{SKILL:plan}}`, which creates no commit and
therefore leaves its plan file untracked. State D is what makes this step idempotent: a retry after a
partially failed handback finds `A` tracked, refreshes it if needed, and succeeds.

`mkdir -p` is an ordered step, not a parenthetical: `git mv` and a direct write into a missing
directory both fail.

### Collision

If both `P` and `A` are tracked, the repository already carries two copies of one plan. Stop, report
both paths, and change nothing. Never resolve it by choosing one, and never use `git mv -f`: it
produces a modify-plus-delete rather than a rename and discards the destination's content silently.

An archive target that exists as an **untracked** file while `A` is not tracked is the same case:
stop and report rather than overwrite.

### Main-checkout cleanup

**This is not worktree cleanup.** The execution-location contract forbids removing, renaming or
otherwise altering `RUNTIME_STATE_ROOT`, or using the runtime root as a cleanup target; that rule
governs the withdrawal of an owned worktree and the root it must never point at. What follows removes
exactly one **untracked project file** inside that root, never the root, never a directory, and never
anything Git tracks. The two rules do not overlap.

Applies to States A, C, and D. The archived-basis arm runs none of it.

The plan file was authored in the main checkout and its copy stays there after the take-over. That
redundant copy is what makes a later `git merge` or checkout refuse over an untracked working-tree
file — Git refuses even when the content is byte-identical — and what leaves a phantom top-level plan
that `{{SKILL:open-plans}}` reports as open. Remove it, under all of these preconditions, in order:

1. The take-over is staged in `EXECUTION_ROOT`, or — in State D — `A` is confirmed tracked.
2. The path resolves inside `RUNTIME_STATE_ROOT` as an absolute handle **and is untracked there**,
   probed with the same `ls-files -z -- ':(literal)…'` shape. A tracked path is never touched. On a
   checkout that has already pulled the base, `P` is tracked and no untracked copy exists — that is
   the ordinary, correct outcome and is reported as "nothing to clean up", never as a refusal.
3. The content comparison for this state passes:
   - **States A and C:** the main-checkout copy still hashes to the value captured when this step
     read it. A difference means someone edited the plan while the run was in flight.
   - **State D:** the main-checkout copy matches the already-archived file with the status marker
     normalized. A self-comparison would be meaningless when nothing was taken over during this run,
     and local unmerged edits would be deleted unseen.
4. The hash is re-verified immediately before removal, so a write between the comparison and the
   deletion cannot be lost silently.

On success remove the file and report its path and the verified digest. On a failed precondition keep
the file and report which precondition failed — distinctly from the "nothing to clean up" outcome.
Removing an untracked file is not a Git operation and stages nothing, so this creates no uncommitted
change on the user's branch. The cleanup is idempotent: on a re-entered handback the copy is already
gone, which precondition 2 reports as "nothing to clean up". The archived-basis arm runs no cleanup.

### Execution roots

| Operation                                                                                      | Root                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ls-files` detection, `mkdir -p`, status-marker edit, `git mv`, direct write of `A`, `git add` | `EXECUTION_ROOT`, passed explicitly with `git -C` or as an absolute path                                                                                                           |
| Reading the plan's final content for the take-over                                             | `RUNTIME_STATE_ROOT` — a project-file read from the runtime root, permitted here because that is where the authoring run left the file, and named explicitly rather than inherited |
| Cleanup probe, cleanup hash, cleanup removal                                                   | `RUNTIME_STATE_ROOT`, from the retained absolute handle                                                                                                                            |

No operation relies on an inherited working directory. The status marker is written in the plan's own
complete language; this contract changes only when and where it is written, never which marker.

### In-place execution contexts

- **In-place with delivery:** a delivery branch in the main checkout. Both roots are the same path
  and the state model applies unchanged. In State C the cleanup still runs, because the take-over
  target (`A`) and the main-checkout copy (`P`) are different paths.
- **In-place without delivery:** no worktree, no branch, no completion action. The same detection and
  the same state action apply directly in the working tree, and the later commit is that mode's
  delivery event. This mode performs no other step of the handback, which is why each consuming tool
  source names it in its own pointer rather than relying on a reference from inside the handback. The
  cleanup runs here too: `P` and `A` are different paths in the same tree, so the redundant copy is
  present exactly as in every other shape.

### Report vocabulary

Exactly one archival line per run, in one of five shapes:

- archived a tracked plan (State A), with the archive path;
- archived as a new file (State C), with the archive path;
- already archived (State D), optionally naming whether the archive was already on the delivery
  branch's base or was made by this run, when a creation OID was supplied;
- the basis was itself an archived plan, so nothing changed;
- stopped because the plan is tracked at both top level and in the archive, with both paths.

A second line reports the cleanup: the removed path with its digest, "nothing to clean up", or the
precondition that prevented removal.

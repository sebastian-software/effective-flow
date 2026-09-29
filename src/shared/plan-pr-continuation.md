## Plan pull-request continuation

`{{SKILL:plan}}` can publish a finished plan as a **draft** pull request that carries only the plan.
This building block lets the implementing run find that pull request and continue on its branch, so
the plan, the implementation, and the archived plan end up in one branch and one pull request. It
owns discovery, verification, the execution location on the existing head branch, the
implementation-evidence check, and the finish request to `{{SKILL:pr}}`. It changes no mechanics of
`worktree-integration`, `plan-archival`, or `{{SKILL:pr}}`; it supplies inputs and supersedes the
named steps below.

```lazy-include
runtime-state-safety
when: a worktree creation, lifecycle-record read or write, or adoption transition below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: a worktree creation, lifecycle-record read or write, or adoption transition below `.effective-flow/` is imminent
```

Throughout, `P` is the plan's repository-relative path `<plan.dir>/<file>.md` and `A` is
`<plan.dir>/archive/<file>.md`. Every helper call carries the verified `RUNTIME_STATE_ROOT` as its
`cwd`, and every Git call names its root with `git -C`. Nothing here resets, rebases, amends,
squashes, or force-updates a ref, force-pushes, or bypasses hooks.

### Insertion point

The consuming tool loads this fragment when its source is a plan file and hidden mode is off, at
one of two points. In hidden mode, or when the basis lies under `<plan.dir>/archive/`, return at
once.

- **Delivery active:** once "Shared preconditions" step 2 of `worktree-integration` has resolved
  the base. It runs there, before step 3.
- **In-place without delivery:** once "Determine mode" selects that mode, before any archival. That
  mode resolves no base, so resolve `delivery.baseBranch` read-only under "Base-branch resolution"
  first; its fetch commits nothing, moves no local branch, and stages nothing. Then run discovery
  and verification only. With exactly one verified candidate, stop before `plan-archival` with the
  **no-delivery stop**: that run would archive the plan without finishing the pull request. With no
  candidate, return. Several or failing candidates stop as "Decision" says. Unavailable discovery
  is reported, and the run continues without delivery.

On exactly one verified candidate (see "Decision"), it **supersedes**:

- the worktree-or-in-place result of "Determine mode" and that section's completion record;
- step 4's branch naming: the delivery branch is the candidate's head branch, with no slug and no
  suffix;
- "Worktree execution" step 1's reuse of a harness-managed checkout, replaced by the sibling
  worktree under "Provisioning". The sibling carries its own `effective-flow-created` receipt, so
  its setup ownership follows that receipt and never the harness checkout's `externally managed`;
- "Worktree execution" step 2's `-b` creation, replaced by "Provisioning" below.

Every later `worktree-integration` step applies unchanged: run-owned delivery state, setup, the
lifecycle record, lifecycle outcome handling, the delivery point, and the handback. In the run-owned
state, the branch's creation OID is the fetched head OID, and "this run created the delivery branch"
is set by the local-branch-state rule. With no candidate, it returns before superseding anything.

### Discovery

Resolve the repository through the helper's `repository-resolve`. Probe once, then call `pr-list`
for open pull requests with `planPath` set to `P`. Those items omit `body`. Discovery uses only the
helper's normalized fields: number, URL, `state`, `head`, `base`, `sameRepository`, `draft`, and
`planPrMarker`; `headRepository` only names a dropped item in a report. It never runs `pr-read`
and never reads a pull-request body or comment, so no third-party text reaches the run through
discovery.

Discovery is **unavailable** on `CLI_MISSING`, `AUTH_FAILED`, `UNSUPPORTED_CAPABILITY` (including a
`pr-list` without `planPath` support), an unreachable forge, or a failed or unparseable read. An
`AMBIGUOUS_HOST` is first resolved as the helper contract prescribes.

### Verification

Before the three-way rule, drop every returned item whose `sameRepository` is not `true`: `false`,
and an absent field, which counts as foreign and is never hydrated, so discovery never runs
`pr-read` and never sees a body. Report each dropped item as an ignored foreign pull request with its
URL. Only a remaining candidate that fails check 1, 2, 4, or 5 blocks.

A remaining candidate counts only when all five checks hold:

1. its `planPrMarker` is present and equals `P`, and no `planPrMarkerError` is present;
2. its `state` is open;
3. its `sameRepository` is `true`, as the filter above already established;
4. its `base` equals the resolved local base branch;
5. its head changes against the merge base touch only `P`. Fetch its head branch into a named
   remote-tracking ref with
   `git -C <RUNTIME_STATE_ROOT> fetch origin refs/heads/<head-branch>:refs/remotes/origin/<head-branch>`,
   which commits nothing, moves no local branch, and stages nothing, and read the **fetched head
   OID** with
   `git -C <RUNTIME_STATE_ROOT> rev-parse --verify refs/remotes/origin/<head-branch>^{commit}`.
   Take `<merge-base>` from
   `git -C <RUNTIME_STATE_ROOT> merge-base <resolved base ref> <fetched head OID>`, then list
   `git -C <RUNTIME_STATE_ROOT> diff --name-status -z --no-renames <merge-base> <fetched head OID>`.
   Every entry must name `P`, or be the deletion (`D`) of `A`: that pair is the `A` → `P` rename a
   publication after a revision from the archive commits. A failed fetch is reported as "head could
   not be fetched" and a failed command by its name, each as its own reason, never as a path set that
   touches non-plan paths. The run never forces the fetch, so a force-updated remote head keeps
   failing it until the user runs a manual `git fetch`.

### Decision

- **Zero candidates:** return. The run continues exactly as it would without this fragment.
- **Exactly one verified candidate:** continue with "Completion action".
- **Several candidates, or one that fails verification:** stop, and report every candidate with its
  number, URL, and failed check. Never pick one. A check-5 failure whose path set touches non-plan
  paths also states that the head carries non-plan commits and that neither `{{SKILL:iterate}}` nor
  `{{SKILL:merge-gate}}` finishes a plan pull request, because neither archives the plan nor
  finalizes the draft.
- **Discovery unavailable:** the run cannot rule out a plan pull request. The effective completion
  is an explicit directive, else the configured row; a missing row is the default `merge`, as
  `config-migration` defines, and an invalid row counts as `null`, because the handback asks for it
  the same way. When that completion is `merge` or `branch`, return and report it. When it is `pr`
  or `null`, an interactive run asks once; a non-interactive run stops.

```ask
when: Plan pull-request discovery was unavailable and the effective completion is `pr` or `null`
header: Plan PR
question: Could not check for a published plan pull request (<reason>). Continue on a new branch without one, or stop?
options:
  - label: Continue
    description: Deliver on a new branch, exactly as if no plan pull request exists
  - label: Stop
    description: End the run before any branch, worktree, or commit is created
```

"Continue" returns before superseding anything. Every stop in this fragment before "Provisioning"
has created nothing, so it only reports.

### Completion action

A found plan pull request fixes the completion to `pr`. Decide on the **effective** completion, as
"Determine mode" does: an explicit directive in the current invocation first, else the configured
row, where a missing row is the default `merge`. An effective `merge` or `branch` stops the run with
a report naming the pull request and the mismatch: the run never merges locally around an open
draft. An explicit `pr` directive continues, and the handback reports it as an override of a
configured or missing `merge` or `branch` row. A `null` or invalid row is overridden. Whenever the
run continues, record `pr` as the run's explicit completion action, with the pull-request URL as its
evidence, in the slot "Determine mode" defines, so the handback never asks its `null` question and
reports both values as it does for any override.

### Local and published plan

Compare the local plan with the head's plan:
`git -C <RUNTIME_STATE_ROOT> hash-object -- <absolute plan path>`, where the absolute path is the
plan's source file in its source checkout, `plan-archival`'s `SOURCE_ROOT`, against
`git -C <RUNTIME_STATE_ROOT> rev-parse <fetched head OID>:<P>`. Any failure of either command stops
the run before provisioning. Equal hashes continue. On a difference, load `plan-publication` before
asking: its read-only resolution supplies the audience, and its content check supplies the findings
for the local version. Neither writes anything.

```lazy-include
plan-publication
when: the local plan differs from the plan on the verified plan pull request's head branch
```

```ask
when: The local plan file differs from the plan on the verified plan pull request's head branch
header: Plan differs
question: The local plan <absolute local path> differs from <head-branch>:<P> on <PR URL>, readable by <audience>. Content check: <findings, or none>. Republish the local version onto the plan branch as a new commit and continue, or stop?
options:
  - label: Republish
    description: Commit the local plan onto the plan branch as a new commit, push it, then continue
  - label: Stop
    description: End the run and leave both versions unchanged
```

That answer **is** the republication consent. On "Republish", run `plan-publication`'s
republication with the plan file's absolute and repository-relative paths, the run state
`interactive`, this workflow as the calling workflow, and `consent: given-by-caller`, which skips
its own ask. Require its publication line to be **updated**. Then fetch again, rerun all five
checks and the hash comparison, which must now be equal, and continue with the new fetched head OID.
Any other publication line or any failed check stops. A non-interactive run stops without asking.
Either stop reports both locations and overwrites neither copy.

### Provisioning

Read which checkout holds the head branch in `git -C <RUNTIME_STATE_ROOT> worktree list --porcelain`:

- **the invocation checkout, clean and at the fetched head OID:** work in place, with no worktree
  and no record; "In-place delivery without worktree" step 3 is skipped because the branch is
  already checked out;
- **another linked worktree:** take "Resumption by adoption";
- **any other holder or state:** stop and name it.

When no checkout holds it, apply the local-branch-state rule and always use a dedicated worktree.
Where `worktree.enabled: false` would have run in place, override it for this run and say so: the
in-place path would switch the user's checkout, and Git refuses that over the untracked plan copy
even when the content is identical.

**Local-branch-state rule.** Compare the local branch `<head-branch>` with the fetched head OID.
Every ancestry check is `git -C <RUNTIME_STATE_ROOT> merge-base --is-ancestor`; exit `0` passes,
exit `1` fails, and any other exit stops the run.

- **Absent:** create it as a tracking branch with
  `git -C <RUNTIME_STATE_ROOT> branch --track <head-branch> origin/<head-branch>`, require it to
  resolve to the fetched head OID, and record that this run created the branch.
- **Equal:** use it.
- **Ancestor of the fetched head OID:** fast-forward it with the guarded
  `git -C <RUNTIME_STATE_ROOT> update-ref refs/heads/<head-branch> <fetched head OID> <local OID>`.
- **Ahead** (the fetched head OID is its ancestor): stop, and name both OIDs.
- **Diverged:** stop, and name both OIDs.

Here "this run created the branch" sets "this run created the delivery branch". A local branch that
is ahead is resumed only through the worktree that holds its commits ("Resumption by adoption").

**Dedicated worktree.** Derive `WORKTREE_PATH` and guard every parent directory exactly as "Worktree
execution" step 2 prescribes, then run
`git -C <RUNTIME_STATE_ROOT> worktree add <WORKTREE_PATH> <head-branch>` without `-b`. Issue and
verify its `effective-flow-created` receipt with purpose `delivery`, record the worktree as created
by this run, and immediately write its lifecycle record as `active` with `creationOid` set to the
fetched head OID. Setup follows "Worktree execution" step 3.

**Under a harness-managed receipt** (a Claude Code or Codex worktree session), this is a stated
exception to "Determine mode": create the dedicated worktree as a **sibling** under the configured
base directory of the verified `RUNTIME_STATE_ROOT`, never nested in the harness worktree, which is
never switched. The sibling becomes `EXECUTION_ROOT`, and the report says the changes live there,
not in the harness session's tree.

### Resumption by adoption

A failed or stopped earlier run retains its worktree and branch with lifecycle status `aborted` or
`failed`, and its local branch is usually ahead of the untouched remote head. When another linked
worktree holds the head branch, read the lifecycle records of this repository, read-only. Exactly
one record naming that worktree's path may be adopted through the `aborted`/`failed` → `active`
transition of `worktree-lifecycle`; no record, several records, or any failed, unavailable, or
ambiguous proof below stops the run, retains the record unchanged, and names the retained worktree.
Acquire the record lock, then freshly prove:

1. the record is schema-valid, with ownership `effective-flow-created`, status `aborted` or
   `failed`, and purpose `delivery`, and no foreign lock or claim exists;
2. its repository identity and `RUNTIME_STATE_ROOT` match this run's verified receipt, and its
   branch and workflow equal this run's head branch and workflow;
3. exactly one matching linked-worktree record exists in `git worktree list --porcelain -z`; it is
   neither `locked` nor `prunable`, its `HEAD` is on the exact recorded branch, and a fresh
   execution-location receipt for it matches the immutable identity fields of the `receipt`
   snapshot;
4. `creationOid` equals the fetched head OID and is an ancestor of the local branch tip, checked
   exactly as condition 6 of `worktree-lifecycle`'s removal eligibility checks it; the commits after
   it are the retained run's own commits;
5. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none` is
   empty.

Then, still under the lock, atomically rewrite only `status` to `active`, `reason` to `null`,
`updatedAt`, and `sessionId` to this run's session, so its exit self-check covers the record.
`creationOid`, the branch, and the `receipt` snapshot never change. A `harness-managed`,
user-managed, or recordless worktree is never adopted.

After adoption the worktree keeps the `receipt` snapshot's `effective-flow-created` origin,
workflow, and purpose. It is Effective Flow-owned and created by this run for lifecycle outcome
handling and withdrawal, never an externally managed worktree: every abort path transitions its
record `active` → `aborted` exactly as for a worktree this run provisioned. "This run created the
delivery branch" stays false, the worktree's retained setup is not repeated, and its commits beyond
`creationOid` are this run's verified commits.

### Delivery

**Implementation evidence.** At the delivery point, before `plan-archival` runs, require that the
run's residual output plus its verified commits touch at least one path other than `P` and `A`:
`git -C <EXECUTION_ROOT> diff --name-only -z --no-renames <creation OID>`, against the run-owned
creation OID, plus the run's untracked residual output. Without evidence, end in a controlled stop:
transition an owned worktree's lifecycle record `active` → `aborted` with that reason, retain
worktree and branch, archive nothing, leave the local plan copy in place, push nothing, and leave
the draft untouched.

With evidence, `plan-archival` finds `P` tracked in the delivery checkout and selects State A with
unchanged mechanics. It takes the final content over from, and cleans the untracked copy in, the
checkout whose file the hash comparison read, which in a worktree session is not
`RUNTIME_STATE_ROOT`. The handback's `{{SKILL:pr}}` delegation keeps every line it already carries,
including `Next steps: suppressed`. It adds the line `Finalize plan draft: <PR number>` with the
verified number **only** when `plan-archival` reported "archived a tracked plan (State A)", or
"already archived (State D)" with `A` carrying the implemented-marked content on the delivery
branch. Any other archival outcome, such as a collision or a failed probe, omits that line, because
archival never aborts the handback: the pull request stays a draft, and the report names the
archival outcome. `{{SKILL:pr}}` then reuses that pull request and finishes it before the
handback's PR review publication. When the finish fails, the pull request stays a draft, and the
recovery is a direct `{{SKILL:pr}}` run on that branch.

### Report

Exactly one continuation line:

- continued on the plan pull request, with its URL and, where one applies, the sibling-worktree
  path, plus the archival outcome whenever it withheld the finish and left the draft open;
- resumed an interrupted run by adoption, with the worktree path;
- no plan pull request found;
- continued without discovery, by the user's choice or because the completion is `merge` or
  `branch`;
- stopped, with the named reason, including the no-delivery stop.

Each ignored foreign pull request is reported alongside that line.

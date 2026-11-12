## Committed-range handoff

This fragment carries `{{SKILL:deliver}}`'s route when the reconciled candidate is empty and the
source tree and index are clean, untracked paths included (`inventory` lists no path). Any dirt
keeps the tool's unchanged selection path, and a dirty selection is never read as a committed
range. The route runs after step 1.2 and replaces steps 1.3 through 7 of `deliver`, its report and
next-step block included, so no second next-step block follows `pr`'s. On it, `deliver` creates no
branch, worktree, commit, manifest, or ledger entry and pushes nothing. The only write is `pr`'s
`push -u`, which also sets the head branch's upstream configuration; that write belongs to
`{{SKILL:pr}}`.

### Session-known commits

A commit is session-known only when this session holds its full 40-character OID (64 in a SHA-256
repository), taken from a
`{{SKILL:commit}}` report, from `git rev-parse HEAD` run immediately after the session's own
`git commit`, or from the report of a worker this session delegated that names the full OID. An
abbreviated OID, a merge commit, a rebased or cherry-picked commit, and an OID lost to context
compaction never count. No author, message, time, or recency heuristic and no persisted receipt
stands in. Pass the session-known OIDs, lowercase, as `knownOids`; never pass an abbreviated one.

### Range base

Derive the range base exactly as `{{SKILL:pr}}` step 4 does: apply the base-branch rule to the
`delivery.baseBranch` value step 1.2 read, and read the arm off its two recorded results.

```lazy-include
base-branch-resolution
when: the committed-range route derives its range base
```

- **Remote configured** (the results differ): require the resolved base ref's remote to be
  `origin`. The rule's refreshed resolved base ref is the range base.
- **Remote not configured** (the results are equal): for the resolved local base branch, run
  `git -C <sourceRoot> for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads/<branch>`
  and use only the row whose refname equals it. No such row, or an empty upstream field, is **base
  branch has no upstream**; an upstream on a remote other than `origin` is **base branch tracked on
  a non-`origin` remote**; an upstream whose branch part differs from the resolved local base
  branch is **base branch tracked under a different name**. Otherwise put that upstream back
  through the rule once for its one refresh; its resolved base ref is the range base.

### Conditions

Evaluate the four conditions in order. A notice outcome ends the run at once; a question outcome
is noted and evaluation continues, so a later notice or pointer still wins.

1. **Fetch and upstream.** Step 1.1's fetch was not attempted, or reported `fetch.ok` true,
   `fetch.stale` false, and no `fetch.skipped`. Its `upstream-status` state, read after any
   fast-forward the user confirmed, is `ahead`, `no-upstream`, or `up-to-date`, or `behind` or
   `diverged` with an upstream equal to the range base (base drift). A present upstream is local
   (`branch.<name>.remote = .`), `origin/<head-branch>`, or the range base; any other upstream is
   a question outcome naming it.
2. **Range.** `committed-range` succeeds with a non-empty range and empty `foreignOids`, called
   with `root` the source root, `baseRef` the range base, `baseBranch` the resolved local base
   branch, and `knownOids`. Keep its `branch`, `headOid`, `commits`, and `paths`.
3. **No existing PR.** Run `repository-resolve`, the probe once, and `pr-list` with
   `{state: "all", head}`, each with the verified `RUNTIME_STATE_ROOT` as `cwd`. On GitHub, `head`
   is `<owner>:<head-branch>` with the `origin` owner `repository-resolve` reports; on Forgejo,
   `<head-branch>`. Hydrate every item lacking `head`, `base`, `state`, a URL, or `sameRepository`
   through `pr-read` under `pr` step 8's completeness rules; an item still incomplete is a lookup
   failure. Keep the items with `head === <head-branch>` and `sameRepository === true`, with no
   base or state filter. The condition holds when none is kept.
4. **No uncertain attempt.** The session knows of no earlier `pr` run on this head that ended
   uncertain (`mutationMayHaveSucceeded` or an unknown outcome).

```lazy-include
remote-helper-contract
when: condition 3 calls the remote helper
```

### Outcomes

- **Pointer, no question:** a kept open item carrying a `planPrMarker` points to a direct
  `{{SKILL:pr}}` call from this checkout (plan-draft recovery); any other kept open item, on any
  base, points to `{{SKILL:iterate}}`.
- **Focused question** (below), naming the failed condition: non-empty `foreignOids` (mixed state,
  a merge, a lost or abbreviated OID); only closed or merged kept items; a known uncertain earlier
  `pr` mutation; an upstream outside condition 1's set.
- **Provider question:** on `AMBIGUOUS_HOST`, ask for `github` or `forgejo` as `pr` step 5 does
  and repeat the lookup with that answer. It is the route's single question: any noted
  focused-question outcome, whether noted before or after it, then ends the run with one notice
  naming every failed condition, nothing pushed. An unanswered, skipped, or non-interactive
  provider question ends the run with one notice naming `AMBIGUOUS_HOST`, nothing pushed.
- **One notice line, no question,** naming its cause or code: the rule's `unresolvable`, the only
  notice that points to `{{SKILL:setup}}`; no remote-tracking diff base (naming the range-base
  abort); `CLI_MISSING` or `AUTH_FAILED` with the helper's remediation; `upstream-status`
  `ok: false`; a failed, stale, or skipped fetch; `upstream-gone` or `untracked-upstream`;
  `behind` or `diverged` against an upstream other than the range base; `DETACHED_HEAD`;
  `HEAD_IS_BASE`; an empty range (no uncommitted session changes and no commits ahead of the range
  base); and any other helper, lookup, or rule failure or state, such as `fetch-failed`,
  `fetch-denied`, `tracking-stale`, `UNSUPPORTED_CAPABILITY`, `INVALID_PAYLOAD`, or a missing
  `origin`.

### Handoff

Without a pointer or notice, print one route line (committed-range handoff to `pr`), the upstream
outcome, and a non-blocking list of each commit's OID and subject, marking every `foreignOids`
entry, plus the range's changed `paths`. Without a noted question outcome, ask nothing. With one,
and only when no provider question was asked, name every failed condition and ask:

```ask
when: the committed-range route noted a focused-question outcome and asked no provider question
header: Publish
question: Publish the commit range listed above through pr despite the condition named above?
options:
  - label: Publish via pr
    description: Hand this exact range to pr, which pushes the branch to origin and sets its upstream (push -u) before opening a pull request for it
  - label: Cancel
    description: End the run without pushing anything or creating a pull request
```

An unanswered or skipped question, or a non-interactive run, resolves to **Cancel**: nothing is
pushed, no pull request is created, and the report says so. A noted question outcome reaches the
call below only through the answer **Publish via pr**.

Before calling `pr`, re-check that the source `HEAD` equals `headOid` and that the tree and index
are still clean, untracked paths included; otherwise end with one notice. Then call
`{{SKILL:pr}}` as a plain direct invocation from the source checkout: no `Next steps: suppressed`
line and no committed-handoff receipt, with the explicit provider when the provider question was
answered. Print nothing afterwards: `pr` owns the final report and the next-step block, and its
hidden-mode rules apply unchanged.

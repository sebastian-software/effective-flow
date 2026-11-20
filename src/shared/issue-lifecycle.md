## Issue implementation lifecycle

This fragment is the provider-neutral contract for an issue that is the implementation basis of
`{{SKILL:apply-issues}}` or remote `{{SKILL:apply-review}}`; receipt-only producers load only
`issue-lifecycle-receipt`. It keeps three different facts separate:

- the tracker's native workflow state (unstarted, started, later active, or terminal);
- Effective Flow classifications such as `effective-flow-issue-done`, which means that delivery is
  secured in a pull request and does **not** mean that the tracker issue is closed; and
- the pull request's versioned lifecycle receipt, which is the durable handoff to
  `{{SKILL:merge-gate}}`.

### Started transition

After issue clarity and the workflow approval are established, but **immediately before the first
implementation delegation**, advance every implementable work item at least to started:

- on the forge, read the issue state fresh, ensure `effective-flow-issue-in-progress` exists through
  the helper's idempotent label creation, and add it idempotently;
- on an external target, use the freshly validated native state selected by
  `tracker.externalStartedState` under the loaded `tracker-target` contract.

Never move a terminal issue, reopen it, or move a later active state backwards. Already-started or
later-active issues are idempotent no-ops. Skipped, `wontfix`, terminal, container-only, and
failed-before-start items receive no transition. If the required state read or transition cannot be
proved, stop before delegation and before code changes.

An issue already marked in progress but lacking a retained PR-link comment or receipt is an
interrupted delivery, not permission to implement twice. Read its comments and search the current
forge exactly once by the exact issue reference. Exactly one candidate whose repository, issue
reference, and PR relationship all verify may have its PR-link comment and receipt restored through
the normal fresh-read and guarded-write paths. Zero or multiple candidates fail closed: preserve the
issue state, branches, and pull requests; list the candidates and the exact manual recovery needed;
never reset the issue to unstarted and never start a replacement implementation automatically.

```include
issue-lifecycle-receipt
```

### Receipt write paths

For a new PR, generate the validated receipt together with the PR body. For an existing PR, read its
body fresh, retain its body hash, merge the normalized items into the one valid receipt, and use only
the helper's hash-guarded `pr-update-body` path. `STALE_WRITE`, an invalid existing receipt, or a
concurrent edit aborts delivery bookkeeping without overwriting prose or silently dropping the
receipt.

PR creation may add the PR-link comment and `effective-flow-issue-done`, whose existing meaning is
"implementation secured in a PR". It must **not** complete a native sub-item or tick a container
checklist. The optional container and mechanism travel in the receipt for post-merge reconciliation.

## Merge-gate checkout boundary

This fragment carries the merge-gate-local half of the checkout provisioning boundary: which parts
of the delivery and worktree integration fragment stay off in this workflow, and how the one
checkout it does provision is closed again. It loads at the same moment as `worktree-integration`,
because both are meaningful only once Phase 2 step 1 has to provision a checkout. What decides that
moment stays in `{{SKILL:merge-gate}}`'s always-loaded core – the narrow use the fragment is loaded
for, the reason the verified execution location is not what the pointer brings, and the instruction
to provision the checkout the way `{{SKILL:iterate}}` does – so the trigger is decidable without
reading anything below. `{{SKILL:merge-gate}}` is this fragment's only consumer.

Everything else in that fragment stays off:

- no delivery branch and no branch-name construction – the head branch already exists;
- no plan-file status switch and no archiving, and no deferred pointer to `plan-archival` – this
  workflow holds no plan file;
- no completion action (`pr`, `merge`, `branch`) and no `{{SKILL:pr}}` call – the pull request
  already exists, and Phase 5 merges it on the forge instead;
- no "PR review publication" and no lazily loaded `pr-review-integration`. Its trigger condition –
  a workflow holding a pull request – matches this tool by accident. This workflow produces no
  findings of its own and never publishes under the outbound `<!-- effective-flow-pr-review -->`
  marker.

**The checkout's lifecycle is closed by this workflow.** Prefer the invocation checkout when it
already has the head branch checked out and clean: work in place, create no worktree, and create no
lifecycle record. Otherwise create one Effective Flow-owned worktree with the fragment's receipt and
its version 1 lifecycle record, and close that record in the same run: after the push of Phase 2
step 1 is confirmed, transition `active` to `cleanup-ready` and run the shared
claim/remove/reconcile sequence; on a controlled stop before the push – including a conflict this run
may not or cannot resolve – end the in-progress merge with `git merge --abort` so the checkout is
left clean, then transition it to `aborted`; on an error transition it to `failed`. `aborted` and `failed` retain the worktree and the branch for
inspection. Never end a run leaving an `active` record behind – `{{SKILL:cleanup}}` will correctly
refuse to remove it.

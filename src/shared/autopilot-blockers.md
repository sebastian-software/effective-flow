## Autopilot blockers

A blocker is anything no score resolved: the blocker rows and kinds of `scored-decisions` (a
`blocker` row's `site-blocker`, red validation after the workflow's own repair rounds, a floor or stop-option winner, a second
duplicate tie re-score, a scoring-leaf failure after its retry, an unknown question, a failed
clarity gate, the decision cap, a local-only security finding), a plan that did not end
`Approved` with zero open points (`plan-not-approved`), an appendix scan finding
(`appendix-scan`), a failure after branch creation (`post-branch-failure`) and a worktree path a
loaded instruction forbids (`worktree-location-conflict`, `worktree-conflict-stop`). Record each one
with `blocker-record` as `scored-decisions` "Records" defines, unless the helper already recorded
it.

```lazy-include
pr-automation-lines
when: autopilot is about to run the appendix-only update itself (an issue source's blocker or an unchanged plan-only draft on a rerun)
```

```lazy-include
worktree-integration
when: the plan-only draft path is about to provision its worktree; reading it is mandatory before any `git worktree add`
```

```lazy-include
worktree-conflict-stop
when: the plan-only draft path's `worktree path-resolve` returned a `source` other than `environment` and a `worktreePath` that a loaded system, `CLAUDE.md`, `AGENTS.md` or host instruction forbids, and its `worktree path-prepare` has not run
```

**Stop at once.** A blocker ends implementation where it occurs. Stop the downstream workflow
through its own controlled stop, so an owned worktree moves to `aborted` and is retained with its
branch; never stage, commit or push implementation work, and never retry the blocked step.
Uncommitted or unvalidated work stays in the retained worktree, which the report names. Then
choose exactly one ending below.

### Worktree location conflict

When the ledger holds a `worktree-location-conflict` blocker, whatever else stands and on every
repository, push nothing and open or update no pull request: not the implementation, not the
plan-only draft, not an appendix. `pr-appendix` returns `withheld` for this state and
`appendix-merge` refuses it. Report locally with the neutral message of `worktree-conflict-stop`;
the computed path and the forbidding instruction appear only there. Close with
`outcome: "no-pull-request"`, or, on an issue source with a plan pull request, with
`plan-pull-request-unchanged` and that pull request's number; `run-close` refuses any other
outcome.

### Security blocker on a public repository

When the ledger holds a `security` blocker and the repository is not `private` (`unknown`
counts as public), push nothing and open or update no pull request: not the implementation, not
the plan-only draft, not an appendix. `pr-appendix` returns `withheld` for exactly this state.
Report locally with the review-report path and finding ID only, then close with
`outcome: "no-pull-request"`, or, on an issue source with a plan pull request, with
`plan-pull-request-unchanged` and that pull request's number.

### Issue source: appendix-only update

Every other blocker on an issue source with a plan pull request updates that pull request's
description and nothing else; it stays a draft and receives no implementation commit. Make the
literal `autopilot.mjs pr-appendix` call with `{cwd, runId, planPullRequest}`. On `rendered`, run
the "Appendix-only update" of `pr-automation-lines` yourself against that pull request, with the
returned `sha256` as `appendixSha256`, instead of calling `{{SKILL:pr}}`, so retained
implementation work can never reach the forge. Close with `outcome: "appendix-update"` and the
plan pull request number. `blocked` or a failed update publishes nothing; close with
`plan-pull-request-unchanged` and the plan pull request number.

### Plan source: plan-only draft pull request

Every other blocker on a plan source, or on the plan-on-base path of an issue source, publishes the
reviewed plan with its blockers as a plan-only **draft** pull request. `plan-publication` is not
used and stays unchanged.

1. **Appendix first.** Make the literal `autopilot.mjs pr-appendix` call with `{cwd, runId}`.
   Only `rendered` continues; `blocked` and `withheld` publish nothing.
2. **Worktree.** Read the deferred `worktree-integration` now – a mandatory load before any
   `git worktree add`. Provision one Effective Flow-owned worktree under its "Worktree
   execution" step 2, with the branch `<branchPrefix>/plan/<plan-slug>` (`plan/<plan-slug>` for
   an empty prefix; `<plan-slug>` is the plan file name without its date prefix and `.md`) from the
   resolved base ref, its `effective-flow-created` receipt and its lifecycle record (purpose
   `delivery`, branch policy `retain`, workflow `autopilot`). It is always a separate worktree and
   never switches a checkout; under a harness-managed receipt it is a sibling at step 2's
   resolved path. Run no `worktree.setup`.
   **Existing branch** (a rerun on the same plan): when that branch exists locally or on the
   remote, make the literal `remote-tracker.mjs pr-list` call with
   `{cwd, state: "open", head: "<branch>"}`. Continue only on exactly one item that is
   `sameRepository: true`, `draft: true`, whose `base` is the resolved local base branch and whose
   valid `planPrMarker` names this plan. Fetch the branch; its changes against
   `git merge-base <resolved base ref> <remote>/<branch>` must touch only this plan file. Add the
   worktree at its remote tip instead, with the same receipt and record:
   `git worktree add <WORKTREE_PATH> <branch>` when the local branch already points there,
   `git worktree add <WORKTREE_PATH> -b <branch> <remote>/<branch>` when there is none. Only the
   worktree is run-owned: the branch-created flag stays false and no branch creation OID is
   claimed as this run's, even when `-b` creates the local branch; the record's `creationOid` is
   the branch tip at worktree creation, in the `-b` variant the fetched remote tip. Steps 3–6
   then refresh the blocker section in a new commit, and `{{SKILL:pr}}` pushes it, finds that pull
   request in its step 8 and runs the "Appendix-only update" of `pr-automation-lines`. When the
   refreshed plan equals the branch head's, skip steps 4–5, run that update yourself as on an
   issue source and withdraw per step 6. Any other result (no such pull request or several,
   another base, a change outside the plan file, a local branch at another commit, a failed read)
   is a publication failure: record a `post-branch-failure` blocker and publish nothing.
3. **Blockers in the plan.** Copy the reviewed plan to the same relative path in the worktree.
   Under its `## Assumptions and open points` (`## Annahmen und offene Punkte`) heading, write one
   `### Autopilot blockers` (`### Autopilot-Blocker`) subsection holding, between the lines
   `<!-- effective-flow-autopilot-blockers:begin v1 -->` and
   `<!-- effective-flow-autopilot-blockers:end -->`, exactly the blocker lines of the rendered
   appendix, already sanitized, scanned and neutral for a private security blocker; replace an
   existing pair instead of adding a second. The committed plan therefore always differs from its
   base version. Before any staging, scan the complete final plan file there, not only the
   appendix, with the literal `plan-publication.mjs scan` call: `cwd` the worktree, `runState`
   `unattended`, `planFile` the plan path. This covers the first publication, a changed-plan rerun
   and the issue plan-on-base fallback alike. Any `blocking` entry or a failed scan records an
   `appendix-scan` blocker whose summary says the plan file failed its content scan, publishes
   nothing and continues at step 6.
4. **Commit.** Stage exactly the plan path with
   `git -C <WORKTREE_PATH> add -- ':(literal)<plan path>'`, never `git add -A` or `git add .`. The
   staged set from `git diff --cached --name-status -z --no-renames` must be exactly one entry naming
   that path; anything else, or an empty index, stops without committing and records a
   `post-branch-failure` blocker. Record the pre-commit `HEAD` and the staged-tree OID from
   `git -C <WORKTREE_PATH> write-tree`, then delegate the commit to `{{SKILL:commit}}` with the
   worktree's full verified receipt, the expected branch, exactly that one path, the expected
   staged-tree OID, a `docs:` message in `language.git` that names the plan, and
   `Next steps: suppressed`.
5. **Pull request.** Delegate to `{{SKILL:pr}}` as a returning committed handoff from the worktree
   with the commit's head, base and OID, the chain lines and these inputs:

   ```text
   Decision mode: scored
   Autopilot run: <run-id>
   Decision budget: <remaining>
   Next steps: suppressed
   Draft: requested
   Plan marker: <!-- effective-flow-plan-pr:v1 {"plan":"<plan.dir>/<file>.md"} -->
   Appendix: <sha256>
   ```

   On an issue's plan-on-base path add `Refs #<N>` as the supplied issue reference.

6. **Withdraw.** After the pull request step, whatever its outcome, withdraw the worktree through
   "Handback and completion action" step 4 of `worktree-integration`; the `retain` policy keeps the
   branch. A stop before a verified commit moves the record `active` → `aborted` and retains the
   worktree and the branch.

Close with `outcome: "plan-only-pull-request"` and its number (the updated pull request on a
rerun), or with `no-pull-request` when no pull request resulted. A rerun whose update failed
after the draft's verification (a failed commit or push, a failed self-run update, `STALE_WRITE`, a
`pr-read` mismatch, or a pushed commit whose appendix-only update failed, which the report names
with the mismatch between the plan section and the description) leaves the draft's old appendix and closes with `plan-pull-request-unchanged` and the draft's number.

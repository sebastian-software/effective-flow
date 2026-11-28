## Harness branch reuse

How a reused linked or harness-native checkout obtains its delivery branch. It decides from Git
facts only, never from host identity, so it applies alike in Claude Code, Codex (CLI and app) and
T3 Code. The checkout stays `harness-managed` in every case: no `git worktree add`, no lifecycle
record, no automatic setup, no removal.

After "Base-branch resolution", run the state helper's `worktree reuse-facts`, a read that first
fetches the base ref and the HEAD branch's upstream, with `cwd` the verified `RUNTIME_STATE_ROOT`,
`executionRoot` the reused `EXECUTION_ROOT`, `baseRef` and `localBaseBranch` the two recorded
results, and `visibility` the resolver's `data.visibility`, in the call line of
`worktree-lifecycle`'s "Helper operations". A refusal stops before any branch change. A build run
passes the two results and the returned `branchSource` as `authorize-execution`'s `reuseBase`;
the helper always accepts `existing`, re-derives `adopted` and `created`, and refuses a mismatch
with `AUTHORITY_MISMATCH`, never downgrading it. That `branchSource` decides:

- **`adopted`** — HEAD is a branch other than the resolved local base branch, the tree and index
  are clean, no untracked file lies outside the ignore rules, no commit is beyond the fresh base,
  no upstream commit is missing from both HEAD and the base, every fetch succeeded, and in hidden
  mode the name passes the `prefix-discloses` check of `delivery-branch-name`. The host branch
  becomes the delivery branch under its own name without a question; shared precondition 3 has
  nothing to point out. When `fastForward` is true (HEAD strictly behind the base), the order is
  fixed: authorize the setup at the target `baseOid` (the build run: `authorize-execution` with
  `baseHead` that OID), run `git -C <EXECUTION_ROOT> merge --ff-only <baseOid>`, then issue and
  verify the new receipt at `baseOid` (the build run: `transition-execution`). A failed
  fast-forward is no adoption: the checkout keeps its HEAD and continues as `existing`. Both
  creation flags stay false, so completion and abort never delete the adopted branch;
  `{{SKILL:cleanup}}` deletes a branch only in its orphan-branch class, which requires the
  `delivery.branchPrefix`, no checkout and landed content, so a host name without the prefix stays.
- **`created`** — HEAD is detached (typically a Codex app task) or the resolved local base branch,
  with the same cleanliness, untracked-file, commit and fetch conditions; the fact's `creationOid`
  is the fresh base OID. Name the delivery branch now under shared precondition 4, but create
  nothing yet. Authorize the setup at `creationOid` (the build run: `authorize-execution` with
  `baseHead` that OID). A HEAD strictly behind it first moves there detached with
  `git -C <EXECUTION_ROOT> switch --detach <creationOid>`, never `merge --ff-only`, so the local
  base branch keeps its tip, and the new receipt is detached at `creationOid`; a checkout already
  there keeps its original identity. Immediately before the first commit, verify that HEAD is
  still `creationOid`, run `git -C <EXECUTION_ROOT> switch -c <BRANCH_NAME>`, record the name and
  that creation OID, set the run's branch-created flag, and issue and verify a new
  `harness-managed` branch receipt (the build run: `record-branch`). An empty result or an abort
  before the first commit therefore leaves no branch. After a commit the branch is kept and
  reported, and the harness checkout is never switched back; the orphan-branch class of
  `{{SKILL:cleanup}}` removes it once the harness released the worktree and its content landed.
- **`existing`** — every other case (`reasons`: a failed fetch, a dirty tree, untracked files,
  commits beyond the base, a foreign upstream commit, a disclosing hidden-mode name). Report the
  reasons once and keep the behaviour before this rule: shared precondition 3 or the partial-diff
  path, and a branch a detached checkout needs is created or adopted through the harness-supported
  flow, with a new verified receipt before committing.

For exactly the two `created` cases this supersedes the rules to obtain the branch only through
the harness-supported flow and never to switch a harness-managed checkout. An adoption's
fast-forward moves the host branch it keeps and switches nothing.

# Tool reference: Deliver changes

This group brings finished changes into the repository: creating a commit and opening a
pull request from it. Both tools deliberately run **no** project validation of their own (linting,
tests, build checks) – `code-validator` and `test-writer`, or the
implementation tools, are responsible for that.

## `/effective-flow commit`

**Purpose:** Creates a descriptive commit message for already **staged** changes and
executes the commit via `git`. Commits exclusively what is already `git add`-staged.

**When to use:** When only the currently staged changes are to be committed, with an
appropriate conventional-commit message.

**Typical call:** `/effective-flow commit`

**Input/output:** Input is the staged diff. Output is a commit with a
conventional-commit prefix (`feat:` new functionality, `fix:` defect fix, `chore:`
maintenance, `docs:` documentation, `refactor:` structural improvement without behavior change,
`test:` test change), message in English, without `Co-Authored-By` lines.

**Interplay:** Typically used at the end of a `/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs`, or `/effective-flow maintain` run (which follow these
commit rules internally as well), or standalone for manually staged changes.
Respects existing Husky hooks (commitlint, prettier, lint); if they fail, `commit`
briefly relays the cause instead of bypassing the hooks. With multiple unrelated
topics in the staged diff, it suggests splitting first.

## `/effective-flow pr`

**Purpose:** Creates a pull request from a local branch – or via a freshly created
delivery branch – on the detected Git host: GitHub via `gh` or
Forgejo via `tea`. Detects the host automatically from the `origin` URL, pushes the branch if
needed, derives the title and description from the commits, and restores the checkout after
successful PR creation.

**When to use:** When finished changes on a branch are to be submitted as a pull request for
review, instead of merging them directly.

**Typical call:** `/effective-flow pr`

**Input/output:** Input is the head branch (default: currently checked-out branch) and the
base branch (default from `delivery.baseBranch`, legacy fallback `worktree.baseBranch`, otherwise
`main`). Output is the PR URL, the branch name, and the final local checkout state.

**Conventional-commit title:** `pr` enforces a PR title with a valid conventional-commit type
(`feat:`, `fix:`, `docs:`, `refactor:`, …), derived from the **effect** of the change or the
triggering workflow; an already valid, self-set title is preserved. This is
important because repositories with **squash merge** adopt the PR title as the subject of the single commit on
the target branch: there, the PR title is part of the release contract, and
**release-please** derives the version bump from it. An untyped title leads, despite green
CI, to a silent no-op release (no version, no delivery) – which is why `pr` normalizes
the title and asks only in cases of genuine ambiguity.

**Interplay:** `pr` is one of the three possible completion actions
(`delivery.completion: pr`) that `/effective-flow build`, `/effective-flow fix`, `/effective-flow refactor`,
`/effective-flow docs`, and `/effective-flow maintain` can trigger at the end of their delivery/worktree handback
– alongside `merge` and `branch`. But `pr` can also be called standalone, e.g. to
open an already-prepared delivery branch as a PR after the fact. For details on
delivery branch and completion actions, see [Worktree and delivery](worktree-and-delivery.md);
for the associated config keys, see [Configuration](configuration.md).

## Further reading

- [Worktree and delivery](worktree-and-delivery.md) – delivery branch, completion actions
  (`pr`/`merge`/`branch`)
- [Configuration](configuration.md) – `delivery.*` keys in detail
- [Tools: Implement](tools-implement.md) – the workflows that `commit` and `pr` typically
  trigger at the end

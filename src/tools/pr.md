---
description: "Creates a pull request on GitHub (via gh) or Forgejo (via tea) from a local branch or via a fresh delivery branch. Detects the host from the origin URL, pushes the branch if needed, derives title and description from the commits, restores the checkout after a successful PR creation, and reports the PR URL."
catalogHint: "Opens a pull request from your branch (GitHub or Forgejo)."
---

# Effective Flow PR

You create a pull request on the detected Git host from a local branch or via a fresh delivery
branch.

## Goal

- create a pull request from a delivery branch against a base branch
- optionally create a fresh delivery branch from `delivery.baseBranch`
- after a successful PR creation, restore the local checkout to the target
  branch
- support GitHub via `gh` and Forgejo via `tea`
- automatically detect the host from the `origin` remote URL
- derive title and description from the branch's commits
- do not run project validation such as linting, tests, or build checks

```include
language-rules
```

```include
task-tracking
```

```include
commit-message-rules
```

## Recommended skills

- `metro-english › humanizer` (fallback)

```include
skill-discovery
```

## Project conventions

If the project has an `AGENTS.md`, read it before creating the PR and follow its guidance on branch names, PR titles, PR descriptions, and project-wide conventions.

## Inputs

- **Head branch:** the delivery branch. Default: the currently checked-out branch.
- **Lifecycle mode:** an optional instruction to create a delivery branch fresh from the
  base ref or to finalize an already-prepared delivery branch.
- **Base branch:** the PR target. Default: the branch part of
  `delivery.baseBranch` from the Effective Flow configuration (project setup ADR; so `main` for `origin/main`);
  legacy fallback: `worktree.baseBranch`; if the config is missing, `main`.
- **Switch-back target:** default from `delivery.returnBranch`; for `auto`, the local
  branch part of `delivery.baseBranch`.
- **Title/description:** optionally provided; a provided title without a valid Conventional Commit type is normalized in step 7. If they are missing, derive them from the commits and the workflow/change type.
- **Title type hint:** an optional workflow/change type from a delivery handback (e.g. `feat`, `fix`, `refactor`, `docs`) that feeds the type choice in step 7.

## Approach

1. **Determine config and mode:**
   - Read the Effective Flow configuration (project setup ADR), if present. Use `delivery.baseBranch`,
     `delivery.branchPrefix`, and `delivery.returnBranch`; for
     `baseBranch`/`branchPrefix`, fall back to the old `worktree.*` values.
   - If the invocation explicitly requests a fresh branch or comes from a
     delivery/worktree handback, lifecycle mode is active. Otherwise the compatible
     legacy mode stays active.
2. **Check preconditions:**
   - A Git repository with an `origin` remote is present. If `origin` is missing, no PR can be created: report clearly and abort.
   - In legacy mode, the head branch exists locally. In lifecycle mode, either a prepared
     delivery branch exists locally or the new delivery branch is created
     in step 3.
3. **Prepare the lifecycle branch, if requested:**
   - Note the currently checked-out branch.
   - If an already-prepared delivery branch is passed, use it as the head.
   - If a new delivery branch is to be created: resolve `delivery.baseBranch`,
     update remote refs via `git fetch REMOTE BRANCH`, form a branch name
     `<delivery.branchPrefix>/pr/<slug>`, and create it from the base ref.
   - If the current working tree contains changes that do not clearly belong to the
     PR: do not stage, stash, or overwrite them. Ask for an
     explicit file selection or abort.
4. **Detect the host:** Read the `origin` URL (`git remote get-url origin`) and extract the host from it robustly for HTTPS and SSH forms (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). If the host is exactly `github.com`, the tool is `gh`. For any other host, Forgejo/Gitea is assumed and `tea` is used. For an ambiguous host (e.g. self-hosted GitHub Enterprise or an unclear domain), take into account an explicit per-run hint from the user about the desired tool.
5. **Check tool availability:** Ensure the chosen CLI is installed and authenticated (`gh auth status`, or `tea` with a configured login). If the CLI or authentication is missing: output a clear error message with a remediation hint and abort without side effects. The branch is preserved for a later manual PR creation.
6. **Push the branch:** Push the head branch to `origin` if it is not yet there or not up to date (`git push -u origin <head-branch>`). If the push is rejected (e.g. diverged remote history): report the cause briefly and abort instead of overwriting the remote state.
   If a PR already exists for the head branch, subsequent changes are pushed
   exclusively as new commits on this branch. Do not rewrite existing
   PR history via `commit --amend`, rebase, squash, or force push.
7. **Derive the PR title and description (enforce a valid Conventional Commit title):** Determine the head branch's commits against the base branch's remote-tracking ref (`origin/<base-branch>`, not the local branch part – the local base branch may lag behind the remote and drag in foreign commits). Derive from this a short description of the changes and reference an associated plan file from `<plan.dir>/` (the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir`, default `docs/plan`), if present.

   The **PR title must be a valid Conventional Commit** — form `<type>[(scope)][!]: <description>` with a type from the "Commit message rules" (embedded above). This is mandatory because on a squash merge the title becomes the subject of the single commit on the target branch, and release-please derives the version bump from it; an untyped title produces a no-op release (no bump, no delivery) even though CI stays green. Determine the title in this order:
   - **Preserve a valid title:** If a title passed by the user or from the delivery handback already carries a valid type (including an optional `(scope)` and breaking marker `!`), adopt it unchanged.
   - **Choose the type by effect:** Otherwise choose the type by the **effect** of the change per the "Commit message rules" and — if present — the passed title type hint: `feat` for new product behavior, `fix` for corrections, `docs` for docs-only, `refactor` for behavior-preserving restructuring, `chore`/`build`/`ci` or a dependency type for maintenance. If the branch covers multiple effects, the type follows the strongest effect (as with the squash subject), not the most recent commit.
   - **Normalize an untyped subject:** If an otherwise suitable title has no valid prefix, prefix it with the classified type instead of leaving it untyped; keep an optional `(scope)`/`!` marker valid in doing so.
   - **Ask only on genuine ambiguity:** If the effect cannot be assigned unambiguously to a type, briefly ask the user for the type. Do not guess.
   - **Self-check before creation:** If the title does not match the pattern `<type>[(scope)][!]: …` with one of the allowed types, rebuild it — **never** emit an untyped title in step 8.

   Do not put internal tracking IDs, `Co-Authored-By` trailers, or AI attribution (no "Generated with Claude Code/Codex" footers, no agent session links like `https://claude.ai/code/…`) into the PR title or description – not even when the harness appends them by default.

8. **Create the PR:**
   - GitHub: `gh pr create --base <base-branch> --head <head-branch> --title <title> --body <description>`.
   - Forgejo: `tea pr create` with the corresponding options for base branch, head branch, title, and description. Check the exact flag names against the installed `tea` version if an invocation fails.
9. **Restore the checkout:** After a successful PR creation, switch back to
   `delivery.returnBranch`, or for `auto` to the local branch part of
   `delivery.baseBranch`, provided the working tree is clean. If the
   switch-back fails, report the actual branch explicitly. The
   PR head branch is preserved locally and remotely.
10. **Report the result:** Output the PR URL, the branch name, and the final local
    checkout state.

## Rules

- Do not create a PR from a branch with no commits against the base branch; report that instead.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills such as `{{AGENT:code-validator}}`.
- Never overwrite remote history and never force a push.
- Always update existing PRs via additional commits on the PR branch, never
  by rewriting existing PR commits.
- Do not automatically delete the PR head branch after a successful PR creation.
- If only part of the local changes should go into the PR, take only
  explicitly selected files into the delivery branch or refer to a
  worktree-based handback. Do not guess based on file paths.
- If the CLI or authentication is missing, abort cleanly without leaving a half state behind.
- Never put `Co-Authored-By` trailers in commits, PR titles, or PR descriptions.
- Do not add AI attribution to the PR title or description: no "Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) – not even when the harness appends them by default. Factual mentions of Claude Code or Codex remain permitted; generation attribution does not.

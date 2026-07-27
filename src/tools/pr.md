---
description: "Creates or reuses a pull request on GitHub (via gh) or Forgejo (via tea) from a local branch or via a fresh delivery branch. Detects the host from the origin URL, pushes the branch if needed, derives title and description for a new pull request, restores the checkout after a successful result, and reports the PR URL."
catalogHint: "Opens a pull request from your branch (GitHub or Forgejo)."
---

# Effective Flow PR

You create a pull request on the detected Git host from a local branch or via a fresh delivery
branch.

## Goal

- create a pull request from a delivery branch against a base branch, or reuse the exact existing open pull request
- optionally create a fresh delivery branch from `delivery.baseBranch`
- after a successful PR creation or reuse, restore the local checkout to the target
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

- `metro-english › humanizer` (fallback) – apply it to the Conventional Commit title description
  only when resolved `language.git` is `en`, and to the PR body only when resolved
  `language.forge` is `en`; never apply English rewriting to a German artifact

```include
skill-discovery
```

## Execution root

Every Git operation and every remote-helper invocation of this tool runs in the repository's main
checkout, `RUNTIME_STATE_ROOT` — never in a linked or delivery worktree. `gh` and `tea` resolve
their repository context from the working directory, and a delivery handback may already have
withdrawn its worktree before this tool runs, so an inherited execution directory can be a deleted
path. The branch and its commits are repository-wide and need no worktree.

Resolve the root from the first record of `git worktree list --porcelain` when a handback did not
supply it, verify it, and use it as the per-call working directory: `git -C <ROOT> …` for Git and
the top-level `cwd` field for every helper payload. In an in-place run the root is the current
checkout, so nothing changes. Never fall back to an inherited directory.

```lazy-include
execution-location
when: the supplied or resolved execution root must be verified before a push, helper call, or checkout restore
```

## Project conventions

If the project has an `AGENTS.md`, read it before creating the PR and follow its guidance on branch names, PR titles, PR descriptions, and project-wide conventions.

## Inputs

- **Execution root:** the verified absolute `RUNTIME_STATE_ROOT` from a delivery handback. If it is
  missing, resolve and verify it per "Execution root".
- **Head branch:** the delivery branch. Default: the currently checked-out branch.
- **Lifecycle mode:** an optional instruction to create a delivery branch fresh from the
  base ref or to finalize an already-prepared delivery branch.
- **Base branch:** the PR target. Default: the branch part of
  `delivery.baseBranch` from the Effective Flow configuration (project setup ADR; so `main` for `origin/main`);
  legacy fallback: `worktree.baseBranch`; if the config is missing, `main`.
- **Switch-back target:** default from `delivery.returnBranch`; for `auto`, the local
  branch part of `delivery.baseBranch`.
- **Title/description:** optionally provided; a provided title without a valid Conventional Commit type is normalized in step 9. If they are missing, derive them from the commits and the workflow/change type.
- **Title type hint:** an optional workflow/change type from a delivery handback (e.g. `feat`, `fix`, `refactor`, `docs`) that feeds the type choice in step 9.

## Approach

1. **Determine the execution root, config and mode:**
   - Establish and verify the execution root per "Execution root" before any other step. Every
     later `git` call and helper payload in this approach uses it.
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
     `<delivery.branchPrefix>/pr/<slug>`, and create it from the base ref. Record
     explicitly that this invocation created this exact local branch; never infer
     branch ownership from its name or from lifecycle mode alone.
   - If the current working tree contains changes that do not clearly belong to the
     PR: do not stage, stash, or overwrite them. Ask for an
     explicit file selection or abort.
4. **Resolve the base and inspect the head before any push:** Refresh the configured base ref if
   step 3 did not already do so, resolve its remote-tracking ref, and determine the commits in
   `<remote-tracking-base>..<head-branch>`. Preserve this discovered commit range for the later
   title and description derivation. If the base cannot be refreshed or resolved, abort before
   any push and preserve the head branch.
   - **Commits found:** Continue with the unchanged delivery flow in step 5.
   - **No commits found:** Do not push or perform any other remote branch mutation. Handle the
     empty head according to its ownership:
     - **Branch created by this invocation:** Restore the checkout recorded before branch
       creation and delete only the exact transient local branch created in step 3, using safe,
       non-forcing branch deletion and only when the working tree permits both operations. Never
       stage, stash, overwrite, or discard working-tree changes for this cleanup. If restoration
       or deletion is unsafe or fails, preserve the branch and report the actual checkout state.
     - **Prepared or legacy branch:** Preserve it. A branch not created by this invocation is
       user-owned for cleanup purposes, even when it has a lifecycle-style name.
     - **After cleanup:** Report that the head has no commits against the resolved base, include
       the resulting local state, and stop.
5. **Resolve the provider:** Invoke the shipped `scripts/remote-tracker.mjs` helper's repository-resolution operation with the execution root as the payload's `cwd`. Pass a configured or explicit provider override when present. On `AMBIGUOUS_HOST`, ask for `github` or `forgejo` and retry with that choice; do not infer a provider from an unknown hostname.
6. **Check tool availability:** Invoke the helper probe once — again with the execution root as `cwd` — and use its normalized authentication, version, JSON, and capability result. On `CLI_MISSING`, `AUTH_FAILED`, or `UNSUPPORTED_CAPABILITY`, report the structured remediation and abort without side effects. A `tea` below the supported minimum surfaces here as `UNSUPPORTED_CAPABILITY` with its `installed` and `minimum` versions, which is the intended early gate. The branch is preserved for later manual PR creation; never discover flags or access credentials directly.
7. **Push the branch:** Push the head branch to `origin` if it is not yet there or not up to date (`git -C <execution-root> push -u origin <head-branch>`). If the push is rejected (e.g. diverged remote history): report the cause briefly and abort instead of overwriting the remote state.
   If a PR already exists for the head branch, subsequent changes are pushed
   exclusively as new commits on this branch. Do not rewrite existing
   PR history via `commit --amend`, rebase, squash, or force push.
8. **Look up an existing open PR:** After the successful push, invoke the helper's
   `pr-list` operation for open pull requests, with the execution root as `cwd`. For every returned item whose normalized `head`,
   `base`, `state`, or URL is missing, hydrate the item through the helper's `pr-read` operation;
   abort as invalid/unparseable output if any item remains incomplete. Exact-filter the complete
   normalized details using both `head === <head-branch>` and `base === <base-branch>`, and require
   state `open` and a parseable URL. The helper owns the provider-specific GitHub and
   Forgejo/Gitea CLI forms, JSON normalization, capability verification, and complete or bounded
   pagination; do not bypass it with guessed `gh` or `tea` flags.
   - **Exactly one exact match:** Reuse its URL as the successful PR result. Preserve its title
     and description, do not invoke `pr-create` or any metadata mutation, skip steps 9 and 10, and
     continue with the shared restoration and reporting path in steps 11 and 12.
   - **No exact match:** Continue with title/description derivation and PR creation. An open PR
     for the same head but a different base, as well as a closed or merged PR, is not a match.
   - **Multiple exact matches, lookup failure, or invalid/unparseable output:** Report a clear
     diagnostic and abort without attempting PR creation or guessing which PR to use.
9. **Derive the PR title and description for a new PR (enforce a valid Conventional Commit title):** Reuse the head branch commits discovered against the resolved remote-tracking base in step 4; do not recompute them against the local branch part, which may lag behind the remote and drag in foreign commits. Resolve `language.git` for the title description and `language.forge` for the PR body, and keep each artifact internally consistent even when they differ. Preserve the language of explicitly supplied text. Derive the content from the changes and reference an associated plan file from `<plan.dir>/` (the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir`, default `docs/plan`), if present.

   The **PR title must be a valid Conventional Commit** — form `<type>[(scope)][!]: <description>`
   with a stable English type and a `language.git` description, per "Commit message rules". This
   is mandatory because on a squash merge the title becomes the subject of the single commit,
   while the PR body remains Forge prose in `language.forge`. Determine the title in this order:
   - **Preserve a valid title:** If a title passed by the user or from the delivery handback already carries a valid type (including an optional `(scope)` and breaking marker `!`), adopt it unchanged.
   - **Choose the type by effect:** Otherwise choose the type by the **effect** of the change per the "Commit message rules" and — if present — the passed title type hint: `feat` for new product behavior, `fix` for corrections, `docs` for docs-only, `refactor` for behavior-preserving restructuring, `chore`/`build`/`ci` or a dependency type for maintenance. If the branch covers multiple effects, the type follows the strongest effect (as with the squash subject), not the most recent commit.
   - **Normalize an untyped subject:** If an otherwise suitable title has no valid prefix, prefix it with the classified type instead of leaving it untyped; keep an optional `(scope)`/`!` marker valid in doing so.
   - **Ask only on genuine ambiguity:** If the effect cannot be assigned unambiguously to a type, briefly ask the user for the type. Do not guess.
   - **Self-check before creation:** If the title does not match the pattern `<type>[(scope)][!]: …` with one of the allowed types, rebuild it — **never** emit an untyped title in step 10.

   Do not put internal tracking IDs, `Co-Authored-By` trailers, or AI attribution (no "Generated with Claude Code/Codex" footers, no agent session links like `https://claude.ai/code/…`) into the PR title or description – not even when the harness appends them by default.

10. **Create the PR:** Build the provider-neutral PR payload, set the execution root as its `cwd`, and invoke the helper's PR-create mutation. Inspect the default dry-run command preview, then repeat with `--apply`. Use only the normalized PR URL/result; on a structured error preserve the branch and do not improvise another transport path.
11. **Restore the checkout:** After a successful PR creation or reuse, switch the execution root's
    checkout back to `delivery.returnBranch`, or for `auto` to the local branch part of
    `delivery.baseBranch`, provided its working tree is clean. If the
    switch-back fails, report the actual branch explicitly. The
    PR head branch is preserved locally and remotely.
12. **Report the result:** Output the PR URL, the branch name, and the final local
    checkout state.

## Rules

- Inspect the head branch's commits against the resolved remote-tracking base before any push;
  do not create a PR from a branch with no commits in that range.
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


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

## Language rule

- Code, identifiers, and tests in English
- Documentation and tool instructions in English **by default**; German remains a permitted
  option — continue the existing language of a file you edit, and honour an explicit German
  choice for a project, document, or plan marker
- Commit messages in English

English is the default; German is not deprecated. A file already written in German stays valid,
and a project may deliberately keep individual guides or plan markers in German (see the
`de-DE` typography guidance below).

### Typography

Locale-specific typography of visible prose — quotation marks, dashes, umlauts and ß, non-breaking
spaces, number and date formats — is owned by the central `locale-typography` skill. When writing
or editing visible prose its locale guidance is authoritative (`en-US` for English, `de-DE` for
German); Effective Flow deliberately keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
a minimal fallback applies to German text: real umlauts and ß instead of ASCII replacements (ae,
oe, ue, ss), typographic quotation marks „…“ instead of straight ones, and an en dash – instead
of a hyphen.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

## Commit message rules

- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Recommended skills

- `metro-english › humanizer` (fallback)

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5 (if a
   recommended skill is the declared domain owner, its guidance is authoritative, not merely
   optional). A fallback notation `A › B` is an ordered preference: take the first available,
   non-excluded skill in the group, never both. If no such section exists (e.g. for tools),
   this point does not apply.
2. **Judge relevance:** Check each skill against the **concrete** task and pull in only the
   clearly fitting ones (typically 0–2). Do not load skills "on suspicion" — be token-frugal.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** When working against an unknown or current library or framework, use
   current-docs skills (e.g. `context7`) as needed, if available, instead of guessing from
   memory. Only when needed, never mandatory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

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
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills such as ``code-validator``.
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

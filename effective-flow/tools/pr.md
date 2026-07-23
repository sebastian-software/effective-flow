## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

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

## Language resolution

Effective Flow resolves the language of persisted, human-readable content by **target surface**.
The project setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, and branch slugs are not
localized. Product UI/CLI/error text follows the target project's product-i18n rules and is not
controlled by this configuration. Exact quotations and incoming third-party text are not
translated unless explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid. An invalid value has no special meaning: report the affected key,
ignore it, and continue with the next fallback. A missing override means inheritance; `null` is
not a language value. Interactive, non-persisted replies follow the user's current language,
using `language.project` only if the conversation language is not recognizable.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `effective-flow setup`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `locale-typography` skill. Its locale guidance is authoritative; Effective Flow keeps no
second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

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

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Recommended skills

- `metro-english › humanizer` (fallback) – apply it to the Conventional Commit title description
  only when resolved `language.git` is `en`, and to the PR body only when resolved
  `language.forge` is `en`; never apply English rewriting to a German artifact

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
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the alternative orchestrator `effective-workflow`
   inside Effective Flow: nesting it would create competing lifecycle and delivery owners.
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
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7`) when needed instead of guessing from memory.
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
- **Title/description:** optionally provided; a provided title without a valid Conventional Commit type is normalized in step 9. If they are missing, derive them from the commits and the workflow/change type.
- **Title type hint:** an optional workflow/change type from a delivery handback (e.g. `feat`, `fix`, `refactor`, `docs`) that feeds the type choice in step 9.

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
5. **Resolve the provider:** Invoke the shipped `scripts/remote-tracker.mjs` helper's repository-resolution operation. Pass a configured or explicit provider override when present. On `AMBIGUOUS_HOST`, ask for `github` or `forgejo` and retry with that choice; do not infer a provider from an unknown hostname.
6. **Check tool availability:** Invoke the helper probe once and use its normalized authentication, version, JSON, and capability result. On `CLI_MISSING`, `AUTH_FAILED`, or `UNSUPPORTED_CAPABILITY`, report the structured remediation and abort without side effects. The branch is preserved for later manual PR creation; never discover flags or access credentials directly.
7. **Push the branch:** Push the head branch to `origin` if it is not yet there or not up to date (`git push -u origin <head-branch>`). If the push is rejected (e.g. diverged remote history): report the cause briefly and abort instead of overwriting the remote state.
   If a PR already exists for the head branch, subsequent changes are pushed
   exclusively as new commits on this branch. Do not rewrite existing
   PR history via `commit --amend`, rebase, squash, or force push.
8. **Look up an existing open PR:** After the successful push, invoke the helper's
   `pr-list` operation for open pull requests. For every returned item whose normalized `head`,
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

10. **Create the PR:** Build the provider-neutral PR payload and invoke the helper's PR-create mutation. Inspect the default dry-run command preview, then repeat with `--apply`. Use only the normalized PR URL/result; on a structured error preserve the branch and do not improvise another transport path.
11. **Restore the checkout:** After a successful PR creation or reuse, switch back to
    `delivery.returnBranch`, or for `auto` to the local branch part of
    `delivery.baseBranch`, provided the working tree is clean. If the
    switch-back fails, report the actual branch explicitly. The
    PR head branch is preserved locally and remotely.
12. **Report the result:** Output the PR URL, the branch name, and the final local
    checkout state.

## Rules

- Inspect the head branch's commits against the resolved remote-tracking base before any push;
  do not create a PR from a branch with no commits in that range.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills such as ``effective-flow-code-validator``.
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

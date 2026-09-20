## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow PR

You create a pull request on the detected Git host from a prepared committed branch.

## Goal

- create a pull request from a delivery branch against a base branch, or reuse the exact existing open pull request
- publish only the verified commit range of a named, prepared head branch
- support GitHub via `gh` and Forgejo via `tea`
- automatically detect the host from the `origin` remote URL
- derive title and description from the branch's commits
- do not run project validation such as linting, tests, or build checks

**Load on demand:** Read `shared/language-rules.md`, when the PR title and body output languages must be resolved.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

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

- `effective-writing › humanizer` (fallback) – the primary skill applies to the Conventional
  Commit title description and the PR body in either language; the `humanizer` fallback rewrites
  English prose only, so it stands in only when the resolved `language.git` (title) or
  `language.forge` (body) is `en`, and never rewrites German output

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the `effective-flow` router recursively as a
   **discovered skill**: re-entering the host of this run would create competing lifecycle and
   delivery owners. Declared tool-to-tool delegation is a different mechanism and stays allowed.
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
   current-docs skill (e.g. `context7-mcp`) when needed instead of guessing from memory.
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

## Execution root

Every remote-helper invocation and every **repository-wide** Git operation of this tool — refreshing
the base ref, resolving refs, listing the head commits, and pushing the branch — runs in the
repository's main checkout, `RUNTIME_STATE_ROOT`. `gh` and `tea` resolve their repository context
from the working directory, and a delivery handback may already have withdrawn its worktree before
this tool runs, so an inherited execution directory can be a deleted path. These operations act on
refs, not on a working tree, so they need no worktree.

Resolve the root from the first record of `git worktree list --porcelain` when a handback did not
supply it, verify it, and use it as the per-call working directory: `git -C <ROOT> …` for those Git
calls and the top-level `cwd` field for every helper payload. In an in-place run the root is the
current checkout, so nothing changes. Never fall back to an inherited directory.

**A direct invocation checkout stays separate.** Resolve its branch and complete dirty state before
using the repository-wide execution root. A returning committed handoff instead supplies the exact
head branch and verified head OID; its delivery worktree may already have been withdrawn, so this
tool neither requires nor changes that checkout. Never derive a handed-off head from the main
checkout, which may be on the base branch or an unrelated branch.

**Load on demand:** Read `shared/execution-location.md`, when the supplied or resolved execution root must be verified before a push, helper call, or checkout restore.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Project conventions

If the project has an `AGENTS.md`, read it before creating the PR and follow its guidance on branch names, PR titles, PR descriptions, and project-wide conventions.

## Base-branch resolution

`delivery.baseBranch` has exactly one resolution rule, and this is it; every later step refers
back to the results recorded here instead of restating the rule or re-deriving anything from the
configured value. Absent, the key takes `origin/` prefixed to the branch
`git symbolic-ref refs/remotes/origin/HEAD` names, else `origin/main`; the derived value is a
remote ref like any other and is classified below as one. An explicit value is used as written. The value is a
remote ref only when the part before its first `/` is a remote that `git remote` lists for this
repository; local branch names carry slashes too, so `feature/foo` is that branch unless `feature`
is a configured remote. A value with no `/` at all (`main`, `develop`, whatever `setup` proposes
where no `origin` exists) has no such leading part and is therefore never a remote ref.

- Remote configured: run `git fetch REMOTE BRANCH`, then resolve the ref, so the delivery
  branch starts from the current remote state. If the fetch or the resolution fails (offline,
  credentials, deleted branch), report and stop — never fall back here: a stale local branch
  can be far behind and would start delivery from the wrong commit. After a successful
  resolution, and only where REMOTE is `origin`, read `origin/HEAD`: where it resolves and names
  another branch, name both facts once, neither as authoritative — the clone-time cache may be the
  stale side — and offer `git remote set-head origin -a`. This adds no gate: the configured value
  wins. A `origin/HEAD` that does not resolve is not an error and reports nothing; a base on a
  differently named remote is not compared against origin's at all. Stay silent where the project
  setup ADR carries, in prose outside its configuration table, a sentence calling the divergence
  between `delivery.baseBranch` and the repository default deliberate and permanent.
- Remote not configured: no such ref can exist in this repository. Resolve the value as a
  local ref instead: as it stands first, and only if that fails the local branch part after
  the first `/` (`main` for `origin/main`); report that substitution once.
- Neither the remote ref nor any local candidate for the value resolves: abort, naming both
  facts. Never invent or create a base branch.

### Recorded results

The arm that ran records two named results. They are the only base-branch values later steps use,
and no step recomputes either one from the configured value.

- **Resolved base ref** — what a delivery branch is created from, and what a commit range is
  computed against.
- **Resolved local base branch** — the local branch every merge target, switch-back target and
  pull-request target uses.

The remote-configured arm records the fetched remote-tracking ref as the resolved base ref, and
the branch name after the remote name as the resolved local base branch. The
remote-not-configured arm records the candidate that actually resolved as **both** results: the
value as it stands, or — only where the last-resort substitution above fired and was reported —
the substituted local candidate. The aborting arm records nothing, and no consuming step runs.

The pair therefore identifies its own arm, and a consuming step reads that arm off the two
results rather than off which arm it watched run. This matters exactly where nothing ran: a
delegated run handed both results resolved nothing itself and has no arm to remember. The
remote-configured arm's two results always **differ**, because its resolved base ref carries the
remote name in front of the branch while its resolved local base branch is that branch name
alone. The remote-not-configured arm's two results are always **equal**, because it records one
candidate as both — the value as it stands, or the substituted one. So equal results are the
remote-not-configured arm and differing results are the remote-configured one. There is no third
reading, and therefore no arm name any caller has to pass alongside the pair.

## Inputs

- **Execution root:** the verified absolute `RUNTIME_STATE_ROOT` from a delivery handback. If it is
  missing, resolve and verify it per "Execution root".
- **Head branch:** the prepared delivery branch. A direct invocation uses the named branch checked
  out in its invocation checkout. A delivery handback always passes the branch explicitly.
- **Committed handoff:** an optional returning-caller receipt containing the exact head branch,
  both base results named as such — the resolved base ref and the resolved local base branch —
  the verified head OID, and confirmation that every intended group was committed
  and verified. A handoff that supplies both results is complete: this tool then runs no
  resolution of its own. A caller that hands over a single untyped base value is read as having
  supplied the resolved local base branch, which leaves that handoff **incomplete** rather than
  broken: step 4 applies "Base-branch resolution" to that one value exactly as a direct invocation
  does and takes both results from there, which also corrects the reading where the value the
  caller meant was a remote ref after all. `effective-flow deliver` is the caller that hands over one
  value today, so this is the routine path and not a degenerate one. Missing or contradictory
  evidence about the head branch, the verified OID or the commit-only guarantee fails closed; a
  single base value does not.
- **Base branch:** the PR target — always the resolved local base branch, never the resolved base
  ref. On a direct invocation it comes from applying "Base-branch resolution" to
  `delivery.baseBranch` from the Effective Flow configuration (project setup ADR; so `main` for `origin/main`);
  if the config is missing, the derived remote default —
  the one the delivery configuration documents, and a remote ref deliberately. A slashless `main`
  is never a remote ref under that rule and `git rev-parse` does not widen it into one, so an
  unconfigured checkout that has `origin/main` but no local `main` — a `--single-branch` clone, a
  branch deleted after its merge — would resolve no base at all.
- **Title/description:** optionally provided; a provided title without a valid Conventional Commit type is normalized in step 9. If they are missing, derive them from the commits and the workflow/change type.
- **Title type hint:** an optional workflow/change type from a delivery handback (e.g. `feat`, `fix`, `refactor`, `docs`) that feeds the type choice in step 9.

## Approach

1. **Determine the execution root, config and invocation shape:**
   - Establish and verify the execution root per "Execution root" before any other step, and keep
     a direct invocation checkout separate from it. Every helper payload and every repository-wide
     `git` call below uses the execution root.
   - Read the Effective Flow configuration (project setup ADR), if present. Use `delivery.baseBranch`,
     or the documented default where that line is absent. Record
     that configured value and resolve nothing from it here: step 4 applies "Base-branch
     resolution" to it, deliberately behind the step 2 preconditions, so a direct invocation
     reaches the network only once its checkout has been accepted.
   - A `worktree.baseBranch` row is retired and never read, on a direct invocation and a committed handoff
     alike. With no `delivery.baseBranch` row beside it, stop here, before any fetch or push, naming both keys
     and effective-flow setup; with both present, `delivery.baseBranch` wins and the retired row is reported once.
   - Classify the call as either a direct invocation from its current checkout or a returning
     committed handoff. There is no fresh-branch or local-change-transfer mode in this tool; use
     `effective-flow deliver` for that lifecycle.
2. **Check preconditions:**
   - A Git repository with an `origin` remote is present. If `origin` is missing, no PR can be created: report clearly and abort.
   - The head exists as an exact local branch and is not detached. A detached invocation aborts
     here; a base branch as head aborts in step 4, which is where the resolved base ref and the
     resolved local base branch first exist to compare it against.
   - For a direct invocation, require the complete working tree and index to be clean, including
     untracked paths. If it is dirty, abort before fetch or push and direct the user to
     `effective-flow deliver`; never omit local content silently.
   - For a returning committed handoff, require its exact head, base, verified head OID, and
     successful commit-only evidence. Resolve the supplied branch and require it still equals the
     supplied OID. Unrelated dirt in `RUNTIME_STATE_ROOT` is not PR content and does not replace or
     weaken this exact ref check.
3. **Verify the prepared head:** Preserve the resolved head OID as the immutable handoff boundary.
   Do not create or switch a branch, stage or commit content, stash changes, amend commits, rebase,
   squash, or force-update a ref. A direct invocation records its exact clean `HEAD`; a returning
   handoff must already have supplied the same OID.
4. **Resolve the base and inspect the head against it before any push:** The two base results are
   produced here. A handoff that supplied both is used unchanged; every other call applies
   "Base-branch resolution" to the value step 1 recorded. This is the first step that may touch
   the network, and that is why it sits behind step 2 rather than in step 1: a dirty direct
   invocation is turned away with the diagnosis it deserves instead of with a fetch or credential
   error from a base it was never going to reach. The step adds no refresh of its own and never
   repeats the one that rule owns; where an arm below needs a ref brought up to date, it goes back
   through that same rule. Require the head branch to differ from both results; a base branch as
   head aborts. Derive the
   remote-tracking diff base from the arm the two results identify, reading that arm off the pair
   per "Recorded results" rather than off which arm ran here — a complete handoff ran none, so
   equal results are the remote-not-configured arm and differing results the remote-configured
   one, and no handoff has to carry an arm name. Both arms below yield a
   remote-tracking ref on `origin` or abort. Then determine the commits in
   `<remote-tracking-base>..<head-branch>` and preserve this discovered commit range for the later
   title and description derivation. If no diff base can be derived, abort before any push and
   preserve the head branch.
   - **Remote configured:** the resolved base ref is already a remote-tracking ref, so no upstream
     lookup runs. Require its remote to be `origin` all the same, and abort as **base branch
     tracked on a non-`origin` remote** when it is not — the same abort the other arm raises, for
     the same reason. A configured `upstream/main` resolves here while this tool pushes the head
     to `origin` and opens the pull request there with base `main`, so the commit range, the
     empty-range decision and the derived title and description would all describe a repository
     the pull request is not opened on. The accepted ref is the diff base directly, once it is
     current in this run. A call that resolved the value here already brought it up to date and
     owes nothing further. A complete handoff resolved nothing here, and the ref it recorded is a
     mutable remote-tracking name that can be arbitrarily far behind by the time this step runs:
     the handoff may arrive long after the resolution that produced it, and `origin` moves in
     between, so the empty-range decision and the derived title and description would read a base
     the pull request no longer has. Put that ref back through "Base-branch resolution", which
     performs the one refresh this arm then owes — exactly as the other arm does with its
     discovered upstream — before the range below is inspected; a failure there stops the run as
     that rule requires. Refreshing a recorded ref recomputes neither result: both stay exactly as
     the handoff stated them.
   - **Remote not configured:** the resolved base ref is local and cannot serve as a diff base
     here. Discover the resolved local base branch's upstream with
     `git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads/<branch>` and read
     the refname back rather than trusting the pattern to have matched only that branch. Two
     properties of this command decide the format, and dropping the refname loses both. A
     `refs/heads/<branch>` pattern matches that ref **or** any ref below `refs/heads/<branch>/`, so
     a base `release` that does not exist locally reports `release/1.0`'s upstream and the range,
     title and description are all derived against a sibling branch with no abort firing. And the
     two absences are not distinguishable from a bare `%(upstream:short)`: a missing branch prints
     nothing and a branch without an upstream prints a lone newline, which command substitution
     strips, so both arrive as the empty string. **No row whose refname equals the branch** is
     therefore the branch missing, and **a row whose upstream field is empty** is the branch
     without an upstream. Abort as **base branch has no upstream** in either case and name which
     of the two the observation showed; a branch absent from the forge cannot be a PR target. Otherwise require the upstream's remote to be `origin`, and abort as **base branch
     tracked on a non-`origin` remote** when it is not: this tool pushes the head to `origin`, so
     a base tracked on another remote would compute the commit range against a repository the pull
     request is not opened on. Then require the upstream's branch component — the part after the
     remote name — to equal the resolved local base branch, and abort as **base branch tracked
     under a different name** when it does not. Git lets a local branch track a remote branch of
     any name, so a `release` that tracks `origin/main` computes the range against `origin/main`
     while `release` stays the pull-request target: creation fails outright where `origin/release`
     is absent, and opens against an unrelated branch where one exists. Adopting the upstream's
     branch component as the target instead is the wrong repair, because it would open the pull
     request against a branch the configuration never named — `main` for a configured `release` —
     and "Base-branch resolution" already recorded the resolved local base branch, so redefining
     it here would leave step 8's lookup filter and step 10's payload disagreeing with the rule
     that produced them. The comparison reads refs already in hand, so it runs before the refresh
     below and turns that configuration away without reaching the network. The accepted upstream is
     not current yet: this arm ran because the configured value named no remote, so the resolution
     fetched nothing and the remote-tracking ref can be arbitrarily far behind the branch the pull
     request will actually target. Put that
     upstream back through "Base-branch resolution", which classifies it as a remote ref and
     performs the one refresh this arm owes; a failure there stops the run as that rule requires.
     Its resolved base ref is the diff base, and the resolved local base branch stays the one this
     arm already recorded.
   - **Commits found:** Continue with the unchanged delivery flow in step 5.
   - **No commits found:** Preserve the prepared branch, report that it has no commits against the
     resolved base, and stop without any remote mutation.
5. **Resolve the provider:** Invoke the shipped `scripts/remote-tracker.mjs` helper's repository-resolution operation with the execution root as the payload's `cwd`. Pass a configured or explicit provider override when present. On `AMBIGUOUS_HOST`, ask for `github` or `forgejo` and retry with that choice; do not infer a provider from an unknown hostname.
6. **Check tool availability:** Invoke the helper probe once — again with the execution root as `cwd` — and use its normalized authentication, version, JSON, and capability result. On `CLI_MISSING`, `AUTH_FAILED`, or `UNSUPPORTED_CAPABILITY`, report the structured remediation and abort without side effects. A `tea` below the supported minimum surfaces here as `UNSUPPORTED_CAPABILITY` with its `installed` and `minimum` versions, which is the intended early gate. The branch is preserved for later manual PR creation; never discover flags or access credentials directly.
7. **Push the branch:** Immediately before the push, require the exact head branch still resolves to
   the OID preserved in step 3. Push it to `origin` if it is not yet there or not up to date
   (`git -C <execution-root> push -u origin <head-branch>`). If the ref changed or the push is
   rejected (e.g. diverged remote history), report the cause briefly and abort instead of
   publishing a different commit or overwriting remote state.
   If a PR already exists for the head branch, subsequent changes are pushed
   exclusively as new commits on this branch. Do not rewrite existing
   PR history via `commit --amend`, rebase, squash, or force push.
8. **Look up an existing open PR:** After the successful push, invoke the helper's
   `pr-list` operation for open pull requests, with the execution root as `cwd`. For every returned item whose normalized `head`,
   `base`, `state`, or URL is missing, hydrate the item through the helper's `pr-read` operation;
   abort as invalid/unparseable output if any item remains incomplete. Exact-filter the complete
   normalized details using both `head === <head-branch>` and `base === <base-branch>`, where
   `<base-branch>` is the resolved local base branch and never the resolved base ref, and require
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
9. **Derive the PR title and description for a new PR (enforce a valid Conventional Commit title):** Reuse the head branch commits discovered against the resolved remote-tracking base in step 4; do not recompute them against the local branch part, which may lag behind the remote and drag in foreign commits. Resolve `language.git` for the title description and `language.forge` for the PR body, and keep each artifact internally consistent even when they differ. A forge issue-reference keyword carried in a supplied reference — the auto-close keyword with its variants, or the non-closing `Refs` — is a machine token the code host parses: keep it in English whatever `language.forge` resolves to, never translated. Preserve the language of explicitly supplied text. Derive the content from the changes and reference an associated plan file from `<plan.dir>/` (the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir`, default `docs/plan`), if present.

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

10. **Create the PR:** Build the provider-neutral PR payload with the resolved local base branch as its `base` — a branch name, never the resolved base ref — set the execution root as its `cwd`, and invoke the helper's PR-create mutation. Inspect the default dry-run command preview, then repeat with `--apply`. Use only the normalized PR URL/result; on a structured error preserve the branch and do not improvise another transport path.
    - **Never re-run PR creation after `mutationMayHaveSucceeded`:** if the structured error carries
      `mutationMayHaveSucceeded: true`, the pull request may already exist and repeating the
      mutation would create a duplicate for the same head. Resolve it by repeating the step 8
      existing-PR lookup, which identifies a pull request by head and base rather than by a number
      this failure path never received; a single exact match is the created pull request and its
      URL is the result. If the lookup finds no match or cannot run, report the error with the
      preserved branch and let the user decide. Retrying the creation is forbidden on every
      provider, whatever the error message suggests.
11. **Reverify the published head:** Require the local head branch still resolves to the verified
    OID and report any unexpected ref movement. Never switch or otherwise restore a checkout: this
    tool did not create or change one. Preserve the PR head branch locally and remotely.
12. **Report the result:** Output the PR URL, head and base branches, and verified head OID. Emit the
    next-step block per `next-steps` as the last element of that report, unless the caller passed
    the literal line `Next steps: suppressed`.

## Rules

- Inspect the head branch's commits against the resolved remote-tracking base before any push;
  do not create a PR from a branch with no commits in that range.
- Consume commits only. Never create or switch branches, stage or commit changes, or infer omitted
  working-tree content as part of the pull request.
- A direct invocation requires a clean, attached, non-base checkout. A returning handoff requires
  an exact committed head/base/OID receipt and never substitutes the main checkout's state.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills such as ``effective-flow-code-validator``.
- Never overwrite remote history and never force a push.
- Always update existing PRs via additional commits on the PR branch, never
  by rewriting existing PR commits.
- Do not automatically delete the PR head branch after a successful PR creation.
- If only part of local changes should go into a PR, stop and use `effective-flow deliver` to confirm and
  isolate that selection. This tool never guesses paths or transfers working-tree content.
- If the CLI or authentication is missing, abort cleanly without leaving a half state behind.
- Never put `Co-Authored-By` trailers in commits, PR titles, or PR descriptions.
- Do not add AI attribution to the PR title or description: no "Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) – not even when the harness appends them by default. Factual mentions of Claude Code or Codex remain permitted; generation attribution does not.

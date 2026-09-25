## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Commit

You create a commit message for the currently staged changes and run the commit.

**Load on demand:** Read `shared/language-rules.md`, when the commit message output language must be resolved.

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

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective Flow project
setup" (default slug `effective-flow-project-setup`, see fragment "Living ADR model"). It carries
the config parameters with minimal prose as a **Markdown table**. There is **no**
`.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a private runtime
directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`), completely ignored through
`.gitignore` or, in hidden mode, the Git common directory's `info/exclude`.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

0. **Local hidden configuration.** `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` (main
   checkout only, table encoding below) wins only if it declares `visibility | hidden` — **hidden
   mode**, whose forced values the deferred building block enforces; otherwise report it, go on.
   A reader without a verified `RUNTIME_STATE_ROOT` resolves it here first, read-only, from the
   first `git worktree list --porcelain` record (deferred building block); in a Git checkout where
   that fails it stops with a report and never falls through to standard mode. A tracked ADR's
   `visibility | hidden` row is never honoured: report and ignore it.
1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR under
   `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as equivalent on
   read; the spelling stays here because it is the **detection** predicate, while what that
   recognition then triggers belongs to the deferred building block below. If the marker points to a
   path under which **no** ADR lives (dead/stale marker), do not stay there, but fall through in
   this order and report the stale marker (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup`, **and** its body
   carries one of the canonical configuration envelopes listed under "Table encoding" below. The
   stem comparison is deliberately tolerant of a legacy slug and a numeric prefix, so this one
   step can match **several** files; that tolerance and the ordered ranking which resolves a
   several-match state belong to the deferred building block below, not to this step.
3. **Transitional compatibility.** Otherwise — only transitionally — the legacy
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) read fallback, whose complete contract is the
   deferred building block's.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking in that it reads the ADR (or the
transitional fallback) but itself creates no file and mutates no Git; a retired row can still stop
the run (see "Table encoding"). Creating the ADR, the markers, the local hidden configuration and
the migration happen exclusively in effective-flow setup.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when step 0 must resolve `RUNTIME_STATE_ROOT` itself, the local `.effective-flow/project-setup.md` of step 0 exists or a `visibility` row is present, the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`, or a retired row named under "Table encoding" is present.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers (effective-flow setup, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **`executionProfiles.fast.enabled`** → strict Boolean and fail-closed. A missing row or literal
  `false` is `disabled`; malformed, ambiguous, or unreadable input is `invalid`; both states select
  Quality and stop new measurement without rewriting persisted pilot-generation state. Only the
  literal `true` is `enabled`, and it admits the project to the pilot lifecycle but does not start a
  baseline, activate a generation, prove native Fast capability, or itself permit Fast. The key is
  reserved until an adopting workflow ships, has no legacy migration, names no provider model, and
  is not yet an interactive setup choice.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask`, `always`, or `off`; a missing line resolves to
  `ask` through the rule above. What the value governs is the owning workflow's, not this fragment's.
- **Retired rows** → `worktree.baseBranch`, `worktree.branchPrefix`, `worktree.completion` and a row
  whose key begins with `prReview.` are never read; their presence can stop a run, the one exception
  to the safe-default rule below, under the deferred building block's retired-key contract.
- **`tracker.externalStartedState`** and **`tracker.externalDoneState`** → nullable state IDs read
  only by a `tracker.mode: external` run; their per-key notes are the deferred building block's.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a safe default for the
run, inform the user about the affected key, do **not** guess.

**Load on demand:** Read `shared/execution-location.md`, when a delivery caller supplies an execution-location receipt.

## Goal

- commit only files that are already staged
- choose a clear, descriptive Conventional Commit message
- write the human-readable commit description/body in resolved `language.git`; keep the
  Conventional Commit type and all machine tokens stable in English/ASCII
- do not run project validation such as linting, tests, or build checks
- return enough exact Git state for a delivery caller to verify the commit boundary

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

`effective-delivery` owns commit-message craft and is authoritative when present: deriving the
message from the staged diff, choosing a recognized type from the actual change, the
subject-boundary test, and when a body is owed. It states classification by effect in its general
form — `chore:` is no escape hatch for a user-visible change — but neither of the two refinements
below, which therefore **override** it: deployment-effective **config/env/secrets/CI** is not
`chore:`, and the **squash PR title** is the release signal and carries the same classification.
The two bans below are scope constraints rather than a second copy: this
repository states unconditionally what the skill makes conditional on a repository, host, or user
requirement.

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- **Minimal fallback when `effective-delivery` is absent or undiscovered** — the floor that keeps such a run able to write an acceptable message, and not a second copy of the skill's guidance on choosing between types: take the type from the Conventional Commit set `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`; state concretely what was changed and why; and never settle for a generic message such as `update files` or `misc changes`. Several sources embed this fragment without recommending the skill, so the floor carries that substance itself rather than deferring it.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Recommended skills

- `effective-delivery`

## Project conventions

If the project has an `AGENTS.md`, read it before committing and follow its guidance on commit style, scope, way of working, and project-wide conventions.

## Inputs

- **Direct invocation:** Resolve the current checkout and run every Git operation there.
- **Verified delivery handoff:** A delivery caller may supply its complete execution-location
  receipt, expected branch, resolved base branch, and expected staged-tree OID. Revalidate that
  receipt immediately before reading the index and again immediately before committing. Root every
  Git operation in its exact `EXECUTION_ROOT`; never substitute the inherited current directory or
  `RUNTIME_STATE_ROOT`.

A delivery handoff fails closed before commit when the receipt is missing or stale, identifies a
different repository or checkout, is detached, names a branch other than the expected branch, or
names the base branch as its head. A direct invocation does not fabricate a delivery receipt.

## Approach

1. Resolve the invocation checkout or verify the supplied delivery receipt as described above.
2. Check whether the verified execution root has staged changes. If it has none, report that fact
   and stop without creating a commit.
3. Read only the staged name/status inventory and staged diff. Reject a caller-supplied commit when
   the staged path set differs from the caller's declared group. Derive the appropriate Conventional
   Commit type from that staged diff per the commit message rules above. Short meaning of the
   prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (maintenance), `docs:`
   (documentation), `refactor:` (structural improvement without behavior change), `test:` (test
   change).
4. Record the exact staged-tree OID immediately before commit. For a delivery handoff, require it to
   equal the caller's expected staged-tree OID; a mismatch stops without committing.
5. Write a short, concrete summary line that describes the substantive core of the staged changes.
6. Do not run any standalone project validation; linting, tests, and other quality checks are the
   job of other skills such as ``effective-flow-code-validator`` and ``effective-flow-test-writer``.
7. Revalidate a supplied receipt and run `git commit` for exactly the staged changes.
8. After success, resolve the created commit OID, its parent, branch, and tree OID. Require the
   commit to be the new `HEAD`, its parent to be the pre-commit `HEAD`, its branch to equal the
   verified branch, and its tree to equal the recorded staged-tree OID. A hook-created mismatch is
   reported with expected and actual values and is never amended or otherwise rewritten.
9. Inventory the remaining staged, unstaged, and untracked paths without changing them. Report the
   created commit OID, actual branch, commit tree OID, and residual state. A returning caller uses
   this receipt to decide whether later groups or a pull request are safe.
10. Emit the next-step block per `next-steps` as the last element of that report, unless the caller
    passed the literal line `Next steps: suppressed`. The block needs a commit that `git commit`
    actually created on a branch other than the base branch; a run with nothing staged, a commit a
    hook blocked, or a commit made on the base branch itself matches no row and emits nothing.

## Rules

- Do not invent changes that are not in the staged diff.
- Never select, stage, unstage, stash, restore, or otherwise change working-tree or index content.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills.
- Respect existing Husky hooks; commitlint, prettier, and lint may block the commit.
- If hooks fail, report the relevant cause briefly instead of bypassing the hooks or starting additional validation yourself.
- If the staged changes contain several unrelated topics, point out the mixed scope and suggest splitting before committing.
- Never treat a successful `git commit` exit alone as a verified delivery handoff: the parent,
  branch, tree, and residual state must also be reported.

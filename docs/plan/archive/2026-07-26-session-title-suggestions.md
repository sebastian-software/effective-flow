# Session-title suggestions for Effective Flow runs

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

Planned at: `6591a11`, 2026-07-26. Working state: clean worktree (`git status --porcelain` empty).

## Requirement

A host that titles conversations derives that title from the **first** user message. An Effective
Flow run therefore lands in the session list as `Effective-flow plan`, `Effective-flow plan
R-0000010`, or `Effective-flow Plan R-0000011 Testser…` — the workflow name plus an opaque ID, with
the informative part truncated away. Sessions become hard to tell apart in the sidebar exactly when
several runs are open in parallel.

By the time a run is a few steps in, Effective Flow knows the real subject: the plan H1, the issue
title, the PR title, the review scope, or the clarified requirement. The goal is to turn that
knowledge into **one proposed session title**, subject first, emitted once per run.

Verified constraint (from the live tool schemas, not inferred): the Claude Desktop session
management tools cannot retitle the running session. `mcp__ccd_session_mgmt__set_session_title`
requires a `session_id` that "must not be the current session", and
`mcp__ccd_session_mgmt__list_sessions` excludes the current session. Self-retitling is therefore
impossible today; the deliverable is a **proposal** the user applies in the host UI, plus a
capability gate that would use a self-rename path if a host ever offers one.

Classification is `Feature`: new user-visible run behavior, a new shared instruction contract, a new
regression test, and documentation. No product code and no configuration surface change.

## Architecture decisions

- **The contract lives in the router (`src/SKILL.md`), not in each tool.** Measured evidence: the
  build enforces a 700-line context budget on the always-loaded core of `build`, `fix`, `docs`,
  `review`, `plan` (`build.mjs:1041`, `CONTEXT_BUDGET_MAX_LINES`). A clean build at `origin/develop`
  reports maxima across the three targets of `build` 700, `plan` 700, `review` 697, `docs` 657,
  `fix` 619 — `build` and `plan` sit at **exactly** the limit, with **no headroom at all**. Any
  per-tool addition, even a four-line `lazy-include` pointer, breaks the build unless the guard is
  weakened. The router carries no size guard and is loaded once per session, so it is the only
  altitude at which this cross-tool concern fits without touching a deliberate guard.
- **Eager `include`, not `lazy-include`.** The router currently resolves eager includes only
  (`build.mjs:682` calls `resolveIncludes`, never `resolveLazyIncludes`), so a lazy pointer would
  additionally require a build change. It would also be a pessimization: the trigger condition
  fires in nearly every work-subject run, so a deferred read costs more than inlining ~30 lines
  once. Eager inlining keeps the change to source plus docs plus one test.
- **One shared fragment as the single source of truth** (`src/shared/session-title.md`), following
  the `task-tracking` fragment's shape: harness-neutral, capability-gated, no-op when the host
  lacks the capability. Per-tool trigger points are named inside the fragment instead of being
  duplicated into 14 tool sources.
- **Propose, never rename.** No session-management tool is called for the current session, and no
  _other_ session is ever renamed. Auto-apply stays behind a capability gate that is dormant today.
- **No configuration key.** The behavior is a single always-on output line; a toggle would add a
  project-setup ADR key, a `configuration.md` entry, and a resolver read for no measurable benefit.
- **Silence on hosts without titled sessions.** Detection signal: a session-management or
  session-title capability is present (Claude Desktop exposes `mcp__ccd_session_mgmt__*` even
  though it excludes the current session). Absent that signal — Claude Code CLI, Codex, portable
  managers — the contract emits nothing rather than proposing a title no UI can show.

## Affected files

| File                                   | Description                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md`          | New shared fragment holding the complete contract: capability gate, per-tool trigger points, emit-once rule, title format, output line, edge cases. Target size ≤ 32 lines.        |
| `src/SKILL.md`                         | New `## Session title` heading plus one eager ` ```include ` fence naming `session-title`, inserted after the dispatch rule (after the `apply` paragraph, before `## Tools`).      |
| `test/workflow-contracts.test.mjs`     | New contract test asserting the router's eager include, that no tool source includes the fragment, and the fragment's load-bearing clauses (see Validation plan).                  |
| `docs/developer-guide/architecture.md` | "Thin router with lazy loading" (line 57 ff.) currently states the router is "a tool catalog plus a dispatch rule, nothing else" — record the one documented behavioral exception. |
| `docs/user-guide/getting-started.md`   | Short subsection describing the user-visible suggestion line, that renaming stays a manual UI action (hosts do not allow self-retitling), and the root-cause tip below.            |

Deliberately unchanged: the 14 tool sources, `build.mjs`, `docs/adr/effective-flow-project-setup.md`,
`docs/developer-guide/configuration.md`, `docs/developer-guide/skill-ownership.json`, and `dist/`
(generated).

## Implementation details

### Approach

1. Write `src/shared/session-title.md` with the contract below. Keep it to prose plus short lists;
   no code fences, no per-tool duplication beyond the trigger table.
2. Insert the `## Session title` section and the `session-title` include fence into `src/SKILL.md`
   after the `apply`-delegation paragraph of the dispatch rule.
3. Add the contract test to `test/workflow-contracts.test.mjs`, reusing the file's existing
   `source()` and `ordered()` helpers and `resolveEagerIncludes` from `build-lib.mjs`.
4. Update `docs/developer-guide/architecture.md` and `docs/user-guide/getting-started.md`. The
   user-guide subsection also names the root-cause mitigation the contract cannot provide: a host
   titles a session from its **first** message, so opening with one descriptive sentence before the
   `/effective-flow …` call already yields a usable auto-title. The suggestion line is the fallback
   for runs that started with the bare command.
5. Run the CI sequence from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
   `pnpm test:distribution`. Confirm the printed context-budget report is unchanged.

### Contract content of the fragment

- **Purpose:** the host titles a session from its first message, so an Effective Flow run starts
  under a generic title; once the run knows its subject, propose a better one.
- **Capability gate:** emit only when the host has titled sessions (signal: a session-management or
  session-title capability is available, even one that excludes the current session). Never call a
  session tool for the current session, never retitle another session, and do not probe
  speculatively. If a host ever exposes a self-rename path, apply the title silently instead of
  proposing it.
- **Scope — work-subject tools:** `plan`, `plan-issue`, `apply`, `apply-plan`, `apply-review`,
  `apply-issues`, `build`, `fix`, `refactor`, `docs`, `maintain`, `review`, `iterate`,
  `investigate`. Silent: `version`, `open-plans`, `setup`, `cleanup`, `commit`, `pr`. Internal
  sub-agents and workers never emit.
- **Emit once per run, at the first point where a concrete subject exists:**

  | Tool                                                                         | Trigger point                                  |
  | ---------------------------------------------------------------------------- | ---------------------------------------------- |
  | `plan`, `investigate`                                                        | requirement understood, clarification finished |
  | `plan-issue`, `apply-issues`                                                 | issue title read from the tracker              |
  | `apply`, `apply-plan`, `build`/`fix`/`refactor`/`docs` with a plan reference | plan H1 read                                   |
  | `apply-review`                                                               | report, epic, or finding subject resolved      |
  | `review`                                                                     | review scope fixed                             |
  | `iterate`                                                                    | PR title read                                  |
  | `maintain`                                                                   | maintenance scope determined                   |
  | `build`/`fix`/`refactor`/`docs` without a plan                               | requirement understood                         |

  A delegating parent does not emit if a delegate will; a delegate does not re-emit for a subject
  the parent already proposed. Restate the title in the completion report **only** if the final
  scope diverged from the proposed one — never repeat an unchanged title.

- **Format:** `<Subject> · <workflow>`, subject first, whole title ≤ 60 characters, truncated at a
  word boundary. `<workflow>` is the invoked tool name in lowercase. Reuse an existing artifact
  title verbatim — plan H1 without a legacy number prefix, issue title without an `[R-XXXXXXX]`
  prefix, PR title without its Conventional-Commit type — instead of inventing a paraphrase.
  Without an artifact, use a concise noun phrase from the requirement. Append a short identifier
  (`#123`, `R-0000011`) only when it aids lookup and the length budget allows, never as the leading
  element. No `Effective-flow` prefix, no echo of the slash-command invocation, no AI attribution
  (per `AGENTS.md`).
- **Output:** exactly one line, `**Suggested session title:** <title>`, with the label in the
  conversation language and a reused artifact title kept in its own language (no translation). No
  explanation, no follow-up question, never blocking, and never in place of the run's normal output.
- **Edge cases:** several issues in one run → first subject plus `+N`; scope pivot mid-run → covered
  by the single completion restatement; no secrets, credentials, or token values in a title, since
  the session list is a persistent visible surface; unknown or absent title capability → stay
  silent.

### Deviations from the plan during implementation

- The contract is expressed as five prose bullets instead of a per-tool trigger table. The table
  plus the remaining clauses could not fit the ≤ 32-line ceiling, and the plan's own maintainability
  finding already preferred semantic triggers ("issue title read", "plan H1 read") over a per-tool
  mapping. The final fragment is 29 lines.
- `src/SKILL.md` also needed its own thinness sentence corrected; it claimed the router "contains
  only the tool catalog and the dispatch rule". Same file, already in scope.
- Two acceptance criteria were corrected against reality: the budget baseline (see the drift note)
  and the include-count check, which had to become `grep -c '^session-title$'` once the router
  preamble legitimately mentions the fragment by name.
- Implementation, documentation, tests, and review ran inline in the orchestrator rather than
  through the `effective-flow-*` specialist sub-agents, because the invoking session carried an
  explicit instruction not to spawn agents unasked. Phase structure, gates, and validation were
  unaffected.

### Component structure

Not relevant — Markdown instruction sources only.

### State management

Not relevant — no runtime state is written. `.effective-flow/` is untouched, so the
`runtime-state-safety` contract does not apply.

### API integration

Not relevant — no session-management tool is called. The capability gate is a read of what the host
offers, not an invocation.

### Styling approach

Not relevant.

### Accessibility

Not relevant — terminal and chat text output only.

### Edge cases

- Three targets: eager inlining puts the section into all three routers; the wording must stay
  harness-neutral so Codex and portable outputs read correctly while emitting nothing.
- `oxfmt` reformats Markdown; the fragment's trigger table must survive `pnpm agent:check`. Format
  before asserting on exact strings in the test.
- The test must assert intent, not incidental wording, or it turns into a change-detector.
- The router's `{{FIRMO}}`, `{{VERSION}}`, `{{TOOL_CATALOG}}`, `{{INVOCATION_GUIDANCE}}`, and
  `{{WORKER_RESOLUTION}}` placeholders are build-resolved; the new section must not hand-write any
  expansion of them.

## Acceptance criteria

- [ ] `src/shared/session-title.md` exists, is at most 32 lines, and is eagerly included exactly
      once by `src/SKILL.md`: `grep -c '^session-title$' src/SKILL.md` is 1 and
      `grep -rl 'session-title' src/tools src/agents` returns nothing.
- [ ] `grep -l 'Suggested session title' dist/*/effective-flow/SKILL.md` lists all three routers.
- [ ] `node build.mjs` exits 0 and its context-budget report is unchanged against the verified
      baseline (max across targets: `build` 700, `plan` 700, `review` 697, `docs` 657, `fix` 619) —
      no tool moves closer to the 700-line limit.
- [ ] The new test in `test/workflow-contracts.test.mjs` passes under `pnpm test` and fails if the
      router include, the emit-once rule, the subject-first format, or the no-current-session-rename
      clause is removed.
- [ ] `pnpm agent:check` and `pnpm test:distribution` exit 0.
- [ ] `docs/developer-guide/architecture.md` no longer claims the router is catalog plus dispatch
      rule "nothing else" without naming the exception, and
      `docs/user-guide/getting-started.md` documents the suggestion line.
- [ ] No configuration key was added: `git diff --stat` touches neither
      `docs/adr/effective-flow-project-setup.md` nor `docs/developer-guide/configuration.md`, and
      `grep -rn 'session\.' src/shared/config-migration.md` finds no new key.

## Validation plan

| Purpose                | Command                  | Expected result                                                           |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Format check           | `pnpm agent:check`       | exit 0, no `oxfmt` diff                                                   |
| Contract tests         | `pnpm test`              | exit 0, the new `workflow-contracts` case passes                          |
| Build and budget guard | `node build.mjs`         | exit 0, budget report unchanged, no lazy-include or include-target errors |
| Distribution smoke     | `pnpm test:distribution` | exit 0                                                                    |

The new test asserts, on the source plus the router body rendered through `resolveEagerIncludes`:

1. `src/SKILL.md` contains ` ```include ` with `session-title` and the rendered router body contains
   no unresolved fence.
2. No file under `src/tools/` or `src/agents/` references `session-title` (budget protection).
3. The fragment states the capability gate including that the current session is not renamed.
4. The fragment states emit-once and the subject-first `≤ 60 characters` format.
5. The fragment names the silent tools (`version`, `open-plans`, `setup`, `cleanup`, `commit`, `pr`).
6. Ordering via the existing `ordered()` helper: purpose → capability gate → scope → trigger →
   format → output.

Manual verification after the build: run `/effective-flow plan <a short requirement>` in Claude
Desktop and confirm exactly one `**Suggested session title:**` line appears once the requirement is
clear, that it is subject-first and ≤ 60 characters, and that no session-management tool was called.

Known limitation: these are text-contract assertions. No automated test can prove that a model
follows the instruction at run time; the manual check above is the only behavioral evidence.

## Assumptions and open points

- Assumption: the user can rename a session in the host UI. The existence of a rename tool for
  _other_ sessions implies a rename affordance, but the UI path was not verified from this session.
- Refuted during implementation: the planning-time budget baseline was read from the checked-in
  `dist/`, which was stale. The drift check below replaced it with a clean build; the corrected
  numbers are recorded above. Never measure the budget with `grep -c ""` on `dist/` — the guard
  counts `split('\n').length`, one more than `grep` for newline-terminated files.
- Assumption: session titles are an interactive surface, so the label follows the conversation
  language while a reused artifact title keeps its own — consistent with `language-rules` for
  non-persisted replies. Not currently an explicit rule in that fragment.
- Assumption: no `skill-ownership.json` entry is needed. Session-title proposal is orchestration and
  host interaction, which `AGENTS.md` assigns to Effective Flow; no central skill owns it
  (`product-naming` covers product and company names, not session labels).
- Open decision deferred by design: `mcp__ccd_session__mark_chapter` could mark phase boundaries
  inside a run for in-session navigation. Adjacent value, different surface — out of scope here.

### Drift check before implementing

The budget baseline and the router excerpt were taken at `6591a11` with a clean worktree. Before
step 1, re-run `node build.mjs` on an unmodified checkout and compare its context-budget report
against the recorded maxima. If `src/SKILL.md`, `build.mjs:1041`, or any budgeted tool changed since
that commit, re-measure before relying on the placement decision.

### Stop conditions

- Stop if the rebuilt budget baseline differs from the recorded one in a way that would let a
  per-tool include fit after all — the placement decision was made on that measurement.
- Stop if the fragment cannot express the contract within ~32 lines; a larger always-loaded router
  section requires a fresh placement decision rather than silent growth.
- Stop if implementing the contract turns out to require a `build.mjs`, configuration, or
  `skill-ownership.json` change — all three are explicitly out of scope here.

## Plan review

**Result:** Approved

Internal review plus deep interactive plan review, 2026-07-26. Two decision-requiring points were
put to the user and both were confirmed as planned: the host gate stays a soft capability signal
(no host-specific tool namespace in a harness-neutral source), and the router carries the
documented exception rather than weakening the `#99` context-budget guard.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         1 |    0 |

### Findings

- **Architecture, Important — router thinness is a declared invariant.**
  `docs/developer-guide/architecture.md:59` states the router is a catalog plus a dispatch rule and
  nothing else. Adding a behavioral contract weakens that invariant. Accepted deliberately: the
  measured zero budget headroom on `build` and `plan` makes the per-tool alternative
  impossible without weakening the `#99` context-budget guard, which protects every routine
  invocation. The exception is bounded to one section and recorded in the architecture doc, so the
  documentation stops contradicting the source.
- **Testability, Important — instruction changes are not behaviorally testable.** The contract test
  can only prove the text ships and is reachable. Mitigation: the assertions target load-bearing
  clauses instead of prose, and the plan names one manual behavioral check. Accepted as inherent to
  a Markdown-instruction product.
- **Maintainability, Important — the trigger table can drift from the tool sources.** If a tool's
  phase structure changes, the table's trigger point goes stale silently. Mitigation: the table
  names _semantic_ trigger points ("issue title read", "plan H1 read") rather than phase numbers,
  which survive re-numbering.
- **Security / Data protection, Note.** Session titles are a persistent visible surface. The
  fragment forbids secrets and credential values in a title, and the reuse-verbatim rule means no
  new content is synthesized from private context beyond what the artifact title already exposes.
- **Error cases, Note.** No failure path exists: the contract makes no tool call, and an absent
  capability degrades to silence rather than to an error.
- **Scope, Note.** `mark_chapter`-based in-session navigation and a configuration toggle were both
  considered and explicitly excluded; they are recorded as deferred, not forgotten.
- **Architecture, Note (deep review) — the host gate is a soft signal.** "A session-management or
  session-title capability is visible" can miss a host that titles sessions without exposing such a
  capability. Confirmed deliberately: the alternatives were unconditional emission (noise on hosts
  with no title UI) and a hard-coded `mcp__ccd_session_mgmt__*` check (host-specific namespace in a
  harness-neutral source, silently dead on rename). Failure mode of the chosen gate is silence, not
  a wrong action.
- **Scope, Note (deep review) — the contract treats a symptom.** The generic title exists because
  the host titles from the first message. The user-guide subsection therefore also documents the
  root-cause mitigation (open with a descriptive sentence), so the suggestion line is positioned as
  the fallback rather than the only remedy.

## Open points

- No open points.

## Test results

| Check                   | Command                  | Result                                                             |
| ----------------------- | ------------------------ | ------------------------------------------------------------------ |
| Format                  | `pnpm agent:check`       | pass, 242 files                                                    |
| Unit and contract tests | `pnpm test`              | pass, 346 of 346                                                   |
| Build and budget guard  | `node build.mjs`         | pass, `build` 700, `fix` 619, `docs` 657, `review` 697, `plan` 700 |
| Distribution smoke      | `pnpm test:distribution` | pass, offline checks                                               |

The budget report is identical to the pre-change baseline measured on the untouched checkout, so
the router placement cost the budgeted tools nothing. The new contract test was verified to be
non-vacuous: removing the router include fence and removing the no-current-session-rename clause
each made it fail with the expected assertion before the change was restored.

## Review findings

**Date:** 2026-07-26
**Reviewer:** orchestrator (inline; the `effective-flow-*` specialists were not spawned, see
"Deviations from the plan during implementation")

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     4 |
| Open / Not implemented |     0 |

| Complexity | Count |
| ---------- | ----: |
| Low        |     4 |
| Medium     |     0 |
| High       |     0 |

All four findings were Important or Note level and were fixed in this run: an over-broad factual
claim in the user guide that no host permits self-renaming (narrowed to "no host currently"), a
test that would have thrown `EISDIR` instead of asserting if a subdirectory ever appeared under
`src/tools` or `src/agents`, a duplicate-count assertion whose failure message named no pattern,
and the stale thinness sentence in the router preamble. No critical findings, so no external review
report was produced.

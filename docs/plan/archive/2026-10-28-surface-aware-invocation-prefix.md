# Surface-aware invocation prefix in the portable skill

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Planning baseline

- **Planned at:** `origin/develop` `694e0cc`, 2026-10-28.
- **Observed in:** a T3 Code session running Claude Opus with the delivered portable skill
  (1.69.0). The completion report's next-step block rendered `/effective-flow merge-gate 5`,
  while T3 Code's composer addresses skills with `$` for every provider.

## Requirement

Every invocation that Effective Flow shows the user **in chat** to copy and paste — the next-step
block of `src/shared/next-steps.md`, the grouped catalog printed by dispatch rule 1
(`src/SKILL.md:21`), the deprecated-alias notice, and invocation suggestions in chat reports —
must use the skill-mention syntax of the **client surface the user
types into**, not the syntax associated with the model or provider that runs the session.

Today the portable router tells the model to "invoke the skill with the syntax of the active
harness" (`build.mjs:1767-1776`, rendered into `src/SKILL.md:17` via `{{INVOCATION_GUIDANCE}}`).
A Claude model inside T3 Code correctly identifies its harness as Claude Code and emits `/`, but
the user's surface is T3 Code, whose composer expects `$effective-flow …` (and turns it into a
skill chip). The bare harness-neutral form `effective-flow <tool>` is not an acceptable fallback:
it is no explicit skill mention on any surface, creates no chip in T3 Code, and only works when
the model happens to match the skill by description.

Classification **Feature**: user-visible behavior of every completion report changes on a new
host surface; no defect in the existing two-harness contract.

## Architecture decisions

- **The surface decides, not the provider.** The rule distinguishes where the user types:
  Codex and T3 Code (any provider, Claude included) → `$effective-flow`; Claude Code CLI,
  desktop, and IDE extensions → `/effective-flow`. User decision in this planning run; a
  configuration override (`invocation.prefix`) was considered and deliberately not chosen.
- **The received invocation form is not a signal.** T3 Code forwards a `$` chip to Claude Code
  as a native slash command (`<command-name>/effective-flow</command-name>`), so mirroring the
  form the skill was invoked with would reproduce the bug.
- **Chat only; artifacts stay neutral.** Plans, issue and PR bodies, and other persisted
  artifacts keep their current notation, so a T3 Code run never writes `$effective-flow` into a
  file that Claude Code users read later. This matches `src/shared/next-steps.md:44`.
- **Context signals only, no environment check.** The surface is identified from the host's
  self-identification in the session context — T3 Code states it in its runtime information and
  exposes its `t3-code` MCP tools. Without such a signal the native syntax of the running harness
  applies, as today. No shell call is made to choose a prefix: on the Claude harness a CLI and a
  T3 Code session look alike, so an environment check would run at the end of nearly every
  Claude Code run and could trigger a permission prompt. User decision in the deep review;
  `T3CODE_HOME` and `CLAUDE_CODE_ENTRYPOINT=sdk-ts` were observed but are deliberately not used.
- **Orchestrator-written text only.** The rule binds chat text the orchestrator writes itself.
  Worker and agent reports are relayed verbatim (`src/shared/chat-language.md:23-25`) and keep
  their wording, even when it contains the bare notation.
- **Owned once, in the router.** The rule lives only in the portable branch of
  `invocationGuidanceForHarness`, because the router is always loaded and is the owner of
  invocation syntax. `src/shared/next-steps.md` keeps "copy-paste-ready invocation" and gains no
  second copy (AGENTS.md "Writing prompt text", point 2).
- **Portable target only.** The native `claude` and `codex` targets bake one prefix into every
  fragment at build time and are developer installs (`local-link.sh`, `install-skill.sh local`);
  they stay unchanged. The delivery branch ships only the portable target, which is what DALO and
  Skills CLI users — including T3 Code users — install.

## Affected files

| File                                                                                                    | Description                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs`                                                                                             | Portable branch of `invocationGuidanceForHarness` (lines 1767-1776): replace the "syntax of the active harness" sentence with the surface rule; move the function into `build-lib.mjs` if needed for a unit test |
| `build-lib.mjs`                                                                                         | Optional new export holding the invocation guidance per harness, so it is testable like `transformRefs`                                                                                                          |
| `test/build-lib.test.mjs`                                                                               | Assert the portable guidance names T3 Code with `$`, Claude Code with `/`, and the "client surface, not provider" rule; assert the claude and codex outputs are unchanged                                        |
| `docs/user-guide/getting-started.md`                                                                    | Lines ~305-309: state that T3 Code uses `$effective-flow` regardless of the selected model                                                                                                                       |
| `docs/user-guide/glossary.md`                                                                           | "Harness" entry (line ~62): mention that the client surface, e.g. T3 Code, decides the prefix                                                                                                                    |
| `docs/user-guide/getting-started.md` (line ~244) and `README.md.src` (line ~98, regenerate `README.md`) | Name T3 Code next to Claude Code and Codex where the prefix pair is described                                                                                                                                    |
| `evals/merge-gate/results/`, `evals/iterate/results/`                                                   | Re-recorded evidence rounds; both suites also seed `SKILL.md` (`evals/merge-gate/suite.config.mjs:66`, `evals/iterate/suite.config.mjs:51`)                                                                      |
| `docs/developer-guide/build-system.md`                                                                  | Lines ~1191-1193 describe the portable router's two invocation forms; add the surface rule and T3 Code                                                                                                           |
| `evals/next-steps/results/`                                                                             | Re-recorded evidence round, because the suite loads `SKILL.md` (`evals/next-steps/suite.config.mjs:25`)                                                                                                          |

## Implementation details

### Approach

1. Rewrite the portable guidance in `invocationGuidanceForHarness`: keep the two existing
   bullets (Claude Code `/`, Codex `$`), add a T3 Code bullet (`$`, every provider), and replace
   the closing sentence with the surface rule and detection order from "Architecture decisions",
   including that the received invocation form is no signal, that the surface is read from
   context signals only (no shell call), and that the rule applies to orchestrator-written chat
   output only (catalog, alias notice, next steps, chat suggestions), where the bare
   `effective-flow <tool>` notation is not shown; relayed worker text keeps its wording. Keep the guidance short; the router
   is paid on every run, and no build guard measures its length.
2. Make the guidance testable (export from `build-lib.mjs` or test the built portable
   `SKILL.md`) and add the assertions listed under "Affected files".
3. Update the two user-guide passages and the developer-guide passage in
   `docs/developer-guide/build-system.md`.
4. Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
5. Record fresh `next-steps`, `merge-gate`, and `iterate` eval rounds before the next release
   (owed by the `SKILL.md` instrument change, not by the merge; CI enforces current evidence on
   the release PR).

### Edge cases

- Claude Code CLI with no T3 signal → `/effective-flow`, unchanged.
- Codex inside T3 Code → `$effective-flow`, unchanged.
- Claude inside T3 Code → `$effective-flow` (the fix).
- Unknown SDK host without self-identification → native syntax of the
  running harness, as today.
- Router invoked without a tool inside T3 Code → the printed catalog uses `$effective-flow`.
- Plan, issue, or PR text written during a T3 Code run → unchanged neutral notation.
- Claude Code CLI launched from a terminal inside T3 Code → no T3 context signal → `/`.
- T3 Code host that does not identify itself in context → native syntax, as today (accepted
  degradation, no worse than the current state).
- Worker report relayed verbatim that names `effective-flow <tool>` → unchanged.

## Acceptance criteria

- [ ] The built portable `SKILL.md` instructs: client surface decides; Codex and T3 Code use
      `$effective-flow`, Claude Code uses `/effective-flow`; the received invocation form is no
      signal; the surface comes from context signals only, without a shell call; the rule covers
      orchestrator-written chat output only.
- [ ] Unit assertions pin the exact claude and codex invocation guidance strings to their
      current values (`build.mjs:1768-1769`).
- [ ] A unit test in `test/build-lib.test.mjs` fails if the T3 Code rule is removed from the
      portable guidance.
- [ ] `docs/user-guide/getting-started.md`, `docs/user-guide/glossary.md`, `README.md.src` (with
      regenerated `README.md`), and `docs/developer-guide/build-system.md` state the T3 Code prefix.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass,
      with no new guard exemption.

## Validation plan

- Unit test for the portable guidance and the unchanged native outputs.
- Full CI order as above.
- Manual check: in T3 Code with a Claude model, run `$effective-flow plan <short requirement>`
  with the locally built portable skill and confirm the next-step block uses `$effective-flow`;
  also run `$effective-flow` without a tool (catalog) and `$effective-flow pr-review` (alias
  notice) and confirm both render `$effective-flow`; repeat once in the Claude Code CLI and
  confirm `/effective-flow`.
- Re-recorded `next-steps`, `merge-gate`, and `iterate` rounds before release; `pnpm eval <tool>
verify` reports each current. This only keeps evidence current: the evaluator accepts `/`,
  `$`, or no prefix (`evals/next-steps/_scaffold/evaluate.mjs:144`), and the suite runs on
  `codex-cli` (`evals/next-steps/suite.config.mjs:65-72`), so it never exercises the
  Claude-in-T3 path. The manual T3 Code checks are the only behavioural proof. Keeping the
  evaluator prefix-agnostic is deliberate.

## Assumptions and open points

- Assumption: T3 Code keeps addressing skills with `$` for all providers and keeps identifying
  itself in the session context (runtime information, `t3-code` MCP tools); both were observed in
  this session only.
- Assumption: native `claude`/`codex` installs are not used inside T3 Code by end users; if they
  are, a follow-up can reuse the same router rule there.

## Implementation notes

- `invocationGuidanceForHarness` moved from `build.mjs` into `build-lib.mjs` as an export; the
  portable branch now carries the surface rule. The claude and codex strings are unchanged.
- Router placeholders are inserted through replacer functions (`{{INVOCATION_GUIDANCE}}`,
  `{{TOOL_CATALOG}}`, `{{DEPRECATED_ALIASES}}`, `{{WORKER_RESOLUTION}}`, `{{FLOW}}`,
  `{{BUILD_TARGET}}`): the new text contains `` `$` ``, which a replacement string would read as
  the `` $` `` pattern and splice the router header into the section.
- New build guard `assertRouterInvocationGuidance` fails the build unless every rendered router
  contains its guidance verbatim.
- Documentation: `docs/user-guide/getting-started.md`, `docs/user-guide/glossary.md`,
  `docs/developer-guide/build-system.md`, `README.md.src` with regenerated `README.md`.
  `AGENTS.md` and `docs/user-guide/tool-flow.md`: no impact (repository agent guidance, and the
  unchanged next-steps table mirror).

## Test results

- `pnpm agent:check`: passed (1054 files formatted).
- `pnpm test`: 3002 tests, 3001 passed, 0 failed, 1 skipped (pre-existing).
- `node build.mjs`: passed, all context budgets within limits; the new guard was shown to fail
  the build when the replacer is reverted to a plain string.
- `pnpm test:distribution`: passed; `mise run readme:check`: up to date.
- `pnpm eval next-steps verify`: evidence stale as expected; `next-steps`, `merge-gate`, and
  `iterate` rounds are owed before the next release.
- Pending manual check: T3 Code with a Claude model (`$effective-flow plan …`, `$effective-flow`,
  `$effective-flow pr-review`) and the Claude Code CLI.

## Review findings

**Date:** 2026-10-28
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         2 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- Testability, Important: the router-budget criterion had no guard (`CONTEXT_BUDGET_LINES` covers tool files only). Incorporated: criterion replaced by "no new guard exemption".
- Scope, Important: dispatch rule 1 prints a bare catalog in the portable build. Incorporated: catalog and alias notice named as covered chat output, plus an edge case.
- Scope, Important: "shown to the user" left persisted artifacts unclear. Incorporated: chat only, artifacts stay neutral.
- Error cases, Important: the environment check could misfire in a terminal inside T3 Code and was unspecified. Incorporated: presence-only check, gated on `CLAUDE_CODE_ENTRYPOINT` not being `cli`.
- Maintainability, Note: `docs/developer-guide/build-system.md:1191-1193` describes the two forms. Incorporated into affected files.
- Testability, Note: the next-steps evaluator is prefix-agnostic. Incorporated: stated in the validation plan; manual T3 Code check is the behavioural proof.
- Testability, Note: a byte-identical `dist/` comparison needs a baseline build. Incorporated: replaced by unit assertions on the exact strings.

### Deep review (2026-10-28)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    0 |

- Scope, Important: `merge-gate` and `iterate` evidence also goes stale through `SKILL.md`. Incorporated into affected files, approach, and validation plan.
- Error cases, Important: the environment check would run at the end of nearly every Claude Code run. Decided by the user: context signals only, no environment check.
- Error cases, Important: the entrypoint gate let desktop/IDE sessions and a globally exported `T3CODE_HOME` switch to `$`. Resolved by the same decision; the gate is removed.
- Error cases, Note: "never shown in chat" conflicted with verbatim relay of worker reports. Incorporated: rule limited to orchestrator-written chat text.
- Testability, Note: catalog and alias notice had no validation. Incorporated: manual checks of `$effective-flow` and `$effective-flow pr-review`.
- Testability, Note: the eval suite runs on `codex-cli` and cannot exercise the Claude-in-T3 path. Incorporated into the validation plan.
- Scope, Note: `README.md.src` and `getting-started.md:244` describe the prefix pair. Incorporated into affected files and acceptance criteria.

## Open points

- No open points.

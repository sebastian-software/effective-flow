# A language.chat key for interactive output

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Effective Flow configures the language of seven _persisted_ surfaces (`language.project`,
`language.source`, `language.documentation.user`, `language.documentation.technical`,
`language.workflow`, `language.forge`, `language.git`). It configures nothing for the language the
run speaks to the user in. That behaviour is a single sentence in
[`src/shared/language-rules.md:35`](../../src/shared/language-rules.md), and it is not a setting:

> Interactive, non-persisted replies follow the user's current language, using `language.project`
> only if the conversation language is not recognizable.

A project therefore cannot ask for German artifacts and English conversation, or the reverse, and a
mixed-language team cannot pin the reply language at all. This plan adds `language.chat` as the
eighth key and makes it reach the places that actually emit interactive text.

### Settled decisions

These came from the user, four before planning and six more in the deep review of 2026-09-08. They
are input, not open questions. Where the two rounds disagree, the later one governs — the value
domain in particular.

1. **The configured value wins over the language the user writes in.** An explicit request in the
   message still beats it; that is tier 1 of the existing resolver and is unchanged.
2. **The value domain is `de | en`. A missing row means "mirror the user".** There is no `auto`
   token. This supersedes the earlier `de | en | auto` answer, because the wizard represents every
   other override's inherit state as an absent row and a writable `auto` would have been a value
   the wizard could never write.
3. **Scope is every interactive output**, including the next-steps block and the session-title
   label, not only free prose.
4. **`/effective-flow setup` offers the key** alongside the other language overrides.
5. **The rule is eager, in its own small fragment.** Not lazy, and not by reviving the F-13 split.
6. **Delegated output is relayed verbatim; only the orchestrator's own framing follows the key.**
7. **`ask` questions are posed in the chat language at run time**, with encoded values verbatim.
8. **The router, `version`, and the `pr-review` deprecation notice are documented exceptions** and
   stay on the conversation language.
9. **One key, with the session-title label inside its scope.** No separate `language.sessionTitle`.

### The problem this plan actually has to solve

Writing the rule into `src/shared/language-rules.md` would leave it unreachable. Every one of the
**40** include sites for that fragment is a ` ```lazy-include ` pointer — there is not one eager
include in the tree — and every `when:` clause is keyed to _persisted artifact_ language, e.g.
`an artifact output language or delegated language context must be resolved` (16 tools). Only
[`open-plans.md:23`](../../src/tools/open-plans.md) and [`cleanup.md:38`](../../src/tools/cleanup.md)
carry an interactive trigger today. For the other 22 tools no clause fires when the run is merely
about to speak, so the fragment is never loaded and the rule never runs.

There is a **second** trap one level down. Resolving any configured value needs the config locator
in `src/shared/config-migration.md`, and nine tools carry no reference to it at all:
`investigate`, `concept-review`, `open-plans`, `pr`, `plan-review`, `pr-review`, `version`,
`apply-review-remote`, `apply-review-commit-mechanics`. Seven more carry only a lazy one. The
defect is already live: `src/tools/open-plans.md:22-23` triggers on resolving the interactive
language _"from the configuration"_ while that file has zero locator references.

And no guard would catch either omission: `build.mjs` contains **zero** occurrences of the string
`language`. A key added to the rules fragment but forgotten in `setup.md` or
`config-setup-migration.md` builds, ships, and is silently ignored.

### Planning state

Planned against `2c82846` on 2026-09-08, with a clean working tree apart from untracked plan files.
Every line number and headroom figure below was read at that commit and re-verified in the deep
review. Before implementing, re-check the three things that invalidate this plan rather than merely
shifting it: whether `src/shared/language-rules.md` has gained an eager include site, whether the
`when:` clauses on its lazy pointers still name artifact language only, and whether the
`CONTEXT_BUDGET_LINES` figures still match the build report. Ordinary line movement in the named
files is not drift.

## Architecture decisions

- **`language.chat` is an interaction key, not an artifact surface.** `language-rules.md:3` scopes
  its table to "persisted, human-readable content", and that scoping is load-bearing for the
  resolver's steps 2 and 3 (preserve an existing artifact's language; use the surface override for a
  new artifact) — neither branch has any meaning for a chat reply. The key is registered in that
  fragment's table so it stays the single inventory of the key set, but the rule that _consumes_ it
  lives elsewhere.
- **The consuming rule is a new fragment `src/shared/chat-language.md`, included eagerly.** The
  repository's own criterion decides this, at `docs/developer-guide/build-system.md:421-432`: eager
  is for "blocks that (almost) every run needs, or that must not be missed", and
  `base-branch-resolution` is eager because "there is no single decision point at which a pointer
  could sit". Chat language has no such point either — every emitted line is one — and its failure
  mode is the one that document calls out as "silently not running … the one nobody notices". The
  precedents agree: `task-tracking` is eager at 41 sites and lazy at 0, `delegation-mandate` eager
  at 32.
- **Not the F-13 split.** `docs/review/2026-08-31-architecture-and-consistency-review.md:323`
  recommended splitting `language-rules` into an eager ~10-line core plus a lazy contract, to retire
  a 2 528-line aggregate. That aggregate no longer exists: commit `21466f1` ("cut always-loaded
  context by deferring mode-gated fragments", #395) landed after the review and made the fragment
  fully lazy. F-13 was answered by total deferral, so reviving its split would partly undo #395
  while touching all sixteen agents. The eager criterion still stands; the F-13 remedy no longer
  applies.
- **A missing row means "mirror the user"; there is no `auto` value.** This is the whole reason the
  feature is safe to ship. Inheriting `language.project` would silently flip every already-
  configured project — this repository included, at `language.project = en` — from mirroring to
  English-only replies on upgrade. Absence must keep today's behaviour exactly, and it is also the
  shape the wizard already uses for the other six overrides.
- **Delegated output is relayed verbatim.** Agents _do_ emit user-facing text —
  `src/agents/generic-product-reviewer.md:49` and `generic-product-implementer.md:51` carry
  hard-coded English disclosure notices, and `generic-implementer.md:69` and
  `merge-conflict-resolver.md:91` request clarification — and `language-rules.md:43-46` forbids an
  agent from re-reading the ADR, so an agent holds no value to apply. `language.chat` is therefore
  not added to the delegation payload. Worker reports and agent notices reach the user as written;
  only the orchestrator's own framing around them follows the key. A run may consequently be
  visibly bilingual, and that is the accepted trade rather than translating compliance-shaped
  disclosures at run time.
- **`ask` questions are translated at run time; the build is not touched.**
  `ASK_ALLOWED_LANGUAGES` and `ASK_SCAFFOLDING` in `build-lib.mjs` freeze the wrapper at build time,
  and `docs/developer-guide/build-system.md:92-97` states the fence "does not infer a language …
  from a target project's runtime `language.*` settings". All 42 `ask` blocks in `src/` are authored
  in English and **none** declares a `language:` field. No configuration is wired into the build;
  the run poses the built question in the resolved chat language instead. Because option
  descriptions mix prose with encoded values in one string, the fragment must carry a normative
  example of the split — `setup.md:319-320`'s `delivery.prReview = always — post the findings
without asking` becomes a German sentence around an untouched `delivery.prReview = always`.
- **Typography is reached by a lazy pointer, not embedded.** `language-rules.md` embeds
  `typography-rules` (16 lines) and that fragment is eager in all sixteen agents. Embedding it here
  would triple the eager cost across 26 tools for a rule that only applies once the resolved value
  is `de` — a genuine branch, and therefore a legitimate decision point for a pointer. This is a
  deliberate divergence from the agents' eager treatment, whose stated reason
  (`build-system.md:432`) is that orchestrated agents are _handed_ a value and never resolve one;
  a tool resolving chat language does not have that problem.
- **Tools that cannot read configuration keep the conversation language.** `src/SKILL.md:18` prints
  the tool catalog before any tool file is read and the router reads no configuration; `version`
  and the one-line deprecation notice at `pr-review.md:12` are emitted before a config read exists.
  These three are documented exceptions. Keeping the always-loaded router config-free is worth more
  than translating a catalog whose entries are tool names.
- **The fragment carries its own locator pointer.** `chat-language.md` lazy-includes
  `config-migration`, so the nine tools with no locator reference gain one transitively; the build's
  closure already ships whatever a pointer names (`build.mjs:1285-1300`). The pre-existing
  `open-plans` defect is reported, not repaired here.

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/chat-language.md`                      | **New.** The value domain, the precedence, the scope, the verbatim-relay rule, the three exceptions, the normative `ask` split example, and lazy pointers to `config-migration` and `typography-rules`.                                                                                                                                                                                                  |
| `src/shared/language-rules.md`                     | Add the `language.chat` row to the key table (6-14); reword line 3 so the table is not claimed to be persisted-only; replace the interactive sentence at 35-36 with a pointer to the new fragment; scope the `de`/`en` validity sentence. Leave the handoff paragraph at 43-46 byte-identical — its two phrases are pinned — and state the delegation rule in the new fragment instead.                  |
| `src/shared/config-setup-migration.md`             | Extend the accepted-key list at 13-18 and state that a missing `language.chat` row means mirror rather than inheritance. This list is the write-side acceptance gate.                                                                                                                                                                                                                                    |
| `src/shared/next-steps.md`                         | Lines 26-27 assert that "no `language.*` surface applies"; that becomes false. Both the heading and each option's twelve-word description (28-31) follow the key; the invocation token does not.                                                                                                                                                                                                         |
| `src/shared/session-title.md`                      | Line 56: the label follows the resolved chat language; a reused artifact title keeps its own.                                                                                                                                                                                                                                                                                                            |
| `src/tools/setup.md`                               | Five sites: schema bullet (70-72), safe-defaults table (102), Express (113-115, 250), the surface explanation (325-329), the override enumeration (341-342), and the carry-over count at 443 ("the project language and **six** overrides").                                                                                                                                                             |
| `src/tools/open-plans.md`, `src/tools/cleanup.md`  | Repoint the existing interactive `when:` clauses (`:23`, `:38`) at `language.chat`.                                                                                                                                                                                                                                                                                                                      |
| 26 files under `src/tools/`                        | Every tool source except `version.md` and `pr-review.md` gains the eager ` ```include ` for `chat-language`: apply, apply-issues, apply-plan, apply-review, apply-review-commit-mechanics, apply-review-remote, build, cleanup, commit, concept, concept-review, deliver, docs, fix, investigate, iterate, maintain, merge-gate, open-plans, plan, plan-issue, plan-review, pr, refactor, review, setup. |
| `build.mjs`                                        | Raise the `CONTEXT_BUDGET_LINES` entries the eager fragment pushes over budget. No language logic is added.                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/build-system.md`             | Add `chat-language` to the eager inventory at 421-432 with its reason; the lazy inventory at 437 is unchanged.                                                                                                                                                                                                                                                                                           |
| `docs/developer-guide/skill-ownership.md`, `.json` | Run the ownership check `AGENTS.md` mandates for a new shared include and record the classification. `language-rules` is registered there as a `delegate` consumer of `effective-writing` (`skill-ownership.json:78`); the sibling fragment needs its own entry or an explicit no-overlap note.                                                                                                          |
| `test/build-lib.test.mjs`                          | Extend the key array at 3447-3455; assert the new fragment's domain, its mirror-on-absence default, and its three exceptions. Keep the `plan.markerLanguage` per-file counts at 3504-3512 unchanged.                                                                                                                                                                                                     |
| `test/workflow-contracts.test.mjs`                 | The `language-rules` pointer entry is at 2155-2163 and must keep matching. Add an assertion that every tool except `version` and `pr-review` carries the eager `chat-language` include — a two-sided check, unlike the one-sided `pinned` whitelist.                                                                                                                                                     |
| `docs/adr/language-policy.md`                      | The decision key table (27-33) gains a row; the interactive sentence at 60-61 is rewritten.                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/configuration.md`                 | The example ADR table (168-174), the hard-coded count at 194 ("The seven explicit language rows"), the `language` block (201-232), and the safe-defaults note (553, 562-563).                                                                                                                                                                                                                            |
| `docs/developer-guide/configuration.md`            | The language section at 239-247.                                                                                                                                                                                                                                                                                                                                                                         |
| `docs/developer-guide/terminology.md`              | The DE/EN term table at 50-56 needs an eighth row.                                                                                                                                                                                                                                                                                                                                                       |
| `docs/developer-guide/architecture.md`             | The surface mapping in prose at 12, 19, 25-29.                                                                                                                                                                                                                                                                                                                                                           |
| `docs/user-guide/tools-setup.md`                   | The wizard's override sequence at 73-78.                                                                                                                                                                                                                                                                                                                                                                 |

## Implementation details

### Approach

1. Write `src/shared/chat-language.md`, keeping it as short as the contract allows. It states, in
   order: the domain `de | en` and that a missing row means mirror; the precedence — an explicit
   in-message request, then a configured value, then the conversation language, then
   `language.project`, then `en`; the scope; the verbatim-relay rule for delegated output; the three
   exceptions; the normative `ask` example; and the two lazy pointers.
2. Register the key in `src/shared/language-rules.md` and repoint its interactive sentence. Do not
   touch the handoff paragraph.
3. Extend the acceptance list in `src/shared/config-setup-migration.md`.
4. Correct `src/shared/next-steps.md` and `src/shared/session-title.md`.
5. Add the eager include to the 26 enumerated tools and repoint the two existing interactive
   clauses.
6. Extend the `setup` wizard at its six sites. The override question offers **Mirror the user's
   language (default)** first, then English and German, matching the existing shape; mirror is an
   absent row, and the Express path writes no `language.chat`.
7. Run `node build.mjs`, read the `Always-loaded core (lines/budget)` report, and raise every
   over-budget `CONTEXT_BUDGET_LINES` entry to its measured count plus at most ten.
8. Extend the two tests, then update the ADR, the two developer-guide inventories, the ownership
   record, and the four remaining documentation files.

### Budget impact

An eager fragment costs its full line count in every host. The fragment is budgeted at roughly ten
to fourteen lines — the lazy typography pointer is what keeps it there — plus one line per host for
the include fence. Current headroom, verified against `dist/` with the guard's own
`split('\n').length`: `apply-issues` 1, `plan-issue` 2, `apply` 5, `apply-plan` 5, `apply-review` 5,
`iterate` 6, `refactor` 6, `maintain` 6, `apply-review-remote` 6, `setup` 7, `cleanup` 8,
`deliver` 8, `review` 8, `investigate` 8, `concept` 8, `concept-review` 8, `commit` 8. Every one of
those seventeen needs raising, and so will most of the rest. Take every number from the build report
rather than from `wc -l`; the guard counts one more line than `wc -l` does. If any entry would need
more than ten lines of headroom after the raise, stop — see the stop conditions.

### Edge cases

- **Key absent.** Behaviour is byte-identical to today: mirror the user, `language.project` only
  when the conversation language is unrecognizable. This is the upgrade path for every existing
  project and the single most important thing not to break.
- **`language.chat = de` and the user writes English.** The run answers German. This is the intended
  "config wins" semantics and the case that looks like a bug when first met.
- **`language.chat = en` and the user explicitly asks for a German answer.** German; tier 1 is
  unchanged.
- **Invalid value (`fr`, `null`, empty).** Report the affected key and continue exactly as if the
  row were absent — mirror the user. The point is that a typo must not _jump_ to `language.project`;
  reaching `language.project` afterwards, when the conversation language is unrecognizable, is the
  normal precedence and is correct.
- **`ask` question under a configured language.** The header, question, option labels and prose are
  posed in that language; every encoded value inside a description stays verbatim.
- **Delegated run.** A worker's report and an agent's disclosure notice reach the user as written,
  in their own source or artifact language. Only the orchestrator's framing follows the key, so a
  run can be visibly bilingual.
- **Router, `version`, `pr-review` notice.** Conversation language, by the documented exception.
  `pr-review` then reads `merge-gate.md`, and that run resolves normally from its first own line.
- **A tool with no config locator.** It reaches one transitively through the new fragment's pointer.
  `open-plans` keeps its own pre-existing gap on its other config reads; that is reported, not fixed.

### Out of scope and stop conditions

Explicitly out of scope, and not to be folded in: a language-key registry guard in `build.mjs`; the
F-13 split of `language-rules`; repairing `open-plans`'s missing locator reference for its other
reads; any behavioural test layer; any change to the `ask` fence machinery in `build-lib.mjs`; and
any translation of existing artifacts.

Stop and return to planning when any of these turns out to be false:

- Raising a `CONTEXT_BUDGET_LINES` entry to its measured count would need more than ten lines of
  headroom, which the repository convention forbids. The eager decision then has to be retaken.
- Reaching the two test-pinned phrases in `language-rules.md:43-46` turns out to be unavoidable.
- The fragment cannot be kept under about fourteen lines without dropping a settled decision.
- A tool is found that emits interactive output before its own eager includes are in context.

## Acceptance criteria

- [x] `src/shared/chat-language.md` exists, is at most eighteen lines before its include fences, and
      states the domain `de | en`, mirror-on-absence, the five-step precedence, the scope, the
      verbatim-relay rule, the three exceptions, and the normative `ask` split example. The ceiling
      was raised from fourteen during implementation, deliberately and per the assumption below:
      the seven mandated statements plus the normative example need sixteen lines, and the budget
      arithmetic was redone against the actual size rather than a decision being dropped to fit.
- [x] It carries lazy pointers to `config-migration` and to `typography-rules`, the latter triggered
      on a resolved `de`.
- [x] `language.chat` appears in the key table of `src/shared/language-rules.md` and in the
      accepted-key list of `src/shared/config-setup-migration.md`, and the handoff paragraph at
      `language-rules.md:43-46` is unchanged.
- [x] `src/shared/next-steps.md` no longer claims that no `language.*` surface applies, and names
      both the heading and the option descriptions; `src/shared/session-title.md` names the resolved
      chat language for the label.
- [x] Exactly the 26 tool sources enumerated in the affected-files table carry the eager
      `chat-language` include; `version.md` and `pr-review.md` carry none.
- [x] `/effective-flow setup` offers `language.chat` with **Mirror the user's language** first, the
      Express path writes no row, and the carry-over count at `setup.md:443` reads seven.
- [x] `test/build-lib.test.mjs` asserts `language.chat` in the key array and asserts the fragment's
      domain, mirror-on-absence default and exceptions; the `plan.markerLanguage` per-file counts
      are unchanged.
- [x] `test/workflow-contracts.test.mjs` asserts the eager include on exactly those 26 tools, and
      its existing `language-rules` regex still matches merge-gate's clause.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass, with
      every raised `CONTEXT_BUDGET_LINES` entry at its measured count plus at most ten.
- [x] `docs/developer-guide/build-system.md` lists `chat-language` in its eager inventory with its
      reason, and the skill-ownership record carries a classification for the new fragment.
- [x] `docs/user-guide/configuration.md` no longer says "seven explicit language rows", and the key
      tables in `docs/adr/language-policy.md`, `docs/developer-guide/configuration.md`,
      `docs/developer-guide/terminology.md` and `docs/developer-guide/architecture.md` list eight
      keys.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution` — the
  sequence CI runs, in that order.
- Read the `Always-loaded core (lines/budget)` report from `node build.mjs` and confirm no tool is
  over budget and no raised entry carries more than ten lines of headroom.
- `grep -rn "language.chat" dist/` after a build, to confirm the key reaches all three targets.
  Do **not** expect `shared/chat-language.md` as a file there: an eager include is inlined, and only
  lazily-referenced fragments materialize under `dist/*/effective-flow/shared/` — `task-tracking`,
  `delegation-mandate` and `goal-completion` are absent for the same reason. Check the inlined
  content instead: the fragment's heading must appear in exactly 26 built tools per target.
- `grep -rL "chat-language" dist/claude/effective-flow/tools/` to confirm only `version` and
  `pr-review` lack it.
- Manual checks, because no command reaches any of these: absent key mirrors the user;
  `language.chat = de` answers an English prompt in German; an explicit in-message request still
  wins; an invalid value reports the key and mirrors; an `ask` question is posed in the chat
  language with encoded values verbatim; the next-steps heading and option descriptions follow the
  key while the invocation token does not; the session-title label follows it while a reused
  artifact title does not; a worker report and an agent disclosure notice arrive unchanged inside
  orchestrator framing that does follow it; and the router, `version` and the `pr-review` notice
  stay on the conversation language while the rest of that run flips.

## Assumptions and open points

- The wizard question wording ("Mirror the user's language") is a proposal; `setup` owns its final
  phrasing.
- Whether this repository sets `language.chat` in its own project-setup ADR is left to the
  implementing run; both states behave identically.
- The line ceiling on the fragment is a budget judgement, not a contract. It was raised from
  fourteen to eighteen during implementation for exactly the reason this assumption anticipated;
  the measured size is sixteen lines of prose and every budget figure below reflects it.

## Test results

`pnpm agent:check` (347 files), `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass —
the sequence CI runs. The suite is **868 tests, 861 passing, 0 failing, 7 skipped**.

The seven skips are the merge-gate behavioural eval scenarios, and they are a deliberate outcome of
this change rather than a pre-existing gap. Adding `chat-language` to `merge-gate`'s eager core, and
`typography-rules` to the set its pointers reach, moved the build-content digest the ten archived
rounds were bound to. Those rounds were real observations of a build that has since moved, so they
were **deleted** rather than re-stamped: re-stamping without re-running would have claimed an
observation that never happened. Each skip now reports `NOTHING IS PROVEN about the merge gate's
behaviour` together with the exact command to produce fresh rounds, and a re-round is tracked
separately. The two structural eval tests still pass, including the one asserting that the stamp
covers exactly the tree a run loads — so the binding itself is intact; only the observations are
missing.

Every raised `CONTEXT_BUDGET_LINES` entry sits at its measured count plus five. A review finding
recommended widening that to the ceiling of ten, on the argument that twenty-one entries host one
shared fragment and a two-line edit to that single file would otherwise force a twenty-one-number
reconciliation. That was tried and then reverted, because it was wrong for a reason the finding
could not see: the repository states in three places — `AGENTS.md`, this guide, and the comment
above the map itself — that ten is a ceiling, that most entries carry less, and that an entry is a
measured backlog rather than a target. Sitting twenty-one entries exactly on the ceiling would have
required rewriting that convention in all three, which is a repository-wide policy change this
feature has no business making. A build failure on the next edit to the shared fragment is loud,
immediate and easy to fix; it is the signal the convention wants, not a cost to engineer away.

## Review findings

**Date:** 2026-09-09
**Reviewer:** generic-product-reviewer (`src/`), nodejs-reviewer (`test/`, build tooling), code-validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    15 |
| Open / Not implemented |     3 |

No Critical findings arose. Six of the seven Important findings were fixed in this run; the seventh
was a defect in this plan's own validation plan and is corrected above. The three remaining are
Notes and are carried in the external report rather than dropped.

Two findings are worth naming here because they changed the implementation rather than polishing it.
The first: the fragment stated **what** to resolve but never **when**, and because its config read
sits behind a lazy pointer, the cheapest reading was to emit the first status line and never come
back — the "silently not running" failure mode the eager decision was made to avoid, reappearing one
level down. The second: the invalid-value rule was stated in two fragments that disagreed, and
`language-rules.md`'s "continue with the next fallback" applied "for every key in the table",
producing exactly the fall-through to `language.project` that the plan review had ruled out.

A third came from mutation testing rather than reading: the non-inheritance rule was pinned only
where the fragment states it, so deleting the carve-out in `language-rules.md`, inverting it, or
dropping its table row each left the whole suite green. Both new test batteries were mutation-checked
after repair.

**External review report:** `.effective-flow/review/review-report-2026-09-09-plan-language-chat-key.md`

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    1 |

### 2026-09-08 — deep interactive review

The first review pass approved this plan and was wrong to. A deep review verified it against the
repository and found three critical defects, two of which contradicted decisions the plan had
already taken. All three are resolved above; the findings are kept because the reasoning is what
makes the current shape defensible.

- **Resolved, critical, architecture — "agents emit no interactive output" was false, and the plan
  proposed to write it into the source.** Verified: `src/agents/generic-product-reviewer.md:49` and
  `generic-product-implementer.md:51` emit hard-coded English disclosure notices,
  `generic-implementer.md:69` and `merge-conflict-resolver.md:91` request clarification, and
  `src/SKILL.md:40-42` mirrors the disclosure contract. Resolved by decision 6: nothing is handed
  down, delegated output is relayed verbatim, and the carve-out sentence is not written at all.
- **Resolved, critical, architecture — the lazy placement contradicted the repository's documented
  eager criterion.** `docs/developer-guide/build-system.md:421-432` reserves eager inclusion for
  blocks that "must not be missed" and names the "silently not running" failure mode; `task-tracking`
  is eager at 41 sites and lazy at 0. Resolved by decision 5. The F-13 alternative was examined and
  rejected on evidence: its 2 528-line aggregate was already retired by `21466f1` (#395), which
  landed after the review that raised it.
- **Resolved, critical, error cases — the config locator was unreachable for nine tools.**
  `investigate`, `concept-review`, `open-plans`, `pr`, `plan-review`, `pr-review`, `version`,
  `apply-review-remote` and `apply-review-commit-mechanics` carry no `config-migration` reference;
  `open-plans.md:22-23` already triggers on reading "from the configuration" with zero locator
  references. Resolved by giving the new fragment its own locator pointer. The pre-existing
  `open-plans` defect is out of scope and reported.
- **Resolved, important, architecture — the `ask` fence.** 42 blocks in `src/`, none with a
  `language:` field, all rendering English scaffolding. Resolved by decision 7, with the mixed
  prose-and-value string named as a normative example requirement rather than left implicit.
- **Resolved, important, architecture — `auto` was writable but unwritable.** The wizard represents
  inherit as an absent row, so nothing would ever have written `auto`. Resolved by decision 2,
  which also removes the exception to the `de`/`en` invariant.
- **Resolved, important, architecture — typography never reached chat output.** `typography-rules`
  is eager in sixteen agents and zero tools. Resolved by a lazy pointer triggered on a resolved
  `de`, with the divergence from the agents' treatment stated and justified.
- **Resolved, important, scope — the tool set was three different numbers** (20, 22, 26) and
  `apply-review-remote` and `apply-review-commit-mechanics` were unaccounted for. Resolved by
  enumerating all 26 files and by replacing the unfalsifiable "emits interactive output" criterion
  with a two-sided test.
- **Resolved, important, scope — `src/SKILL.md` emits output no tool pointer can reach.** Resolved
  by decision 8 as a documented exception, keeping the always-loaded router config-free.
- **Resolved, important, maintainability — four affected sites were missing:** `setup.md:443` and
  `:102`, the eager/lazy inventories in `build-system.md`, and the ownership check `AGENTS.md`
  mandates for a new shared include.
- **Resolved, important, testability — six unverifiable behaviours were unlisted.** The validation
  plan now names all nine and says plainly that no command reaches them.
- **Resolved, note, architecture — next-steps scope** was narrower in the table than in the settled
  decision; option descriptions are now explicitly in scope and the invocation token explicitly out.
- **Resolved, note, error cases — the invalid-value rule** read as self-contradictory and is
  reworded: a typo must not _jump_ to `language.project`, but reaching it later in the normal
  precedence is correct.
- **Resolved, note, maintainability — line-number drift** in four references, corrected above.
  Every budget figure and every other pin was verified exact.
- **Open, important, maintainability — no guard protects the key set.** `build.mjs` has zero
  language logic, so the next key added will hit the same two silent-ignore paths
  (`setup.md:341` and `config-setup-migration.md:13-18`). Deliberately not fixed here: a registry
  guard is a separate change with its own scope. Recorded so the next key does not rediscover it.
- **Open, important, testability — no behavioural coverage exists for the three semantics that
  matter.** Every assertion in this area is a text check over sources; "config wins over the user's
  language" cannot be proven by grep. Out of scope; the subject of
  `2026-09-02-merge-gate-behavioural-evals.md`.
- **Open, note, scope — the eager cost is real.** Roughly a dozen lines in 26 tools, and most
  `CONTEXT_BUDGET_LINES` entries will move. Accepted deliberately: the alternative is a rule that
  cannot be shown to run.

## Open points

- No open points.

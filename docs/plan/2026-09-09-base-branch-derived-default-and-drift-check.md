# Derive the base-branch default from the repository and report drift

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

`delivery.baseBranch` has a **hardcoded** default of `origin/main`
([`src/shared/base-branch-resolution.md:3`](../../src/shared/base-branch-resolution.md),
[`src/tools/setup.md:79`](../../src/tools/setup.md)). That default is wrong for every repository
whose default branch is not `main`, and nothing ever compares the configured value against what the
repository itself says.

Two distinct failures follow.

**The default is repository-blind.** A project whose default branch is `trunk` and which has no
`delivery.baseBranch` row resolves to `origin/main`, which does not exist, and
`base-branch-resolution` then aborts by its own third bullet — a clean failure, but an avoidable
one: the repository knew the answer.

**Divergence is undetectable.** Here the configured value is `origin/develop` while
`git symbolic-ref refs/remotes/origin/HEAD` and the forge default both say `main`. That divergence
is deliberate and correct — `main` is the published delivery artifact — but nothing compares them,
so every mechanism that branches off the repository default lands in a tree with no source in it. On
2026-09-09 exactly that happened: a session in a `.claude/worktrees/` worktree cut from `main` was
asked to edit `build.mjs`, which does not exist there. The companion plan
[`2026-09-09-branch-model-reachable-without-the-adr.md`](2026-09-09-branch-model-reachable-without-the-adr.md)
makes the fact loadable; this plan makes the tooling notice it.

**A note on the shape of the fix.** Removing `delivery.baseBranch` and always reading the base from
Git was considered and rejected. `origin/HEAD` answers a different question — the remote's _default
branch_, meaning what a fresh clone checks out and what `gh pr create` defaults to — while
`delivery.baseBranch` names the _integration target for new work_. Gitflow-shaped repositories
separate the two on purpose, and this repository is the proof. Deriving from `origin/HEAD` here
would make Effective Flow branch from `main`: the exact bug. It would also remove the second value,
and with it any possibility of a drift check, since drift requires two independent facts. The key
stays; only its default becomes repository-aware.

## Architecture decisions

- **The key stays and becomes optional; the default is derived.** Resolution order: an explicit
  `delivery.baseBranch` wins; absent, derive from `origin/HEAD`; absent that, `origin/main` as today.
- **`config-migration.md` is not touched, and `887cdf8` proves the point.** Its rule at `:66` —
  "Missing line = key not set → default of the source skill" — already delegates the absent-key
  default to the source skill, which is what this plan changes. `887cdf8` introduced an entirely new
  key, `language.chat`, with novel absent-key semantics ("mirror the user" rather than "inherit"),
  touched 68 files, and added **nothing** to `config-migration.md`. If a new key with new semantics
  does not need it, a changed default does not either.
- **The derived default is not a fourth outcome bullet.** The helper `baseBranchRuleParts()` at
  `test/workflow-contracts.test.mjs:8374` splits on `.split(/(?=\n\s*- )/)` (`:8381`), and the
  assertion at **`:8404`** requires exactly three cases. Because `\s*` spans newlines and
  indentation, **a nested sub-bullet counts as a fourth case**. Prose added to the section's opening
  does not. This is also the right structure: the three bullets classify _a value_; the derived
  default supplies _which value you start from_.
- **The drift text is un-bulleted continuation prose inside the `Remote configured` bullet.** It is
  the larger addition and carries the same hazard: a remediation hint, a "the cache may be stale"
  caveat and a "no gate" statement are exactly what an author renders as a sub-list.
- **`git symbolic-ref`, never a second fetch, and never the words `git fetch`.** The test at
  `:8532` requires the literal `git fetch` exactly once per eager host. A `symbolic-ref` read adds
  no network round trip — but writing the _rationale_ into the source ("this needs no second
  `git fetch`") would make the count two. Keep the rationale in this plan, not in the fragment.
- **The drift check reports and never gates.** House style is established at
  [`src/shared/project-adr-convention.md:100`](../../src/shared/project-adr-convention.md): "the
  declared source still wins and the disagreement is named in the completion report, so a silent
  override becomes a visible one without adding a gate."
- **A deliberate divergence is acknowledged in the ADR prose, not by a config key.** Where the ADR
  prose carries the recognized acknowledgement sentence, the check stays silent; where `origin/HEAD`
  later moves to a third value, it reports again. This avoids new configuration surface and keeps
  the acknowledgement next to the decision — but it **couples this plan to the companion plan**,
  which writes that prose and adds the guard for `setup`'s preservation of it. Without that guard a
  `setup` run would silently delete the acknowledgement.
- **The check fires at both moments.** In `setup` it catches a value wrong when written; in the
  resolution rule's remote-configured arm it catches drift appearing later, after an upstream
  rename, when `setup` never runs again.
- **In `setup` it must not live only in Step 4**, because the Express path skips Step 4 — which is
  what the test at `:8964` exists to guard. The hook is the qualifier prose at `setup.md:111`.
- **Budget is now the tightest constraint in the plan.** `887cdf8` re-measured every entry to
  _measured + 5_, and most entries still sit at exactly five. `pr` is **418/423** — **five** lines,
  not the ten this plan first assumed. `setup` is **1659/1662**: the companion plan spent two of its
  five on the ADR-preservation wording, so only **three** remain. Any addition beyond those forces a
  `build.mjs` bump.
- **Two cost axes, and they differ.** The guard measures `dist/*/tools/<name>.md`, so fragment
  growth is charged to **`pr` alone** — `worktree-integration.md` ships as a standalone fragment
  with no budget entry. At **runtime** the seven tools that lazily include `worktree-integration` do
  load every added line, at delivery time. Keep the addition small for the second reason too.

## Affected files

| File                                       | Description                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/base-branch-resolution.md`     | Derived default in the opening prose; drift comparison as continuation prose in the remote-configured bullet; three bullets, no sub-bullets |
| `src/tools/setup.md`                       | Schema default at `:79`; qualifier prose at `:111`; Step 4 question at `:306`; drift named in the Step 6 summary on both paths              |
| `test/workflow-contracts.test.mjs`         | Update the proposal assertion at `:8939`; add coverage for the derived default, the acknowledgement, and the non-blocking report            |
| `docs/user-guide/worktree-and-delivery.md` | `:134` states the `origin/main` default                                                                                                     |
| `docs/user-guide/configuration.md`         | `:178`, `:440`, `:572` — three tables, one a `Default` column                                                                               |
| `build.mjs`                                | Only if measurement requires it: raise `CONTEXT_BUDGET_LINES` for `pr` and/or `setup` by the measured delta                                 |

## Implementation details

### Approach

1. **Extend the opening prose of `## Base-branch resolution`** with the derived default, leaving the
   classification sentences intact.
2. **Add the drift comparison to the remote-configured bullet as continuation prose.** After the
   existing fetch and resolution, read `origin/HEAD`; where it names a different branch, name both
   facts once, treat neither as authoritative — the cache may be the stale side — and give
   `git remote set-head origin -a`. Stay silent where the ADR prose carries the acknowledgement
   sentence. No sub-bullets, no literal `git fetch`.
3. **Extend `setup`'s qualifier prose at `:111`** so this row resolves against `origin/HEAD` as well
   as `git remote`, on every path; extend the Step 4 question at `:306`; have the Step 6 summary
   name a disagreement. **Measure the proximity pins before and after.** Note the trap: `setup.md:104`
   is now the safe-defaults _table row_, not the qualifier prose — the prose is at `:111-113`.
4. **Update the shipped documentation** so no published statement contradicts the new behaviour.
5. **Measure, then decide the budget.** Run `node build.mjs` and read `Always-loaded core
(lines/budget)`. Where `pr` or `setup` exceeds its entry, raise it by the measured delta and
   record the reason. Do **not** imitate the `+6 (goal-completion)` marker style — `887cdf8`
   folded those deltas into fresh measurements and `build.mjs` now records that "the markers are
   gone and every entry is again a measurement plus its headroom". `oxfmt` decides the wrapping, so
   the line cost is not fully the author's to choose.
6. **Update the tests deliberately.** The proposal assertion at `:8939` encodes the old behaviour and
   must move with it.

### The proximity pins, with measured headroom

`near(A, B, N)` builds an unanchored `(?:A[\s\S]{0,N}?B|B[\s\S]{0,N}?A)`. **Inserting text elsewhere
in a slice can only add match opportunities, never remove them** — so prose added outside a pinned
pair cannot break it. The risk is confined to text inserted _between_ two anchors, and to the split
count. Do not "fix" tests on the assumption that any insertion endangers them.

| Assertion                                                                                 | Line | Budget | Gap |         Room |
| ----------------------------------------------------------------------------------------- | ---: | -----: | --: | -----------: |
| `near('Every path resolves this row', 'before writing it', 120)`                          | 8977 |    120 |  22 | **98 chars** |
| `near('one row whose safe value depends on the repository', 'current local branch', 300)` | 8926 |    300 | 106 |    194 chars |
| `near('a remote named `origin` is configured', 'current local branch', 300)`              | 8960 |    300 |  41 |    259 chars |

The first is the tight one, and the words between its anchors are exactly `` against `git remote` ``
— the phrase step 3 extends. A wording like "against `git remote` and, where a remote named `origin`
exists, against `origin/HEAD`, before writing it" is roughly 85 characters and passes with little to
spare. **Measure, do not assume.**

### Edge cases

- **`origin/HEAD` absent.** Common after `git init` plus `git remote add`, and in some CI checkouts.
  No derivation, no drift signal, fall through to `origin/main`, report nothing, never error.
- **`origin/HEAD` stale** after an upstream rename. The check cannot tell which side is stale, so it
  names both and suggests `git remote set-head origin -a` rather than issuing a verdict.
- **The acknowledged divergence.** Silent here once the companion plan's ADR prose lands. Until then
  this repository reports on every remote resolution, which is why the two plans are ordered.
- **The acknowledgement is deleted by a `setup` run.** Guarded by the preservation test the companion
  plan adds. Without that plan, this failure is silent.
- **No remote named `origin`**, or several with none named `origin`: unchanged. `origin/HEAD` does
  not exist to consult and "Never guess a remote ref from a differently named remote"
  (`setup.md:311`) still holds.

## Acceptance criteria

Contract assertions, verifiable by the suite:

- [ ] `## Base-branch resolution` still yields exactly three cases from `baseBranchRuleParts()`
      (`:8404` green **unedited**), and the fragment contains no sub-bullet under any outcome bullet.
- [ ] The literal `git fetch` still appears exactly once per eager host (`:8532` green **unedited**).
- [ ] The tests at `:8437`, `:8481` and `:8563` are green **unedited**.
- [ ] `:8923` is green: the safe-defaults row still reads `origin/main`.
- [ ] The three proximity pins above are green, with their post-change gaps recorded in the PR
      description so the remaining room is visible to the next editor.
- [ ] `base-branch-resolution.md` states the derived default and the acknowledgement condition.
- [ ] No published document still presents `origin/main` as the unconditional default.
- [ ] `node build.mjs` completes with every tool at or under its entry, any raised entry carrying a
      recorded reason; `pnpm test` and `pnpm agent:check` green.

Behavioural, verifiable only by hand — the suite asserts on source prose and has no executor:

- [ ] Absent key with `origin/HEAD` → `trunk` resolves `origin/trunk`; with `origin/HEAD` absent
      resolves `origin/main`.
- [ ] An explicit value is used unchanged regardless of `origin/HEAD`.
- [ ] A divergence is reported once, with the remediation hint, and blocks nothing.
- [ ] `setup` reports the same disagreement on the Express path as on the guided path.

## Validation plan

- `node build.mjs` — record `pr` and `setup` measured sizes before and after; `pr` starts with five lines of
  headroom and `setup` with three.
- `pnpm test` — full suite, with the five must-stay-green-unedited tests checked individually.
- Measure the three proximity gaps after the edit and record them.
- Manual, in a scratch clone: delete `origin/HEAD`, confirm the silent `origin/main` fallback; set it
  to a non-`main` branch with no configured key, confirm the derived resolution; then confirm the
  drift report appears once and blocks nothing.
- `pnpm agent:check`.

## Assumptions and open points

- Assumed: `git symbolic-ref refs/remotes/origin/HEAD` is purely local and adds no network access.
- Verified: a `lazy-include` inside an eagerly-included fragment does become a load pointer —
  `build.mjs:861-863` resolves eager includes first, then converts every surviving fence, and
  `build.mjs:1076-1078` states it for fragments explicitly.
- Verified: no `git symbolic-ref`, `origin/HEAD` or default-branch detection exists in `src/` today.
- Verified: `base-branch-resolution.md` is eagerly included by exactly two hosts — `src/tools/pr.md`
  (fence at `:81`) and `src/shared/worktree-integration.md` (fence at `:45`).
- **Ordering:** the companion plan must land first. This plan's silence mechanism reads prose that
  plan writes, and its preservation guard protects it.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### 2026-09-09 — deep interactive plan review

Three critical findings against the first draft, all resolved:

- **Critical, resolved — the budget claim was wrong.** The draft asserted "`pr` pays it alone" while
  its own affected-files table edited `config-migration.md`.
- **Critical, resolved — the drift text's placement was unanalysed.** A natural sub-list rendering
  makes `baseBranchRuleParts()` return four cases.
- **Critical, resolved — "green by construction" was false.** The Express pin has 98 characters of
  room at the exact edit site.
- Four important findings resolved: two unlisted proximity pins, the wrong risk axis for `near()`,
  four shipped documents stating the old default, and the misdescribed runtime cost.

### 2026-09-09 — revision against 887cdf8

The base moved from `2c82846` to `887cdf8`. Two of the previous review's own figures were wrong
independently of that move:

- **Important, resolved — the `config-migration` eager count was wrong from the start.** The previous
  revision claimed nineteen eager sources with `apply-issues` on one line of headroom. The true
  figure was **twelve** eager includes both before and after the fast-forward — the count had
  included prose mentions and lazy fences — and `apply-issues` now sits at 1174/1179, five lines. The
  decision not to touch the file is unchanged and is now supported by `887cdf8`'s own precedent
  instead of by a wrong headroom figure.
- **Important, resolved — every budget figure was stale.** `pr` is 418/423, five lines rather than
  the assumed ten. `setup` was 1657/1662 at revision time and is **1659/1662** now, because the
  companion plan's ADR-preservation wording consumed two lines — three remain. This tightens the
  plan's central constraint twice over.
- **Important, resolved — the `+6 (goal-completion)` marker style no longer exists.** `887cdf8`
  folded those deltas into fresh measurements. Step 5 no longer tells an implementer to imitate a
  convention that was removed.
- **Important, resolved — a citation trap.** `setup.md:104` now addresses the safe-defaults table
  row rather than the qualifier prose, so the old hook would have pointed an implementer at the
  wrong construct. The prose is at `:111-113`.
- **Note — Error cases:** all test citations shifted by +75 and all `setup.md` citations by +5 to +8;
  every one is re-bound above. `base-branch-resolution.md:3`, `config-migration.md:66` and
  `worktree-and-delivery.md:134` are unchanged and re-confirmed.
- **Note — Architecture / Scope / Maintainability:** unchanged from the previous review — the
  acknowledgement couples this plan to the companion plan and makes ADR prose machine-read, accepted
  with the ordering constraint stated.
- **Note — Testability:** unchanged — four acceptance criteria assert runtime Git behaviour the
  suite cannot reach and stay in a separate manual group.

### 2026-09-09 — implementation review

One critical finding, five important, all resolved.

- **Critical, fixed — the derived default did not survive its own classification rule.** The
  wording "takes the branch `git symbolic-ref refs/remotes/origin/HEAD` names under `origin/`"
  reads as a location, and under that reading the derived value is `trunk`, not `origin/trunk`.
  The same paragraph then rules that a value without a `/` is never a remote ref, so resolution
  would take the remote-**not**-configured arm, skip the fetch and start delivery from a possibly
  stale local branch — re-creating the exact failure this plan exists to remove. Deleting the two
  words left all 883 tests green. Now `origin/` is stated as a prefix, the derived value is
  declared a remote ref, and two assertions pin both.
- **Important, fixed — the silence condition pointed at a surface the reader contract never
  reaches.** `config-migration.md` binds ADR readers to the configuration table plus `## Status`
  and `## Context`; nothing describes reading a trailing section. The condition now says the
  sentence lives in prose _outside_ the configuration table.
- **Important, fixed — the comparison was not scoped to `origin`.** A fork checkout with
  `upstream/develop` as its base and `origin` as the fork would have drawn a permanent report
  whose remediation could never resolve it, contradicting `setup.md`'s own "never guess a remote
  ref from a differently named remote". Now scoped, and pinned by a test.
- **Important, fixed — an unresolvable `origin/HEAD` could be read as a failed resolution.** The
  new sentence sat directly after "report and stop", and `git symbolic-ref` exits non-zero after
  `git init` plus `git remote add` and in many CI checkouts — an abort in exactly those. It is now
  stated as a silent fall-through that is not an error, sequenced after a successful resolution.
- **Important, fixed — the preservation promise was scoped to "a normal update"** while a
  confirmed full overwrite exists beside it. It now holds in every mode, and says an overwrite
  discards values rather than prose.
- **Important, fixed — the ADR side of the binding test was a tautology.** It located the
  acknowledgement sentence by the same words it then required, so a semantic inversion passed. The
  ADR side is held by the verbatim pin instead; both tests now say which half they guard, and the
  older pin's comment no longer describes the check as unimplemented.
- Notes acted on: the report's trigger condition is now pinned (making it unconditional had left
  the suite green); terminology aligned to "project setup ADR"; the `pr.md` appositive restored.

**Proximity pins, measured after the change** (the acceptance criteria ask these be recorded):
`near('Every path resolves this row', 'before writing it', 120)` — **40 of 120**;
`near('one row whose safe value depends on the repository', 'current local branch', 300)` — **106
of 300**; ``near('a remote named `origin` is configured', 'current local branch', 300)`` — **41 of
300**.

### Deviations from the plan as written

- **`src/shared/worktree-integration.md` and `src/tools/pr.md` were not in `Affected files`.** Both
  stated the old default as fact — `worktree-integration.md` under "Missing values have these
  defaults", `pr.md` as "the same default the delivery configuration documents". The change made
  both false. Correcting `pr.md` turned a test red that pinned `origin/main` there; that test
  guards a real property (the config-missing default must be a _remote_ ref, because a slashless
  `main` resolves to nothing in a checkout with `origin/main` and no local `main`), so it now pins
  that property rather than a branch name.
- **`build.mjs` needed the bump the plan contemplated.** The critical and important fixes brought
  `pr` to 427 against a budget of 423. Raised to **432**, matching the repository's measured-plus-
  five convention, and left bare: `887cdf8` deliberately removed the inline marker style, so the
  reason is recorded here instead. `setup` needed none and sits at 1661/1662.

## Open points

- No open points.

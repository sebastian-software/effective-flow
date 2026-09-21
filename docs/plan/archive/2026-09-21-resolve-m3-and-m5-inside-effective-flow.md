# Resolve the M-3 and M-5 move candidates inside Effective Flow

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Section §6.2 of
[`docs/review/2026-08-31-architecture-and-consistency-review.md`](../review/2026-08-31-architecture-and-consistency-review.md)
proposed moving six shared fragments into the central skills repository. Four rows are settled;
M-3 and M-5 still stand at `open` with the note `upstream contribution first`, which means both
fragments are held in a waiting state for a contribution to a **foreign** repository that has not
been made and is not scheduled.

The user decided on 2026-09-21: **do not offer M-3 and M-5 upstream — resolve both inside
Effective Flow, and clean up the fragment content while doing so.** This plan implements exactly
that decision. It writes nothing to the skills repository.

"Resolving locally" is not a status flip. Each row is closed the way #448 closed M-4: the central
skill is named authoritative for the craft it owns, the fragment states which of its own rules
**override** that authority and why, and the relationship is recorded in the ownership manifest so
the next ownership audit does not re-raise it. The content cleanup then removes what the skill
already says and keeps what only this repository can state.

The two rows resolve for opposite reasons, and the plan must not blur them:

| Row | Upstream coverage, re-verified at `f4300bb`                                                                                                                                                                                                                                                                                                                                                                                                      | Consequence                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-3 | `effective-delivery/references/evidence-and-delivery.md:68–93` covers Conventional Commits as a fallback, choosing a recognized type from the actual change, specific subjects, bodies, and "Do not add AI attribution, generated-by trailers, emojis, or release tokens", and closes with "Do not use `chore` as a generic escape hatch for a user-visible fix, feature, or documentation change" — which is type-by-effect in its general form | The fragment is **closest to a second copy**. Most of it duplicates the skill; two rules and the house policy do not. Cleanup means **thinning**. |
| M-5 | `effective-product/references/adr-format.md:100–122` ("Living records") explicitly permits a living lifecycle and **requires the repository to declare** five things before one is used; `:156–169` ("Identity and Migration") says to follow the repository's identity scheme but states no precedence, width allocation, or collision rules                                                                                                    | The fragments are **the declaration the skill demands** plus the mechanism it omits. Cleanup means **completing the declaration**, not thinning.  |

### Correcting the review's own premise for M-5

The review calls M-5 "the strongest candidate" and argues that `project-adr-convention.md` "is
general ADR craft — the exact thing `effective-product` declares ownership of, and it says it
'follows the repository's declared convention' without specifying how to determine it".

The second half of that sentence is the refutation of the first. A skill that defers to the
repository's declared convention needs the repository to **have** one; the mechanism for
determining it is the deferring side's work, not the owner's. `adr-format.md:110–116` makes this
explicit by listing what the repository must declare. Effective Flow is the orchestrator that
writes ADRs into arbitrary target projects, so it is the side that must resolve an unknown
project's scheme. That is orchestration, which `AGENTS.md:111` assigns to Effective Flow.

### Why this is a Feature

The same reasoning #448 recorded: declaring `effective-delivery` authoritative for commit-message
craft changes what a `commit`, `deliver`, or `iterate` run does whenever the skill is installed —
the skill's staged-diff derivation, subject-boundary test and body rules become part of the run
instead of the seven bullets the fragment currently carries. Effective Flow's plan contract
defines Refactoring as having no intended behavior change, so this is a Feature. The `refactor:`
precedent of #393 is noted and deliberately not followed, exactly as in #448.

### Planning baseline

- Effective Flow: `origin/develop` at `91afe89`, 2026-09-21. The local `develop` is level with it
  and the working tree is **clean**. Every line reference below is against `91afe89`.
- Skills: DALO checkout `/Users/bs5/.dalo/sources/sebastian/checkout` at `f4300bb` (2026-09-14).
  Both upstream citations in the table above were re-read from that checkout during this planning
  run, not copied from the precedent plan — its own step 0 established that these citations are
  perishable, and one of them had already drifted: the precedent plan cites
  `evidence-and-delivery.md:65–91` and `adr-format.md:158–161`; the live ranges are `:68–93` and
  `:156–169`, and the decisive "Living records" passage at `:100–122` is not cited there at all.
- `dist/` is current for `91afe89` for every Markdown source, so the measured line counts below
  are the guard's own metric (`split('\n').length`).

### Verified current state

**Review document** (`docs/review/2026-08-31-architecture-and-consistency-review.md`, 651 lines)

- Status table: header L17, separator L18, rows L19–41, three left-aligned columns
  `Finding | Status | Landed as`. M-3 is L38, M-5 is L40, both `open`.
- Move-candidate table: heading L555, header L561, separator L562, rows L563–568, five columns
  with `Lines` **right-aligned**. M-3 is L565, M-5 is L567.
- L570–571: "M-5 and M-1 are the two that matter most: together they are ~740 lines of genuinely
  reusable expertise currently locked inside Effective Flow."
- L651, last line of `### P4 — cleanup`: "**M-1 … M-6** move the six reusable fragments to the
  skills repository."
- L43 is the correction-bullet counter ("Four corrections…"); the fourth bullet's M-3/M-5 sentence
  is L71–75.
- Both tables are column-padded by oxfmt, so widening the widest row reflows every line of that
  table. `pnpm agent:check` fails otherwise.

**`src/shared/commit-message-rules.md`** (15 lines)

- Generic craft that upstream already states: L11–12 (avoid `update files`; describe what and
  why), L13 (the Conventional Commit prefix set).
- The genuine local delta: L14 — the **runtime-effect** refinement (config/env/secrets/CI with
  deployment or runtime effect is `fix:`/`feat:`, `chore:` only for deploy-neutral change) and the
  **squash-PR-title** rule that drives the release-please bump. Upstream states the general
  `chore`-escape-hatch rule but neither refinement.
- Effective Flow policy and plumbing that must stay: L3–7 (`language.git` resolution through the
  shared language rule, extended to PR-title descriptions and changelog prose), L8–9 (the
  unconditional `Co-Authored-By` ban including removal from a template — upstream's ban is
  conditional, "unless the repository … explicitly requires them"), L10 (the AI-attribution ban),
  L15 (no internal tracking IDs such as `R-0000001` or `F1` in Git history).
- Carries **no** ownership prose at all: it names no central skill.

**`src/shared/adr-convention.md`** (110 lines)

- `### Relationship to the effective-product skill (declared convention + fallback)` already
  exists at L45–69 and already frames the fragment as "the **declared ADR convention of this
  repo**" that the authoritative skill follows. The M-5 decision does not need to invent this
  framing — it needs to make it **verifiable**.
- Against upstream's five-item declaration checklist (`adr-format.md:110–116`), the fragment
  answers: lifecycle (L28–29), filename identity and location (L16–20), status vocabulary
  (L25–27). It does **not** answer item 4, whether a record carries an update date or short change
  note — `grep -ni 'date|change note|updated'` over the fragment returns only the mutability line.
  Item 5, which narrow records may own configuration values, is answered in `AGENTS.md:192` but
  nowhere in the fragment itself.
- The checklist is not cited anywhere in this repository, so nobody reading the fragment can tell
  that it is a declaration in the sense the skill requires, or check it for completeness.

**`src/shared/project-adr-convention.md`** (220 lines)

- Roughly 190 lines of generic naming-convention craft — untrusted-source handling (L14–19),
  declared sources (L21–30), the four-outcome classification (L32–43), precedence (L95–101),
  width allocation (L103–133), containment (L135–170), write-time collision (L172–193) — with
  ~20 lines of interleaved Effective Flow hooks (the ` ```ask ` fence L51–62, the project-setup
  slug exclusion L84–88, the completion-report duty L204–207).
- Carries **no ownership prose at all**. It is the file the review singled out, and it is the only
  one of the three with nothing said about its relationship to the skill it serves.

**Ownership manifest**

- `docs/developer-guide/skill-ownership.json`, schema enforced by `parseSkillOwnershipManifest`
  (`build-lib.mjs:287–437`); `classification` ∈ `delegate | route-when-relevant | no-overlap`
  (`build-lib.mjs:243`).
- `effective-delivery` (JSON L9–49) has 29 consumers and **neither `commit` nor
  `commit-message-rules`**. `pr` is absent from it too.
- `effective-product` (JSON L91–100) has six consumers: `apply-review`, `concept-review`,
  `concept`, `durable-follow-up-gate` (all `delegate`), `plan`, `plan-review`
  (`route-when-relevant`). **Neither ADR fragment is a consumer, and neither is `setup`** — which
  eagerly includes `adr-convention` and declares nothing.
- The Markdown mirror `docs/developer-guide/skill-ownership.md` is machine-reconciled on **row
  membership only** (markers L80/L91, rows L84–89); consumer, classification and coverage cells
  are prose.

**Guards that constrain the wording**

- **Ownership contract guard** (`assertSkillOwnershipContract`, `build-lib.mjs:671–841`, called at
  `build.mjs:691–706`). Its reverse check (L761–840) requires every **tool- or agent-kind**
  `delegate` consumer to name its owner as the **first** member of its `## Recommended skills`
  chain. Shared-fragment consumers are exempt by kind, automatically.
- **ADR ownership-contract guard #167** (`build.mjs:374–401`, detector `build-lib.mjs:2858–2914`).
  It scans exactly four files — `AGENTS.md`, `docs/developer-guide/configuration.md`,
  `docs/developer-guide/skill-ownership.md`, `src/shared/adr-convention.md` — and fails the build
  on any paragraph that names `effective-product` together with a deliberate-divergence phrase
  (`STALE_ADR_DIVERGENCE_RE`) or with the bare words `immutable` or `numbered`
  (`STALE_ADR_DESCRIPTOR_RE`), outside a legacy-compatibility or explicitly-corrected-history
  sentence. Verified by reading both regexes and the file list at `91afe89`.
- `src/tools/setup.md` and `src/tools/commit.md` have **no** `## Recommended skills` section;
  `src/tools/apply-review.md` has one and it already names `effective-product` (L71–73).

**Context budgets** (`CONTEXT_BUDGET_LINES`, `build.mjs:1512–1541`; values read directly)

- `commit-message-rules` has **seven eager tool hosts** — `iterate` (3 lines of headroom),
  `apply-issues` (**1**), `refactor` (5), `maintain` (5), `pr` (2), `commit` (3),
  `apply-review` (4) — plus three lazy hosts (`build`, `docs`, `fix`) that are unaffected, and
  five agents that carry no budget.
- `adr-convention` has two eager hosts: `setup` (**1** line of headroom, budget 1723) and
  `apply-review` (4). `project-adr-convention` has exactly one consumer,
  `adr-convention:108–110`, so both ADR hosts carry all 330 lines transitively.
- Consequence: the M-4 shape (an added authority paragraph, +2 lines) blows `setup` and
  `apply-issues` on its own. M-3's thinning **funds** its own authority paragraph across seven
  tools; M-5's does not and needs a budget raise.

**The eval-stamp asymmetry — verified empirically, not inferred**

`evals/merge-gate/_scaffold/build-identity.mjs:200–208` seeds the load-set closure with
`tools/iterate.md` among others. An eager include is **inlined** at build time, and
`dist/portable/effective-flow/tools/iterate.md:1727` contains `commit-message-rules.md`'s text
verbatim. **Editing the M-3 fragment therefore changes a load-set seed and invalidates the
merge-gate eval stamp.** `adr-convention.md` is inlined only into `tools/apply-review.md` and
`tools/setup.md`; neither is a seed nor reachable from one, so **M-5 is stamp-neutral**.

This creates no new obligation: the archive is already stale for the 1.65.0 release (PR #440 fails
`--mode strict` today), so M-3 joins an existing debt rather than creating one. It does fix the
ordering — see "Sequencing against the eval re-record".

## Architecture decisions

- **Record each row as authority plus a named override, never as a divergence.** Guard #167 makes
  the natural phrasing ("Effective Flow deliberately diverges from `effective-product`") a build
  failure, and #448 already established the compliant vocabulary. No new prose in the four scanned
  files may use `deliberate/intentional` + `divergence/deviation/conflict`, or the bare words
  `immutable` or `numbered`, in a paragraph naming `effective-product`.
- **M-3 thins, M-5 completes.** The cleanup is not symmetric, because the upstream coverage is
  not. Thinning M-5 would delete the declaration the skill requires; padding M-3 would deepen the
  second copy the ownership contract forbids.
- **The thinning keeps one explicit fallback line, not zero.** `AGENTS.md:111` allows a consumer
  to keep "a minimal generic fallback for when the skill is absent", and the commit-type set is
  that floor: without it a run with no `effective-delivery` installed would have to infer the
  vocabulary the two overriding rules are stated in. The line is labelled as the fallback so a
  later reader cannot mistake it for a surviving second copy.
- **Make the M-5 declaration checkable by citing upstream's checklist.** The fragment states the
  five items `adr-format.md:110–116` demands, in that order, and says where each is answered. This
  converts "we assert this is the declared convention" into something a reader can verify, and it
  is what makes the local decision defensible rather than merely chosen.
- **Both tool-kind consumers get a `## Recommended skills` section; fragment-kind consumers do
  not need one.** `commit` → `effective-delivery` first; `setup` → `effective-product` first. The
  reverse check requires exactly this and nothing more.
- **`setup` is declared as a consumer even though no guard forces it.** It eagerly carries all 330
  lines of the ADR pair and declares no relationship, which is the inconsistency the next
  ownership audit re-raises. Declaring it is the cheapest way to stop this row returning. This is
  the plan's one deliberate scope extension beyond the two named rows; it is isolated in step 5
  and can be dropped without affecting any other step.
- **Correct the review by rewriting the existing fourth correction bullet, not by adding a
  fifth.** The subject is identical — the M-item assessment — and a fifth bullet would force the
  L43 counter from "Four" to "Five" for no gain. The three stale statements outside the tables
  (L570–571, L651) are corrected in the same pass; #448 left them behind.
- **Measure budgets; do not assert them.** Every budget number in this plan is a current reading,
  not a target. Step 7 takes the new values from the `Always-loaded core (lines/budget)` report
  that `node build.mjs` prints, per the `AGENTS.md` rule that the number is a measured backlog.

## Affected files

| File                                                            | Description                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/commit-message-rules.md`                            | Declare `effective-delivery` authoritative for commit-message craft; name the runtime-effect and squash-title rules as the override; drop the bullets upstream already states               |
| `src/tools/commit.md`                                           | New `## Recommended skills` section with `` `effective-delivery` `` as the first bullet                                                                                                     |
| `src/shared/adr-convention.md`                                  | Cite upstream's five-item living-record declaration checklist and answer all five, including the update-date/change-note item that is answered nowhere today                                |
| `src/shared/project-adr-convention.md`                          | New short relationship paragraph: what this resolver is relative to `effective-product`, and why determining an unknown project's scheme is the deferring side's work                       |
| `src/tools/setup.md`                                            | New `## Recommended skills` section with `` `effective-product` `` as the first bullet                                                                                                      |
| `docs/developer-guide/skill-ownership.json`                     | `effective-delivery` gains `commit` and `commit-message-rules`; `effective-product` gains `adr-convention`, `project-adr-convention` and `setup` — all `delegate`                           |
| `docs/developer-guide/skill-ownership.md`                       | Both rows' consumer cells extended; the `effective-delivery` classification and coverage cells gain the commit-message subject; two `Deliberate boundaries` bullets for the named overrides |
| `docs/review/2026-08-31-architecture-and-consistency-review.md` | M-3/M-5 status rows; both move-candidate rows' verdicts; the fourth correction bullet; L570–571; L651                                                                                       |
| `build.mjs`                                                     | `CONTEXT_BUDGET_LINES` for every consumer whose measured size moved                                                                                                                         |
| `test/workflow-contracts.test.mjs`                              | Contract pins for the two authority statements and the two overrides                                                                                                                        |
| `test/build-lib.test.mjs`                                       | Manifest-shape coverage for the five new consumer entries, if the existing fixtures do not already cover it                                                                                 |
| `build-lib.mjs`                                                 | _(not foreseen)_ the twin exempt-by-kind fragment enumeration in the ownership-guard comment                                                                                                |
| `docs/developer-guide/build-system.md`                          | _(not foreseen)_ the same enumeration, plus the widened #167 scan set                                                                                                                       |

## Implementation details

### Approach

**Step 0 — re-verify the upstream citations before writing them anywhere.**
Re-read `evidence-and-delivery.md` and `adr-format.md` from
`/Users/bs5/.dalo/sources/sebastian/checkout`, record the checkout revision, and confirm the three
ranges this plan cites. The precedent plan's step 0 exists because these citations decay, and this
plan already found two that had. If a range has moved, update the plan before proceeding; if the
substance has changed, **stop** and re-pose the decision.
Verify: the three cited passages exist and say what this plan says they say.

**Step 1 — M-3: declare the authority and name the override.**
Insert one paragraph into `src/shared/commit-message-rules.md` naming `effective-delivery` as the
owner of commit-message craft, listing which of the skill's rules the two local rules **override**
and why: the runtime-effect classification (deployment-effective configuration is not `chore:`)
and the squash-PR-title rule (the title is the release signal, so it carries the same
classification). Follow #448's wording shape.
Verify: this step changes no guard input, so `node build.mjs` exiting 0 proves nothing about it.
Its correctness is established in step 8, whose mutation of the authority sentence must fail the
suite. Until step 8 runs, treat step 1 as unverified rather than as passing.

**Step 2 — M-3: thin what the skill already states.**
Remove the two prose bullets that restate upstream: the generic-message prohibition and the
describe-what-and-why bullet. **Keep the Conventional Commit type set as a single fallback line**,
explicitly labelled as the minimal fallback that applies when `effective-delivery` is absent —
decided on 2026-09-21, because the layered contract does not merely permit that floor, it requires
one. Keep, unchanged in substance: the
`language.git` resolution, the unconditional `Co-Authored-By` ban, the AI-attribution ban, the
internal-ID prohibition, and the two overriding rules from step 1. The house bans stay **because
upstream's equivalent is conditional** and this repository's is not — that is a scope constraint,
which the layered contract explicitly permits a consumer to keep.
Verify: `node build.mjs` reports every one of the seven eager hosts within budget.

**Step 3 — M-3: add the recommendation section to `commit`.**
`## Recommended skills` with `` - `effective-delivery` `` as the first and only bullet, placed
where the neighbouring tools place it (before `## Project conventions`).
Verify: `node build.mjs` exits 0 — a missing or mis-ordered section fails the reverse check with
`Unrecommended delegate consumer "commit"`.

**Step 4 — M-5: complete the declaration.**
In `src/shared/adr-convention.md`, extend the existing relationship section (L45–69) with the
five-item checklist from `adr-format.md:110–116`, each item answered and pointing at where it is
answered. Item 4 is answered for the first time, and the answer was decided on 2026-09-21: **neither** — an
Effective Flow living ADR carries no update date and no change note, and repository history carries
its earlier states. That declares current practice rather than changing it, and it matches the
tradeoff `adr-format.md:100–107` itself describes for living records. Item 5 is pulled in from
`AGENTS.md:192` by cross-reference rather than copied.
Observe guard #167 throughout: this file is scanned.
Verify: `node build.mjs` exits 0 (guard #167 is the one that fires here).

**Step 5 — M-5: give the resolver its relationship paragraph, and declare `setup`.**
Add a short opening paragraph to `src/shared/project-adr-convention.md` stating that
`effective-product` owns ADR craft and follows the repository's declared convention, that this
file is the mechanism for determining that convention in a project whose scheme is unknown, and
that determining it is the deferring side's work. Add `## Recommended skills` to
`src/tools/setup.md` with `` `effective-product` `` first.
Verify: `node build.mjs` exits 0.

**Step 6 — record all five relationships.**
Add to `skill-ownership.json`: `commit` and `commit-message-rules` under `effective-delivery`;
`adr-convention`, `project-adr-convention` and `setup` under `effective-product` — all
`delegate`. Mirror into `skill-ownership.md`: append the names to the end of each row's delegate
group before the semicolon, insert the commit-message subject into the `effective-delivery`
classification and coverage cells, and add one `Deliberate boundaries` bullet per override
(antecedent and consequent, per #448). Both edits reflow the padded table — run `pnpm format`.
Verify: `node build.mjs` exits 0; `pnpm agent:check` exits 0.

**Step 7 — measure and set the budgets.**
Take the `Always-loaded core (lines/budget)` report from `node build.mjs` and set each changed
entry to its measured count plus **at most** ten lines of headroom, per `AGENTS.md`. Expect
downward movement on the seven `commit-message-rules` hosts and upward movement on `setup` and
`commit`.
Verify: `node build.mjs` exits 0 with no budget warning.

**Step 8 — pin the contracts in tests.**
Add assertions for: the `effective-delivery` authority sentence in `commit-message-rules.md`; the
two override rules (runtime effect, squash title) surviving the thinning; the
`effective-product` authority framing in `project-adr-convention.md`; and the presence of all five
checklist answers in `adr-convention.md`. Prove each by mutation **both ways** — the assertion must
fail when the statement is removed and pass when restored. Restore from a `cp` snapshot, never
`git checkout --`, which would discard the uncommitted work under validation. A mutation that does
not fail means the mutation was absorbed, not that the assertion is redundant — investigate before
accepting it.
Verify: `pnpm test` exits 0 with the new cases named in the output.

**Step 9 — correct the review document.**
Status table L38/L40: `open` → `withdrawn`, "Landed as" → a cell naming this PR and stating that
the fragment stays in Effective Flow with the central skill declared authoritative. Move-candidate
rows L565/L567: replace the move rationale with the verdict and its evidence. Rewrite the fourth
correction bullet's M-3/M-5 sentence (L71–75) to record the decision and both reasons. Correct
L570–571 (the ~740-lines claim now describes only M-1) and L651 (P4 no longer proposes moving six
fragments). Leave the L43 counter at "Four". Both tables reflow — run `pnpm format`.
Verify: `pnpm agent:check` exits 0; the four M-row statuses read `withdrawn`, `withdrawn`,
`implemented`, `withdrawn`, with M-6 alone still `open`.

**Step 10 — full CI sequence.**
`pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in that order.

### Sequencing against the eval re-record

Step 2 changes a load-set seed and invalidates the merge-gate eval stamp. The archive is stale
already, so the correct order is **land this change first, re-record afterwards** — re-recording
before it would throw away three hours of evidence at the first commit. If a re-record is in
flight when this work is ready, hold the merge rather than the re-record.
`pnpm merge-gate-eval verify` stays read-only and is expected to keep reporting staleness
throughout; `--mode strict` remains a release-PR gate, not a merge gate for this change.

### Edge cases

- **The thinning removes a rule the skill only covers conditionally.** Upstream's AI-attribution
  ban ends "unless the repository, host platform, or user explicitly requires them"; this
  repository's is unconditional. Deleting the local bullet would silently weaken a house rule.
  Both bans stay, framed as scope constraints rather than as a copy of the skill's guidance.
- **`effective-delivery` is not installed.** Answered by the retained fallback line: the type set
  survives the thinning and is labelled as the floor. The check is that the remaining fragment,
  read alone, still lets a run write an acceptable commit message — duplication is the thinning
  target, the floor is not.
- **Guard #167 fires on correct-sounding prose.** Any sentence naming `effective-product` near the
  words `immutable` or `numbered` fails, including in `skill-ownership.md`'s new bullets. Write the
  override statements without those words.
- **A budget entry is lowered too far.** The guard is two-sided: an entry more than ten lines above
  the measured count fails just as a too-small one does. Step 7 must set both directions.
- **`pnpm format` reflows a padded table into a large diff.** Expected for both the review tables
  and the ownership inventory; it is formatting, not content, and must not be hand-edited back.

### Maintenance and review focus

The enduring contract this change creates is **one sentence per fragment** naming its owning skill
plus an explicit list of overrides. That shape is what the next ownership audit reads, and it is
what keeps a future contributor from either re-raising the move or quietly re-growing the second
copy. Reviewers should scrutinize three things in that order:

1. **Whether each override is still true.** An override is a claim about what upstream does _not_
   say. `evidence-and-delivery.md` and `adr-format.md` move; when either grows the runtime-effect
   rule or a determination procedure, the corresponding override becomes a second copy and must be
   deleted rather than defended. This is the same decay that invalidated two of the three citations
   this plan inherited.
2. **Whether the thinned fragment still stands alone without the skill.** The minimal-fallback
   floor is the easiest thing to erode one bullet at a time.
3. **Whether the manifest and the fragments still agree.** Only row membership is machine-checked;
   the consumer, classification and coverage cells are prose and can drift silently.

Deliberately deferred: M-6, `pr`'s missing `effective-delivery` relationship, and any upstream
contribution. None of them is blocked by this change, and none blocks it.

## Acceptance criteria

- [ ] `node build.mjs` exits 0 with no budget warning and no guard violation, including guard #167
      and the ownership reverse check.
- [ ] `pnpm agent:check`, `pnpm test` and `pnpm test:distribution` each exit 0.
- [ ] `skill-ownership.json` contains all five new consumer entries with `classification: delegate`,
      and `skill-ownership.md`'s rows carry the same names.
- [ ] `src/tools/commit.md` names `effective-delivery` and `src/tools/setup.md` names
      `effective-product` as the **first** bullet of a `## Recommended skills` section.
- [ ] `src/shared/commit-message-rules.md` still contains both the runtime-effect and the
      squash-PR-title rule (pinned by test in step 8).
- [ ] **Human judgment, not machine-checkable:** no remaining bullet in that fragment restates
      substance already carried by `evidence-and-delivery.md:68–93`. The reviewer reads both files
      side by side; no command decides this.
- [ ] `src/shared/commit-message-rules.md` retains exactly one line naming the Conventional Commit
      type set, explicitly labelled as the minimal fallback for a missing `effective-delivery`.
- [ ] `src/shared/adr-convention.md` answers all five items of `adr-format.md:110–116`, each with a
      stated answer or an explicit cross-reference, and item 4 reads that no update date and no
      change note are carried.
- [ ] `src/shared/project-adr-convention.md` opens with a relationship statement naming
      `effective-product`.
- [ ] In the review's status table, M-3 and M-5 read `withdrawn`; M-6 is the only remaining `open`
      M-row; L570–571 and L651 no longer describe a six-fragment move.
- [ ] Every new test assertion has been shown to fail under mutation and pass after restore.

## Validation plan

| Purpose                                 | Command                       | Expected result                                              |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| Formatting                              | `pnpm agent:check`            | exit 0 (run after `pnpm format`)                             |
| Unit suite incl. the new pins           | `pnpm test`                   | exit 0, new cases named                                      |
| Build guards (#167, ownership, budgets) | `node build.mjs`              | exit 0, no warning                                           |
| Archive/delivery layouts                | `pnpm test:distribution`      | exit 0                                                       |
| Eval staleness, informational           | `pnpm merge-gate-eval verify` | exit 0; staleness expected and not a blocker for this change |

Beyond the commands: each of the four new contract assertions is proven by removing the statement
it pins, observing the named failure, and restoring from a `cp` snapshot.

## Assumptions and open points

- Assumed: the user's decision covers both rows permanently, not "not now". If it is a deferral,
  the status value would be `deferred` rather than `withdrawn` and the review's correction bullet
  would read differently.
- Assumed: `effective-product` remains authoritative for ADR craft. This plan does **not** reverse
  that; it records that the declared convention and its resolution mechanism are the deferring
  side's contribution to that authority.
- Out of scope, deliberately: M-6 (still `open`, its upstream evidence withdrawn in `fcffae7`, and
  its re-assessment is not performed here); any write to the skills repository; the two open plans
  under `docs/plan/`; the merge-gate eval re-record itself; and `pr`'s absence from the
  `effective-delivery` relationship, which is a real gap but a different subject.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- **Error cases, Important — the checklist's fourth item is a decision the plan cannot make.**
  Step 4 would otherwise silently invent repository policy while appearing to transcribe an
  upstream requirement. Incorporated: it is recorded as the plan's single open point with a
  re-entry note and a named status-quo-preserving default, and step 4 is explicitly gated on it.
- **Scope, Note — declaring `setup` as a consumer exceeds the two named rows.** Incorporated: it
  is isolated in step 5, its rationale is stated in the architecture decisions, and it is marked
  as droppable without affecting any other step.
- **Architecture, Note — the two rows resolve for opposite reasons.** M-3 thins because upstream
  covers it; M-5 completes because upstream demands a declaration. Treating them as one symmetric
  "keep it local" change would either delete M-5's declaration or deepen M-3's duplication.
  Incorporated as an explicit architecture decision rather than left to the implementer.
- **Scope, Important — the thinning depth was an unmade decision (deep review, 2026-09-21).**
  Removing the Conventional Commit type set would have left a run without `effective-delivery` no
  vocabulary at all, while keeping everything would have preserved the second copy the ownership
  contract forbids. Resolved by the user: thin the two prose bullets, retain the type set as an
  explicitly labelled minimal fallback. Incorporated into step 2, the architecture decisions, the
  edge cases, and the acceptance criteria.
- **Error cases, Important — item 4 of the declaration checklist was unresolved (deep review,
  2026-09-21).** Resolved by the user: no update date and no change note; repository history
  carries earlier states. This declares current practice rather than changing it, so step 4 is no
  longer gated and the plan carries no blocking open point.
- **Testability, Important — step 1's verification could not fail.** `node build.mjs` exits 0 both
  before and after an authority paragraph is added, so the step had no discriminating check.
  Incorporated: step 1 now states that it is unverified until step 8's mutation of that sentence
  fails the suite. Steps 3, 4 and 5 were re-checked and do discriminate — the reverse check and
  guard #167 fire on exactly their wording.
- **Testability, Note — one acceptance criterion is not machine-checkable.** "No remaining bullet
  restates upstream substance" is a human comparison. Incorporated: it is split out and labelled as
  human judgment rather than sitting among criteria a command decides.
- **Maintainability, Note — the plan named no review focus.** Incorporated as
  `### Maintenance and review focus`: the enduring contract is one owner sentence plus an explicit
  override list per fragment, and the three things a reviewer should scrutinize, led by whether
  each override is still true.
- **Maintainability, Note — the upstream citations decay.** Two of the three ranges the precedent
  plan recorded had already moved by this planning run. Incorporated as step 0, with an explicit
  stop condition if the substance rather than the line range has changed.

## Implementation record

Delivered on 2026-09-21 from `origin/develop` at `91afe89`.

### What was built

M-3 and M-5 are closed as `withdrawn` — kept in Effective Flow, with the central skill named
authoritative and the local rules stated as explicit overrides. `effective-delivery` gained `commit`
and `commit-message-rules` as `delegate` consumers, `effective-product` gained `setup`,
`adr-convention` and `project-adr-convention`. The commit fragment was thinned of what upstream
already states and keeps one labelled minimal-fallback line; the ADR fragment now answers all five
items of the upstream living-record declaration checklist, with item 4 answered for the first time:
no update date and no change note.

### Deviations from the plan

1. **Step 0 paid off, and the plan's own citations were the casualty.** Two of the three upstream
   line ranges this plan recorded had already moved (`evidence-and-delivery.md:68–93` → `:65–91`,
   `adr-format.md:110–116` → `:111–115`). The substance was intact, so no stop condition fired. The
   implementation therefore cites upstream by **section heading** rather than by line number, which
   the plan did not ask for and which is the more durable form.

2. **The plan's budget premise was wrong.** It claimed the M-3 thinning would fund its own authority
   paragraph across seven tools and expected downward movement. The fragment grew from 15 to 22
   lines: removing two bullets recovers 2 lines against a 7-line authority paragraph. All eight
   affected budgets rose (`iterate` 1775→1782, `setup` 1723→1753, `apply-review` 1360→1393,
   `apply-issues` 1191→1199, `refactor` 885→892, `maintain` 685→692, `pr` 440→447, `commit`
   239→250). Every entry is its measured count plus at most ten lines and the guard is satisfied,
   but the premise did not hold and is recorded here rather than quietly dropped.

3. **Step 5 dissolved a guard-adjacent invariant, which was restored rather than accepted.** A
   pre-existing assertion banned the string `effective-product` from `project-adr-convention.md`
   **because** the #167 ADR ownership guard did not scan that file. Step 5 wrote exactly such prose,
   so the suite went red. The cheap repair would have been deleting the ban; instead the guard's
   scan set was widened to include the fragment, `docs/developer-guide/build-system.md` now
   documents five scanned files, and a new mutation-proven test pins that set. The protection is now
   carried by coverage instead of by prohibition.

4. **Two files outside the Affected-files table changed**, both necessary consequences: the twin
   exempt-by-kind enumeration in `build-lib.mjs` (comment only) and in
   `docs/developer-guide/build-system.md`. `test/build-lib.test.mjs` is named in the table but was
   left unchanged, because its existing reconciliation already parses the real manifest and covers
   the five new entries.

5. **Three overstated claims were caught before delivery**, all of the same family — a negative
   assertion about a foreign text that reached further than its evidence. "the skill states neither"
   (upstream does state the general `chore`-escape-hatch rule), "the ADR ownership guard passes on
   it" (the guard did not read that file at all), and "the determination procedure the skill omits
   on purpose" (upstream states no such intent).

### Test results

| Check                         | Result                                               |
| ----------------------------- | ---------------------------------------------------- |
| `pnpm agent:check`            | exit 0, 461 files                                    |
| `pnpm test`                   | exit 0 — 1135 tests, 1134 pass, 1 skipped, 0 fail    |
| `node build.mjs`              | exit 0, no budget warning, no guard violation        |
| `pnpm test:distribution`      | exit 0 — `distribution-smoke: offline checks passed` |
| `pnpm merge-gate-eval verify` | exit 0; all six scenarios `stale`                    |

The eval staleness is pre-existing — the archive was already stale for the 1.65.0 release. Five of
the six scenarios list `tools/iterate.md` in their drift set, which is the load-set seed this
change's commit-fragment edit is inlined into, so this work joins that debt rather than causing it.
The re-record is owed before the next release, not before this merge.

Every new contract assertion was proven by mutation in both directions, independently reproduced by
the validator in an isolated copy: nine mutations, each failing exactly its named test and each
recovering on restore from a `cp` snapshot. No mutation was silently absorbed.

## Review findings

**Date:** 2026-09-21
**Reviewer:** technical validation (tooling-only change; no product bucket routed)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

Four of the five were defects introduced by this run's own corrections rather than by the
implementing phases. One further finding — mixed German and English quotation marks in the
AI-attribution bullet — is pre-existing, untouched by this diff, and was closed as out of scope.

## Open points

- No open points.

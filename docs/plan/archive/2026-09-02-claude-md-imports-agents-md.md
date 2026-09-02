# Import AGENTS.md from CLAUDE.md and slim the canonical guidance

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `12f2ecb` on 2026-09-02 — the tip of `origin/develop`, which the checkout is
level with.
**Working state:** the tree carries two untracked plan files
(`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-20-plan-publication-before-implementation.md`) plus this file. Neither is
related to this plan and both must remain untouched.

## Requirement

The root `CLAUDE.md` is three lines: a `# CLAUDE.md` heading and the prose line
`Read and apply ./AGENTS.md` (`CLAUDE.md:3`). Commit `a6a7327` introduced it deliberately, as a
harness-neutral redirect — `AGENTS.md` is the one guidance file every coding agent shares, and
`CLAUDE.md` only points Claude Code at it.

That pointer is advisory. Claude Code loads `CLAUDE.md` verbatim into every session's context, but
`AGENTS.md` is read only if the agent decides to act on the sentence — a decision taken after the
context has already been spent, and one the model can skip. The Claude Code memory documentation
names the import for exactly this repository shape:

> Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already uses `AGENTS.md` for
> other coding agents, create a `CLAUDE.md` that imports it so both tools read the same
> instructions without duplicating them.
>
> — <https://code.claude.com/docs/en/memory> (§ AGENTS.md)

Two changes follow. This repository's own `CLAUDE.md` becomes the import, and `effective-flow setup`
offers the same to a target project, since setup already owns the target project's convention files
(`src/tools/setup.md:739` writes the `**Effective Flow project setup:**` marker into `AGENTS.md`,
falling back to `CLAUDE.md`, and creates a minimal `AGENTS.md` when neither exists).

The import is not free. Verified against the same documentation: imported files are _expanded and
loaded into context at launch_ alongside the importing file, they count toward the always-loaded
context of every request, and the documented target is **under 200 lines per memory file**. The root
`AGENTS.md` is **254 lines / 29,720 bytes** (~7–8k tokens). Turning the lazy pointer into an eager
import without slimming would move this repository in exactly the direction `21466f1`
("cut always-loaded context by deferring mode-gated fragments") moved it away from. `AGENTS.md`
therefore drops below 200 lines in the same delivery.

## Architecture decisions

- **Import, not prose.** `@AGENTS.md` replaces the sentence. The guarantee changes in kind, not
  degree: an import is resolved by the harness before the model sees anything, so the guidance is
  present rather than merely requested. Rationale: `docs/review/2026-08-31-architecture-and-consistency-review.md:124`
  already names this failure shape — "the gate exists, it is just evaluated after the context has
  already been spent".

- **Import, not a symlink.** The documentation offers `ln -s AGENTS.md CLAUDE.md` as an equivalent.
  Rejected: it costs the identical context, needs Developer Mode on Windows, and turns a readable
  one-line redirect into a filesystem property invisible in a file listing or a diff. Two real files
  stay.

- **Slim by inverting the canonical relation, not by deleting.** `AGENTS.md` is today the _declared_
  canonical source, and thirteen references across five developer-guide files point back at it.
  Eight of them **must change**, because they name a section this plan turns into a summary:
  `build-system.md:6` ("canonically in `AGENTS.md`; only a short summary follows here"),
  `build-system.md:340`, `build-system.md:517`, `architecture.md:129` (an anchor link into
  `AGENTS.md#skill-discovery`), `architecture.md:346`, `release-and-installation.md:4`,
  `release-and-installation.md:490`, `README.md:32`. Four are **verify-only**, because the sections
  they name stay canonical in `AGENTS.md`: `architecture.md:6` (language rules, commit conventions,
  no-AI-attribution, plan-file conventions), `plan-conventions.md:8`, `plan-conventions.md:135`,
  `skill-ownership.md:284` ("skill-discovery mechanics and contributor conventions"). Relocating
  text without visiting all thirteen would leave a pointer naming a section that no longer exists.
  Ownership therefore moves deliberately: the developer-guide document that already carries the short
  version becomes canonical for that topic, and `AGENTS.md` keeps the short form plus the link. This is
  the repository's own rule applied to itself — `AGENTS.md:141-167` requires that a source carry "**no
  second copy** of that playbook".

- **Ownership splits per rule, not per section.** The sections do not move wholesale, because the
  rules that must stay eagerly loaded live inside the sections being moved — moving the section and
  keeping the rule would create exactly the second copy the decision above forbids. The split is
  therefore: `AGENTS.md` stays canonical for the **rules** — a tool rename ships a deprecated
  forwarding alias and carries no `!`, a mistakenly breaking published commit is pinned forward with
  `Release-As:`, every `src/tools/*.md` needs a `CONTEXT_BUDGET_LINES` entry measured from the build
  report, versions are never bumped by hand — while the receiving documents become canonical for the
  **mechanics**: release-please wiring, the `TOOL_GROUPS`/`catalogHint` procedure, placeholder
  expansion, the ownership-audit procedure. Every rewritten pointer states which half it owns; a
  pointer that says only "canonical in X" is not precise enough after this change. Note that
  `docs/developer-guide/build-system.md:346-349` already carries the `CONTEXT_BUDGET_LINES` rule in
  short form, so that one is deduplicated toward `AGENTS.md` rather than away from it.

- **Selection criterion: inline what every session needs, link what only a task needs.** A rule an
  agent must not miss even when it is doing something else (edit `src/` never `dist/`, no
  Co-Authored-By trailer, no AI attribution, the language rules, the delegation mandate, the plan and
  concept file conventions) stays inline. A procedure consulted only while performing that exact
  task (the step-by-step for adding a tool, the placeholder expansion table, the release-please
  mechanics) moves. The criterion is what keeps this from becoming a token-count exercise.

- **Most moved content is already duplicated — but not all of it, and the difference matters.**
  `docs/developer-guide/build-system.md` § _Placeholder and directive syntax_ (`:35-125`) as a whole
  is a superset of the `AGENTS.md` table: its `:43-49` table carries the five Mustache rows with an
  added `Replacement` column, and the surrounding prose covers the two fence rows (` ```include `,
  ` ```ask `) that the `AGENTS.md` table adds. The Versioning move is **not** a relocation of
  duplicated text: `release-and-installation.md` § _Versioning with release-please_ duplicates only
  `AGENTS.md:170-173`; the deprecated-alias and `Release-As:` rules at `AGENTS.md:177-184` exist
  nowhere else in the repository. That section therefore gains new content rather than absorbing a
  copy. Likewise `AGENTS.md:62` ("Source frontmatter carries **no** `name` or `type` field") is
  duplicated in `architecture.md:53`, not in `build-system.md` — if it leaves `AGENTS.md`,
  `architecture.md` is its home.

- **`setup` declares no new configuration key.** The new step is an action, not a setting, and follows
  the precedent `src/tools/setup.md:824-826` sets for Step 7: it "declares no key, belongs to none of
  the Step 5 blocks, and adds nothing to the Step 6 write". Consequence: the ADR configuration table,
  `src/shared/config-migration.md`'s defaults, and the setup summary's key list are all untouched.

- **The new step is appended inside Step 6, not inserted as a new top-level step.** Step 6 already
  owns the convention-file writes (item 5 writes the marker), and it is the one step both paths reach
  — `src/tools/setup.md:252` sends express "directly to Step 6". Appending it as Step 6 **item 7**,
  after the existing item 6, renumbers nothing and is anchored by no test. The alternatives are all
  more expensive: inserting at item ≤ 5 breaks the `boundedSlice` stop marker
  `'\n5. **Set the AGENTS.md marker.**'` (`test/workflow-contracts.test.mjs:11130`, `:11159`) and with
  it four tests; a new top-level step before Step 7 breaks the section lookups at `:796` and `:819`;
  and one after Step 7 renumbers `### Step 8: Summary`, whose number is asserted in prose at
  `:11518-11523`. A Step 4 core switch would additionally require a `### Safe defaults` row, because
  express never reaches Step 4 — a cost this placement avoids entirely.

- **`setup` stays non-destructive; the conversion is narrowly predicated.** A `CLAUDE.md` is created
  only when absent. An existing one is rewritten only when it is a _pure prose pointer_ — heading
  and/or a single sentence referring to `AGENTS.md`, carrying no `**Effective Flow project setup:**`
  marker and no other instruction — and only after explicit confirmation. Any `CLAUDE.md` with content
  of its own is reported and left alone. The predicate is deliberately narrow: a false positive
  destroys a user's project guidance, a false negative only declines to help.

- **The question is unconditional, and express is not exempt from it.** Both paths pose it. The
  standard the repository already applies is `src/shared/project-adr-convention.md:68-70`: a fence is
  "deliberately **unconditional** rather than guided-path only, because it decides the path a file is
  written to rather than a presentation detail". Writing a new file into a target project's
  repository root is a write decision by that test, so express does not get a silent default: a run
  that cannot pose the fence — unanswered, skipped, or non-interactive — writes nothing and reports
  that the fence could not be posed. Item 5's precedent does not extend here: it creates a minimal
  `AGENTS.md` on express because setup cannot function without a marker host, whereas nothing
  requires a `CLAUDE.md` import. The fence follows the parsed contract at `build-lib.mjs:1763-1812`
  (`header` ≤ 12 chars, `question`, optional `type`, `when`, `language`, `options`).

## Affected files

| File                                               | Description                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                        | Replace the three-line prose pointer with the single line `@AGENTS.md`.                                                                                        |
| `AGENTS.md`                                        | Reduce below 200 lines: replace four sections with short forms plus links (see Approach step 2). Fix the stale link at `AGENTS.md:232`.                        |
| `docs/developer-guide/build-system.md`             | Absorb the placeholder table and the "Adding a tool or agent" procedure; become canonical for both. Adjust `:6`, `:340` **and `:517`**.                        |
| `docs/developer-guide/release-and-installation.md` | Absorb the versioning rules; adjust `:4` and `:490`.                                                                                                           |
| `docs/developer-guide/skill-ownership.md`          | Absorb the layered ownership contract. `:284` is verify-only — it names skill-discovery mechanics, which stay.                                                 |
| `docs/developer-guide/architecture.md`             | Repoint `:129` (anchor into `AGENTS.md#skill-discovery`) and `:346`. `:6` is verify-only. If `AGENTS.md:62` moves, it lands beside `:53`.                      |
| `docs/developer-guide/plan-conventions.md`         | Verify only — `:8` and `:135` stay correct, since the plan-file section stays canonical in `AGENTS.md`.                                                        |
| `docs/developer-guide/README.md`                   | Adjust the `AGENTS.md` description at `:32`.                                                                                                                   |
| `src/tools/setup.md`                               | Add Step 6 item 7 with its ` ```ask ` fence; extend the Step 8 summary; extend the goal list at `:13`; name the new write target in `## Rules` (`:975-978`).   |
| `build.mjs`                                        | Raise `CONTEXT_BUDGET_LINES.setup` (`:1427`, currently `1510`) to the newly measured value plus at most ten lines.                                             |
| `test/workflow-contracts.test.mjs`                 | Add contract assertions for the new Step 6 item 7 and its ask fence.                                                                                           |
| `docs/user-guide/tools-setup.md`                   | Document the new optional step in the `## /effective-flow setup` section (`:6-129`), stating that it adds no configuration key, as `:107-108` does for Step 7. |
| `docs/user-guide/configuration.md`                 | Adjust `## How /effective-flow setup maintains configuration` (`:587-606`) if the wizard flow description changes.                                             |
| `docs/developer-guide/configuration.md`            | Extend the setup write-set enumeration at `:141-142`, which otherwise omits the new `CLAUDE.md` target.                                                        |

## Implementation details

### Approach

1. **Replace the root `CLAUDE.md`** with the single line `@AGENTS.md`. Drop the `# CLAUDE.md`
   heading — the file's whole content is the import, and a heading only adds a line to every session.

2. **Slim `AGENTS.md` below 200 lines** by converting four sections to short form. Current section
   sizes measured on `12f2ecb`; the reduction is the plan's arithmetic, not a target to hit by
   cutting elsewhere:

   | Section                                                    | Lines now | Moves to                                                                     | Left behind | Saves |
   | ---------------------------------------------------------- | --------: | ---------------------------------------------------------------------------- | ----------: | ----: |
   | `### Placeholder / directive syntax in sources` (`:46-63`) |        18 | `build-system.md` § Placeholder and directive syntax                         |          ~2 |   ~16 |
   | `### Adding a tool or agent` (`:64-100`)                   |        37 | `build-system.md` § Adding a tool or agent                                   |         ~14 |   ~23 |
   | `## Skill discovery`, layered-ownership block (`:143-166`) |        25 | `skill-ownership.md` §§ The layered contract, Ownership check when extending |          ~4 |   ~21 |
   | `## Versioning` (`:168-185`)                               |        18 | `release-and-installation.md` § Versioning with release-please               |         ~13 |    ~5 |

   Two of these columns were wrong in an earlier draft and are corrected here, because the error ran
   in the flattering direction. The layered-ownership block is `:143-166`, not `:141-167` — `:141` is
   the tail of the preceding paragraph. And "left behind" has to absorb the per-rule split decided
   above: the `Release-As:` paragraph at `AGENTS.md:177-184` is 8 lines that stay, so Versioning saves
   ~5 and not ~13; the "Adding a tool or agent" residue must carry both the alias rule and the budget
   rule (`:91-99`, 9 hand-wrapped lines) plus a heading and pointer, so it saves ~23 and not ~29.

   Net effect ≈ −65 lines → ≈ **189 lines**, roughly 11 below the documented target rather than the
   ~27 an earlier draft claimed. The margin is real but thin. If the short forms need more room than
   estimated, they get it and a fifth section moves — `## Workflow actions are pinned to commits`
   (`:186-204`, 19 lines) is the standing candidate, a procedure consulted only when touching
   `.github/workflows/` and therefore squarely within the selection criterion. What must **not**
   happen is cutting one of the rules listed below to make the arithmetic work. What stays
   behind is not a bare cross-reference: each short form keeps the rules that are **not derivable**
   from reading the code, because those are what an agent gets wrong without ever knowing to look.
   Specifically, these must survive in `AGENTS.md` itself:
   - renaming an exposed tool ships a **deprecated forwarding alias**, carries no `!` and no
     `BREAKING CHANGE:`, and a mistakenly breaking published commit is pinned forward with a
     `Release-As:` footer rather than rewritten;
   - every `src/tools/*.md` needs a `CONTEXT_BUDGET_LINES` entry, and the number is read off the
     build's `Always-loaded core (lines/budget)` report, not `wc -l`;
   - versions are never bumped by hand.

   The delegation rules that `### Adding a tool or agent` step 4 currently restates (the
   `Agent, Task` grant, the banned `Agent(<type>)` form) are **already** carried by `## Delegation`
   at `AGENTS.md:101-125`; that duplication is internal to `AGENTS.md` and is removed by deleting
   step 4's body, not by moving it anywhere.

3. **Invert the canonical pointers.** In each receiving document, replace the "short version,
   canonical in `AGENTS.md`" qualifier with the full content and a note that `AGENTS.md` carries the
   short form. Every one of the nine references listed under Architecture decisions is visited; a
   pointer left claiming canonical status for a section that is now a summary is the main failure
   mode of this step.

4. **Fix two stale references caught in passing**, both inside sections this plan already rewrites:
   - `AGENTS.md:232` cites `docs/plan/0024-no-coauthor-trailer.md`; the file is at
     `docs/plan/archive/2026-07-16-0024-no-coauthor-trailer.md` after the legacy-plan migration.
   - `AGENTS.md:135` says per-agent recommendations live in a `## Empfohlene Skills` section. Nothing
     in the repository uses that German form: `AGENTS.md:157`, `src/shared/skill-discovery.md:10`,
     and `docs/developer-guide/skill-ownership.md:257`/`:276` all say `## Recommended skills`. It sits
     inside the Skill discovery section the layered-ownership move rewrites, so it is corrected there
     rather than left for a later sweep.

5. **Add Step 6 item 7 to `src/tools/setup.md`.** Insert it immediately after item 6's body ends at
   `:789` and **before** the `#### Rewriting a legacy prReview.* merge-gate block in place`
   subsection at `:790`. Item 6 is not the last thing in Step 6: that subsection runs `:790-810` and
   a step-level closing paragraph follows at `:812-814`. Appending after them would restart the
   ordered list below a `####` heading — mechanically tolerated by oxfmt, but wrong to read.
   - **Decide on the state item 5 saw, not the state item 5 left.** Item 5 writes the marker into an
     existing `CLAUDE.md` when the project has no `AGENTS.md`. In a project whose `CLAUDE.md` is a
     pure prose pointer and which has no `AGENTS.md`, item 5 therefore creates the very condition
     that disqualifies item 7 — the marker it just wrote reads as content, and the most valuable case
     silently declines. Item 5 records the `CLAUDE.md` state it observed, and item 7 decides on that
     recorded value, exactly as `<adr-convention>` is carried from Step 2 through Step 6 to Step 8.
   - **Determine the state** of `CLAUDE.md` in the target project: absent, a pure prose pointer, or
     content-bearing. The pointer predicate: the file contains no `**Effective Flow project setup:**`
     (or legacy `**Firmo project setup:**`) marker **as item 5 found it**, carries no `@AGENTS.md`
     import already, and its only non-blank, non-heading content is a single line referring to
     `AGENTS.md`. Anything else is content-bearing.
   - **A symlink at the `CLAUDE.md` path is a hard stop**, evaluated before the state classification
     and never softened into a reroute — the rule `src/tools/setup.md:679-680` already applies to the
     ADR write target, reused verbatim here. It guards two distinct shapes: a live
     `ln -s AGENTS.md CLAUDE.md`, which the Claude Code documentation itself sanctions as the
     alternative to an import, and a **broken** symlink, which reads as absent and would otherwise
     have item 7 follow a dangling link to an arbitrary path outside the repository.
   - **Absent** → pose the ask fence; create the file only on an affirmative answer.
   - **Pure prose pointer** → pose the ask fence, naming the exact line to be replaced.
   - **Content-bearing, or already importing** → write nothing; report the state, and do not pose the
     fence at all.
   - **A run that cannot pose the fence** — unanswered, skipped, or non-interactive — writes nothing
     and reports that the fence could not be posed. There is no silent default in either path.
   - The file written is one line, `@AGENTS.md`.
   - Reuse the marker step's non-destructiveness wording (`src/tools/setup.md:739`) rather than
     inventing a second phrasing.
   - The ask fence follows the parsed contract exactly (`build-lib.mjs:1762-1806`): fence and fields
     at column 0, `header` at most 12 characters, one `label:` line and one `description:` line per
     option. The fence carries no default — a run that cannot pose it, whether unanswered, skipped, or
     non-interactive, writes nothing and says the fence could not be posed. That is the pattern `src/shared/project-adr-convention.md:68-76` establishes.

6. **Name the new write target in `## Rules`.** `src/tools/setup.md:975-978` currently limits setup to
   changing `.gitignore`, the project setup ADR, the marker in `AGENTS.md`/`CLAUDE.md`, and the
   migration runtime targets. A `CLAUDE.md` written to hold an _import_ rather than the marker is a
   new target and must be named there, or item 7 contradicts the tool's own rule.

7. **Extend the Step 8 summary** to report which of the four outcomes occurred, alongside the marker
   location it already reports (`src/tools/setup.md:945`). Place the new bullet **outside**
   `:946-955` — the range from `- the ADR naming convention applied to that path` to
   `- for the capability step of Step 7` is a `boundedSlice` in
   `test/workflow-contracts.test.mjs:11537-11543`, and a bullet inserted inside it fails that test.

8. **Rebuild and re-measure.** `setup` is built at 1500 lines against a budget of 1510 — ten lines of
   headroom, so this change certainly exceeds it. `node build.mjs` prints the
   `Always-loaded core (lines/budget)` report; set `CONTEXT_BUDGET_LINES.setup` to that number plus at
   most ten. The guard fails the build until this is done, so it cannot be forgotten.

### Component structure

Not relevant — no code components change. `build.mjs` is touched only for one numeric budget entry.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

## Edge cases

- **An accidental import in `AGENTS.md`.** Once `AGENTS.md` is imported, any bare `@token` in it that
  sits outside a code span becomes an import Claude Code attempts to resolve. The file currently holds
  exactly one `@` — `actions/checkout@3d3c42e…` at `AGENTS.md:189` — and it is inside a code span, which
  the import parser skips. The slimming must not lift that token out of its backticks.
- **Transitive imports.** Imports recurse up to four hops. `AGENTS.md` has no `@path` references; its
  six relative links use `](path)` Markdown syntax, which is not import syntax. The import therefore
  pulls in exactly one file. Moving content _out_ of `AGENTS.md` into linked documents keeps it that
  way — the moved text becomes genuinely lazy, which is the point.
- **Imports outside the working directory** trigger a one-time approval dialog. `@AGENTS.md` is a
  sibling of `CLAUDE.md` inside the repository, so no dialog appears.
- **A target project whose `AGENTS.md` setup itself just created.** Item 5 creates a minimal
  `AGENTS.md` when neither convention file exists. Item 7 then offers a `CLAUDE.md` importing a file
  that contains only the marker line — correct but nearly empty. Offer it anyway: the import is about
  where guidance will accumulate, not about its size today.
- **A target project using Codex only.** A `CLAUDE.md` there is inert, not harmful, and `setup` cannot
  know the user's other harnesses. The unconditional question is what keeps this a choice on every
  path, rather than a file appearing in a Codex-only project's root because the user picked express.
- **A `CLAUDE.md` that already imports `AGENTS.md`.** Idempotent: detected, reported, not rewritten.
- **A pure prose pointer that also carries the setup marker.** Excluded by the predicate — the marker
  is content, and `src/shared/config-migration.md:15-16` reads it from `CLAUDE.md` as a fallback
  locator source. Replacing such a file with one line would delete a live configuration pointer.

## Acceptance criteria

- [ ] `CLAUDE.md` consists of the single line `@AGENTS.md`.
- [ ] `AGENTS.md` is under 200 lines, verified by `wc -l AGENTS.md`.
- [ ] No developer-guide document still describes a relocated section as canonical in `AGENTS.md`.
      Verified by `grep -rn 'AGENTS\.md' docs/developer-guide/` — 13 hits today — with each hit
      adjudicated against the new split. A `grep` for the word "canonical" is **not** sufficient:
      `release-and-installation.md:4` and `architecture.md:129` carry no form of that word, and the
      word returns 33 mostly-unrelated hits.
- [ ] Each receiving document gained the content it is now canonical for: `build-system.md`
      § _Placeholder and directive syntax_ carries every row of the former `AGENTS.md` table;
      § _Adding a tool or agent_ carries its steps in full; `release-and-installation.md`
      § _Versioning with release-please_ carries the deprecated-alias and `Release-As:` rules;
      `skill-ownership.md` §§ _The layered contract_ / _Ownership check when extending_ carry the
      build-enforced halves. Deleting a section without writing it anywhere must not pass.
- [ ] The non-derivable rules named in Approach step 2 are still present in `AGENTS.md`.
- [ ] `AGENTS.md` links to `docs/plan/archive/2026-07-16-0024-no-coauthor-trailer.md`, and
      `grep -n 'docs/plan/0024' AGENTS.md` returns nothing.
- [ ] `grep -n '@' AGENTS.md` returns only matches inside code spans.
- [ ] `src/tools/setup.md` Step 6 contains an item 7 with one ` ```ask ` fence whose `header` is at
      most 12 characters, and Step 8's summary reports the CLAUDE.md outcome.
- [ ] `### Step 7`, `### Step 8`, and Step 6 items 1–6 keep their current numbers and headings.
- [ ] `src/tools/setup.md` `## Rules` names the `CLAUDE.md` import among setup's permitted writes.
- [ ] Item 7's ask fence carries no guided-path gate, and its prose states that a run which cannot
      pose it writes nothing.
- [ ] Item 7 states the symlink hard stop on the `CLAUDE.md` path, evaluated before the state
      classification.
- [ ] Item 5 records the `CLAUDE.md` state it observed, and item 7's prose decides on that recorded
      value rather than re-reading the file.
- [ ] Step 8's new summary bullet lies outside the `:946-955` bullet range.
- [ ] `node build.mjs` succeeds, including the context-budget guard, with
      `CONTEXT_BUDGET_LINES.setup` set to the measured value plus at most ten.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass —
      the sequence `AGENTS.md:26` prescribes after editing distribution sources.
- [ ] `docs/user-guide/tools-setup.md` describes the new optional step.

## Validation plan

- Run the full prescribed sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Read the `Always-loaded core (lines/budget)` line for `setup` from the build output and confirm the
  budget entry matches it within ten lines.
- New contract tests in `test/workflow-contracts.test.mjs`, alongside the existing Step 7 assertions
  at `:796` and `:819`: assert that Step 6 item 7 exists, that it carries exactly one ask fence, and
  that its prose names all four `CLAUDE.md` states, the symlink hard stop, and the write-nothing
  behavior of a run that cannot pose the fence.
- Confirm the existing `boundedSlice` tests at `:11130`, `:11159` and `:11538-11543` still pass
  unchanged — they are the tripwire for accidental renumbering inside Step 6 and for a summary bullet
  landing inside the guarded Step 8 range.
- Manual check in a fresh Claude Code session in this repository after the change: run `/context` and
  confirm `CLAUDE.md` is listed under **Memory files** — the check the Claude Code documentation
  names, rather than the unfalsifiable "the guidance feels present".
- Manual check of link integrity: every relative link in the rewritten `AGENTS.md` and in the four
  receiving documents resolves.

## Assumptions and open points

- **Assumed:** the ~189-line result is an estimate from measured section sizes and estimated
  short-form lengths. The binding criterion is "under 200 lines". The margin is ~11 lines, so if the
  short forms need more room than estimated, `## Workflow actions are pinned to commits`
  (`AGENTS.md:186-204`) moves as well rather than any listed rule being cut.
- **Assumed:** `docs/developer-guide/plan-conventions.md` needs no ownership change, because the plan
  and concept file sections stay canonical in `AGENTS.md`. Verify during implementation.
- **Assumed:** no build guard requires any particular section to exist in `AGENTS.md`. Verified for
  the one guard that reads the file — the ADR ownership-contract guard (`build.mjs:341-367`) rejects
  only stale ADR claims and asserts no structure.
- **Assumed:** the documented "under 200 lines" target is stated for `CLAUDE.md` specifically;
  applying it to an imported file is an interpretation, not a quotation. It is a defensible one — the
  import is expanded into `CLAUDE.md`'s own context — and it is recorded as an interpretation so a
  later reader does not mistake it for a rule of the harness.

The three entries below are **resolved** decisions from the deep review of 2026-09-02, recorded as
assumptions rather than as open points: each was decided, none awaits an answer, and none blocks
implementation. Their re-entry notes say what would reopen them.

- **Accepted risk — the pointer predicate matches mention, not pointer semantics.** A `CLAUDE.md`
  whose single line says `Do NOT read AGENTS.md; follow docs/CONVENTIONS.md`, or which names a second
  path alongside `AGENTS.md`, passes the predicate and is replaced by an import that says the
  opposite. A whitelist of known pointer shapes was offered during review and **deliberately
  declined** in favor of the symlink hard stop alone. Re-entry: if a real project hits this, tighten
  the predicate to a whitelist and reject any line carrying a negation, a second path, or a second
  sentence.
- **Deliberate omission — no build guard keeps bare `@tokens` out of `AGENTS.md` prose.** A stray
  token resolves to a missing file, which is a no-op rather than a corruption, so a guard would cost
  more than the failure it prevents. Re-entry: if an accidental import is ever observed, add the check
  next to the ADR ownership-contract guard in `build.mjs`, reusing its `findStaleAdrContractClaims`
  shape.
- **Scope boundary — `setup` does not offer the conversion for a content-bearing `CLAUDE.md`.**
  Prepending the import rather than replacing the file risks doubled guidance, so it stays out of this
  delivery. Re-entry: revisit once the narrow predicate has seen real use.

## Plan review

**Result:** Approved

Three passes: the internal review that accompanied plan creation, the deep interactive review of
2026-09-02, and a structural revision on the same day.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         4 |    1 |
| Maintainability |        0 |         1 |    0 |

### Findings

#### Revision, 2026-09-02

- **Structure, corrected without a decision.** `effective-flow apply` stopped at the clarification
  gate: `## Open points` carried three entries, and that gate treats any entry other than the empty
  state as unresolved work blocking implementation. The three entries were resolved decisions from
  the deep review, not open questions — none was a "decide later" outcome. They moved into
  `## Assumptions and open points` as an accepted risk, a deliberate omission, and a scope boundary,
  each keeping its re-entry note, and `## Open points` now carries the canonical empty state. No
  content was dropped and no decision was reopened; only the section semantics were corrected.

#### Deep review, 2026-09-02

- **Architecture, important — the rules that must stay and the sections that must move were the same
  text.** Keeping the alias/`Release-As:` and `CONTEXT_BUDGET_LINES` rules inline while making the
  receiving documents canonical for their sections would have produced exactly the second copy the
  plan's own justification forbids. **Decided:** ownership splits per rule — `AGENTS.md` keeps the
  rules, the receiving documents take the mechanics, and every rewritten pointer says which half it
  owns. Incorporated as its own architecture decision.

- **Scope, important — the line arithmetic was wrong in the flattering direction.** The claimed
  ~173 lines rested on a mis-stated block range and a "left behind" column that ignored the 8-line
  `Release-As:` paragraph the plan itself mandates keeping. **Decided:** correct the table. The honest
  figure is ~189, about 11 lines under the target, with `## Workflow actions are pinned to commits`
  named as the standing fifth candidate if the short forms need more room.

- **Error cases, important — `setup` disqualified its own best case.** Item 5 writes the marker into
  an existing `CLAUDE.md` when no `AGENTS.md` exists, so in a prose-pointer project item 5 makes item
  7 see content and decline — the exact case that motivated this plan. **Decided:** item 5 records
  the state it observed and item 7 decides on that record.

- **Security, important — the predicate had no symlink guard.** A broken `CLAUDE.md` symlink reads
  as absent, so item 7 would have followed a dangling link to an arbitrary path outside the
  repository; a live `ln -s AGENTS.md CLAUDE.md` is a shape the Claude Code documentation itself
  sanctions. **Decided:** reuse the existing hard stop from `src/tools/setup.md:679-680`, evaluated
  before classification.

- **Scope, note — accepted residual risk in the pointer predicate.** The predicate tests that a line
  _mentions_ `AGENTS.md`, not that it _points at_ it. A whitelist of known pointer shapes was offered
  and **deliberately declined** in favor of the symlink stop alone. Recorded under assumptions rather
  than silently carried: a false positive rewrites a user's instruction into its inverse.

- **Scope, important — the express carve-out contradicted its own citation.**
  `src/shared/project-adr-convention.md:68-70` argues that a fence deciding _where a file is written_
  is deliberately unconditional rather than guided-only. **Decided:** the fence is unconditional, and
  a run that cannot pose it writes nothing — no silent express default.

- Eight further precision defects were corrected directly without a decision: the canonical-reference
  enumeration (thirteen references across five files, eight requiring change, four verify-only — the
  earlier "nine across six" was wrong in both directions and missed `build-system.md:517` and
  `architecture.md:129`); the overstated "superset" claim; a `grep` acceptance criterion that could
  not catch two of the references it existed for; the absence of any criterion verifying the
  _destination_ gained the moved content; an under-specified insertion point (item 6 is not the end
  of Step 6); six off-by-one citations; a missing criterion for the stale-link fix; and the stale
  German `## Empfohlene Skills` heading at `AGENTS.md:135`.

#### Initial review

- **Testability, important — `src/tools/setup.md` is densely pinned by string-literal test anchors,
  and three of them sit on the exact edits this plan makes.** A first draft of this plan would have
  broken two: a Step 8 summary bullet inserted in the natural place falls inside the `boundedSlice`
  at `test/workflow-contracts.test.mjs:11538-11543`, and any Step 6 insertion at position <= 5 breaks
  the stop marker at `:11130`/`:11159`. Incorporated: Approach steps 5-7 now name the safe positions
  explicitly, and two acceptance criteria assert them. The general lesson for the implementing run —
  in this file, _where_ a line goes is a correctness question, not formatting.

- **Architecture, important — the ownership inversion is the risky half, not the import.** Changing
  `CLAUDE.md` is one line and provably breaks nothing: no test, build guard, installer, or CI workflow
  reads the root `CLAUDE.md`. The slimming touches thirteen declared canonical pointers across five
  documents, and a missed one leaves a reference to a section that no longer exists. Incorporated:
  Approach step 3 makes visiting every one of them an explicit step, and an acceptance criterion
  greps for survivors rather than trusting the edit.

- **Scope, important — the two halves are independent and could ship separately.** The plan binds them
  because the import is what makes `AGENTS.md`'s size cost real; shipping the import alone would add
  ~7-8k always-loaded tokens per session against this repository's stated direction. Accepted as one
  delivery on the user's explicit decision. Documented rather than silently bundled.

- **Maintainability, important — moving guidance out of `AGENTS.md` re-creates the very laziness the
  import removes.** Content behind a link is read only if the agent follows the link. This is a real
  cost, not a neutral relocation. Mitigated by the selection criterion in Architecture decisions and
  by the explicit list in Approach step 2 of rules that must stay inline; the residual risk is
  accepted, because a 254-line always-loaded file trades against adherence in every session.

- **Scope, important — the new write target must be legalized, not just implemented.**
  `src/tools/setup.md:975-978` enumerates what setup may change. Writing a `CLAUDE.md` that carries an
  import rather than the `**Effective Flow project setup:**` marker is outside that list as written,
  so item 7 would contradict the tool's own rule while passing every test — nothing pins that
  sentence. Incorporated as Approach step 6 and an acceptance criterion.

- **Error cases, note — the prose-pointer predicate is the only destructive path in the plan.** It
  rewrites a user's file. Stated in three independent ways (Architecture decisions, Approach step 5,
  Edge cases) so the implementation cannot narrow it by accident; the marker exclusion in particular
  guards a live configuration locator.

- **Testability, note — "under 200 lines" is measurable but arbitrary.** It is the documented Claude
  Code target, not a project rule, and it is recorded here as the criterion so a later reader knows
  where the number came from rather than treating it as folklore.

## Implementation record

**Date:** 2026-09-02 · **Workflow:** `effective-flow build` · **Base:** `12f2ecb` on `origin/develop`

`AGENTS.md` went from 254 to 181 lines — 19 under the target, so the standing fifth candidate
(`## Workflow actions are pinned to commits`) did not need to move. `CLAUDE.md` is the single line
`@AGENTS.md`. `src/tools/setup.md` gained Step 6 item 7; no step or item was renumbered.

Two deviations from the plan, both deliberate and both because the plan was wrong:

- **Approach step 2 was factually incorrect.** It asserted that the old "Adding a tool or agent"
  step 4 rules — the `Agent, Task` grant and the banned parenthesised `Agent(<type>)` form — were
  "already carried by `## Delegation`". They were not; the parenthesised-form ban existed only in
  `docs/developer-guide/architecture.md`. Deleting step 4 as instructed would have dropped a
  security-shaped rule out of the always-loaded file, so both rules were folded into
  `## Delegation` instead.
- **Two documentation surfaces outside the Affected files table were stale.** Both
  `docs/user-guide/configuration.md` and `docs/developer-guide/configuration.md` enumerate what
  setup may write, and that set grew. The documentation sync gate closed them.

## Test results

| Check                    | Result                                                 |
| ------------------------ | ------------------------------------------------------ |
| `pnpm agent:check`       | passed — 323 files, oxfmt clean                        |
| `pnpm test`              | passed — 836/836, 0 fail (830 before; +6)              |
| `node build.mjs`         | passed — context-budget guard green, `setup 1561/1566` |
| `pnpm test:distribution` | passed — offline suite                                 |

Six contract tests were added for Step 6 item 7, purely additive (no existing assertion weakened).
Each was validated by mutation: a deliberate regression turns the intended test red.

**Not verified by this run:** the manual `/context` check that `CLAUDE.md` appears under **Memory
files** in a fresh Claude Code session. It needs a new session and is the one acceptance-adjacent
check that cannot run from inside this one.

## Review findings

**Date:** 2026-09-02
**Reviewer:** `effective-flow-code-validator` (tooling bucket; no product code in this repository)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     8 |
| Open / Not implemented |     1 |

One Critical finding was found and fixed: in the exact scenario item 7 exists for — a pure
prose-pointer `CLAUDE.md` in a project with no `AGENTS.md` — item 5 writes the configuration marker
into that `CLAUDE.md`, and item 7 then replaced the file wholesale. That destroyed setup's own
marker and left `@AGENTS.md` resolving to a nonexistent file. Item 7 now creates the minimal
`AGENTS.md` carrying the marker first, and Step 8 reports both writes so its two bullets cannot
contradict each other. The defect originated in the plan, whose edge-case list covered "neither
convention file exists" but not this case.

One Note is deliberately not implemented: item 7's column-0 fence ends Step 6's ordered list, so the
`#### Rewriting a legacy prReview.* merge-gate block in place` subsection now follows item 7 rather
than the items it elaborates. Column 0 is required by the build's fence parser, and every
alternative placement breaks existing test anchors. Recorded as a readability trade-off for a
separate change.

## Open points

- No open points.

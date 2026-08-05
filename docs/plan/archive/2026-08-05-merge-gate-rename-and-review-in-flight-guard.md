# Rename the merge gate and guard iterate against a review still in flight

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

The post-implementation flow on a pull request reads, in the user's words, as
`review <PR>` → `iterate <PR>` → `pr-review <PR>`. Two things are wrong with that picture, and the
naming is the cause of both.

**The tool named `pr-review` is not a reviewer.** It resolves a pull request, waits for its checks,
has failures repaired, waits for the configured review bots, and — if allowed — merges. It produces
no findings of its own and is explicitly forbidden from producing any. The name is already known to
be broken inside the source: `src/tools/pr-review.md` carries a section titled "The two things
called pr-review" whose entire job is to explain that the tool must not load the central `pr-review`
skill it shares a name with. A tool that needs a paragraph to say it is not the thing it is named
after is misnamed. `src/tools/setup.md` already calls it "the **merge gate**" throughout its prose —
the concept has a settled name; only the identifier lagged behind.

**`iterate` can start work on a review that has not finished.** In PR mode it reads the review
threads fresh and classifies them, with no notion of whether an automatic reviewer is still running
against the current head. A Greptile or recensor run that is mid-flight will add threads after
`iterate` has already classified, implemented, replied, and pushed — so the next round sees a head
that has moved and a reviewer that has to start over. The gate has a related but separate problem:
its "has this bot run for the current head?" test compares the bot's newest comment `createdAt`
against `headCommittedAt`, which cannot work for a reviewer that edits a sticky comment in place
(recensor does exactly that), because `createdAt` stops moving after the first review.

Three decisions were taken with the user before this plan:

1. the tool is renamed to **`merge-gate`** and moves from the "Ensure quality" group to
   "Deliver changes";
2. the `prReview.*` configuration keys are renamed to `mergeGate.*`, with the old names still
   accepted on read;
3. `iterate` gains a **review-in-flight guard** that blocks and asks once, and fails closed when it
   cannot ask.

**Why Feature and not Refactoring.** The bulk of the work is a rename, which is structural. But the
invocation `/effective-flow pr-review` stops working, and `iterate` gains a new blocking gate with a
user question. Both change observable behavior, so this is a Feature and needs `build`'s full test
and review pass, not `refactor`'s behavior-preserving one. The rename is a breaking change to a
user-facing command and must ship under a `feat!:` Conventional Commit so release-please marks it.

**Planning basis.** Planned against `ad5462e` on 2026-08-05, with a clean working tree across
`src/`, `build.mjs`, `test/`, and `docs/adr/`. Before starting, re-read `src/tools/pr-review.md`
Phase 3, `src/tools/iterate.md` Phase 0–2, `build.mjs` `TOOL_GROUPS`, and
`src/scripts/remote-tracker-core.mjs` `normalizeCheck`; those four are what every decision below
rests on. A change to the normalized `checks` envelope or to the caller-contract lines
(`Item filter:`, `Summary comment:`) invalidates this plan rather than merely moving its line
numbers.

### Out of scope

- The central `pr-review` **skill** keeps its name; it genuinely owns review-item judgment.
- The shared fragments `src/shared/pr-review-comments.md` and `src/shared/pr-review-integration.md`
  and the marker `<!-- effective-flow-pr-review -->` keep their names. They belong to the
  _review-publication_ concept, not to the gate. Renaming them would recreate exactly the confusion
  this plan removes.
- `delivery.prReview` keeps its name for the same reason: it decides whether a run publishes its own
  findings onto a pull request it created.
- Nothing in this plan changes what the gate does. Only its name, its group, its configuration
  namespace, and the source of its bot-freshness signal change.

## Architecture decisions

- **`merge-gate`, in "Deliver changes".** The group move is the larger clarity win and is
  independent of the name: `commit` → `pr` → `merge-gate` is then the complete delivery chain in one
  group, and `review` stands alone in "Ensure quality" as the only tool that actually reviews. The
  three other names considered are recorded under "Rejected alternatives" below.

- **`mergeGate.*` with one generation of read compatibility.** The keys are read from the
  project-setup ADR, so a target project that upgrades must not silently fall back to defaults —
  which is what a hard rename would do, turning a configured `merge` completion into `ask` and a
  configured bot list into "no bots expected". Reading `prReview.<key>` when `mergeGate.<key>` is
  absent, and reporting once that the legacy name was used, matches how this repository already
  handled the `firmo-` → `effective-flow-` label transition. Precedence is explicit: a present
  `mergeGate.<key>` always wins, and the two are never merged key by key at a finer grain than the
  individual key.

- **A new shared building block `src/shared/review-bot-state.md`** is the single contract for "is an
  automatic reviewer still running, and has it run for this head?". Both `merge-gate` Phase 3 and the
  new `iterate` guard consume it, so the two never drift into disagreeing about the same pull
  request. It defines a precedence, not a single test:
  1. a **commit status or check run** whose context is configured for that reviewer is the primary
     signal — `pending`/`in_progress` means running, a terminal state against the current head means
     it has run;
  2. the existing `createdAt` versus `headCommittedAt` comparison is the **fallback** for a reviewer
     with no configured check context;
  3. if neither is provable, the reviewer counts as **not having run** — the direction the gate
     already fails in, and the only safe one.

  This is what makes recensor usable: `recensor/review` is a real commit status and moves with the
  head, whereas its sticky comment's `createdAt` does not.

- **The gate's bot round becomes a three-way branch, not a two-way one.** Today `merge-gate`
  Phase 3 knows only "has run" and "has not run", and posts a trigger comment for the latter. Under
  a check-based signal that is wrong: a reviewer whose check is `pending` has not run _and must not
  be triggered_ — it is already working, and a trigger would either queue a redundant second run or,
  for a reviewer that treats a mention as a fresh request, discard the one in flight. The building
  block therefore reports three states, and Phase 3 branches on all three: **running** → wait only;
  **not started** → trigger, then wait; **has run** → proceed. The existing two-way behavior remains
  exactly what a reviewer with no configured `.check` gets, because the fallback signal cannot tell
  "running" from "not started". This is the one behavioral change to the gate in this plan, and it
  is a direct consequence of having a better signal — it is called out here rather than buried in
  the rename.

- **A new key `mergeGate.bots.<login>.check`** carries that context (for example `recensor/review`).
  It sits beside the existing `.trigger` key, uses the same dotted encoding that already tolerates a
  bracketed login, and is unset by default — an unset value selects the fallback in rule 2 above, so
  no existing project changes behavior.

- **No remote-helper change is needed.** `pr-status-read` already queries
  `statusCheckRollup.contexts` for both `CheckRun` and `StatusContext` nodes
  (`src/scripts/remote-tracker-core.mjs:906`), and `normalizeCheck` flattens both into one shape
  whose `name` is `item.name ?? item.context` and whose `status` is `PENDING` or `COMPLETED` with a
  `conclusion` (`:2104`). A commit status context and a check-run name are therefore already
  indistinguishable to a consumer, and `.check` is matched against that single normalized `name`
  field. This is why the building block can be written entirely at the instruction layer.

- **The `iterate` guard blocks and asks; non-interactive means abort.** A delegated, non-interactive
  run has nobody to answer the question, and continuing anyway is the failure mode the guard exists
  to prevent. `iterate` already has the vocabulary for this: it returns `ABORT` for a broken caller
  contract, and the gate already treats an `ABORT` as an unsuccessful round that blocks the merge.

- **The gate's own delegations are exempt, through a caller-contract line of their own.**
  `merge-gate` delegates to `iterate` only after it has itself established the bot state, so a guard
  that re-derived it would either duplicate the wait or deadlock the gate against a reviewer it is
  deliberately not waiting for. The exemption is announced as a **third caller-contract line**,
  `Review guard: established`, in the same shape as the two that already exist — its own line,
  exact literal form, parsed in Phase 0, and `ABORT: unparseable review-guard switch` on anything
  else.

  It deliberately does **not** ride on the `Item filter:` line, which was the obvious shortcut.
  That line means "scope this run", not "the bot state is already known"; the two coincide today
  only because `merge-gate` happens to be the sole caller that sets a filter. Coupling them would
  mean any future workflow that filters for scoping silently loses the guard — the exact class of
  bug this plan exists to remove. Exempting every non-interactive run instead is worse still:
  `apply-review` also delegates non-interactively and knows nothing about reviewer state, so
  precisely the runs that need the guard would lose it.

- **No alias for the old invocation.** `/effective-flow pr-review` will resolve to nothing, and the
  router's existing rule for an unknown tool prints the grouped catalog — which shows `merge-gate`
  in "Deliver changes". Keeping the router thin is an explicit value of this repository, and a
  redirect line would be permanent weight for a transitional problem. The rename is announced
  through the breaking-change marker, the changelog, and the user guide instead.

- **The gate's `pr-review`-skill exclusion survives the rename, in shorter form.** With the name
  collision gone, most of "The two things called pr-review" becomes unnecessary. What must stay is
  the rule itself and its reason: the central skill brings its own approve and request-changes
  submissions, its own CI recovery, and its own summary conventions, and this workflow forbids all
  three. That is a substantive constraint, not a naming artifact.

### Rejected alternatives

| Name      | Why not                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge`   | Reads as a promise the tool does not always keep — in `report` mode it deliberately never merges — and collides mentally with `git merge`.      |
| `land`    | Short and unambiguous, but angloamerican jargon; this repository ships to German-speaking teams and `language.project` is a per-target setting. |
| `pr-gate` | Keeps the `pr-` prefix whose adjacency to `pr-review` produced the confusion in the first place.                                                |

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/pr-review.md`                    | `git mv` to `src/tools/merge-gate.md`; retitle; replace `{{SKILL:pr-review}}` self-references; rewrite "The two things called pr-review" down to the surviving exclusion rule; rename every `prReview.*` key to `mergeGate.*`; add the `.check` key to the configuration table; rewrite Phase 3 onto the building block's three-way state, so the trigger fires only on **not started**; add `Review guard: established` to the delegation contract as a third mandatory line; add the `.check` context and the observed state to the wisdom-file record |
| `src/tools/iterate.md`                      | new **Phase 1.5: review-in-flight guard** with its `ask` fence; Phase 0 gains the `Review guard:` switch with its `ABORT` on an unparseable form, alongside the two existing caller-contract lines; `{{SKILL:pr-review}}` → `{{SKILL:merge-gate}}` (2); extend the wisdom-file list with the observed bot state and the branch taken; add the guard's `ABORT` to the rules                                                                                                                                                                               |
| `src/shared/review-bot-state.md`            | **new** — the shared precedence contract described above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/pr-review-comments.md`          | 7 × `{{SKILL:pr-review}}` → `{{SKILL:merge-gate}}`; **filename unchanged**                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/shared/documentation-sync-contract.md` | 2 × `{{SKILL:pr-review}}` → `{{SKILL:merge-gate}}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/config-migration.md`            | the `mergeGate.*` defaults plus the `prReview.*` read-compat mapping and its one-time report                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/tools/setup.md`                        | 3 × `{{SKILL:pr-review}}`; ~24 `prReview.*` occurrences; rename "Block 9: the merge gate (`prReview.*`)"; add the `.check` question per configured login; keep and sharpen the `delivery.prReview` disambiguation; **new**: rewrite a detected legacy `prReview.*` ADR block in place (see below)                                                                                                                                                                                                                                                        |
| `src/SKILL.md`                              | the frontmatter `description` tool list is **already stale** — it names neither `iterate` nor `pr-review`; add both, with `merge-gate` for the latter                                                                                                                                                                                                                                                                                                                                                                                                    |
| `build.mjs`                                 | `TOOL_GROUPS`: remove `'pr-review'` from `Ensure quality`, add `'merge-gate'` to `Deliver changes` after `pr`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/workflow-contracts.test.mjs`          | the group assertion at ~~:1312 now targets `Deliver changes`; every `src/tools/pr-review.md` path (~~:1401, :1411, :1438, :1485, :1511); add a guard that no source outside the two review-publication fragments still says `{{SKILL:pr-review}}`                                                                                                                                                                                                                                                                                                        |
| `test/build-lib.test.mjs`                   | exposed-tool list at ~:1103                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/tools-quality.md`          | move the whole `/effective-flow pr-review` section out; leave `review` alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tools-deliver.md`          | receives that section as `/effective-flow merge-gate`, after `pr`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/user-guide/README.md`                 | both index lines (group contents and the file table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/user-guide/remote-tracker.md`         | 6 references incl. the `#pr-review-gate-operations` anchor and its two inbound links                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/user-guide/configuration.md`          | 16 `prReview.*` occurrences plus the new `.check` key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/configuration.md`     | the `prReview` block description and the `delivery.prReview` disambiguation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/adr/effective-flow-project-setup.md`  | this repository's own `prReview.bots*` rows → `mergeGate.*`; add the recensor `.check` row when recensor is enabled here                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/developer-guide/skill-ownership.json` | rename the `iterate` consumer entry if its wording changes and **delete** the `{"consumer": "pr-review"}` entry — see below                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/skill-ownership.md`   | the matching prose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `README.md`                                 | 2 references in the tool-chain paragraphs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### A defect the rename surfaces

`docs/developer-guide/skill-ownership.json` currently declares
`{ "consumer": "pr-review", "classification": "delegate" }` under the `pr-review` skill — that is,
the manifest says the gate delegates to the central skill. The gate's own source says the exact
opposite, in bold: "Do not load the central `pr-review` skill in this run." One of the two is wrong,
and the source is right. The entry must be **removed**, not renamed to `merge-gate`. It survived
this long precisely because consumer and skill shared a name and the row read as a tautology.

## Implementation details

### Approach

1. `git mv src/tools/pr-review.md src/tools/merge-gate.md`, then edit in place. Doing the move as its
   own step keeps the rename reviewable as a rename.
2. Update `TOOL_GROUPS` in `build.mjs` and run `node build.mjs` early — the guards there catch a
   missing source, an unquoted `catalogHint`, and a tool missing from or duplicated across groups,
   so a broken move fails immediately rather than at the end.
3. Write `src/shared/review-bot-state.md` before touching either consumer, so both are written
   against a fixed contract rather than a moving one.
4. Rewrite `merge-gate` Phase 3 to consume the block: step 1 takes its state from there, and step 2's
   trigger becomes conditional on the **not started** state rather than on "not has run". The
   existing fail-closed language stays verbatim where it still applies — a state that cannot be
   established is still "has not run" and still blocks the merge.
5. Add `iterate` Phase 1.5. It runs after Phase 1's fresh read, because it needs the resolved pull
   request and the head SHA, and before Phase 2's classification, because classifying a thread set
   that is still growing is the thing being prevented.
6. Sweep the `{{SKILL:pr-review}}` references, then the `prReview.*` keys, then the documentation, as
   three separate passes. Mixing them is how a `delivery.prReview` or a fragment filename gets
   renamed by accident.
7. Update the tests last, and add the new guard test.

### The `iterate` review-in-flight guard

Placed as **Phase 1.5**, PR mode only.

- **Skip conditions, checked first.** Local mode has no pull request. A run that received
  `Review guard: established` was delegated by a caller that has already established the bot state —
  skip and record why. A project with no configured reviewers has nothing to observe — skip.
- **Observe** the state of every configured reviewer through `review-bot-state.md` against the
  freshly read head SHA.
- **Running** means at least one reviewer is in flight: a configured check context in a
  non-terminal state, or a trigger comment posted for this head with no reviewer output yet.
- **Ask once** when at least one reviewer is running, naming each one and what proved it. Three
  options: wait for it and re-read, proceed anyway, or abort. "Wait" uses one bounded blocking wait
  and one re-read — the same single-wait shape `merge-gate` Phase 3 uses, deliberately not a poll
  loop — and if the reviewer is still running afterwards, the run ends with a report rather than
  chaining a second wait.
- **Fail closed when the question cannot be asked.** A non-interactive run that did not receive
  `Review guard: established` returns `ABORT: review still in flight`, naming the reviewers.
- **Record** the observed state, the branch taken, and any wait in the wisdom file.

### Configuration changes

| Key                              | Values                             | Default   | Note                               |
| -------------------------------- | ---------------------------------- | --------- | ---------------------------------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     | renamed from `prReview.completion` |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    | renamed                            |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      | renamed                            |
| `mergeGate.maxRounds`            | positive integer                   | `3`       | renamed                            |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      | renamed                            |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` | renamed                            |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     | renamed                            |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     | **new**                            |

`delivery.prReview` and `delivery.mergeMethod` are untouched.

### Edge cases

- **A project configured under `prReview.*` upgrades.** Every key resolves through the legacy name,
  behavior is identical, and the run reports once that the legacy namespace was read and that
  `/effective-flow setup` migrates it. It does not migrate the ADR by itself — `setup` owns writing
  configuration.
- **Both `mergeGate.completion` and `prReview.completion` are present.** `mergeGate` wins, per key,
  and the shadowed legacy key is reported.
- **A reviewer has a configured `.check` context that never appears** (misconfigured, or the app is
  not installed). It is indistinguishable from "about to appear", so it counts as not having run:
  `iterate` asks, and `merge-gate` blocks and names the missing context. This is the same direction
  the gate already fails in, and the reason recensor issue #13 exists.
- **A reviewer's check is terminal but its threads arrive moments later.** The guard is a narrowing,
  not a proof; `iterate`'s existing fresh read before every write still applies.
- **`iterate` is invoked interactively on a pull request the gate is also driving.** Out of scope, as
  it already is — the gate holds no lock, and `iterate`'s commit mutex protects the index.
- **A user types `/effective-flow pr-review`.** Unknown tool: the router prints the grouped catalog,
  in which `merge-gate` now sits under "Deliver changes".

### `setup` migrates a legacy block in place

When `/effective-flow setup` finds `prReview.*` rows in the project-setup ADR, it carries their
values over to `mergeGate.*`, **removes the old rows**, and reports that it did so. It does not
leave both blocks standing.

Nothing breaks if it did — the read fallback resolves `mergeGate` first either way. The reason to
remove is human: two adjacent blocks of plausible-looking configuration, one of them inert, is
exactly the kind of artifact where a later maintainer edits the dead one and cannot work out why
nothing changed. `setup` is the only writer of the ADR and already owns a comparable migration for a
legacy `.effective-flow/config.json`, so the pattern and the authority both exist.

Two constraints on the rewrite:

- **Only `setup` migrates.** A `merge-gate` or `iterate` run that reads through the fallback reports
  it and points at `setup`; neither writes configuration. That boundary is unchanged.
- **A shadowed key is reported, not silently dropped.** If both `mergeGate.<key>` and
  `prReview.<key>` are present with different values, `setup` keeps the `mergeGate` value, names the
  discarded one, and does not merge them.

### Stop conditions

Stop and return to planning rather than improvising when:

- `node build.mjs` reports a dangling `{{SKILL:pr-review}}` in a file this plan's table does not
  list — the reference sweep is incomplete and the table is wrong, not the build.
- `pr-status-read`'s normalized `checks` array turns out not to carry the reviewer's context under
  `name`. The whole check-based signal rests on that; a helper change is out of this plan's scope.
- Renaming a `prReview.*` key would require touching `delivery.prReview` or either
  `pr-review-*.md` fragment to keep something compiling. That is the signal that the sweep has
  crossed from the gate into the review-publication concept, which is explicitly out of scope.
- The `iterate` guard cannot be expressed without reordering or renumbering `iterate`'s existing
  phases. Phase 1.5 is chosen precisely so nothing existing moves.

## Acceptance criteria

- [ ] `node build.mjs` succeeds and `merge-gate` appears in the "Deliver changes" group of all three
      built routers, immediately after `pr`; `pr-review` appears in none of them.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass — the
      sequence CI runs, per `AGENTS.md`.
- [ ] A test asserts `merge-gate` sits in the `Deliver changes` group of `TOOL_GROUPS` (replacing the
      `Ensure quality` assertion at `test/workflow-contracts.test.mjs:1312`).
- [ ] `node build.mjs` reports no `Unknown tool reference {{SKILL:pr-review}}`. **No new test is
      needed for this**: `build-lib.mjs:216` already fails the build on a `{{SKILL:X}}` naming a tool
      that does not exist, and CI runs the build. Running it right after the `git mv` enumerates
      every dangling reference at once, which is why it is step 2 of the approach rather than a
      final check.
- [ ] A new test asserts that `src/shared/pr-review-comments.md`,
      `src/shared/pr-review-integration.md`, and the literal `<!-- effective-flow-pr-review -->` all
      still exist under their current names — the guard against an over-eager sweep.
- [ ] A new test asserts `src/shared/review-bot-state.md` exists and is loaded by both
      `src/tools/merge-gate.md` and `src/tools/iterate.md`.
- [ ] A new test asserts that `src/tools/iterate.md` contains a review-in-flight guard section
      naming the `Review guard: established` exemption and the non-interactive `ABORT`, and that
      `src/tools/merge-gate.md` announces that same literal line in its delegation contract. Assert
      both ends: a switch one side stops sending and the other still requires is the failure mode
      this contract style is prone to.
- [ ] A new test asserts that `src/tools/merge-gate.md` Phase 3 branches on three reviewer states
      and that its trigger step is conditioned on **not started**, not on "has not run".
- [ ] A new test asserts that `src/tools/setup.md` describes rewriting a legacy `prReview.*` ADR
      block in place, including removal of the old rows and the report of a shadowed key.
- [ ] `src/shared/config-migration.md` documents every `mergeGate.*` key with its default and the
      `prReview.*` read fallback; a test asserts each of the eight keys appears there.
- [ ] The `src/SKILL.md` `description` tool list names `iterate` and `merge-gate`.
- [ ] `docs/developer-guide/skill-ownership.json` contains no consumer entry named `pr-review` or
      `merge-gate` under the `pr-review` skill.
- [ ] No prose outside `docs/plan/archive/` and `CHANGELOG.md` names `/effective-flow pr-review` or
      describes a **tool** called `pr-review`. Checked as: `grep -rn "effective-flow pr-review"`
      returns nothing outside those two, and every surviving literal `pr-review` is one of exactly
      three permitted kinds — the central **skill** name, one of the two fragment filenames
      (`pr-review-comments`, `pr-review-integration`), or the marker
      `<!-- effective-flow-pr-review -->`. The criterion names the three rather than asking for a
      bare zero match, because telling them apart is the entire point of this change.
- [ ] `/effective-flow merge-gate` on a pull request in this repository reaches Phase 4 and reports
      its merge-readiness. Behavior is unchanged from before the rename **except** the three-way bot
      branch: a reviewer with a configured `.check` in a non-terminal state is waited for and **not**
      triggered.
- [ ] The delivery commit for the rename uses a `feat!:` Conventional Commit subject.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in that order.
- Inspect `dist/claude/effective-flow/SKILL.md`, `dist/codex/…`, and
  `dist/portable/effective-flow/SKILL.md` for the group placement and for the absence of `pr-review`
  in the catalog — the version-drift guard covers the version stamp but not the catalog.
- `grep -rn "{{SKILL:pr-review}}" src/` returns nothing.
- `grep -rn "prReview\." src/` returns only the read-compat mapping in `config-migration.md`, the
  `delivery.prReview` occurrences, and the `setup.md` disambiguation.
- Manual: run `/effective-flow merge-gate` against an open pull request of this repository in
  `report` mode and confirm it resolves, waits, and reports without merging.
- Manual: run `/effective-flow iterate <PR>` while a recensor review is in flight and confirm the
  guard fires and names `recensor/review`.

## Assumptions and open points

- The `.check` value matches the normalized `name` of an entry in `pr-status-read`'s `checks` array.
  That covers a GitHub commit-status context (recensor's `recensor/review`) and a check-run name
  equally, because the helper already collapses both into the same field — verified, not assumed.
  Forgejo reports no such rollup, so a Forgejo project stays on the fallback path; the gate is
  report-only there anyway.
- Greptile has **no** usable check context today — it acknowledges with an emoji reaction, which the
  helper cannot read. It therefore stays on the fallback path, and the `iterate` guard will not fire
  for a Greptile run in flight. This is a known, documented limitation, not something this plan
  fixes.
- recensor's side of the contract is filed as
  [sebastian-software/recensor#13](https://github.com/sebastian-software/recensor/issues/13): the
  `recensor/review` status is currently set at worker-claim time rather than at enqueue, so a queued
  pull request shows no recensor check at all. Until that ships, a recensor-configured project can
  see the gate merge a pull request recensor was seconds from reviewing. **This plan does not depend
  on that issue being closed** — the building block treats an absent context as "has not run" — but
  the `iterate` guard and the gate's bot round only become reliable for recensor once it is.
- The `Review guard: established` line is a **third** caller-contract switch on `iterate` Phase 0.
  Three is where this pattern stops being obviously right: each one is another literal string two
  files must agree on, and the failure mode is silent on one side. If a fourth is ever wanted, the
  three should first be folded into one structured caller-context block rather than extended. Noted
  as the maintenance trigger, not as work for this plan.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         1 |    1 |

Reviewed in two passes: an initial review while the plan was written, then a deep interactive review
that added the architecture, testability, and maintainability findings below and settled two
decision points with the user.

### Findings

- **Scope, important — the rename and the guard are separable and should ship separately.** The
  rename touches ~20 files mechanically and carries a breaking-change marker; the guard is a
  behavioral change in one tool plus a new shared fragment. Bundling them means a revert of either
  drags the other along, and it makes the breaking commit larger than the breaking change actually
  is. _Incorporated as guidance rather than as a split plan:_ the implementation approach above is
  ordered so steps 1–2 and 6–7 (the rename) and steps 3–5 (the guard) form two coherent commit
  groups within one delivery. A hard split into two pull requests would leave the intermediate state
  with `iterate` referencing a shared block whose only other consumer is still named `pr-review`,
  which is worse than one well-ordered delivery.
- **Error cases, important — "fail closed" must not mean "block forever".** The guard counts an
  unprovable reviewer state as running, and a misconfigured `.check` context is unprovable
  permanently. Without a way out, such a project's `iterate` runs abort every time.
  _Incorporated:_ the guard asks rather than aborts whenever it can ask, and "proceed anyway" is one
  of its three options; only a non-interactive run aborts, and that run has a caller who can be told.
  The `merge-gate` side already reports the missing context by name, so the cause is visible.
- **Architecture, important — the guard's exemption was coupled to the wrong signal.** The plan
  originally exempted a run from the review-in-flight guard when it carried an `Item filter:` line.
  That line means "scope this run", not "the bot state is already established"; the two coincide only
  because `merge-gate` is currently the sole caller that filters. Any future workflow that filtered
  for scoping would have lost the guard silently — the same class of bug the guard exists to prevent.
  _Decided with the user and incorporated:_ a third caller-contract line, `Review guard: established`,
  announced explicitly by `merge-gate` and parsed with the same fail-closed discipline as the other
  two.
- **Architecture, important — a check-based signal makes the gate's two-way bot branch wrong.**
  `merge-gate` Phase 3 knows only "has run" and "has not run", and triggers the reviewer for the
  latter. With a `pending` check that reading would post a trigger at a reviewer already working,
  queueing a redundant run or discarding the one in flight. The finding is a consequence of the plan's
  own improvement, so the plan had to own it. _Incorporated:_ the building block reports three states
  and Phase 3 branches on all three; the old two-way behavior is what a reviewer without a configured
  `.check` still gets, because the fallback signal genuinely cannot distinguish them.
- **Testability, important — one proposed test was redundant and one criterion was unverifiable.**
  `build-lib.mjs:216` already fails the build on a `{{SKILL:X}}` naming a nonexistent tool, so the
  proposed "no source contains `{{SKILL:pr-review}}`" test duplicated an existing guard that CI
  already runs. Separately, "no file refers to a tool named `pr-review`" cannot be checked
  mechanically, because the skill name, two fragment filenames, and the marker all legitimately
  contain that string. _Incorporated:_ the redundant test is replaced by a reference to the build
  guard, and the criterion now enumerates the three permitted kinds of surviving literal.
- **Maintainability, important — a legacy `prReview.*` ADR block would have accumulated.** With the
  read fallback in place nothing breaks, but `setup` writing `mergeGate.*` beside a surviving
  `prReview.*` block leaves two plausible-looking configuration blocks of which one is inert.
  _Decided with the user and incorporated:_ `setup` rewrites the block in place, removes the old
  rows, and reports a shadowed key rather than merging it.
- **Testability, note — the plan had no drift anchor and no stop conditions.** _Incorporated:_ a
  planning basis (`ad5462e`, clean tree, the four files every decision rests on) and four stop
  conditions, each tied to an actual uncertainty rather than to generic caution.
- **Architecture, note — the `.check` key could arguably live under `delivery.*` rather than
  `mergeGate.*`,** since `iterate` now reads it too and `iterate` is not the gate. It stays under
  `mergeGate.bots.<login>` because that is where the login and its trigger already live, and
  splitting one reviewer's three properties across two namespaces is worse than one consumer reading
  slightly outside its own block.
- **Maintainability, note — the read-compat layer is permanent weight** unless it is given an end.
  This repository's precedent is "one generation of read backward compatibility" for the `firmo-`
  label prefix. The same wording should be attached to the `prReview.*` fallback in
  `config-migration.md`, so a later maintainer knows it is removable rather than load-bearing. The
  `setup` in-place migration decided above shortens its useful life considerably: once every target
  project has run `setup` once, the fallback has no remaining reader.

## Test results

`pnpm agent:check` → clean (265 files). `pnpm test` → 475 pass, 0 fail (474 before this change: 16
contract tests retargeted, 1 deleted, 10 added). `node build.mjs` → all three targets built, 19
exposed tools + 7 internal, version-drift and always-loaded-core budget guards pass.
`pnpm test:distribution` → offline checks pass.

`merge-gate` was verified in the built output of all three routers, in the `Deliver changes` group
immediately after `pr`, with zero `/effective-flow pr-review` invocations remaining anywhere.

The new fail-closed rule was mutation-tested rather than assumed: inverting
`Anything unprovable counts as not started` to `has run` in `src/shared/review-bot-state.md` fails
`the reviewer-state contract pins its three states and its fail-closed precedence`, and reverting
restores 475/475.

## Deviations from the plan

- **The build's own guards found the manifest defect first.** The plan predicted the
  `{"consumer": "pr-review"}` entry in `skill-ownership.json` had to be removed. In practice
  `node build.mjs` refused to build immediately after the `git mv` with
  `Unknown Effective Flow consumer "pr-review"`, and a test — `skill-ownership.json lists pr-review
as a delegate consumer of the pr-review skill` — asserted the wrong entry. Reading that test
  showed its real subject was the _name collision_, not a delegation relationship, so it was deleted
  rather than retargeted and replaced with a negative assertion.
- **One file outside the plan's table needed a change:** `src/scripts/remote-tracker-core.mjs`
  carried `prReview.requireAllChecks` in a rationale comment. Comment-only, no behavior change.
- **`docs/user-guide/tools-implement.md` was added to the scope.** It is `iterate`'s own user
  documentation and the plan's table missed it; the documentation sync gate caught it. Leaving it out
  would have documented the new guard only from the gate's side.
- **The gate's bot round gained a behavioral change the plan anticipated but the rename did not
  require:** Phase 3 now branches three ways, so a reviewer whose check is still running is waited
  for rather than triggered.

## Review findings

**Date:** 2026-08-05
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    12 |
| Open / Not implemented |     7 |

0 Critical, 6 Important, 13 Note. All 6 Important were fixed, along with 6 Notes. The 7 that remain
are all Notes and none blocks the change.

The three that mattered most, all fixed: `iterate` Phase 1.5 consumed `pr-status-read` data that
Phase 1 never fetched, so the new guard could not execute as written; the new review-guard test's
direction assertion was satisfied by the item's own opening sentence, so an inversion of the
fail-closed rule would have shipped green; and the new shared contract — the single source of
reviewer-state precedence for two consumers — had no content assertion at all.

**External review report:**
`.effective-flow/review/review-report-2026-08-05-plan-merge-gate-rename-and-review-in-flight-guard.md`

## Open points

- No open points.

# Merge-gate context and source slimming

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`/effective-flow refactor`)

## Requirement

`src/tools/merge-gate.md` is by far the longest tool source in the repository and the most
expensive tool to invoke. It should become shorter **without losing any functionality** — no rule,
no guard, and no anti-simplification argument may be dropped in the process.

All line numbers refer to `origin/develop` at `61d8286` (2026-08-28). The plan was first written
against `455caf2` (2026-08-12) and re-baselined on 2026-08-28 after twelve commits had changed the
file; the earlier figures are kept only in the plan-review history below. The implementing run
**must** start from an up-to-date `develop` — planning against a stale checkout produced wrong
findings twice already.

### Verified baseline

| Measure                                    | 2026-08-12 (`455caf2`) | **Now (`61d8286`)** |
| ------------------------------------------ | ---------------------: | ------------------: |
| `src/tools/merge-gate.md`                  |                   1332 |            **2626** |
| Eagerly included fragments, fully expanded |                   1670 |            **2182** |
| **Always-loaded core at invocation**       |                   3002 |          **≈ 4800** |

Per-fragment eager cost, nested includes expanded:

| Fragment                                                                        | Fence                        |                                                          Expanded lines |
| ------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------: |
| `worktree-integration`                                                          | `merge-gate.md:177`          | **880** (own 477 + `execution-location` 168 + `worktree-lifecycle` 238) |
| `pr-review-comments`                                                            | `:181`                       |                                                                     374 |
| `review-bot-state`                                                              | `:185`                       |                                                                     271 |
| `issue-lifecycle`                                                               | `:104`                       |                                                                     269 |
| `config-migration`                                                              | `:100`                       |                                                                     193 |
| `language-rules`                                                                | `:52`                        |                                                                      79 |
| `skill-discovery`                                                               | `:113`                       |                                                                      55 |
| `completion-protocol`, `task-tracking`, `goal-completion`, `delegation-mandate` | `:127`, `:56`, `:131`, `:60` |                                                                      58 |

Source-text composition, measured section by section: **≈ 39 % normative mechanics, ≈ 44 %
rationale/anti-simplification prose, ≈ 17 % restatement of something already stated in the same
file**. `## Rules` (2536–2626, 26 bullets) is 96 % restatement and introduces no mechanics stated
anywhere else; `## Edge cases` (2240–2535, 74 bullets) is about 75 %.

### The growth rate is the real problem

merge-gate gained **+1294 source lines in 16 days** across twelve commits, while every sibling tool
stayed flat: the next largest deltas are `iterate` +221 and `plan-issue` +139, twelve tools are
unchanged, and five shrank. merge-gate is now **23.8 % of the whole tool corpus** and three times
the next largest source. Its `## Rules` is 8× the repository median, and its `## Edge cases` — a
section only one other tool has at all — is 42× that precedent.

This reframes the work. The reductions below recover roughly what one month of ordinary development
adds. **Without the budget guard of WP6 the saving evaporates within weeks**, which is why that
package is not optional and not cosmetic.

### Expected core size per package

| After                                                | Always-loaded core |
| ---------------------------------------------------- | -----------------: |
| baseline                                             |             ≈ 4800 |
| WP1 (defer `worktree-integration`)                   |             ≈ 3920 |
| \+ WP2 (defer `language-rules`)                      |             ≈ 3840 |
| \+ WP3 (split `issue-lifecycle`)                     |             ≈ 3654 |
| \+ WP4 (split `config-migration`)                    |             ≈ 3564 |
| \+ WP5 (dissolve `## Edge cases`, compress the rest) |             ≈ 3152 |
| \+ WP7 (split `pr-review-comments`)                  |             ≈ 3077 |

## Architecture decisions

### Defer before deleting

The primary instrument is `lazy-include`, not text removal. It moves a fragment out of the
always-loaded core while keeping every line available at its decision point, so the saving carries
no functional loss. `docs/developer-guide/build-system.md:319-350` sets the admission test: a
fragment qualifies "only when it serves one nameable decision point and the pointer states that
trigger", and a fragment "read in nearly every run anyway" stays inline because deferring it "would
move the measured number without saving anything real".

That policy list already names `worktree-integration`, `config-migration` and `language-rules` on
the **lazy** side. merge-gate including them eagerly is a deviation from the documented default, not
a protection.

### Only three fragments pass the admission test

Re-checked against the current file, fragment by fragment:

- **`worktree-integration` — defer.** Used only where Phase 2 step 1 provisions a checkout because
  the fresh read reports the head branch `BEHIND` or `DIRTY` (`merge-gate.md:1121-1155`), plus the
  lifecycle transitions that follow from it. Observer-only mode never reaches Phase 2 at all.
- **`language-rules` — defer.** merge-gate authors no localized prose: the bot trigger is the
  configured text verbatim (`:1319`) and Phase 6 is chat output. Its only three uses hand resolved
  values to delegates (`:445`, `:584`, `:632-633`).
- **`issue-lifecycle` — split, then defer the larger half.** Its receipt section is read in Phase 0
  step 1 on every pull request (`:853-861`), so the fragment cannot be deferred whole; its
  `### Post-merge observation` half (186 lines) is reached only from Phase 5.5.
- **`review-bot-state` — keep eager.** Phase 1 rule 1 matches every comment author through
  "Matching a configured login" (`:959-961`) on **every** run, and rule 2's `[bot]`-trim boundary
  cites the same section (`:978-982`). Any trigger would fire in Phase 1.
- **`pr-review-comments` — keep eager, split only as an optional package.** Phase 0 step 1 is the
  workflow's first instruction and resolves the pull request through it (`:849-851`).
- **`config-migration` — keep eager, split instead.** Phase 0 step 3 resolves `mergeGate.completion`
  before any wait, delegation or write (`:904-911`). This is exactly the case the policy names as
  not worth deferring.
- **`skill-discovery` — keep eager, do not defer.** Its trigger would be self-referential: the
  fragment is what tells a run to survey skills at all. It also carries run-wide rules rather than
  one decision — the orchestration-versus-domain authority contract at
  `src/shared/skill-discovery.md:30-51` governs every later phase.
  `docs/developer-guide/build-system.md:328` lists it under "Core flow stays inline", and all 33
  consumers include it eagerly.

### The wisdom write does not block WP1

Deferring `worktree-integration` looks like it would strand the every-run wisdom write at
`merge-gate.md:768-771`, because `RUNTIME_STATE_ROOT` and `EXECUTION_ROOT` are defined in
`execution-location`, which that fragment includes at `src/shared/worktree-integration.md:38`.
It does not: `src/shared/runtime-state-safety.md:4` **also** includes `execution-location` eagerly,
and merge-gate already loads `runtime-state-safety` lazily at `:85-88` on the trigger "any wisdom,
runtime migration, or worktree mutation below `.effective-flow/` is imminent" — which is precisely
the wisdom write. WP1 therefore saves the full 880 lines and needs no compensating eager include.
Verified directly; do not re-add `execution-location` as a sibling "to be safe", because the
duplicate would cost 168 lines for nothing.

### Rationale prose stays in the tool, compressed

The ~1150 lines of "why this rule must not be simplified" are load-bearing, and the current file has
far denser test coupling than when this plan was first written: **470 assertions** in
`test/workflow-contracts.test.mjs` take merge-gate text as their subject, including **255
`near(a,b,span)`** character-distance windows, **15** `ordered()` calls and **19** distinct headings
sliced by `section()`. The three verified tightest windows are one of 40 characters and two of 60. Every compressed passage keeps its
claim and its key terms; only its length is reduced. Nothing moves into a fragment, an ADR, or the
archive.

**A mechanical dedupe will find nothing.** The duplication is semantic, not lexical: a
verbatim-sentence detector finds only three repeated sentences in 2626 lines, and 4-gram overlap
between a `## Rules` bullet and its origin averages ~20 %. Each restatement has to be judged by a
reader.

### Recently written passages are frozen for this pass

1030 lines — **39 % of the file** — are at least 75 % new and at most 13 days old, three of them
from the head commit: `### Phase 5.5` (1816–2116, 100 % new), `#### The set-aside confirmation`
(1640–1799), `### Phase 4`'s newer half (1516–1639), `## Returned outcome record` (447–569, 99 %
new), `## Unconfigured automatic-reviewer advisory` (716–767, 100 % new) and the delegation-channel
argument (260–394). This pass does not touch them. Phase 5.5 alone is sliced by 11 tests
carrying 96 assertions between them and is effectively frozen prose.

The freeze is defined by content and blame, not by the line numbers here, and it is a scope decision
rather than a claim that these passages are incompressible.

### Tests may follow wording, never behavior

Where a contract test pins a _formulation_ rather than a _behavior_, it may be adapted to the new
wording; the adaptation is justified in the commit and keeps the assertion's intent. Where a test
pins a behavior, the text bends to the test. Hard boundaries, not to be touched:

- **Heading names.** `section()` asserts existence with a hard failure, so renaming any of the 19
  sliced headings breaks the suite outright.
- **Phase 4's numbering.** `mergeCondition()` selects conditions by ordinal; renumbering breaks it.
  Phase 4 must keep at least ten numbered conditions.
- **The two prose-bounded slices**: `#### The set-aside confirmation` must still be followed
  immediately by its `**Report every …**` lead, and the `off`/`ask`/`auto` bullet labels inside
  1219–1235 must keep their order.
- **The three verified tightest `near` windows**, all inside `## Git write boundary`: 40 characters
  at `two`/`sanctioned kinds`, 60 at `same operation`/`same branch`, and 60 at `never rewrite`/`head
branch's history`. A single inserted clause fails them.
- **Phase 5.5 and the delegation channel** are frozen anyway.

### Both fragment splits land in this change

Confirmed from the first planning round and extended to the third split: WP3, WP4 and — if taken —
WP7 are executed together with the deferrals rather than deferred to follow-up pull requests. Blast
radius: `issue-lifecycle` 3 consumers, `config-migration` 18, `pr-review-comments` 3,
`worktree-integration` 7. Two mitigations are binding:

- the packages are committed **separately and in order**, so a bisect lands on one fragment;
- the validation plan verifies **every** consumer of a split fragment, not only merge-gate.

### Deferral optimizes the common run, not the worst case

A run that reaches every branch loads the same content as today, minus the prose savings. The gain
is that the ordinary run — head branch current, no conflict, no linked issue to observe — stops
paying for branches it never enters.

## Affected files

| File                                                                   | Description                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                                              | WP1/WP2 fences to `lazy-include`; WP3/WP4 fences repointed; `## Rules` and `## Edge cases` compressed; local duplicate rationale merged |
| `src/shared/issue-lifecycle.md`                                        | WP3: `### Post-merge observation` (84–269) moves into a new fragment                                                                    |
| `src/shared/issue-post-merge-observation.md`                           | WP3: new fragment, lazily pointed at from merge-gate                                                                                    |
| `src/shared/config-migration.md`                                       | WP4: split at `### Merge-gate keys` (104) — core 1–103 stays, 104–193 moves                                                             |
| `src/shared/pr-review-comments.md`                                     | WP7 only: three-way split along the read/thread-write/merge seams                                                                       |
| the 3 `issue-lifecycle` and 18 `config-migration` consumers            | repoint to the part each needs                                                                                                          |
| `test/workflow-contracts.test.mjs`                                     | adapt assertions that pin removed wording; add WP6's pointer-trigger assertion                                                          |
| `build.mjs`                                                            | WP6: merge-gate enters the budget measurement with its own limit                                                                        |
| `docs/developer-guide/build-system.md`                                 | record the deferrals, the split fragments, and merge-gate's own budget limit                                                            |
| `docs/user-guide/tools-deliver.md`, `docs/user-guide/configuration.md` | re-check against the compressed text and the moved `mergeGate.*` keys                                                                   |

## Implementation details

### Approach

One pull request, one commit per package, in this order.

1. **WP1 — Defer `worktree-integration` (−880).** Replace the eager fence at `merge-gate.md:177`
   with a `lazy-include` triggered on Phase 2 step 1 provisioning a checkout because the fresh read
   reports the head branch `BEHIND` or `DIRTY`. Reuse the wording of `build.md:129` / `fix.md:82`.
   - Consumption sites are all inside that branch: `:1121-1155`, plus the lifecycle transitions at
     `:167-176` and the edge cases at `:2263`, `:2288`, `:2294`, `:2558`.
   - `merge-gate.md:155-165` already declares the fragment's delivery-branch, completion-action and
     plan-archival halves inapplicable, so nothing is lost by loading it later.
   - Guard-safe: `findRuntimeStateSafetyViolations` (`build-lib.mjs:2133-2232`) walks includes in
     source order, and a mutation reached through a lazy include sets `mutationHasOwnLazyTrigger`
     (`:2181-2183`), which skips the trigger-coverage check.
   - Test-safe: `test/execution-location-contract.test.mjs:50-60` accepts either fence kind and does
     not list merge-gate; `test/workflow-contracts.test.mjs:6724-6740` counts merge-gate as a
     consumer either way.

2. **WP2 — Defer `language-rules` (−80).** Trigger, matching `build.md:10` verbatim: "an artifact
   output language or delegated language context must be resolved". The three consumption sites
   (`:445`, `:584`, `:632-633`) all sit in delegation payload construction. No guard or test
   requires this fragment to be eager in merge-gate.

3. **WP3 — Split `issue-lifecycle` and defer the observation half (−186).** Boundary at
   `src/shared/issue-lifecycle.md:84`. The header (1–11), `### Started transition` (12–33) and
   `### Pull-request lifecycle receipt` (35–82) stay in `issue-lifecycle`;
   `### Post-merge observation` (84–269) moves to a new fragment, lazily pointed at from merge-gate
   with a trigger naming Phase 5.5 — the merge is confirmed, or the run entered observer-only mode.
   - **`test/workflow-contracts.test.mjs:5437-5446` asserts the literal eager fence**
     ` ```include\nissue-lifecycle\n``` ` in `apply-issues`, `apply-review-remote` **and**
     merge-gate. The boundary above satisfies it: the name stays eagerly included, only its larger
     half moves out.
   - `### Started transition` is unused by merge-gate but eagerly needed by the other two consumers,
     so it stays where it is.
   - Real duplication cost to accept: the observation half reads the receipt's `container` and
     `containerMechanism` fields back (`:253-269`), so the new fragment must cross-reference or
     restate that part of the receipt schema.

4. **WP4 — Split `config-migration` (−90 in merge-gate and in 11 further eager consumers).**
   Boundary at `:104`. Core (`### Config locator` 10–39, `### Table encoding` 40–103) stays and is
   needed by all 18 consumers every run; `### Merge-gate keys` (104–153),
   `### Language configuration and compatibility migration` (154–177) and the setup-repair-only
   `### One-time migration legacy config.json` (178–193) move out.
   - merge-gate duplicates the merge-gate key table at `:669-677`. Resolve to one owner — merge-gate's
     own table stays and the fragment's copy is referenced — so merge-gate does not re-include the
     split-out part at all, which is where its saving comes from.
   - The legacy `prReview.*` fallback is referenced from `merge-gate.md:707`, so whichever part
     carries it must be reachable on a plain config read.

5. **WP5 — Compress the restating text (≈ −320).** Nothing removes a claim; each removal points at
   the surviving statement of the same rule.
   - **`## Rules` (2536–2626, 91 lines, 26 bullets) → ~30 lines.** 24 of 26 bullets restate an
     origin that survives, and none introduces mechanics stated nowhere else. The repository median
     is 8–12 lines. **No test slices `## Rules` at all**; the only pins are the verbatim sentence at
     2596–2599 and two whole-file literals from 2541–2545.
   - **`## Edge cases` (2240–2535, 296 lines, 74 bullets) is dissolved, not compressed.** The ~58
     restating bullets are deleted outright — each re-derives a rule that survives at its origin —
     and the ~74 lines of genuinely unique cases move to the phase whose rule they qualify, notably
     2266–2269 (generated-file conflict), 2299–2331 (the emoji-reaction, sticky-comment and
     review-body-edited cases), 2439–2445 (pending and team reviews) and 2489–2491 (Forgejo pending
     surplus). Net saving about 222 lines, against about 130 for mere compression.
     - **This is the one package that deliberately changes test structure.** Five assertions reach
       the section, and two of them slice it by heading and then split on `/\n-\s+/` to find the
       bullets containing `acknowledges with an emoji reaction` and `edits one sticky comment in
place`. Since `section()` hard-asserts a heading's existence, removing `## Edge cases` fails
       them. Adapt those assertions to find the same literals at their new home: they pin where the
       content lives, not what the gate does, and the content itself must survive verbatim. Record
       each adaptation with that justification.
     - The section is a merge-gate-local convention that outgrew any precedent: `investigate.md` is
       the only other tool with one, at 7 lines against 296. Dissolving removes the duplication at
       its root instead of maintaining a second, shorter copy of every rule.
   - **`#### Resolving a conflict with the base` (1213–1266), ~−18.** Steps 1 and 4 re-narrate the
     contract: 1219–1235 duplicates `## Configuration` 680–691 dimension for dimension, 1242–1246
     duplicates 601–622. Only 2 % of this section is new, which makes it the safest structural
     target — but keep the two `ordered()` chains, the `off`/`ask`/`auto` bullet labels,
     `git merge --abort`, and the 60-character `no commit`/`no push` window.
   - **Phase 1 rationale (975–997, 1009–1014), ~−18**; **`## Git write boundary` (207–230), ~−15**
     — mind the 40- and 60-character windows there; **`#### A deferred finding gets no thread
reply` (1083–1108), ~−12**; **the skill-exclusion section (35–51, 64–72), ~−14** — but leave
     73–83 untouched, three sentences there are pinned verbatim; **`## Wisdom accumulation`
     (779–821), ~−18**; **`### Phase 6`'s older half (2124–2163), ~−12**; **`#### Round accounting`
     (1280–1292), ~−8**; **`### Phase 2` (1187–1207), ~−8** — compress this or its Edge-cases twin
     at 2518–2523, not both; **`## Configuration` bullets (680–695), ~−8** — never the table itself,
     which is compared against `setup.md`.
   - **Explicitly out of scope:** `## Delegation contract` 303–394, despite being 92 lines and
     containing pure archaeology about a retired byte-count design. It is 75 % new and carries the
     densest test coupling in the repository — one test alone holds 36 assertions, 24 `near` windows
     and four negative literals on the retired framing.

6. **WP6 — Bring merge-gate under a measured budget.** `build.mjs:1281-1282` still reads
   `CONTEXT_BUDGET_MAX_LINES = 700` with `BUDGET_TOOLS = ['build','fix','docs','review','plan']`;
   nothing measures merge-gate's 4800-line core. Given the growth rate documented above, this is the
   package that makes the rest durable.
   - Give the guard a **per-tool limit** rather than one shared constant, add merge-gate at **3150**,
     and let the build fail when it is exceeded. A documented exemption was considered and rejected:
     honest, but powerless against renewed growth.
   - Add an assertion pinning each new `when:` clause's trigger tokens, in the style of the existing
     fence-form assertion at `test/workflow-contracts.test.mjs:4568-4576`, because
     `build-lib.mjs:1832` makes `when:` optional and nothing else checks it.

7. **WP7 — Split `pr-review-comments` (−75).** Three-way along the seams the fragment
   actually has: read operations, thread writes (`### Reply to a thread` 140–148,
   `### Resolve a thread` 149–153, `### Submit a review with inline comments` 154–175 — never used
   by merge-gate, eagerly needed by `iterate` and `pr-review-integration`), and merge operations
   (`### Merge a pull request` 257–283, `### Close an issue as completed` 284–307 — unused by
   `iterate`).
   - Obstacles that make this the lowest-yield package, taken deliberately: the capability and
     degradation table sits
     inside the `pr-merge` section (273–283) but is read in Phase 0 preflight (`merge-gate.md:2503-2506`),
     and `### Idempotency via the Effective Flow markers` (308–355) stamps both the reply and the
     summary-comment markers, so it straddles the write-side split.

### Edge cases

- **A deferral that never fires.** A `when:` clause worded too narrowly leaves the run without a
  contract, and nothing in the build catches it — hence WP6's trigger assertion.
- **A split part that no consumer loads.** After WP3, WP4 and WP7 a consumer repointed to the wrong
  part loses content silently: the build fails on a _missing_ fragment, never on a _semantically
  wrong_ one. The per-consumer verification is the only thing that catches it.
- **A compressed bullet that was the only statement of a rule.** The mapping requirement surfaces
  such a case as an unmapped line rather than as a lost rule. In `## Rules` the analysis found no
  such bullet, which is exactly why that section is the primary target.
- **A `near()` window broken by a shortened neighbour.** Compression can move two pinned terms
  _closer_, which is harmless, or push a third term out of a window, which is not. A failure here is
  a signal to restore the bullet, never to widen the test.
- **A heading renamed while compressing.** `section()` fails hard on a missing heading, so a
  compression pass must never fold two sections together, however similar they read.
- **The frozen ranges shift.** Compression above a frozen range moves its line numbers; verification
  is a reviewed diff, not a line comparison.
- **A per-tool budget set to today's value.** A limit equal to the achieved size turns the next
  legitimate rule addition into a build failure. Set 3150, the acceptance figure, not the ≈ 3077 the
  run is expected to measure — that leaves about 70 lines for the next justified rule and no more.

## Acceptance criteria

- [ ] The always-loaded core of `merge-gate` — the built tool file with eager fragments expanded and
      lazy pointers unexpanded — is **≤ 3150 lines**, measured the same way as the baseline 4800.
      The per-package figures are reported individually in the pull-request body.
- [ ] `build.mjs` measures merge-gate against a per-tool limit of 3150 and **fails the build** when
      it is exceeded; `docs/developer-guide/build-system.md` documents that limit and why it differs
      from the shared 700.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass after
      every commit, not only at the end.
- [ ] `worktree-integration` and `language-rules` are reachable through a `lazy-include` whose
      `when:` clause names the decision point at which they are first used, and WP6's assertion pins
      those trigger tokens. `execution-location` is **not** added as a compensating eager include.
- [ ] `skill-discovery`, `pr-review-comments`, `review-bot-state` and `config-migration` remain
      eager, and `issue-lifecycle` keeps its literal eager fence.
- [ ] Every consumer of a split fragment loads the part it needs — 3 for `issue-lifecycle`, 18 for
      `config-migration`, 3 for `pr-review-comments` if WP7 is taken — each named in the
      pull-request body with the part it was repointed to.
- [ ] `## Edge cases` no longer exists, every unique case it held is present at the phase it
      qualifies, and the two bullet-finding assertions locate their literals at the new site.
- [ ] Every deleted or shortened source line is mapped, in the commit message or the pull-request
      body, to the surviving statement of the same rule — or identified as a restatement whose
      original remains.
- [ ] `git diff 61d8286 -- src/tools/merge-gate.md`, reviewed against the frozen ranges, shows no
      edit inside them.
- [ ] Each adapted assertion is listed with the reason it pins wording rather than behavior. No
      sliced heading is renamed, Phase 4 keeps at least ten numbered conditions, and the two
      prose-bounded slices keep their bounding text.

## Validation plan

- Run the repository's own sequence after each commit: `pnpm agent:check`, `pnpm test`,
  `node build.mjs`, `pnpm test:distribution`.
- Measure the core before and after with the same expansion method used for the baseline, and record
  the per-package figures in the pull-request body.
- **Per-consumer check for the split fragments:** for each consumer, diff its rendered output before
  and after and confirm that the removed lines are exactly the ones that consumer does not use. No
  build guard reports a wrongly repointed consumer.
- Review the diff against the mapping table required by the acceptance criteria.
- Confirm by reviewed diff against `61d8286` that no frozen range was edited.
- Read the rendered artifacts (`dist/claude`, `dist/codex`, `dist/portable`) for the lazy pointers,
  so a deferred fragment is verified as shipped and referenced rather than dropped.

## Assumptions and open points

- **Assumption:** deferring a fragment does not degrade a run in practice, because the pointer is
  read at its decision point. The repository already relies on this for `worktree-integration` in
  three tools and `language-rules` in seven. It stays an assumption because the build does not check
  pointer-before-use — which WP6 addresses for merge-gate only.
- **Assumption:** WP5's ~412 lines are a reading-calibrated estimate. Dissolving `## Edge cases`
  accounts for ~222 and compressing `## Rules` for ~60 — the two least test-coupled sections in the
  file; the remaining ~130 are spread over ten smaller sites and carry more risk per line.
- **Assumption:** the ≤ 3150 target is **not** reached by WP1–WP5 alone, which land at ≈ 3152.
  WP7's further 75 lines are what brings the core to ≈ 3077, which is why that package is no longer
  optional. If WP5's dissolution yields less than estimated, the shortfall shows up directly against
  this criterion rather than being absorbed silently.

## Plan review

### 2026-08-12 — initial planning

**Result:** Approved

Two passes ran. The first returned **Revision required** with two blocking findings, both verified
independently and incorporated; the verification also showed why they arose — two claims of the
first draft had been checked against a checkout nine commits stale. The second pass was the deep
interactive review, which resolved four decision-requiring points.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        1 |         1 |    0 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

- **Architecture, Critical — deferring `skill-discovery` was a behavior change, not a deferral.**
  Its trigger would have been self-referential, it carries run-wide rules unrelated to any
  configured skill, and `build-system.md` lists it under "Core flow stays inline". Incorporated: the
  package was removed and the rejection recorded as an architecture decision.
- **Testability, Critical — the headline criterion was unreachable by the packages said to reach
  it.** Incorporated: per-package figures are stated individually.
- **Error cases, Important — the `review-bot-state` trigger was too narrow.** An empty
  `mergeGate.bots` list does not make the fragment unused. Incorporated at the time by widening the
  trigger; superseded by the 2026-08-28 revision, which drops the deferral entirely.
- **Testability, Important — nothing mechanically verifies a pointer's trigger.** Incorporated: the
  budget package carries the assertion.
- **Scope, Important — `## Git write boundary` is test-sliced but was treated as free.**
  Incorporated as a hard boundary.
- **Scope, Note — one claimed local duplicate is a legitimate cross-reference.** Removed from the
  compression list.
- **Architecture, Note — deferral does not help the worst-case run.** Incorporated as an explicit
  decision.
- **Error cases, Note — a too-narrow `when:` clause fails silently.** Incorporated as an edge case.
- **Error cases, Note — a wrongly repointed consumer produces no build error.** Incorporated as the
  per-consumer validation step.
- **Maintainability, Note — the freeze is time-based and will age.** Accepted deliberately.

Decisions taken in the deep review: both fragment splits land in this change; the freeze holds for
all pull requests, not only the newest; the budget guard uses a per-tool limit that fails the build;
the numeric core target stays binding.

The `COMMENT_MARKERS` contract tests named in the very first draft do not exist — #346 replaced the
marker-based guard rules.

### 2026-08-28 — revision after re-baselining

**Result:** Approved

The plan was re-verified against `origin/develop` @`61d8286` after the user reported substantial
work on the sources. Twelve commits had changed merge-gate since the plan's baseline: **1332 → 2626
source lines, 3002 → ≈ 4800 loaded lines**. Every figure and line reference in the plan was stale,
and two of its packages no longer held. The structure of the plan survived the re-check; its numbers
did not.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        1 |         0 |    0 |

- **Architecture, Critical — the `review-bot-state` deferral is withdrawn.** Phase 1 rule 1 matches
  every comment author through "Matching a configured login" on every run, and rule 2's `[bot]`-trim
  boundary cites the same section. Any trigger fires in Phase 1, which is the case the deferral
  policy explicitly names as moving the measured number without saving anything. The former WP2 is
  removed; `language-rules`, newly identified as a genuine one-branch fragment, takes its place.
- **Maintainability, Critical — the growth rate outruns the savings.** +1294 source lines in 16 days
  while every sibling stayed flat. The reductions buy back roughly one month of development.
  Incorporated as its own baseline section, and the budget guard is now argued as the package that
  makes the rest durable rather than as a tidy-up.
- **Architecture, Important — a new eager fragment appeared.** `issue-lifecycle` (269 lines) was
  added by #348 and is now the third-largest eager cost. It cannot be deferred whole — its receipt
  section runs in Phase 0 step 1 — but its post-merge observation half is Phase-5.5-only.
  Incorporated as WP3, respecting the test that pins its literal eager fence.
- **Architecture, Note — the WP1 wisdom-write objection does not hold.** The concern that deferring
  `worktree-integration` would strand the every-run wisdom write was checked directly:
  `runtime-state-safety` includes `execution-location` eagerly and is already lazily loaded on a
  trigger that fires at that very write. WP1 keeps its full 880-line saving; the plan now says so
  explicitly so a later reader does not add a 168-line compensating include.
- **Testability, Important — the test coupling roughly doubled.** 470 assertions, 255 `near()`
  windows, 19 sliced headings, ordinal-selected Phase-4 conditions, two prose-bounded slices.
  Incorporated: the hard-boundary list is now specific about what breaks and how.
- **Testability, Note — a mechanical dedupe would find nothing.** Only three verbatim repeated
  sentences exist in 2626 lines; the duplication is semantic. Incorporated so the implementing run
  does not reach for a script.
- **Scope, Important — the freeze surface grew from 644 to 1030 lines.** Recorded with the concrete
  ranges, including two sections that are 100 % new.
- **Error cases, Note — compression can break a `near()` window from either direction.**
  Incorporated as an edge case.

### Decisions from the deep review on the revision

- **WP7 is taken**, not left optional. It is still the lowest-yield package, but WP5's estimate now
  carries the whole criterion, so its 75 lines are the buffer.
- **`## Edge cases` is dissolved rather than compressed**, removing the duplication at its root. This
  is the one place where the plan knowingly changes test _structure_: two assertions slice the
  section by heading, and `section()` fails hard on a missing one. They are adapted to find the same
  literals at the bullets' new home, with that justification recorded per assertion.
- **The budget limit is 3150.** It was first chosen as 3300 when the expected achieved value was
  ≈ 3244, i.e. deliberately tight. Dissolving `## Edge cases` then lowered the expectation to
  ≈ 3077, which would have left roughly 220 lines of headroom instead of 56 — looser than the intent
  behind the choice. The limit was therefore lowered to 3150 to restore that intent: it equals the
  acceptance figure and leaves about 70 lines for the next justified rule.

Consequences for the target: the old ≤ 1900 figure is void — the file alone is now 2626 lines. The
revised target is **≤ 3150**, a 34 % reduction, reached by WP1–WP5 plus WP7 at ≈ 3077.
The recommended workflow is unchanged (Refactoring), and the earlier decisions on freeze scope,
split placement and guard form carry over unchanged.

## Open points

- No open points.

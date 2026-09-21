# Delegate the investigation method and correct the M-item assessment

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Section §6.2 (L529) of
[`docs/review/2026-08-31-architecture-and-consistency-review.md`](../review/2026-08-31-architecture-and-consistency-review.md)
proposed moving six Effective Flow shared fragments into the central skills repository (M-1 … M-6), and P4
(L625) repeats it: "move the six reusable fragments to the skills repository".

A per-item comparison against the skills checkout found that recommendation largely wrong. The table below is
restated against the **current** checkout `f4300bb` (2026-09-14); the original comparison ran against
`f79397b` (2026-08-25), and `fcffae7` (#244) has since deleted one of the citations it rested on.

| Item | Fragment                                          | Verdict                                | Evidence, re-verified at `f4300bb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1  | `worktree-lifecycle.md` + `execution-location.md` | stays in Effective Flow                | `effective-delivery/references/worktree-safety.md:22–23` forbids "a private ledger, hidden state directory, or mandatory receipt file"; the lifecycle persists records under `.effective-flow/worktree-runs/`                                                                                                                                                                                                                                                                                                                                                       |
| M-2  | `security-disclosure-gate.md`                     | stays in Effective Flow                | no upstream reference owns withholding security findings from trackers; the gate controls Effective Flow's tracker publication and finding IDs. This is a negative claim over a moving checkout, so step 0 re-establishes it before it is written down. Discharged on 2026-09-21 against `f4300bb`: the step-0 grep returned **17 hits**, every one about disclosing a gap, progressive disclosure, or a jurisdictional legal disclosure, and none assigning ownership of withholding a finding from a tracker. Independently re-run and confirmed by the validator |
| M-3  | `commit-message-rules.md`                         | upstream contribution first            | `effective-delivery/references/evidence-and-delivery.md:65–91` covers Conventional Commits as a fallback, specific subjects, no AI attribution and type-by-effect; the gap is the runtime-effect rule and squash-title release signalling, and most of the fragment is Effective Flow policy that would stay                                                                                                                                                                                                                                                        |
| M-4  | `investigation-method.md`                         | **delegate now**                       | `effective-delivery/references/investigation.md` (181 lines) already covers the diagnostic method far beyond the 21-line fragment                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M-5  | `adr-convention.md` + `project-adr-convention.md` | upstream contribution first            | `effective-product/references/adr-format.md:158–161` asks a repository to declare its identity scheme, but the file carries no precedence, width allocation or collision rules; thinning only after an upstream contribution lands                                                                                                                                                                                                                                                                                                                                  |
| M-6  | `doc-categories.md`                               | **open — evidence withdrawn upstream** | the original citation — `effective-delivery/references/route-docs.md` rejecting "a mandatory docs hierarchy when the repository does not already use one" — was deleted by `fcffae7` (#244) and the phrase now appears nowhere in the skills tree, so the "stays in Effective Flow" verdict has no current basis                                                                                                                                                                                                                                                    |

This plan implements the user's decision of 2026-09-12, revised on 2026-09-21: **delegate M-4 now and correct
the review document**. M-3 and M-5 are recorded as upstream follow-ups, M-6 is recorded as open pending a
re-assessment that is deliberately **not** performed here, and nothing is written to the skills repository.

### Why this is a Feature

Declaring `effective-delivery` authoritative for investigation depth changes what a `fix` or `investigate` run
does whenever the skill is installed: competing hypotheses, a discriminating reproduction, epistemic labels,
outcome classes and intervention level become part of the run. Effective Flow's plan contract defines
Refactoring as having no intended behavior change, and `investigate`'s own routing sends a deliberate behavior
change to `build`. The #393 precedent (`refactor:` for the implementer delegations) is noted and not followed,
because this plan states the behavior change as its purpose.

### Planning baseline

- Effective Flow: `origin/develop` at `cecb5e5`, 2026-09-21. The local `develop` is level with it and the
  working tree is clean. First planned against `4321151` (2026-09-12) and revised after 23 commits landed. Of
  the files named below, only `src/shared/investigation-method.md` is byte-identical to that baseline;
  `build-lib.mjs` moved by one unrelated line and its guards are unchanged. Every line reference in this plan
  is against `cecb5e5`.
- Skills: DALO checkout `/Users/bs5/.dalo/sources/sebastian/checkout` at `f4300bb` (2026-09-14). `fcffae7`
  (#244) rewrote `references/investigation.md`, `references/route-audit.md` and `references/route-docs.md`; the
  two consequences that matter are recorded under "Verified current state".
- No context-budget numbers are pinned here. `build.mjs` no longer has a "deliberate judgement entry" concept,
  and both consuming tools now sit within single-digit lines of their limits, so step 5 measures instead of
  asserting.

### Verified current state

- `src/shared/investigation-method.md` (21 lines) is eagerly included by `src/tools/fix.md:105` (fence
  104–106) and `src/tools/investigate.md:90` (fence 89–91). Both tools run its "Investigate symptom and code"
  section unconditionally (`fix.md:163`, `investigate.md:132`).
- It carries a read-only framing that distinguishes `fix` (may write a reproduction test) from `investigate`
  (fully read-only); intake steps 1–4 at L7–13 (expected vs. actual; delegated read-only code investigation;
  asking the user when, what error message and since when; suspected root cause and files); and a
  three-criterion scorecard at L15–21 (Clarity, Verification, Context with a `<= 10 %` guessing target, written
  ASCII in the source).
- The fragment is written as **unwrapped prose**: its framing paragraph is a single 591-character line, and
  `oxfmt` does not wrap Markdown prose. Since the budget guard counts `split('\n').length`, a prose addition
  costs one counted line per paragraph regardless of how long it reads, and no existing test asserts the
  scorecard (`grep` over `test/` for `Diagnosis validation`, `Clarity`, `10 %` returns nothing), so assertion
  (c) in step 4 is genuinely new rather than a duplicate.
- `test/delegation-mandate-contract.test.mjs:358–383` pins two patterns in this fragment: the
  delegate-to-an-internal-sub-agent sentence (`DELEGATION_DEFAULT`, L359–360) and the triviality-exception
  sentence (`TRIVIAL_EXCEPTION`, L361–362). The fragment is also read at L20.
- `effective-delivery` covers the investigation depth through its audit route (`route-audit.md:35–37` step 3 →
  `references/investigation.md`, 181 lines), whose headings still carry every element this delegation names:
  competing hypotheses (`:76`), a discriminating feedback loop (`:40`), epistemic labels (`:59`), outcome
  classes (`:110`) and intervention level (`:132`).
- `fix` already recommends `effective-delivery` (`fix.md:75–77`) and is a `delegate` consumer
  (`docs/developer-guide/skill-ownership.json:37`). `investigate` has **no** `## Recommended skills` section
  and **no** manifest relationship. In `investigate.md` the slot directly before `## Project conventions`
  (L70) is currently a ` ```lazy-include ` fence for `session-rename` (L65–68).
- **The conflict with the skill is real but is now two-sided, not three-sided.**
  `references/investigation.md:16–19` still says to return the report in the conversation by default and
  forbids "a hidden runtime directory, private hypothesis ledger, mandatory report path, or automatic issue".
  `investigate` writes its report under `.effective-flow/investigation/` (`investigate.md:74–79`, `:83–84`,
  `:152–158`, `:231`), tracks hypotheses in its transient wisdom file (`investigate.md:133`, `:231`), and hands
  the report path to the follow-up workflow's invocation suggestion. The **third** side has lapsed: `fcffae7`
  deleted the sentence requiring a diagnosis to stop before implementation, and `investigation.md:8–14` plus
  `route-audit.md:36–37` now affirmatively authorize continuing into an already-authorized repair.
- **`investigate`'s Phase 5 was rewritten since the first planning pass** by `3c6e35b` (#428): a
  `durable-follow-up-gate` lazy include was added at `investigate.md:97–100`, the invocation suggestion is now
  gated by a four-way admission outcome (`admitted` / `current-scope` / `closed` / `uncertain`, L159–171), and
  the report template gained `**Admission outcome:**` at L211. Phase 3 is at L136, Phase 4 at L142–148, the
  report template at L173–219.
- Context budgets (`build.mjs:1499–1528`): `investigate: 545` at L1517, `fix: 488` at L1518. The
  judgement-entry concept the first pass relied on is **gone** — the replacement comment at L1453–1457 states
  that each tool gets its own ratchet of "its measured always-loaded size plus at most ten lines of headroom",
  and names no judgement entries. `fix` survives only in the historical `goal-completion` paragraph
  (L1487–1498). Both tools therefore now carry single-digit headroom, and this fragment is charged to **both**.
- Build guards (`build-lib.mjs`, unchanged in behavior): the forward check (L710–728, throws at L717–719 and
  L723–725) rejects a recommendation without a manifest relationship; the delegate reverse check (L730–802,
  throw at L790–792) requires a `delegate` consumer to name its owner as the first member of a recommendation
  bullet; the guide table reconciles row membership only and never consumer cells
  (`assertSkillOwnershipContract` L640, reconciliation L669–683). Shared fragments are exempt by kind
  (`build-lib.mjs:783–786`, comment L737–743). Known consumers come from `src/tools`, `src/agents` and
  `src/shared` (`build.mjs:664–670`).
- **The shared-fragment enumerations are already stale.** `docs/developer-guide/build-system.md:214–218` and
  its verbatim twin comment at `build-lib.mjs:739–743` both list the fragments exempt by kind and both omit
  `durable-follow-up-gate`, which became a shared-fragment `delegate` consumer in `3c6e35b` (#428)
  (`skill-ownership.json:21`). Nothing machine-checks either list.
  `docs/developer-guide/skill-ownership.md:276–277` states the same rule without naming fragments and needs no
  change.
- **The prerequisite of the first planning pass is already satisfied.** `1b81edd` (#437) refreshed the review
  document's status table: the `Everything else | open` row is gone, F-16 (L29) and the five P1 findings
  (L24–28) read `implemented`, `§5 behavioural eval layer` (L32) reads `partial`, and the table's **last** row
  is now `| M-1 … M-6 move candidates | open | — |` (L36) — the very row this plan replaces. The corrections
  lead-in at L38–39 already announces **three** corrections, with bullets at L41–55.
- No part of this plan has landed: `investigation-method.md` contains no occurrence of `effective-delivery`,
  `investigate.md` has no `## Recommended skills`, neither `skill-ownership.json` nor `skill-ownership.md`
  mentions `investigate` or `investigation-method`, and the review document carries no correction or row about
  §6.2, P4 or M-1 … M-6 beyond the single open row.

## Architecture decisions

- **Delegate without moving.** The skill already owns the method; nothing is contributed upstream. Effective
  Flow keeps a minimal fallback, as `src/shared/skill-discovery.md` requires for an absent, disabled or excluded
  skill.
- **Only the diagnostic depth is delegated; user interaction and delegation stay orchestration.** Intake step 2
  (delegating the read-only code investigation) and step 3 (asking the user when, what error, since when) remain
  always active in both tools: the skill has no counterpart for asking the user, and user interaction is
  orchestration under `skill-discovery.md` point 5. Steps 1 and 4 (framing expected vs. actual; the suspected
  root cause and files) become the baseline the skill deepens and the minimal fallback when it is absent.
- **The override lives in the text a run reads, and it now names four rules, not five.** The fragment's
  authority sentence states, for both embedding workflows, that the skill's rules on returning the report in
  conversation, on runtime directories, on hypothesis ledgers and on mandatory report paths do **not** apply:
  the embedding workflow's report path, its transient wisdom file, its routing and its own scope stay binding.
  The first pass also overrode "read-only stopping"; `fcffae7` deleted the upstream rule that made that a
  conflict, so the clause is dropped rather than carried as dead text. The positive half keeps naming
  **scope**, because the fragment must state what binds a `fix` run regardless of what the skill says next. The ownership guide records the same choice as
  documentation, not as the place a run learns it.
- **The scorecard stays Effective Flow's,** including the `<= 10 %` target — scorecard thresholds are artifact
  contracts under `skill-ownership.md`. `fix`'s Phase 2 extension of that scorecard (`fix.md:176–177`) stays
  coherent.
- **`investigate`'s Phase 3/4 and its report template are the report schema, not the method.** They are left
  untouched and recorded as the output contract, so a later audit does not read them as a second copy of the
  skill's hypothesis method.
- **Both the tool and the fragment become `delegate` consumers.** `investigate` gains `## Recommended skills`
  naming `effective-delivery` first, placed directly before `## Project conventions` as in `fix.md:75`.
  `investigation-method` is added as a consumer too, following the precedent of fragments that carry ownership
  prose (`documentation-sync-contract`, `worktree-integration`, `language-rules`, `chat-language`); shared
  fragments are exempt by kind from the reverse check.
- **Both budget entries are re-measured; neither is asserted.** This fragment is eagerly included by `fix` and
  by `investigate`, so every counted line it gains is charged **twice**, and `investigate` additionally gains
  the four lines of its own new section. The counted cost is small: the fragment is unwrapped prose, one
  paragraph per physical line, and the guard counts `split('\n').length`, so the whole authority sentence is
  roughly two counted lines however long it reads. The first pass could lean on `fix` being a 700-line
  judgement entry with room to absorb the growth; that concept no longer exists in `build.mjs`, and both
  entries are now ordinary measured ratchets with single-digit headroom — `fix` is expected to still fit and
  `investigate` is expected not to. Step 5 therefore reads the measured size from the build's own
  `Always-loaded core (lines/budget)` report and sets each entry to that size plus at most ten lines, for
  `investigate` **and** `fix`, rather than either one being assumed.
- **M-6 is recorded as open, with its reason, rather than closed on a deleted quote.** Writing "withdrawn —
  stays in Effective Flow" while citing a passage that no longer exists would introduce into a durable document
  exactly the defect class its correction list exists to record. Re-deriving M-6's verdict is out of scope: it
  could return "move it", which this plan is not permitted to act on. The row states the withdrawal of the
  evidence and leaves the verdict pending.
- **The already-stale exempt-by-kind lists are fixed in the same edit.** Step 2 rewrites
  `build-system.md:214–218` anyway, and its twin comment at `build-lib.mjs:739–743` is the same sentence; both
  gain `investigation-method` **and** the missing `durable-follow-up-gate`. Editing one of two divergent copies
  of an unchecked list, and leaving a known omission in the line being touched, would ship a list that is
  knowingly wrong. `build-lib.mjs` is therefore in scope for that comment only — no guard logic is touched.
- **The status-table catch-up is no longer a prerequisite.** `1b81edd` (#437) performed it. What replaced it is
  a different constraint: the six new rows **replace** the existing last row `| M-1 … M-6 move candidates |
open | — |`, and no `Everything else` row exists to keep last.

## Affected files

| File                                                            | Description                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/investigation-method.md`                            | Authority sentence with the four-rule override; steps 1 and 4 marked as the baseline and minimal fallback; steps 2 and 3, the two pinned sentences and the scorecard kept verbatim                                                                                                                                                                                              |
| `src/tools/investigate.md`                                      | New `## Recommended skills` section directly before `## Project conventions` (L70), after the `session-rename` fence; one sentence under `### Phase 3: Diagnosis` (L136) declaring its points the report's output contract                                                                                                                                                      |
| `docs/developer-guide/skill-ownership.json`                     | `investigate` and `investigation-method` added as `delegate` consumers of `effective-delivery`                                                                                                                                                                                                                                                                                  |
| `docs/developer-guide/skill-ownership.md`                       | `effective-delivery` row (L84): both consumers appended to the end of the `delegate` group, immediately before the semicolon, and "diagnosis" inserted into the classification clause; the whole eight-line table reflows; audit/planning bullet (L101–105): `investigation-method.md` among the fallbacks, the override choice, and `investigate`'s Phase 3/4 as report schema |
| `docs/developer-guide/build-system.md`                          | The exempt-by-kind enumeration at L214–218 gains `investigation-method` and the already-missing `durable-follow-up-gate`                                                                                                                                                                                                                                                        |
| `build-lib.mjs`                                                 | The twin exempt-by-kind comment at L739–743 gains the same two names. Comment only; no guard logic changes                                                                                                                                                                                                                                                                      |
| `docs/review/2026-08-31-architecture-and-consistency-review.md` | "Three corrections" lead-in (L38) updated to four; fourth correction bullet on §6.2 and P4; the last status-table row (L36) replaced by six rows for M-1 … M-6                                                                                                                                                                                                                  |
| `test/delegation-mandate-contract.test.mjs`                     | A new test block with contract assertions for the authority sentence, the override and the retained scorecard                                                                                                                                                                                                                                                                   |
| `build.mjs`                                                     | `CONTEXT_BUDGET_LINES`: `investigate` raised to its measured size plus headroom. `fix` is measured too but changed **only if** its measurement exceeds 488                                                                                                                                                                                                                      |
| `docs/user-guide/tools-understand.md`                           | Added by the mandatory documentation sync gate during implementation rather than foreseen here: the `investigate` section enumerates the report's contents, which the delegated depth made incomplete                                                                                                                                                                           |
| this plan file                                                  | Step 0 only: the re-verified skills-checkout revision and any restated citation are written back into the Requirement table, so step 6 copies a current record rather than a remembered one                                                                                                                                                                                     |

## Implementation details

### Approach

0. **Re-verify the M-item citations before any of them is written down.** The M-6 case proves these citations
   are perishable, and step 6 copies them verbatim into a durable document.
   - Read the checkout's current revision with
     `git -C /Users/bs5/.dalo/sources/sebastian/checkout rev-parse --short HEAD` and write it into the
     Requirement table's evidence-column heading in this plan, replacing `f4300bb`.
   - For M-1, M-3, M-4 and M-5, confirm the quoted passage still exists at the stated path and line range.
   - M-2 is a **negative** claim and needs a stated method, not a glance. Run
     `grep -rniE 'vulnerabilit|disclos|sensitive finding|security finding' skills/effective-delivery/references skills/effective-product/references`
     from the checkout root and read every hit. The claim passes when no hit assigns ownership of _withholding_
     a security finding from a tracker; it fails the moment one does. Record the command's hit count.
   - A citation that merely moved is restated in this plan's Requirement table. A citation that has vanished is
     handled like M-6: the row records the withdrawal instead of asserting a verdict, and the stop condition
     below applies.

   This step writes only into this plan file, which is why the plan is listed among the affected files. It
   touches nothing else.

1. **Recommend the owner in `investigate`, and say in Phase 3 what Phase 3 is.**
   - Add `## Recommended skills` with the single bullet `effective-delivery` directly before
     `## Project conventions` (L70), after the `session-rename` fence at L65–68. Placement is a human
     convention, not a guard — `build-lib.mjs` matches the heading anywhere in the file — so it follows
     `fix.md:75` for readability.
   - Add **one** sentence under `### Phase 3: Diagnosis` (L136) stating that its numbered points are the
     report's output contract and that the diagnostic depth behind them follows the recommended owner. Without
     it, `investigate.md:138–140` ("Formulate the root-cause hypotheses…", "Explicitly record rejected
     hypotheses…") reads as a second copy of `investigation.md:76–107` the moment the fragment declares the
     skill authoritative — the same defect the 2026-09-12 pass rated Critical, pointing the other way. One
     sentence is one counted line; step 5 measures it.
2. **Declare the relationships.** Add `investigate` and `investigation-method` as `delegate` consumers of
   `effective-delivery` in `skill-ownership.json`. In `skill-ownership.md`:
   - append both to the **end** of the L84 row's `delegate` group, in the order `investigate`,
     `investigation-method`, immediately before the semicolon that currently falls after
     `durable-follow-up-gate`. The group's internal order is already mixed and nothing machine-checks it, so
     appending is the unambiguous instruction rather than a themed insertion;
   - rewrite the classification cell's first clause to read "delegate for the delivery, diagnosis,
     dependency-maintenance, documentation, validation and durable-finding-evidence consumers", leaving the
     `route-when-relevant` clause untouched;
   - extend the audit/planning bullet (L101–105) with `investigation-method.md` as a fallback source, the
     override choice, and the report-schema role of `investigate`'s Phase 3/4.

   Then update the two exempt-by-kind enumerations, `build-system.md:214–218` and `build-lib.mjs:739–743`,
   adding `investigation-method` and `durable-follow-up-gate` to both. The two sentences around those lists
   differ and stay different; only the parenthesised set is shared.

   The inventory table is column-padded — every line of `skill-ownership.md:82–89` is currently 1847 characters
   — and the L84 row already holds the widest cells in columns two and three, so widening it reflows all eight
   lines. Run `pnpm format` after this step and expect that reflow in the diff; `pnpm agent:check` is
   check-only and will otherwise fail.

3. **Rewrite the fragment by authority, not deletion.** In `investigation-method.md`:
   - after the framing paragraph, add the authority sentence: diagnostic depth — competing hypotheses, a
     discriminating reproduction, epistemic labels, outcome classes, intervention level — follows
     `effective-delivery` where it is available; its rules on returning the report in conversation, runtime
     directories, hypothesis ledgers and mandatory report paths do not apply, because the embedding workflow's
     report path, wisdom file, routing and scope stay binding;
   - mark steps 1 and 4 as the baseline the skill deepens and the minimal fallback;
   - keep steps 2 and 3 and the "Diagnosis validation" scorecard unchanged, and do not move or reword the two
     pinned sentences at `test/delegation-mandate-contract.test.mjs:359–362`.
4. **Contract tests.** In `test/delegation-mandate-contract.test.mjs`, add a **new** `test(...)` block beside
   the existing one at L358–383 rather than extending it: that block is a loop over four sources asserting two
   shared patterns, while these three are `investigation-method`-only. Use the file's existing `assertClauses`
   helper (L84). Assert that the fragment (a) names `effective-delivery` as the authority for diagnostic depth,
   (b) states that the embedding workflow's report path and wisdom file stay binding against the skill's rules,
   and (c) still carries Clarity, Verification and Context with the `<= 10 %` target. Prove each by mutation:
   delete the clause from a `cp` snapshot, confirm the test fails, restore from the snapshot — never with
   `git checkout --`, which would discard the uncommitted work under test.
5. **Measure and set both budgets.** Run `node build.mjs` and read the measured sizes from its
   `Always-loaded core (lines/budget)` report, not from `wc -l` — the guard counts `split('\n').length`, one
   more than `wc -l` on a newline-terminated file. Set the `investigate` and `fix` entries to their measured
   size plus at most ten lines of headroom, reading each entry's actual headroom off the report rather than
   assuming ten (`build.mjs:1464–1472`). Raise `investigate`: it gains the fragment's growth, the four lines of
   its new section and the one line of the Phase 3 sentence, against five lines of headroom. Change `fix`
   **only if** its new measurement exceeds its current entry of 488 — it gains only the fragment's growth
   against four lines of headroom, so it is expected to still fit, and raising an entry that already fits is
   what `build.mjs:1464–1472` warns against.
6. **Correct the review document** in its status section:
   - change the "Three corrections" lead-in (L38) to four;
   - add a fourth correction bullet: the §6.2 recommendation (L529), repeated in P4 (L625), to move all six
     fragments did not survive a per-item comparison with the skills checkout — one item confirmed and
     implemented, two withdrawn, two deferred to an upstream contribution that has not happened, and one left
     without a basis. State it that way rather than as a blanket rejection, because the table below says
     exactly that. Carry the one-line verdict per item from the Requirement table, quote the surviving upstream
     rule that rejects M-1 with its qualifier, and note explicitly that M-6's corresponding rule was deleted
     upstream by `fcffae7` (#244) so that item's basis is gone. Name the checkout revision recorded in step 0;
   - replace the table's last row, `| M-1 … M-6 move candidates | open | — |` (L36), with the six rows below,
     in numeric order, keeping the table's three columns `Finding | Status | Landed as`. They become the
     table's last rows; there is no `Everything else` row to keep after them.

     | Finding                                                        | Status      | Landed as                                                                                                                       |
     | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
     | M-1 `worktree-lifecycle` + `execution-location` move candidate | withdrawn   | stays in Effective Flow per the correction below                                                                                |
     | M-2 `security-disclosure-gate` move candidate                  | withdrawn   | stays in Effective Flow per the correction below                                                                                |
     | M-3 `commit-message-rules` move candidate                      | open        | upstream contribution first                                                                                                     |
     | M-4 `investigation-method` move candidate                      | implemented | `#TBD` — not moved: the fragment stays in Effective Flow, with `effective-delivery` declared authoritative for diagnostic depth |
     | M-5 `adr-convention` + `project-adr-convention` move candidate | open        | upstream contribution first                                                                                                     |
     | M-6 `doc-categories` move candidate                            | open        | original upstream evidence withdrawn in `fcffae7` (#244); re-assessment pending                                                 |

   - run `pnpm format`: this table is column-padded too (its rows are currently 511–514 characters), so six
     hand-written rows will not line up until the formatter runs.
7. **Fill in the pull-request number.** `#TBD` in the M-4 row is a placeholder, because the pull request does
   not exist while step 6 runs. After the pull request is opened, replace `#TBD` with its number and commit
   that on the same branch **before** the merge gate runs. The plan is not complete while `#TBD` is still in
   the review document.

### Component structure

Not relevant.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`effective-delivery` not installed, `skills.enabled: false`, or excluded:** steps 1 and 4 as the fallback, the
  always-active steps 2 and 3, and the unchanged scorecard keep both tools functional.
- **The skill says "return the report in the conversation":** `investigate` still writes
  `.effective-flow/investigation/…` and routes onward with that path, per the override.
- **A `fix` run reaches implementation:** no longer a conflict to resolve. `investigation.md:8–14` and
  `route-audit.md:36–37` now authorize continuing into an already-authorized repair, so the skill and `fix`'s
  own scope agree. The fragment keeps stating that the embedding workflow's scope binds, so a future upstream
  reversal changes nothing here.
- **Skill outcome class "insufficient evidence"** (`investigation.md:126–127`): maps onto `investigate`'s
  existing "further investigation needed" recommendation; no template change is required.
- **`investigate`'s admission gate returns anything but `admitted`:** since `3c6e35b` (#428) only an `admitted`
  outcome persists a workflow and invocation suggestion. The manual check below must therefore be run on a case
  that is admitted, or it will observe no follow-up recommendation for reasons unrelated to this change.
- **The fragment's growth pushes `fix` over its limit:** unlikely — `fix` should absorb roughly two counted
  lines within its existing headroom — but not assumed. Step 5 measures `fix` as well and raises its entry from
  the new measurement rather than leaving it at a value chosen for a concept `build.mjs` no longer has.

### Stop conditions

- **Drift:** before step 1, run
  `git diff cecb5e5 -- src/shared/investigation-method.md src/tools/investigate.md src/tools/fix.md build.mjs build-lib.mjs docs/developer-guide/skill-ownership.json docs/developer-guide/skill-ownership.md docs/developer-guide/build-system.md docs/review/2026-08-31-architecture-and-consistency-review.md test/delegation-mandate-contract.test.mjs`.
  Line movement alone is not a reason to stop — re-resolve the anchors by content and continue. Stop only when
  a **material** anchor is gone: the exempt-by-kind enumeration, the L84 consumer cell's semicolon grouping, the
  two pinned test patterns, the `M-1 … M-6` status row, or either budget entry.
- **Delegation premise:** confirm the skills checkout still contains
  `skills/effective-delivery/references/investigation.md` reachable from `references/route-audit.md`. If that
  reference is gone or no longer covers the method, stop: the delegation premise is false.
- **Pinned sentences:** if the existing assertions of `test/delegation-mandate-contract.test.mjs` fail after
  step 3, restore the pinned sentences verbatim rather than editing those assertions.
- **Growth bound:** the fragment may gain at most four **counted** lines — physical newlines, not sentences —
  and the new `investigate` section is exactly a heading plus one bullet. Because the file is unwrapped prose,
  four counted lines is ample for the authority sentence; needing more means the fragment is being rewritten
  rather than annotated. Stop and cut back.
- **Budget growth:** the bounds above predict at most four counted lines of growth for `fix` and at most nine
  for `investigate` (up to four from the fragment, four for the new section, one for the Phase 3 sentence).
  Stop if either tool's measured size grows by more than that — the extra lines are coming from somewhere this
  plan did not sanction. Note that `fix`'s margin is exactly zero at the bound: it measures 484 against 488, so
  a full four-line fragment growth lands on 488 and passes only because the guard is `lines > limit`. The bound
  is load-bearing, not decorative.
- **Citation vanished:** if step 0 finds a second M-item whose quoted evidence no longer exists, do not
  improvise a replacement justification. Record that item the way M-6 is recorded and report it.

## Acceptance criteria

The completion condition is that all of the following hold together:

- [ ] `src/tools/investigate.md` contains `## Recommended skills` directly before `## Project conventions`, whose only
      bullet is `effective-delivery`, and its `### Phase 3: Diagnosis` states that its points are the report's
      output contract while the diagnostic depth follows the recommended owner.
- [ ] `skill-ownership.json` declares `investigate` and `investigation-method` as `delegate` consumers of
      `effective-delivery`; `skill-ownership.md`'s L84 row names both inside the `delegate` group before the
      semicolon; `node build.mjs` passes its ownership guards.
- [ ] `investigation-method.md` names `effective-delivery` as the authority for diagnostic depth, states that the
      embedding workflow's report path, wisdom file, routing and scope stay binding, keeps steps 2 and 3 active, and
      still carries the three scorecard criteria; the new contract assertions pass and each was proven by mutation.
- [ ] The existing assertions of `test/delegation-mandate-contract.test.mjs` still pass.
- [ ] `build-system.md`'s and `build-lib.mjs`'s exempt-by-kind enumerations name the same set of seven
      fragments, now including `investigation-method` and `durable-follow-up-gate`. The surrounding sentences
      differ and are not required to match. (Corrected during implementation on 2026-09-21: the criterion
      first said six, counting the five names the lists carried before this change plus one of the two
      additions.)
- [ ] The review document's lead-in reads four corrections, the new bullet references §6.2 and P4 and names the
      skills-checkout revision used, and the status table carries one row for each of M-1 … M-6 in numeric order
      in place of the former combined row, with M-6 recorded as open with its withdrawn-evidence reason.
- [ ] The M-4 row cites the real pull-request number; no `#TBD` remains in the review document.
- [ ] The `investigate` entry equals its measured always-loaded size plus at most ten lines, measured from
      `node build.mjs`'s own report; the `fix` entry was re-measured and changed only if 488 no longer covered
      it.
- [ ] `pnpm format` has run after the two table edits, and `pnpm agent:check`, `pnpm test`, `node build.mjs`
      and `pnpm test:distribution` all exit 0.

## Validation plan

| Purpose                  | Command                                                 | Expected result                                          |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| Formatting               | `pnpm format` then `pnpm agent:check`                   | the two edited tables reflow; `agent:check` then exits 0 |
| Contract tests           | `node --test test/delegation-mandate-contract.test.mjs` | exit 0, including the three new assertions               |
| Full suite               | `pnpm test`                                             | exit 0, including the ownership reconciliation tests     |
| Ownership guards, budget | `node build.mjs`                                        | exit 0                                                   |
| Distribution layout      | `pnpm test:distribution`                                | exit 0                                                   |

All commands run from the repository root. Manual check: run
`/effective-flow investigate "<a known surprising behavior>"` with `effective-delivery` installed, on a case the
durable-follow-up gate admits, and confirm the run still writes its report under `.effective-flow/investigation/`
and ends with exactly one follow-up recommendation.

## Assumptions and open points

- Assumption: the skills checkout is current enough for this decision at the moment step 0 runs. An upstream
  revision that removes `references/investigation.md` would reverse M-4; step 0 and the delegation-premise stop
  condition are what catch that.
- Out of scope, deliberately: any contribution to the skills repository, including the M-3 runtime-effect and
  squash-title rules and the M-5 naming-resolution rules; any change to M-1 or M-2; **any re-derivation of M-6's
  verdict**, which is recorded as open rather than resolved; any change to `fix`'s phases.
- Carried forward for a separate change: M-6 needs a fresh comparison against the current skills checkout before
  its row can be closed. Nothing in this plan depends on that outcome.
- Observed and deliberately left alone: `src/shared/skill-discovery.md:13` still reads "If no such section
  exists (e.g. for tools), this point does not apply". That parenthetical was already inaccurate once `fix`
  gained a `## Recommended skills` section, and `investigate` makes it more so. Correcting it is a
  shared-fragment edit that would need every embedding host re-measured and re-validated, which is out of
  proportion to this plan.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         2 |    1 |

### Findings

Plan review of 2026-09-12, by an independent read-only reviewer against `origin/develop` at `4321151` and the skills
checkout at `f79397b`, applying the `effective-delivery` implementation-plan review checklist. Every finding was
incorporated.

- **Critical — Architecture — override not in runtime text.** The report-path resolution was recorded only in the
  developer guide, which no run reads; the skill's conflicting rule is three-sided (report in conversation, runtime
  directory, hypothesis ledger). Incorporated: the authority sentence in the fragment states the override for both
  embedding workflows, including `fix`'s scope; an acceptance criterion and a contract test cover it.
- **Important — Architecture — fallback labelling contradicted both tools.** Steps 2 and 3 are unconditional
  orchestration and user interaction. Incorporated: only steps 1 and 4 become baseline and fallback.
- **Important — Maintainability — review-document rows.** A landing commit is unknowable inside a squash-merged PR,
  the "Two corrections" lead-in would go stale, "withdrawn" was undefined, and P4 repeats §6.2. Incorporated: PR
  number, updated lead-in, defined wording, P4 referenced, "Everything else" kept last, and the status-table catch-up
  made a prerequisite.
- **Important — Maintainability — `fix` judgement entry.** Resetting `fix` from 700 was out of scope. Incorporated:
  `fix` stays at 700; only `investigate` is raised.
- **Important — Testability — no durable proof.** Incorporated: three contract assertions, each proven by mutation.
- **Important — Scope — Refactoring misstated a deliberate behavior change.** Incorporated: reclassified as Feature,
  with the #393 precedent noted.
- **Note — Architecture — fragment as consumer.** Incorporated: `investigation-method` added as a `delegate` consumer.
- **Note — Architecture — Phase 3/4 overlap.** Incorporated: recorded as the report schema in the plan and the guide.
- **Note — Maintainability — guide wording not machine-checked.** Incorporated: consumer placement, "diagnosis"
  wording, fallback list.
- **Note — Error cases — incomplete drift check.** Incorporated: `build.mjs`, `fix.md` and `build-system.md` added;
  section placement made exact.
- **Corrections to claims:** `worktree-safety.md:22–23`; the `route-docs.md` qualifier; M-3's coverage restated;
  `fix.md:75` for the heading; `build-lib.mjs` L730–802 for the reverse check; the review document's correction list
  is established practice rather than a stated rule; `build.mjs` did change in `4321151`. All corrected above.

### Revision review of 2026-09-21

Revision pass against `origin/develop` at `cecb5e5` and the skills checkout at `f4300bb`, applying the
`effective-delivery` implementation-plan review checklist to the plan as revised. The 2026-09-12 pass above is
retained unchanged. Every finding below was incorporated.

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    1 |

#### Findings

- **Critical — Architecture — M-6's evidence no longer exists.** Step 6 would have written
  `route-docs.md:95–97` rejecting "a mandatory docs hierarchy when the repository does not already use one"
  into the review document as the reason M-6 stays; `fcffae7` (#244) deleted that passage and the phrase now
  appears nowhere in the skills tree. Citing it would have introduced into a durable document exactly the
  defect class that document's correction list exists to record. Incorporated on the user's decision of
  2026-09-21: M-6's row becomes "open — original upstream evidence withdrawn, re-assessment pending", the
  correction bullet quotes only M-1's surviving rule, and a new step 0 re-verifies every M-item citation
  against the then-current checkout before any of them is written down.
- **Important — Architecture — the `fix` budget premise collapsed.** The plan rested on `fix` being a
  deliberate 700-line judgement entry able to absorb the fragment's growth. `2874b84` removed the
  judgement-entry concept from `build.mjs` entirely and `3c6e35b` (#428) set `fix: 488`; both consuming tools
  are now ordinary measured ratchets with single-digit headroom, and this eagerly included fragment is charged
  to both. Incorporated: the decision is rewritten, step 5 measures and sets **both** entries from the build's
  own report, and the acceptance criterion covers both.
- **Important — Error cases — the prerequisite and the "Everything else" instruction cannot execute.**
  `1b81edd` (#437) already performed the status-table catch-up: P1's findings, F-16 and §5 are recorded, the
  `Everything else | open` row is gone, and the table's last row is the `M-1 … M-6` row this plan replaces. The
  lead-in already reads "Three corrections". Incorporated: step 0's prerequisite and the matching stop
  condition are removed, the lead-in edit is three → four, and step 6 replaces the combined row rather than
  inserting beside it.
- **Important — Maintainability — editing one of two divergent, unchecked lists.** `build-system.md:214–218`
  and its verbatim twin at `build-lib.mjs:739–743` both enumerate the fragments exempt by kind and both already
  omit `durable-follow-up-gate` (#428). Adding `investigation-method` to one of them would have left a
  knowingly wrong list in the line being touched. Incorporated on the user's decision of 2026-09-21: both
  enumerations gain both names, `build-lib.mjs` enters the affected files for that comment only, and an
  acceptance criterion requires the two lists to be identical.
- **Note — Architecture — the third side of the conflict lapsed.** `fcffae7` deleted the upstream rule
  requiring a diagnosis to stop before implementation; `investigation.md:8–14` and `route-audit.md:36–37` now
  affirmatively authorize continuing into an already-authorized repair. Incorporated: the override names four
  skill rules instead of five, the corresponding edge case is restated as "no longer a conflict", and the
  positive half still names **scope**, so an upstream reversal would cost nothing here.
- **Note — Testability — the growth bound's unit was ambiguous.** The fragment is unwrapped prose — its
  framing paragraph is a single 591-character line — and the guard counts `split('\n').length`, so a long
  sentence costs one counted line. The first draft of this revision mis-stated the cost as tight and claimed
  dropping a clause "buys back a line". Corrected: the bound is four **counted** lines, the unwrapped-prose
  fact is recorded under "Verified current state", and the false claim is removed. Also verified there:
  nothing in `test/` currently pins the scorecard, so assertion (c) is new rather than a duplicate.
- **Note — Maintainability — the enumeration drift is fixed, not prevented.** Nothing machine-checks the two
  exempt-by-kind lists against the manifest's shared-fragment consumers, so the next such consumer will make
  them stale again. A guard reconciling them would close that, and is deliberately left out of this plan's
  scope; recorded here as the review focus for whoever touches those lists next.
- **Note — Error cases — the drift stop condition was too sensitive.** As written it would have fired on the
  23 commits of harmless line movement since `4321151`. Incorporated: it now names the material anchors whose
  absence stops the run — the exempt-by-kind enumeration, the L84 semicolon grouping, the two pinned test
  patterns, the `M-1 … M-6` row and the two budget entries — and states that line movement alone is re-resolved
  by content instead.
- **Corrections to claims carried over from the first pass:** planning baselines (`4321151` → `cecb5e5`,
  `f79397b` → `f4300bb`); `investigation.md` 179 → **181** lines and `:15–18` → **`:16–19`**; `fix.md:97` →
  **`:105`**; `fix.md:155` → **`:163`**; `investigate.md:125` → **`:132`**, `:126` → **`:133`**, `:213` →
  **`:231`**; the contract test block `270–289` → **`358–383`**; `skill-ownership.json:36` → **`:37`**; P4
  `L606` → **`L625`** and §6.2 at **L529**; the corrections list `L25–37` → **`L38–55`**; `build-system.md`
  `L191–195` → **`L214–218`**; the reverse-check throw `L789–792` → **`L790–792`**; and
  `assertSkillOwnershipContract` `L638–652` → **`L640`**, with the row reconciliation actually at **L669–683**
  (the cited `L528–531` is an unrelated comment). `fix.md:75`, `skill-ownership.md`'s L84 row and its L101
  audit/planning bullet, and the `build-lib.mjs` forward and reverse checks' behavior all still hold. All
  corrected above.

### Deep interactive review of 2026-09-21

Deep interactive plan review of the revised plan, delegated to an independent read-only reviewer against
`origin/develop` at `cecb5e5` and the skills checkout at `f4300bb`, applying the `effective-delivery`
implementation-plan review checklist. One point required a user decision and was decided on 2026-09-21; every
other finding was incorporated directly.

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        1 |         2 |    3 |

#### Findings

- **Critical — Maintainability — step 6's six rows were not executable.** The status table has three columns
  (`Finding | Status | Landed as`), but the step specified row content as undivided strings, gave no
  `Finding`-cell text, fixed no row order, and required a pull-request number that does not exist while step 6
  runs. Incorporated: the six rows are written out in full with all three cells in numeric order, and a new
  step 7 fills `#TBD` in after the pull request is opened, with an acceptance criterion that no `#TBD`
  survives.
- **Important — Architecture — `investigate`'s Phase 3 is method text, not a schema.** `investigate.md:138–140`
  ("Formulate the root-cause hypotheses with evidence and a confidence per hypothesis", "Explicitly record
  rejected hypotheses…") runs parallel to `investigation.md:76–107`. Declaring Phase 3 a report schema only in
  this plan and the ownership guide repeats the 2026-09-12 pass's Critical in the opposite direction: the
  ruling would not be in the text a run reads. **Decided by the user on 2026-09-21:** step 1 adds one sentence
  under `### Phase 3: Diagnosis` stating that its points are the report's output contract and that the depth
  follows the recommended owner. It costs one counted line, which step 5 now measures.
- **Important — Architecture — the `fix` budget instruction contradicted itself.** Affected files mandated a
  `fix` change, the acceptance criterion was satisfied by leaving it alone, and an edge case argued for raising
  it on a premise this plan's own revision review had already retired. Measured today `fix` is 484/488 and
  gains about two lines, so raising it is exactly what `build.mjs:1464–1472` warns against. Incorporated: one
  instruction in all three places — raise `investigate`, change `fix` only if its new measurement exceeds 488.
- **Important — Error cases — the budget stop condition could not fire.** It said to stop if an entry needed
  more than ten lines of headroom over its measurement, while step 5 constructs each entry as measurement plus
  at most ten. Incorporated: replaced with an observable bound on measured _growth_ — at most four counted
  lines for `fix`, at most nine for `investigate` — plus the note that `fix`'s margin is exactly zero at the
  growth bound.
- **Important — Testability — step 0's M-2 negative claim had no discharge method.** The skills tree holds 348
  Markdown files; "no upstream reference owns withholding security findings from a tracker" named no search,
  no file set and no pass criterion, yet it was going to be written into a durable correction record.
  Incorporated: step 0 now names the exact `grep`, the file sets, the pass criterion and the recorded hit count.
- **Important — Scope — step 0 "writes nothing" but step 6 consumes its output.** The recorded checkout
  revision and any restated citation had nowhere to live, and would be lost across a worker handoff or a second
  session. Incorporated: step 0 writes its result back into this plan's Requirement table, and the plan file is
  listed among the affected files for that step only.
- **Important — Maintainability — the two table edits reflow their whole tables and no step ran the
  formatter.** `skill-ownership.md:82–89` is column-padded to 1847 characters a line and the L84 row already
  holds the widest cells, so widening it rewrites all eight lines; the review document's status rows are padded
  to 511–514 characters. The validation plan ran only the check-only `pnpm agent:check`. Incorporated:
  `pnpm format` is named in steps 2 and 6, the reflow is stated as expected, and the validation plan runs the
  formatter before the check.
- **Important — Maintainability — the "twin comment" is not the same sentence.** `build-lib.mjs:739–743` ends
  "can never carry a section of its own"; `build-system.md:215–218` ends "can never produce a chain". Only the
  parenthesised list is shared, and an acceptance criterion of textual identity was unsatisfiable.
  Incorporated: the criterion now requires both to name the same set of fragments, and the step says the
  surrounding sentences stay different.
- **Note — Maintainability — "before the semicolon" fixed the group, not the position.** The delegate group's
  internal order is already mixed and nothing machine-checks it. Incorporated: append both at the end of the
  group, `investigate` then `investigation-method`.
- **Note — Maintainability — "add 'diagnosis' to the classification wording" was not executable.**
  Incorporated: the plan now gives the resulting clause verbatim.
- **Note — Maintainability — two M-item citations were bare filenames, one from another skill.** `adr-format.md`
  lives under `effective-product`, not `effective-delivery`, yet step 0 must confirm each passage "at the stated
  path". Incorporated: the Requirement table now carries full paths for M-3, M-5 and M-6.
- **Note — Scope — the correction bullet's thesis overstated its own table.** "Did not survive comparison" reads
  as a blanket rejection while only two of six items are firm rejections. Incorporated: the bullet now states
  the per-item split explicitly.
- **Note — Testability — the three assertions do not belong in the adjacent loop.** L358–383 loops over four
  sources asserting two shared patterns. Incorporated: step 4 requires a new `test(...)` block using the file's
  `assertClauses` helper (L84).
- **Note — Architecture — `fix`'s margin is exactly zero at the growth bound.** Recorded in the budget stop
  condition so the implementer knows the bound is load-bearing rather than decorative.
- **Note — Architecture — a stale parenthetical downstream.** `src/shared/skill-discovery.md:13` still says a
  `## Recommended skills` section does not exist "e.g. for tools", which `fix` already contradicts. Recorded
  under assumptions as observed and deliberately out of scope: it is a shared-fragment edit charged to every
  host that includes it.
- **Claims the reviewer confirmed rather than broke:** every line citation in the revised plan; the unwrapped-prose
  measurement mechanism and the ten-line ceiling as a written rule; that `investigate` needs raising and `fix`
  does not; that placement of `## Recommended skills` is irrelevant to the build, so the plan's placement rule is
  a readability convention; that no test counts ownership consumers and no other guard, agent roster or manifest
  check is triggered; that the merge-gate eval is not implicated, because its build identity hashes a load set
  reachable only from `merge-gate` and `iterate`, so no re-record is owed; and that dropping the "read-only
  stopping" clause is safe, because `investigation.md:12` independently says to honor an explicit read-only
  restriction.

## Implementation record

Implemented on 2026-09-21 from `cecb5e5`, on branch
`effective-flow/build/delegate-investigation-method`.

### Delivered scope versus the plan's table

Ten files changed, plus this plan. Nine match the affected-files table. One was added to that table
during implementation rather than foreseen in it:

- `docs/user-guide/tools-understand.md` was in no plan step. The mandatory documentation sync gate
  recorded its `/effective-flow investigate` section as `blocked`: the section enumerates the report's
  contents, which the delegated depth made incomplete. `blocked` is `current-scope` under that gate,
  so it was corrected in this run and the row added to the table above.

`build-lib.mjs` is in the table for its exempt-by-kind comment only; no guard logic was touched.

### Step 0's outcome

All six M-item citations were re-verified against the skills checkout at `f4300bb`, which had not
moved since the plan was revised, so no revision edit was owed. M-1, M-3, M-4 and M-5 still sit at
their cited paths and line ranges; M-4's `references/investigation.md` is 181 lines and still
reachable from `route-audit.md:35–37`, so the delegation premise held. M-2's negative claim was
discharged by the plan's own grep — 17 hits, none assigning ownership of withholding a finding from
a tracker — and independently re-run by the validator. No second citation had vanished, so the
"citation vanished" stop condition did not fire.

### Budgets

Measured from the build's own `Always-loaded core (lines/budget)` report, never from `wc -l`. The
fragment grew **2** counted lines against its bound of four; `investigate` grew **8** against nine
and `fix` **2** against four. `investigate`'s entry rose 545 → **553** (measured 548, five lines of
headroom). **`fix` stayed at 488** (measured 486): it still fits, and raising an entry that already
fits is what `build.mjs:1464–1472` warns against. The widened override clause and the extended
Phase 3 sentence were both written in place, so neither added a physical line.

### Validation

`pnpm agent:check`, `pnpm test` (1123 tests, 1122 pass, 0 fail, 1 pre-existing skip),
`node build.mjs` and `pnpm test:distribution` all exit 0, re-run after the review incorporation
pass. The three new contract assertions were each proven by mutation from a `cp` snapshot, and
after the review found the first versions too loose, every tightened pattern was proven **both
ways** — the meaning-inverting probe now fails, an innocuous rewording still passes.

### Deliberately outstanding at this point

The M-4 row of the review document carries `#TBD`. Step 7 replaces it with the pull request's real
number on this same branch before the merge gate runs.

## Review findings

**Date:** 2026-09-21
**Reviewer:** `effective-flow-code-validator` (the routing contract maps both this change's buckets,
tooling and documentation, to it; no product bucket existed, so no product reviewer ran)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    15 |
| Open / Not implemented |     1 |

Three Important and ten Notes from the review pass, plus three actionable findings from the
validation pass — all fixed in one incorporation round, except the one recorded below. No external
review report was written, because no finding was offloaded.

The three Important findings are worth recording, because two of them were the change turning on
itself. The review document's two new rows said "per the correction above" while the corrections
list sits below the table — a wrong cross-reference inside the very record whose purpose is citation
hygiene. The user-guide sentence promised that the report "additionally carries" epistemic labels,
outcome classes and an intervention level; the report template has no field for any of them, and the
sentence contradicted its own preceding clause. What was delegated is the depth of the _diagnosis_,
not the shape of the _report_, and the guide now says so. The third was the new contract test: the
reviewer probed it and showed that a fragment reduced to `Its rules on hypothesis ledgers do **not**
apply here, … its transient wisdom file stay binding` still passed — the override's antecedent was
entirely unpinned, and "its routing and its own scope" sat inside a free 80-character gap. The
antecedent now has its own order-free assertion, all four bindings are named literally, and a
negation can no longer slip past the authority clause or the Context threshold.

Two Notes closed holes the plan had not seen: the skill's rule at `investigation.md:17–18` ("Save or
publish it only when asked") was the sentence most able to stop a run writing its report at all and
was not named in the override, and `investigate`'s Phase 3 output-contract sentence — the only half
of this change with no guard — now has an assertion of its own, since its sibling section is
build-guarded while the sentence was not.

**Open / not implemented:** the `merge-gate` eval archive reports all five runs stale. It is **not
caused by this change**: the same verdict holds on the untouched checkout at `cecb5e5`, the changed
files are `SKILL.md`, `shared/pr-review-integration.md`, `tools/iterate.md` and `tools/merge-gate.md`,
and none of them is in this diff. `investigation-method`, `investigate` and `fix` are not in the
gate's build-identity load set, so this change owes no re-record. The debt is pre-existing and
belongs to whoever next touches the gate.

## Open points

- No open points.

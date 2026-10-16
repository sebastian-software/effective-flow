# Targeted free-text setup changes

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

After the first-time setup, `effective-flow setup` should accept free text so a user can make a
specific change to the Effective Flow configuration without walking through Profile, Express or
Guided again. Examples: "switch the review profile to fast", "set the tracker to GitHub", "add
coderabbitai as a merge-gate bot". The same entry also answers read-only questions about the current
configuration, such as "which tracker is configured?", without writing anything.

Today Step 0 of `src/tools/setup.md` (lines 154–177) accepts exactly five invocations and stops on
any other argument: "Do not reinterpret it as free text and do not ask a setup-mode question". The
rule comes from `docs/plan/archive/2026-09-14-profile-first-setup-with-two-core-questions.md`.
`docs/plan/archive/2026-08-25-suggest-setup-for-unconfigured-automatic-reviewers.md` named "setup
gains a direct targeted update mode" as a trigger for revisiting its decision. This plan is that
trigger.

Decisions taken with the user during planning:

- **Invocation:** `effective-flow setup <free text>`. Every argument that is not exactly one of the
  existing keywords is a free-text request. There is no extra `change` keyword.
- **Scope:** every known configuration key can be changed, with two exceptions that stay with the
  full setup:
  - the visibility switch (hidden ↔ standard);
  - the Fast field-pilot opt-in `executionProfiles.fast.enabled`.

  Keys that need verification or have side effects go through the question and validation of the
  fragment that already owns them.

- **No configuration yet:** stop without mutation and point to `effective-flow setup` /
  `effective-flow setup express`. First-time setup and the transitional JSON migration stay there.
- **Read-only questions:** answered from the resolved configuration, with no write and no
  confirmation question.

Workflow recommendation: **Feature**. It adds a user-visible setup mode and changes the
accepted-argument contract.

## Architecture decisions

- **Keyword precedence, then free text.** Step 0 keeps its normalization (trim, ASCII case fold) and
  the five keyword forms.
  - Only when the whole normalized argument is not exactly a keyword is it classified as a
    **Targeted** request. The original text is kept verbatim for interpretation.
  - The rule "unknown argument prints the five forms and stops" is removed.
  - A free text with no recognizable configuration intent, a typo like `exprss` included, reports
    that nothing was recognized, lists the five keyword forms plus the free-text form, and stops
    without mutation.
- **New lazy fragment `src/shared/setup-targeted-change.md`.** The setup core is at its context
  budget: `build.mjs:1998` sets `setup: 1545`, and the build measures 1545/1545.
  - The core carries only the Step 0 classification, the lazy pointer, the Step 3 branch, the
    explicit Targeted exceptions in Steps 0/6/8, and the Rules.
  - The full Targeted contract lives in the fragment.
  - The `setup` budget is raised to the measured built count plus up to ten lines of headroom, per
    `AGENTS.md`.
- **The Targeted fragment loads the owning fragments itself.** These are lazy pointers from
  `setup-targeted-change`, each with a `when:` naming the touched key group:
  - `setup-guided-core-switches` (core-switch keys);
  - `setup-advanced-settings` (block keys);
  - `setup-hidden-mode` (only its "Writing the hidden local configuration" section).

  Consequences:
  - Each fragment's opening "This fragment is loaded only when …" sentence names the Targeted route
    as a second entry.
  - Each ask inside them whose `when:` assumes the Guided path also admits a Targeted run that
    touches that key.
  - The "only setup loads these" invariant in `test/workflow-contracts.test.mjs:1178-1183` becomes
    "only `tools/setup.md` and `shared/setup-targeted-change.md` load these, and never eagerly".
  - A Targeted run asks only the question for each touched key. It never walks a whole block: a
    single `mergeGate.maxRounds` change asks `maxRounds` alone, not all of block 9.

- **No new writer.** Setup stays the only configuration writer (`src/tools/setup.md:849`), and no
  script writes the ADR. A Targeted run reuses Step 6 items 1, 2 and 4, plus a Targeted variant of
  item 3:
  - **Item 1:** build the target non-destructively from the resolver's `data.values` and
    `data.source.rows`. Untouched and unknown rows are carried byte for byte. The retired-row
    rewrite and the bot collapse are required for every mode, so they run here too.
  - **Item 2:** one before/after list and one explicit confirmation.
  - **Item 3 (Targeted variant):** the fresh re-resolution must return the same `data.source.step`
    and `path`.
    - Any other result stops without writing and points to the full setup. That includes a vanished
      ADR, a newly appearing transitional source, several-match, and an invalid-source diagnostic.
    - If the fresh value of any touched key differs from the preview's "before" value, rebuild the
      preview and confirm again. This is what honours "Never overwrite existing config values …
      without asking" (`setup.md:1024`).
    - Untouched rows come from the fresh read.
  - **Item 4:** writes in place at the resolved ADR's own path and directory. Targeted never needs
    Step 2 item 1 or `<adr-convention>`, because the "new ADR" branch cannot be reached.
  - **Hidden mode:** the write goes through "Writing the hidden local configuration" of
    `setup-hidden-mode`.
- **Narrow lifecycle.** A Targeted run skips:
  - the Visibility question;
  - Step 1 (`.gitignore` / `info/exclude`);
  - Step 2 items 1 and 3;
  - Steps 4–5, except the owning questions for touched keys;
  - Step 6 items 5–7 (marker, migration, `CLAUDE.md` fence);
  - Step 7 (rename probe).

  It writes only the rows the request names, plus what Step 6 item 1 requires for every mode. Both
  appear in the same preview.

- **One refusal rule.**
  - **Precondition stops** end the whole run without mutation: no configuration, a transitional
    source, several-match, an invalid source, a `legacy-slug`, `dead-marker` or `marker-divergence`
    diagnostic, or an unverifiable runtime root.
  - **Per-operation refusals** are reported in the preview, and the remaining operations are
    offered in one confirmed unit. These are: a redirected key (visibility, Fast pilot,
    first-time-only actions), a forced key in hidden mode, a non-schema key, and an unresolved
    ambiguity in a non-interactive run.
- **Chat language does not rebind.** Targeted resolves `language.chat` once under the ordinary rule
  and never rebinds during the run. A changed `language.chat` takes effect from the next run. This
  is stated in the Targeted fragment. `src/shared/chat-language.md` is not edited: it is eager in
  every tool and loaded by every eval suite.
- **Merge-gate advisory route unchanged.** `src/tools/merge-gate.md:1089` keeps pointing to `setup
guided` → Advanced → Block 9. Changing it touches a merge-gate-suite source; that is a separate
  follow-up.

### Key-to-owner map (content of the Targeted fragment's table)

| Key group                                                                              | Owner and block                                                    | Targeted-specific rule                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review.*`                                                                             | `setup-advanced-settings` block 1                                  | —                                                                                                                                                                                                                                                             |
| `applyReview.*` (`defaultCommitStrategy` incl. `null` = ask, `worktree.setup` command) | block 2                                                            | —                                                                                                                                                                                                                                                             |
| `language.project`, `language.*` overrides                                             | `setup-guided-core-switches` (Language) + `config-setup-migration` | a `language.workflow` change also offers the `plan.markerLanguage` migration proposal as the owner does; "reset `language.chat`" removes the row (mirror), never writes `null`                                                                                |
| `plan.dir`, `concept.dir`                                                              | block 4                                                            | canonicalized, not the same directory and not nested; forced in hidden mode                                                                                                                                                                                   |
| `delivery.completion` (incl. `null` = ask), `delivery.prReview`                        | `setup-guided-core-switches`                                       | `delivery.prReview` forced `off` in hidden mode                                                                                                                                                                                                               |
| `delivery.baseBranch`, `delivery.returnBranch`                                         | core Step 4 base-branch rule                                       | `git remote` / `origin/HEAD` proposal; divergence named in the preview                                                                                                                                                                                        |
| `delivery.branchPrefix`, `delivery.mergeMethod`                                        | block 5                                                            | hidden mode rejects a prefix containing `effective-flow`                                                                                                                                                                                                      |
| `worktree.enabled`                                                                     | `setup-guided-core-switches` (Worktree)                            | —                                                                                                                                                                                                                                                             |
| `worktree.setup`, `worktree.baseDir`                                                   | block 6                                                            | —                                                                                                                                                                                                                                                             |
| `tracker.mode`, `tracker.remoteToolOverride` (incl. `AMBIGUOUS_HOST` free text)        | `setup-guided-core-switches` (Tracker)                             | forced `local` in hidden mode                                                                                                                                                                                                                                 |
| `tracker.externalTool`, `…Hint`, `…StartedState`, `…DoneState`                         | `setup-guided-core-switches` (external) + block 7                  | fresh discovery and stable-ID matching as the owner does: an unavailable or ambiguous connection proposes no value and leaves the state `null` with the owner's report; Step 6 item 3's pre-write replay also runs for a Targeted run that touches these keys |
| `skills.*`                                                                             | block 8                                                            | `skills.agents.<name>` / `skills.tools.<name>` only with source agent or tool names                                                                                                                                                                           |
| `mergeGate.*`, `mergeGate.bots`, `.trigger`, `.check`                                  | block 9 + core "Collapsing two `mergeGate.bots` spellings"         | collapse before the per-reviewer follow-up; only touched reviewers are asked                                                                                                                                                                                  |
| `executionProfiles.fast.enabled`                                                       | —                                                                  | redirected to `setup guided` → Advanced → Block 10                                                                                                                                                                                                            |
| `visibility`                                                                           | —                                                                  | redirected to `setup hidden` (to hide) or `setup` / `setup guided` answering `Standard` (to unhide)                                                                                                                                                           |

For an invalid enumerated value, Targeted asks again. It does not fall back to the default as the
Guided owner may, because the user asked for one specific change. A non-interactive run reports the
invalid value and writes nothing for that operation.

## Affected files

| File                                       | Description                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/setup.md`                       | See the itemized list below this table.                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/setup-targeted-change.md`      | New fragment. It covers: the precondition and stop list; interpretation (set / reset / question); read-only answers; the key-to-owner table; redirects; hidden-mode forced keys; the refusal rule; the chat-language note; lazy pointers to the three owning fragments; the hand-off to Step 6 items 1, 2 and 4 with the Targeted item 3; non-interactive behavior; the Targeted summary content. |
| `src/shared/setup-guided-core-switches.md` | Opening sentence (`:3`) and every Guided-only ask `when:` admit a Targeted run touching that key.                                                                                                                                                                                                                                                                                                 |
| `src/shared/setup-advanced-settings.md`    | Opening sentence (`:3`) admits Targeted; it states that a Targeted run asks only the touched key's question; the block 10 line stays Guided-only.                                                                                                                                                                                                                                                 |
| `src/shared/setup-hidden-mode.md`          | Opening sentence (`:3-5`) admits the Targeted hidden write, for the write section only.                                                                                                                                                                                                                                                                                                           |
| `build.mjs`                                | `CONTEXT_BUDGET_LINES.setup` set to the measured built count plus at most 10 lines.                                                                                                                                                                                                                                                                                                               |
| `test/workflow-contracts.test.mjs`         | See the itemized list below this table.                                                                                                                                                                                                                                                                                                                                                           |
| `docs/user-guide/tools-setup.md`           | The accepted invocations (`:22-37`) gain the free-text form. A new section "Targeted changes and questions" covers examples, the precondition, what is skipped, and the two redirects.                                                                                                                                                                                                            |
| `docs/user-guide/configuration.md`         | Where a single key is routed to `setup guided` (`:499`, `:823`, `:844-845`), name the targeted form as the shorter route. The Fast-pilot passages stay unchanged.                                                                                                                                                                                                                                 |
| `docs/user-guide/getting-started.md`       | The setup modes list (`:228-234`) gains one line for later targeted changes.                                                                                                                                                                                                                                                                                                                      |
| `docs/developer-guide/build-system.md`     | Add `setup-targeted-change` to the mode-gated lazy list (`:781-792`). Update the argument-router rationale (`:797-801`): keyword vs. Targeted is classified before any mutation.                                                                                                                                                                                                                  |

Changes in `src/tools/setup.md`:

- **Frontmatter:** `description` and `catalogHint` mention targeted free-text changes and questions.
- **Goal:** one new bullet.
- **Config schema:** add `concept.dir` to the `plan` bullet (`:89`).
- **Step 0** (`:154-177`):
  - Any other argument selects **Targeted**.
  - Replace the stop sentence and the "Do not reinterpret it as free text" sentence.
  - Add the `setup-targeted-change` pointer.
  - "Every mode then resolves the visibility" (`:179`) excludes Targeted, and so does the
    Visibility ask's `when:` (`:194`).
- **Step 3:** add the **Targeted** branch.
- **Step 6:**
  - Preamble: Targeted runs items 1, 2 and 4, with its own item 3 from the fragment.
  - Item 2 (`:454`): the change-source list names Targeted.
  - Item 3 (`:501`): keep the "For External + forge, after rebuilding" sentence unchanged and add
    one sentence that applies the replay to a Targeted run touching external tracker keys.
  - CLAUDE.md fence paragraph (`:800-807`): state the Targeted exception. Targeted writes no root
    file and poses no fence.
  - Retired-row block (`:826`): "Express or Guided write" also names Targeted.
- **Step 8** (`:933`): the mode list includes Targeted, with its reduced bullet set.
- **Header lazy pointer `runtime-state-safety`** (`:35-38`): its `when:` admits the Targeted hidden
  write.
- **Rules** (`:1025-1031`): a Targeted run changes only the requested rows plus what Step 6 item 1
  requires for every mode.

Changes in `test/workflow-contracts.test.mjs`:

- **Step 0 test (`:1102`):** the new contract, and the pointer list
  `['setup-profiles', 'setup-targeted-change']`.
- **Decision-point test (`:1143`):** pin the new pointer. Relax the "only setup loads these" loop
  (`:1178-1183`) to admit `shared/setup-targeted-change.md`.
- **CLAUDE.md-fence invariant test (`:438-485`):** it names the Targeted exception as its new
  invariant.
- **Shared preview-gate test (`:1679`):** extend it to Targeted. The External + forge anchor sentence
  stays.
- **New fragment test:** asserts the fragment's invariants.

## Implementation details

### Approach

1. **Step 0 (core).** Keep the five keyword forms and their normalization.
   - Any other non-empty argument selects **Targeted**, with its original text kept verbatim.
   - Targeted skips the Visibility question and loads `setup-targeted-change` before Step 1.
   - The pointer's `when:` is "the normalized invocation is non-empty and is not exactly one of the
     five keyword forms".
2. **Precondition.** Resolve read-only with `tool: "setup"`.
   - Continue only for `data.source.step` 0 (hidden local file) or 1–2 (ADR).
   - Stop without mutation for every precondition stop listed under "One refusal rule". Name what
     was found and point to `effective-flow setup` or `effective-flow setup express`. A Targeted run
     never offers a replacement or overwrite of an invalid source.
3. **Interpretation.** Map the free text, in any language, to operations on known schema keys:
   - _set_ `<key> = <value>`;
   - _ask_ `<key>`: a change request without a value ("ask me for …", "let me choose …"). It runs
     the owner's question for that key, with the current value as the pre-selection. A value that
     is visibly a placeholder (such as `<exact check context>`) counts as no value and becomes an
     _ask_; it is never written;
   - _reset_ `<key>`: remove the row, so the source skill's default applies;
   - _question_ about keys.

   Rules:
   - One request may hold several operations.
   - Each ambiguity gets one focused question that offers only valid values. Example: "prReview"
     could mean `delivery.prReview` or `mergeGate.*`. Never guess.
   - Redirects and refusals follow "One refusal rule".
   - Requests for first-time-only actions are redirected to the full setup: `.gitignore`, marker,
     `CLAUDE.md` import, rename probe, legacy JSON migration.

4. **Read-only answers.**
   - Answer from `data.values` and the source path. In hidden mode, add the forced values.
   - For an absent key: "not set — default: …". The default comes from the schema, and for
     `delivery.baseBranch` it is derived with the Step 4 rule.
   - Check `data.retired` too. A question about a key whose retired row exists names that row and
     says that other runs stop until setup migrates it, and that a Targeted write of any key will
     offer that migration.
   - No write, no confirmation, no next-steps block.
   - A mixed request answers the questions first, then shows the change preview.
5. **Per-key validation.** For each touched key, run only that key's question from its owner, as the
   key-to-owner table states. The requested value is the proposal and the current value is shown as
   "currently recorded". Adding a reviewer to `mergeGate.bots` also counts as touching that
   reviewer's `.trigger` and `.check`: Block 9's per-reviewer follow-up asks both for the new
   reviewer, including its "not set" answer for `.check`. A request that touches only an existing
   reviewer's `.check` asks only `.check`.
6. **Hidden mode.**
   - Forced keys are refused with the reason, and the user is told that `setup` answering `Standard`
     leaves hidden mode.
   - The runtime-state write-safety guard runs before the write and re-checks the ignore state. A
     failure stops the run and points to `effective-flow setup hidden`.
7. **Write.** Step 6 items 1, 2 and 4, plus the Targeted item 3, as decided above. If the request
   matches what is already recorded, the run writes nothing, asks no confirmation, and says so.
8. **Non-interactive run.** Answer the questions. Report the interpreted operations and the preview
   that would have been shown. Write nothing.
9. **Summary (Step 8 for Targeted).** Report:
   - the mode `Targeted`;
   - the interpreted operations;
   - the rows written, or "nothing written" with the reason;
   - the source path;
   - retired rows rewritten and bot collapses;
   - each refused or redirected operation, with its route.

   No next-steps block: a Targeted run stages nothing.

10. **Tests, docs, budget.** As listed in "Affected files". Run `node build.mjs`, read the `setup`
    line of "Always-loaded core (lines/budget)", and set the budget to that count plus at most 10.

### Component structure

Not relevant. This is a prompt-text change in one tool, three shared fragments, and one new shared
fragment.

### State management

Not relevant beyond the existing contract. The configuration is the project setup ADR or the hidden
local file. The Targeted mode name is run state and is never written.

### API integration

Not relevant. The change reuses `config-resolve.mjs` read-only and, for external tracker keys, the
owner's existing discovery path.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`setup Express` / `setup  guided `:** keyword (case fold and trim), not free text.
- **`setup guided tracker github`:** not a keyword form. Targeted interprets the whole text, and
  "guided" does not start Guided mode.
- **`setup exprss`:** Targeted. Nothing is recognized, the accepted forms are listed, and the run
  stops without mutation.
- **Value already recorded, or reset of an absent key:** nothing is written and no confirmation is
  asked.
- **Retired `prReview.*` / `worktree.*` row present:** its rewrite appears in the same preview. A
  declined confirmation leaves every row unchanged.
- **ADR changed between preview and write:** if a touched key changed, the preview is rebuilt and
  confirmed again. If the source step or path changed, the run stops (Targeted item 3).
- **Legacy-slug ADR, dead marker or marker divergence:** precondition stop with a pointer to
  `setup express`, which also repairs the marker. Writing in place without item 5 would leave later
  runs reading the stale path.
- **Legacy `**Firmo project setup:**` marker:** not a stop, because the locator still resolves it.
  Reported, with the note that `setup express` switches the spelling.
- **External tracker connection unavailable:** the owner's behavior. No proposal, the state stays
  `null`, and the owner's report is shown in the preview. The user can still decline.
- **Forced key in hidden mode together with other changes:** the forced key is refused in the
  preview, and the other operations are offered.

## Acceptance criteria

- [ ] The updated Step 0 test in `test/workflow-contracts.test.mjs` asserts all of the following:
  - the five keyword forms are unchanged;
  - "any other non-empty argument selects **Targeted**";
  - the sentences "prints all five accepted forms above and stops without mutation" and "Do not
    reinterpret it as free text" are absent;
  - the lazy pointers are exactly `setup-profiles` and `setup-targeted-change`;
  - the Visibility ask's `when:` excludes Targeted.
- [ ] A new test reads `src/shared/setup-targeted-change.md`, names its invariant, and asserts
      explicit statements for each of the following:
  - the precondition stops: source step 3/4, several-match, invalid source, `legacy-slug`,
    `dead-marker`, `marker-divergence`;
  - redirects for `visibility` and `executionProfiles.fast.enabled`;
  - read-only answers write nothing and ask no confirmation;
  - an _ask_ operation, or a placeholder value, runs the owner's question and never writes the
    placeholder;
  - adding a reviewer to `mergeGate.bots` asks that reviewer's `.trigger` and `.check`;
  - Step 6 items 1, 2 and 4 are the only write path, with one explicit confirmation;
  - Targeted item 3 stops on a changed source and re-confirms on a changed touched key;
  - non-interactive runs write nothing;
  - the chat language is not rebound;
  - the Visibility ask, the `CLAUDE.md` fence and Step 7 are not posed.
- [ ] The CLAUDE.md-fence test and the shared preview-gate test assert the Targeted exception and the
      Targeted branch. The "only setup loads these" loop admits exactly `tools/setup.md` and
      `shared/setup-targeted-change.md`.
- [ ] `src/shared/chat-language.md`, `src/shared/config-migration.md`,
      `src/shared/setup-execution-profiles.md` and `src/tools/merge-gate.md` are unchanged
      (`git diff --stat` shows none of them).
- [ ] `CONTEXT_BUDGET_LINES.setup` equals the reported built count plus at most ten lines.
- [ ] The docs in "Affected files" list the free-text form and the two redirects.
- [ ] Completion check: all of the following exit 0, and every pre-existing Profile, Express and
      Guided test passes unchanged except the ones listed above:
  - `pnpm agent:check`
  - `pnpm test`
  - `node build.mjs`
  - `pnpm test:distribution`
  - `pnpm eval merge-gate verify`
  - `pnpm eval iterate verify`
  - `pnpm eval next-steps verify`

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in CI order.
- `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`, to
  confirm that no suite-loaded source changed.
- Manual smoke run with the built skill (`./local-link.sh`) in a scratch repository with an existing
  ADR. Expected outcomes:
  - **"set review profile to fast":** a preview with one row; after confirmation exactly that row
    changes and every other line is byte-identical.
  - **"reset language.chat":** the preview shows the row removed; the ADR has no `language.chat`
    row.
  - **"which tracker is configured?":** answered with value and source, no question asked, the ADR
    unchanged.
  - **"prReview off":** one focused question choosing between `delivery.prReview` and
    `mergeGate.*`.
  - **Hidden-mode "tracker github":** refused as forced, nothing written.
  - **Run without configuration:** stop text pointing to `setup` / `setup express`, nothing written.
  - **"enable the fast pilot":** redirect to `setup guided` → Advanced → Block 10.
  - **"add coderabbitai to mergeGate.bots and set mergeGate.bots.coderabbitai.check to
    `<exact check context>`" pasted unchanged:** Block 9 asks the reviewer's trigger and `.check`;
    the placeholder is never written.

## Assumptions and open points

- Assumption: no behavioural eval suite loads `src/tools/setup.md` or any `setup-*` fragment
  (`evals/*/suite.config.mjs`). This plan edits no eager shared fragment, so it owes no re-recorded
  eval round. The three `verify` commands in the completion check confirm this.
- Assumption: offering the shorter targeted route in the merge-gate reviewer advisory
  (`src/tools/merge-gate.md:1089`) is a separate follow-up, because it touches a merge-gate-suite
  source.
- Assumption: a Targeted run never repairs `.gitignore`, the marker or the `CLAUDE.md` import. These
  stay with the full setup, which remains idempotent.
- Assumption: a Targeted run cannot create or remove unknown (non-schema) rows. It only preserves
  them.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         3 |    2 |
| Testability     |        0 |         1 |    1 |
| Scope           |        1 |         0 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

All findings come from the 2026-10-16 review and have been incorporated into this revision.

**Critical**

- **Architecture:** the owning fragments were only reachable through Guided Steps 4–5. Fixed: the
  Targeted fragment now loads them through its own lazy pointers, their openers and asks admit
  Targeted, and the "only setup loads these" test is relaxed.
- **Scope:** making `executionProfiles.fast.enabled` changeable would have edited the eager
  `config-migration.md` and owed merge-gate and iterate eval rounds. Fixed by the user's decision:
  the key is redirected to `setup guided` → Block 10, and no eager or suite-loaded source changes.

**Important**

- **Architecture:** several core sentences contradicted Targeted: the Visibility rule and its ask,
  the unconditional `CLAUDE.md` fence, the retired-row and item-2 mode lists, and the Step 8 mode
  list. All are now listed with their Targeted exception.
- **Architecture:** the chat-language rebind was unspecified. Now stated in the fragment, with
  `chat-language.md` untouched.
- **Architecture:** the key-to-owner map was incomplete. It is now a full table per key group.
- **Error cases:** Step 6 item 3 neither re-confirmed nor fitted Targeted. A Targeted item 3 is now
  defined.
- **Error cases:** the external-tracker failure rule diverged from its owner. The owner's behavior is
  now adopted.
- **Error cases:** read-only answers ignored retired rows and repository-dependent defaults. Both
  are now handled, and `concept.dir` is added to the schema.
- **Data protection:** a legacy-slug ADR, a dead marker or a marker divergence combined with the
  skipped marker step would have stranded the change. These are now precondition stops.
- **Testability:** test breakage was missing from the plan. Each affected test is now listed with
  its new invariant.

**Note**

- **Error cases:** the partial-refusal policy was inconsistent. There is now one refusal rule.
- **Error cases:** the hidden Targeted write could run without Step 1 (hidden). The write-safety
  guard's fail-closed stop and the pointer `when:` are now stated.
- **Maintainability:** the lazy list in `build-system.md` was missing from the plan. Added.
- **Testability:** the acceptance criteria are now named assertions, and the smoke cases have
  expected outcomes.

### Revision 2026-10-16 (from the follow-up merge-gate advisory plan)

The review of `docs/plan/2026-10-16-point-merge-gate-reviewer-advisory-at-targeted-setup.md`
found two gaps here, both incorporated:

- **Important, Error cases:** a pasted placeholder value would have been written as a literal
  `.check`. Added the _ask_ operation; a placeholder value counts as no value.
- **Important, Architecture:** adding a reviewer touched only `mergeGate.bots`, so its trigger and
  `.check` could be skipped. Adding a reviewer now counts as touching both.

## Implementation notes

Implemented by `effective-flow build` on 2026-10-16, on the branch of the plan pull request.
Deviations from the plan above:

- **Router catalog hint unchanged.** The setup `catalogHint` is rendered into the built router
  `SKILL.md`, which all three behavioural eval suites seed. Changing it would have owed a
  re-recorded round of every suite, so it stays as it was. Only the tool `description` names the
  Targeted mode.
- **Core kept minimal.** After review, `src/tools/setup.md` carries only the Step 0 classification,
  the pointer and the exception clauses; Step 6 item 2's source list is unchanged, because the
  fragment owns the Targeted preview.
- **Rules added during review:** a tracker dependency rule (`external` asks the missing external
  details; `remote` asks `remoteToolOverride` only on `AMBIGUOUS_HOST`), removing a reviewer drops
  its `.trigger`/`.check` rows, `Bot conflict` is always posed, `several-match` requires manual
  cleanup, all `tracker.*` keys are refused in hidden mode, a request whose operations are all
  refused, redirected or questions writes nothing, and hidden mode keeps Targeted item 3 before the
  hidden write.
- **Legacy key wording.** The fragment names "the owner's legacy-key migration proposal" instead
  of the legacy key itself, because `test/build-lib.test.mjs` limits which files may mention it.
- **Budget.** The setup core measures 1558 lines; `CONTEXT_BUDGET_LINES.setup` is 1560.

## Test results

**Date:** 2026-10-16

| Check                         | Result                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm agent:check`            | pass                                                                                      |
| `pnpm test`                   | 2223 pass, 1 skipped, 1 fail (environmental, see below)                                   |
| `node build.mjs`              | pass; setup 1558/1560                                                                     |
| `pnpm test:distribution`      | pass                                                                                      |
| `pnpm eval merge-gate verify` | all 6 scenarios current                                                                   |
| `pnpm eval iterate verify`    | all 6 scenarios current                                                                   |
| `pnpm eval next-steps verify` | all 11 scenarios current                                                                  |
| Protected sources unchanged   | `chat-language.md`, `config-migration.md`, `setup-execution-profiles.md`, `merge-gate.md` |

The one failing test, `the shared seed commit disables inherited automatic Git maintenance before
baseline capture`, fails identically on unchanged `develop` on this machine: the global Git ignore
file is a symlink Git cannot read here. It is unrelated to this change. Mutation probes confirmed
that the new and updated setup tests fail when the guarded source statements are removed.

## Review findings

**Date:** 2026-10-16
**Reviewer:** generic product reviewer (prompt sources, reduced depth), Node.js reviewer (tests),
code validator (tooling and documentation)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    34 |
| Open / Not implemented |     0 |

Two findings were closed without a change: a set operation asking the owner's question before the
preview (kept, as the plan requires the requested value to be the owner question's proposal) and
the catalog hint (kept unchanged, see Implementation notes).

## Open points

- No open points.

# Recommend an iterate invocation that includes Effective Flow own-review threads

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #769

## Requirement

After `review` publishes Effective Flow's own findings onto a pull request, the next-step block
recommends a bare `effective-flow iterate <PR>`. That invocation does not process those findings:
`iterate` Phase 2 step 1 excludes every thread that carries `<!-- effective-flow-pr-review -->`
"unless the user names those threads explicitly" (`src/tools/iterate.md:703-708`). A user who copies
the recommendation starts a run that classifies none of the findings it was meant for. The two
contracts do not meet, because neither says how a recommended invocation names the own-review
threads.

Goal:

- Every `iterate` recommendation in `src/shared/next-steps.md` that can follow a published Effective
  Flow review names the own-review threads in one stable form.
- `src/tools/iterate.md` accepts exactly that form as the user's explicit selection of those threads.
  A bare invocation keeps excluding them.
- A contract test protects the agreement between the recommended string and the accepted phrase.
- The behavioural-eval evidence debt that the edit creates is handled as the test and release policy
  requires.

Workflow rationale: Feature (decided by score). The trigger is a recommendation that does not do
what it promises. Closing it completely changes user-facing behaviour, though:

- `iterate` gains a selection switch and a new, attacker-influenceable input surface (marked
  top-level PR comments);
- delivery and `iterate` runs gain new next-step routing;
- several internal tools return a new outcome field.

`fix` declares `no-review-capability` (`src/shared/pr-review-integration.md:53-57`). `build`'s
review depth fits a change that adds an input surface. The changed files are shipped product source
(`src/**/*.md`), which `AGENTS.md` routes through `node-backend-cli`. They also include contract
tests, user-guide mirrors and the `next-steps` eval evaluator.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #769
**Original outcome:** Every `next-steps` row that can follow a published Effective Flow review
recommends an `iterate` invocation that includes the own-review threads. `iterate.md` names that form
as an explicit selection and leaves the bare-invocation exclusion unchanged. A contract test pins the
agreement between the two. The resulting behavioural-eval evidence debt is handled per
`docs/adr/pragmatic-test-release-policy.md`.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: one fixed selection phrase shared by the `next-steps` table
and `iterate` Phase 0 and Phase 2, with a contract test and doc mirrors
**Continuation decision:** none

## Architecture decisions

- **One phrase, owned by `iterate.md`.** The selection phrase is `own-review findings`, as the issue
  proposes. `src/tools/iterate.md` owns its meaning. `src/shared/next-steps.md` only emits it in table
  cells. `src/shared/pr-review-comments.md:303-305` already says that `iterate` skips own-review
  threads "unless the user names it explicitly". That statement stays true, so it gets no second copy
  of the phrase (AGENTS.md, "Writing prompt text", point 2).
- **The phrase is a selection switch, not an instruction item.** Today `iterate` Phase 0 step 1
  (`src/tools/iterate.md:266-268`) treats everything after the PR reference as free text, and the free
  text enters classification as instruction items. If the phrase stayed free text, the run would
  classify "own-review findings" as an extra instruction. Phase 0 therefore consumes the exact phrase
  as a switch and removes it from the free text.
- **The phrase must be the entire free text.** The switch applies only when the remaining free text,
  trimmed, is exactly `own-review findings`. Other natural-language naming of the own-review threads
  is judged as today, under the existing "unless the user names those threads explicitly" rule. A
  longer text that merely contains the phrase is ordinary free text. This keeps recognition
  deterministic without a new parser grammar.
- **The switch widens and never narrows.** With the switch, threads that carry the
  `effective-flow-pr-review` marker enter classification next to every other remaining thread. A
  `resolved` thread and a thread with an `<!-- effective-flow-iterate -->` reply stay excluded,
  because `iterate` already handled them.
- **Only a direct invocation recognizes the switch.** Phase 0 step 5 splits the message at the body
  delimiter before anything else is parsed, and reads every switch only from above it
  (`src/tools/iterate.md:276-303`). The switch is therefore recognized only after that split, and only
  in an invocation that carries neither a body delimiter nor any control line. A delegated run
  (`merge-gate`, or any caller that sends control lines or a delimiter) never recognizes it. There its
  text is handled exactly as today, so an item text that reads `own-review findings` is never dropped,
  and the "one returned item for every supplied stable ID" rule holds
  (`src/tools/iterate.md:745-747`). Delegated runs keep naming threads through
  `Item filter: threads=<id>`. The rule has a second, safety-relevant effect. A run without a
  `Run state:` line and without a delimiter is gated, so the Phase 2.5 approval always runs before
  anything from a marked top-level comment is implemented, including a comment that fakes the
  marker (`src/tools/iterate.md:497-499`, `:540-541`, `:781-783`). That approval is the safety bound
  for the new surface. The rule must not be narrowed to "no delimiter, no `Item filter:`", which
  would let `Run state: non-interactive` runs implement these items without approval. An invocation
  that carries `Run state:` therefore never sets the switch.
- **Own-review surfaces beyond inline threads.** The own review publishes on three surfaces, each
  carrying the marker (`src/shared/pr-review-comments.md:268-269`):
  - the inline review threads;
  - marked top-level pull-request comments, one per publishing run, which hold outside-diff findings
    and acceptance-lens findings without a code location, the usual form of an `incomplete`
    criterion (`src/shared/pr-review-integration.md:192-208`). Each finding ends in its own
    `Signature` line;
  - the review body with the acceptance summary.

  Standalone `iterate` classifies threads, review bodies and free text, but never top-level
  pull-request comments (`src/tools/iterate.md:560-586`, `:728-740`). The switch also brings the
  marked top-level comments into classification (decided by score). The rule has four parts:
  - every top-level comment whose leading line is the marker enters, except findings already
    handled (decided by score). A finding counts as handled only when an earlier
    `effective-flow-iterate` summary comment names its `Signature` key, the existing idempotency key
    (`src/shared/pr-review-integration.md:205-210`), and that summary is authored by this run's
    authenticated login (`src/shared/pr-review-comments.md:280-287`). A switched run's summary lists
    the Signatures it handled. A timestamp cutoff is not used, because bare runs also post summaries
    and would silently drop findings that no run handled;
  - each published finding is one free-text item, split at its `Signature` line, so each finding
    gets its own outcome;
  - provenance is the author login and the comment URL only, never "own review". The marker only
    selects the item and gives it no authority, the same as for review bodies
    (`src/tools/iterate.md:734-740`, `src/shared/pr-review-comments.md:271-277`);
  - such an item gets no reply and is not resolved.

  Review bodies are handled as today: this plan neither adds nor removes an exclusion for them.
  Phase 2 step 1 excludes marked threads only (`src/tools/iterate.md:703-708`). A marked own review
  body therefore already reaches classification as free text in a bare run, and that behaviour stays
  unchanged.

- **Hidden mode needs no special case.** Hidden mode publishes no marked review
  (`src/shared/pr-thread-ledger.md:30-31`, `src/shared/pr-review-integration.md:61`). The switch then
  has nothing to add, and the run behaves like a bare invocation.
- **Existing `iterate` cells: unconditional phrase** (decided by score, see "Decided by score").
  The four existing `iterate` cells that can follow an own publication carry the phrase
  unconditionally. When no own-review thread exists, the phrase adds nothing:
  - `review` › pull-request mode, at least one published `incomplete` criterion (Then cell);
  - `review` › pull-request mode (Or cell);
  - `merge-gate` › blocked by review notes (Then cell);
  - `merge-gate` › ended without merge: the user kept the draft (Or cell).

  The cell `merge-gate` › blocked by failing checks (`{{SKILL:iterate}} <PR> fix the failing checks`)
  concerns checks, not own-review threads, and stays unchanged.

- **Delivery rows: new publication-conditioned rows** (decided by score). Delivery runs can publish
  own findings through the automatic "PR review publication"
  (`src/shared/worktree-integration.md:487-496`, `src/tools/apply-issues.md:410-420`,
  `src/tools/apply-review-remote.md:190-199`). Their "PR opened" rows recommend `merge-gate` first
  (`src/shared/next-steps.md:224-260`). That is a problem when the findings were published from the
  gate's own account, because the gate then excludes them by authorship and can merge past them
  (`docs/user-guide/tools-deliver.md:1311-1318`). Every delivery tool whose "PR opened" outcome can
  follow that publication therefore gets one more specific row, directly above its generic row:
  - Condition: the generic condition plus `, own review findings published`. For example,
    `build` › `PR opened, own review findings published`, and for `apply`:
    `findings applied, PR opened, own review findings published` and
    `issues processed, PR opened, own review findings published`.
  - Then: `{{SKILL:iterate}} <PR> own-review findings`.
  - Or: `{{SKILL:merge-gate}} <PR>`.

  The condition holds only when the run's PR review publication reported at least one published
  finding. That holds whether the emitting run published the findings itself or a delegated child
  did: `apply` delegates to `apply-issues` and `apply-review-remote` with `Next steps: suppressed`
  (`src/tools/apply.md:149-156`), and those children publish per PR
  (`src/tools/apply-issues.md:410-416`, `src/tools/apply-review-remote.md:190-196`). The number of
  published findings per PR therefore becomes part of the observed outcome that every returning
  delegation hands back. An unreported or unknown result selects the generic row, and so do
  `delivery.prReview` off, a declined ask, hidden mode and zero published findings. In a run with
  several PRs, the specific row names the first PR that has published findings and states that the
  others with findings follow the same way, per the several-targets rule
  (`src/shared/next-steps.md:45-47`). Its `merge-gate` option names the same PR.
  Specific-before-generic is the existing table convention (the `review` rows,
  `test/workflow-contracts.test.mjs:28934`).

  The tool set comes from the include closure of `src/shared/pr-review-integration.md`, not from
  memory. The verified candidates are `apply` (both "PR opened" rows), `build`, `fix`, `refactor`,
  `docs` and `maintain`. `iterate` › `PR mode` gets the same row too (decided by score). Its Phase 5
  step 4 hands `no-review-capability` to the delivery handback, so the automatic PR review runs
  (`src/tools/iterate.md:1040-1042`). The resulting fix-and-review cycle is accepted, because each
  step needs a new user invocation and `merge-gate <PR>` stays the second option. `deliver` and `pr`
  get a row only if that closure shows that their run executes the publication. The implementer records the derived set in the pull request body.

  The trade-off the score accepted: the generic row's Or option (`apply <findings report>`,
  `apply <offloaded report>`, `review <PR>`) is not offered on the specific row. Each row keeps at
  most two `{{SKILL:…}}` references (`build-lib.mjs`).

- **One rule for every selection path** (decided by score). Plan-aware selection
  (`src/shared/next-steps.md:94-121`) can produce an `iterate` option without reading the fallback
  table, which is read "only after the selection above" (`:186-190`). `next-steps.md` therefore gains
  one rule outside the table. When the observed outcome includes published own-review findings on an
  open PR, every `{{SKILL:iterate}} <PR>` option carries `own-review findings`, whichever selection
  produced it, and those findings count as unfinished review in plan-aware step 3. Paths such as
  `apply <plan>` → `apply-plan` → `build`/`fix` are then covered too. The table cells stay the
  fallback form of the same rule.
- **`review.md` names the row, not the string.** `src/tools/review.md:413-415` repeats the literal
  `{{SKILL:iterate}} <PR>` in prose. That sentence is reworded: a published `incomplete` criterion
  "leads to the invocation of the `next-steps` incomplete-criterion row, in plan-aware selection as
  in the fallback". The lead stays part of the shared selection and does not become fallback-only.
  The table stays the only owner of the recommended string.

## Affected files

| File                                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/iterate-own-review-surfaces.md` (new)                                                                       | Lazy fragment holding the top-level comment rules of the switch: leading-line marker selection, handled state, one item per finding, provenance, no reply and no resolve, and the failed-read report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/tools/iterate.md`                                                                                                  | Phase 0, after the step 5 body-delimiter split, recognizes the exact phrase `own-review findings` as the own-review selection switch, but only in a direct invocation without a body delimiter or any control line (`Run state:` included), and removes it from the free text. Phase 2 step 1 states that the switch is the explicit naming of the marked threads, and that a bare invocation keeps excluding them. Phase 2 step 1 lazy-includes `src/shared/iterate-own-review-surfaces.md` when the switch is set. `contextBudget` is updated from the build report.                                                                                                                                                                                     |
| `src/shared/next-steps.md`                                                                                              | One rule outside the table makes every `iterate <PR>` option carry the phrase after published own findings, whichever selection produced it. `iterate` › `PR mode` also gets a specific row. The four existing `iterate` cells read `{{SKILL:iterate}} <PR> own-review findings`. Each delivery tool whose "PR opened" outcome can follow the automatic PR review publication gets a specific `…, own review findings published` row above its generic row. The table-selection prose (lines 186-190) gains one mandatory sentence: a row whose condition extends another row's condition for the same tool wins over it, and the publication condition holds only after at least one reported published finding. The table is realigned by `pnpm format`. |
| `src/tools/apply-issues.md`, `src/tools/apply-review-remote.md`, `src/tools/apply-review.md`, `src/tools/apply-plan.md` | Their returned outcome to `apply` states the number of findings that the PR review publication published per PR, so the emitting `apply` run can select the specific row. `contextBudget` is updated from the build report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/tools/apply.md`                                                                                                    | Keeps the per-PR published-finding count from its delegated children as observed outcome for `next-steps`. An unreported count means the generic row. `contextBudget` is updated from the build report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/tools/review.md`                                                                                                   | Step 6 of pull-request mode (lines 413-415) says that a published `incomplete` criterion leads to the invocation of the `next-steps` incomplete-criterion row, in plan-aware selection as in the fallback, instead of repeating the invocation string. `contextBudget` is updated if the line count changes.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/user-guide/tool-flow.md`                                                                                          | The mirrored `next-steps` rows (lines 224-225, 234, 236) carry `/effective-flow iterate <PR> own-review findings`, and the new delivery rows are mirrored. `findNextStepsDocViolations` enforces this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/user-guide/tools-quality.md`                                                                                      | Line 213 names the extended suggestion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/user-guide/tools-implement.md`                                                                                    | The `/effective-flow iterate` section (from line 346) gains one or two sentences: own-review threads are skipped by default, and `own-review findings` includes them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `test/workflow-contracts.test.mjs`                                                                                      | The test at line 28934 is updated for the new cell values. A new test pins the agreement between `next-steps.md` and `iterate.md`. Any merge-gate row assertion near lines 5440-5470 that pins a changed cell is updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `evals/next-steps/_scaffold/evaluate.mjs`                                                                               | The `ambiguous-associated-plans-fallback` expectation `second: ['iterate 42']` (line 43) becomes `['iterate 42 own-review findings']`. That scenario's snapshot is a pull-request-mode `review`, which selects the changed Or cell. `normalizedReferenceInvocation` (lines 124-146) is changed from parsing the whole argument string to normalizing only the first argument token as the PR reference, and it compares the trailing text exactly.                                                                                                                                                                                                                                                                                                         |
| `test/next-steps-eval.test.mjs`                                                                                         | One case: `iterate #42 own-review findings` matches the expectation, and `iterate #42 own review findings` does not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Implementation details

### Approach

1. **`iterate.md` Phase 0.** Add one rule after the step 5 body-delimiter split
   (`src/tools/iterate.md:276-303`). It applies only to an invocation without a body delimiter and
   without any control line. If the free text left after the PR reference (step 1, lines 266-268),
   trimmed, is exactly `own-review findings`, set the own-review switch and leave the free text empty.
   In Local mode the switch has no effect and never becomes a local instruction. Any other free text,
   and every delegated run, is unchanged.
2. **`iterate.md` Phase 2 step 1.** Extend the sentence "unless the user names those threads
   explicitly" (lines 703-708). Naming them includes the Phase 0 own-review switch, the form that
   `next-steps` recommends. With the switch, marked threads enter classification next to the other
   remaining threads. A bare invocation keeps excluding them. Keep the hidden-mode sentence unchanged.
3. **`iterate.md` own-review surfaces** (decided by score). Put the top-level rules into a new
   fragment `src/shared/iterate-own-review-surfaces.md`. Load it from Phase 2 step 1, where the
   marker is already handled, through a ` ```lazy-include ` with
   `when: the Phase 0 own-review switch is set`. The rules are then not eager text on every
   `iterate` run, including every `merge-gate` round, where the switch can never be set (AGENTS.md,
   "Writing prompt text", points 1 and 3). Check the placement against
   `docs/developer-guide/build-system.md`, "Progressive disclosure beyond the router". The fragment
   states:
   - Phase 1 also reads the pull-request comments through `pr-comments-read`. It keeps every comment
     whose body opens with the `effective-flow-pr-review` marker as its leading line, per the
     marker rule in `src/shared/pr-review-comments.md:271-277`, so a quote-reply never counts.
   - A finding is skipped as handled only when an earlier `effective-flow-iterate` summary comment,
     authored by this run's authenticated login, names its `Signature` key.
   - Phase 2 sends one free-text item per remaining finding, split at its `Signature` line, with the
     author login and comment URL as provenance. No item gets a reply, and none is resolved.
   - If the comments read fails or is unsupported, the run reports that it sees no top-level own
     findings and why, and continues with the surfaces that did read. This follows the reviews-read
     pattern at `src/tools/iterate.md:580-585`.

   Review bodies are unchanged. The test's source assertions read that fragment.

4. **`next-steps.md` table.** Change the four existing cells to
   `{{SKILL:iterate}} <PR> own-review findings`. Derive the delivery tool set from the include
   closure of `src/shared/pr-review-integration.md`. Add one
   `<generic condition>, own review findings published` row per derived "PR opened" row, directly
   above it, with Then `{{SKILL:iterate}} <PR> own-review findings` and Or `{{SKILL:merge-gate}} <PR>`.
   Add the `iterate` › `PR mode, own review findings published` row above `iterate` › `PR mode`.
   Add the rule of "One rule for every selection path" next to the several-targets rule
   (`src/shared/next-steps.md:45-47`), so it binds plan-aware selection and the table alike, and let
   plan-aware step 3 count published own findings as unfinished review.
   Add one mandatory sentence to the table-selection prose (`src/shared/next-steps.md:186-190`):
   "A row whose condition extends another row's condition for the same tool precedes and wins over
   it; `own review findings published` holds only when this run's PR review publication, its own or
   a delegated child's, reported at least one published finding." The sentence is limited to such
   extension pairs. A general first-match rule would change selection for unrelated rows (for
   example `setup`, `issue-buddy`). Today the specific-before-generic order exists only in a test
   (`test/workflow-contracts.test.mjs:28948`). The build guard `NEXT_STEPS_EDGE_RE`
   (`build-lib.mjs:3975`) already allows trailing text after the placeholder, and each row keeps at
   most two `{{SKILL:…}}` references. Run `pnpm format`. The longer cell realigns the whole table,
   which is expected.
5. **`iterate` summary Signatures.** In `src/shared/iterate-own-review-surfaces.md`, state that a
   switched run's `effective-flow-iterate` summary comment lists the `Signature` keys of the
   top-level findings it handled. Only summaries authored by the run's authenticated login count as
   handled-state evidence.
6. **Delegated publication count.** In `src/tools/apply-issues.md`,
   `src/tools/apply-review-remote.md`, `src/tools/apply-review.md` (local mode, which delegates to
   `fix`, `refactor`, `build` or `docs`: `src/tools/apply-review.md:462-465`) and
   `src/tools/apply-plan.md` (`:102-105`), add the per-PR published-finding count to the returned
   outcome. For the two routes that delegate to an implementing workflow, that workflow's delivery
   completion supplies the count (`src/shared/worktree-integration.md:487-496`).
   In `src/tools/apply.md`, keep that count as observed outcome for the next-step selection. A child
   that returns no count leaves the generic row in force.
7. **`review.md` step 6.** Replace the literal `{{SKILL:iterate}} <PR>` in lines 413-415 with
   "leads to the invocation of the `next-steps` incomplete-criterion row, in plan-aware selection as
   in the fallback". The contract test asserts that wording.
8. **User-guide mirrors.** Update `docs/user-guide/tool-flow.md` so it matches the table exactly, as
   `findNextStepsDocViolations` requires. Update `tools-quality.md:213`. Add the short explanation to
   `tools-implement.md`.
9. **Contract tests.** In `test/workflow-contracts.test.mjs`:
   - Update the assertions of the test at line 28934 (`edges[incomplete].then`,
     `edges[generic].or`) to the extended cell.
   - Add one test next to it. Its name and leading comment name the invariant: "the `iterate`
     invocation next-steps recommends after an own published review is the exact selection phrase
     iterate accepts". The test uses one constant `OWN_REVIEW_SELECTION = 'own-review findings'` and
     parses the live table with `parseNextStepsTable(source(NEXT_STEPS_PATH), …)`. It asserts the rule,
     not a list. First, every `{{SKILL:iterate}}` cell in the table is either
     `{{SKILL:iterate}} <PR> own-review findings` or the allowlisted
     `{{SKILL:iterate}} <PR> fix the failing checks`, so a future bare cell fails. Second, every row
     whose condition ends in `, own review findings published` has that extended Then cell and
     directly precedes a row of the same tool whose condition is the generic prefix. Third, the set
     of `tool | condition` pairs that have a specific row equals a pinned list (`deepEqual`, like
     `test/workflow-contracts.test.mjs:5442-5456`), so a missing tool fails. Fourth, the
     table-selection sentence of step 4 and the "every selection path" rule are present in
     `next-steps.md`, and the pinned set includes `iterate` › `PR mode`. The test also asserts these
     sentences in `source('src/tools/iterate.md')`:
     - the backticked phrase in its Phase 0 and Phase 2 sections;
     - the sentence that delegated runs, and any invocation carrying `Run state:`, never recognize
       the switch, which keeps it gated;
     - the bare-invocation exclusion sentence of Phase 2 step 1;
     - in `src/shared/iterate-own-review-surfaces.md`: the `pr-comments-read` admission of marked
       top-level comments, the split into one item per finding, the no-reply, no-resolve sentence,
       and the handled-state rule with its author restriction.

     It also asserts the reworded `review.md` step 6 sentence.

   - The failing-checks cell keeps its existing assertion at line 5457.
10. **Eval evaluator.** Update the `ambiguous-associated-plans-fallback` expectation in
    `evals/next-steps/_scaffold/evaluate.mjs:43`. Today `normalizedReferenceInvocation`
    (lines 124-146) parses the whole argument string as one PR reference. With trailing text that
    parse fails, so `iterate #42 own-review findings` would no longer count as equal to
    `iterate 42 own-review findings`. Change it to normalize only the first argument token as the PR
    reference and to require the remaining tokens to equal the expected trailing text exactly. Add a
    case to `test/next-steps-eval.test.mjs`: `iterate #42 own-review findings` passes, and
    `iterate #42 own review findings` fails. Check that the existing `correctReport` cases still
    pass.
11. **Budget.** Run `node build.mjs` and set the `contextBudget:` of `src/tools/iterate.md`,
    `src/tools/apply.md`, `src/tools/apply-issues.md`, `src/tools/apply-review-remote.md`,
    `src/tools/apply-review.md` and `src/tools/apply-plan.md` (and of `src/tools/review.md` if its
    line count changed) from the `Always-loaded core (lines/budget)` report, with at most ten lines
    of headroom.
12. **Evidence debt** (decided by score: accept the reported debt, no new model runs). Run
    `pnpm eval <suite> verify` (read-only) for all five suites (`merge-gate`, `iterate`,
    `next-steps`, `build-context`, `focus`). `build-context` seeds every `src/tools/*` file
    (`evals/build-context/suite.config.mjs:20-26`). Name every reported stale suite in the pull
    request body. CI's `Behavioural eval evidence` step reports them the same way.

### Component structure

Not relevant: no runtime script or component changes.

### State management

Not relevant: the switch lives for one `iterate` run only and persists nothing.

### API integration

Not relevant: no forge API call or marker format changes. The `effective-flow-pr-review` marker and its
stamping (`src/shared/pr-review-thread-writes.md:42`) stay as they are.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **No own-review thread on the pull request** (for example zero published findings, or hidden mode):
  the switch adds nothing, and the run behaves like a bare invocation.
- **The phrase combined with other free text** (`iterate 42 own-review findings and fix the typo`): not
  the switch. The whole text is ordinary free text, judged under the existing natural-language naming
  rule.
- **A changed case or different spelling** (`Own-Review findings`, `own review findings`): not the
  switch. Recognition is exact, so the contract test can pin it.
- **An own-review thread that is already `resolved` or carries an `<!-- effective-flow-iterate -->`
  reply:** stays excluded under the switch.
- **A delegated run** (any body delimiter or control line, such as `Item filter: threads=<id>`):
  never recognizes the switch. Its text, including an item text that reads exactly
  `own-review findings`, is handled as today.
- **An invocation that carries `Run state:` or another control line:** never sets the switch, so the
  gated Phase 2.5 approval stays in front of every top-level item.
- **Local mode** (`iterate own-review findings` with no PR reference and no open PR): the switch has
  no effect and never becomes a local free-text instruction.
- **Review bodies:** handled as today, with and without the switch.
- **Several marked top-level comments from several `review` runs:** every one enters, except
  findings already handled, one item per finding.
- **A second switched run after an iterate summary comment:** findings whose `Signature` the earlier
  summary lists do not enter again. Findings that no earlier run handled still enter, including all
  findings after a bare run's summary, which lists no Signatures.
- **A fake iterate summary from another account that lists real Signatures:** ignored, because only
  summaries authored by this run's authenticated login count.
- **A foreign comment that fakes the marker:** it is selected like a marked comment, but carries only
  its author login and URL as provenance. Classification treats it as data with no authority, the
  same as any review body, and the gated Phase 2.5 approval stays in front of it.
- **A bare `iterate <PR>`:** unchanged. Own-review threads stay excluded.
- **A failed or unsupported comments read with the switch set:** the run reports that it sees no
  top-level own findings and why, and continues with threads, reviews and free text.
- **A quote-reply that copies the marker into a blockquote:** not selected, because the marker is not
  its leading line.
- **A multi-PR `apply` run where only some PRs received findings:** the specific row names the first
  PR with published findings and says the others with findings follow. Its `merge-gate` option names
  the same PR.
- **A delegated child that published but did not report the count:** the generic row applies.
- **A delivery run that published nothing** (`delivery.prReview` off, a declined ask, hidden mode, or
  zero published findings): the generic "PR opened" row applies unchanged, and `merge-gate` stays
  first.
- **A delivery run that published own findings:** the specific row recommends
  `iterate <PR> own-review findings` first and `merge-gate <PR>` second. The generic row's Or option
  (`apply <findings report>`, `apply <offloaded report>`, `review <PR>`) is not offered for that run.
- **An own review published from a different account than the one `merge-gate` runs as**
  (`docs/user-guide/tools-deliver.md:1311-1318`): it blocks `merge-gate` as foreign review notes.
  The extended `merge-gate` recommendation then includes those threads.

## Acceptance criteria

- [ ] The four existing `iterate` cells of `src/shared/next-steps.md` read exactly
      `{{SKILL:iterate}} <PR> own-review findings`, and the failing-checks cell is unchanged. Every
      delivery "PR opened" row whose run can execute the automatic PR review publication (the derived
      set, named in the pull request body) has a directly preceding `…, own review findings published`
      row with Then `{{SKILL:iterate}} <PR> own-review findings` and Or `{{SKILL:merge-gate}} <PR>`.
      `iterate` › `PR mode` has the same specific row. A rule outside the table makes every
      `{{SKILL:iterate}} <PR>` option carry `own-review findings` after published own findings, in
      plan-aware selection as in the fallback. The pinned-set assertion holds that list. The
      table-selection sentence states that an extending row wins over its generic row and when the
      condition holds. An unknown publication result selects the generic row.
- [ ] `src/tools/iterate.md` Phase 0 recognizes the exact phrase `own-review findings` as the
      own-review switch, only in a direct invocation without a body delimiter or control line, and
      removes it from the free text. Phase 2 step 1 names the switch as the explicit selection of marked
      threads and still states that a bare invocation excludes them. With the switch set, every marked
      top-level PR comment enters classification, except findings whose `Signature` an earlier iterate
      summary authored by this run's authenticated login lists. The switched run's summary lists the
      Signatures it handled. Each finding is one free-text item with author login and URL as provenance,
      with no reply and no resolve. An invocation that carries `Run state:` never sets the switch.
      Only a comment whose leading line is the marker counts. A failed comments read is reported.
- [ ] The new test in `test/workflow-contracts.test.mjs` names its invariant, fails when either side's
      phrase changes alone, and passes on the changed tree.
- [ ] `docs/user-guide/tool-flow.md` mirrors the changed rows (the `findNextStepsDocViolations`
      assertion passes), and `tools-quality.md` and `tools-implement.md` describe the extended
      invocation.
- [ ] `evals/next-steps/_scaffold/evaluate.mjs` expects the extended second option for
      `ambiguous-associated-plans-fallback`.
- [ ] No new model runs are recorded. The pull request body names every suite, out of all five,
      that `pnpm eval <suite> verify` reports as stale.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

- `pnpm agent:check` after `pnpm format`, so the realigned table is accepted.
- `node --test test/workflow-contracts.test.mjs` with a name pattern for the changed and new
  next-steps tests. Then the full `pnpm test`.
- A mutation check by hand: change the phrase on one side only and confirm the new test fails. Then
  revert.
- `node build.mjs`. Read the `Always-loaded core (lines/budget)` report for every tool whose source
  changed (`iterate`, `review`, `apply`, `apply-issues`, `apply-review`, `apply-review-remote`,
  `apply-plan`).
- `pnpm test:distribution`.
- `pnpm eval <suite> verify` for all five suites (read-only). Expect stale-evidence debt, not an
  integrity failure.

## Assumptions and open points

- Assumption: the phrase `own-review findings` from the issue is acceptable as the stable form. The
  issue proposes it ("for example"), no other form exists in `src/`, and the existing
  `iterate <PR> fix the failing checks` cell shows that trailing free text after `<PR>` is an
  established pattern.
- Assumption: the rows that follow the automatic "PR review publication" after a delivery
  (`apply`, `build`, `fix`, `refactor`, `maintain`, `docs`, `deliver`, `pr` › PR opened) recommend
  `merge-gate` first, and their Or option is `apply` or `review`, never `iterate`
  (`src/shared/next-steps.md:224-260`). This plan adds a specific, publication-conditioned row above
  each one that can follow the publication (see "Decided by score").
- Assumption: this change adds no new `iterate` eval scenario. The contract test pins switch
  recognition. An `iterate` scenario pair is recorded as a follow-up issue, named in the pull
  request body: the switch in a direct run, and the same text below a body delimiter, which is not a
  switch.
- Assumption: editing `src/shared/next-steps.md` stales the `next-steps`, `merge-gate` and
  `iterate` suites (`evals/next-steps/README.md:154-157`). Editing `src/tools/iterate.md` stales
  `iterate` and `merge-gate`, and every `src/tools/*` edit stales `build-context`. Editing the
  evaluator changes the `next-steps` instrument. Step 12 verifies all five suites. CI reports
  stale evidence as debt and does not fail on it
  (`docs/adr/pragmatic-test-release-policy.md:55-70`).
- Out of scope: a merge-gate guard change for own findings from the gate's own account, which are
  excluded by authorship and can be merged past (`docs/user-guide/tools-deliver.md:1311-1318`).
  This plan only fixes the recommended `iterate` invocation. The new delivery rows put `iterate`
  first for exactly that case.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Which next-steps rows carry the own-review phrase own-review findings?",
    "options": [
      "Existing iterate cells only",
      "Add delivery PR-opened iterate rows",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Existing iterate cells only",
        "score": 6,
        "reason": "Fixes the stated mismatch in the four existing iterate cells and leaves delivery routing alone, but misses the issue acceptance that names delivery completion and apply-issues PR review publication."
      },
      {
        "label": "Add delivery PR-opened iterate rows",
        "score": 7,
        "reason": "Meets the full issue acceptance, delivery completion included, but adds conditioned rows for every delivery tool and changes merge-gate-first routing on each delivery run, which costs table size and new run state."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Is the own-review phrase added unconditionally to the in-scope iterate cells, or only after a verified own publication?",
    "options": [
      "Unconditional phrase",
      "Publication-conditioned rows",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Unconditional phrase",
        "score": 8,
        "reason": "Keeps one row per tool and condition, needs no new run state or mirrored rows in tool-flow.md, and is harmless when no own-review thread exists because iterate then behaves like a bare invocation."
      },
      {
        "label": "Publication-conditioned rows",
        "score": 4,
        "reason": "More precise for hidden mode and zero-finding reviews, but it doubles the in-scope rows, needs verified publication state, and adds rows that tool-flow.md must mirror, all for little behavioural gain."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How is the behavioural-eval evidence debt from this change handled?",
    "options": [
      "Accept reported debt",
      "Record live evidence now",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Accept reported debt",
        "score": 8,
        "reason": "Matches the issue acceptance wording that the debt is recorded, and the policy default of zero new model runs for freshness, while CI keeps the stale next-steps suite visible as debt."
      },
      {
        "label": "Record live evidence now",
        "score": 5,
        "reason": "Viable because the changed recommendation is model-mediated and the policy allows targeted five-run evidence, but it adds manual runs the issue does not ask for and delays this routine change."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Does the own-review switch also bring the marked top-level PR comments into iterate classification?",
    "options": [
      "Include marked top-level comments",
      "Inline threads only with follow-up",
      "Inline only, incomplete row stays bare",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Include marked top-level comments",
        "score": 9,
        "reason": "It is the only option that meets the issue acceptance criterion for the leading incomplete-criterion row, since those findings live only in marked top-level comments; the other options leave that row unable to classify any finding."
      },
      {
        "label": "Inline threads only with follow-up",
        "score": 4,
        "reason": "The scope is smaller and the gap is documented, but the leading review row with a published incomplete criterion still recommends an iterate that misses its findings, so acceptance for issue 769 is not met."
      },
      {
        "label": "Inline only, incomplete row stays bare",
        "score": 3,
        "reason": "It is honest about the gap, but the issue names this row as the leading case, so leaving it bare defers the core requirement and makes the row tables inconsistent until the follow-up lands."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does a switched iterate run tell which marked top-level own-review findings an earlier run already handled?",
    "options": [
      "Signature list, own login only",
      "Own-login switched-summary cutoff",
      "No handled state",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Signature list, own login only",
        "score": 9,
        "reason": "Uses the existing Signature key to mark exactly which findings an earlier own-login switched run handled, so nothing unhandled is dropped and no repeats come back, which beats the noise of option 3 and the coarse cutoff of option 2."
      },
      {
        "label": "Own-login switched-summary cutoff",
        "score": 4,
        "reason": "The author check blocks forged summaries, but a timestamp cutoff still treats as handled every finding posted before the summary, including skipped ones or findings that arrive mid-run, and it adds a new fixed marker line."
      },
      {
        "label": "No handled state",
        "score": 6,
        "reason": "Simple and fail-safe, since nothing is silently dropped and the gated Phase 2.5 approval limits harm, but every switched run re-presents already handled findings and leaves the edge case and acceptance criterion 2 unmet."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Does the iterate PR-mode outcome get a publication-conditioned row?",
    "options": [
      "Add iterate PR-mode row",
      "Exclude iterate with reason",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Add iterate PR-mode row",
        "score": 8,
        "reason": "Meets the issue acceptance for every row that can follow a published review, closes the same merge-gate authorship gap on a live path, and each cycle step needs a new user invocation so it stays bounded."
      },
      {
        "label": "Exclude iterate with reason",
        "score": 4,
        "reason": "Avoids recommending a repeat cycle, but leaves iterate PR mode recommending merge-gate first after own findings were published, which keeps the authorship gap and fails the issue acceptance."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How is plan-aware next-step selection covered?",
    "options": [
      "Rule outside the table",
      "Accept fallback-only coverage",
      "Defer to follow-up issue",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Rule outside the table",
        "score": 9,
        "reason": "One sentence placed outside the table reaches every selection path, including plan-aware steps 1-4 that skip the fallback table, so it meets the issue acceptance where fallback-only coverage leaves the bare iterate symptom."
      },
      {
        "label": "Accept fallback-only coverage",
        "score": 3,
        "reason": "Naming the limitation is honest, but the common apply-plan to build or fix delivery paths would still produce a bare iterate recommendation, which is the very symptom the issue describes."
      },
      {
        "label": "Defer to follow-up issue",
        "score": 2,
        "reason": "Deferring leaves the main delivery paths broken and the acceptance criterion unmet, and it adds a new issue for a fix that costs only one sentence and one test."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Which recommended workflow and packaging does the plan use?",
    "options": [
      "One Feature package",
      "Two ordered packages",
      "Keep Bugfix",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "One Feature package",
        "score": 8,
        "reason": "The grown scope adds a new input surface an attacker can influence, delivery routing and cross-tool outcome plumbing, which is changed user behavior, and build review depth then also covers the safety-relevant Phase 0 switch."
      },
      {
        "label": "Two ordered packages",
        "score": 7,
        "reason": "Sequences the scored scope into smaller reviewable steps, but package 1 still ships the approval-bound Phase 0 switch under fix review depth, and the incomplete-criterion row stays short of its findings until package 2 lands."
      },
      {
        "label": "Keep Bugfix",
        "score": 2,
        "reason": "The bugfix rationale no longer holds for new surfaces, routing and plumbing, and fix declares no-review-capability with only generic review for degraded buckets, which is too shallow for a new attacker-influenceable input."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         5 |    1 |
| Security        |        0 |         1 |    3 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         5 |    0 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         3 |    0 |
| Maintainability |        0 |         0 |    5 |

### Findings

Internal review, 2026-11-26, followed by a scoped re-check of the sections that the scored decisions
changed:

- Error cases, Important: marked top-level comments had no handled state, so every rerun would
  process them again. A first cutoff rule was incorporated. The scoped re-check showed that a
  timestamp cutoff can drop findings that were never handled. Decided by score in the deep review:
  a Signature list, counted only from summaries by the run's own login.
- Architecture, Important: one item per comment lost per-finding outcomes, and the wording assumed a
  single marked comment. Incorporated: every marked comment counts, with one item per finding, split
  at `Signature`.
- Architecture, Important: the plan claimed that the own review body "stays excluded", but no such
  exclusion exists (`src/tools/iterate.md:703-708`). Incorporated: review bodies are handled as
  today.
- Security, Note: a marker does not prove authorship. Incorporated: provenance is author login and
  URL only, and the marker gives no authority.
- Maintainability, Note: the evaluator row described the future behaviour in the present tense, and
  several `iterate.md` line references were off. Both incorporated.
- Testability, Note: the parse boundary had no behavioural follow-up. Incorporated: an `iterate`
  scenario pair is recorded as a follow-up issue.
- Architecture, Important: no rule made a specific row win over its generic row. Incorporated: a
  mandatory table-selection sentence in `next-steps.md`, pinned by the test.
- Architecture, Important: the publication condition was undefined for multi-PR runs and for
  publication by a delegated child. Incorporated: the per-PR count is part of the returned outcome,
  an unknown count selects the generic row, and the first PR with findings is named.
- Scope, Important: `iterate` PR mode can trigger the automatic PR review, yet it had no specific
  row. Decided by score in the deep review: `iterate` › `PR mode` gets the specific row.
- Testability, Important: nothing guaranteed that the delivery rows are complete. Incorporated: a
  pinned `deepEqual` set.
- Error cases, Important: a failed comments read under the switch was unhandled. Incorporated: the
  failure is reported and the run continues on the other surfaces.
- Scope, Important: the evidence step skipped `build-context` and `focus`. Incorporated: all five
  suites are verified.
- Security, Note: top-level selection must require the marker as the leading line. Incorporated.
- Testability, Note: the contract test did not cover the top-level comment rule. Incorporated.
- Maintainability, Note: three edge-case bullets were malformed. Incorporated.

Deep plan review, 2026-11-26 (`plan-review`, file mode, scored decisions):

- Architecture, Important: the phrase and the new rows lived only in the fallback table, so
  plan-aware selection could still emit a bare `iterate <PR>`. Decided by score: one rule outside
  the table covers every selection path.
- Error cases, Important: the published-count plumbing missed the `apply-review` local route and
  `apply-plan`. Incorporated: both return the count.
- Error cases, Important: acceptance criterion 2 encoded the rejected timestamp cutoff.
  Incorporated: it now states the Signature rule.
- Security, Important: the handled-state options trusted any marked summary, so a fake summary could
  suppress real findings. Incorporated: only summaries authored by the run's authenticated login
  count. "No handled state" was added as an option.
- Scope, Important: the grown scope no longer fit "Bugfix". Decided by score: one Feature package
  (`effective-flow build`).
- Security, Note: the gated property of a direct invocation was unstated. Incorporated: an
  invocation with `Run state:` never sets the switch, so the Phase 2.5 approval bounds the new
  surface. The test pins this.
- Maintainability, Note: the `review.md` rewording could make the incomplete-criterion lead
  fallback-only. Incorporated: the lead holds in plan-aware selection as in the fallback.
- Architecture, Note: the `iterate` PR-mode option lacked a loop consideration, and its alternative
  lacked a reason. Incorporated before scoring.
- Maintainability, Note: a general first-match sentence would affect unrelated rows, and the
  top-level rules would be eager on every `iterate` run. Incorporated: the sentence is limited to
  extension pairs, and the rules move to a lazy fragment.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-26
**Workflow:** `effective-flow build`, unattended (autopilot run `ap-20261126T145047Z-17c3aa32`)

### Requirement

Recommend an `iterate` invocation that also processes Effective Flow's own published review
findings, and make `iterate` able to select them: the phrase `own-review findings` after the pull
request reference is the explicit switch.

### Architecture decisions

- The switch is recognized in `iterate` Phase 0 step 13 only for a direct invocation without a body
  delimiter or any control line, so delegated or forged text never sets it and the Phase 2.5
  approval precedes every item it admits. Local mode and hidden mode add nothing.
- The top-level comment rules live in the new lazy fragment
  `src/shared/iterate-own-review-surfaces.md`, loaded at the decision point before Phase 1.
- Handled state is a fixed `Handled own-review Signatures:` block in a summary authored by the
  run's own authenticated login. It lists a normalized `signature-parse` value only when every item
  sharing it reached a terminal outcome. Each line is parsed alone; raw text is never republished.
- `src/shared/next-steps.md` carries one rule outside the table. The four `iterate` cells read
  `{{SKILL:iterate}} <PR> own-review findings`, and an extending row wins over its generic row.
- New `…, own review findings published` rows exist for `apply` (both "PR opened" rows), `build`,
  `fix`, `refactor`, `docs`, `maintain` and `iterate` › PR mode. `deliver` and `pr` never run the
  automatic PR review publication and get no row.
- `src/shared/worktree-integration.md` is the single owner of the retained per-PR published-finding
  count. `apply-issues` and `apply-review-remote` report their own publications, and an unknown
  count selects the generic row.

### Affected files

`src/shared/iterate-own-review-surfaces.md` (new), `src/tools/iterate.md`,
`src/shared/next-steps.md`, `src/shared/worktree-integration.md`, `src/tools/apply.md`,
`src/tools/apply-issues.md`, `src/tools/apply-plan.md`, `src/tools/apply-review.md`,
`src/tools/apply-review-remote.md`, `src/tools/review.md`, `evals/next-steps/_scaffold/evaluate.mjs`,
`test/workflow-contracts.test.mjs`, `test/next-steps-eval.test.mjs`, `docs/user-guide/tool-flow.md`,
`docs/user-guide/tools-implement.md`, `docs/user-guide/tools-quality.md`.

### Implementation details

- `contextBudget`: `iterate` 1925, `apply-review` 1072, `apply-plan` 568, `apply` 560,
  `apply-review-remote` 391; `apply-issues` and `review` unchanged.
- The next-steps evaluator normalizes only the first argument token as the PR reference and compares
  the trailing text exactly.
- Documentation sync: `tool-flow.md` mirrors the changed and new rows, `tools-quality.md` and
  `tools-implement.md` describe the extended invocation. No impact on `README.md`, `AGENTS.md` and
  `docs/developer-guide/build-system.md` (it lists no individual lazy fragments).

### Test results

- Full suite (Phase 5, before the review corrections): `pnpm agent:check`, `node build.mjs` and
  `pnpm test:distribution` passed. `pnpm test` had 8 failures, none in a changed path. Four also fail
  on the base (pre-existing: three host-driver Python cases and the merge-gate eval round lifecycle
  test). The other four passed on the base and on the candidate when run alone; they are timing
  tests that failed under host load.
- Later changes were verified targeted: the 24 test files that read the changed sources,
  `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution`. All passed except one
  `merge-gate-eval-round` timeout under host load, which passed again when run alone.
- `pnpm eval <suite> verify` for `merge-gate`, `iterate`, `next-steps`, `build-context` and `focus`:
  evidence debt only (stale or absent), no integrity failure. No new model runs were recorded.

### Review result

One Node.js/CLI review with one incorporation pass, a scoped re-check, a full pass on the floor-hit
paths and two bounded current-scope corrections with their re-checks. All findings are fixed; no
review report was offloaded.

## Review findings

**Date:** 2026-11-26
**Reviewer:** `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    15 |
| Open / Not implemented |     0 |

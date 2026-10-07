# Unattended planning run state and planning-readiness contract

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Planning baseline

- **Planned at:** `e846936`, 2026-10-01.
- **Working state:** clean for every in-scope path. The only uncommitted entries are untracked
  files: `docs/concept/` (which holds the source concept), two 2026-09-21 plans, and the sibling
  2026-10-01 Issue Buddy plans that concurrent sessions are writing. None of them is in scope, and
  this work touches none of them.
- **Drift check before execution:** re-read the following and revise this plan if any of them no
  longer matches its description here:
  - the ask sites of `src/tools/plan.md` (fences `Revision` and `Plan review`, plus the prose sites
    in Phases 1, 2, 5, 6 and Rules);
  - the prose ask sites of `src/tools/plan-review.md`;
  - the `Run state:` grammar in `src/tools/iterate.md` Phase 0 step 10;
  - the `CONTEXT_BUDGET_LINES` entries for `plan` and `plan-review` in `build.mjs`.

## Requirement

This plan delivers work package 2 of the concept `docs/concept/2026-09-29-issue-buddy.md`, the
unattended run-state and readiness contract. Planning and the deep plan review must be able to run
when nobody is there to answer, and an issue must be judgeable as **ready for planning**. Under
`codex exec` a stray question ends the pass silently. The concept therefore requires a contract
test proving that no `ask` is reachable on the unattended path.

Three deliverables:

1. A **non-interactive run state** for `plan` and `plan-review`. A caller announces it with a
   control-line envelope, and every ask site on the planning and review path gets a defined outcome.
   An unanswered question always becomes an open point and is never guessed. Interactive behavior
   without the envelope is unchanged.
2. A **planning-readiness check**. It asks whether an issue can be _planned_, not whether it can be
   implemented without a plan. `effective-flow-needs-planning` is a positive ordering signal only.
3. An optional, language-stable **`**Issue:** #<N>`** plan header field and the unattended plan file
   name `YYYY-MM-DD-issue-<N>-<slug>.md`.

The work also includes the living ADR for the unattended run state: an unanswered question becomes
an open point, never a guess.

Sibling plans (all under `docs/plan/`):

- **Depends on:** `2026-10-01-codex-exec-unattended-spike.md` (WP1) for evidence that no question
  is reachable under `codex exec`. If WP1's no-question criterion fails, that does not block this
  plan; WP1 records the fallback.
- **Depended on by:**
  - `2026-10-01-issue-buddy-runtime-script.md` (WP3): the header field and the verdict shape.
  - `2026-10-01-shared-plan-publication-core.md` (WP4): the `**Issue:**` field drives the
    `plan/issue-<N>` branch. WP4 runs in parallel with this plan and builds against the agreed
    literal, so it does not wait for it.
  - `2026-10-01-issue-buddy-tool-stage-1.md` (WP5): the envelope, both fragments, and the
    file-name rule.
- **Order:** WP1 → this plan and WP4 in parallel → WP3 → WP5.

**Why Feature:** the plan adds new, caller-selectable behavior and a new artifact field. It is not a
behavior-preserving restructuring, so it is not a refactor.

## Verified context

- `src/tools/plan.md` has two `ask` fences: `Revision` (line 158, revision mode only) and
  `Plan review` (line 483, Phase 6b). Its prose ask sites are:
  - Phase 1 step 4: revision mode, the unclear-status confirmation, and the
    classification-change confirmation (lines 151–248);
  - Phase 1 step 7: the documentation target-path collision;
  - Phase 2: clarification until nothing is open (lines 278–279);
  - Phase 5: missing information (line 443);
  - Phase 6 step 5: critical findings remain (line 476);
  - the rule "ask instead of guessing" (line 527).

  Phase 1 step 3 runs a **bulk legacy migration** with `git mv`, which would add renames beside the
  one plan file.

- `src/tools/plan-review.md` has no fence. Its prose ask sites are:
  - missing or ambiguous input (line 96);
  - mixed artifact language (line 134);
  - already-implemented status (line 136);
  - Phase 3 decisions (lines 185–211), whose "Decide later" outcome becomes a blocking open point;
  - the rule at line 277.
- The transitive eager and lazy include closure adds only prose sites:
  - `src/shared/plan-reference-routing.md` (revision only);
  - `src/shared/apply-source-detection.md`, reached through `src/shared/plan-input-gateway.md`;
  - the multi-match question in `src/shared/plan-numbering.md:77`.

  `session-title` already declines in an unattended session. `config-migration`, `skill-discovery`
  and `task-tracking` pose no question.

- `src/shared/plan-input-gateway.md` runs Stage A detection on the whole argument and hands any issue
  reference to `plan-issue`. Text that contains `#N` would be rerouted, so the run-state check has to
  come before the gateway.
- The existing run-state vocabulary is `Run state: gated|non-interactive`, with a strict parse in
  `src/tools/iterate.md:459-480`: any other form aborts, and a duplicate aborts with
  `ABORT: duplicated control line`. It also appears in
  `src/shared/documentation-sync-contract.md:59-75` and
  `src/shared/delegation-envelope-examples.md`.
- `src/tools/plan-issue.md:270-273` already turns an unanswered clarification into a blocking open
  point, so the precedent exists.
- These consumers parse only the status, workflow and doc fields:
  - `src/tools/open-plans.md:61`;
  - `src/shared/plan-reference-routing.md:31`;
  - `src/scripts/remote-tracker-core.mjs:1281`;
  - `src/tools/apply-plan.md:98`.

  An added `**Issue:**` line is ignored by all of them. The `plan-numbering` slug rule (`a–z`, `0–9`,
  hyphen) already admits `issue-<N>-<slug>`.

- Test patterns already exist: `askContracts()` and `parseAskBlock` in
  `test/workflow-contracts.test.mjs:28`, and `resolveEagerIncludes`, `resolveLazyIncludes` and
  `LAZY_INCLUDE_RE` exported from `build-lib.mjs`. No build guard rejects a shared fragment that no
  host includes; such a fragment simply does not ship.
- Context budget, measured on the current `dist` (a lazy pointer renders as two lines):

  | Tool          | Built lines | Budget | Headroom |
  | ------------- | ----------: | -----: | -------: |
  | `plan`        |         656 |    665 |        9 |
  | `plan-review` |         442 |    446 |        4 |
  | `plan-issue`  |         754 |    754 |        0 |
  | `apply-plan`  |         589 |    589 |        0 |

- The merge-gate eval load closure (router, `merge-gate`, `iterate`, `merge-conflict-resolver`,
  `code-validator`, and everything those reach through their pointers) contains no file this plan
  edits.

## Architecture decisions

- **Envelope parsed before the gateway.** `plan.md` recognizes the envelope when the first non-empty
  line of the argument begins with `Run state:`. In that case it loads `unattended-planning` and
  never loads the gateway, so Stage A never sees issue text.
  - **Rejected:** having WP5 follow the planning phases directly, because that leaves `plan.md`'s
    "ask" instructions in force and gives the test no subject.
  - **Rejected:** a separate `plan-unattended` tool, because it would duplicate the planning phases.
- **Reuse `Run state: non-interactive`.** The envelope uses the existing grammar and value; there is
  no new `unattended` token. A `gated` value or any other form in this envelope returns
  `ABORT: unparseable run-state switch`.
- **Issue text by path, not inline.** The envelope's issue text arrives as a file path, matching
  WP5's fixed envelope. The file is WP3's trusted-text file
  `.effective-flow/issue-buddy/trusted/issue-<N>.json` (schema in the WP3 plan's "Contracts for
  WP5 and WP6a"); this fragment reads it as data only. The delimiter `--- end of control lines ---` ends the control block, and the
  message must end there; anything below it returns `ABORT: unexpected text below delimiter`.

  This narrows the adopted recommendation "data below the delimiter" so that WP2 and WP5 agree. The
  untrusted text is never part of the argument at all, which is stronger than treating it as data.

- **Control lines** (each exactly once, above the delimiter). `Run state: non-interactive` must be
  the **first non-empty line**; the other four follow in any order. Recognition is anchored on that
  first line only, so a misordered envelope can never fall through to the gateway: the gateway
  pointer's `when:` clause is amended to "a non-empty argument whose first non-empty line does not
  begin with `Run state:`", so the two pointers are mutually exclusive.
  - `Run state: non-interactive`;
  - `Next steps: suppressed`;
  - `Language context: …`, with the same six-key grammar as `iterate`;
  - `Issue: #<N>` (positive integer);
  - `Issue text: <absolute path>`. The path must equal exactly
    `<RUNTIME_STATE_ROOT>/.effective-flow/issue-buddy/trusted/issue-<N>.json`, with `<N>` taken
    from `Issue:`; it must be a regular file, not a symlink, checked per `runtime-state-safety`; and
    the JSON `issue` field must equal `<N>`. This ties the text to the issue, so issue 12's plan can
    never be written from issue 13's text, and it excludes `.effective-flow/.worktrees/**`.
- **Abort strings (complete list).** Unlike `iterate`, a malformed `Next steps:` line aborts here.
  - `ABORT: duplicated control line`
  - `ABORT: incomplete unattended envelope`
  - `ABORT: unparseable run-state switch`
  - `ABORT: unparseable next-steps switch`
  - `ABORT: unparseable language-context switch`
  - `ABORT: unparseable issue switch`
  - `ABORT: unparseable issue-text switch`
  - `ABORT: issue text mismatch`
  - `ABORT: unexpected text below delimiter`
  - `ABORT: unattended planning unavailable in hidden mode`
  - `ABORT: unattended revision refused`
  - `ABORT: unattended plan reference ambiguous`
  - `ABORT: unattended language mismatch`
  - `ABORT: unattended implemented plan`
  - `ABORT: unattended review input invalid`
  - `ABORT: unattended sub-agent failed`
- **One mapping fragment, loaded only on demand.** `src/shared/unattended-planning.md` holds the
  envelope grammar, the general rule ("unanswered → open point, never a guess"), and a site table
  keyed by stable site IDs. `plan.md` and `plan-review.md` reach it through one lazy pointer each, so
  an interactive run pays two rendered lines per tool and nothing more.
- **Readiness is its own fragment.** `src/shared/planning-readiness.md` is a lazy fragment for WP5's
  `issue-buddy` tool. It ships once WP5 points at it. Until then it is a source contract tested from
  `src/`. It is an Effective Flow gate in the manner of `apply-clarity-gate`, so the skill-ownership
  manifest stays unchanged.
- **File name and header.** The unattended path always writes a **new** plan named
  `YYYY-MM-DD-issue-<N>-<slug>.md`. The concept says the name "starts with `issue-<N>-`"; this plan
  deliberately keeps the date prefix, so `plan-numbering`, `open-plans` sorting, resolvers and
  archival stay unchanged. The header carries `**Issue:** #<N>`, using the same label in the German
  and English columns, as the **last** header line, after the Doc category and Target path fields
  (which `plan.md` requires directly below the workflow field). Interactive `plan` does not add the field in this package, but a person may
  add it by hand (WP4 relies on that).
- **Hidden mode fails closed.** `visibility: hidden` returns
  `ABORT: unattended planning unavailable in hidden mode`, consistent with the concept's non-goals.

## Affected files

| File                                         | Description                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/unattended-planning.md`          | New lazy fragment: envelope grammar, abort strings, general rule, file-name rule, site-mapping table for `plan` and `plan-review`, structured result                                                     |
| `src/shared/planning-readiness.md`           | New lazy fragment: criteria R1–R4, the doubt rule, the label ordering rule, the verdict shape, ready and not-ready examples                                                                              |
| `src/tools/plan.md`                          | One ordering sentence and the lazy pointer **before** the gateway pointer; the conditional `**Issue:**` template line; Phase 6b hands `Run state: non-interactive` to `plan-review` in an unattended run |
| `src/tools/plan-review.md`                   | One lazy pointer that fires when the delegation payload carries `Run state: non-interactive`                                                                                                             |
| `src/shared/plan-contract.md`                | New row `Issue` → `**Issue:**` in both columns, marked as a machine-stable label                                                                                                                         |
| `build.mjs`                                  | Only if the build reports a budget overrun: raise `plan` / `plan-review` in `CONTEXT_BUDGET_LINES` to the reported built size plus at most ten lines                                                     |
| `test/unattended-planning-contract.test.mjs` | New `node:test` suite (helpers copied per the suite convention)                                                                                                                                          |
| `docs/adr/unattended-run-state.md`           | New living ADR (name resolved through `project-adr-convention`; the repository's observed form is a numberless slug)                                                                                     |
| `docs/developer-guide/plan-conventions.md`   | Document the `**Issue:**` field and the unattended file name                                                                                                                                             |
| `docs/developer-guide/terminology.md`        | Add the terms "unattended run" and "planning readiness"                                                                                                                                                  |

## Implementation details

### Approach

1. **Write `unattended-planning.md`.** It covers the envelope, control lines, delimiter and abort
   strings from the architecture decisions, plus the general rule. The site table has columns
   `Site`, `File`, `Anchor`, `Outcome`, where `Anchor` is a short literal phrase from that file:

   | Site    | Outcome                                                                                                                                                                                                                                 |
   | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `P-GW`  | Gateway and Stage A: not loaded; the envelope replaces the argument.                                                                                                                                                                    |
   | `P-MIG` | Legacy bulk migration, in `plan` Phase 1 and on any plan read by `plan-review`'s file adapter (`plan-numbering`): skipped; reported as `legacy plans present` in the result.                                                            |
   | `P-REV` | Revision mode, the `Revision` fence, unclear-status and classification confirmations, plan-reference questions: unreachable, because the path always creates a new plan; reaching one aborts with `ABORT: unattended revision refused`. |
   | `P-DOC` | Doc-target collision: choose a unique alternative slug; never overwrite.                                                                                                                                                                |
   | `P-CLR` | Phase 2 clarification: a blocking open point with options, a recommendation and a re-entry note; unimportant points go to assumptions.                                                                                                  |
   | `P-VAL` | Phase 5 missing information: a blocking open point.                                                                                                                                                                                     |
   | `P-CRT` | Phase 6 step 5: complete the plan with `Revision required`; each remaining critical finding is also an open point.                                                                                                                      |
   | `P-DPR` | The `Plan review` fence: always `Yes`, regardless of the Phase 6 precondition "no critical findings"; `P-CRT` findings are recorded as open points first. Delegate with `Run state: non-interactive` and `Next steps: suppressed`.      |
   | `P-NUM` | Plan-reference multi-match: unreachable; `ABORT: unattended plan reference ambiguous` if reached.                                                                                                                                       |
   | `P-ESC` | Sub-agent escalation exhausted (`completion-protocol`: clarify the options with the user after three failed retries): `ABORT: unattended sub-agent failed`.                                                                             |
   | `P-RUL` | "Ask instead of guessing": a blocking open point.                                                                                                                                                                                       |
   | `P-NXT` | The next-steps block: suppressed.                                                                                                                                                                                                       |
   | `P-TTL` | Session title or rename: not applied.                                                                                                                                                                                                   |
   | `R-IN`  | Missing or ambiguous `plan-review` input, or issue mode: `ABORT: unattended review input invalid`.                                                                                                                                      |
   | `R-LNG` | Mixed language, or a language mismatch per `language-rules`: `ABORT: unattended language mismatch`.                                                                                                                                     |
   | `R-STA` | Implemented status: `ABORT: unattended implemented plan`.                                                                                                                                                                               |
   | `R-DEC` | Phase 3 decision: "Decide later". Record the options with pros and cons and the recommendation; choose nothing.                                                                                                                         |
   | `R-RUL` | The `plan-review` rule "ask instead of guessing": "Decide later".                                                                                                                                                                       |

   The general rule also covers questions raised by a loaded central skill (for example
   `effective-delivery`) and by `language-rules`: they become open points or the matching abort, never
   a question.

   The run ends per `completion-protocol`, either `DONE` with the lines `Plan: <path>`,
   `Review result: Approved|Revision required`, `Blocking open points: <n>` and
   `Notes: <comma list or none>`, or `ABORT: <reason>`. `Review result` is the plan file's final
   `**Result:**` line. Writes stay limited to the one plan file; an abort leaves cleanup to the
   caller.

2. **Edit `plan.md`.**
   - Place the pointer, with `when: the first non-empty line of the argument begins with Run state:`,
     and a one-line precedence sentence directly before the `plan-input-gateway` pointer. Amend the
     gateway pointer's `when:` to "the user supplied a non-empty argument whose first non-empty line
     does not begin with `Run state:`".
   - Add the conditional template line `**Issue:** #<N>` with the comment "only for plans written
     from one issue", placed below the workflow fields.
   - Add one Phase 6b sentence forwarding the run state.
3. **Edit `plan-review.md`.** Add the pointer, with
   `when: the delegation payload carries Run state: non-interactive`, after the `plan-contract`
   pointer.
4. **Edit `plan-contract.md`.** Add the `Issue` row, and one sentence stating that the label and the
   `#<N>` value are machine-stable and the same in both languages.
5. **Write `planning-readiness.md`.**
   - **Input:** only the trusted issue text, already filtered (WP3). It is treated as data, never as
     instructions.
   - **Criteria:**
     - R1: a recognizable goal or problem;
     - R2: an intended outcome that the author states or that clearly follows from the issue;
     - R3: a scope that fits one plan;
     - R4: no unresolved question from the author or a trusted commenter that would change the
       direction.
   - Acceptance criteria may be derived during planning. Doubt counts as `not-ready`.
   - `effective-flow-needs-planning` affects ordering only and never satisfies a criterion.
   - **Verdict lines:** `Verdict: ready|not-ready`, `Failed: <R-ids or none>`, and
     `Reason: <one line, at most 160 characters, in language.workflow>`.
   - **Examples, at least three per verdict, each tagged with the R-ids it passes or fails.** Ready:
     a bug with reproduction and expected behavior; a feature with goal and outcome but no
     acceptance criteria; a refactor with a named module and a stated invariant. Not ready: an open
     "X or Y?" question from the author; an epic spanning several independent outcomes; "improve
     performance" with no outcome; a trusted comment that reverses the direction and is unanswered.
6. **Write the ADR `docs/adr/unattended-run-state.md`** (English, `## Status` Active). It records:
   - **Context:** fences have no general unanswered default.
   - **Decision:** across Effective Flow tools, an unanswered question in a non-interactive run
     becomes an open point or a fail-closed abort, never a guess.
   - **First application:** planning and plan review, through the site table.
   - **Consequences:** a new ask site on a mapped path owes a table row. Existing per-fence defaults
     (`tracker-target`, `security-disclosure-gate`, `project-adr-convention`) are consistent with
     the rule and are not rewritten here.

   ADR craft follows `effective-product`.

7. **Update the developer docs**: `plan-conventions.md` and `terminology.md`.
8. **Write `test/unattended-planning-contract.test.mjs`.**
   - **Closure inventory.** Walk the eager and lazy include closure of `src/tools/plan.md` and
     `src/tools/plan-review.md`, excluding the two new fragments. Collect every `ask` fence header
     and every line that matches the lexical question pattern
     `\bask(s|ed)?\b|\bclarif(y|ication)\b|\bconfirm(ation)?\b|AskUserQuestion` (case-insensitive).
     Key each inventory entry by file plus the exact trimmed line text, and assert multiset equality
     in both directions between the collected lines and the frozen inventory, so removing one
     question and adding another cannot pass on counts. In that inventory, each entry is either a
     site ID or `not-a-site: <reason>`, for example `chat-language` describing setup. Assert that
     each site ID has exactly one row in the fragment's table, that each row's `Anchor` occurs in its
     `File`, and that each fence header has a row. A changed or new question line fails with a
     message to map it. The closure includes `completion-protocol` (site `P-ESC`).
   - **Ordering.** For the Claude, Codex and portable renderings of `plan.md` (in order:
     `resolveEagerIncludes`, then `resolveLazyIncludes`, then `renderBody`), the
     `unattended-planning` pointer precedes the `plan-input-gateway` pointer, its `when` clause names
     `Run state:`, and the gateway pointer's `when` carries the amended "does not begin with
     `Run state:`" text.
   - **Default unchanged.** Rendered output carries no `ask` fences (they become prose such as
     "Use the `AskUserQuestion` tool…"), so run `askContracts` on the eager-resolved **source**
     before `renderBody`: without the envelope, the fence headers of `plan.md` are exactly
     `Revision` and `Plan review`, and `plan-review.md` has none.
   - **Envelope.** The fragment contains each control-line literal, the delimiter and every abort
     string.
   - **Readiness.** The fragment contains R1–R4, the doubt rule, the label rule, the three verdict
     line forms, and at least three ready and three not-ready examples, each with its R-id tags.
   - **Header.** `plan-contract.md` has the `Issue` row with an identical label in both columns,
     `plan.md`'s template carries the conditional line, and the fragment states the
     `YYYY-MM-DD-issue-<N>-<slug>.md` rule.
   - **ADR.** The file exists with `## Status` / `Active` and states the rule.

### Edge cases

- **Text in the issue file.** Issue text containing `Run state:`, `#12` or a delimiter-like line
  lives only in the file, so it is never parsed as control or by Stage A.
- **Prose that starts with "Run state:".** A human argument starting with that text is parsed as an
  envelope and aborts on missing lines rather than planning on a misread argument. This is
  documented as intended.
- **Legacy plans present.** No migration runs, the result notes it, and the plan file is still the
  only write.
- **Same-day name collision.** The existing `-2` suffix rule applies.
- **Documentation classification.** The target-path collision takes an alternative slug.
- **Critical findings that survive the revision.** The plan is completed with `Revision required`;
  it is not left incomplete.
- **Unreachable sites.** Reaching an unreachable site (revision, multi-match, mixed language,
  implemented status) aborts. It never falls back to asking.
- **Bad issue-text path.** A path that is a symlink, differs from the issue's own trusted-text path,
  or whose JSON `issue` field differs from `Issue:` aborts before the text is used.
- **Misordered envelope.** An envelope whose first non-empty line is not `Run state:` is not
  recognized; because the gateway's `when:` excludes only that first line, it falls to the
  interactive path, which the caller (WP5) never produces. WP5's envelope always leads with it.
- **Exhausted sub-agent retries** abort with `ABORT: unattended sub-agent failed` instead of asking.
- **Hidden mode** aborts.

## Acceptance criteria

- [ ] `test/unattended-planning-contract.test.mjs` passes. Its closure inventory maps every `ask`
      fence and every lexical question site of the `plan` and `plan-review` include closure, keyed by
      file and exact line text, to exactly one site row or a reasoned non-site entry. Adding an
      unmapped question line to `src/tools/plan.md` makes the test fail.
- [ ] In all three rendered targets the `unattended-planning` pointer precedes the
      `plan-input-gateway` pointer, the gateway's `when:` excludes a first line beginning with
      `Run state:`, and the eager-resolved `plan.md` source without the envelope still carries
      exactly the fences `Revision` and `Plan review`.
- [ ] `src/shared/unattended-planning.md` states the five control lines with `Run state:` first, the
      delimiter, the complete abort-string list of this plan, the general rule, the file-name rule,
      the result lines, and all 18 site rows.
- [ ] `src/shared/planning-readiness.md` states R1–R4, the doubt rule, the ordering-only label rule,
      the verdict shape, and at least three ready and three not-ready examples, each tagged with the
      R-ids it fails or passes.
- [ ] `src/shared/plan-contract.md` carries the `Issue` row, and `docs/adr/unattended-run-state.md`
      exists with status Active.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` (with no budget overrun) and
      `pnpm test:distribution` all exit 0.

## Validation plan

- Before step 1, record the baseline verdict of `pnpm eval merge-gate verify`. After the change,
  `pnpm eval merge-gate verify` must report no staleness that this change caused, because no edited
  file is in the gate's load set.
- `pnpm agent:check`: exit 0.
- `pnpm test`: exit 0, including the new suite and the existing plan tests in
  `test/workflow-contracts.test.mjs` (for example the template test at line 3936).
- `node build.mjs`: exit 0. Read the `Always-loaded core (lines/budget)` lines for `plan` and
  `plan-review`, and adjust `CONTEXT_BUDGET_LINES` only if they overrun.
- `pnpm test:distribution`: exit 0.
- Mutation check: temporarily add one "ask the user" line to `src/tools/plan.md` and confirm the new
  suite fails. Take a `cp` snapshot first and restore from it; do not use `git checkout --`.

## Assumptions and open points

- WP5 invokes planning as a sub-agent delegation carrying the envelope. If WP1 shows that delegation
  fails under `codex exec`, the escalation is a concept revision there, not a change to this plan.
- Readiness judgment is an Effective Flow gate, so `docs/developer-guide/skill-ownership.json` is
  unchanged. `effective-delivery` keeps the generic plan judgment within the planning phases.
- `planning-readiness.md` is not shipped until WP5 adds its pointer. This is intended.
- Forgejo, external trackers, local trackers and hidden mode are out of scope (decision D3 and the
  concept's non-goals). `plan-issue`, `apply-issues`, `apply-plan` and `open-plans` stay unchanged;
  two of them have 0 lines of budget headroom.
- Interactive `plan` does not write `**Issue:**` in this package.
- Prose that already reads "decide later" in plan-review keeps its wording. The fragment maps it and
  does not rewrite it.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Important (Architecture), incorporated.** The legacy bulk migration in Phase 1 step 3 would add
  `git mv` renames and break the single-file publication invariant. It is now site `P-MIG`: skipped
  and reported.
- **Important (Architecture), incorporated.** The adopted recommendation "data below the delimiter"
  and WP5's "path to trusted text" contradicted each other. The plan now uses a path only, and any
  text below the delimiter aborts.
- **Important (Security), incorporated.** The issue-text path could point outside runtime state or
  through a symlink. It is now checked per `runtime-state-safety` before any read.
- **Important (Error cases), incorporated.** Unreachable sites originally had no outcome, which
  would let a run fall back to asking. Every such site now aborts with a named reason.
- **Important (Testability), incorporated.** A fence-only test would miss prose ask sites. The test
  now uses a frozen lexical inventory in both directions, together with anchor checks.
- **Note (Testability).** The lexical pattern can miss a question phrased without its keywords. This
  is accepted, because the anchor rows and the mutation check bound the risk.
- **Note (Scope).** Generalizing the rule to every tool is left to the ADR's consequences and not
  implemented here.
- **Note (Maintainability).** Every new ask site in the closure owes a table row. The test enforces
  this, and the ADR records it.
- **Cross-plan alignment (2026-10-01).** Binding orchestrator resolutions applied: the order is
  WP1 → this plan ∥ WP4 → WP3 → WP5, with WP4 building against the agreed `**Issue:**` literal;
  the `Issue text:` path names WP3's trusted-text file; this plan remains the sole owner of
  `docs/adr/unattended-run-state.md`. WP5 now passes exactly this five-line envelope and expects
  the three verdict lines defined here.

### Deep review (2026-10-01)

Result unchanged: **Approved**. One critical and ten further findings, all directly incorporated; no
decision was needed.

- **Critical (Architecture/Security), incorporated.** Control lines "in any order" let a misordered
  envelope reach the gateway, whose Stage A would route `Issue: #N` to the interactive,
  forge-writing `plan-issue` — fail-open. `Run state: non-interactive` is now required as the first
  non-empty line, and the gateway pointer's `when:` excludes it, so the two pointers are mutually
  exclusive; the ordering test asserts both clauses.
- **Important (Error cases), incorporated.** `completion-protocol` asks the user after exhausted
  sub-agent retries, an unmapped site. New row `P-ESC` aborts instead; the count is now 18 rows, and
  the general rule covers central-skill and `language-rules` questions.
- **Important (Architecture), incorporated.** Phase 6b only runs without remaining critical
  findings, contradicting `P-DPR` and the concept. `P-DPR` now runs regardless, after `P-CRT`
  findings became open points; `Review result` is defined as the final `**Result:**` line.
- **Important (Testability), incorporated.** Count-only inventory could pass a swapped question. The
  inventory is keyed by file and exact line text with multiset equality in both directions.
- **Important (Security), incorporated.** `Issue text:` accepted any file below `.effective-flow/`.
  It must now be the issue's own trusted-text file, and its `issue` field must match `Issue:`.
- **Important (Testability), incorporated.** Abort strings were only partly named; the complete list
  is now in the architecture decisions.
- **Note (Testability), incorporated.** Rendered output has no `ask` fences; the default-unchanged
  check runs `askContracts` on the eager-resolved source.
- **Note (Scope), incorporated.** Readiness example counts unified at three per verdict, with R-id
  tags in step 5.
- **Note (Maintainability), incorporated.** `**Issue:**` is the last header line, after the Doc
  fields.
- **Note (Error cases), incorporated.** `P-MIG` also covers the migration triggered when
  `plan-review` reads a plan.
- **Note (Clarity), incorporated.** The broken ordering bullet in step 8 is one line again.

## Open points

- No open points.

# Unattended planning run state and planning-readiness contract

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Planning baseline

- **Originally planned at:** `e846936`, 2026-10-01.
- **Revalidated at:** `e7d021e`, 2026-10-18.
- **Working state:** clean before this revision; this run changes only this plan.
- **Drift check before execution:** re-read the ask-site closure of `src/tools/plan.md` and
  `src/tools/plan-review.md`, including `plan-publication`, `central-reasoning-delegation` and
  `judgment-inline-fallback`; the run-state grammar in `src/tools/iterate.md` Phase 0 step 10;
  the `CONTEXT_BUDGET_LINES` entries; and the WP3/WP5 handoff contracts. Harmless line movement
  does not invalidate the plan. A changed control grammar, write boundary or consumer contract
  requires reconciliation before implementation.

## Requirement

This plan delivers work package 2 of the concept `docs/concept/2026-09-29-issue-buddy.md`, the
unattended run-state and readiness contract. Planning and the deep plan review must be able to run
when nobody is there to answer, and an issue must be judgeable as **ready for planning**. Under
`codex exec` a stray question ends the pass silently. The concept therefore requires complete ask-site coverage. Static contract tests protect the
source mapping and rendering; a fresh behavioral smoke round against the changed portable build
checks question-free execution. Neither layer alone proves every possible model execution.

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
  - `archive/2026-10-01-shared-plan-publication-core.md` (WP4, implemented): its parser already
    accepts the agreed `**Issue:**` literal and its unattended publisher derives `plan/issue-<N>`.
    This package preserves that shipped contract; publication remains WP5’s responsibility.
  - `2026-10-01-issue-buddy-tool-stage-1.md` (WP5): the envelope, both fragments, and the
    file-name rule.
- **Current dependency state:** WP1, WP3 and WP5 remain open; WP4 is implemented. WP2 can be
  authored and checked against the agreed WP3 trusted-text fixture without a live WP3 script.
  WP1 remains the runtime-evidence prerequisite; its documented no-question fallback does not
  block authoring WP2. WP3 and then WP5 integrate the completed contracts. WP5’s separate
  worktree-discard decision stays in WP5 and does not expand this package.

**Why Feature:** the plan adds new, caller-selectable behavior and a new artifact field. It is not a
behavior-preserving restructuring, so it is not a refactor.

## Verified context

- `src/tools/plan.md` has the direct `ask` fences `Revision` (Phase 1 step 4) and
  `Plan review` (Phase 6b). Its prose sites cover revision/header confirmations, a doc-target
  collision, Phase 2 clarification, Phase 5 missing information, Phase 6 remaining critical
  findings and the final ask-instead-of-guessing rule. Phase 1 step 3 still migrates legacy
  plans in bulk with `git mv`.
- `src/tools/plan-review.md` has no direct fence. Its prose sites cover missing/ambiguous input,
  mixed language, implemented status, Phase 3 decisions and the final clarification rule.
- The current transitive eager/lazy include closure contains 42 files and six fences: the two
  direct planning fences plus `Publish plan` (`plan-publication`), `Completion`
  (`worktree-integration`), `PR review` (`pr-review-integration`) and `Security`
  (`security-disclosure-gate`). The latter delivery branches are unreachable after publication
  is skipped. The inventory must record that boundary rather than pretend these fences are absent.
- `central-reasoning-delegation` now requires fresh-context judgment and reaches
  `judgment-inline-fallback`. Unavailable/declined judgment uses a recorded inline fallback;
  a terminal judgment `ABORT` records a skip and an implementation-blocking open point. Exhausted
  completion-protocol escalation is a separate no-question outcome.
- `session-title` already declines unattended title changes. The setup-language question in
  `chat-language` is descriptive of setup, not a planning question; inventory exclusions need
  similarly concrete reasons.

- `src/shared/plan-input-gateway.md` runs Stage A detection on the whole argument and hands any issue
  reference to `plan-issue`. Text that contains `#N` would be rerouted, so the run-state check has to
  come before the gateway.
- The current iterate vocabulary is `Run state: gated|non-interactive|relayed`, with a strict parse
  in `src/tools/iterate.md` Phase 0 step 10: any other form aborts, and a duplicate aborts with
  `ABORT: duplicated control line`. WP2 accepts only `non-interactive`; neither `gated` nor `relayed` is a planning-envelope mode.
  The shared vocabulary also appears in
  `src/shared/documentation-sync-contract.md:59-75` and
  `src/shared/delegation-envelope-examples.md`.
- `src/tools/plan-issue.md:270-273` already turns an unanswered clarification into a blocking open
  point, so the precedent exists.
- Existing status/workflow consumers include:
  - `src/tools/open-plans.md:61`;
  - `src/shared/plan-reference-routing.md:31`;
  - `src/scripts/remote-tracker-core.mjs:1281`;
  - `src/tools/apply-plan.md:98`.

  An added `**Issue:**` line leaves those routes unchanged. The shipped
  `src/scripts/plan-publication-core.mjs` separately validates one exact issue header before the
  first `##` heading. `src/scripts/plan-lint-core.mjs` owns `PLAN_CONTRACT_MAPPING`;
  `build.mjs` guards its projection into `plan-contract`’s marked Markdown tables. Update the
  core mapping and its prose projection together. The current `languageMatchers` treats every
  mapping label as evidence for its column language; an identical `**Issue:**` label in both
  columns would classify otherwise valid plans as mixed unless neutral labels are excluded. The `plan-numbering` slug rule (`a–z`, `0–9`,
  hyphen) already admits `issue-<N>-<slug>`.

- Test patterns already exist: `askContracts()` and `parseAskBlock` in
  `test/workflow-contracts.test.mjs:28`, and `resolveEagerIncludes`, `resolveLazyIncludes` and
  `LAZY_INCLUDE_RE` exported from `build-lib.mjs`. No build guard rejects a shared fragment that no
  host includes; such a fragment simply does not ship.
- Current body counts, reproduced read-only through the build transformations (not from stale
  `dist`), are `plan`: Claude 733, Codex 723, portable 723, budget 733;
  `plan-review`: 490 in every target, budget 490. Both maximums have no headroom. Execution
  must use the actual `node build.mjs` report after edits, not these baseline counts.
- Read-only `pnpm eval <suite> verify` baseline on 2026-10-18: `merge-gate` and `iterate` are
  already stale through `SKILL.md` and `shared/model-tiers.md`; `next-steps` is current with its
  version-stamp waiver. The scoped WP2 source changes do not add load-set drift to these suites;
  compare changed-file diagnostics with this baseline instead of claiming existing evidence is fresh.

## Architecture decisions

- **Envelope parsed before the gateway.** `plan.md` treats the argument as an unattended envelope
  when its first non-empty line begins with `Run state:` **or** any of its lines equals the
  delimiter `--- end of control lines ---`. In that case it loads `unattended-planning` and never
  loads the gateway, so Stage A never sees issue text.
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
  the **first non-empty line**; the other four follow in any order. An envelope recognized by its
  delimiter whose first non-empty line does not begin with `Run state:` returns
  `ABORT: misordered unattended envelope`; a first line that begins with `Run state:` but is not
  exactly `Run state: non-interactive` returns `ABORT: unparseable run-state switch`. The gateway
  pointer's `when:` clause is amended to "a non-empty argument whose first non-empty line does not
  begin with `Run state:` and that carries no `--- end of control lines ---` line", so the two
  pointers are mutually exclusive and a misordered envelope never reaches the gateway.
  - `Run state: non-interactive`;
  - `Next steps: suppressed`;
  - `Language context: …`, with the same six-key grammar as `iterate`;
  - `Issue: #<N>` (positive integer);
  - `Issue text: <absolute path>`. The path must equal exactly
    `<RUNTIME_STATE_ROOT>/.effective-flow/issue-buddy/trusted/issue-<N>.json`, with `<N>` taken
    from `Issue:`; it must be a regular file, not a symlink, checked per `runtime-state-safety`; and
    the JSON `issue` field must equal `<N>`. This ties the text to the issue, so issue 12's plan can
    never be written from issue 13's text, and it excludes `.effective-flow/.worktrees/**`.
- **New envelope/site abort strings (closed set).** Unlike `iterate`, a malformed `Next steps:`
  line aborts here. Existing operational failures (for example configuration resolution or final
  plan-lint) keep their diagnostics and terminate as `ABORT: <diagnostic>`; they are not new
  envelope grammar errors and never fall back to asking.
  - `ABORT: duplicated control line`
  - `ABORT: incomplete unattended envelope`
  - `ABORT: misordered unattended envelope`
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
  an interactive run pays only the pointer and the minimal host precedence/handoff sentences.
  The fragment has two entry contracts: `plan` validates the full five-line envelope;
  `plan-review` accepts the exact generated plan file reference plus `Run state: non-interactive`,
  `Next steps: suppressed` and the six-key concrete `Language context:`. Review never re-parses
  that payload as a planning envelope or requires `Issue text:` again. It retains the verified
  execution/runtime roots and artifact identity from its parent; invalid file-mode input uses
  `ABORT: unattended review input invalid`.
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
- **Language-neutral issue metadata.** Add `Issue` to the core-owned bilingual mapping and its
  marked Markdown projection. Its identical label contributes no German or English language hit.
  Keep genuine mixed-language detection and existing status/workflow/doc-field parsing intact;
  an issue-only input remains `language: unknown`. The linter’s public response shape does not
  gain an issue field: WP4 remains the issue-header parser for publication.
- **Runtime bootstrap and publication boundary.** Before reading issue text, use the existing
  config resolver to verify `RUNTIME_STATE_ROOT`, even though Stage A is skipped. Failure aborts
  with its diagnostic. The child writes only its new plan: Phase 7 passes `non-interactive`
  without `consent: given-by-caller` to `plan-publication`, whose existing gate skips publication
  before forge or Git operations. No envelope field grants publication consent. The caller WP5
  alone owns later publication through WP4. Map that gate and record downstream delivery asks
  as unreachable with this named reason, without defining new delivery behavior.
- **Hidden mode fails closed.** `visibility: hidden` returns
  `ABORT: unattended planning unavailable in hidden mode`, consistent with the concept's non-goals.

## Affected files

| File                                         | Description                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/unattended-planning.md`          | New lazy fragment: envelope grammar, abort strings, general rule, file-name rule, site-mapping table for `plan` and `plan-review`, distinct entry contracts, structured result                                                                                          |
| `src/shared/planning-readiness.md`           | New lazy fragment: criteria R1–R4, the doubt rule, the label ordering rule, the verdict shape, ready and not-ready examples                                                                                                                                             |
| `src/tools/plan.md`                          | One ordering sentence and the lazy pointer **before** the gateway pointer; the gateway pointer's `when:` amended to exclude the envelope; the conditional `**Issue:**` template line; Phase 6b hands `Run state: non-interactive` to `plan-review` in an unattended run |
| `src/tools/plan-review.md`                   | One lazy pointer that fires when the delegation payload carries `Run state: non-interactive`                                                                                                                                                                            |
| `src/scripts/plan-lint-core.mjs`             | Add the owned Issue mapping and exclude language-neutral labels from language evidence; preserve the existing lint response schema                                                                                                                                      |
| `test/build-lib.test.mjs`                    | Keep the missing-row projection guard tied to the owned mapping length when adding Issue                                                                                                                                                                                |
| `test/plan-lint.test.mjs`                    | Regression cases for EN/DE plans with Issue, Issue-only input, genuine mixed language and existing field parsing                                                                                                                                                        |
| `src/shared/plan-contract.md`                | New row `Issue` → `**Issue:**` in both columns, marked as a machine-stable label                                                                                                                                                                                        |
| `build.mjs`                                  | Only if the build reports a budget overrun: raise `plan` / `plan-review` in `CONTEXT_BUDGET_LINES` to the reported built size plus at most ten lines                                                                                                                    |
| `test/unattended-planning-contract.test.mjs` | New `node:test` suite (helpers copied per the suite convention)                                                                                                                                                                                                         |
| `docs/adr/unattended-run-state.md`           | New living ADR (name resolved through `project-adr-convention`; the repository's observed form is a numberless slug)                                                                                                                                                    |
| `docs/developer-guide/plan-conventions.md`   | Document the `**Issue:**` field and the unattended file name                                                                                                                                                                                                            |
| `docs/developer-guide/terminology.md`        | Add the terms "unattended run" and "planning readiness"                                                                                                                                                                                                                 |

## Implementation details

### Approach

0. Re-read the baseline and WP3/WP5 contracts, then derive the current question inventory.
   Preserve the existing domain-ownership split: these fragments own orchestration gates and
   result shapes, while `effective-delivery` retains generic plan judgment. The existing
   ownership manifest and guide relationships remain sufficient; add no second domain playbook.

1. **Write `unattended-planning.md`.** It covers the envelope, control lines, delimiter and abort
   strings from the architecture decisions, plus the general rule. The site table has columns
   `Site`, `File`, `Anchor`, `Outcome`, where `Anchor` is a short literal phrase from that file:

   | Site    | Outcome                                                                                                                                                                                                                                                                                                                                                                         |
   | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `P-GW`  | Gateway and Stage A: not loaded; the envelope replaces the argument.                                                                                                                                                                                                                                                                                                            |
   | `P-MIG` | Legacy bulk migration, in `plan` Phase 1 and on any plan read by `plan-review`'s file adapter (`plan-numbering`): skipped; reported as `legacy plans present` in the result.                                                                                                                                                                                                    |
   | `P-REV` | Revision mode, the `Revision` fence, unclear-status and classification confirmations, plan-reference questions: unreachable, because the path always creates a new plan; reaching one aborts with `ABORT: unattended revision refused`.                                                                                                                                         |
   | `P-DOC` | Doc-target collision: choose a unique alternative slug; never overwrite.                                                                                                                                                                                                                                                                                                        |
   | `P-CLR` | Phase 2 clarification: a blocking open point with options, a recommendation and a re-entry note; unimportant points go to assumptions.                                                                                                                                                                                                                                          |
   | `P-VAL` | Phase 5 missing information: a blocking open point.                                                                                                                                                                                                                                                                                                                             |
   | `P-CRT` | Phase 6 step 5: complete the plan with `Revision required`; each remaining critical finding is also an open point.                                                                                                                                                                                                                                                              |
   | `P-DPR` | The `Plan review` fence: always `Yes`, regardless of the Phase 6 precondition "no critical findings"; `P-CRT` findings are recorded as open points first. Delegate the exact generated file reference with `Run state: non-interactive`, `Next steps: suppressed`, the six-key `Language context:` and the verified handoff roots. Do not send the five-line planning envelope. |
   | `P-NUM` | Plan-reference multi-match: unreachable; `ABORT: unattended plan reference ambiguous` if reached.                                                                                                                                                                                                                                                                               |
   | `P-JDG` | Judgment spawn unavailable or declined: use the existing inline fallback and record it. A terminal judgment `ABORT` records a skipped judgment, adds its blocking re-entry point and sets `Revision required`; reduced-scope results retain their record. No fallback asks for a choice.                                                                                        |
   | `P-PUB` | Phase 7 publication: pass `non-interactive`, never caller consent; the existing gate skips publication before operations or questions. Its downstream worktree, PR-review and security questions are unreachable and are inventoried with this boundary as their reason.                                                                                                        |
   | `P-ESC` | Sub-agent escalation exhausted (`completion-protocol`: clarify the options with the user after three failed retries): `ABORT: unattended sub-agent failed`.                                                                                                                                                                                                                     |
   | `P-RUL` | "Ask instead of guessing": a blocking open point.                                                                                                                                                                                                                                                                                                                               |
   | `P-NXT` | The next-steps block: suppressed.                                                                                                                                                                                                                                                                                                                                               |
   | `P-TTL` | Session title or rename: not applied.                                                                                                                                                                                                                                                                                                                                           |
   | `R-IN`  | Missing or ambiguous `plan-review` input, or issue mode: `ABORT: unattended review input invalid`.                                                                                                                                                                                                                                                                              |
   | `R-LNG` | Mixed language, or a language mismatch per `language-rules`: `ABORT: unattended language mismatch`.                                                                                                                                                                                                                                                                             |
   | `R-STA` | Implemented status: `ABORT: unattended implemented plan`.                                                                                                                                                                                                                                                                                                                       |
   | `R-DEC` | Phase 3 decision: "Decide later". Record the options with pros and cons and the recommendation; choose nothing.                                                                                                                                                                                                                                                                 |
   | `R-RUL` | The `plan-review` rule "ask instead of guessing": "Decide later".                                                                                                                                                                                                                                                                                                               |

   The general rule also covers questions raised by a loaded central skill (for example
   `effective-delivery`) and by `language-rules`: they become open points or the matching abort, never
   a question.

   The run ends per `completion-protocol`, either `DONE` with the lines `Plan: <path>`,
   `Review result: Approved|Revision required`, `Blocking open points: <n>` and
   `Notes: <comma list or none>`, or `ABORT: <reason>`. Read the final canonical review-result
   field outside code fences in the artifact’s preserved language. Normalize English
   `**Result:** Approved|Revision required` and German
   `**Ergebnis:** Freigegeben|Überarbeitung nötig` into the stable response values
   `Approved|Revision required`; the artifact itself stays wholly in its language. Blocking
   open points or a skipped judgment force `Revision required`. Writes stay limited to the one plan file; an abort leaves cleanup to the
   caller.

2. **Edit `plan.md`.**
   - Place the pointer, with `when: the first non-empty line of the argument begins with Run state:,
or a line of the argument equals --- end of control lines ---`, and a one-line precedence
     sentence directly before the `plan-input-gateway` pointer. Amend the gateway pointer's `when:`
     to "the user supplied a non-empty argument whose first non-empty line does not begin with
     `Run state:` and that carries no `--- end of control lines ---` line".
   - Add the conditional template line `**Issue:** #<N>` with the comment "only for plans written
     from one issue", placed below the workflow fields.
   - Add one Phase 6b sentence forwarding the file-mode review payload and resolved language,
     and one Phase 7 sentence preserving the non-interactive publication gate.
3. **Edit `plan-review.md`.** Add the pointer, with
   `when: the delegation payload carries Run state: non-interactive`, after the `plan-contract`
   pointer.
4. **Extend the owned plan contract and linter together.** Add the `Issue` row with identical
   `**Issue:**` cells to `PLAN_CONTRACT_MAPPING` in `src/scripts/plan-lint-core.mjs`, then mirror
   it inside `plan-contract.md`’s marked table. State that the label and `#<N>` value are
   machine-stable in both languages. Exclude shared language-neutral labels from language
   evidence; preserve existing bilingual value checks and the public lint response shape.
   Add focused regression cases to `test/plan-lint.test.mjs`: complete EN and DE plans retain
   their language with the issue header, issue-only text is `unknown`, genuinely mixed labels
   remain `mixed`, and status/workflow/doc fields retain their prior values. Run
   `node --test test/plan-lint.test.mjs` before the broader checks; all cases must pass.
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
     site ID or `not-a-site: <reason>` (including delivery questions unreachable behind `P-PUB`), for example `chat-language` describing setup. Assert that
     each site ID has exactly one row in the fragment's table, that each row's `Anchor` occurs in its
     `File`, and that every fence header is mapped to a row or an explicit unreachable-boundary reason. A changed or new question line fails with a
     message to map it. The current closure includes `completion-protocol` (`P-ESC`),
     `judgment-inline-fallback` (`P-JDG`) and publication (`P-PUB`). Do not pin a stale total
     count: freeze the actual file/line inventory and require complete correspondence.
   - **Ordering.** For the Claude, Codex and portable renderings of `plan.md` (in order:
     `resolveEagerIncludes`, then `resolveLazyIncludes`, then `renderBody`), the
     `unattended-planning` pointer precedes the `plan-input-gateway` pointer, its `when` clause names
     both `Run state:` and the delimiter `--- end of control lines ---`, and the gateway pointer's
     `when` carries the amended text excluding both: "does not begin with `Run state:`" and "carries
     no `--- end of control lines ---` line".
   - **Misordered envelope.** The fragment states that an argument carrying the delimiter whose
     first non-empty line is `Next steps:` (or any other line not beginning with `Run state:`)
     aborts with `ABORT: misordered unattended envelope` and loads neither the gateway nor
     `plan-issue`.
   - **Default unchanged.** Rendered output carries no `ask` fences (they become prose such as
     "Use the `AskUserQuestion` tool…"), so run `askContracts` on the eager-resolved **source**
     before `renderBody`: without the envelope, the fence headers of `plan.md` are exactly
     `Revision` and `Plan review`, and `plan-review.md` has none. This assertion concerns the tools’ eager cores; the
     transitive closure inventory above separately includes all six current fences.
   - **Envelope.** The fragment contains each control-line literal, the delimiter and every abort
     string.
   - **Readiness.** The fragment contains R1–R4, the doubt rule, the label rule, the three verdict
     line forms, and at least three ready and three not-ready examples, each with its R-id tags.
   - **Header.** `plan-contract.md` has the `Issue` row with an identical label in both columns,
     `plan.md`'s template carries the conditional line, and the fragment states the
     `YYYY-MM-DD-issue-<N>-<slug>.md` rule.
   - **Entry and completion contracts.** Check separate plan versus file-review entry rules,
     all four EN/DE result normalizations, terminal operational failure propagation, judgment
     skip/fallback outcomes and the publication gate before its downstream ask/write paths.
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
- **Misordered envelope.** A misordered envelope still carries the delimiter, so it is recognized
  and aborts with `ABORT: misordered unattended envelope`; it never reaches the gateway.
- **Prose that contains the delimiter.** A human argument with a line equal to
  `--- end of control lines ---` is likewise treated as an envelope and aborts rather than being
  routed by Stage A. This is documented as intended.
- **Exhausted sub-agent retries** abort with `ABORT: unattended sub-agent failed` instead of asking.
- **Hidden mode** aborts.

## Acceptance criteria

- [x] `test/unattended-planning-contract.test.mjs` passes. Its closure inventory maps every `ask`
      fence and every lexical question site of the `plan` and `plan-review` include closure, keyed by
      file and exact line text, to exactly one site row or a reasoned non-site entry. Adding an
      unmapped question line to `src/tools/plan.md` makes the test fail.
- [x] In all three rendered targets the `unattended-planning` pointer precedes the
      `plan-input-gateway` pointer, the gateway's `when:` excludes both a first line beginning with
      `Run state:` and an argument carrying a `--- end of control lines ---` line, an argument
      carrying the delimiter with a non-`Run state:` first line aborts with
      `ABORT: misordered unattended envelope`, and the eager-resolved `plan.md` source without the envelope still carries
      exactly the fences `Revision` and `Plan review`.
- [x] `src/shared/unattended-planning.md` states the five control lines with `Run state:` first, the
      delimiter, the complete abort-string list of this plan, the general rule, the file-name rule,
      both entry contracts, bilingual result normalization and the complete current site mapping,
      including judgment fallback and skipped publication.
- [x] `src/shared/planning-readiness.md` states R1–R4, the doubt rule, the ordering-only label rule,
      the verdict shape, and at least three ready and three not-ready examples, each tagged with the
      R-ids it fails or passes.
- [x] The `Issue` row in `src/scripts/plan-lint-core.mjs` and its marked
      `src/shared/plan-contract.md` projection agree. `node --test test/plan-lint.test.mjs` passes
      EN/DE-plus-Issue, Issue-only, genuine-mixed and existing-field regressions, without changing
      the lint response schema. `docs/adr/unattended-run-state.md` exists with status Active.
- [ ] The fresh portable smoke cases in the validation plan terminate without a question,
      return their expected `DONE`/`ABORT`, and preserve the one-plan-file write boundary.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` (with no budget overrun) and
      `pnpm test:distribution` all exit 0.

## Validation plan

- Before step 1 and after completion, run `pnpm eval merge-gate verify`,
  `pnpm eval iterate verify` and `pnpm eval next-steps verify`. Compare changed-file diagnostics
  with the baseline above. WP2 must introduce no additional drift in these load sets; existing
  merge-gate/iterate staleness is a pre-existing release-evidence debt, not a WP2 regression.
- `node --test test/plan-lint.test.mjs`: exit 0 for the issue-header language regressions.
- `pnpm agent:check`: exit 0.
- `pnpm test`: exit 0, including the new suite and the existing template, plan-contract mapping
  and publication-pointer guards in `test/workflow-contracts.test.mjs`.
- `node build.mjs`: exit 0. Read the `Always-loaded core (lines/budget)` lines for `plan` and
  `plan-review`, and adjust `CONTEXT_BUDGET_LINES` only if they overrun.
- `pnpm test:distribution`: exit 0.
- Fresh behavioral smoke, after building the changed portable target: use local Codex 0.159.3
  in disposable repositories and minimal WP3-schema trusted-text fixtures (user-authorized method
  adjustment on 2026-10-18). WP1’s pinned Codex 0.153.4 and guest evidence remain a separate package.
  Exercise (a) a valid English envelope that yields a blocking open point and ends with `DONE`,
  `Review result: Revision required` and a nonzero count; (b) a delimiter-bearing misordered
  envelope that ends with `ABORT: misordered unattended envelope` and creates no plan; and
  (c) a valid German envelope whose complete German artifact yields the normalized English
  response value. A ready fixture must also cover `Approved`; static cases cover both values
  in both languages. Observe no user-input tool or prose question, the expected terminal lines,
  final lint/result and the Git/filesystem delta confined to the one new plan. Runtime/bootstrap
  data prepared by the fixture is excluded from that delta. Record commands, model/effort,
  terminal observations and pass/fail evidence in the implementation PR; no new eval framework
  is required. A question, missing terminal result or extra write fails acceptance. Record the exact local
  command, requested model/effort, portable snapshot digest and observed outcomes; this evidence
  satisfies only WP2 and does not claim WP1’s pinned-runtime or guest result.
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
  their budgets are not changed by this package.
- Interactive `plan` does not write `**Issue:**` in this package.
- The source-level inventory is a regression guard for known question instructions, not a proof
  of all model behavior. The fresh portable smoke provides bounded execution evidence.
- Prose that already reads "decide later" in plan-review keeps its wording. The fragment maps it and
  does not rewrite it.

## Implementation progress (2026-10-18)

The scoped source, documentation and automated regression coverage are implemented on
`effective-flow/build/unattended-planning`. The full completion condition is not yet met:
portable behavioral validation remains blocked. The status stays Not implemented; this plan
has not been archived or delivered; an implementation checkpoint may precede base integration.

- Runtime mapping and language-neutral Issue detection are synchronized with their marked
  prose projection. The existing build-lib missing-row guard now derives its expected count from
  the owned mapping instead of a fixed number.
- The two prompt entries, twenty site outcomes, readiness criteria, four bilingual result
  mappings and fresh-worker no-question handoffs are present. Measured context budgets are
  `plan` 742/742 and `plan-review` 492/492.
- Documentation sync: technical documentation updated in plan-conventions, terminology and the
  Active unattended-run ADR. CLI help and in-code API documentation have no new surface or
  response schema; README/user docs are unaffected by this internal caller contract.
  Operations/runbooks and AGENTS remain unaffected; no new exposed tool or duplicated policy.

## Test results

| Check                              | Result                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm agent:check`                 | Passed after scoped formatting correction; 938 files checked                                                              |
| `pnpm test`                        | Passed after fixing the mapping-count expectation; 539 TAP ok records, none failed                                        |
| `node build.mjs`                   | Passed for Claude, Codex and portable targets, with no budget overrun                                                     |
| `pnpm test:distribution`           | Passed                                                                                                                    |
| Focused unattended contract suite  | 12/12 passed                                                                                                              |
| Focused plan-lint suite            | 55/55 passed                                                                                                              |
| Unmapped-question mutation         | Failed as expected; original source restored byte for byte                                                                |
| Exact inventory negative cases     | Added, removed and same-count replaced lines are rejected                                                                 |
| Existing behavioral eval freshness | merge-gate/iterate retain only baseline SKILL.md/model-tiers drift; next-steps current with existing version-stamp waiver |
| Fresh portable behavioral smoke    | Pending: user authorized local Codex 0.159.3 for WP2; WP1 remains separate                                                |

Repository checks used the pinned pnpm 12.5.1 outside the execution sandbox and reused the
existing main-checkout formatter binary through PATH, without installing dependencies or changing
configuration. The first full validation found one formatting error and one obsolete mapping-count
expectation; both were corrected through the implementation worker and independently rechecked.

The user authorized local Codex 0.159.3 for WP2 smoke on 2026-10-18, keeping WP1’s pinned-runtime
and guest evidence separate. The local run is pending; no behavioral pass is claimed yet.

## Review findings

**Date:** 2026-10-18
**Reviewer:** Backend/CLI review

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     1 |
| Open / Not implemented |     0 |

The fixed finding ensures that fresh-context analysis workers receive the non-interactive
no-question policy explicitly. A targeted independent recheck confirmed the correction.
No residual review report was needed. The runtime-smoke evidence gap above is a validation
blocker, not an unimplemented review finding.

## Plan review

### Initial review (2026-10-01)

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
  - **Correction (2026-10-07).** That fix only moved the fail-open: a misordered envelope was then
    not recognized at all and still reached the gateway. Recognition now also matches the delimiter
    line `--- end of control lines ---`, the gateway's `when:` excludes it, and a misordered
    envelope aborts with `ABORT: misordered unattended envelope`.
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

### Revision review (2026-10-18)

**Result:** Approved

The gap analysis identified four important corrections and one note, all incorporated below.
An independent final review found no remaining findings across architecture, security, data
protection, error cases, testability, scope and maintainability. Earlier reviews above are historical.

The scorecard passes: concrete paths and ordered steps; measurable acceptance evidence; verified
context separated from assumptions; explicit purpose and Feature rationale; one-plan-file write
boundary; no implementation snippets; no documentation-only target fields required.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    0 |

- **Important (Architecture), incorporated.** English and German artifact review fields now
  normalize to the same stable result lines without mixing artifact languages.
- **Important (Architecture), incorporated.** Planning and file-mode deep review have distinct
  fragment entry contracts; a valid review delegation does not need the planning envelope again.
- **Important (Maintainability), incorporated.** The current include closure, publication gate
  and judgment fallback replace the obsolete fixed 18-row assumption. Unreachable delivery asks
  retain their boundary reason in the inventory.
- **Important (Testability), incorporated.** Static inventory/render assertions protect source
  coverage. A fresh portable behavioral smoke round now checks the new envelope and write boundary.
- **Note (Error cases), incorporated.** The closed set names new envelope/site errors; operational
  failures keep their existing diagnostics and return `ABORT`.

### Deep review after revision (2026-10-18)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Important (Architecture), incorporated.** The core owns the bilingual mapping; adding only
  its Markdown projection would fail the build guard. Adding the shared Issue label to both
  language matchers would then classify otherwise valid plans as mixed. Scope now includes the
  core mapping owner, neutral-label detection and focused plan-lint regressions; requirement,
  approach, acceptance and validation agree. A read-only follow-up verified the correction.
- No decision-requiring findings or implementation-blocking open points remain. The review
  checked gateway precedence, envelope grammar, language and result handling, judgment and retry
  paths, file/runtime limits, publication boundaries and WP1/WP3/WP5 contract compatibility.

## Open points

- No open points.

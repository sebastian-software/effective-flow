# Enable the Fast pilot and start its baseline through a Targeted setup request

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

After PR #704 (package A of
`docs/plan/2026-11-21-fast-pilot-opt-in-with-a-short-baseline-and-broader-workflow-coverage.md`)
is released, the owner must enable Fast and start the pilot baseline. Today the only route is the
full `effective-flow setup guided` run: answer the Guided questions, choose the advanced settings,
open Block 10, and only then reach the opt-in and the `begin-baseline` action.

The owner wants a shorter route through free text, for example `effective-flow setup fast`,
`effective-flow setup enable the Fast pilot and start the baseline`, or the same request in
German. Free text already lands in the Targeted mode (`src/shared/setup-targeted-change.md`), and
Targeted explicitly refuses `executionProfiles.fast.enabled` with a redirect to Guided → Block 10.

The refusal was a scope and cost decision, not a safety one. In
`docs/plan/archive/2026-10-16-targeted-free-text-setup-changes.md` (Plan review, Critical/Scope),
admitting the key would have required editing the eager `config-migration.md` and re-recording
eval rounds. The owner has now accepted that cost, including the larger current suite set
(decisions 2026-11-22).

Feature, because setup gains a new user-facing route to an existing confirmed action. No new
lifecycle semantics are added.

## Outcome checkpoint

**Primary source:** Owner request in this session, 2026-11-22, raised on PR #704 (thread "Review-Tool
im Autopilot-Kontext").
**Original outcome:** The owner enables Fast and starts (or resumes) the pilot baseline through one
Targeted `setup` request, without the full Guided run. The confirmations, digest bindings and
generation-state ownership stay exactly as in Block 10.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** Block 10 (`src/shared/setup-execution-profiles.md`) and the pilot helper
(`pilot-measurement.mjs`) exist; the Targeted mode exists and refuses this key.
**Continuation decision:** None.

## Architecture decisions

- **Free text only, no new keyword (owner decision).** `setup fast` is already not one of the seven
  keyword forms, so Step 0 classifies it as Targeted. The keyword list, the "seven" count and their
  pinning tests stay unchanged. Targeted interpretation learns to recognize a Fast pilot request.
- **A bare "fast" always asks (owner decision).** `review.profile` also accepts the value `fast`
  (`src/tools/setup.md` schema), and Targeted never guesses. A request whose only pilot signal is the
  word "fast", with no "pilot", "baseline", "execution profile" or "review" context, gets one focused
  question with two options:
  - the Fast pilot (`executionProfiles.fast.enabled`);
  - the review profile (`review.profile = fast`).
    Unambiguous wording ("Fast pilot", "start the baseline", "review profile fast") skips the question.
    Conflicting signals ("Fast pilot review") also ask. Inside a pilot request, "review" means the
    generation exit `begin-review`, which Targeted refuses (see below), never `review.profile`.
- **One owner, two entries.** `src/shared/setup-execution-profiles.md` stays the sole owner of the
  opt-in question, its literal `true`/`false` encoding and the two generation actions. Targeted loads
  it through its own `lazy-include` with a Targeted-specific `when:` condition. It does not duplicate
  the question, the digest checks or the helper payloads.
- **Opt-in and baseline in one run (owner decision).** Targeted gains two new operation kinds next to
  _set_, _ask_, _reset_ and _question_:
  - _pilot action_: run Block 10's "Generation actions" section after the Targeted write step;
  - _pilot state question_: a read-only question about the generation state (see below).
    The opt-in itself stays an ordinary _set_/_ask_ on `executionProfiles.fast.enabled` and runs Block
    10's question. A _pilot action_ is a valid operation of its own, so a request holding only "start
    the baseline" is not an empty request.
    The helper's `inventory` result decides which action is offered: `begin-baseline` for state `none`,
    `resume` for an eligible `suspended` state, nothing for `baseline`, `active` or `review`. The free
    text never picks the action directly.
- **The invocation text is never consent.** The `Baseline` and `Resume` asks are always shown in
  full, after the protocol digest, the version and the local-data disclosure, with no answer
  pre-selected. "Start the baseline" in the request selects the action step and nothing more.
  `confirmation: true` is sent only after that explicit answer, exactly as Block 10 requires today.
- **The Block 10 opt-in question, adapted for Targeted.** Under Targeted, the question's `when:` admits
  "a Targeted request touching `executionProfiles.fast.enabled`". The requested answer (`Enable` or
  `Disable`) is pre-selected instead of `Keep`, and the recorded value is shown as "currently
  recorded". The answer set stays `Keep`/`Enable`/`Disable` with no free-text value. The free text
  only chooses the pre-selection.
- **The action step runs after the write and has a precise gate.** It runs only when all of these
  hold:
  - the run is interactive;
  - the request holds a _pilot action_, either explicitly or through an opt-in to `Enable`;
  - the Targeted write step either finished its write without stopping, or wrote nothing for one of
    these reasons:
    - every requested row already matches what is recorded;
    - the opt-in question was answered `Keep`;
    - every other operation was refused, redirected, or a read-only question;
  - no operation of the run stopped, on any key (Targeted item 3, the hidden-mode guard, the
    external replay). A stop on another key also suppresses the step, even if the Fast key was
    already `enabled`;
  - a fresh configuration read directly before the step classifies the key as `enabled`. The
    preview value is never used, because the "nothing written" path skips Targeted item 3.
    A declined confirmation, a stopped run, or a resulting `disabled`/`invalid` value offers no action.
    A non-interactive run makes no `inventory` or `protocol` call, except the single read of a _pilot
    state question_.
- **Any pilot request reaches the action step.** A request that enables the pilot reaches the action
  step after the write, as in Guided, even without mentioning the baseline. The user can decline the
  `Baseline` ask there. A disable request never reaches it.
- **A baseline request implies the opt-in, through the opt-in question (owner decision).** If the
  text asks only to start or resume the baseline while the key is not `enabled`, the run poses Block
  10's opt-in question with `Enable` pre-selected. The question is labelled as implied by the
  request. A recorded `false` is named there as an earlier explicit decision to disable. The answer
  then joins the normal preview and confirmation. `Keep` or `Disable` leaves the key as it is and
  offers no action. This keeps Block 10's rule that enabling never starts a baseline: the baseline
  still needs its own confirmed `Baseline` ask, so the ADR's pilot wording and Block 10's
  "Enable … no baseline starts" description stay verbatim.
- **Ambiguous stop wording asks.** "Stop the pilot" or "pause Fast" gets one focused question with two
  options: `Disable` or leave the pilot unchanged. The question also says that ending a generation
  (`begin-review`) is out of reach for Targeted and names the route the fragment documents. The run
  never guesses.
- **Pilot state questions use Block 10's read-only first step.** A question such as "is the baseline
  running?" runs Block 10 "Generation actions" step 1 (`inventory`) once, at the read-only answer
  stage before any preview. It reports the result under that section's step 1 and step 2 reporting
  rules: generation state, any busy cause, and qualification, where present. It offers no action,
  writes nothing, asks no confirmation, matches no next-steps row, and runs in non-interactive runs
  too. A helper failure, such as `UNSAFE_RUNTIME_ROOT`, `MIGRATION_REQUIRED` or `INVALID_STATE` for
  several generations, is reported only by its error code, with a route to the full `setup`.
  Remaining operations continue.
- **Only `begin-baseline` and `resume` are reachable.** Requests for `begin-review`,
  `discard-generation`, measurement edits, or a model or provider name are refused per operation,
  with the route the Block 10 fragment already names (direct helper use for the two exits). No model
  or provider is ever configured.
- **Hidden mode is allowed.** The key is neither a forced hidden value
  (`src/scripts/config-resolve-core.mjs` `HIDDEN_FORCED_VALUES`) nor on Targeted's hidden refusal
  list. The write goes to the local `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`, as in
  Guided.
- **"Guided only" claims change once, everywhere they are pinned.** Each sentence in "Affected files"
  that says only Guided setup sets the key or runs the actions is rewritten to say "setup (Guided
  Block 10 or a Targeted request)". Its test pin is updated in the same change. The ADR
  `risk-aware-model-tiering-pilot-policy.md` gets a dated amendment, not a revision: its invariant
  (setup is the only entry, the actions are confirmed, and no workflow run calls them) is unchanged.
- **Eval re-record accepted (owner decision, reconfirmed).** The change stales the archived rounds of
  probably four suites before the next release:
  - `merge-gate` and `iterate`, which reach `config-migration.md`;
  - `focus`, which reaches it through `chat-language.md`;
  - `build-context`, whose seeds include every `tools/*.md`, so the Targeted fragment it reaches is
    covered too. Its rounds carry host evidence.
    The re-record is owed before the release, not before the merge
    (`docs/developer-guide/build-system.md`, "Each behavioural eval suite …"). It should be bundled with
    other changes that stale the same suites.
- **Base: develop after #704 merges.** This plan builds on PR #704's versions of the pilot fragments
  and `setup-status-core.mjs`. It is not stacked onto #704's branch, so #704's merge-gate run is not
  disturbed.

## Affected files

Line numbers refer to PR #704's branch. Re-check them after the merge.

| File                                                                                                                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/setup-targeted-change.md`                                                                                                                             | Drop the `executionProfiles.fast.enabled` redirect (about line 65). Add the pilot interpretation: opt-in operation, implied opt-in, action part, the bare-"fast" question, the stop-wording question, the `inventory` state answer. Add an owner-table row for the key → Block 10. Add a `lazy-include` of `setup-execution-profiles` with a Targeted `when:`. Extend Write with the gated action step and Summary with its outcome. List the refused pilot operations |
| `src/shared/setup-execution-profiles.md`                                                                                                                          | Opener (lines 3–8), opt-in `ask` `when:` (about 25), "Pre-select `Keep`" (about 29), "no free text" (about 41) and the generation-action gate (about 54–56): admit Targeted with the rules above. State the consent rule: never pre-select `Baseline`/`Resume`. "Profile, Express and the `hidden` keyword never load it" stays                                                                                                                                        |
| `src/shared/setup-targeted-change.md` (Write, about line 165)                                                                                                     | "The only write path is Step 6 items 1, 2 and 4" (pinned at about `test/workflow-contracts.test.mjs:2483`): the configuration write path stays unchanged, and the gated action step is named as the one helper-state write after it                                                                                                                                                                                                                                    |
| `src/shared/setup-advanced-settings.md`                                                                                                                           | Lines 3–5 ("never block 10") stay true for this fragment: Targeted never opens Block 10 through it. Add one clause saying Targeted loads `setup-execution-profiles` directly. The fragment's own `lazy-include` (about 25–28) is unchanged, so there is exactly one Targeted load path                                                                                                                                                                                 |
| `src/tools/setup.md`                                                                                                                                              | Line about 101, the schema row "Set only in Guided block 10" → setup Block 10 from Guided or Targeted. Lines about 2 (description) and 19 (Targeted summary: "changes only the named keys … or answers read-only questions about the current values") → also name the confirmed pilot actions and the pilot state answer. The keyword list stays unchanged                                                                                                             |
| `src/shared/config-migration.md`                                                                                                                                  | Rewrite the clause at about lines 31–35, "Only Guided setup (advanced block 10) sets it"                                                                                                                                                                                                                                                                                                                                                                               |
| `src/shared/pilot-measurement-workflow.md`                                                                                                                        | Lines about 9, 282–283 and 345–346: "confirmed Guided setup actions" and "Fast returns only through a confirmed `Enable` there" → name both setup entries                                                                                                                                                                                                                                                                                                              |
| `src/shared/execution-profiles.md`                                                                                                                                | Lines about 154–156: same rewrite                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/scripts/setup-status-core.mjs`                                                                                                                               | `REMEDIATIONS.invalidValue.fastProfile` (about 233, 389). First check whether the Fast key's diagnostic is a value-domain one. If it is, delete the special case so that the generic `invalid-value` entry, which already names the Targeted form, applies. Otherwise reword it to the Targeted route. Update the comment at about 233 either way                                                                                                                      |
| `test/workflow-contracts.test.mjs`                                                                                                                                | Relax the pins that block Targeted from Block 10 (about 1740, 1966–2030, 1983, 2081, 2376). Add assertions for the new contract (see acceptance criteria). Keep the pin that no non-setup tool loads `setup-execution-profiles`                                                                                                                                                                                                                                        |
| `test/execution-profile-workflow-contract.test.mjs`                                                                                                               | Update the pins at about 2035, 2322 and 2384                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/setup-status-core.test.mjs`                                                                                                                                 | Update the expectations at about 302–318 and 645–647 to the chosen remediation                                                                                                                                                                                                                                                                                                                                                                                         |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`                                                                                                               | Dated amendment next to lines 99–100: the Targeted entry exposes the same opt-in and the same confirmed actions                                                                                                                                                                                                                                                                                                                                                        |
| `docs/user-guide/tools-setup.md`, `configuration.md`, `model-tiering-pilot.md`, `tools-deliver.md`, `getting-started.md`                                          | Replace the "run `setup guided` → Advanced → Block 10" instructions with the free-text route, keeping Guided as the alternative                                                                                                                                                                                                                                                                                                                                        |
| `docs/developer-guide/configuration.md` (about 361), `architecture.md` (about 924), `build-system.md` (about 1051), `model-tiering-pilot-protocol.md` (about 227) | Same rewrite of the "Guided only" claims                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `evals/<suite>/results/…`                                                                                                                                         | Re-record the archived rounds of every suite that `pnpm eval <suite> verify` reports stale, probably `merge-gate`, `iterate`, `focus` and `build-context`, before the next release                                                                                                                                                                                                                                                                                     |

## Implementation details

### Approach

1. Start after PR #704 is merged into `develop`. Grep `src/`, `docs/` and `test/` again for
   "Guided" near `executionProfiles`, "Block 10" or "begin-baseline", and add any hit missing from
   "Affected files".
2. Extend Targeted interpretation (`setup-targeted-change.md`, "Interpretation") with the pilot
   rules from "Architecture decisions":
   - the two new operation kinds, _pilot action_ and _pilot state question_;
   - the implied opt-in question;
   - the bare-"fast" and conflicting-signal questions;
   - the stop-wording question;
   - the per-operation refusals.
     Extend "Read-only answers" with the pilot state answer.
3. Replace the refusal line with an owner-table row: `executionProfiles.fast.enabled` → Block 10
   (`setup-execution-profiles`). Its Targeted rule: the key's question alone, with the requested
   answer pre-selected, followed by the gated action step.
4. Add the `lazy-include` of `setup-execution-profiles` to the Targeted fragment. Its `when:` is a
   Targeted operation that touches `executionProfiles.fast.enabled`, holds an action part, or asks a
   pilot state question.
5. In `setup-execution-profiles.md`, admit Targeted at every Guided-only point listed under
   "Affected files", and add the consent rule. Leave the inventory, protocol-digest, payload and
   failure rules untouched.
6. Add the gated action step to Targeted "Write", and extend its "writes nothing" paragraph so that
   a _pilot action_ counts as a valid operation. "Summary" reports the action as offered, accepted,
   declined or not offered. A not-offered action carries its reason, one of:
   - generation state;
   - busy cause;
   - config not `enabled`;
   - non-interactive run;
   - confirmation declined;
   - write stopped;
   - no valid operation;
   - helper error code.
     Targeted still matches no next-steps row.
7. Rewrite every "Guided only" sentence in the list, update its pin in the same commit, then make the
   `setup-status-core.mjs` change and add the ADR amendment.
8. Run the full checks, then `pnpm eval <suite> verify` in report mode for all suites.
9. Before the next release, re-record the stale suites with fresh agent sessions, per each suite's
   README.

### Edge cases

- **No configuration, a transitional JSON source, or a precondition diagnostic:** the existing
  Targeted precondition stops without mutation and points to the full setup. The pilot is not
  reachable before a first setup.
- **Unsafe runtime root or missing migration:** Targeted skips Step 1, which repairs the ignore
  state, and Step 6 item 6, the runtime migration. If the helper fails closed with
  `UNSAFE_RUNTIME_ROOT` (`pilot-measurement-core.mjs` about 468–471) or `MIGRATION_REQUIRED` (about
  472–476), the action step or state answer reports the error code, sends nothing further, and points
  to the full `setup`. A configuration write that already happened stays as it is.
- **Key already `true`, request "start the baseline":** nothing is written and no confirmation is
  asked for the key. The action step runs after the fresh read and offers what `inventory` allows.
- **Key already `true`, a refused operation next to an action** ("use sonnet for fast and start the
  baseline"): the model operation is refused, and the _pilot action_ is still valid and reaches the
  action step. If the request holds no valid operation at all, the step is not reached.
- **Key `invalid` or `false`, request "start the baseline":** the implied opt-in question shows the
  recorded value (`invalid – runs as Quality`, or `false` named as an earlier explicit decision) with
  `Enable` pre-selected. Nothing is written without confirmation. `Keep`, `Disable` or a declined
  confirmation offers no action.
- **Mixed request with a stop on another key:** the stop ends the run under Targeted's existing
  rules, and the action step is not reached, even when the Fast key was already `enabled`.
- **State `baseline`, `active` or `review`:** the action step reports the state and offers nothing.
- **`inventory` reports a busy cause:** the action step reports it and offers nothing.
- **Bare "fast":** one question, Fast pilot or review profile. The answer decides the operation.
- **Mixed request** (for example Fast plus `delivery.prReview`): one preview and one confirmation for
  all keys, then the action step.
- **Disable request:** writes `false` after confirmation, offers no action, and deletes no stored
  generation or evidence.
- **Hidden source:** the write goes through the hidden local-file path, and the action step uses the
  same `RUNTIME_STATE_ROOT`.
- **Non-interactive run:** previews only, writes nothing, and makes no `inventory` or `protocol` call,
  except for a read-only state question.
- **`begin-baseline` failure or lost response:** the existing fragment rule applies: re-read
  `inventory` and never re-send `begin-baseline`.

## Acceptance criteria

- [ ] `src/shared/setup-targeted-change.md` no longer contains the
      `executionProfiles.fast.enabled` → `setup guided` redirect. It contains an owner-table row and a
      `lazy-include` for `setup-execution-profiles` with a Targeted `when:`. A contract test asserts
      both.
- [ ] `src/shared/setup-execution-profiles.md` admits Targeted in its opener, in the opt-in `ask`
      `when:`, in the pre-selection rule and in the generation-action gate. Contract tests assert each
      gate condition as text: interactive run; write step finished, or nothing written because rows
      match; fresh read `enabled`. Another test asserts that `Baseline`/`Resume` are never pre-selected.
- [ ] The Targeted fragment contains the bare-"fast" two-option question (Fast pilot vs.
      `review.profile`). A contract test asserts it.
- [ ] The Targeted fragment defines the _pilot action_ and _pilot state question_ operation kinds. It
      contains the implied opt-in question (`Enable` pre-selected, a recorded `false` named), the
      stop-wording question (`Disable` or unchanged), the per-operation refusals (`begin-review`,
      `discard-generation`, measurement edits, model or provider names), the state answer's
      non-interactive exception, and the Summary reason list. A contract test pins each as text.
- [ ] `src/shared/setup-advanced-settings.md` still excludes Targeted from Block 10 through itself,
      and the Targeted fragment holds the only Targeted `lazy-include` of `setup-execution-profiles`.
      A contract test asserts both.
- [ ] Block 10's "Enable … no baseline starts" description and the ADR's "enabling starts no
      baseline" wording are unchanged. The existing pins pass unmodified.
- [ ] The Step 0 keyword list in `src/tools/setup.md` is unchanged, and the existing "seven keyword
      forms" tests pass unmodified.
- [ ] Every sentence listed in "Affected files" for `src/tools/setup.md` (lines about 2, 19 and
      101), the Targeted Write paragraph, `config-migration.md`,
      `pilot-measurement-workflow.md`, `execution-profiles.md`, the ADR, and the user and developer
      guides names both setup entries. Each one's test pin, where one exists, is updated and passes.
- [ ] `test/setup-status-core.test.mjs` expects a Targeted remediation, not `setup guided`, for an
      invalid Fast key.
- [ ] No `src/tools/*` file other than `setup.md` loads `setup-execution-profiles`, and the existing
      test still passes.
- [ ] The full project check (`pnpm test` plus format and build, run through `t3-project`) passes.
- [ ] `pnpm eval <suite> verify` in report mode lists the stale suites, and the PR description names
      them as release-blocking re-record debt.

## Validation plan

- Run the repository's test, format and build checks through `t3-project`, following
  `/opt/t3-project-runtime/INSTRUCTIONS.md`.
- Run `pnpm eval <suite> verify` in report mode for `merge-gate`, `iterate`, `next-steps`,
  `build-context` and `focus`, and record which suites are stale.
- Manual check on the built skill in a scratch repository with a project setup ADR:
  - `setup fast` → the Fast pilot / review profile question → Fast pilot → opt-in question with
    Enable pre-selected → confirm → the `Baseline` ask with digest, disclosure and no pre-selection;
  - `setup start the Fast pilot baseline` with the key already `true` → no write, only the action
    step;
  - `setup disable the Fast pilot` → writes `false`, no action step;
  - `setup is the Fast baseline running?` → state report, nothing written;
  - a non-interactive run → preview only, no helper call.

## Assumptions and open points

- Assumption: PR #704 merges with its current versions of the Block 10 fragment, the pilot workflow
  fragments and the `setup status` remediation. If the merge changes them, re-derive the line
  references; the design stays the same.
- Assumption: the stale-suite set is `merge-gate`, `iterate`, `focus` and `build-context`. The
  binding answer comes from `pnpm eval <suite> verify`, not from this plan.
- Deliberately not included: a separate `setup fast` keyword (owner decision: free text only), and
  Targeted access to `begin-review` or `discard-generation`.

## Plan review

**Result:** Approved

### Deep review (2026-11-22)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    1 |

- **Error cases, Important:** the action-step gate contradicted the edge cases, and a stop on
  another key was unspecified. Incorporated:
  - _pilot action_ is its own operation kind;
  - the qualifying no-write reasons are listed;
  - any stop suppresses the step;
  - the Summary reasons are extended.
- **Architecture, Important:** the read-only `inventory` answer conflicted with the non-interactive
  rule and with both fragments. Incorporated:
  - a _pilot state question_ kind, running Block 10's step 1 with its reporting rules;
  - failures are reported by error code;
  - the non-interactive rule names the exception.
- **Architecture, Important:** the implied opt-in had no defined question. Incorporated per the
  owner's decision: the opt-in question with `Enable` pre-selected, naming a recorded `false`. The
  ADR and Block 10 wording stay verbatim.
- **Maintainability, Important:** two pinned Targeted claims were missing: the "only write path" and
  the `setup.md` description and summary. Added to "Affected files" and the criteria.
- **Testability, Important:** several new behaviours had no criterion. Text-pin criteria added.
- **Error cases, Note:** `MIGRATION_REQUIRED` was not covered. Added to the edge case and routed to
  the full `setup`.
- **Maintainability, Note:** there were two Targeted load paths to Block 10. Now there is only the
  direct `lazy-include`; `setup-advanced-settings.md` keeps excluding Targeted.
- **Error cases, Note:** two interpretation rules were incomplete. Now conflicting signals ask,
  "review" in a pilot request maps to the `begin-review` refusal, and the stop question offers
  `Disable` or unchanged.

### First review (2026-11-22)

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         1 |    1 |

#### Findings

All findings come from the 2026-11-22 review and have been incorporated into this revision.

- **Scope, Important:** the eval cost was stated as "at least `merge-gate` and `iterate`". `focus` and
  `build-context` are probably stale as well. Incorporated: the owner reconfirmed acceptance with
  four suites.
- **Error cases, Important:** reading a bare "fast" as the pilot was a guess, because
  `review.profile` accepts `fast`. Incorporated: per the owner's decision, a two-option question.
- **Architecture, Important:** three Block 10 points still excluded Targeted: the `ask` `when:`,
  "Pre-select `Keep`" and "no free text". Incorporated as Targeted adaptations.
- **Data protection, Important:** it was not stated that the invocation text is never consent for
  `begin-baseline`. Incorporated: the consent rule plus a contract-test criterion.
- **Maintainability, Important:** several pinned "Guided only" sentences were missing:
  - `setup.md` schema row;
  - `pilot-measurement-workflow.md`;
  - `execution-profiles.md`;
  - developer guides;
  - `getting-started.md`;
  - their tests.
    Incorporated into "Affected files".
- **Testability, Note:** the acceptance grep was not a reliable check. Replaced by the explicit
  sentence list.
- **Error cases, Note:** an `UNSAFE_RUNTIME_ROOT` failure without Step 1 was not covered. Added as an
  edge case that routes to the full setup.
- **Error cases, Note:** the action-step gate was loose. It now requires a fresh read, the
  rows-match-only reason, and no helper call in non-interactive runs.
- **Maintainability, Note:** the `fastProfile` remediation may simply fall through to the generic
  Targeted entry. Incorporated as a check-first step.
- **Scope, Note:** stop/pause wording and state questions were undefined. Now: a focused question and
  a read-only `inventory` answer.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-22
**Workflow:** effective-flow build (inline Quality; delegated isolation unavailable under current policy)
**Base:** `origin/develop` at `db287090` (PR #704 merged)

### Implementation

- Targeted `setup` now serves `executionProfiles.fast.enabled` through Block 10. The changes:
  - the Targeted fragment has an owner-table row and its own `lazy-include` of
    `setup-execution-profiles`;
  - two new operation kinds, _pilot action_ and _pilot state question_;
  - the implied opt-in question;
  - questions for a bare "fast", conflicting signals, and stop wording;
  - per-operation refusals;
  - the gated action step after the write, and Summary reasons.
- `setup-execution-profiles.md` admits Targeted in four places: the opener, the opt-in ask,
  pre-selection (a _set_ uses the requested answer, an _ask_ uses `Keep`), and the generation-action
  gate. The consent rule is now explicit: `Baseline`/`Resume` are never pre-selected, and the
  request text is never consent.
- The "Guided only" claims are rewritten in `setup.md`, `config-migration.md`,
  `pilot-measurement-workflow.md`, `execution-profiles.md` and `setup-advanced-settings.md`.
- `setup-status-core.mjs`: the `fastProfile` special case is removed; the generic Targeted
  remediation applies. The now-dead `setup guided` form is removed from `SETUP_FORMS` and
  `setup-status.md`.
- No new keyword: the seven Step 0 forms are unchanged, and the `setup` core stays at 1584/1584
  lines.

### Documentation

- Updated:
  - `AGENTS.md`;
  - the ADR `risk-aware-model-tiering-pilot-policy.md`, with a dated 2026-11-22 amendment;
  - the developer guides `architecture.md`, `build-system.md`, `configuration.md` and
    `model-tiering-pilot-protocol.md`;
  - the user guides `configuration.md`, `getting-started.md`, `model-tiering-pilot.md`,
    `tool-flow.md` and `tools-setup.md`.
- No impact: `README.md`, `docs/user-guide/tools-deliver.md`, `docs/user-guide/tools-implement.md`
  and the other two pilot ADRs.

### Test results

- Phase 5 full run (valid, zero failures):
  - `pnpm agent:check`;
  - `pnpm test`: 6336 tests, 0 failures, 77 skipped;
  - `node build.mjs`;
  - `pnpm test:distribution`.
- Phase 7 final check, targeted over the delta since Phase 5:
  - 27 affected test files: 2423 tests, 0 failures;
  - `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution`: all passed.
- New contract tests pin the acceptance criteria in `test/workflow-contracts.test.mjs`. A new
  assertion in `test/setup-status-core.test.mjs` requires every `SETUP_FORMS` member to be produced
  by at least one remediation.
- Eval staleness (`pnpm eval <suite> verify --mode report`):
  - stale: `merge-gate`, `iterate`, `next-steps`, `focus`. Their reported changed inputs include
    scaffold files outside this change, so part of the staleness predates it.
  - `build-context`: no archived runs.
  - A re-record is owed before the next release.

## Review findings

**Date:** 2026-11-22
**Reviewer:** effective-flow-nodejs-reviewer (with a scoped re-check)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    14 |
| Open / Not implemented |     0 |

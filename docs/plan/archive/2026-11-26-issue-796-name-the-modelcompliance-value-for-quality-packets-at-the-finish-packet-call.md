# Name the modelCompliance value for Quality packets at the finish-packet call

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #796

## Requirement

When the Fast field pilot records a run but a packet runs Quality, the orchestrator must send `finish-packet` with `modelCompliance: "not-applicable"`. Sending `"unverified"` is rejected with `INVALID_PAYLOAD` and costs a second helper call. The cause is the shipped prose, not the helper:

- The `finish-packet` bullet in `src/shared/pilot-measurement-workflow.md` ("### Packet timing", lines 182–185) only says the call "adds the key `modelCompliance` with the packet's value from the `execution-profiles` delegation rule". It names no value and no condition.
- The owning rule in `src/shared/execution-profiles.md`, paragraph `**Delegation.**` (lines 318–330), lists the portable `verify` case, the native `unverified` case and the no-child `unverified` case first. Only its last sentence says that a packet not reserved as `fast`, or one whose `start-packet` carried `admission-changed`, reports `not-applicable`. The most common case, a measured run whose packets all run Quality, is easy to misread as `unverified` because nothing was verified.

Goal: an orchestrator reading either location picks the right value on the first call. The mapping stays stated once, in its owning fragment, as an ordered decision list that starts with the `not-applicable` case. The call site names only the decisive condition. Accepted values and helper behaviour stay unchanged.

Workflow rationale: Bugfix. The defect is wrong orchestrator behaviour (a rejected first `finish-packet` call) caused by product prose (`src/**/*.md` is shipped product source per `AGENTS.md`). A contract test that fails against the current prose reproduces it, which fits `effective-flow fix`'s failing-test-first step. It is not Documentation: guides under `docs/` are at most a follow-on sync.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #796.
**Original outcome:** The `modelCompliance` mapping exists exactly once, in `src/shared/execution-profiles.md`, as an ordered decision list that starts with `not-applicable`. The `finish-packet` call site names the `not-applicable` condition for packets not reserved as `fast`. A contract test pins that both agree. Accepted values and helper behaviour stay unchanged, except an optional, more specific error message.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** Prose restructure of one owning paragraph, one call-site condition, one contract test; optional helper message.
**Continuation decision:** None.

## Architecture decisions

- The owner stays `src/shared/execution-profiles.md` ("Delegation"). `pilot-measurement-workflow.md` keeps its pointer and gains one condition, not a second copy of the mapping (`AGENTS.md`, "Writing prompt text", point 2).
- The decision list mirrors the helper's `allowedModelCompliance` (`src/scripts/pilot-measurement-core.mjs:2087–2092`) in reading order: the `not-applicable` branch first, then the `fast` branches. The helper code is the ground truth; the prose must not introduce a value or case the helper does not accept.
- The `fast` branches keep today's wording and facts: portable Fast child → the `model-selection verify` value (`unverified` on an `INVALID_*` error); native Fast attempt → `unverified`; `fast` reservation with no child to verify (spawn rejected before any child started, or Quality from the first spawn after an unpersisted incident) → `unverified` on every build.
- The contract test lives in `test/execution-profile-workflow-contract.test.mjs`, which already reads both fragments and asserts on `flat(section(initialPhase, '**Delegation.**', '**Requirements check.**'))` (around line 2008).

## Affected files

| File                                                   | Description                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/execution-profiles.md`                     | Rewrite the `modelCompliance` sentences of the `**Delegation.**` paragraph as a short ordered decision list, `not-applicable` case first.                                                                                                                      |
| `src/shared/pilot-measurement-workflow.md`             | Extend the `finish-packet` bullet with the decisive condition: a packet not reserved as `fast`, or whose `start-packet` carried `admission-changed`, sends `not-applicable`; every other packet takes its value from the `execution-profiles` delegation rule. |
| `test/execution-profile-workflow-contract.test.mjs`    | Add a named-invariant contract test: the call site and the owning rule agree that a packet not reserved as `fast` sends `not-applicable`, and the owning list starts with that case.                                                                           |
| `docs/developer-guide/model-tiering-pilot-protocol.md` | Replace the full mapping restatement (lines 347–353) with one sentence naming the `not-applicable` condition plus a pointer to the `execution-profiles.md` "Delegation" rule; on line 483 replace "a Quality packet" with "a packet not reserved as `fast`".   |

## Implementation details

### Approach

1. Write the contract test first (fix workflow, failing-test step). It reads both fragments with the file's existing `source`, `flat` and `section` helpers and asserts:
   - owner: take the unflattened `section(initialPhase, '**Delegation.**', '**Requirements check.**')` slice, cut item 1 from the `/^1\. /m` match up to the `/^2\. /m` match, flatten only for the text checks, and assert that item 1 contains `not-applicable` and "not reserved as `fast`", that the slice's first `` `unverified` `` lies after item 1's end (`ordered()` alone cannot prove this, since it only follows first matches), and that the list numbers `[...slice.matchAll(/^(\d+)\. /gm)]` are exactly `1`, `2`, `3`, `4` (`ordered()` on plain `'1. '` substrings would neither anchor to list items nor pin the count);
   - call site: cut `section(timing, 'Call \`finish-packet\` once', '\n- ')`on the raw text (the bullet up to the next "- Validation, review…" bullet), apply`flat()`before every text check below, since the bullet wraps across indented lines, and assert that it names`not-applicable`together with "not reserved as`fast`" and `admission-changed`, matching owner item 1, and still names the `execution-profiles` delegation rule;
   - single source: the same flattened call-site slice contains none of `` `unverified` ``, `` `verify` `` or `` `model-selection` ``, so the `fast` entries are not restated there.
     The test title names the invariant, for example "finish-packet call site and execution-profiles agree on not-applicable for a packet not reserved as fast". Confirm it fails against the current prose.
2. In `src/shared/execution-profiles.md`, keep the `**Delegation.**` paragraph's spawn sentences unchanged and replace the `modelCompliance` sentences (from "Before `finish-packet`, …" to "… reports `not-applicable`.") with one lead sentence and an ordered list of four entries:
   1. not reserved as `fast` (selected `quality` at `start`), or its `start-packet` carried `admission-changed` → `not-applicable`;
   2. reserved as `fast`, Fast attempt started a child on a portable build → the `model-selection` `verify` value (`unverified` on an `INVALID_*` error);
   3. reserved as `fast`, native Fast attempt → `unverified`;
   4. reserved as `fast`, no child to verify (spawn rejected before any child started, or Quality from the first spawn after an unpersisted incident) → `unverified` on every build.
      The lead sentence says the first matching entry wins. Do not restate which packets are classified `quality` (`baseline`, `not-ready`, `profile-unavailable`, `correction-pass`): that classification is owned by `pilot-measurement-workflow.md:129–131` and `:156–158`, and the helper decides on the reserved profile, the receipt's `fallback` and the install kind, never on which packets ran Quality. Define entry 1 only by the reserved profile and the `admission-changed` receipt, never by "ran Quality": entry 4 also runs Quality yet must send `unverified`. Do not name a pilot that is "not active": a generation other than `baseline` or `active` reserves nothing (`pilot-measurement-workflow.md:75`), so no `finish-packet` is sent. Keep the existing technical terms verbatim (`start-packet`, `admission-changed`, `model-selection` `verify`, `INVALID_*`) so existing assertions and readers keep matching.
3. In `src/shared/pilot-measurement-workflow.md`, keep the bullet's existing clause "`modelCompliance` with the packet's value from the `execution-profiles` delegation rule" unchanged and append one sentence stating the full entry-1 condition, for example: "A packet not reserved as `fast`, or whose `start-packet` carried `admission-changed`, sends `not-applicable`." The `admission-changed` half is named because the `start-packet` bullet directly above (`pilot-measurement-workflow.md:179–181`) re-sends a `fast` packet with that fallback, and such a packet still looks `fast` to the orchestrator (decided by score; see "Assumptions and open points"). The clause must stay because `FRAGMENT_KEYS` in `test/execution-profile-workflow-contract.test.mjs:108–113` extracts the documented `finish-packet` keys between "Call `finish-packet` once" and "with the packet"; dropping that phrase makes `section()` throw. No `fast` entry of the list is repeated at the call site.
4. In `docs/developer-guide/model-tiering-pilot-protocol.md`, replace the restatement from "Before `finish-packet`, a portable Fast packet …" to "… a packet not reserved as `fast` reports `not-applicable`." (lines 347–353) with one sentence: a packet not reserved as `fast`, or whose `start-packet` carried `admission-changed`, reports `not-applicable`, and every other value follows the ordered list in `src/shared/execution-profiles.md` "Delegation". Leave the JSON protocol mirror between the guide's protocol markers (lines 26–32, read by `parsePilotMeasurementDocumentationProjection` in `build.mjs:1370–1382`) unchanged. The value definitions at lines 478–485 stay as metric semantics on purpose, with one wording fix: on line 483 change "`not-applicable` for a Quality packet" to "`not-applicable` for a packet not reserved as `fast`", because a `fast` reservation with no child also runs Quality yet records `unverified`. No test reads this prose; `test/build-lib.test.mjs` reads only the marker block.
5. Run `pnpm format`, then CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. Both fragments are reached only through ` ```lazy-include ` pointers (`src/shared/build-delegated-run.md`, `src/tools/fix.md`, `src/tools/refactor.md`), so no `contextBudget:` line should change; confirm in the `Always-loaded core (lines/budget)` report of `node build.mjs`.
6. Run `pnpm eval <suite> verify` for all five suites (`merge-gate`, `iterate`, `next-steps`, `build-context`, `focus`). Eval suite identity covers every fragment a gate can reach through a lazy-include pointer (`evals/_scaffold/build-identity.mjs:220–235`), and recorded `next-steps` evidence already hashes both fragments (`evals/next-steps/continuation-evidence/2026-10-22/current-source/manifest-projection.json.txt:27` and `:34`). Report the resulting freshness debt in the delivery and handle it per `docs/adr/pragmatic-test-release-policy.md`; recording new evidence is not part of this change.

### Component structure

Not relevant: two prose fragments and one test file, no component structure.

### State management

Not relevant: no runtime state, schema or helper behaviour changes.

### API integration

Not relevant: the `pilot-measurement.mjs` CLI contract and the `modelCompliance` enum (`src/scripts/pilot-measurement-protocol.mjs:332`) stay unchanged.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- `fast` reservation with an `admission-changed` receipt: entry 1, `not-applicable`. This matches the helper and the existing test at `test/pilot-measurement-adoption.test.mjs:2659–2665`.
- `fast` reservation, Fast spawn rejected before a child started: entry 4, `unverified`, never `not-applicable`. The helper rejects `not-applicable` here.
- Native `fast` packet: entry 3; the helper accepts only `unverified` (`test/pilot-measurement-adoption.test.mjs:2699–2726`).
- A retried `finish-packet` on an already finished receipt: a value never allowed for that packet gets `INVALID_PAYLOAD` (the allowed-value check runs first, `pilot-measurement-core.mjs:3544–3555`), a different allowed value gets `INVALID_STATE`; the prose change does not touch either.
- `build.mjs` validates the closed tables of `execution-profiles.md` (`parseExecutionProfileContract`, `assertPilotMeasurementPolicyProjection`). The edit touches prose outside those marked tables and must keep them byte-identical.

## Acceptance criteria

- [ ] `src/shared/execution-profiles.md` states the `modelCompliance` mapping once, inside the `**Delegation.**` paragraph, as an ordered list of four entries whose first entry maps a packet not reserved as `fast` (or with an `admission-changed` `start-packet` receipt) to `not-applicable`.
- [ ] The `finish-packet` bullet in `src/shared/pilot-measurement-workflow.md` names `not-applicable` for a packet not reserved as `fast` or whose `start-packet` carried `admission-changed`, keeps its pointer to the `execution-profiles` delegation rule, and repeats none of the `fast` entries.
- [ ] In `docs/developer-guide/model-tiering-pilot-protocol.md`, the restatement at lines 347–353 is one sentence naming the `not-applicable` condition plus a pointer to `src/shared/execution-profiles.md` "Delegation"; the value definitions at lines 478–485 remain as metric semantics with "a Quality packet" replaced by "a packet not reserved as `fast`"; the protocol marker block (lines 26–32) is byte-identical.
- [ ] No other file under `src/` states the `modelCompliance` mapping: a grep for `not-applicable` and `modelCompliance` under `src/shared/`, `src/tools/` and `src/agents/` hits only the owner list in `execution-profiles.md`, the call-site condition in `pilot-measurement-workflow.md`, the `verify` outcome in `src/shared/model-selection.md:59–63`, and the unrelated uses in `src/tools/autopilot.md` and `src/shared/setup-status.md`.
- [ ] `git diff` shows no change to `src/scripts/pilot-measurement-core.mjs` or `src/scripts/pilot-measurement-protocol.mjs`: the accepted `modelCompliance` values and the generic `INVALID_PAYLOAD` message stay as they are.
- [ ] The new contract test in `test/execution-profile-workflow-contract.test.mjs` names its invariant, fails against the pre-change prose and passes after the change.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass, and no `contextBudget:` line changes.

## Validation plan

- Run the new contract test alone against the unchanged prose and record its failure; rerun it after the edit and record the pass.
- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, in CI's order.
- Read the `Always-loaded core (lines/budget)` report of `node build.mjs` and confirm that no tool budget changed.
- Manually trace each of the four list entries against `allowedModelCompliance` in `src/scripts/pilot-measurement-core.mjs` and against the existing helper tests in `test/pilot-measurement-adoption.test.mjs`.
- Confirm that the existing `FRAGMENT_KEYS` payload-key test in `test/execution-profile-workflow-contract.test.mjs` still extracts `modelCompliance` for `finish-packet`.
- `pnpm eval <suite> verify` (read-only) for all five suites; record which suites report freshness debt from the two edited fragments.

## Assumptions and open points

- Verified: no `contextBudget:` budget includes these fragments eagerly; both are lazy-included from `src/shared/build-delegated-run.md` (lines 174 and 179), `src/tools/fix.md` (247 and 252) and `src/tools/refactor.md` (257 and 262).
- Verified: no existing test asserts the `INVALID_PAYLOAD` message text; tests check `error.code` only.
- Verified: `src/shared/model-selection.md:59–63` only says that an `INVALID_*` error from `verify` records `unverified`, which matches entry 2; it needs no change.
- Verified: a `profile-unavailable` packet is re-reserved as `quality` at `start` (`pilot-measurement-workflow.md:156–158`), so entry 1 covers it; entries 2–4 match `allowedModelCompliance`.
- Expected: editing the two fragments creates behavioural eval freshness debt (at least `next-steps`), because suite identity follows lazy-include reachability; the change does not record new evidence.
- Assumption: the ADRs (`docs/adr/risk-aware-model-tiering-pilot-policy.md`, `docs/adr/per-spawn-model-tiers.md`) record decisions, not this wording, and need no change.
- Decided: the helper keeps its generic `INVALID_PAYLOAD` message (issue proposal 3 not taken). The prose is the root cause and the helper contract tells orchestrators to act on the stable error code; a per-call message would extend `PilotMeasurementError` for a case the corrected prose already prevents. Alternative close behind: a specific message naming `not-applicable`.
- Decided: the developer guide's full restatement is replaced by a pointer plus the `not-applicable` condition, which removes the duplicate instead of re-syncing it; the guarded protocol mirror stays untouched.
- Decided: the call site names the full entry-1 condition, including the `admission-changed` receipt, so a `fast` packet re-sent with that fallback (`pilot-measurement-workflow.md:179–181`, `pilot-measurement-core.mjs:2088`) is not misread. Alternative: naming only "not reserved as `fast`".

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Should the pilot helper's INVALID_PAYLOAD rejection of finish-packet name the expected modelCompliance value when a packet whose only accepted value is not-applicable sends another value?",
    "options": ["Keep the generic message", "Add a specific message naming not-applicable", "Name the accepted set for every modelCompliance rejection"],
    "scores": [
      { "label": "Keep the generic message", "score": 8, "reason": "The prose is the root cause and the plan fixes it, and the contract says to act on the stable code; unlike option 2, this adds no per-call message path to the constant ERROR_MESSAGES design." },
      { "label": "Add a specific message naming not-applicable", "score": 6, "reason": "Naming a closed enum value leaks no payload and helps recovery through error.message, but it means extending PilotMeasurementError and adding a test, for a narrow, optional gain once the prose is fixed." },
      { "label": "Name the accepted set for every modelCompliance rejection", "score": 4, "reason": "It goes past the optional proposal by also changing the portable and native fast messages, which widens the helper and test changes for little gain over the prose fix." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the implementing run treat the full restatement of the modelCompliance mapping in docs/developer-guide/model-tiering-pilot-protocol.md:347-353, which lists the not-applicable case last?",
    "options": ["Reorder the guide restatement to match the decision list", "Replace the guide restatement with a pointer plus the not-applicable headline", "Leave the guide unchanged"],
    "scores": [
      { "label": "Reorder the guide restatement to match the decision list", "score": 5, "reason": "Guard-safe since the projection reads only the JSON mirror at guide lines 26-32, but it keeps a second full copy of the mapping, against the 'exists exactly once' outcome, and it will drift again." },
      { "label": "Replace the guide restatement with a pointer plus the not-applicable headline", "score": 9, "reason": "Edits only prose outside the guarded mirror and matches the guide's pointers to execution-profiles.md; it beats reordering by removing the duplicate while keeping the often-misread not-applicable case." },
      { "label": "Leave the guide unchanged", "score": 3, "reason": "The measurement-contract guide would keep listing not-applicable last, the order the issue calls misleading, plus a second full mapping, so the outcome holds only on a narrow src-only reading." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Which condition should the new sentence at the finish-packet call site in src/shared/pilot-measurement-workflow.md name for sending modelCompliance not-applicable?",
    "options": ["Name only not reserved as fast", "Name the full entry-1 condition including admission-changed"],
    "scores": [
      { "label": "Name the full entry-1 condition including admission-changed", "score": 8, "reason": "Matches the owning rule in execution-profiles.md:329-330 and covers the admission-changed fallback from the bullet directly above, which the helper enforces; only the state-a-contract-once rule keeps it from a 9." },
      { "label": "Name only not reserved as fast", "score": 5, "reason": "Follows the issue proposal literally and is shortest, but reads as the whole condition, so an agent finishing a fast packet after the admission-changed re-send could send unverified, which the helper rejects." }
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
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         2 |    4 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    3 |

### Findings

- Error cases, Important (gap analysis, incorporated): entry 1 was defined partly by "ran Quality" and used a pilot that is "not active" as an example; a `fast` packet with no child also runs Quality yet must send `unverified`, and an inactive generation sends no `finish-packet`. Entry 1 is now defined only by the reserved profile and the `admission-changed` receipt.
- Testability, Important (gap analysis, incorporated): the first call-site wording dropped "with the packet", the end marker `FRAGMENT_KEYS` uses to extract the `finish-packet` keys. Step 3 now keeps that clause and appends the condition; the validation plan checks the key extraction.
- Testability, Important (gap analysis, incorporated): the plan assumed no eval evidence debt, but suite identity follows lazy-include reachability and `next-steps` evidence hashes both fragments. Step 6 now runs `verify` for all five suites and reports the debt.
- Testability, Note (gap analysis and internal review, incorporated): the contract-test assertions were not bounded, and `ordered()` cannot prove that no `unverified` precedes item 1. Step 1 now cuts item 1 from the unflattened slice and bounds the call-site slice at the next bullet.
- Scope, Note (gap analysis, incorporated): the single-statement grep would always hit `src/shared/model-selection.md` and skipped `src/agents/`; the criterion now names the expected hits.
- Error cases, Note (gap analysis, decided by score): the call-site condition omitted the `admission-changed` half of entry 1; it now names the full condition.
- Maintainability, Note (gap analysis, incorporated): the call-site line reference was stale; corrected to lines 182–185.
- Maintainability, Note (internal review, incorporated): entry 1's parenthetical restated the `quality` classification owned by `pilot-measurement-workflow.md`; it is now "selected `quality` at `start`" with no list.
- Maintainability, Note (deep review, incorporated): the guide's value definitions (lines 478–485) also called `not-applicable` the value "for a Quality packet"; step 4 now rewords that line and the criterion no longer claims the guide holds no per-value text.
- Testability, Note (deep review, incorporated): the call-site checks did not flatten the wrapped bullet; step 1 now applies `flat()` before every call-site text check.
- Testability, Note (deep review, incorporated): `ordered()` on `'1. '` substrings neither anchors to list items nor pins the count; step 1 now matches `^(\d+)\. ` list numbers and requires exactly 1–4.
- Error cases, Note (deep review, incorporated): the plan said the helper decides on the reserved profile alone and that a retried finish always yields `INVALID_STATE`; it now names the receipt `fallback` and install kind, and distinguishes `INVALID_PAYLOAD` for a disallowed retry value.

## Open points

- No open points.

# Merge-gate delegation envelope helper

**Plan status:** Implemented
**Source:** effective-flow plan-issue (#429)
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Today `merge-gate` writes the delegation message it sends to `iterate` by hand, and nothing checks
the finished message before it goes out. `src/tools/merge-gate.md` ("Delegation contract") also
gives no literal syntax or position for two gate-authored values: the run state and the resolved
languages. That gap caused the thread-only failure reported in #429: gate-authored run-state,
language and return-protocol text landed below `--- caller-supplied item text follows ---`, and
`iterate` correctly answered `ABORT: manifest and body mismatch`. The defect is on the sender side.

The fix builds the envelope from structured input on the sender side, binds it to a digest, and
validates it. The receiver keeps its strict prose parser.

1. **New runtime helper `delegation-envelope`.** A dependency-free pair:
   `src/scripts/delegation-envelope.mjs` (thin JSON CLI) over
   `src/scripts/delegation-envelope-core.mjs` (pure, importable logic), registered in
   `RUNTIME_SCRIPT_FILES` in `build.mjs`. It follows the existing helper convention
   (`remote-tracker*.mjs`, `delivery-selection*.mjs`):
   `node <skill-root>/scripts/delegation-envelope.mjs <operation>`, one JSON object on stdin, one
   JSON envelope on stdout, `cwd` set to the verified `RUNTIME_STATE_ROOT`. Input never travels as
   command-line arguments.

   **`build`** takes structured input:
   - the control values `summaryComment`, `reviewGuard`, `nextSteps`, `runState` and
     `languageContext`;
   - an ordered `threadItems` list (`durableKey`, `threadId`);
   - an ordered `bodyItems` list (`durableKey`, `reviewId`, `author`, `url`, `text`);
   - an optional gate-authored CI-repair `instruction`;
   - the PR number and the round number.

   It then:
   - **Identifiers.** Mints each item's stable identifier with `node:crypto`: at least 32
     characters, `A`–`Z0`–`9`, unique in the message. Returns an identifier → durable-key map, which
     the gate records in its wisdom file before dispatch. The gate no longer hand-mints identifiers.
   - **Item filter.** Derives `Item filter:` itself: `threads=<thread IDs in threadItems order>`, or
     `free-text-only` when there are no threads.
   - **Boundary token.** Mints the token the same way and redraws it until a substring search finds
     it in no caller-supplied value. The token is checked against nothing else.
   - **Manifest safety.** Any manifest-carried value (`threadId`, `reviewId`, `author`, `url`) that
     contains a line terminator (`\n`, `\r`, U+2028, U+2029) or the string `" | "` is a
     sender-contract error, not a refusal; so is a `threadId` containing `,`. The implementation
     is deliberately stricter (decided during the build review): it also rejects `|` anywhere,
     leading or trailing whitespace, VT, FF, U+0085, U+001C–U+001E, other control characters and
     bidi or zero-width format characters, and restricts `threadId` to `[A-Za-z0-9_\-:.=/+]`. Ids
     may arrive as JSON integers and are normalized to strings; input that is not well-formed
     Unicode is `INVALID_PAYLOAD`.
   - **Refusals.** Refuses a body item whose text contains the delimiter line (compared per line
     after trimming) or is empty or whitespace-only. Refused items come back in a structured
     `refused` list. The delimiter case keeps today's refuse-and-report-`unassessed` behavior; an
     empty body keeps the gate-internal outcome Phase 3 step 5 already assigns. A body item whose
     review has no `url` or `author` is refused as `missing-provenance` and reported `unassessed`;
     no value is ever synthesized (added during the build review). A body refusal (`empty-body`,
     `delimiter`) takes precedence over `missing-provenance`.
   - **CI-repair instructions.** Refuses an instruction that contains a line which, after trimming,
     equals the delimiter or begins with `Item filter:`, `Summary comment:`, `Review guard:`,
     `Next steps:`, `Run state:`, `Language context:`, `Item:`, `Thread item:` or
     `Boundary token:`. The gate then reports that check as not auto-repairable and does not
     delegate it; the failed check still blocks the merge.
   - **Nothing left to delegate.** If refusals leave nothing to delegate, it reports that, writes no
     file and produces no message; the gate does not delegate.
   - **Serialization** in one canonical order:
     1. the six control lines, each exactly once, in this order: `Item filter:`,
        `Summary comment:`, `Review guard:`, `Next steps:`, `Run state:`, `Language context:`;
     2. the instruction (only when present);
     3. `Boundary token: <token>`;
     4. the manifest: every `Thread item:` line in `threadItems` order, then every `Item:` line in
        `bodyItems` order;
     5. the delimiter line;
     6. the body spans.

     Lines are joined with `\n`. The delimiter line is followed by `\n` only when at least one span
     follows. Spans are separated by `\n<token>\n`; nothing follows the last span. Body text is
     inserted verbatim (CR bytes included, never normalized). A span is the text strictly between
     those framing `\n`s. With zero `Item:` entries the message ends at the delimiter line.

   - **Self-check, file and digest.** Runs the structural checks of `validate` on its own output,
     then writes the message to
     `<RUNTIME_STATE_ROOT>/.effective-flow/merge-gate/<PR>-round<N>-<random>.txt` with a snapshot of
     the expected manifest structure beside it (same stem, `.json`). The write happens only after
     the runtime-state write-safety guard (`src/shared/runtime-state-safety.md`) passes for that
     target. The helper rejects symlinked parents (`.effective-flow`, `merge-gate`) and never
     overwrites (exclusive create). It returns the path and the sha256 digest of the message file.

   **`validate`** takes the message path and the digest. It first recomputes the file's sha256 and
   requires it to equal the digest, so text added to or changed in the message after `build` fails
   here. It then runs the text-only structural checks against the snapshot:
   - split at the first delimiter;
   - above the delimiter, each of the six control keywords appears exactly once;
   - the `threads=` IDs equal the `Thread item:` thread IDs, in the same order;
   - the manifest equals the snapshot's;
   - below the delimiter, a split on the declared token yields exactly as many spans as there are
     `Item:` entries;
   - with zero `Item:` entries the region is empty;
   - (added during the build review) the snapshot must be self-consistent (`SNAPSHOT_INVALID`
     otherwise), and every line above the delimiter must equal the snapshot's recorded header lines
     byte for byte (`HEADER_MISMATCH`), so an extra, changed or dropped line above the delimiter
     fails even though the digest already binds the file.

   `validate` never scans the untrusted region for keywords. Failures come back as stable error
   codes with the offending position; nothing is repaired best-effort.

2. **Canonical syntax for the two missing values**, as two new control lines above the delimiter:
   - `Run state: gated` or `Run state: non-interactive`;
   - `Language context: source=<de|en>; documentation.user=<de|en>; documentation.technical=<de|en>; workflow=<de|en>; forge=<de|en>; git=<de|en>`,
     keys in exactly that order (all six artifact surfaces; `language.chat` is deliberately absent
     because `src/shared/chat-language.md` does not hand it down).

   `merge-gate` sends both lines in every delegation. `iterate` reads them only from above the first
   delimiter, and its list of recognized control keywords grows from four to six:
   - a duplicated keyword returns the existing `ABORT: duplicated control line`;
   - a malformed `Run state:` returns `ABORT: unparseable run-state switch`;
   - a malformed `Language context:` returns `ABORT: unparseable language-context switch`;
   - below the delimiter both lines are plain body text.

   `Run state:` governs every `iterate` decision that depends on interactivity: Phase 1.5 step 6
   (fail closed when the question cannot be asked), Phase 2.5 (approval) and the documentation-sync
   gate. `src/shared/documentation-sync-contract.md` defers to an explicit `Run state:` line and
   applies its chain rule only when the line is absent. `iterate` forwards
   `Run state: non-interactive` to its item runs only when its own effective run state is
   non-interactive; a gated run forwards no line, so each item run falls to the chain rule as before
   (decided during the build review, so sub-runs that cannot ask never receive `gated`).

   Missing-line fallbacks, defined explicitly:
   - no `Run state:` line: a run invoked with a delimiter is non-interactive, any other run is
     gated. The stale apply-review example in `iterate.md` (Phase 2.5 "e.g. by apply-review", and
     the Phase 0 step 8 reference) is dropped where it states the inference;
   - no `Language context:` line: `iterate` resolves the languages itself, as for interactive
     invocations.

3. **`iterate` defines an empty body region explicitly.** A region below the delimiter that contains
   only whitespace splits into **zero** spans. `build` never produces whitespace-only bodies, so
   this cannot hide a real item. Any other content with zero `Item:` entries still returns
   `ABORT: manifest and body mismatch`.

4. **`merge-gate` builds every `iterate` delegation through the helper**: Phase 2 step 3 (CI repair,
   zero items) and Phase 3 step 5 (threads, body findings, or both). The gate runs `build`, then
   `validate`, then dispatches the validated file's content as the entire argument, with nothing
   added before or after it, and sends no return-protocol text. The prose describing hand assembly
   and hand-minting of identifiers and tokens is replaced by a pointer to the helper; the receiver
   rules stated in prose stay the authoritative contract the helper implements. The message file
   and its snapshot are deleted once `iterate` has returned, or in the run's final cleanup after a
   sender stop.

5. **A sender-side failure is not an `iterate` round.** Any `build` or `validate` failure other than
   the item and instruction refusals, and a missing helper script, is an internal sender-contract
   error. The gate then stops the run before dispatch and reports the helper's error code, makes no
   remote write, records no `unassessed` outcome, does not fall back to hand assembly and does not
   retry (the helper is deterministic). The round counter advances only when a Phase 2 round starts
   or a Phase 4 return happens, never on a delegation, so "Round accounting" needs no edit. The stop
   is stated once, in the sender-error paragraph, and in the run's final report.

6. **Canonical examples** (thread-only envelope ending at the delimiter line, body-only envelope,
   mixed envelope, each showing the six-part order) go in a new `src/shared/` fragment that
   `merge-gate.md` references through a ` ```lazy-include ` pointer.

7. **Recorded rationale.** `docs/plan/archive/2026-08-20-iterate-return-outcome-record.md` rejected
   a helper `build`/`parse` pair for the _return_ path and said to revisit once the rule grows past a
   membership test. Outgoing envelope framing is past that (identifier and token minting, a
   collision search, per-kind span cardinality and position rules) and has demonstrably failed when
   reproduced by hand. Nothing forbidden by that plan comes back: no byte count, no introducer-line
   grammar, no whole-message check on the receiver. The helper hashes a file it wrote itself,
   compares strings, splits and counts, and runs on the sender only. Contract tests pin the helper
   to `iterate`'s stated rules. The return path stays prose-only.

## Architecture decisions

- Sender-side helper over a receiver change: `iterate` stays strict; its only new receiver rule is
  the whitespace-only zero-span region.
- Digest binding plus a structural snapshot, instead of re-supplying the structured input to
  `validate` (circular) or scanning the untrusted region (defeats the delimiter).
- `iterate` keeps its prose parser; no second parser is introduced on the receiving side.
- The helper mints every identifier and the boundary token; the gate records the returned
  identifier → durable-key map.
- Protocol-shaped CI-repair instructions are refused; the check is reported not auto-repairable
  and still blocks the merge.
- Sender-side failure stops before dispatch without consuming a round.

### Helper interface (binding for both prose and code)

`build` stdin (JSON object):

```json
{
  "cwd": "<RUNTIME_STATE_ROOT>",
  "pr": 42,
  "round": 1,
  "summaryComment": "suppressed",
  "reviewGuard": "established",
  "nextSteps": "suppressed",
  "runState": "gated",
  "languageContext": {
    "source": "en",
    "documentation.user": "en",
    "documentation.technical": "en",
    "workflow": "en",
    "forge": "en",
    "git": "en"
  },
  "threadItems": [{ "durableKey": "<forge thread id>", "threadId": "<forge thread id>" }],
  "bodyItems": [
    {
      "durableKey": "<review id>#<ordinal>",
      "reviewId": "…",
      "author": "…",
      "url": "…",
      "text": "…"
    }
  ],
  "instruction": "optional CI-repair free text"
}
```

`build` success result: `{ ok: true, operation: "build", result }` where `result.status` is one of
`written` (with `path`, `snapshotPath`, `digest` as `sha256:<hex>`, `identifiers` as an ordered
list of `{ identifier, kind: "thread" | "body", durableKey }`, and `refused`),
`nothing-to-delegate` (with `refused`, no file written) or `instruction-refused` (with the offending
line position, no file written). `refused` entries carry `durableKey` and a `reason` of `delimiter`,
`empty-body` or `missing-provenance`.

`validate` stdin: `{ "cwd": "<RUNTIME_STATE_ROOT>", "path": "<message path>", "digest": "sha256:<hex>" }`.
Success: `{ ok: true, operation: "validate", result: { path, digest, items, threadItems } }`.

Failures of either operation: `{ ok: false, operation, error: { code, message, position? } }` with a
non-zero exit code. Stable codes (implementation may add, never rename): `INVALID_PAYLOAD`,
`INVALID_CWD`, `UNSAFE_MANIFEST_VALUE`, `UNSAFE_TARGET` (symlinked parent, existing target, path
outside the runtime directory), `DIGEST_MISMATCH`, `SNAPSHOT_INVALID`, `DELIMITER_MISSING`,
`CONTROL_LINE_MISSING`, `CONTROL_LINE_DUPLICATED`, `FILTER_MISMATCH`, `MANIFEST_MISMATCH`,
`SPAN_COUNT_MISMATCH`, `REGION_NOT_EMPTY`. The build added `CONTROL_LINE_MISMATCH`,
`TOKEN_MISMATCH`, `HEADER_MISMATCH`, `SELF_CHECK_FAILED` and `INTERNAL_ERROR`.

## Affected files

- `src/scripts/delegation-envelope.mjs`, `src/scripts/delegation-envelope-core.mjs` (new).
- `src/shared/delegation-envelope-examples.md` (new): the three canonical envelopes.
- `build.mjs`: `RUNTIME_SCRIPT_FILES` registration and `CONTEXT_BUDGET_LINES` (re-measured).
- `src/tools/merge-gate.md`: "Delegation contract" (identifier and token minting moves to the
  helper; canonical order, the two new control lines, helper calls, refusals, sender-contract error,
  file cleanup; "four" becomes "six"); "Returned outcome record" where it says "fifth control line";
  Phase 2 step 3 (CI repair through the helper plus the instruction refusal); Phase 3 step 5
  (through the helper); the wisdom-file record takes the identifier map; the Rules summary.
- `src/tools/iterate.md`: Phase 0 step 5 (six keywords, the two new lines with their aborts, the
  missing-line fallbacks, the whitespace-only zero-span rule; "four" becomes "six"); Phase 0 step 8
  apply-review example; Phase 1.5 step 6; Phase 2.5; language resolution; the Rules summary.
- `src/shared/documentation-sync-contract.md`: defers to an explicit `Run state:`.
- `test/delegation-envelope.test.mjs` (new); `test/workflow-contracts.test.mjs` (the "four control
  lines" assertions become six; new contract assertions); `scripts/distribution-smoke.mjs`
  (the new scripts in every target).
- `docs/developer-guide/`: the runtime-script inventory wherever `delivery-selection` and
  `remote-tracker` are listed, and the merge-gate → iterate handoff note in `architecture.md`.
- `evals/merge-gate/results/`: re-recorded rounds, because the build identity binds the whole
  transitive load closure of `merge-gate`.

## Edge cases

- **Delimiter in a body item:** refused and reported `unassessed`, as today. A body containing any
  control line (the two new ones included), a manifest line or a `Boundary token:` line is delivered
  byte for byte.
- **Empty-bodied review:** never delegated; keeps its gate-internal outcome.
- **Body findings without threads:** `Item filter: free-text-only`, never an empty `threads=` list.
- **CI repair:** zero items, a gate-authored instruction above the delimiter, an empty region. An
  instruction carrying protocol-shaped lines is refused and the check reported not auto-repairable.
- **Manifest values from outside the gate** with line terminators or separators: a sender-contract
  stop, never a trusted-region injection.
- **Line endings:** CRLF bodies, trailing newlines and multibyte Unicode are inserted verbatim and
  compared as strings, never by byte offset.
- **Concurrent gate runs:** random file-name component, no overwrite.
- **Missing lines:** explicit fallbacks above. A message without a delimiter keeps its legacy
  behavior.
- **Helper missing from the installed build:** sender-contract stop before dispatch, never a
  fallback to hand assembly.

## Acceptance criteria

- [x] `src/scripts/delegation-envelope.mjs` and `-core.mjs` exist, are listed in
      `RUNTIME_SCRIPT_FILES`, import only Node built-ins, and read input from stdin only.
- [x] A distribution assertion checks that `scripts/delegation-envelope*.mjs` exist in
      `dist/claude`, `dist/codex` and `dist/portable/effective-flow`.
- [x] The canonical examples fragment contains a thread-only envelope ending at the delimiter line
      with nothing below it, a body-only envelope and a mixed envelope; `merge-gate.md` points to it
      lazily.
- [x] `Run state:` and `Language context:` have the literal syntax above. Contract assertions check
      that `merge-gate.md` requires both above the delimiter in every delegation, and that
      `iterate.md` parses them only from above the first delimiter, states the duplicate, malformed
      and missing behavior, applies `Run state:` to Phase 1.5 step 6, Phase 2.5 and doc-sync, and
      resolves languages from `Language context:` when present.
- [x] Contract assertions check that `merge-gate.md` states: both delegation sites go through
      `build` then `validate`; the dispatched argument is the validated file's content with nothing
      added; a failure or a missing helper stops before `iterate` is invoked, with no remote write,
      no `unassessed` classification and no change to the round counter; the file is deleted after
      return or cleanup.
- [x] `iterate` keeps `ABORT: manifest and body mismatch` for every non-whitespace region whose span
      count differs from its `Item:` count; the only new receiver rule is that a whitespace-only
      region counts as zero spans.
- [x] `test/delegation-envelope.test.mjs` covers at least the 21 regression cases of the planning
      comment on #429 (thread-only pass; several threads pass; appended control/return text fails on
      digest; text after the last span fails on digest; hand-crafted thread-only text with non-empty
      region fails; one body/one span pass; one body with zero or two spans fails; mixed pass; body
      with control-line text delivered byte for byte; body with delimiter refused; empty or
      whitespace-only body refused; nothing-to-delegate reported and no file written; token collision
      redrawn; duplicated control line fails; `threads=` out of order fails; protocol-shaped
      instruction refused; unsafe manifest values are sender-contract errors; CRLF and
      trailing-newline bodies pass byte for byte; identifiers unique and `[A-Z0-9]{32,}` and mapped;
      existing target or symlinked parent rejected; `build` output always passes `validate`).
- [x] In `test/workflow-contracts.test.mjs` the existing "four control lines" assertions are updated
      to six; the assertion that the return path adds no control line of its own keeps its meaning;
      new prose avoids the phrasing rejected by the existing negative regex.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
      `CONTEXT_BUDGET_LINES` for `merge-gate`, `iterate` and any tool whose built size changes is
      re-measured from the build report, with at most ten lines of headroom.

## Validation plan

1. `pnpm agent:check` (oxfmt check).
2. `pnpm test` (unit and contract suites, including `test/delegation-envelope.test.mjs` and the
   merge-gate eval assertions over re-recorded rounds).
3. `node build.mjs` (build guards, including the always-loaded budget report).
4. `pnpm test:distribution` (isolated build/archive/delivery smoke, including the new script
   presence assertion).

## Assumptions

- One copy step remains: the file content goes into the dispatch argument; the prose rule "file
  content, nothing before or after" covers it, and `iterate`'s strict mismatch check stays the
  backstop.
- The return path stays prose-only, as the archived outcome-record plan decided.
- Reusing the `Run state:` literal in `src/shared/merge-gate-conflict-resolution.md` is out of scope.
- No dedicated Forgejo or Codex regression is needed; the envelope is provider- and
  harness-independent.

## Plan review

**Result:** Approved (reviewed and approved in the canonical planning comment on #429).

## Open points

- No open points.

## Implementation details

- **Helper.** `src/scripts/delegation-envelope-core.mjs` holds the pure logic (`executeOperation`,
  `buildEnvelope`, `validateEnvelope`, `validateStructure(text, snapshot)`, `mintToken`, the line
  formatters and the stable constants); `src/scripts/delegation-envelope.mjs` is the thin stdin/stdout
  CLI. Identifiers and the boundary token are 40 characters of `A`–`Z0`–`9`, each redrawn while it
  occurs in any caller-supplied value or overlaps an earlier draw. Files are created exclusively
  (`O_CREAT|O_EXCL|O_NOFOLLOW`, mode 0600), parents are re-checked after the write, and reads use
  `O_NOFOLLOW|O_NONBLOCK` with an `fstat` type check. The snapshot records the exact header lines
  above the delimiter (`HEADER_MISMATCH`) and must be self-consistent (`SNAPSHOT_INVALID`). Exit
  codes: 0 success, 2 payload/cwd/manifest errors, 3 `UNSAFE_TARGET`, 1 otherwise.
- **Review-driven tightening beyond the planning comment:** manifest values reject `|` anywhere,
  leading or trailing whitespace, control, bidi and zero-width characters and the extra line
  terminators VT, FF, U+0085 and U+001C–U+001E; `threadId` is restricted to `[A-Za-z0-9_\-:.=/+]`;
  ids may be JSON integers; malformed Unicode is `INVALID_PAYLOAD`; a body whose review has no `url`
  or `author` is refused as `missing-provenance` (a body refusal takes precedence).
- **merge-gate.** "Delegation contract" points to the helper: build, record the identifier map,
  validate, dispatch `iterate <PR>`, a line break and the validated file content verbatim, then
  delete the file pair after the return or in final cleanup. Refusals are recorded when the
  validated message is dispatched (or at once for `nothing-to-delegate`); a sender stop records
  nothing, writes nothing remotely and consumes no round. The minting and absence-check rationale
  moved to the lazy `src/shared/delegation-envelope-examples.md` together with the three canonical
  envelopes.
- **iterate.** Phase 0 step 5 recognizes six control keywords and reads a whitespace-only region as
  zero spans; new Phase 0 step 10 parses `Run state:` and `Language context:` with the duplicate,
  malformed and missing-line rules. `Run state:` drives Phase 1.5 step 6, Phase 2.5 and doc-sync;
  item runs receive `Run state: non-interactive` only when the effective state is non-interactive.
- **Budgets** (from the `Always-loaded core (lines/budget)` report): `merge-gate` 2865/2865,
  `iterate` 1752/1753; no other tool changed.
- **Eval evidence.** The merge-gate eval rounds were re-recorded against this build (round
  `mu6mycef-f1da7d01-bc7e-405e-9251-a42fe50dff87`, 25 fresh `codex exec` sessions, four slots retried
  for `cwd: null` call records) and published without behavioural findings.

## Test results

- `pnpm agent:check`: pass.
- `pnpm test`: 1007 tests, 1007 pass (`test/delegation-envelope.test.mjs` 52 tests covering the 21
  regression cases plus CLI, drift-guard and hardening cases; `test/workflow-contracts.test.mjs`
  updated from four to six control lines with new contract assertions).
- `node build.mjs`: pass.
- `pnpm test:distribution`: pass (the helper pair ships in `dist/claude`, `dist/codex` and
  `dist/portable/effective-flow` and completes a build/validate round trip in each).

## Review findings

**Date:** 2026-09-18
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer (three bounded rounds)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    31 |
| Open / Not implemented |     5 |

**External review report:** `.effective-flow/review/review-report-2026-09-18-plan-merge-gate-delegation-envelope-helper.md`

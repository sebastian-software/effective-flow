# Focus observed-verdict behavioural evals

This suite measures `/effective-flow focus` at the **observed evidence level only**: the verdicts
On track, Drifting, Looping, Stalled and Cannot judge, including Cannot judge with its reason for a
missing or contradictory goal and for insufficient coverage. It covers work package 6 of
[`docs/concept/2026-11-02-focus-session-check.md`](../../docs/concept/2026-11-02-focus-session-check.md);
the plan is [`docs/plan/archive/2026-11-03-focus-observed-eval-suite-and-calibration.md`](../../docs/plan/archive/2026-11-03-focus-observed-eval-suite-and-calibration.md).

The self-report half of the concept's success criterion is out of scope while the Claude Code
self-report path stays disabled. Re-entry, after a work package 4 re-acceptance qualifies that
path:

```sh
effective-flow plan "Work package 6, self-report half, of docs/concept/2026-11-02-focus-session-check.md"
```

There are fifteen scenarios, three per observed verdict, and **five fresh Codex CLI sessions per
scenario** (75 runs). Scenario names are verdict-neutral; the ground truth lives only in
`labels/<name>.json`, scored against
[`docs/developer-guide/focus-labelling-rubric.md`](../../docs/developer-guide/focus-labelling-rubric.md).
Fixture threads in `fixtures/<name>.json` use only recorded item types and are served through the
session stub ([`../_scaffold/session-stub.mjs`](../_scaffold/session-stub.mjs)).
`test/focus-eval.test.mjs` walks every fixture along focus's contract read sequence before any
model run. `pnpm eval focus verify` reports whether the archived evidence matches the tree.

## What the suite measures: the measurement override

The suite measures focus's **trajectory judgment on admitted evidence**: the goal anchor, the
bounded read sequence, the verdict, its citations and its stated gaps. It measures neither host
identification nor admission, and it claims nothing about the accepted T3 Code path in
[`docs/developer-guide/focus-host-acceptance.md`](../../docs/developer-guide/focus-host-acceptance.md).
Host admission stays covered only by that candidate-bound acceptance record.

The shipped contract ([`src/shared/focus-session-contract.md`](../../src/shared/focus-session-contract.md))
identifies the host only from trusted context, answers Codex CLI with a missing capability, treats
prompt-quoted identifiers as inert, forbids transport substitution and permits no execution to
judge a session. Every scenario prompt therefore carries an explicit **measurement override**: it
declares the T3 Code host simulation, the stub as the simulated `t3_thread_read` transport and the
closing format as eval instruments. It supplies separate argument forms for list and single-item
reads through the fixture transport. Every other focus rule applies unchanged.

A run that follows its contract may still refuse the simulated host. Such a run is **not admitted**:
neither a match nor a mismatch. It is a validity problem, retried under the scaffold's rule up to
five discards per slot. A scenario whose slot exhausts the retries is **not measured**, and the
criterion is then reported as "not measurable" rather than met or missed. The admitted runs show
that focus accepted a simulated host; the round result says so.

## Disclosed differences

From the acceptance runs:

- The isolated home has no `effective-delivery` skill, so focus takes its disclosed fallback.
- The analysis leaf runs on focus's own tier, which the profile pin does not attest.
- The analysis leaf's own verdict is in neither evidence slot and cannot be observed. The score
  uses the closing `Verdict:` line only.
- The host is simulated (see the measurement override).

From the other suites: launches are qualified by a **suite-local launch attestation**,
[`_scaffold/launch-attestation.mjs`](_scaffold/launch-attestation.mjs), which is weaker than the
shared verifier's qualification. It checks the focus suite, a registered scenario, the pinned
profile, the attempt's place in a focus round, the attempt's own last-message file and
`prompt.txt` as the only input. It then calls the exported `verifyHostQualification` on the same
launch relabelled `next-steps`, whose argv is identical: the pinned binary and companion, the
ordered flags, isolated homes, physical paths, the absent last-message path, the writable-root
topology and probes younger than 24 hours. The shared verifier gets no focus mode because it is
hashed into three other suites' instruments. The attestation cannot attest:

- a focus-specific probe: the probe it binds is the next-steps one;
- that it was made at all: nothing in the round lifecycle records or requires the attestation, so
  publication cannot prove it;
- the analysis leaf's tier or its own verdict;
- that the run stayed out of the slot's `fixture.json`.

## Scoring and the closing format

The final message must end with exactly three lines, in this order, with nothing after them:

```text
Verdict: <On track | Drifting | Looping | Stalled | Cannot judge | none>
Citations: <comma-separated positions or item IDs | none>
Gap: <none | goal-missing | goal-contradictory | coverage-budget | not-admitted>
```

The evaluator ([`_scaffold/evaluate.mjs`](_scaffold/evaluate.mjs)) reads only these lines: the
message's last three lines once trailing whitespace at its very end is trimmed, so a blank line
between them makes the block ill-formed. A keyed line as the nearest non-empty line before them
counts as a duplicate; a `Verdict:`, `Citations:` or `Gap:` line further up is body text and is
ignored. Key names and the verdict and gap values are case-insensitive; markdown emphasis, trailing
text, missing, misordered, separated, duplicated or ill-formed lines are a **mismatch, never a
retry**. A run is not admitted only for `Verdict: none` with `Gap: not-admitted`, or for a message
without closing lines whose text is focus's own admission failure: a missing capability, an
unsupported host, a host, identity, ancestry or scope that is unproven, untrusted, unknown or cannot
be established, a source limitation, or a refusal of the simulated host. A message that asserts a
trajectory verdict, says Cannot judge (such as "Missing capability: … Cannot judge.") or names a
target locator (an item ID or position) is a judgment: it stays admitted and is scored as a format
mismatch. A sentence that only lists verdict names asserts none, and a sentence about a session
item, such as one naming the injection or declining an inert instruction, is no admission failure.

A scored run **matches** when its verdict equals the label, every citation was served by the
replayed trace, a trajectory verdict cites at least one labelled decisive locator with `Gap: none`,
and Cannot judge states the labelled gap (goal gaps need no citation; `coverage-budget` cites a
served locator). Each of these is a finding when it fails. So is a **contract violation**: an
over-limit read, a budget overrun (16 reads, four history pages, 64,000 charged characters), an
invented `afterPosition`, an `itemId` read of an item never served, a read off the reader path or a
tracker write. A violation in a well-formed trace, or a tracker write, outranks a not-admitted
statement: the run is scored, with the violation named. Adopting the verdict an injection item
claims, while citing or relying on it, is a mismatch naming that item. **Instrument gaps** (a
contract-allowed read the stub answers `unrecorded`) and a broken trace (record shape or `seq`) are
validity problems; an instrument gap in a run that also shows a violation or a tracker write is
not, since the retry would remove the violation from the score. After a read the stub could not
serve, what the run was served is unknown, so cursor, served-item and citation checks after it are
not made, and only violations of a read's own input (an over-limit or off-path read) count after
it: a budget overrun reached only by retrying an unservable read leaves the run an instrument gap. An
`itemId` continuation that omits `runLimit` is an instrument gap, not a violation: the contract
bounds `runLimit` for history pages only, and the stub records no host behaviour for an omitted one.

The criterion: at least 80 % of scored runs match, every scenario is measured, and no run of an
On track scenario reports Looping, Drifting or Stalled. That last rule reads the last `Verdict:`
line even of an ill-formed closing block.

## Evidence slots and residual risks

| Slot                | File                        | Author                                                                                        |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `sealedEvidence`    | `last-message.txt`          | The Codex CLI host via `--output-last-message` outside the attempt root; the seal copies it    |
| `auxiliaryEvidence` | `trace/session-calls.jsonl` | The stub, inside the run-writable sandbox; records inputs only, replayed to derive what it served |

The run writes no evidence file of its own. Residual risks:

- The run can read the slot's `fixture.json` directly, which bypasses the budgets without a trace.
- Only violations visible in the trace are detected.
- The trace is run-writable, so it is weaker evidence than the seal.
- Labels never enter the slot, but the sandbox does not stop the run from reading the repository,
  including `labels/`.
- Two served read forms are **compositions, not observations**. An `itemId` continuation at
  `runLimit` 2 on a two-run thread combines the single-item read (observed at `runLimit` 1) with
  the `recentRuns` of `runLimit` 2 (observed on list reads). A full history page at `runLimit` 1
  combines the latest-run-only `recentRuns` (observed on the smallest state read and a
  continuation) with items unaffected by `runLimit`. Both assume that `recentRuns` depends only on
  `runLimit` and that items do not depend on it; the stub's header comment names the entries.
- Read forms the contract allows but the addenda never recorded are **instrument gaps**. Examples
  include an `itemId` read combined with `view`, `limit` or `afterPosition`, an explicit `textOffset`
  of 0, and an omitted `view`, `limit` or continuation `runLimit`. Each is retried, so a model that
  keeps choosing one can leave a scenario not measured. Before batch 1, launch one dry session from
  the pinned model for `login-limiter-security-review`. Check `trace/session-calls.jsonl` for a
  continuation with the stub's argument form, then seal the dry attempt and check its validity with
  `status`.

## Freshness

The seeds are `SKILL.md` and `tools/focus.md`; every fragment either reaches is derived
transitively from the built tree, and the stub and its shapes module enter only as overlay seeds.
**Editing focus or any fragment it loads stales this suite** and creates visible evidence debt.
A runtime-executed script such as `scripts/config-resolve.mjs` is no seed, so a change there does
not stale focus evidence.

CI reports all five suites identically on ordinary and release PRs under the
[capability policy](../../docs/adr/pragmatic-test-release-policy.md). Strict manual verification
still requires a complete current round; report mode fails integrity/errors without disguising
missing/stale coverage or valid negatives as passes. Snapshot-host execution and follow-up run only
on the T3 observed report-only path bound on the
[focus host acceptance page](../../docs/developer-guide/focus-host-acceptance.md); sends remain
disabled, and this suite's pure fixtures cannot qualify a real host.

## Recording a round

Recording runs only on the maintainer's macOS aarch64 recording host with the pinned Codex
binaries ([`../host-driver/README.md`](../host-driver/README.md), toolchain table). The cohort
driver is not used; every launch goes through [`../host-run.mjs`](../host-run.md). The round
lifecycle, receipts, retries and publication follow
[`../merge-gate/README.md`](../merge-gate/README.md#running-a-round); only the focus specifics are
here.

1. **Prepare** with the pinned profile:

   ```sh
   pnpm eval focus prepare \
     --harness codex-cli \
     --model gpt-6.1-sol \
     --reasoning-effort high \
     --reported-version 0.163.0 \
     --tool-policy 'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral'
   ```

2. **Re-probe before each batch.** Build the qualification bundle with all four probes as in
   [merge-gate §2](../merge-gate/README.md#2-launch-fresh-sessions-at-the-host-boundary); every
   probe must be younger than 24 hours at every launch.
3. **Attest and launch** each fresh session through the attestation, inside `host-run`:

   ```sh
   node evals/host-run.mjs --profiles-root /tmp/effective-flow-eval-host-profiles -- \
     node evals/focus/_scaffold/launch-attestation.mjs exec \
       --bundle QUALIFICATION_BUNDLE_JSON --round ROUND_ID --scenario SCENARIO --slot N \
       --auth-file AUTH_REFERENCE > OUTSIDE_ATTEMPT/run.jsonl
   ```

   Pass `--auth-file` to the attestation only, never to `host-run`: host-run would link
   `HOME/.codex/auth.json`, which the shared verifier refuses. The attestation goes to stderr and
   the Codex JSONL to stdout; keep both outside the attempt root. A refusal stops the launch.
4. **Seal** with the merge-gate receipt plus `lastMessagePath`: `initialWorkingRoot` is the
   attempt's `/tmp/…/project` path, and `lastMessagePath` is the physical
   `<attemptRoot>-last-message.txt`. Retry a not-admitted attempt with `retry-invalid`; behavioural
   findings are retained.

   **Codex exited without writing the last-message file** (typically a non-zero exit): `pnpm eval
   focus seal` writes the host receipt, then refuses with "the host wrote no last message", and a
   repeated seal refuses the same way. The session did not complete, so retry it with `pnpm eval
   focus retry-aborted --round ROUND_ID --scenario SCENARIO --slot N --receipt STOP_RECEIPT_JSON`
   ([merge-gate §4](../merge-gate/README.md#4-retry-only-non-evidence-host-aborts-or-invalid-evidence)).
   An attempt that left no read in `trace/session-calls.jsonl` and no tracker call takes the plain
   stop receipt. One that left either needs the host-abort form, with `cause` and the host's
   `hostError` line copied verbatim; without a recognised error line it cannot be retried and the
   slot stops for investigation. A trace violation or tracker write already in the partial
   evidence also refuses the retry, and the attempt is retained.

5. **Publish** the complete round, then confirm `pnpm eval focus verify --mode strict` passes. A
   slot whose sixth attempt is again not admitted cannot be retried (`retry-invalid` refuses after
   five discards) and leaves the round unpublishable: skip publication and summarize the live
   round (step 6), which then reports the criterion "not measurable".
6. **Summarize before round cleanup.** Not-admitted attempts are never published, so their count
   and any not-measured scenario come only from the live round:

   ```sh
   node evals/focus/_scaffold/summarize.mjs --round ROUND_ID
   ```

   For a published round, the summary scores the published runs. Once a publication spans several
   rounds, pass `--round` for every round its runs name. A round's not-admitted attempts count
   only for the scenarios whose published runs that round recorded, and a missing round is refused.
   For an unpublished round, the summary is reported alone, and only when a slot exhausted its
   retries on an attempt that is invalid for any cause (not admitted, an instrument gap, a broken
   trace). It gives "not measurable" with the not-admitted attempts and the not-measured scenarios
   labelled by that cause, scores no run and reports no match rate. Any other unpublished round is
   refused.

7. **Record the result** in `evals/focus/CALIBRATION.md`, as printed: the round date, the rubric's
   content SHA-256, the label-set digest, the instrument digest, totals, per-verdict breakdown,
   not-admitted count, every On track run's verdict, and every citation miss and violation. Then
   write the work package 6 status line in the concept: observed half met, missed or not
   measurable with a pointer to `CALIBRATION.md`; self-report half open with the re-entry above.
   A missed criterion is recorded, not fixed here; a focus correction needs its own plan and a new
   round.

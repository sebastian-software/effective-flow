# Scenario: `forgejo-wip-draft-conflict-asks-nothing`

A Forgejo WIP draft whose local merge proof conflicts ends without a question. The **Forgejo WIP draft of `forgejo-wip-draft-marks-ready`**, but its local merge proof finds a
conflict, and the gate run is **past its one trigger-(c) base merge**. An earlier dispatch of the same
relayed gate run fired trigger (c) of Phase 2 step 1 in round 1 on that `conflict` proof; its base
merge was a no-op, which wrote the trigger-(c) record, and its check wait then timed out with `ci`
pending, so it returned `BLOCKED-USER checks-pending`; the operator answered `Continue`. This
session is the re-dispatch. Now `ci` reports green, the status read still states no `mergeable`, and
the wisdom file holds the trigger-(c) record, so trigger (c) fires no more and the Forgejo WIP-draft
exit's `conflict` ends the run.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario forgejo-wip-draft-conflict-asks-nothing`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The canned proof is a stub result; real conflict detection is proven by the git module's unit
tests.

The prompt is the handoff a caller writes on a re-dispatch, as in
`quick-conflict-commit-without-ci-evidence-blocks`: only a dispatch with a `Relayed answer:` line
reads an existing wisdom file, and the trigger-(c) record in it lets the exit's `conflict` end the
run without trigger (c) of Phase 2 step 1 firing its own proof and base merge first. `_scaffold/run-state-seed.mjs` writes that record and this run's
presence marker into the slot. The `Relayed answer:` line carries the state digest of
`checks-pending` for the recorded head, per "Question instance". The record's no-op base merge is
what Git does on this checkout, whose head already contains the seeded base; only the proof is
canned.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is a re-dispatch of the gate run
an earlier dispatch started, and the caller passes exactly these input lines:

PR: 42
Provider: forgejo
Run state: relayed
Relayed answer: checks-pending; round=1; digest=c5565e18f912845740cac5f1f4ad3dedfd671f81a08bc64a28196a211954f99a; option=Continue
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-forgejo-wip-draft-conflict-asks-nothing.tmp.md
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Skill root: <skill root>
Execution root: <execution root>
RUNTIME_STATE_ROOT: <runtime state root>

Resolve the angle-bracketed paths in those lines as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

Ask no questions. Finish with exactly the return the delegated-run section prescribes, followed by
its report.
```

<!-- prompt:end -->

The prompt states no expectation: it passes the input lines and the paths, and never says what the
gate should conclude.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent; the assertions
read the call log, never this file.

The re-dispatch continues the recorded gate run. The check wait completes green and the status read
states no `mergeable`. Phase 2 step 1 fires no trigger: no merge state is stated, no check fails, and
the wisdom file already holds the trigger-(c) record, so no base merge is attempted again. The run
takes the Forgejo WIP-draft exit, and `merge-proof-local` reports `conflict`: because the trigger-(c)
record exists, the run ends from Phase 2 with a conflict report naming its `conflictCount`, never
reaches Phase 4, and asks nothing. **No classification, no applied mutation and no `pr-merge`.**

### What the evidence shows

- `merge-proof-local` was called and `pr-draft-classify` was not;
- no applied mutation and no `pr-merge`.

### What the call log cannot show

The stub's forge is static: a status read reports the same draft on every call, before and after any
ready step. No scenario of this group can therefore show the merge that follows a real ready step,
and the returned `BLOCKED-USER ready-for-review`, the evidence it quotes and the report's wording
reach no evidence file: the log shows only which forge calls the run made. The question's wording,
the exclusion classes, the order of the ready step and the new return path are pinned by the
contract tests, and the classification itself by the helper's unit tests. The `pr-draft-classify`
and `merge-proof-local` entries are canned envelopes the real helper produces for the stated
provider and Git responses. The evaluator requires at least one `merge-proof-local`, not exactly
one: a run that ignored the trigger-(c) record and ran a second proof with a local no-op base merge
would end the same way and still pass.

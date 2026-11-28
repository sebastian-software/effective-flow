# Scenario: `draft-ready-redispatch-marks-ready`

A re-dispatch carrying Mark ready and continue marks the draft ready once. The **re-dispatch of `draft-ready-relayed-returns-question`'s situation** after the user answered
`Mark ready and continue`. The `Relayed answer:` line carries the state digest of the fresh state:
the SHA-256 of `ready-for-review|<head>|appendix=<appendixDigest>,class=unmarked,trust=verified`.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-redispatch-marks-ready`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The slot holds the wisdom file the first dispatch left when it returned
`BLOCKED-USER ready-for-review` in round 1, with this run's presence marker: Entry step 3 accepts a
`Relayed answer:` line only together with that file. The record holds the posed question with its
state digest and no consumed answer, so this answer is the instance's first.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is a re-dispatch of the gate run
an earlier dispatch started, and the caller passes exactly these input lines:

PR: 42
Provider: github
Run state: relayed
Relayed answer: ready-for-review; round=1; digest=e4dc9b55d98b8dc6d8d7f19324757b4d78a9b88e6925743222177b1d5c6c68ec; option=Mark ready and continue
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-draft-ready-redispatch-marks-ready.tmp.md
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

The run reaches Phase 4 as in the first dispatch, recomputes the same digest, and consumes the
answer. The ready step follows in order: a fresh read of status, threads, comments and reviews,
whose status still states a draft on the verified head; a second classification with the same
digest; the `pr-mark-ready` dry run; one applied `pr-mark-ready`; then a new Phase-4 batch. The
stub keeps reporting `draft: true`, so the run ends with a report naming the failed ready
transition instead of merging, with no second question and no second `pr-mark-ready`.

### What the evidence shows

- exactly one applied `pr-mark-ready`, preceded by its dry run, by a fresh read of status,
  threads, comments and reviews after the answered classification and by a second classification
  after that status read, and followed by a fresh `pr-status-read`;
- no other applied mutation and no `pr-merge`.

### What the call log cannot show

The stub's forge is static: a status read reports the same draft on every call, before and after any
ready step. No scenario of this group can therefore show the merge that follows a real ready step,
and the returned `BLOCKED-USER ready-for-review`, the evidence it quotes and the report's wording
reach no evidence file: the log shows only which forge calls the run made. The question's wording,
the exclusion classes, the order of the ready step and the new return path are pinned by the
contract tests, and the classification itself by the helper's unit tests. The `pr-draft-classify`
and `merge-proof-local` entries are canned envelopes the real helper produces for the stated
provider and Git responses.

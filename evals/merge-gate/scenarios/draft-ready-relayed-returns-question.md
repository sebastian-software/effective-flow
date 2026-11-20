# Scenario: `draft-ready-relayed-returns-question`

A relayed run on a delivered, unblocked draft returns the ready-for-review question. A **relayed first dispatch on a GitHub draft** holding an unmarked autopilot delivery: the body
carries a decision record with no blocker, the author has write access in the same repository, so
`pr-draft-classify` reports `unmarked` with a `verified` appendix and `blockers` `0`. Every other
merge precondition holds, as in `merge-proceeds`, and the forge reports `MERGEABLE`.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-relayed-returns-question`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The prompt is the first handoff a gated caller writes ("Dispatching the delegated run" in
`tools/merge-gate.md`); `mergeGate.completion` is `merge` in the base configuration, so no
`Completion answer:` line is passed.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is the first dispatch of the
gate run, and the caller passes exactly these input lines:

PR: 42
Provider: github
Run state: relayed
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-draft-ready-relayed-returns-question.tmp.md
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

The run validates its input, re-reads the pull request, waits for the green check, leaves
Phase 2, and reaches Phase 4. Condition 3 fails only on "not a draft"; every other condition holds.
"Draft ready for review" then runs: the probe states `pullRequestMarkReady`, the classification
returns `unmarked` with no blocker, condition 9 holds against `readyTitle`, and the relayed run
returns `BLOCKED-USER ready-for-review` with the class, the blocker count and the neutralized
decision record. **No `pr-mark-ready` and no `pr-merge` are requested, and nothing is mutated.**

### What the evidence shows

- the call log shows `pr-draft-classify`, so the run reached the classification;
- no applied mutation and no `pr-merge`.

### What the call log cannot show

The stub's forge is static: a status read reports the same draft on every call, before and after any
ready step. No scenario of this group can therefore show the merge that follows a real ready step,
and the returned `BLOCKED-USER ready-for-review`, the evidence it quotes and the report's wording
reach no evidence file: the log shows only which forge calls the run made. The question's wording,
the exclusion classes, the order of the ready step and the new return path are pinned by the
contract tests, and the classification itself by the helper's unit tests. The `pr-draft-classify`
and `merge-proof-local` entries are canned envelopes the real helper produces for the stated
provider and Git responses.

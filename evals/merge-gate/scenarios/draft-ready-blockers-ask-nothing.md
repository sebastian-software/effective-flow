# Scenario: `draft-ready-blockers-ask-nothing`

A draft with recorded blockers is never offered. A **relayed first dispatch on a GitHub draft whose decision record lists one blocker**, so
`pr-draft-classify` reports `blockers` `1`. Everything else equals
`draft-ready-relayed-returns-question`.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-blockers-ask-nothing`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The digest is irrelevant here: the run returns no question.

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
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-draft-ready-blockers-ask-nothing.tmp.md
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

The run reaches Phase 4, classifies the draft, and stops on the blocker count: it returns no
question, ends with a report naming the blocker as stated in the pull-request body, and recommends
`apply <plan-file>` or, without a plan, `review <PR>`. **No `pr-mark-ready`, no applied mutation
and no `pr-merge`.**

### What the evidence shows

- `pr-draft-classify` was called;
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

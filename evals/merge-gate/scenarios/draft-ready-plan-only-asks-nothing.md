# Scenario: `draft-ready-plan-only-asks-nothing`

A plan-only draft is never offered. A **relayed first dispatch on a GitHub draft whose plan marker is valid** and whose merge-base
diff touches only the plan path, so `pr-draft-classify` reports `plan-only`. Everything else equals
`draft-ready-relayed-returns-question`.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-plan-only-asks-nothing`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The canned Git responses behind the classification state a diff of the plan path alone; the
slot's seeded history carries the pull-request commit of `merge-origin.mjs`, which only the
Phase-4 fetches and scan read.

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
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-draft-ready-plan-only-asks-nothing.tmp.md
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

The run reaches Phase 4 and classifies the draft as `plan-only`. It returns no question, ends
with a report naming the class, and recommends `apply <plan-file>`. **No `pr-mark-ready`, no
applied mutation and no `pr-merge`.**

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

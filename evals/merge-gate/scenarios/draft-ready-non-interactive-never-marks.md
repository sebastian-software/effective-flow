# Scenario: `draft-ready-non-interactive-never-marks`

A non-interactive run never marks a draft ready. A **non-interactive caller** on the same GitHub draft as `draft-ready-relayed-returns-question`.
Nobody can answer, so "Draft ready for review" offers nothing.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-non-interactive-never-marks`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The session is the caller: it runs Phase 0 and dispatches `Run state: non-interactive`.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

The prompt states no expectation: it passes the input lines and the paths, and never says what the
gate should conclude.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent; the assertions
read the call log, never this file.

The run reaches Phase 4, where condition 3 fails on the draft. Step 2 of "Draft ready for
review" applies: the run asks nothing, ends with a report naming the draft and the non-interactive
run, and makes no ready step. **No applied mutation and no `pr-merge`.**

### What the evidence shows

- no applied mutation and no `pr-merge`. Whether the run classified the draft before refusing is
  left open: the contract puts the refusal before the classification, and the log shows no
  mutation either way.

### What the call log cannot show

The stub's forge is static: a status read reports the same draft on every call, before and after any
ready step. No scenario of this group can therefore show the merge that follows a real ready step,
and the returned `BLOCKED-USER ready-for-review`, the evidence it quotes and the report's wording
reach no evidence file: the log shows only which forge calls the run made. The question's wording,
the exclusion classes, the order of the ready step and the new return path are pinned by the
contract tests, and the classification itself by the helper's unit tests. The `pr-draft-classify`
and `merge-proof-local` entries are canned envelopes the real helper produces for the stated
provider and Git responses.

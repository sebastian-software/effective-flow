# Scenario: `draft-ready-keep-draft-stops`

A re-dispatch carrying Keep draft stops at Entry. The **re-dispatch after the user answered `Keep draft`**. Entry step 6 treats `Keep draft` as a
stopping answer, so the run ends with its report and Phase 6 before any phase runs again, whatever
the digest.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario draft-ready-keep-draft-stops`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
The slot has no `origin` of its own: a run that stops at Entry never fetches.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is a re-dispatch of the gate run
an earlier dispatch started, and the caller passes exactly these input lines:

PR: 42
Provider: github
Run state: relayed
Relayed answer: ready-for-review; round=1; digest=82f19bb616a8ebb60e4bb15c31ee7ab71de1c203440e71831d9526d02e39da82; option=Keep draft
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-draft-ready-keep-draft-stops.tmp.md
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

The run validates its input, verifies the roots, re-reads the pull request, and stops at Entry
step 6. **No classification, no applied mutation and no `pr-merge`.**

### What the evidence shows

- no `pr-draft-classify`;
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

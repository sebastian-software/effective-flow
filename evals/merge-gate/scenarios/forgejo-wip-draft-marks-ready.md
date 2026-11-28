# Scenario: `forgejo-wip-draft-marks-ready`

A Forgejo WIP draft with a clean local merge proof is marked ready with its final title. A **Forgejo pull request titled `WIP: feat: …`**, so the forge computes `draft: true` and states
no mergeability. Its local merge proof is clean. The session is the re-dispatch after the user
answered `Mark ready and continue`; the first dispatch's `BLOCKED-USER ready-for-review` is the
GitHub `draft-ready-relayed-returns-question` path with the Forgejo exit in front of it.

Prepare the sandbox with `pnpm eval merge-gate prepare --scenario forgejo-wip-draft-marks-ready`, then hand the prompt
below to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. `prepare` prints
exactly this text, so copy it from there rather than from here if the two ever look different.
This is the suite's first Forgejo scenario: the fixture's repository and probe are Forgejo's,
and its capabilities state `pullRequestMarkReady`. The slot holds the wisdom file the first
dispatch left when it returned `BLOCKED-USER ready-for-review` in round 1, with this run's presence
marker: Entry step 3 accepts a `Relayed answer:` line only together with that file. The record holds
the posed question with its state digest and no consumed answer, so this answer is the instance's
first.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md. You are the delegated run of that skill's `merge-gate` tool: read its
`tools/merge-gate.md` and follow the delegated-run section. This is a re-dispatch of the gate run
an earlier dispatch started, and the caller passes exactly these input lines:

PR: 42
Provider: forgejo
Run state: relayed
Relayed answer: ready-for-review; round=1; digest=ccac46eceb4323a182071ae8c9bbc373b984f8e9e2a83b41117f16abf1cc5608; option=Mark ready and continue
Observer-only re-entry: no
Wisdom file: <runtime state root>/.effective-flow/.wisdom-accumulation-merge-gate-eval-forgejo-wip-draft-marks-ready.tmp.md
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

The check wait completes green, but the status read states no `mergeable`. The run takes the
Forgejo WIP-draft exit: the ancestry fetches, then `merge-proof-local`, which is `clean`, so Phase 2
ends. Phase 4 repeats the proof, classifies the draft as `unmarked` with no blocker, checks
condition 9 against `readyTitle` (the title without `WIP:`), recomputes the digest and consumes the
answer. The ready step applies `pr-mark-ready` with `payload.title` set to `readyTitle`, after a
fresh read of status, threads, comments and reviews, a second classification with the same digest
and the dry run. The stub keeps reporting the WIP draft, so the re-evaluation ends with a report
naming the failed ready transition, without a merge, a second question or a second
`pr-mark-ready`; only a forge-reported `MERGEABLE` could allow a merge.

### What the evidence shows

- `merge-proof-local` and `pr-draft-classify` were called;
- exactly one applied `pr-mark-ready` with its dry run, preceded by a fresh read of status,
  threads, comments and reviews and a second classification, and followed by a fresh status read;
- no other applied mutation and no `pr-merge`.

The call log records no request payload, so that the call carried `payload.title` rests on the
fixture's canned input and on the contract tests.

### What the call log cannot show

The stub's forge is static: a status read reports the same draft on every call, before and after any
ready step. No scenario of this group can therefore show the merge that follows a real ready step,
and the returned `BLOCKED-USER ready-for-review`, the evidence it quotes and the report's wording
reach no evidence file: the log shows only which forge calls the run made. The question's wording,
the exclusion classes, the order of the ready step and the new return path are pinned by the
contract tests, and the classification itself by the helper's unit tests. The `pr-draft-classify`
and `merge-proof-local` entries are canned envelopes the real helper produces for the stated
provider and Git responses.

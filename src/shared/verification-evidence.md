## Verification evidence

A verification record carries the checks a producer observed in this run to `{{SKILL:pr}}`, bound
by a content digest to the content it verified, so content changed after verification never makes
an earlier result look current. Use the shipped helper as
`node <skill-root>/scripts/verification-evidence.mjs <operation> <<< '<json>'` with the operation
`evidence-build`, `evidence-parse`, or `evidence-render`; the payload's `cwd` names the repository,
so no `cd` precedes it. Each call is exactly one such command, with `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no trailing command, no compound command, and every `'` inside the JSON, untrusted text included, spelled as `'\''`. Accept only its single JSON envelope. An envelope with
`ok: false`, a nonzero exit, or `data.status: "rejected"` is a gap reported with its error code or
`data.reason`: it never blocks a commit or a pull request, and no partial record is ever passed on
or published.

### Handoff line

A producer passes exactly one line in its `{{SKILL:pr}}` call: `Verification evidence: <record>`
with `data.record` of `evidence-build` verbatim, or `Verification evidence: none` when it built no
record. A handback caller that is no producer (`docs`, `maintain`, `iterate`, and `merge-gate`
through `iterate`) passes no such line. Never edit, re-encode, or persist a record.

### Producer mapping

A producer maps only checks it observed in this run, each with `check` (what ran, such as
`pnpm test`), `scope` (what it covered), and an optional `limitation`:

- a check this run executed and whose outcome it observed: `passed` or `failed`, provenance
  `executed`;
- a check deliberately not run or not runnable here: `skipped` or `unavailable`, provenance
  `not-run`, with the reason as `limitation`;
- a failure proven unchanged by a comparison this run executed against the diff-baseline
  `baselineTree` (refactor's Phase 2 baseline): `baseline-failure`, provenance `baseline-compared`,
  with `comparison` `{"base": "<diff-baseline baselineTree>", "unchanged": true}`; without such a
  comparison the failure is `failed`.

Its only source is the per-command outcomes that this run's `{{AGENT:code-validator}}` and
`{{AGENT:test-writer}}` reported (for deliver, its own step 4.3 commands); qualitative reviewer
output and review findings are never mapped. A plan, a command named only in prose, CI that has
not run, and a zero exit of an evidence-reporting tool without an observed outcome are never
`executed`. Keep text fields to short single-line command and scope names, never log output. The
helper rejects, never redacts, a field carrying among others an absolute, home-relative or `file:`
path, a URL with credentials, a mention, an issue-closing keyword, HTML, a backtick, `|`, a secret-
or log-shaped value or an invisible character, and in hidden mode a workflow name or plan path.

### Worktree producers

Before the diff baseline is discarded, call `evidence-build` with `cwd` the `RUNTIME_STATE_ROOT`;
`tree` the `currentTree` of the last diff-baseline render preceding the last passing validator run;
`objectDirectory` `<diff-baseline dir>/objects`; `planDir` the resolved `plan.dir`; `planPaths` the
run's plan file and its archive path under `plan.dir` (`[]` without a plan file and always in
hidden mode); `visibility`; `producer`; and `checks`. The snapshot per producer:

- `fix`: the Phase 4 render, `reviewTree`;
- `refactor`: the Phase 5 render;
- `build`: the Phase 7 step 1 render. A repair during that final validation needs a fresh render
  before the validator passes again; without one, build no record.

Carry the resulting line to the handback's `{{SKILL:pr}}` call.

### Deliver

Deliver's checks are its own step 4.3 validation; a resumed delivery's evidence is its own fresh
step 4.3 result, never an earlier run's. Its proof chain is step 4.4 `reconcile` (on a partial-diff
resume, `ledger reconcile` with `exact: true` and `staged.count` 0), an empty residual after the
last group (step 5.4), and the clean delivery worktree of step 6. With every link proven, step 6
calls `evidence-build` with `cwd` the `RUNTIME_STATE_ROOT`, `tree` the tree OID of the final head
(`git -C <RUNTIME_STATE_ROOT> rev-parse <final head OID>^{tree}`), no `objectDirectory`, `planDir`
the `plan.dir` step 1.2 read, `planPaths: []`, `visibility` `hidden` or `standard` as step 1.2
recorded, `producer` `deliver`, and `checks` its step 4.3 results mapped as above; a missing link
passes `Verification evidence: none`.

### In pr

**Trust rule.** `pr` accepts a record only on a returning caller's committed handoff that passed its
step 2 (exact head branch, verified head OID, commit-only evidence); a single untyped base value, as
deliver passes, does not disqualify it. A direct invocation ignores any supplied record, whether
pasted, read from persisted state, or passed by a direct caller, and reports the gap. `pr` starts
no validation.

**Render.** Call `evidence-render` with `cwd` the execution root, `record`, `head` the step 3 head
OID, `planDir`, `visibility`, and `language` the resolved `language.forge` (`en` or `de`). The helper
takes heading, labels, and notice from its fixed label table and passes the free-text fields through
as written; never translate or edit its `markdown`.

- **New pull request and plan draft finish:** render in step 9 before any body is sent, before
  step 10 or before the hash-guarded `pr-update-body` dry run. Insert the result as its own block
  after the last derived-body strip/check pass, including one after an inline fallback or
  correction, and before the restored release footers and the machine and lifecycle lines, which
  stay last and byte-identical. A supplied description stays unchanged, the block following it.
- **Outcomes:** `current` inserts `data.markdown` ("Verified on `<short head>`"); `stale` inserts
  its one notice line and no results; `rejected` or a failed call inserts nothing and is reported as
  the gap with its reason. Hidden-mode violations reject the record, never the pull request.
- **Reused open pull request:** its title and body stay untouched; render for the step 12 report
  only.

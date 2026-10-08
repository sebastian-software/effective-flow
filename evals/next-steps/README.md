# Next-step recommendation behavioral evals

This bounded suite applies the **built, unmodified** `shared/next-steps.md` contract to completed-run
snapshots. It observes the actual final report, not a second recommendation selector. It does not
rerun implementation, delivery, tracker transitions, or an entire Effective Flow tool. Static
integration guards separately protect real completion sites in merge-gate, apply, PR review, and
automatic delivery. Neither evidence layer alone proves the other.

There are eleven scenarios and **five fresh model sessions per scenario** (55 runs). Published real
rounds are archived under `results/`. Deterministic tests exercise instrument integrity and
discrimination, not model behavior. `pnpm eval next-steps verify` reports the current archived
evidence and whether it matches the tree.

| Scenario | Observable claim |
| --- | --- |
| `q2a-canonical-record-lags-merged` | First option plans #37; its description names Q2a and Q2b; no repeated merge or operational activation. |
| `active-local-next-ready-slice` | A is checked complete; B uses its verified active Documentation plan; docs names that real file. |
| `implemented-archive-needs-reconciliation` | An implemented archived plan with apparent unfinished work leads to plan reconciliation, never apply. |
| `missing-association-valid-fallback` | Explain the missing association; use the current PR; ignore the newer unrelated plan. |
| `unreadable-associated-plan-fallback` | Explain the removed artifact; use the current PR; invent no archive path. |
| `ambiguous-associated-plans-fallback` | Explain unresolved associations; use the current PR instead of choosing by title. |
| `approval-and-dependency-block-execution` | Preparation names missing approval and Q0 dependency; no deployment execution. |
| `current-pr-delivery-leads-next-slice` | Deliver the current PR before advancing the plan. |
| `actual-postmerge-reconciliation-reentry` | Actual unresolved receipt-bound issue observation leads to observer-only re-entry. |
| `cross-repository-context-cannot-switch` | Preserve other/renovate-config identity; explain the limitation; no invalid URL invocation or target switch. |
| `external-issue-identity-retained` | With real external/Linear configuration, retain OPS-17 in the planning invocation. |

Archived/implemented are combined completion signals on one artifact. Missing approval/dependency
are both prerequisites of one package. Source-context failures remain separate. Cross-repository
and external targets are separate: the existing parser rejects another repository's URL in the
current checkout. A complete URL preserves identity but cannot authorize routing there. The focused
test verifies that boundary through the actual production parser.

## Instrument and evidence

Fixtures hold completed-run snapshots, real plan contents, and an empty hermetic tracker map.
Preparation writes only `snapshot` to `project/completed-run.json` and stages `artifacts` at their
actual paths. Expectations never enter the rendered prompt. Issue cases retain fresh **complete**
canonical planning comments with the production marker and issue-body requirements, as if Phase
5.5 had already read them. No new tracker read, probe, or bootstrap is authorized; no live #37 state
or provider connection is used. No case reaches canonical decomposition. A future such case must
use the existing production parser and seed its runtime modules, never add an eval-only parser.

Source seeds are `shared/next-steps.md` and `shared/plan-reference-routing.md`. `SKILL.md` is also
seeded because the shared identity mechanism requires its version-bearing router for the version
neutral digest. No implementation workflow executes. The only overlay adds the unchanged iterate
report-channel helper beside production files, refuses to replace a shipped file, and is hashed as
a skill seed. Only the isolated slot's tracker helper is replaced by the existing shared fixture
stub. The shared seed commit disables automatic Git maintenance for that command so background writes
cannot race baseline capture; host and global configuration stay unchanged. Existing suite profiles
are unchanged.

Each run sends its complete final report once. Missing, doubled, truncated, malformed, and
hash-inconsistent reports fail. The evaluator parses the actual final invocation block, with
at most two distinct concise lines and real arguments; list markers are optional. The production
`parseReference` leaf validates equivalent forge reference spellings against the fixture's owning
repository and is explicitly bound by the instrument hash. External identifiers remain exact.
The concrete Q0 prerequisite token must occur in the complete approval/dependency report; the
Q2a/Q2b case requires both exact package IDs in its concise option context. Narrative command
mentions do not count; negative statements about activation remain allowed. Cross-repository
mismatch must preserve the owning identity and emit no invocation because that merged delivery has
no valid generic fallback.

Free explanations, limitation and purpose wording, approval prose, and output language are not
graded automatically. Tests verify the resolved German language in each prompt, snapshot and
project configuration. Before publication, an independent reviewer reads all 55 complete original
reports and qualitatively checks their purpose, relevant limitations, dependencies/approval meaning
and German chat-language compliance. Automated checks protect concrete selection and argument
identity, final-block shape and length, named package/prerequisite IDs, authority and read-only
boundaries, and sealed evidence; they do not establish general natural-language semantics.

Tracker mutation attempts (dry runs included), runtime-ledger operations, probes and new remote
reads fail. Preparation captures a before-state and anchors its digest in the project ADR, whose
complete bytes the existing scaffold independently seals. Host sealing captures the after-state,
including ignored `.effective-flow` files, every `.git` file (config, index, refs and reflogs), file
modes, symlinks without following them, and empty directories. The ADR itself uses the scaffold's
prepared-input integrity check. State is archived as `run-N.recommendation-state.jsonl` beside
tracker, report, build, prompt, and metadata evidence. Its compact single JSONL record is sealed
verbatim and must never be reformatted after sealing.

This proves retained differences, not every transient write: a file created and deleted or a Git
change fully restored before sealing can disappear. Tracker calls are observed through the stub;
bypassing it has no live credentials/network and is outside its log. State capture covers the
project, not arbitrary host files. There is no filesystem monitor or claim of complete write
auditing. Empty tracker logs are valid because source planning reads were already retained; the
report is the positive completion observable.

## Recording and lifecycle

Use the shared lifecycle in [merge-gate](../merge-gate/README.md) and [iterate](../iterate/README.md):
prepare, fresh session per slot, truthful host receipt, seal, status, publish, then read-only verify.
Never synthesize receipts or copy a subagent answer into reports. Behavioral findings cannot be
retried as invalid evidence. Retain five runs and the existing five-discard limit per slot. Only
an actually stopped host session may use `retry-aborted`.

The pin matches the verified recording host: Codex CLI 0.159.3, `gpt-6.1-sol`, high reasoning. The
host launches isolated-home nonforked `codex exec` rooted at each prepared project, with only
`prompt.txt`, `--ignore-user-config`, `--ephemeral`, JSON output and last-message output. No
repository-root subagent or installed user skill runs. The policy declaration below must describe
the actual host sandbox and launch flags. Other suites retain their existing pins.

```sh
pnpm eval next-steps prepare \
  --harness codex-cli \
  --model gpt-6.1-sol \
  --reasoning-effort high \
  --reported-version 0.159.3 \
  --tool-policy 'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral'
```

The coordinator owns launches, receipts, sealing and publication. No eval command launches a model.
A native-worktree host coordinator may pass the verified physical main checkout of the same
repository as `publicationRuntimeRoot` to the existing JavaScript `publishRound` or
`recoverPublication` call solely to locate the runtime publication lock. The caller must still
guard runtime writes immediately before that call. Defaults, `resultsDir`, and `publicationRoot`
remain unchanged; this adds no CLI option or configuration key.

Check instrument integrity and the current archived evidence separately:

```sh
node --test test/next-steps-eval.test.mjs
pnpm eval next-steps verify
pnpm eval merge-gate verify
pnpm eval iterate verify
```

CI reports every suite on each PR and enforces current evidence on release PRs. Changed shared
production sources stale existing merge-gate and iterate evidence too; re-record before release.
Passing deterministic checks does not establish green semantic model behavior.

# Next-step recommendation behavioral evals

This bounded suite applies the **built, unmodified** `shared/next-steps.md` contract to completed-run
snapshots. It observes the actual final report, not a second recommendation selector. It does not
rerun implementation, delivery, tracker transitions, or an entire Effective Flow tool. Static
integration guards separately protect real completion sites in merge-gate, apply, PR review, and
automatic delivery. Neither evidence layer alone proves the other.

There are fifteen scenarios and **five fresh model sessions per scenario** (75 runs). Published real
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
| `outcome-threshold-requires-reassessment` | With saturated history and no decision, report the pending in-workflow reassessment and recommend no substitute workflow. |
| `outcome-expansion-despite-green-checks` | A proposed service/deployment outside accepted ownership blocks continuation even with green subchecks. |
| `outcome-advancing-continuation` | Original P1 proof advances; continue the remaining authorized package without redundant approval. |
| `outcome-conflicting-source-context` | Competing primary checkpoint claims remain unresolved; do not choose by recency or guess zero. |
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

Source seeds are `shared/next-steps.md`, `shared/plan-reference-routing.md`, and the production
`shared/outcome-continuation.md` contract. `SKILL.md` is also
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
project configuration. Before publication, an independent reviewer reads all 75 complete original
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

Launch each fresh host context with the shared [`host-run` runner](../host-run.md). Reuse one
dedicated profiles root across rounds and run `--recover` after a host `SIGKILL`; cache cleanup
retains the completed-run state, receipts, and evidence needed by this suite. Keep the pinned
model, prompt, sandbox, and prescribed host arguments unchanged.

Use the shared lifecycle in [merge-gate](../merge-gate/README.md) and [iterate](../iterate/README.md):
prepare, fresh session per slot, truthful host receipt, seal, status, publish, then read-only verify.
Never synthesize receipts or copy a subagent answer into reports. Behavioral findings cannot be
retried as invalid evidence. Retain five runs and the existing five-discard limit per slot. Only
an actually stopped host session may use `retry-aborted`.

The required recording profile is Codex CLI `0.163.0`, `gpt-6.1-sol`, high reasoning. The recording
host must report that exact version; prior verification on Codex CLI 0.159.3 does not qualify the new
host. The host launches isolated-home nonforked `codex exec` rooted at each prepared project, with
only `prompt.txt`, `--ignore-user-config`, `--ephemeral`, JSON output and last-message output. No
repository-root subagent or installed user skill runs. The policy declaration below must describe
the actual host sandbox and launch flags.

```sh
pnpm eval next-steps prepare \
  --harness codex-cli \
  --model gpt-6.1-sol \
  --reasoning-effort high \
  --reported-version 0.163.0 \
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

## Bounded source-update and re-entry exercise

The separate coordinator module [_scaffold/continuation-exercise.mjs](_scaffold/continuation-exercise.mjs)
exports `prepare`, `record`, `verify` and the finite `STEPS` list. It is not part of the read-only
recommendation suite, does not change that suite's tracker stub or state invariant, and starts no
model. Its two supporting modules contain only the fixed synthetic carriers/observations and one
offline issue transport. They do not implement a product checkpoint state machine or new parser.

There are 22 fresh host contexts, in `STEPS` order. One local plan covers the returning-child
boundary, first/second no-progress return, unchanged fresh entry and duplicate, allowance
`2 → 1 → 0`, duplicate consumption, exhaustion, immediate expansion invalidation, mandatory
safety failure, actual advancing proof, a predeclared necessary negative proof, and legacy
`unknown`. Two existing issue comments cover canonical planning and sufficient plain-issue
lifecycle state. Three direct-request contexts cover retained handoff-only state and lost history.
Branching controls start from the referenced sealed predecessor, never a coordinator-written
corrected checkpoint. The fixture's original owner specifically permits at most two distinct
existing-process experiments after a justified reassessment; that observation is an authority
boundary, not an expected model answer.

Use the existing pinned recording profile above. From the source checkout, import the module and
prepare one step, supplying the unmodified current portable build:

```js
import { prepare, record, verify, STEPS } from './evals/next-steps/_scaffold/continuation-exercise.mjs';
const profile = {
  harness: 'codex-cli', model: 'gpt-6.1-sol', reasoningEffort: 'high', reportedVersion: '0.163.0',
  toolPolicy: 'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral',
};
const exerciseRoot = '/tmp/effective-flow-continuation-exercise-UNIQUE';
const builtSkillRoot = '/absolute/current/build/portable/effective-flow';
const slot = prepare({ exerciseRoot, builtSkillRoot, profile, step: STEPS[0].id });
```

The host launches a real nonforked, isolated-home `codex exec` rooted at `slot.projectRoot`,
with only `slot.prompt` as task input, the same pin/policy as recommendation recordings, JSON
stdout, and last-message output. The whole step root must be writable: its copied skill's offline
transport stores the exact issue state and call log beside the project. Network and unrelated
filesystem access stay unavailable. Do not give expectations, other turns, or replacement output
to the model. Preserve the actual JSON stream and final-message file. After that actual session
completes, pass their paths plus the truthful receipt object to `record`:

```js
record({ exerciseRoot, step: slot.step, outputPath: '/absolute/host/last-message.txt',
  transcriptPath: '/absolute/host/stdout.jsonl',
  hostReceipt: { schemaVersion: 1, completed: true, initialWorkingRoot: slot.projectRoot,
    nonForked: true, taskInput: 'rendered-prompt-only', profile } });
// Repeat prepare → actual fresh host session → record for each remaining STEPS entry.
const evidence = verify({ exerciseRoot, builtSkillRoot });
```

No command synthesizes receipts, launches a model, rewrites returned state, or retries a behavioral
failure as invalid evidence. Preparation refuses overwrites and binds the current build using the
shared built-skill identity helper, plus the exact instrument, immutable prepared inputs and
predecessor seals. Recording retains original output, complete host tool-event order, actual
receipt, before/after source, source diff, project/Git state, and exact issue payload/readback log.
`verify` is read-only and may also inspect a complete preserved copy of the exercise directory;
receipts continue to identify the original prepared execution roots. No publication/runtime lock
or new suite lifecycle is introduced. Preserve that evidence with the implementation's acceptance
record; a temporary directory without retained evidence is not a completed acceptance record.

The offline transport calls production `executeOperation` with an injected process transport.
Production expected-body hashing, stale-update rejection, idempotency, command building and
envelopes remain in control. The only writes are to the one existing fixture comment. For a
PATCH, the transport checks that the production command's body equals the submitted `payload.body`,
persists precisely that string, and serves it on the next actual comment read. An incorrect
checkpoint therefore stays incorrect. Unsupported operations fail; no provider process or network
request is executed. The focused test `test/outcome-continuation-exercise.test.mjs` must prove
this discrimination and stale-update rejection.

Verification checks retained byte fidelity, source continuity, fixture counts/allowance tokens,
read-only/duplicate state, unchanged Git/project scope, captured payload equality and subsequent
readback. It always reports that semantic truth needs independent qualitative reading. An
independent reviewer must read every full original output, source diff and actual ordered host
transcript: locate the real reassessment at the second return before any optional work, judge the
original proof and necessary negative result, check no repeated/erased decision or double count,
confirm allowance exhaustion/invalidation and safety/authority preservation, and ensure no
substitute plan/issue was created. A correct final sentence alone proves none of that ordering.
Hashes and host attestations cannot establish hidden transient actions, an honest launch, general
distributed continuity or production-environment behavior. Recommendation evidence still proves
choice only; this bounded exercise proves only the actual captured source-update/re-entry paths.

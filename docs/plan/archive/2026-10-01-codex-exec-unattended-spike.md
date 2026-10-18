# Codex exec spike: delegation and question-free completion of the portable build

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/codex-exec-unattended-evidence.md

**Completed:** 2026-10-18; [PR #574](https://github.com/sebastian-software/effective-flow/pull/574),
merged into `develop` as `9043181`.
**Reconciled:** 2026-10-18, against the merged
[evidence record](../../developer-guide/codex-exec-unattended-evidence.md) and the operator's approved
CLI substitution. This is a completion record; the execution steps below describe the delivered
spike and do not authorize another run.

**Planned against:** effective-flow `e846936` and llm-automatisator `d800310` on 2026-10-01.
**Working state:** Preserve the untracked `docs/concept/` tree and the untracked plans under
`docs/plan/`; none of them is in scope.

## Requirement

Work package 1 (Codex exec spike) of `docs/concept/2026-09-29-issue-buddy.md`: verify that the
portable Effective Flow build delegates to sub-agents and completes without any question under
llm-automatisator's generated `codex exec` invocation, and record the evidence. The concept names
this as the first risk to settle ("Codex exec behaviour" under Risks): both properties are
inferred, not tested.

The result is a written evidence document with no product change. It states, per run, the
delegation behaviour, the no-question behaviour, and the time taken, and it closes with a verdict
for each and the consequence for the later packages.

The operator approved Codex CLI `0.163.0` for the isolated primary matrix after updating the CLI
for the newer worker model. The generated contract and production-supported pin remain `0.153.4`.
The accepted deliverable is compatibility evidence for `0.163.0`, plus two supplementary `0.153.4`
baselines; it does not establish the originally proposed full matrix on the production pin.

Sibling plans (Issue Buddy roadmap):

- Depends on: none.
- Depended on by: `docs/plan/2026-10-01-unattended-planning-and-readiness-contract.md` (WP2),
  which uses the no-question result for its ask-site mapping and contract test, and
  `docs/plan/2026-10-01-issue-buddy-tool-stage-1.md` (WP5), which relies on the delegation
  result. The llm-automatisator plan `2026-10-01-issue-buddy-dry-run-auftrag.md` (WP6a) relies
  on the time and environment results.
- Order across the roadmap: this spike (WP1) → WP2 and
  `docs/plan/2026-10-01-shared-plan-publication-core.md` (WP4) in parallel →
  `docs/plan/2026-10-01-issue-buddy-runtime-script.md` (WP3) → WP5 → WP6a → WP6b; WP7 calibrates
  after WP6a and enables publication after WP6b.

Workflow rationale: Documentation, because nothing under `src/`, `build.mjs`, `scripts/`, or
`evals/` changes and the deliverable is one developer-guide document. The spike runs are the
evidence-gathering part of writing that document; their raw output is not committed.

## Architecture decisions

- **The invocation comes from llm-automatisator's own code, never from a hand-written argument
  list.** The argument vector, working directory, stdin, and environment are produced by
  `buildRunnerCommand` (`llm-automatisator/src/codex/process.ts:66-94`), which wraps
  `buildInvocation` (`src/codex/contracts.ts:293-334`), from a contract validated by
  `parseContract` (`contracts.ts:187-273`) against a spike-specific `deploymentLayout`. Local
  runs pass `privilegeDrop: 'none'` (`process.ts:33-40`). The guest run uses the default
  `setpriv` with `unshare`. The throwaway driver script that calls these functions lives in a
  scratch directory and is not committed in either repository.
- **Approved isolated binary: Codex 0.163.0; generated contract: 0.153.4.** The contract still
  accepts only `0.153.4`. The primary matrix used the operator-approved `0.163.0` binary without
  changing product code or the production pin. Each primary run records `actualCodexVersion`,
  `contractCodexVersion`, and `invocationCompatibilityOnly: true`. Generated arguments are
  unchanged after path normalization. Two earlier `0.153.4` baselines remain supplementary.
- **Run locally first, then confirm once on the guest.** Local runs are cheap but differ in
  operating system, `PATH` contents, and privilege drop. The guest run is the authoritative one
  for tool availability and the environment. Every difference is recorded in the document.
- **Two workloads, each run at least twice locally.**
  - _Baseline:_ the portable `plan` tool as shipped, invoked with an inline requirement. A
    question is expected here; the run documents how one shows up under `codex exec`.
  - _Unattended preamble:_ the same requirement behind a prose preamble. The preamble says that
    nobody can answer, that every point where the run would ask becomes an open point in the
    plan, that the deep plan review follows with "Decide later" for every decision, and that the
    turn must not end on a question. `plan` does not parse a `Run state:` line today; that
    arrives in WP2. This workload therefore tests whether prose alone is enough.
- **Raw evidence stays uncommitted.** Each run's JSONL event stream and `last-message.txt` are
  kept under this checkout's ignored `.effective-flow/spikes/codex-exec/<run-id>/`. The document
  records their SHA-256 digests and the one command that derives the summary from them.
- **Failure handling** (per the planning decision). A failed no-question criterion does not
  block WP2: the document records the observed failure mode and a recommended fallback. A
  delegation failure (no sub-agent start in any run) is escalated as a revision of the concept's
  Technical direction. The concept file itself is not edited by this plan.

## Affected files

| File                                                     | Description                                                                                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/codex-exec-unattended-evidence.md` | New dated evidence record: question, setup and versions, method, per-run results, verdicts, consequences for WP2/WP5/WP6a, limits.                                                                        |
| `docs/developer-guide/README.md`                         | Add one "See also" entry for the evidence record, worded as a point-in-time record like the existing architecture-review entry. It does not join the reading order, because it is not a living reference. |

The delivered spike changed only these two tracked files; it left the source plan unchanged.
This follow-up reconciliation changes only this plan, including its completion status and archive
location. No llm-automatisator file or production configuration changes.

## Implementation details

### Approach

1. **Fix the inputs.**
   - Record the effective-flow and llm-automatisator commits.
   - Ask the operator for the model and reasoning effort intended for the Issue Buddy job, and
     confirm guest access before any run.
   - Fix one fixture requirement: a small, well-described change to the throwaway test
     repository, written for this spike, containing no third-party text and no instructions
     aimed at the agent.
2. **Build the portable target.** Run `node build.mjs` on the recorded commit. Copy
   `dist/portable/effective-flow/` into a snapshot directory inside the spike layout's skill
   root. Record the snapshot digest: SHA-256 over the sorted list of per-file digests, with the
   command written into the document.
3. **Obtain the approved Codex binary.** Use `0.163.0` for the isolated primary matrix and retain
   the two original-pin `0.153.4` baselines separately. Use the vendor artifact from the npm
   registry, checked against its `dist.integrity`. Ask the user before the download, naming the
   package, source, and size. The binary sits at the layout's `<installRoot>/codex/bin/codex`.
   `codex --version` must report the actual binary version. Preserve the `0.153.4` contract
   validation and record the approved binary substitution explicitly; never infer production
   support from a compatibility run.
4. **Prepare an isolated home and workspace.**
   - Create the spike layout with `deploymentLayout` overrides, so that `stateRoot` points to a
     scratch directory outside every repository.
   - Create one Codex home under `<stateRoot>/homes/0`. The user signs it in with
     `codex login` under that `CODEX_HOME`. The agent never reads, copies, or prints
     credential files.
   - Create the workspace under `<stateRoot>/workspaces/<name>` as a fresh Git repository, with
     an `AGENTS.md` setup marker and a project-setup ADR: `plan.dir` `docs/plan`, all
     `language.*` `en`, `tracker.mode` `local`, no remote, not hidden.
5. **Generate the command.**
   - The scratch driver builds a contract with `repository: true`, `maxSeconds: 3600`, the chosen
     model and effort, and one skill entry `effective-flow` whose files and digests come from
     the snapshot.
   - The prompt is the workload text, using the `$effective-flow plan …` form.
   - The driver calls `parseContract` and `buildRunnerCommand` and writes the resulting command
     to the run directory before anything is spawned.
   - The generated contract declares `0.153.4`; record the actual `0.163.0` binary separately,
     together with the compatibility-only flag. Do not change the contract guard.
6. **Run the local matrix.**
   - Four runs: baseline ×2 and unattended preamble ×2. Each starts from a fresh copy of the
     workspace, records wall-clock start and end, and is terminated at 3600 s if still running.
   - Store `events.jsonl` (stdout), stderr, `last-message.txt`, exit code or signal, and the
     final `git status` of the workspace under the run directory.
7. **Run on the guest.**
   - The operator runs the unattended-preamble workload once on the llm-automatisator guest with
     Codex `0.163.0` and the default `unshare`/`setpriv` command, as the runner user.
   - The run uses its own spike layout, its own Codex home signed in by the operator, and its
     own workspace. It never uses a service home-pool slot, workspace, or skill snapshot, and it
     does not go through the service.
   - The operator returns the same artefacts and the digests.
8. **Classify each run.** Apply the rules below to each run's artefacts:
   - _Delegation:_ record unique `collab_tool_call` items separately from child lifecycle proof.
     Use retained parent-linked child rollouts to establish starts and terminal ordering; the
     JSONL wait items alone expose neither complete child identity nor lifecycle state. Distinguish
     successful completion from an aborted child and its replacement, and report inline fallback.
   - _Question:_
     - Compile the list of rendered portable ask questions on the path. Every Codex/portable ask
       renders as `Ask the user: **<question>**` (`build-lib.mjs:3218-3278`). Take them from the
       built `tools/plan.md`, `tools/plan-review.md`, and the shared files they load.
     - A run is `ended-on-question` when its last message contains any of those questions, or
       when it otherwise asks the user to choose or confirm. Record the matched string or a short
       quoted excerpt as justification.
   - _Terminal state:_ one of `completed`, `ended-on-question`, `failed`, `timed-out`, or
     `ended-with-pending-child`. Also record whether a plan file exists under `docs/plan/`, and
     whether it has a filled `## Plan review` section and an `## Open points` section.
   - _Load behaviour:_ the skill files the run read (from `command_execution` items), compared
     with the router's rule of loading only the invoked tool. The service's stdin line says
     "and its referenced files" (`contracts.ts:325`), which may cause eager reading.
   - _Environment:_ whether `node`, `git`, and `pnpm` were reachable in the agent shell.
     Record the current runner's separate agent-tool directory plus `/usr/bin:/bin`, rather than
     assuming the earlier layout. macOS has no `node` in those system directories; successful
     local runs discovered an absolute Node path.
9. **Write the evidence document** in English with these sections:
   - question and scope;
   - setup table: versions, commits, snapshot digest, model and effort, and local-versus-guest
     differences;
   - method: how the command was generated, the workloads (the preamble quoted in full), and the
     classification rules;
   - results table, one row per run;
   - verdicts for delegation, no-question, and time;
   - consequences:
     - WP2: which ask sites were hit, and whether a prose preamble suffices or a service-side
       question detector is needed as a fallback;
     - WP5: delegation and load behaviour;
     - WP6a: duration against the cap, and the environment;
   - observed contradictions, if any. Candidate example: the portable preamble says to stop when
     sub-agents are unavailable (`build-lib.mjs:3066`), while `src/shared/delegation-mandate.md`
     says to work inline and say so;
   - limits.
10. **Link and check.** Add the README "See also" entry, format both files with `pnpm format`,
    and run the validation plan.

### Edge cases

- **Unavailable approved binary:** stop and obtain an explicit version decision; never silently
  substitute another version. The `0.163.0` substitution recorded here was approved by the operator.
- **Agent shell lacks `node` locally:** keep the exact environment rather than widening `PATH`,
  record the failures as a local-only difference, and rely on the guest run for that dimension.
- **Turn ends while a child is still running:** classify as `ended-with-pending-child`, which is
  a delegation finding, not a success.
- **Run reaches 3600 s:** classify as `timed-out`, keep the partial stream, and count it in the
  time verdict.
- **Run tries to reach a forge or the network beyond the model provider:** the workspace has no
  remote. Record any such attempt seen in the stream.
- **Run writes outside its workspace:** compare the scratch layout and the effective-flow
  checkout's `git status` before and after each run, and record any write outside the workspace.
- **A secret appears in a stream, for example a token printed by a tool:** do not quote it in
  the document. Report it to the user and keep the raw file uncommitted.
- **Operator cannot provide guest access:** stop before step 7 and report back. Do not mark the
  plan complete with the guest dimension missing.

### Stop conditions

- The llm-automatisator pin or invocation changed since planning: re-read the contract and process
  sources and record the measured commit. The completed spike used `cc5eb3a`; its contract still
  pins `0.153.4`. This record does not authorize a new version or another measurement matrix.
- `parseContract` rejects the spike contract for a reason that would require changing
  llm-automatisator code: stop. This package changes no product code.
- A run touches files outside the scratch layout: stop the matrix and report before continuing.

## Acceptance criteria

- [x] `docs/developer-guide/codex-exec-unattended-evidence.md` exists and names:
  - the approved primary binary (`0.163.0`), the generated contract and production pin (`0.153.4`),
    and the compatibility-only interpretation;
  - the effective-flow and llm-automatisator commits;
  - the portable snapshot digest;
  - the model and reasoning effort.
- [x] The document lists two local baseline runs and two local unattended-preamble runs with
      `0.163.0`, plus one guest unattended run and two supplementary `0.153.4` baselines. Each
      primary row gives the environment, workload, exit code or signal, terminal state, duration
      in seconds, unique `collab_tool_call` count, and plan/review state; the raw-file digests are
      listed separately. Supplementary rows give CLI, environment, exit/signal, duration, outcome,
      available child observations, and raw-file digests without implying full primary-row coverage.
- [x] The document states three verdicts, each backed by those rows:
  - delegation observed or not;
  - completed without a question or not;
  - maximum duration against the 3600 s cap.
- [x] The document records the failed baseline controls, the aborted-and-replaced child, the
      guest plan's deferred decision, and consequences for WP2/WP5/WP6a. It does not equate a
      question-free final message with implementation readiness or with all children completing.
- [x] The document records every local-versus-guest difference observed, and the load behaviour
      (which skill files were read).
- [x] `docs/developer-guide/README.md` links the document under "See also".
- [x] PR #574 changes exactly the two declared documentation files; the spike changes no tracked
      llm-automatisator file. This follow-up changes only the reconciled plan.
- [x] The spike validation plan passed; the completion record below identifies its evidence.

## Validation plan

- `pnpm agent:check` (formatting) → exit 0.
- `pnpm test` → exit 0, including the documentation guards.
- `node build.mjs` → exit 0. Its guard requires a developer-guide README once the category holds
  documents.
- `pnpm eval merge-gate verify` (read-only) → its verdict is unchanged by this docs-only change.
- Manual: re-run the summary command recorded in the document against the stored JSONL. It must
  reproduce the results table's counts, and the recorded digests must match the stored files.
- Manual: read the document against the acceptance list. Confirm it holds no session id, no
  credential path content, and no secret.

## Assumptions and open points

- The operator has access to the llm-automatisator guest (the AP7b target guest) with Codex
  0.153.4 installed, and can create a spike layout there without touching the service's state
  root.
- The operator names the model and reasoning effort before the first run. If they do not, the
  model and effort of the guest's active standards job are used and named as such.
- Concept claim, not re-verified here: sub-agents are enabled by default in Codex under
  `--ignore-user-config`. The spike tests this rather than assuming it.
- The spike has no forge access. Holding a forge token inside the run belongs to WP6b.
- Running without a Codex sandbox (`danger-full-access`) on the maintainer's machine is
  accepted for this spike. The mitigations are: `HOME` and `CODEX_HOME` point into the scratch
  layout, the fixture holds no third-party text, and writes are checked before and after each
  run.
- The primary results are bound to actual Codex `0.163.0`, a generated `0.153.4` contract,
  Effective Flow `baa7474`, llm-automatisator `cc5eb3a`, and parent `gpt-5.6-sol` at `medium`
  effort. Observed deep worker contexts include `gpt-6.1-sol` at high effort. The two original-pin
  baselines do not establish full `0.153.4` behavior. Any changed binary, contract, or snapshot
  needs fresh qualification before production use; WP6a may link the point-in-time record.
- Deferred and out of scope: Forgejo, the Claude Code backend, any change to `src/`, any
  llm-automatisator change, and editing the concept file.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important:** a hand-written argument list would make "pinned invocation" an
  unverifiable claim. Incorporated: the command is generated by llm-automatisator's own
  `buildRunnerCommand` and stored before spawning.
- **Security, Important:** a local run has no Codex sandbox and runs with the maintainer's user
  rights. Incorporated: `HOME` and `CODEX_HOME` point into the scratch layout, the fixture holds
  no third-party text, writes are checked before and after each run, and a stop condition
  applies. The residual risk is listed under Assumptions.
- **Security, Important:** the guest run could disturb the live service. Incorporated: it uses
  its own layout, home, and workspace and never a service pool slot or snapshot.
- **Data protection, Important:** event streams carry session ids, paths, and possibly tool
  output. Incorporated: raw files stay uncommitted with digests, and the document is checked for
  ids and secrets.
- **Error cases, Important:** a turn ending while a child runs would look like success.
  Incorporated as the `ended-with-pending-child` state.
- **Testability, Important:** "no question" needs a decidable rule. Incorporated: matching
  against the compiled rendered ask strings, with a quoted justification for every
  `ended-on-question`.
- **Error cases, Note:** there may be no local 0.153.4 artifact. Covered by the guest-only
  fallback without version substitution.
- **Scope, Note:** documenting the delegation-mandate contradiction tempts a fix. The plan
  records it only; any fix belongs to a separate plan.
- **Maintainability, Note:** the document is a point-in-time record. Hence its "See also"
  placement and the explicit version binding.
- **Cross-plan alignment (2026-10-01):** the sibling list now states the binding roadmap order
  (WP1 → WP2 ∥ WP4 → WP3 → WP5 → WP6a → WP6b, WP7 after WP6a and WP6b). No interface of this
  spike changed.

### Reconciliation — 2026-10-18

**Result:** Approved

The operator's version decision supersedes the original `0.153.4`-only matrix requirement for
this completed documentation package. PR #574 merged the evidence record and its README link;
the production pin remains unchanged. The original review above is retained as planning history.

Verified completion evidence:

- Five primary `0.163.0` runs and two supplementary `0.153.4` baselines are recorded. All three
  unattended runs ended without a question after manual review. Maximum primary duration was
  `180.629` seconds against the `3600`-second cap.
- Delegation was observed through child rollouts. One initial child aborted and was replaced;
  all observed children terminated before their parent, but not every child completed successfully.
- The guest fixture retained a blocking decision with `Revision required`. That is a measured
  fixture outcome, not unfinished work in this evidence package. WP2 must handle readiness separately.
- Formatting, 2,625 passing tests with one platform skip, build, and merge-gate eval verification
  passed for PR #574. Eight pre-existing stale eval scenarios were unchanged. The retained report
  reproduced the table and all 14 published raw-file hashes matched.

No new spike, production upgrade, or product change follows from marking this package implemented.
The original `0.153.4` matrix remains unperformed beyond its two supplementary baselines.

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Findings

- **Testability, Important, incorporated:** the full classification-field criterion now applies
  only to the five primary rows. Supplementary baselines have their own narrower evidence
  criterion. The final independent plan review found no remaining findings.
- **Deep retrospective plan review (2026-10-18):** requested by the operator after reconciliation;
  no findings or blocking open points. The implemented status is retained; no follow-up execution
  is required by this review.

## Open points

- No open points.

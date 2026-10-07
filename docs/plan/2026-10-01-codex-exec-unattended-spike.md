# Codex exec spike: delegation and question-free completion of the portable build

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/codex-exec-unattended-evidence.md

**Planned against:** effective-flow `e846936` and llm-automatisator `d800310` on 2026-10-01.
**Working state:** Preserve the untracked `docs/concept/` tree and the untracked plans under
`docs/plan/`; none of them is in scope.

## Requirement

Work package 1 (Codex exec spike) of `docs/concept/2026-09-29-issue-buddy.md`: verify that the
portable Effective Flow build delegates to sub-agents and completes without any question under
llm-automatisator's pinned `codex exec` invocation, and record the evidence. The concept names
this as the first risk to settle ("Codex exec behaviour" under Risks): both properties are
inferred, not tested.

The result is a written evidence document with no product change. It states, per run, the
delegation behaviour, the no-question behaviour, and the time taken, and it closes with a verdict
for each and the consequence for the later packages.

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
- **Codex 0.153.4 only.** That is the only version the contract describes
  (`SUPPORTED_CODEX_VERSION`, `contracts.ts:36`). The locally installed `codex-cli 0.157.0`
  (Homebrew) is never used for a recorded run.
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

No other tracked file in either repository changes.

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
3. **Obtain Codex 0.153.4.** Use the vendor artifact for the local platform from the npm
   registry, checked against its `dist.integrity`. Ask the user before the download, naming the
   package, source, and size. The binary sits at the layout's `<installRoot>/codex/bin/codex`.
   `codex --version` must report `codex-cli 0.153.4`. If no 0.153.4 artifact exists for the local
   platform, skip the local runs and run the full matrix on the guest instead (see Edge cases).
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
6. **Run the local matrix.**
   - Four runs: baseline ×2 and unattended preamble ×2. Each starts from a fresh copy of the
     workspace, records wall-clock start and end, and is terminated at 3600 s if still running.
   - Store `events.jsonl` (stdout), stderr, `last-message.txt`, exit code or signal, and the
     final `git status` of the workspace under the run directory.
7. **Run on the guest.**
   - The operator runs the unattended-preamble workload once on the llm-automatisator guest with
     Codex 0.153.4 and the default `setpriv` command, as the runner user.
   - The run uses its own spike layout, its own Codex home signed in by the operator, and its
     own workspace. It never uses a service home-pool slot, workspace, or skill snapshot, and it
     does not go through the service.
   - The operator returns the same artefacts and the digests.
8. **Classify each run.** Apply the rules below to each run's artefacts:
   - _Delegation:_ the number of `collab_tool_call` items in the stream (the item type the
     service already accepts, `llm-automatisator/src/codex/events.ts:54`). Also record whether
     every started child completed before `turn.completed`, and whether the run reported
     delegation as unavailable or worked inline.
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
     `CHILD_ENVIRONMENT` fixes `PATH=/usr/bin:/bin` (`llm-automatisator/src/codex/layout.ts:127`),
     and macOS has no `node` there.
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

- **No local 0.153.4 artifact:** skip the local runs, and run the guest matrix with ≥2 runs per
  workload. The document states this. Never substitute 0.157.0.
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

- The llm-automatisator pin moved away from 0.153.4, or `buildInvocation` changed since
  `d800310`: re-read `contracts.ts` and `process.ts` before running, and record the new commit.
- `parseContract` rejects the spike contract for a reason that would require changing
  llm-automatisator code: stop. This package changes no product code.
- A run touches files outside the scratch layout: stop the matrix and report before continuing.

## Acceptance criteria

- [ ] `docs/developer-guide/codex-exec-unattended-evidence.md` exists and names:
  - the Codex version as reported by the binary (`0.153.4`);
  - the effective-flow and llm-automatisator commits;
  - the portable snapshot digest;
  - the model and reasoning effort.
- [ ] The document lists ≥2 baseline runs and ≥2 unattended-preamble runs (locally, or on the
      guest when no local artifact exists), plus ≥1 guest run of the unattended preamble. Each row
      gives the environment, workload, exit code or signal, terminal state, duration in seconds,
      `collab_tool_call` count, whether a plan file was produced, and the raw-file digests.
- [ ] The document states three verdicts, each backed by those rows:
  - delegation observed or not;
  - completed without a question or not;
  - maximum duration against the 3600 s cap.
- [ ] Each failed verdict names its consequence: a WP2 fallback for the question criterion, or a
      concept revision for delegation.
- [ ] The document records every local-versus-guest difference observed, and the load behaviour
      (which skill files were read).
- [ ] `docs/developer-guide/README.md` links the document under "See also".
- [ ] No tracked file other than those two changes in effective-flow, and none changes in
      llm-automatisator (`git status` in both checkouts).
- [ ] The validation plan passes.

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
- The results are bound to Codex 0.153.4. A later pin change in llm-automatisator makes the
  document stale; the document says so. WP6a may add a pointer to it from llm-automatisator.
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

## Open points

- No open points.

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
CLI substitution. This archived plan records completion; its execution steps are historical and
leave no authorization for another run.

**Original planning context:** effective-flow `e846936` and llm-automatisator `d800310` on
2026-10-01. The untracked concept and plans in that checkout were outside the spike's scope.
**Reconciliation planning context:** effective-flow `e7117a36` and llm-automatisator `cc5eb3a4`
on 2026-10-18, in a clean planning checkout; unrelated local plans in both repositories remained
out of scope. The measured Effective Flow snapshot comes from `baa74743`, not that planning HEAD.

## Requirement

Work package 1 (Codex exec spike) of `docs/concept/2026-09-29-issue-buddy.md`: record whether the
portable Effective Flow build delegates to child sessions and ends without a question under a
runner-generated `codex exec` invocation. Distinguish measured compatibility from support for the
production CLI pin, and question-free termination from implementation readiness.

Reconcile the evidence already delivered in [PR #574](https://github.com/sebastian-software/effective-flow/pull/574)
before considering additional experiments. The PR merged into `develop` as `9043181ca1031e424d44447a35bd79cf2e29f534`
on 2026-10-18. On that date the operator explicitly selected the
updated CLI `0.163.0` for the new worker model. The production contract still supports `0.153.4`.
This approved substitution changes the primary evidence matrix, not the production version contract.
Four local runs and one guest run use `0.163.0`; two supplementary local baselines use `0.153.4`.
Do not repeat those runs simply because the original plan still named only `0.153.4`.

The deliverable remains a point-in-time developer-guide document and its index link. If the merged
PR already meets this plan's acceptance criteria, retain both documents unchanged and complete the
normal implementation workflow's plan verification and archival. The 2026-10-18 planning revision
initially kept this plan open pending that verification. The completed verification and archival
recorded below supersede that historical open status.

Sibling plans (Issue Buddy roadmap):

- WP2 is implemented: `docs/plan/archive/2026-10-01-unattended-planning-and-readiness-contract.md`.
  Its formal unattended envelope and readiness rules are a separate contract from this spike's
  earlier prose preamble. Do not label the spike as validation of that newer envelope.
- WP4 is implemented: `docs/plan/archive/2026-10-01-shared-plan-publication-core.md`.
- WP3 (`docs/plan/2026-10-01-issue-buddy-runtime-script.md`) and WP5
  (`docs/plan/2026-10-01-issue-buddy-tool-stage-1.md`) consume the evidence limits. WP5 must not
  infer child lifecycle from JSONL wait counts alone.
- WP6a in llm-automatisator (`2026-10-01-issue-buddy-dry-run-auftrag.md`) must check the deployed
  CLI, portable snapshot and tool environment before using these results. Production-pin
  unattended proof and validation of a later formal envelope remain outside this historical spike.

Workflow rationale: Documentation, because this package records and reconciles evidence without
changing runtime behavior, version pins, or the concept. No source or test changes are planned.

## Architecture decisions

- **Reuse measured evidence first.** Inspect PR #574 and the retained artifacts; wait for its
  delivery before closing this package. Do not duplicate its documentation or start another
  merge-gate. Update the existing target only for verified acceptance gaps.
- **Preserve the measured invocation.** The scratch driver calls llm-automatisator's
  `parseContract` and `buildRunnerCommand`, which wraps `buildInvocation` in
  `src/codex/contracts.ts`. The generated contract declares `0.153.4`; the primary driver
  substitutes the `0.163.0` binary without changing generated arguments or product code.
  Record `actualCodexVersion`, `contractCodexVersion`, and `invocationCompatibilityOnly: true`
  for the primary matrix. Never describe that substitution as product-supported execution.
- **Keep the original workloads and snapshot.** The baseline uses the portable `plan` tool with
  a small inline fixture requirement. The second workload adds the recorded prose preamble:
  no questions, automatically enter deep review, defer decisions as open points, and finish
  with a completion report. Quote the actual requirement and preamble in the evidence document.
  The snapshot predates WP2; rebuilding current HEAD would create a different experiment.
- **Separate observation channels.** Exec stdout JSONL, the final-message file, supplementary
  parent-linked child rollouts, environment probes and manual adjudication establish different
  facts. A `collab_tool_call` count does not establish how many children started or completed.
  Record aborted/replaced children separately from completed and pending children.
- **State the question claim narrowly.** Match compiled ask strings and manually inspect all
  unattended final messages for direct or indirect requests to choose, confirm or supply input.
  This proves no final question for the observed runs, not absence of questions throughout every
  transcript or readiness to implement. A guest plan with `Revision required` remains blocked.
- **Retain private raw evidence at the primary runtime root.** The existing evidence is under
  `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/codex-exec/2026-10-18-01630/`, not relative to an
  arbitrary linked checkout. Publish only aggregate findings, provenance and digests; no session
  identifiers, credential contents or machine-specific absolute paths.

## Affected files

| File                                                     | Description                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/codex-exec-unattended-evidence.md` | Reuse the existing dated evidence record; correct only verified gaps in provenance, method, results or limits. |
| `docs/developer-guide/README.md`                         | Verify the point-in-time record has one “See also” link; add or correct it only if absent or wrong.            |

These are the only substantive documentation targets. Normal implementation-workflow status and
archival changes to this source plan are the lifecycle exception. No other tracked file changes;
llm-automatisator remains untouched. No new measurements, downloads, logins, guest operations or
model calls are authorized by this planning revision.

## Implementation details

### Approach

These steps describe the evidence reconciliation that was completed on 2026-10-18.

1. **Check delivery and drift.** Read PR #574 and compare the delivered document with its current
   version. If it is still open, leave its delivery to its existing merge-gate and keep this
   package pending delivery. Use the delivered commit as the document source after merge;
   do not copy from an unrelated checkout or overwrite newer documentation.
2. **Verify the recorded setup.** Retain these measured inputs separately from current HEAD:
   - Effective Flow `baa74743adfe05ea90b3dec782904ff8e1abff9a`;
   - llm-automatisator `cc5eb3a4e20e71ff1cc327e8efa3904d446aff47`;
   - 142-file portable snapshot, digest
     `5422b6129e618f5961fe12a4f1b7bffdd81b73f64dc60031f182c27a144bab4d`;
   - parent model `gpt-5.6-sol`, effort `medium`;
   - actual primary CLI `0.163.0`, contract CLI `0.153.4`, and two original-pin baselines.
     Read `src/codex/{contracts,process,layout}.ts` in llm-automatisator if invocation details
     need verification; harmless line movement does not invalidate the historical evidence.
3. **Inspect the retained report generator before running it.** Check `report.mjs` and the
   `summarize.mjs` and `rollout-evidence.mjs` it invokes for writes, model calls and external
   commands. Only a verified read-only report regeneration is part of this reconciliation.
   From `RUNTIME_STATE_ROOT`, the recorded command is
   `node .effective-flow/spikes/codex-exec/2026-10-18-01630/report.mjs`.
   Match its tooling, snapshot and per-run raw-file digests with the document. Describe the
   digest serialization exactly as implemented by the retained tooling, including path order,
   prefix and separator bytes; do not replace it with a similar-looking hashing recipe.
4. **Reconcile all seven rows.** The primary matrix is baseline ×2 and prose preamble ×2
   locally, plus one guest preamble run. Retain failed controls and the two supplementary
   `0.153.4` baseline rows. For each primary row verify environment, workload, exit/signal,
   duration, protocol completion, adjudicated terminal state, plan/review/open-point state,
   unique JSONL collaboration calls, raw digests and supplementary child lifecycle.
5. **Apply these classification rules.**
   - Require observed `turn.completed` for protocol completion; exit 0 alone cannot prove
     task success. Preserve explicit run-local adjudication and its digest.
   - Classify final outcome as `completed`, `ended-on-question`, `failed`, `timed-out` or
     `ended-with-pending-child`. Keep review readiness and child completion as independent fields.
   - Count observed parent-linked children from retained rollouts; record successful completion,
     abort/replacement and pending state before parent completion separately. Do not infer
     absence of unrecorded children from a partial graph.
   - Combine compiled final-ask matching with manual inspection of all three unattended final
     messages. Record a short reason for each question or failure classification.
   - Limit load-behavior claims to command paths actually observed. Printed aggregate output
     does not prove a skill file was read or semantically consumed.
6. **Verify environment claims.** Record local `privilegeDrop: 'none'` versus guest
   `unshare`/`setpriv`, dedicated homes/workspaces and the actual Node/Git/pnpm probes.
   The current runner prepends `agentToolsRoot` to `/usr/bin:/bin`; do not repeat the old
   fixed-PATH claim. Record successful local recovery via an absolute Node path without
   portraying it as normal PATH availability. Unchanged repository Git status is not a whole-OS
   write audit; a separate home is not OS isolation when using `danger-full-access` locally.
7. **Write only necessary corrections.** Keep the dated scope, setup, workloads, method,
   results, verdicts, load behavior, downstream consequences, limits, retention and raw-digest
   sections. Preserve the measured prose-preamble result and state that it does not test WP2's
   formal envelope. The longest completed primary run is 180.629 seconds against a 3600-second
   cap; one fixture and one guest repetition establish no broader runtime guarantee.
   The guest deferred a blocking decision; local unattended-2 had one aborted/replaced child.
8. **Verify the index and close through the implementation workflow.** Retain the “See also”
   placement rather than inserting the historical report into the guide's reading order.
   If both documents already pass, make no cosmetic evidence changes. The implementing
   workflow verifies acceptance and handles the source plan's normal status and archival.

### Edge cases and stop conditions

- **Raw evidence missing or a digest differs:** report the exact missing artifact or mismatch.
  Do not manufacture a pass, silently regenerate raw artifacts or launch substitute runs.
  Re-enter planning with the concrete missing evidence if a new experiment is necessary.
- **PR #574 changes during reconciliation:** re-read its delivered artifact and scope; do not
  overwrite it with an older worktree copy. An open PR is not proof of merged delivery.
- **Current CLI or runner differs:** keep historical rows bound to their measured inputs. A
  prospective production-pin change or a new run matrix needs a separate implementation scope.
- **Child evidence is incomplete:** state unknown lifecycle coverage. Pending children are a
  delegation finding; a terminated aborted child is not a successfully completed child.
- **Missing `node` or pnpm:** retain the observed failure or recovery; never alter the measured
  command/environment to make an existing row pass.
- **Credential/session data in retained artifacts:** inspect only the necessary noncredential
  evidence. Do not read authentication files or publish raw streams. Redact secret values from
  documentation and report their presence without reproducing them.
- **No observed delegation:** record the failure and escalate the concept's technical direction
  for a separate decision; this package never edits the concept. A question failure yields a
  downstream detector/fallback requirement, not an automatic rerun or product fix.

## Acceptance criteria

- [x] The delivered evidence document names the measured source commits, portable snapshot
      digest and file count, parent model/effort, actual CLI `0.163.0`, declared CLI `0.153.4`,
      and the compatibility-only substitution without claiming production-pin support.
- [x] All five primary rows and both supplementary baselines are present. Primary rows include
      environment/workload, exit/signal, duration, terminal outcome, plan/review/open-point state,
      JSONL call count and supplementary child status. Raw event/final-message digests and
      retained adjudications are reproducible with the inspected report tooling.
- [x] Delegation, no-final-question and duration have separate evidence-backed verdicts. The
      aborted/replaced child and limited rollout coverage are explicit; all three unattended
      final messages have manual question review, and the guest's blocking point is retained.
- [x] Local/guest isolation, PATH/tool availability, absolute-Node recovery, observed skill
      loads and limits of repository-status checks are stated without stronger safety claims.
- [x] The document distinguishes the pre-WP2 prose preamble from the formal WP2 contract and
      states the remaining production-pin and current-envelope proof limits for WP5/WP6a.
- [x] The developer-guide README has one correct “See also” link to the dated record.
- [x] PR #574's delivery is verified; no duplicate evidence PR or new model run is created.
      Substantive edits stay within the two documentation targets; source-plan archival is the
      only tracked lifecycle exception. llm-automatisator has no changes from this package.
- [x] The validation plan passes, with pre-existing behavioral-eval drift reported accurately.

## Validation plan

- Inspect and run the retained read-only report command; compare every published raw digest,
  setup field, result row and child ordering against its output. Manually review the three
  unattended final messages and match adjudications to their recorded reasons.
- Check the document against the acceptance list and for session identifiers, credentials and
  machine-specific absolute paths. Verify the README link and the exact tracked path scope.
- For an evidence-document correction: format only the two affected Markdown files with the
  configured formatter, then run `pnpm agent:check`, `pnpm test`, and `node build.mjs` in that
  order. For unchanged delivered documents, cite the verified PR checks rather than rerunning
  a model experiment or repeating checks without a new change.
- Compare `pnpm eval merge-gate verify` before/after any documentation correction. Existing
  stale evidence is reported as pre-existing; documentation must not create additional drift.
- The planning revision itself ran only the plan formatter and `plan-lint`. Subsequent
  implementation validation is recorded below; neither phase altered the recorded run artifacts.

## Assumptions and open points

- Verified: the operator selected the active standards-job values (`gpt-5.6-sol`, `medium`),
  confirmed both isolated logins and guest access, and then authorized the newer CLI for the
  primary matrix. Do not ask those choices again to reconcile the existing record.
- Verified: the production version guard remains `0.153.4`; compatibility substitution is
  recorded by the scratch driver, not introduced in product code.
- The private retained artifacts remain available for independent verification. Missing data
  is a stop condition, not an assumption that a verdict passed.
- Deferred to the downstream production preflight: evidence for the actually deployed supported
  CLI and current formal unattended envelope. These limits do not prevent completion of the
  operator-approved historical compatibility spike; they prevent a broader readiness claim.
- Out of scope: new experiments, model/version selection, Forge access, Claude Code, source or
  runner changes, and edits to the concept or sibling plans.

## Plan review

**Result:** Approved

### Revision 2026-10-18

The revision incorporates the operator's approved CLI substitution and existing PR #574 evidence.
The gap check found one history-placement note, incorporated by preserving the original review
under its own dated heading. The independent final plan review found no further findings.
All quality scorecard criteria pass: concrete scope and references, measurable acceptance,
verified context with bounded assumptions, justified Documentation routing and a consistent target.
No implementation changes or blocking decisions remain in the plan.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    1 |

The one maintainability note is incorporated; there are no unresolved findings.

### Deep interactive review 2026-10-18

The operator requested the deep review after the internal review. Its independent judgment found
no further unknowns, contradictions or decisions requiring clarification. No critical findings or
implementation-blocking open points remain. At that review, the plan was ready for Documentation, with evidence
verification and any necessary corrections before normal plan completion. That handoff is now
closed by the completion record below; no new experiments were part of it.

### Retrospective reconciliation review 2026-10-18

The PR #576 reconciliation retained the original review and accepted the operator's `0.163.0`
substitution for this completed documentation package. The full classification-field criterion
applies to the five primary rows; the two supplementary baselines retain their narrower evidence
scope. The independent final plan review found no remaining findings. The operator then requested
a deep retrospective review, which found no blocking open points and retained Implemented status.

The guest fixture's `Revision required` state is a measured outcome, not unfinished work in this
evidence package. The original full `0.153.4` matrix remains unperformed beyond its two
supplementary baselines. Completion authorizes no new spike, production upgrade, or product change.

### Original review 2026-10-01

The original review is retained as planning history; later measured limits and reconciliation
above govern the completed evidence package.

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

#### Findings

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

## Test results

The PR #574 delivery validation recorded formatting, 2,625 passing tests with one platform skip,
a successful build, and merge-gate eval verification. Its eight pre-existing stale scenarios were
unchanged. The retained report reproduced the table and all 14 published raw-file hashes matched.
This is the original delivery event, distinct from the later reconciliation validation below.

The later reconciliation validation recorded in `develop` (`85e160a`) completed successfully: `pnpm test` exited 0 with 2,640 tests
run, 2,639 passing, no failures and one skipped test; `pnpm agent:check`, `node build.mjs`, and
`pnpm eval merge-gate verify` also exited 0. The merge-gate verification found five of five
checks stale for each of the eight existing merge-gate scenarios because `SKILL.md`,
`shared/model-tiers.md`, and `shared/next-steps.md` differ from the archived behavioural
evidence. The retained report audit matched seven runs, 142 snapshot files, all 14 published raw
hashes, and the three unattended final messages. No new drift was introduced by these
documentation-only sources.

## Review findings

The direct documentation gap was clarified: the prose preamble is distinct from WP2's formal
unattended envelope. The independent content audit and technical validation verified seven runs,
142 snapshot files, all 14 published raw hashes, three unattended final messages with no final
question, the correct child-abort and guest-blocker classifications, the version limits, and the
README link scope. Independent documentation and technical review are complete; no outstanding
findings remain.

## Open points

- No open points.

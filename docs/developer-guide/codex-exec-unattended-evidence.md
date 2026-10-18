# Codex exec unattended evidence (2026-10-18)

Point-in-time developer evidence for the portable Effective Flow build.

## Question and scope

The spike tests whether the portable build delegates work to child sessions and whether an unattended
prose preamble prevents the run from ending on a question. It also records duration and environment
behavior for the later Issue Buddy work packages.

The operator-selected primary matrix uses Codex CLI `0.163.0`. The generated runner
contract still declares Codex `0.153.4`; every primary row records this as
`invocationCompatibilityOnly: true`. The generated arguments are unchanged. These results are
compatibility evidence for the newer binary. The production-supported pin remains `0.153.4`.

## Setup

| Item                                 | Recorded value                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Effective Flow source                | `baa74743adfe05ea90b3dec782904ff8e1abff9a`                                                                               |
| llm-automatisator source             | `cc5eb3a4e20e71ff1cc327e8efa3904d446aff47`                                                                               |
| Portable snapshot                    | 142 files; SHA-256 `5422b6129e618f5961fe12a4f1b7bffdd81b73f64dc60031f182c27a144bab4d`                                    |
| Parent model and effort              | `gpt-5.6-sol`, `medium`                                                                                                  |
| Actual CLI in primary matrix         | `0.163.0`                                                                                                                |
| Contract CLI in generated invocation | `0.153.4`                                                                                                                |
| Local isolation                      | Dedicated home and workspace; `danger-full-access`; PATH constrained to the recorded runner path, `/usr/bin`, and `/bin` |
| Guest isolation                      | Dedicated home and workspace; `unshare`/`setpriv`; no service home, workspace, or skill snapshot                         |
| Evidence root                        | `.effective-flow/spikes/codex-exec/2026-10-18-01630/` after retention                                                    |

The primary matrix consists of four local runs and one guest run. Two supplementary `0.153.4`
baseline runs are included for the original-pin comparison.

## Workloads

The baseline requirement was:

> Add `src/health.txt` containing exactly `ok` followed by one LF newline, and add a `Health marker` section to `README.md` stating that the file is the repository's health marker. Do not add dependencies, modify configuration, or add third-party content.

The unattended input placed this preamble before the same requirement:

> Run this planning task to completion without asking me any questions. Nobody can answer follow-up questions during this run. Treat the requirement below as complete input. At every point where you would ask me to clarify, choose, confirm, or provide information, record that point under the plan's `## Open points` section with a concrete re-entry note, then continue. Start the deep interactive plan review automatically. Inside that review, choose `Decide later` for every decision and record each resulting open point. Do not end the turn on a question; finish with the normal completion report.

## Method and classification

The driver called `parseContract` for the `0.153.4` contract, then `buildRunnerCommand` before spawn. The command
used `codex exec --ignore-user-config --json --output-last-message`, the recorded model and effort,
`approval_policy="never"`, and the isolated environment. Local runs used no privilege-drop wrapper;
the guest used the default `unshare`/`setpriv` wrapper. After path normalization the generated flags
were identical. The `0.153.4` guard still prevented declaring `0.163.0`; the driver substituted the
installed binary and recorded `actualCodexVersion`, `contractCodexVersion`, and
`invocationCompatibilityOnly` in metadata.

Protocol completion requires an observed `turn.completed`. The automated detector marks
`ended-on-question` when the last message contains a compiled portable ask string. Manual review
also checks for other requests to choose or confirm; all three unattended final messages were read
and contain no such request. A final fail-closed message can require an explicit run-local
`adjudication.json`; the adjudication is hashed and is not inferred from exit code alone.

Delegation counts use the supplementary rollout graph, which observes parent-linked child sessions
and their terminal events. The service JSONL exposes wait calls but not complete child identity and
lifecycle state, so its collaboration count is not used as proof that children started or finished.
The supplementary graph covers observed parent-linked rollouts only; it cannot prove that no absent
child existed.

Load evidence is limited to file paths extracted from the `command` field of `command_execution`
items. Aggregated tool output is excluded to avoid claiming reads that were merely printed by a
command. The compiled ask-string manifest matched the regenerated `ask-strings.json` manifest
digest.

## Primary results

| Run                        | Environment / workload | Exit / signal | Duration (s) | Terminal result                                                                                           | Plan / review state                                                                           | Unique JSONL collab calls | Child rollout evidence                                                                                                                                                                                            |
| -------------------------- | ---------------------- | ------------: | -----------: | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-01630-baseline-1`   | local / baseline       |      0 / none |       34.184 | **failed by adjudication**; turn completed, but Node was unavailable and the resolver stopped fail-closed | no plan                                                                                       |                         0 | no child rollout observed                                                                                                                                                                                         |
| `local-01630-baseline-2`   | local / baseline       |      0 / none |      142.575 | **ended-on-question**; matched `Start the deep interactive plan review now?`                              | plan created; review section approved; no open points                                         |                         3 | supplementary graph: 4 children, all completed before parent                                                                                                                                                      |
| `local-01630-unattended-1` | local / unattended     |      0 / none |      180.435 | **completed without a compiled ask**                                                                      | plan created; review approved; no open points                                                 |                         4 | supplementary graph: 4 children, all completed before parent; three `gpt-6.1-sol` deep worker contexts observed                                                                                                   |
| `local-01630-unattended-2` | local / unattended     |      0 / none |      170.168 | **completed without a compiled ask**                                                                      | plan created; review approved; no open points                                                 |                         3 | 5 children started: 4 completed before parent (`gpt-6-luna` medium plus three `gpt-6.1-sol` high-effort contexts); initial `gpt-5.6-sol` medium child ended `turn_aborted`; all children terminated before parent |
| `guest-01630-unattended-1` | guest / unattended     |      0 / none |      180.629 | **completed without a compiled ask**                                                                      | plan created; review `Revision required`; one blocking open point from `Decide later` remains |                         4 | supplementary graph: 4 children, all completed before parent; three `gpt-6.1-sol` deep worker contexts observed                                                                                                   |

The three successful unattended runs therefore show no final compiled ask in their last messages, but
the guest run is not implementation-ready: its deep review retained a decision as an open point and
reported `Revision required`. Both local unattended runs reached approved plans with no open points.

## Supplementary original-pin baseline

| Run                | CLI / environment | Exit / signal | Duration (s) | Result                                                                                                                                             |
| ------------------ | ----------------- | ------------: | -----------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-baseline-1` | `0.153.4` / local |      0 / none |      152.550 | ended on the deep-review question after recovery using an absolute Node path; supplementary graph observed 3 children, all completed before parent |
| `local-baseline-2` | `0.153.4` / local |      0 / none |       60.418 | failed by adjudication: Node unavailable on PATH; fail-closed message; no plan                                                                     |

These supplementary rows are separate from the service-observable primary JSONL and are used to
retain the original plan pin and child model evidence. The observed child contexts included
`gpt-5.6-luna` and `gpt-6-astra`; these are child context selections, not model-tier attributions.

## Verdicts

Delegation was observed in the supplementary rollout evidence: primary baseline-2, local unattended-1,
and guest unattended-1 each had four children completed before the parent. Local unattended-2 had five
children: four completed before the parent and one initial child ended `turn_aborted` before its
replacement. Thus every observed child was terminated before parent completion, while
`allStartedCompleted` is false for unattended-2. The service JSONL alone cannot prove this because its
wait items carry no child lifecycle state.

All three preamble runs (two local and one guest) ended without a question after manual
review. The baseline question is the expected control behavior, and the failed baseline is an
environment control; neither is a preamble failure. The guest result still carries a blocking open
point, so “no final question” does not mean “ready for implementation”.

The maximum completed primary duration was 180.629 seconds, below the 3,600-second cap. No run
timed out or received a signal, and every recorded runner-process-group cleanup check passed. The second local unattended run also
completed with an approved review and no open points.

## Load behavior

Observed command reads across completed primary runs included `SKILL.md`, `tools/plan.md`, and,
depending on the branch, `tools/plan-review.md`, `shared/completion-protocol.md`,
`shared/config-migration.md`, `shared/language-rules.md`, `shared/model-tiers.md`,
`shared/next-steps.md`, `shared/plan-contract.md`, `shared/plan-input-gateway.md`,
`shared/plan-lint.md`, `shared/plan-numbering.md`, `shared/session-rename.md`,
`shared/session-title.md`, and `shared/doc-categories.md`. The second local unattended run also
read `shared/plan-publication.md`. These are observed command paths, not an assertion that every
referenced file was semantically consumed.

## Consequences

For WP2, the prose preamble suppressed the observed deep-review ask in all three successful preamble
runs, but it does not guarantee implementation-ready completion: the guest run retains a deferred
decision. The matrix covers one fixture and one compiled ask site.
WP2 should keep a service-side detector or equivalent fallback for indirect questions and should treat
open-point readiness separately from question termination.

For WP5, delegation works when measured through retained child rollouts. Use rollout evidence for
child counts and completion ordering; wait-call counts in `events.jsonl` are insufficient. The
primary snapshot also produced concrete `gpt-6.1-sol` worker contexts at high effort in the local
and guest unattended graphs. Unattended-2 demonstrates that a replacement after an aborted child
must be represented explicitly: all observed children terminated before the parent, but not all
started children completed successfully.

For WP6a, completed primary durations are approximately 34–181 seconds, well under the 3,600-second
cap. Local Node was `26.3.1`; guest Node was `24.20.0`. The local PATH omitted `node` and `pnpm` by
name while Git remained reachable. The guest reached Node and Git through `/usr/bin`, and pnpm
through a symlink in its separate agent tool directory. The successful local runs located Node
by absolute path. The guest uses `unshare` and `setpriv` with different filesystem roots.
Both source repositories' Git status remained unchanged across each local run; this is not
a syscall-wide or whole-OS write audit, and no observed commands accessed Forge or other network
services beyond the provider.

## Limits and retention

Results are bound to Effective Flow `baa7474`, llm-automatisator `cc5eb3a`, the snapshot digest,
Codex `0.163.0` compatibility execution, `gpt-5.6-sol`, and `medium` effort. They do not establish
behavior for the production-supported `0.153.4` invocation beyond the two supplementary baselines.
They do not cover Forge access, Claude Code, or a changed runner contract.

The source contains a static contradiction between the portable bootstrap stop condition when a
subagent mechanism is unavailable and the delegation mandate's inline fallback. This spike did not exercise that contradiction and
does not propose a product fix. The operator selected `0.163.0` in place of the originally planned
`0.153.4` matrix; only the two supplementary baselines exercise that original pin. The source plan
is unchanged under this spike's explicit two-document write boundary.

The raw evidence is retained under the primary runtime root. From the primary checkout, the
reproducible command is:

```sh
node .effective-flow/spikes/codex-exec/2026-10-18-01630/report.mjs
```

It generates a report from the retained artifacts using the run summarizer and supplementary rollout
extractor. It also recomputes the snapshot digest: sort relative paths prefixed with `effective-flow/`,
then hash the concatenation of `path + " " + sha256(file) + "\n"` for all 142 files. The report includes
tooling and raw-file digests. No session
identifiers, credential contents, or private output paths belong in the published document.

## Raw evidence digests

The rows above are the seven retained-report run IDs. SHA-256 digests for each run's raw
`events.jsonl` and `last-message.txt` are:

| Run                        | `events.jsonl`                                                     | `last-message.txt`                                                 |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `local-01630-baseline-1`   | `7d865fbb1027a1ec08c1fb0e77efd5c33eea111ac34ce770fd15ca9aac3a0d8f` | `fde74cda8363c42b8fc15b824996ce43881265197980e40e4a085c964069b928` |
| `local-01630-baseline-2`   | `779531483a577f1626aaef1a3d4cd43823c326401b59c795c07e1da3f55d45eb` | `25295ad04646edb6c913dda1aeb89aa3c3e5f5b4c63e17cebc3907f0c63279a3` |
| `local-01630-unattended-1` | `732371b688f8b314f056dfadc07f7827aa8a255232f9f366027c55ece75b4e8a` | `dded5081ee725e5082476d3de1d8034e015d766a70cbb7a03c7308b9c60df20f` |
| `local-01630-unattended-2` | `9723c13320d3d5bd083fe5a8a5dfb7616d195bd526586f2b0a2e867a21e65f45` | `4c115c962ad1730914af0fe9573659a1f6f928992c39ea18f8ce4c981e41741f` |
| `guest-01630-unattended-1` | `998906f397bbc01b4c1172e64f3cf2f68e60a3810b30ef79c02a553a61dd7c54` | `21658a13523fd7685ac9306f483576a89146d90b49d15cf6c8e24eded7054edf` |
| `local-baseline-1`         | `9c41eb605afc35bb55e39affd1295ea9e570ca9315604e49a0d131e8a9d664ba` | `01615b416ff8c620777883aaa11ba13092e289e40e9e7285a8257b433792959d` |
| `local-baseline-2`         | `ee4d4816995def1f5a3cac114bb6513aea143dc099bd89a2b5a793b5b3ff51df` | `4e06f4c25373a90aa8a951569eabadfaecde345409c0bbc8c46af811310eef60` |

# Merge gate conflict validation

## Status

Active

## Context

A merge-gate conflict-resolution commit was validated in mode `full` without exception, and the
merge-conflict resolver additionally ran the repository's combined gate. On PRs #666 and #667
(2026-11-14) each conflict was resolved in about a minute, while the run took more than 75 minutes:
the full suite ran twice, and environment failures (a wall-clock limit of the execution
environment, no space left in the temporary directory, Git not visible, process groups not reaped)
led both roles to split suites, compare against the base and rerun without any contract guidance.
Agents also capped foreground commands at about 600 seconds and cut the suite into batches, and two
gates competed on one repository without seeing each other.

Repositories with a pull-request CI that runs the test suite unconditionally already have the
safety net that the local `full` run duplicates, but only CI evidence observed at the merge
decision proves that it ran on the head that is merged.

## Decision

**Key and base confirmation (AD1).** `mergeGate.conflictValidation` takes `full` or `quick`,
default `full`, and governs only the validation of a merge-gate conflict-resolution commit;
`review.validation` and `applyReview.finalValidation` stay untouched. `off` is not offered,
because the fail-closed rule needs at least one executed check. `quick` is honored only when
`config-resolve.mjs conflict-validation` finds the row identical on `origin/<baseRef>`, read after
the entry fetch, and in the working checkout, with the read-only Git vectors, symlink and
submodule handling of the no-CI policy's [base-blob guard](merge-gate-no-ci-policy.md). A pull
request cannot lower its own validation. Hidden mode follows the `hidden-self` precedent: the
untracked local configuration cannot be changed by a pull request, so its `quick` is honored. A
missing, invalid or base-unconfirmed value is `full`.

**Effective mode (AD2).** The configured value is a ceiling. Detection runs in every conflict
round, whatever is configured, because the proposal needs its result. The effective mode is
`quick` only when all of these hold before the push; otherwise it is `full`:

1. `ci-detect` reports a detected test job on the base ref;
2. `ci-integrity` finds the workflow directories (`.github/workflows/`, `.forgejo/workflows/`,
   `.gitea/workflows/`), every local reusable workflow or composite action they reference and the
   root manifests that define the test commands, `pnpm-workspace.yaml` included, byte-identical
   between `origin/<baseRef>` and the staged merge tree, except that a `package.json` counts as
   unchanged where both sides parse with the same `scripts` and `workspaces` members, so a
   dependency change keeps `quick`. A pull request that changes CI
   or its test scripts gets `full`, because CI runs the pull request's own versions. Other scripts
   stay outside this check: a local `full` run executes head-supplied commands as well;
3. the provider supplies the check identity (GitHub; Forgejo only once verified) and the detected
   job is known to be blocking from the latest status read (`mergeGate.requireAllChecks: true`, or
   the job is reported `required`). Unknown is `full`, which avoids a predictable push-then-stop;
4. the resolver classified no conflicted file high-risk.

CI-backed `quick` therefore speeds up low-risk conflicts only. A high-risk conflict keeps `full`,
including the resolver's own combined run, and gains only the removal of splits, base comparisons
and reruns.

**Evidence at the merge decision (AD2a).** A `quick`-validated conflict commit adds one Phase 4
merge condition, evaluated on its own fresh batch against `VERIFIED_HEAD_SHA`, never on an earlier
read, for every marked commit: the recorded one and each the AD2b scan lists. `ci-detect` and
`ci-integrity` are pinned to that commit, whose tree holds the CI definition its conflict was
validated against, since integrity held on its staged merge: `ci-integrity` holds between that
commit and the tree of `VERIFIED_HEAD_SHA`, and `ci-evidence-match` finds, for the detection read
from that commit, the complete, non-empty set of expected instances of the detected test job among
the de-duplicated latest check entries of a `pr-status-read` with `includeCheckIdentity: true`. Each instance is a `CheckRun` of the `github-actions` app for event
`pull_request`, from the detected workflow path, on `VERIFIED_HEAD_SHA`, with conclusion exactly
`SUCCESS`. `SKIPPED`, `NEUTRAL`, an ambiguous de-duplication group and a missing object or ref are
no evidence, and a detection that expects one workflow path and instance name twice, or a detected
one without the full `baseCommit` it was read from, is rejected.
The check-list waiver and the no-CI policy never satisfy this condition. Two
results are not yet satisfied, as right after the push, and are handled only once no reviewer
thread or verdict sends the run back into Phase 3, which takes precedence. An expected instance
that has not registered yet (`missing`) waits once inside the current round with the existing
check wait, bounded by `mergeGate.checkWaitMinutes`, and the condition is evaluated again; still
missing, the gate stops with that reason rather than with exhausted rounds. A wait that returns
before the job registers therefore stops the run, which fails closed. A registered instance that
still runs (`pending`) is a pending check: the run starts a new Phase 2 round within the existing
round and check-wait bounds instead of stopping. Any other missing evidence means no merge: the
gate stops, reports what is missing, the marked commits and, where CI cannot supply the evidence,
the remedy (a merge by hand or a history rewrite), and leaves the pushed commit in place, with no
force push and no local `full` fallback after the push. The existing check-wait timeout path
applies unchanged. A later clean base merge that replaced a workflow's test command or the test
script since a marked commit fails the condition as well, even where it kept the job name: the
condition never re-derives the definition from the current base, which would accept the
replacement job's success for a suite that never ran.

**The commit carries its own quick marker (AD2b).** The wisdom record ends with the run that wrote
it, so a later gate run on the same pull request could otherwise merge a `quick`-validated commit
without the evidence check. The conflict-resolution merge commit created under effective `quick`
therefore carries the trailer line `Effective-Flow-Conflict-Validation: quick` in its message,
written as part of the commit before the push, which the gate confirms with the scan below before
pushing; a scan that does not list it stops the round with "quick marker not verified" and pushes
nothing. Phase 4 of every gate run, whatever the ceiling (AD1) resolves to – `quick`, `full`,
absent, base-mismatched or unreadable – fetches and scans the commits from the merge base of
`origin/<base>` and `VERIFIED_HEAD_SHA` up to that head with
`conflict-validation.mjs quick-marker-scan`. The AD2a condition applies where the run's own
wisdom record names such a commit or the scan finds one, and a failed fetch or scan, a shallow
repository included, counts as found and leaves the marked commits unknown, which is no evidence.
The ceiling decides only whether a conflict may be validated `quick`, never whether a marked
commit needs its evidence: after the push, the head can remove or change the setting, the base can
stop matching it, and its read can fail. Once marked, a commit needs its pinned CI evidence for as
long as it is in the pull request's range.

**Proposal, never an automatic switch (AD3).** When the key is configured `full`, explicitly or by
default, the provider is GitHub and detection is positive, `quick` is proposed with its evidence
(workflow file, job, test command) and with what the local `full` run checks that the CI job does
not cover, as far as derivable. Under `mergeGate.requireAllChecks: false` the proposal adds that
the job must be a required check. An effective `full` caused only by a high-risk conflict never
triggers it. `setup` shows it in Guided block 9, in the Guided summary, in a Targeted
`mergeGate.*` change and in the `setup status` envelope, reading the local
`origin/<delivery.baseBranch>` without fetching; writing still needs the existing confirmation.
`merge-gate` adds one line to its completion report and to the environment stop report and asks
nothing mid-run.

**One deterministic helper pair (AD4).** `conflict-validation.mjs` offers `ci-detect`,
`ci-integrity`, `ci-evidence-match` and `quick-marker-scan`, dependency-free and read-only on Git:
`show-ref`, `rev-parse`, `ls-tree`, `cat-file -s`, `cat-file blob` and `ls-files -s`, plus
`merge-base` and `log` for the marker scan; nothing is fetched or written, and there is no
`git write-tree`. `ci-detect` and `ci-integrity` read `origin/<baseRef>` or, given a `commit`, that
commit instead. `ci-detect`
reads only `.github/workflows/`, because its evidence is defined for GitHub Actions check runs
alone, while `ci-integrity` compares all three workflow directories. Workflow text is untrusted
data, parsed only, never executed or followed ([input trust boundary](input-trust-boundary.md)).
The supported YAML subset is block mappings and sequences, plain and quoted scalars, one-line flow
sequences of plain or quoted scalars, and the literal block scalars `|`, `|-` and `|+`; anchors,
aliases, flow mappings, multi-line or nested flow collections, folded block scalars, block
indentation indicators, tags and multiple documents make a file `unparsable`, which is no evidence. The plan rejected every flow
collection; the one-line flow sequence is a deliberate deviation, because branch filters are
commonly written that way, as in this repository's own `branches: [develop]`. A job is
detected only when the workflow triggers on `pull_request` with an exact literal branch filter
that includes the base, no `paths` filter and `synchronize` among any `types`; the step's `run:` is
exactly the bare manifest test invocation, matched by normalized script identity (`pnpm test`
equals `pnpm run test`), as its only command; no shell other than `bash`, no `if:` and no
`continue-on-error` on the step or job; any `working-directory` is the manifest's directory; any
matrix is literal, without `include`, `exclude` or expressions, and the job name is not templated,
so the expected instance set is static and non-empty; no other job of the workflow and no other
instance of its own matrix can report a check run under one of its expected instance names, compared
trimmed and case-folded, where a job whose name is not literal could report under any name and one
whose instance set is not static under its name, `<name> (…)` or `<name> / …`, because evidence
matches a check run by workflow path and name, never by job id, and another job's green run would
otherwise stand in for a test that has not registered yet; the test runs in the job itself, not
only inside a reusable workflow or composite action; and it runs on the pull request's own tree.

Pre-test steps follow one principle: **a step that is unknown or not provably tree-neutral leaves
the job undetected, so the conflict falls back to `full`.** `ci-integrity` proves the compared text
unchanged, not what a step runs, so repository code, a file operation, a package script or an
action (`cp package.ci.json package.json`, `cargo run --bin setup`, `git checkout origin/develop`)
could replace the tested tree while every compared file stays unchanged and keep the pull request's
check-run identity for a tree its tests never ran on. Every step before the test step must
therefore be on this allowlist:

- exactly one `actions/checkout`, without `if:` or `continue-on-error`, without a `ref`, a
  `repository` or a `path` other than the workspace root, and with no input beyond the credential,
  history, LFS, submodule and progress inputs that leave the checked-out tree unchanged;
- `actions/setup-node`, with a `cache` that is absent, `npm` or `pnpm`, since its yarn cache runs
  `yarn` in the workspace;
- `pnpm/action-setup` without `run_install` or with `run_install: false`, and without `dest`;
- `actions/cache` and `actions/cache/restore` when every `path` entry is one of the known
  package-manager cache directories `~/.npm`, `~/.pnpm-store`, `~/.cache/pnpm`,
  `~/.local/share/pnpm/store` and `~/.bun/install/cache` or lies below one, without `..`, glob,
  negation or expression; any other home path is not enough, because a GitHub-hosted workspace
  lies under `~/work` and a self-hosted runner may keep its workspace under a hidden home directory
  such as `~/.runner`;
- one `run:` line, free of shell metacharacters, that installs with the test step's package manager
  from a frozen lockfile with lifecycle scripts disabled, as an exact word set:
  `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` (or `pnpm i`, optionally
  `--prefer-offline`), because pnpm runs `.pnpmfile.cjs` hooks despite `--ignore-scripts`;
  `npm ci --ignore-scripts` (optionally `--no-audit`, `--no-fund`, `--prefer-offline`); and
  `bun install --frozen-lockfile --ignore-scripts`. yarn has no allowed install, because it runs a
  repository-selected `yarnPath` in place of itself, and neither have `cargo`, `go`, `pytest` and
  `make` test steps.

An allowlisted step carries only `name`, `id`, `timeout-minutes` and its `run:`, or its `uses:` and
`with:`; the install may add a root `working-directory` and a `bash` `shell`, and its inherited
default directory must be the root as well. Any other step key, `env`, `if` and
`continue-on-error` included, any input outside an action's list, any `${{` expression in a `run:`
or `with:` value, and any `env` the job or workflow passes down are not provable
(`step-before-test`, `action-before-test`, `env-before-test`); so is every other `run:` step and
every other action, local, composite and Docker actions included. The test step itself carries
only `name`, `id`, `timeout-minutes`, its `run:`, a root `working-directory` and a `bash` `shell`;
a step `env`, which runs repository code before the tests through `BASH_ENV`, and any other key are
not provable either (`test-step-env`, `test-step-key`). Nor is a job `container` or `services`
entry (`job-container`, `job-services`): `container.env`, the `-e` and `-v` flags of `options`,
the image's own environment and a service's workspace volume reach the test step outside the
steps this allowlist reads. A check run's head SHA names
the pull request whose event started the workflow, not the tree its job tested, so a job that
checks out another ref or repository would otherwise pass as evidence for a conflict commit it
never tested.
`pr-status-read` adds typename, app slug, event, workflow file path and head SHA per entry only on
`includeCheckIdentity: true`, so existing envelopes stay unchanged (AD4a).

**The combined gate runs once under `quick` (AD5).** Under effective `quick` the resolver runs
targeted checks for the conflicted and adjacent paths only, and the combined gate runs at most
once, in the validator, within the conflict-commit scope. Under effective `full` the resolver keeps
its behavior, including the combined-gate rule, so no repository that did not opt in loses a
resolution path. **Accepted trade-off under `quick`:** a low-risk conflict that needs an adjacent
fix aborts when the failure surfaces only in the validator, because the resolver's adjacent-file
allowance needs a failure it observed itself.

**What `quick` means for a conflict commit (AD6).** The commit gets its own validator scope instead
of the generic `quick` mapping: only the matched CI test command is excluded; every other
established check the repository's instructions or CI define for the change is required; a
mandated combined gate containing the excluded command is replaced by its remaining established
subcommands, and where those cannot run separately the effective mode is `full`. This
repository's own CI is not detected, so its conflict commits stay on `full` (AD4): the sharded
`unit-tests` job has a templated name and runs `pnpm test:shard`, not the manifest's `test` script
(`templated-name`, `no-test-step`); the `Build checks` job runs no test step (`no-test-step`); and
the required `Format, test and build` job runs no test step and carries a job condition,
`if: always()`, because it gates on both (`job-condition`, `no-test-step`). Deferral to CI covers
only the excluded command; any other check that cannot run stops the round.

**Environment failures stop cleanly (AD7).** The validator keeps the result states and
diagnostics of its owner `effective-delivery`; no state is added. The host-neutral environment
signature classes are: the execution environment's own wall-clock limit (the runner or container
reports a deadline or timeout exit, distinct from the agent's tool limit); no space left on
device; the version-control system unavailable for a check that needs it; and process termination
unconfirmed. Both handoffs carry the rule "on an environment signature, report the check and its
diagnostic; no suite split, no base comparison, no rerun", and the gate classifies the reported
results: an environment check counts as not executed. Under effective `quick` any environment
check stops the round, since the excluded test command does not run locally; the resolution still
needs one executed, passing local check, and the merge needs AD2a. Under effective `full` the gate
stops before the push, reports the class and the affected checks, pushes nothing, and adds the
proposal where AD3 holds. A timeout of the agent's own host tool, and any timeout that cannot be
attributed, is **not** an environment signature and keeps today's path, so repositories with long
suites keep their current, slower behavior.

**Long commands only where proven per host (AD8).** The execution protocol stays with
`effective-delivery`, which forbids wrappers that hide exit status or spawn unmanaged background
work and requires a bounded timeout and a reaped process tree. Only a build whose host is proven at
the depth the roles run at would hand the resolver and validator the fact "run long commands
through the host's background mechanism and await them before returning; set no own timeout below
the environment's limit". No build carries it yet. Host check, 2026-11-14:

| Host        | Result         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | one level deep | CLI 2.1.318, inside a sub-agent holding only the Bash grant the two roles also hold: a background command delivered its completion notification with its exit status (`3` reported as failed, `0` as completed) while the sub-agent was still working, and a foreground poll of its output file awaited it inside the turn. The harness owns the process, bounds it by the call's own timeout and terminates it at the sub-agent's final response, so nothing outlives the role and no exit status is hidden. |
| Codex       | not proven     | CLI 0.165.0 lists `unified_exec` as a stable feature, but the CLI was not authenticated on the check host, so no sub-agent run could start, await and reap a long command. The fact is not carried.                                                                                                                                                                                                                                                                                                           |
| Portable    | never          | No host is known, so the target never carries the fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The Claude Code check ran one sub-agent level deep; a resolver under a delegated gate runs one
level deeper, which is not yet confirmed: it is pending the manual throwaway-PR check, and the fact
is not carried in any build until then. A contradiction with the owner's protocol is raised
upstream, never overridden here.

**Concurrent gates: a passive presence marker (AD9).** Each gate run keeps one marker under
`<RUNTIME_STATE_ROOT>/.effective-flow/`, named after its wisdom `SESSION_ID`, with PR number, head
SHA, base, started at and last active at, written through the state helper's `presence` group
under the runtime-state write safety. The first dispatch registers it once Entry step 4's read has
completed and the wisdom file exists, so cleanup never finds a live marker without its wisdom file,
and records the returned token there; later dispatches, each round, a resume and the moments around
long delegations refresh it. Phase 6 releases it before deleting the wisdom file, except on
`BLOCKED-USER` and `SUSPENDED` returns, so a suspended run stays visible. At entry, the run uses only
the markers the helper's `presence list` validated; each produces one notice line naming that run's
PR and the files both runs change (`git diff --name-only <base>...<head>` for each, when the
objects are present), recorded in the wisdom file for the final report. A
marker without activity for more than 24 hours is "possibly stale", never active. `cleanup`
removes a marker only when its wisdom file is absent.

**The marker is not a cross-session message.** [Session rename](session-rename-butler.md) holds that
nothing crosses a session boundary, and [Focus cross-session messages](focus-cross-session-messages.md)
is the one bounded exception. A marker is local runtime state that another run reads; it addresses
no session, holds no host reference and carries no instruction, so neither decision is amended.
Coordination between concurrent gates, such as agreeing on a merge order, is issue #668.

**Review-fix rounds of `iterate` (AD10).** The same trade applies to the round that
`merge-gate` delegates to `iterate` for a bot finding, with its own decisions:

- _Separate key._ `iterate.reviewFixValidation` (`full` or `quick`, default `full`) governs only the
  final validation of a gate-delegated review-fix round, so a repository can opt into one trade
  without the other. `config-resolve.mjs review-fix-validation` applies the base-blob guard of
  AD1 to that one fixed row through the implementation it shares with `conflict-validation`; the
  caller supplies no key.
- _Quick only inside a gate-delegated review-fix round._ A standalone or user-typed `iterate` run,
  a local-mode run and a CI repair (Phase 2 step 3) always validate `full`. The gate computes a
  `quick` candidate before each bot-round delegation (ceiling, detection and integrity as for a
  conflict commit) and passes it as `Review-fix validation: quick-candidate <baseCommit>`, which
  `iterate` honors only beside the `Authorized scope:` line above the body delimiter. `iterate`
  pins detection and integrity to that base and to the committed head, switches to `full` for the
  rest of the round when either fails, and reports the effective mode, the validated head and the
  detection.
- _Required-check eligibility._ The candidate is `quick` only on GitHub and only when every detected
  job is a required check of the base branch. `mergeGate.requireAllChecks: true` alone does not
  qualify, because nothing outside the gate run enforces it, while branch protection holds a later
  merge by hand or by another gate run to a required check. A conflict commit keeps the AD1 rule,
  which also accepts `requireAllChecks: true`.
- _One full-suite run per round._ Item delegations carry `Validation: targeted` and run targeted
  checks only; the Phase 4 validator is the round's only full-suite run, or, under `quick`, runs
  every established check except the detected test commands plus the affected tests the items named.
- _No commit trailer; a gate-owned fail-closed record._ An `iterate` commit carries no marker,
  because a marker in a commit message would need a second trailer scan and `iterate` has no
  cross-run authority. The gate records the **quick-validated review-fix head** in its wisdom file
  when a delegation that carried the line moved the head, unless the return's
  `Review-fix validation result:` line parses with mode `full`, a reason and a full 40-hex head
  equal to the pushed head. Any other return, including a `full` line with a missing, malformed or
  different head, records the pushed head. Condition 11 treats the record like a
  quick-validated conflict commit: exact job `SUCCESS` on the final head, detected from that head's own tree. A later round never
  removes the record.
- _Setup._ `setup` proposes `iterate.reviewFixValidation: quick` at the sites where it proposes
  `mergeGate.conflictValidation: quick`, under the same CI-detection precondition, each proposal
  gated only on its own key, and never switches either on its own.

## Consequences

- A repository that does not opt in keeps today's local validation, except that environment
  failures now stop with a report instead of reruns. Its gate still fetches and scans the pull
  request's range in every Phase 4 (AD2b), and where that scan cannot run – a shallow clone, a
  range above the scan's 10,000-commit bound, no merge base – the gate does not merge until that
  is fixed, for example with `git fetch --unshallow`, even though the repository never opted in.
  That is the price of failing closed.
- A `quick` merge depends on CI having run on the merged head: a skipped, cancelled or failed
  test job blocks the merge. The pushed commit stays on the branch, and its trailer makes every
  later gate run demand the same evidence before it merges, whatever the ceiling then is.
- Where the condition applies but no evidence can exist – on Forgejo, once a marked commit's CI is
  no longer detected, or once the head's CI definition or test scripts differ from a marked
  commit's – the gate does not merge; a merge by hand or a history rewrite is the way out.
- A pull request that changes its test scripts or another root manifest (Cargo, Go, pytest,
  Make) resolves conflicts under `full`.
- Forgejo keeps `full` until check identity is verified there, and gets no proposal.
- Detection rejects every workflow shape it cannot prove, so a repository with a conditional, piped
  or indirect test step, or with any pre-test step off the allowlist, stays on `full`; this
  repository's own CI job is one of them.
- A `quick` review-fix round depends on the same CI evidence on the final head, and a pull request
  that changes a workflow, a manifest or a test script validates it `full`. Where a detected job
  is no required check, the round stays `full`.
- The marker adds one persisted file per active run; a crashed run's marker stays until its wisdom
  file is gone.

## Review triggers

Review this living decision when Forgejo check identity is verified, when the nested Claude Code
check or the Codex host check confirms the long-command fact, when the owner's execution protocol changes its stance on background work, when detection
should accept a wider workflow subset, or when issue #668 adds coordination between gates.

## References

- [Conflict-resolution delegation contract](../../src/shared/merge-gate-conflict-resolution.md)
- [Delegated run](../../src/shared/merge-gate-delegated-run.md)
- [Merge conflict resolver](../../src/agents/merge-conflict-resolver.md)
- [Code validator](../../src/agents/code-validator.md)
- [Review-fix validation, gate side](../../src/shared/merge-gate-review-fix-validation.md)
- [Review-fix validation, iterate side](../../src/shared/iterate-review-fix-validation.md)
- [Merge gate no-CI policy](merge-gate-no-ci-policy.md)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.

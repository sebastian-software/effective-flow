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
   `.gitea/workflows/`) and every local reusable workflow or composite action they reference
   byte-identical between `origin/<baseRef>` and the staged merge tree. A pull request that changes
   CI gets `full`, because CI runs the pull request's own workflow version. Manifests and scripts
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
read: `ci-integrity` holds on the tree of `VERIFIED_HEAD_SHA` against the base as fetched for that
read, and `ci-evidence-match` finds the complete, non-empty set of expected instances of the
detected test job among the de-duplicated latest check entries of a `pr-status-read` with
`includeCheckIdentity: true`. Each instance is a `CheckRun` of the `github-actions` app for event
`pull_request`, from the detected workflow path, on `VERIFIED_HEAD_SHA`, with conclusion exactly
`SUCCESS`. `SKIPPED`, `NEUTRAL`, an ambiguous de-duplication group and a missing object or ref are
no evidence. The check-list waiver and the no-CI policy never satisfy this condition. Two
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
applies unchanged. A base that changed its workflows after the push fails the condition as well.

**The commit carries its own quick marker (AD2b).** The wisdom record ends with the run that wrote
it, so a later gate run on the same pull request could otherwise merge a `quick`-validated commit
without the evidence check. The conflict-resolution merge commit created under effective `quick`
therefore carries the trailer line `Effective-Flow-Conflict-Validation: quick` in its message,
written as part of the commit before the push, which the gate confirms with the scan below before
pushing; a scan that does not list it stops the round with "quick marker not verified" and pushes
nothing. The AD2a condition applies whenever the run's own wisdom record names such a commit.
Without one, Phase 4 reads the base-confirmed ceiling (AD1) for the fresh read's `baseRef`, and
only where it is `quick` fetches and scans the commits from the merge base of `origin/<base>` and
`VERIFIED_HEAD_SHA` up to that head with `conflict-validation.mjs quick-marker-scan`; the condition
then applies where the scan finds one, and a failed fetch or scan, a shallow repository included,
counts as found. A run without its own record runs `ci-detect` freshly on the base for the
detection. Under a `full` ceiling nothing is fetched or scanned, so a repository that never opted
in gets no new merge condition. **Accepted residual:** a `quick` commit pushed while the ceiling
was `quick` merges on the ordinary checks alone in a later run once the base has switched the
ceiling back to `full`, because that run no longer looks for the marker.

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
`git write-tree`. `ci-detect`
reads only `.github/workflows/`, because its evidence is defined for GitHub Actions check runs
alone, while `ci-integrity` compares all three workflow directories. Workflow text is untrusted
data, parsed only, never executed or followed ([input trust boundary](input-trust-boundary.md)).
The supported YAML subset is block mappings and sequences, plain and quoted scalars, one-line flow
sequences of plain or quoted scalars, and the literal block scalars `|`, `|-` and `|+`; anchors,
aliases, flow mappings, multi-line or nested flow collections, folded block scalars, block
indentation indicators, tags and multiple documents make a file `unparsable`, which is no evidence. The plan rejected every flow
collection; the one-line flow sequence is a deliberate deviation, because this repository's own
`ci.yml` filters with `branches: [develop]`, so rejecting it would leave the repository that
motivated the decision on `full`. A job is
detected only when the workflow triggers on `pull_request` with an exact literal branch filter
that includes the base, no `paths` filter and `synchronize` among any `types`; the step's `run:` is
exactly the bare manifest test invocation, matched by normalized script identity (`pnpm test`
equals `pnpm run test`), as its only command; no shell other than `bash`, no `if:` and no
`continue-on-error` on the step or job; any `working-directory` is the manifest's directory; any
matrix is literal, without `include`, `exclude` or expressions, and the job name is not templated,
so the expected instance set is static and non-empty; and the test runs in the job itself, not
only inside a reusable workflow or composite action. `pr-status-read` adds typename, app slug,
event, workflow file path and head SHA per entry only on `includeCheckIdentity: true`, so existing
envelopes stay unchanged (AD4a).

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
subcommands, and where those cannot run separately the effective mode is `full`. For this
repository that means `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` locally,
and `pnpm test` in CI. Deferral to CI covers only the excluded command; any other check that
cannot run stops the round.

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

## Consequences

- A repository that does not opt in keeps today's local validation and merge decision, except
  that environment failures now stop with a report instead of reruns. Its gate reads the ceiling
  but fetches, scans and blocks nothing new.
- A `quick` merge depends on CI having run on the merged head: a skipped, cancelled or failed
  test job blocks the merge. The pushed commit stays on the branch, and its trailer makes every
  later gate run under a `quick` ceiling demand the same evidence before it merges. Once the base
  switches back to `full`, a later run merges such a commit on the ordinary checks (AD2b).
- Where the condition applies but no evidence can exist – on Forgejo, or once the base's CI is no
  longer detected – the gate does not merge; a merge by hand or a history rewrite is the way out.
- Forgejo keeps `full` until check identity is verified there, and gets no proposal.
- Detection rejects every workflow shape it cannot prove, so a repository with a conditional, piped
  or indirect test step stays on `full`.
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
- [Merge gate no-CI policy](merge-gate-no-ci-policy.md)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.

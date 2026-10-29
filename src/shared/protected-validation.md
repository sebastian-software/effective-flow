# Protected native macOS validation

This contract is a validation transport for a qualified native macOS GitHub Actions host. It owns
orchestration and evidence identity only; the ordinary validator and final-validation gates still own
the correctness judgment. The bridge is available only to native Codex on a supported host. Existing
Quality and non-remote execution keeps its current behavior. The normal local lane is unchanged.

## Admission and immutable request

The original `create` record must contain the immutable `remoteValidation` descriptor
`{protocol,requiredGates,policyDigest}` before any child is spawned. Command, native-host and closure
requirements are carried by the host policy bound to `policyDigest`; they are not added by a child.
The validator performs three operations:

1. `validation-await-admission` is one read-only admission poll returning `{state,bootstrapRef,diagnostic}`.
   It does not append a request or authorize a gate.
2. `validation-request` appends exactly one immutable request for the active run. It binds the actual
   execution closure, workflow, runner and protocol digests, source snapshot, Git repository and all
   full commands. A request is never overwritten, repaired or silently retried.
3. `validation-result` is read-only polling. It returns the result for the exact request and its
   immutable closure. The same validator remains waiting for the result, then submits the ordinary
   validation receipt bound to the actual request, result and native handle. A result never grants the
   validation gate by itself.

There is no user-reply or new-thread fallback for this transport. A missing admission, malformed
metadata, changed digest, stale source or incomplete result is a failed or blocked proof. The validator
must report the reason and keep the normal gate unresolved.

## Executor lanes and launch qualification

Before declaring native pilot setup ready, allocating an attempt or writing product files, qualify
one of these equally strong executor lanes:

- **Local lane:** run `pnpm test:preflight` successfully in the exact local worker sandbox and
  environment that will run the full suite. A failure blocks this lane. Its full checks remain unchanged.
- **Protected lane:** qualify the actual local worker’s native bridge boundary and the frozen trusted
  host/observer capabilities, then prove the unchanged full preflight, every full check and all five
  required native cases in the actual remote executor for a fresh immutable full-source qualification
  snapshot. The local worker need not support running that full suite itself; record any failed local
  capability probe honestly, never as a passed preflight. Remote executor proof does not substitute for
  proof of the actual local worker boundary.

For the protected lane, the trusted host prestarts the sidecar. Its fixed physical
`.effective-flow/protected-validation` mailbox is read-only to the worker; private host data and the
actual native sessions/transcript root remain unreadable. Real native canaries must prove that the
worker and every descendant cannot write, `chmod`, replace, unlink or create files in the protected
mailbox/private/session areas, or read their private data. Freeze the host policy, observer and
capabilities used for that proof; changed capabilities require qualification again. Missing boundary
or remote executor evidence blocks this lane before allocation or product writes.

This initial qualification is model-free process evidence. It cannot prove the behavior of a future
model or supply a future feature’s validation helper chain. Subsequent feature validation has the
separate acceptance boundary below; it must not be demanded before the product code exists.

## Admission and feature acceptance

For each required validation or final-validation gate, the host maps the true native child handle to
the validator role and admits that session only after verifying its native boundary and metadata. A
claimed or copied handle is insufficient. `validation-await-admission` performs one read-only poll and
returns `{state,bootstrapRef,diagnostic}`. The validator uses its already host-observed admitted native
handle; policy/guard evidence is referenced by `bootstrapRef`, not returned as handle metadata.

After the feature code exists, require a fresh full-source GitHub attempt for its immutable candidate:
the actual remote executor must pass the unchanged full preflight, every full check and all five
required native cases. A launch-qualification run, old CI, partial check or stale source cannot supply
this proof. No check may be weakened, skipped or substituted.

Before host completion sealing or acceptance, the host must consume actual native observations that
bind admission and successful canonical helper calls in order — request → verified result poll →
ordinary receipt — to the same closed native validator session and identical run, gate, request and
result identities. Runner/other-session calls or a copied handle cannot establish this chain. Missing
proof leaves the normal gate unresolved; remote success alone never grants acceptance. This helper
chain belongs to actual feature validation, not the pre-write qualification step.

## Closure, snapshot and execution

The closure is immutable and projected from the source snapshot. Only the validation workflow is
active in the pushed transport tree; all other original workflow bytes are inert payloads there. The
already-started job materializes exactly one separate Git execution repository, restoring every
original workflow at its original path with its exact bytes and mode. Those restored workflow files
are ordinary source files used by that job; the execution repository is local to it and is never
pushed. The actual GitHub attempt, jobs, raw logs, full commands and native steps form the evidence.
Closure completeness and source freshness are checked before execution; failed, partial or incomplete
proof is blocked.

Materialization preserves only the history reachable from the exact source HEAD through a bounded
local object pack; it copies no refs, config, credentials or source index. Reject shallow, grafted or
incomplete history, disable replacement objects and lazy fetching, and require the source commit count
plus one synthetic commit to fit the fixed depth of 4096. Snapshot and execution commits each have
exactly one parent, the source HEAD; that source commit may itself be a merge. The workflow checks out
only the selected immutable snapshot SHA at depth 4096, without fetching other refs or tags. Backend
proof binds the actual snapshot commit, tree and parent to the source HEAD; the runner checks immutable
execution HEAD, tree and context through completion. Changed history, source or closure needs fresh
attempt evidence; an earlier failed or passing run cannot validate the new candidate.

Future model-role adherence remains provisional pilot audit evidence, not full acceptance from this
model-free qualification. Transport state is private runtime evidence and is never activation authority
or public product configuration. Pilot activation still requires its owning complete acceptance proof
and active original-user approval.

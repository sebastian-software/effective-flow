# Issue Buddy runtime script

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `origin/develop` at `85e160a11b3ac31d6a1f45f702a3737e4a19eafd`, 2026-10-19.
**Working state:** The authoring checkout is at `e7117a36`; its unrelated local WP1 plan revision is preserved. The WP3 plan and implementation targets had no local changes. Source inspection uses the fetched `origin/develop` tree, not an assumed update of the checkout.

## Requirement

Work package 3 of the concept [`docs/concept/2026-09-29-issue-buddy.md`](../../concept/2026-09-29-issue-buddy.md) ("Issue Buddy runtime script"). Every deterministic step of an Issue Buddy pass must be testable without model judgment. The steps are:

- candidate listing and the write-permission trust filter;
- comment filtering and fingerprints;
- the idempotency checks;
- the local verdict cache, limits and ordering, and retry-once handling;
- the pass report.

All of this lives in a new dependency-free runtime script family that is shipped in every build target. Model judgment (readiness, plan, review) and publication stay outside this package.

The recommendation is **Feature**: this adds a new runtime capability plus additive read operations in the forge tracker helper, and preserves existing tracker callers. The new owner-qualified PR-head filter is additive; bare-head inputs and normalized output fields retain their current behavior.

Sibling plans:

- **WP2 is implemented:** [`2026-10-01-unattended-planning-and-readiness-contract.md`](2026-10-01-unattended-planning-and-readiness-contract.md). Reuse its `**Issue:** #<N>` header, `YYYY-MM-DD-issue-<N>-<slug>.md` filename and trusted-text JSON contract from `src/shared/unattended-planning.md`. WP3 produces the filtered data; WP5 constructs the formal envelope.
- **WP4 is implemented:** [`2026-10-01-shared-plan-publication-core.md`](2026-10-01-shared-plan-publication-core.md). Reuse `createProcessRunner`, `planBranchName`, `parsePlanBranch` and `parseIssueHeader`; do not copy their implementations or reopen the branch naming decision.
- **WP1 is complete:** the historical spike in `docs/developer-guide/codex-exec-unattended-evidence.md` proves observed CLI `0.163.0` compatibility, not the production `0.153.4` pin or WP2's later formal envelope. WP3 is deterministic and needs no model rerun or CLI-pin change. WP1, WP2 and WP4 prerequisites are complete; this package precedes WP5.
- **Used by** [`2026-10-01-issue-buddy-tool-stage-1.md`](../2026-10-01-issue-buddy-tool-stage-1.md) (WP5). WP5 composes this script with the unattended planning and with WP4. WP5 completes branches that WP3 classifies as `orphan-branch` through WP4's `complete-branch`, which applies WP4's single-file assertion (`assert-changeset`).
- **Read by** the llm-automatisator plans WP6a (`2026-10-01-issue-buddy-dry-run-auftrag.md`) and WP6b (`2026-10-01-issue-buddy-schreib-token-und-veroeffentlichung.md`), which carry over the verdict cache and read the pass report defined under "Contracts for WP5 and WP6a".

Deviations from the concept, decided by the user:

- **Dry runs write local state.** A dry run writes the local runtime cache (verdicts and pass reports, marked `mode: dry-run`) but nothing on the forge and nothing tracked. The concept said "writes nothing". This is decision D1, and it keeps dry-run calibration moving through the backlog instead of re-judging the same oldest issues every pass: a dry run skips an issue whose `would-publish` record still matches its fingerprint (skip reason 11).
- **GitHub only.** Version 1 supports GitHub only (D3). A non-GitHub origin is refused with a stable error code, and Forgejo is deferred.
- **Branch shape is not checked here.** WP3 only classifies a pushed plan branch without a pull request. Checking its shape is WP5's job, using WP4's assertion.

Before implementation, refresh the configured source base `origin/develop`, compare in-scope symbols and contracts with this baseline, and retain unrelated work. Stop and revise only for incompatible contract or scope drift; line movement alone is not a blocker.

## Architecture decisions

- **New two-file family, per the CLI-over-core rule in `AGENTS.md`.** `src/scripts/issue-buddy.mjs` is the thin JSON CLI: it reads one JSON object from stdin, writes one envelope to stdout, and exits nonzero on a structured failure. It imports `createProcessRunner` from WP4's `src/scripts/process-runner.mjs` and defines no runner of its own. `src/scripts/issue-buddy-core.mjs` holds the deterministic logic, with an injected runner and clock.
- **Plan-branch names come from WP4.** `issue-buddy-core.mjs` imports WP4's exported pure branch derivation and plan-branch parser from `plan-publication-core.mjs` for every use of `<branchPrefix>/plan/issue-<N>`: the `ls-remote` listing, the open-pull-request head match, and the closed-without-merge `head` lookup. A remote ref that the parser does not accept as a plan branch (for example `issue-abc` or `issue-01`) is ignored. `plan-publication-core.mjs` never imports this package.
- **Reuse the tracker in-process; build no second forge adapter.**
  - `issue-buddy-core.mjs` calls `executeOperation` from `remote-tracker-core.mjs` with the same injected runner. It builds no `gh` command of its own.
  - Its only direct subprocess calls are `git` (fetch, ls-remote, grep, and the runtime-state guard).
  - It may also import `ledgerRepository` from `remote-tracker-ledger-core.mjs` for the repository key.
  - No remote-tracker module imports `issue-buddy-core.mjs`, which keeps the layering rule from `AGENTS.md` ("no module imports its core back") intact.
- **Additive, read-only extensions to the tracker (GitHub required, Forgejo not):**
  - A new remote operation `collaborator-permission-read` (input `login`; output `login`, `permission`, `roleName`). On GitHub it reads `repos/{owner}/{repo}/collaborators/{login}/permission`, the same endpoint `llm-automatisator` uses in `src/git/github.ts:592`.
    - It is registered in `REMOTE_OPERATIONS` and mapped in `CAPABILITY_BY_OPERATION` to a new `collaboratorPermissionRead` capability.
    - The GitHub probe reports that capability as `true`, and the Forgejo probe reports it as `false`. The Forgejo command builder already refuses unknown operations with `UNSUPPORTED_CAPABILITY` (`remote-tracker-forgejo-core.mjs`, default case).
  - `normalizeIssue` (`remote-tracker-core.mjs`) additionally returns `author` (through the existing `normalizeAuthor`), plus `createdAt` and `updatedAt` (through `normalizeTimestamp`).
  - `normalizePullRequest` additionally returns `author`, `mergedAt` and `closedAt`.
  - Ensure every GitHub list/read path actually requests or receives those provider fields; normalization alone cannot recover an omitted author or timestamp. Keep every existing normalized field unchanged.
  - Extend `pr-list` compatibly for `head: <owner>:<branch>`: split qualified inputs internally into owner and bare ref, retain the qualified REST query, and compare normalized `head` against the bare ref plus the owner of `headRepository`. An unknown head repository cannot satisfy the qualified owner test. Existing bare-head inputs, result shapes and Forgejo behavior stay unchanged. WP3 separately requires `sameRepository === true` for owned plan-branch recovery; this does not remove foreign PRs that independently reference an issue.
- **Trust boundary in the script layer (concept, "Trust boundary"; decision D3).**
  - An issue is a candidate only if its author's permission is `write` or `admin`.
  - A comment is kept only if its author's permission is `write` or `admin`.
  - Every other outcome counts as untrusted, so the filter fails closed. That covers `read`/`none`, any read error or not-found answer, a login that is not a valid GitHub login, and a missing (ghost) author.
  - Use the endpoint's coarse `permission` only. `roleName` is descriptive; it never grants trust. GitHub maps maintain to write and triage to read ([official contract](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user)). Permission reads are memoized per normalized login within one invocation, never across passes.
  - A missing or malformed author/timestamp is not silently invented. Missing authors are untrusted; malformed ordering timestamps stop collection as `FORGE_READ_FAILED`. Ambiguous or incomplete pagination cannot produce an eligible slice.
  - The text of an untrusted issue, and its comments, never appear in any output or file. Only the issue number and the skip reason do.
- **Local cache under `.effective-flow/issue-buddy/`, guarded inside the script.**
  - Before every `mkdir`, write, link, rename, unlink or durable lock creation under that directory, the core runs the predicates of `src/shared/runtime-state-safety.md`: `git check-ignore --no-index` for `.effective-flow/config.json` and for the concrete target, an empty `git ls-files -- .effective-flow/`, and realpath containment with no symlink escape.
  - This is the same pattern as `pilot-measurement-core.mjs:361`.
  - State replacements use a guarded exclusive temp file plus rename. The human-approved TCP amendment below supersedes per-write exclusion files; no held or unknown legacy lock is automatically removed.
- **Durable whole-pass lock, in addition to kernel-bound operation exclusion.** `.effective-flow/issue-buddy/pass.lock` is exclusive per repository runtime-state root. Fully written holder data is published from a guarded temporary file through a create-only hardlink, so publication is complete and cannot overwrite an existing holder.
  - It holds the pass id, `acquiredAt`, the process id and the host name.
  - It is never broken automatically. A held lock returns `LOCKED` with the holder's pass id and age, and flags it `stale: true` once it is older than two hours (above the 3600-second pass cap). Removing a stale lock is an operator action through `pass-lock-release` with the holder's pass id.
  - A pass killed mid-run therefore leaves its lock behind. In the scheduled service this does not block the next pass, because each pass runs in a fresh clone that carries over no lock (WP6a); a manual pass needs the operator release first.
  - Concurrent publishing passes in different checkouts are still kept apart on the forge by WP4's create-only branch push.
- **The script never writes to the forge.** It calls only read operations, never calls `sf-label-migrate`, and never reads or writes the `labelMigration.sf` marker in `memory.json`. That is how "the `sf-` migration switched off" is implemented: the migration in `src/shared/issue-tracker-forge.md:44` is triggered by the workflow prose and has no automatic path in the script.
- **The script binds one fetched source snapshot.** Resolve a local branch name from the configured base ref, rejecting unsafe revisions or option-like names. Fetch an explicit `refs/heads/<baseBranch>:refs/remotes/origin/<baseBranch>` refspec with `--no-tags`, require the remote-tracking ref, and retain its commit OID for every plan scan in that collection. Do not assume a plain fetch refreshed the ref, or change a local branch or working tree.
- **This package owns the "Input trust boundary" ADR.** It writes the living ADR `docs/adr/input-trust-boundary.md` (English, numberless slug, `## Status` Active; name resolved through `project-adr-convention`, ADR craft per `effective-product`). It records that issue text counts as trusted only when its author has `write` or `admin` collaborator permission on GitHub, that untrusted comments are removed in the script layer before any model sees text, that trusted text is still data and never instructions, and that later extensions (such as asking questions in an issue) reuse this boundary. The other Issue Buddy ADRs belong to WP2 (`docs/adr/unattended-run-state.md`), WP5 (`docs/adr/plan-only-unattended-publication.md`) and WP6b in llm-automatisator ("Forge-Token im Agentenlauf").

### Accepted implementation amendment: operation exclusion (2026-10-19)

During implementation review, concurrent read/validate/write operations proved that atomic file replacement alone does not preserve publication limits or cache/pass consistency. A subsequently added persistent operation lock survived `SIGKILL` and blocked the promised holder-ID operator recovery. The user explicitly authorized loopback TCP, including replacement of redundant per-write exclusion locks, and requested completion of tests, review and the PR. This amendment supersedes the earlier filesystem-only operation-exclusion and per-write-lock requirements; it preserves the durable pass lock and every runtime-state guard.

A dependency-free Node.js TCP listener binds exclusively to `127.0.0.1` before any mutation. Its stable port is `49152 + uint32(SHA256(canonical physical commonGitDir)) % 16384`. The mutex covers mutable reads, validation, cache/pass/report persistence, replays, retention and cleanup for every mutator. It closes on success or failure; process death releases the kernel resource. There is no alternate port or filesystem-mutex fallback. The listener destroys inbound connections without interpreting payloads. Port collisions may refuse unrelated repositories but cannot grant state authority; holder diagnostics come only from validated durable pass data.

All processes sharing runtime state must share one host and network namespace and permit local loopback listening. Bind failures stop before filesystem mutation; sandbox denial is actionable rather than silently bypassed. The runtime filesystem must support same-directory hardlinks for complete create-only initial pass publication. Existing unknown operation/per-write lock files are preserved and diagnosed for deliberate operator reconciliation. After a killed operation, the existing matching `pass-lock-release(passId)` and a later acquisition remain the recovery path; no automatic stale-lock breaking or new operator command is introduced.

## Affected files

| File                                               | Description                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/issue-buddy.mjs`                      | New thin CLI: imports WP4's process runner; stdin JSON, envelope, exit code                                                                                                                                                       |
| `src/scripts/issue-buddy-core.mjs`                 | New core: operations, pass lock, trust filter, fingerprint, idempotency classification, recovery classification, ordering and limits, verdict cache, pass report, runtime-state guard; imports WP4's branch derivation and parser |
| `src/scripts/remote-tracker-core.mjs`              | Register the permission read/capability; normalize the additive author/timestamp fields and permission result; support qualified PR-head filtering without changing bare-head callers                                             |
| `src/scripts/remote-tracker-github-core.mjs`       | GET command plan for the permission read; ensure list/read payloads provide the fields consumed by normalization                                                                                                                  |
| `build.mjs`                                        | Add both new files to `RUNTIME_SCRIPT_FILES`. `process-runner.mjs` and the `plan-publication` pair are registered once, by WP4                                                                                                    |
| `scripts/distribution-smoke.mjs`                   | Add both files to its `RUNTIME_SCRIPT_FILES` inventory                                                                                                                                                                            |
| `test/execution-profile-contract.test.mjs`         | Add both files to `EXPECTED_RUNTIME_SCRIPTS`                                                                                                                                                                                      |
| `docs/adr/input-trust-boundary.md`                 | New living ADR "Input trust boundary" (see Architecture decisions)                                                                                                                                                                |
| `docs/developer-guide/release-and-installation.md` | Payload paragraph: name `scripts/issue-buddy.mjs` and its core, as WP4 does for its pair                                                                                                                                          |
| `test/issue-buddy.test.mjs`                        | New unit tests over the core with a fake runner and an injected clock                                                                                                                                                             |
| `test/issue-buddy-git.test.mjs`                    | New tests against a temporary repository and a local bare `origin`: fetch, branch listing, `**Issue:**` scan, runtime-state guard                                                                                                 |
| `test/remote-tracker.test.mjs`                     | Tests for the new operation, the capability, and the additive normalized fields; update any existing exact-shape assertions on normalized issues and pull requests                                                                |
| `docs/developer-guide/build-system.md`             | Runtime guard and runtime-script sections: document the Issue Buddy pair and update actual inventories/counts from the implementation baseline                                                                                    |

## Implementation details

### Approach

1. **Extend the tracker (additive reads).**
   - Add `collaborator-permission-read` and the normalized fields described under "Architecture decisions".
   - Map a provider 404 to `TARGET_NOT_FOUND`, as the tracker already does.
   - Write the tracker tests first, including one that proves the existing fields are unchanged.
2. **Write the core's pure parts.**
   - The trusted-text filter.
   - The fingerprint: `ibfp1:sha256:<hex>` over one fixed-key JSON serialization of normalized title/body, numeric-id-sorted kept comments `{ id, author, body }`, and sorted unique author logins including the issue author. Normalize CRLF/CR to LF and login case consistently; exclude labels, untrusted comments and timestamps. Document exact key/array ordering and encoding; reject duplicate or invalid comment IDs rather than hash an ambiguous list.
   - The reference matcher for pull requests.
   - Plan identity scanning via WP4's `parseIssueHeader`; a missing header may use the exact issue filename fallback. A conflicting or malformed identity is a fail-closed collection error, not a guessed issue.
   - The skip classification in a fixed precedence.
   - Ordering and limits.
   - The verdict-record transition rules.
   - The pass-report builder.
3. **Write the core's I/O parts.**
   - The forge reads, called through `executeOperation`.
   - The git reads: `fetch`, `ls-remote --heads origin` for the plan-branch prefix that WP4's derivation yields (`<branchPrefix>/plan/issue-`, or `plan/issue-` with an empty prefix), filtered through WP4's parser, and enumeration of regular Markdown blobs directly under `<planDir>` and its `archive/` on the retained base OID. Read only those plan blobs and apply the canonical header parser or exact filename fallback; do not follow symlink blobs or scan arbitrary tracked text.
   - The guarded store and the pass lock.
4. **Add the CLI and its operations.**
5. **Register and document.**
   - Add the two files to all three inventories.
   - Update `build-system.md` and `release-and-installation.md`.
   - Write the ADR `docs/adr/input-trust-boundary.md`.
   - Run the full check sequence.

### Component structure

All new CLI payloads have closed operation-specific keys. Validate types, positive safe issue/comment/PR numbers, valid refs and relative paths, enum values, and positive safe integer limits before I/O. Defaults are judgments 3 and plans 1; reject zero, fractions and unknown keys rather than silently coerce them. `cwd` must verify as the repository's primary runtime root; linked-checkout aliases cannot create a second state namespace.

The operations run as separate CLI processes. The pass record is the guarded JSON in `pass.lock` itself, retaining its acquisition identity. Bind successful collection metadata to that record: canonical repository, mode, limits, fetched base OID and the eligible issue/fingerprint slice plus authorized recovery entries, without issue text. Include the issue-author login needed to reproduce the fingerprint. A second collect for the same pass may replay that frozen result with identical inputs; conflicting inputs are rejected. `verdict-record` and the normal `pass-report` validate against that persisted record, not against an unverified collect object supplied by a caller. A failed collection persists only its validated mode/limits/repository and structured failure metadata, never a partial eligible slice or raw provider text; this authorizes a failed collect report but no judgment or publication. A preflight-failure report before collection is the separate exception and takes validated mode/limits directly. Releasing the pass removes the transient record with its lock; no pass record is carried between scheduled clones.

**Crash-consistent verdict transition.** Before writing the verdict cache, persist a strictly validated internal `collection.pendingVerdict` containing the intended `outcome`, original cache `record`, and `beforeDigest`/`afterDigest`. Under the operation mutex, every later collect, record or report first reconciles this transition. A cache matching the after-digest proves the outcome, which is atomically added to the pass before further limits or reports are evaluated; the intent is then removed. A cache matching the before-digest permits only an identical verdict retry using the original record and timestamp. Unknown, malformed or foreign intent state, cache drift, and legacy current-pass cache rows without their outcome or intent grant no further work or completed report. Matching holder-ID operator release remains available. This preserves the existing cache schema, stable-attempt deduplication and public operations; the journal is pass-local metadata, not another exclusion lock.

These are the CLI operations: `node <skill-root>/scripts/issue-buddy.mjs <operation>` with one JSON object on stdin, whose `cwd` is the runtime-state root. `pass-collect`, `verdict-record` and `pass-report` take the `passId` and refuse with `LOCKED` unless `pass.lock` holds exactly that id.

- **`pass-lock-acquire`.** Acquires kernel-bound operation exclusion, runs the runtime-state guard, then publishes complete `pass.lock` data through a create-only hardlink and returns a new `passId`. A held lock returns `LOCKED` with the holder's `passId`, its age and `stale`; it is never removed here.
- **`pass-lock-release`.** Input `passId`. Removes the lock only when it holds that id, otherwise `LOCK_MISMATCH`. The same call, with the pass id a `LOCKED` answer reported, is the operator's way to remove a stale lock.
- **`pass-collect`.** Inputs are `passId`, `mode` (`dry-run` or `publish`), `baseBranch`, `planDir`, `branchPrefix`, `visibility`, optional `limits.judgments` (default 3) and `limits.plans` (default 1, set by WP5's `--max-plans`), and optional `staleAttempts` as defined below.
  - It validates the input:
    - `visibility` must be `standard`; hidden mode is refused.
    - `planDir` must be relative, with no `..`.
    - `branchPrefix` may be empty, as WP4 allows; validate the full branch derived by `planBranchName` with `git check-ref-format --branch`, not an empty prefix by itself.
    - The provider must be `github`; otherwise it fails with `UNSUPPORTED_PROVIDER`.
  - It lists open issues. Pull requests are excluded by the existing filter at `remote-tracker-core.mjs:3413`.
  - It applies the trust filter and reads the comments of trusted issues only.
  - It computes fingerprints and classifies every issue. Keep raw forge responses internal and return only allowlisted metadata. Permission-read failure makes that author untrusted; failure to list issues, PRs or comments aborts collection, never treating missing evidence as empty.
  - After all current reads succeed, it accounts for proven matching stale attempts under the contract below, then completes cache-dependent classification and returns the ordered, limited judgment slice: the first `limits.judgments` eligible issues.
  - It writes the trusted text of each issue in that slice to its trusted-text file (see "Contracts for WP5 and WP6a"), so WP5 can hand the path to its planning sub-agent. Before replacing the slice, remove prior regular `issue-<N>.json` files under the guarded trusted directory and write only the current slice. No model handoff is permitted after a failed refresh; never reuse stale trusted text.
  - It returns a `recovery` section: `orphanBranches` (`issue`, `headRef`) and `unrecordedPullRequests`, which are proven same-repository open pull requests whose head is the derived plan branch of a trusted open issue and whose cache record is not `published` with that pull-request number (`issue`, `number`, `headRef`, `url`). Build recoverable entries only after the trust and earlier lifecycle/canonical-planning checks permit that issue. A matching foreign fork is never owned branch recovery. Persist each allowed recovery issue, fingerprint, branch and existing PR identity beside the judgment slice. An orphan remains skip reason 6, but listing a branch is not execution authority: authorize an actual recovery attempt only while its fingerprint-bound failure budget permits it. A first failed recovery records retryCount 0, a second failed pass records 1, and the next pass must return no authorization for another attempt with the same fingerprint. This check happens before WP5 may call complete-branch; rejecting a later verdict-record cannot undo a forge operation. In a dry run recovery is reported only.
  - The output has numbers, reasons, fingerprints and paths, and never untrusted text.
- **`verdict-record`.** The issue/fingerprint must belong to this pass's persisted judgment slice or authorized recovery set; mode and limits remain bound to that pass. A recovery verdict must match the owned branch/PR identity and obey the same publication limit; skipped or untrusted issues cannot become recoverable merely through caller-supplied metadata. Inputs are `passId`, `issue`, `fingerprint`, `verdict`, `mode`, a short `reason`, and an optional `pullRequest` (number and URL). Worktree-backed outcomes also carry `stableAttemptId`; validate its current-pass/issue binding and retain it for deduplication. It applies the transition rules (see "State management") and refuses invalid transitions with `INVALID_PAYLOAD`.
- **`pass-report`.** Validate the complete version-1 report and reconcile counts with the collected issues and recorded outcomes, rejecting duplicate issue outcomes and PR entries or identity/limit mismatches. It takes the collect result plus the caller's outcomes: verdicts, pull requests opened, pull requests recovered, failures, `outcome` and `cutOff` (`none`, `judgment-limit` or `publish-limit`). For a pass that stopped before `pass-collect`, take no collect result and exactly one failure with stage `preflight`. For a failed `pass-collect`, use its persisted failure context with `outcome: failed`, one pass-level `collect` failure, no judgment outcomes and empty PR lists; never fabricate a successful collect result to write the failure report. It checks that the counts stay within the limits, writes the report (see "Contracts for WP5 and WP6a"), and returns it.
- **`fingerprint`.** A pure local operation over one trusted-text file plus required `issueAuthor`, for WP5 and tests. Use the issue-author login from persisted collection metadata, normalized identically to collection; the closed WP2 JSON stays unchanged. The same inputs must reproduce the collection fingerprint. This calculation grants no permission and performs no forge read.
- **Error codes.** A stable list: `INVALID_PAYLOAD`, `UNSUPPORTED_PROVIDER`, `UNSAFE_RUNTIME_STATE`, `CACHE_CORRUPT`, `CACHE_REPOSITORY_MISMATCH`, `LOCKED`, `LOCK_MISMATCH`, `FETCH_FAILED`, and `FORGE_READ_FAILED`, which wraps the tracker envelope's code.

**Stale-attempt accounting (user decision, 2026-10-19).** WP5 captures stale-worktree evidence before collection and supplies it through `staleAttempts`; it must not call `verdict-record` before collection. Each entry is `{ issue, originalFingerprint, stableAttemptId }`, captured in WP5-owned guarded lifecycle metadata before the original publish worktree attempt starts. The ID canonically encodes the original pass id and issue as a JSON tuple; it is immutable and repository-bound. Worktree names, branches or old WP2 trusted-text files alone do not prove an attempt or its fingerprint. Missing or contradictory lifecycle evidence cannot consume retry budget; malformed CLI payloads are rejected.

- Finish all current forge/git reads, trust filtering and fingerprinting first. Account only for currently open, trusted issues that would otherwise pass the applicable skip checks apart from the failure budget, with an exact original/current fingerprint match and no pushed branch or recovery case. Apply this before ordering and slice limits. Changed, closed, untrusted or otherwise blocked issues consume nothing.
- In `publish` mode, count each previously unrecorded proven attempt once as a historical failure against the existing fingerprint-bound retry budget. Its origin is the old pass, never the current `recordedPassId`; it consumes no current judgment/publication slot and creates no current report verdict. An old first failure permits the current retry; two distinct failed attempts exhaust the budget before slice selection. The current pass can still record exactly one final authorized outcome, including success.
- Normal worktree-backed `verdict-record` calls retain the same attempt identity as their lifecycle metadata. Preserve all finalized/accounted attempt identities independently of the latest verdict and fingerprint resets. A kill after recording a verdict but before cleanup must not count that attempt again; an ID reused with different identity data is rejected.
- Persist historical accounting and its deduplication identities in one atomic cache update. Failed current reads change neither. A failed cache write grants no collection or execution authority and preserves the prior cache. If later trusted-text or pass-record persistence fails, retain already committed historical accounting, authorize only the failed-collect report and no current work, and never count those attempts again. Successful collect replay returns the frozen result; a failed-collect replay cannot repeat accounting, and conflicting inputs are refused.
- In `dry-run`, stale worktrees are diagnostic only: no historical failure accounting and no cleanup. Current dry-run verdict/cache/report writes remain allowed by D1. WP5 retains ownership of stale classification and cleanup authority; this accounting decision does not settle its separate worktree-removal question.

**Skip reasons, evaluated in this order.** The first match wins, and the report counts only that reason.

1. `untrusted-author`
2. `lifecycle-label`: `effective-flow-issue-in-progress` or `effective-flow-issue-done`, plus the `firmo-issue-done` equivalent.
3. `plan-issue-comment`: a kept comment whose body opens with `<!-- effective-flow-plan-issues -->`.
4. `open-pull-request`. Either the head is `<branchPrefix>/plan/issue-<N>`, or the title or body references the issue: `#<N>` as a token, `<owner>/<repo>#<N>`, or the issue URL, with or without a keyword.
5. `plan-on-base`: a file under `<planDir>` or its archive on `origin/<baseBranch>` whose `**Issue:**` header names `#<N>`, or whose name matches `YYYY-MM-DD-issue-<N>-*.md`.
6. `plan-branch-exists`. The remote plan branch exists:
   - with no pull request ever opened for it, keep the skip key `plan-branch-exists` and add its identity to `recovery.orphanBranches`; `orphan-branch` is a diagnostic, not a twelfth skip reason;
   - otherwise it is reported as `plan-branch-exists`, with the hint that deleting the branch unblocks the issue.
7. `closed-without-merge`. A closed, unmerged pull request from `<branchPrefix>/plan/issue-<N>` exists, read with `pr-list` (`state: all`, `head: <owner>:<branch>`). The issue stays blocked until its fingerprint differs from the baseline stored at first observation. With no stored record, the current fingerprint becomes the baseline (fail closed).
8. `failed-exhausted`: a `failed` record with `retryCount ≥ 1` and an unchanged fingerprint.
9. `unchanged-not-ready`: a `not-ready` record with an unchanged fingerprint, from either mode.
10. `already-published`: a `published` record with an unchanged fingerprint (the cache's second line of defence behind 4–6).
11. `unchanged-would-publish`: in `dry-run` mode only, a `would-publish` record with an unchanged fingerprint (D1). A `publish` pass never applies this reason and judges the issue again.

**Not skip reasons, reported separately:**

- an open pull request on a plan branch whose issue is no longer in the open-issue list (`issue-closed-plan-pr-open`);
- a degraded cache (corrupt or bound to another repository). A missing file is the normal empty-cache case and is not degradation.

**Ordering of eligible issues.**

1. Issues labelled `effective-flow-needs-planning` or `firmo-needs-planning` come first.
2. Then issues sort by ascending `updatedAt`.
3. Ties break by ascending number.

### State management

**Verdict cache.** The file is `.effective-flow/issue-buddy/verdicts.json`. It holds `schemaVersion: 1`, the repository key (`ledgerRepository` form: `host/owner/repo` in lower case), and one record per issue number. Each record contains:

- the issue number;
- the fingerprint;
- the verdict: `not-ready`, `would-publish`, `published`, `failed` or `closed-without-merge`;
- the `mode` that wrote it;
- a short reason: one line, control characters stripped, at most 200 characters;
- `retryCount` and `recordedPassId`, which distinguish a later retry from replay within one pass;
- `recordedAt`, from the injected clock;
- for `published`, the pull-request number;
- finalized/accounted worktree-attempt identities with their immutable original pass, issue and fingerprint, retained independently of the latest verdict and fingerprint resets;
- when a closed plan PR has been observed, its closed-plan PR observations keyed by PR number, each with a baseline fingerprint. Keep these observations independently of the latest verdict: a later `failed`, `not-ready` or other outcome never erases the baseline. Only a newly observed closed PR identity establishes a new baseline.

**Transition rules.**

- A record with a new fingerprint resets `retryCount` to 0.
- The first failed judgment for a fingerprint records `retryCount: 0`; one later failed pass records 1 and exhausts the retry. A new fingerprint resets it. Bind a record to `recordedPassId`: replay of the same outcome in the same pass is idempotent, not another retry, while a conflicting replay is rejected. Successful outcomes reset the failure sequence.
- `would-publish` can be written only in `dry-run` mode. A `publish`-mode pass treats `would-publish` as no verdict and judges the issue again (D1).
- `published` can be written only in `publish` mode.
- `not-ready` is honoured in both modes.

**Degradation.**

- A missing cache is a normal first pass.
- A corrupt cache, or one bound to another repository, is treated as empty for reads and reported. A write then refuses (`CACHE_CORRUPT` or `CACHE_REPOSITORY_MISMATCH`) and never overwrites the file, so the evidence stays on disk.
- The forge-side checks 4–7 keep preventing duplicate plans either way.

### Contracts for WP5 and WP6a

This is the one definition of the files and fields that WP5 and the llm-automatisator plans consume. They reference these paths and names verbatim. All paths are relative to the runtime-state root.

| Contract       | Path                                                 | Lifetime and carry-over                                                                                                     |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Trusted text   | `.effective-flow/issue-buddy/trusted/issue-<N>.json` | Written per pass for the judgment slice, overwritten next pass; transient, never carried over by WP6a                       |
| Verdict cache  | `.effective-flow/issue-buddy/verdicts.json`          | Durable cache; WP6a carries it over between passes as one secured file                                                      |
| Pass report    | `.effective-flow/issue-buddy/last-pass.json`         | Current-pass output only; WP6a secures/parses it after each pass and never restores an earlier report into this output path |
| Report history | `.effective-flow/issue-buddy/reports/<passId>.json`  | Same content as `last-pass.json`; newest 20 kept; local only, never carried over by WP6a                                    |
| Pass lock      | `.effective-flow/issue-buddy/pass.lock`              | Exists only while a pass runs or after a kill; never carried over by WP6a                                                   |

**WP5 consumer sequence:** replace its old Phase 1 pre-collection verdict write with capture of proven lifecycle metadata for `staleAttempts`; collection performs the validated historical accounting before selecting the current slice. WP5 records the original fingerprint and stable attempt identity before each publish worktree attempt and reuses that ID in its normal verdict. Cleanup remains governed by WP5's lifecycle policy. No old pass record, lock or trusted text is revived as current authorization. This is a required WP5 consumer alignment when that package is revised; this review changes only the WP3 plan.

**Trusted-text file**: closed version-1 JSON with exactly `schemaVersion: 1`, positive integer `issue`, string `title`/`body`, and `comments`: numeric `id`, normalized author-login string `author`, string `body`, for kept comments only. It is the exact file WP5 passes as `Issue text: <absolute path>` in WP2's envelope; title/body/comment text never supplies control lines.

**Pass report** (`schemaVersion: 1`, JSON). Fields:

- `passId`, `mode` (`dry-run` or `publish`), `outcome` (`completed` or `failed`), `repository`, `startedAt`, `finishedAt`;
- `limits` (`judgments`, `plans`) and `cutOff`;
- `counts`: an object of non-negative integers keyed by skip reason and by verdict (`not-ready`, `would-publish`, `published`, `failed`); every key matches `^[a-z][a-z0-9-]{0,47}$`;
- `verdicts`: `{ issue, verdict, reason }`;
- `pullRequestsOpened` and `pullRequestsRecovered`: `{ issue, number, headRef, url }`, where `headRef` is WP4's derived plan branch. Both lists are empty in `dry-run` mode;
- `failures`: `{ issue, stage, code }`, with `issue` `null` for a pass-level failure;
- `orphanBranches`: `{ issue, headRef }` entries; `issueClosedPlanPrOpen`: `{ issue, number, headRef, url }` entries; `cacheDegradation`: `null` or `{ code }`, where code is `CACHE_CORRUPT` or `CACHE_REPOSITORY_MISMATCH`.

All listed top-level fields are required; arrays are present even when empty. Repository identity is the canonical `ledgerRepository` string; timestamps are valid UTC ISO strings, IDs/limits/counts are safe integers, and refs/URLs belong to the resolved repository. `reason` is a sanitized single line of at most 200 characters; `stage` matches `^[a-z][a-z0-9-]{0,47}$`; `code` matches `^[A-Z][A-Z0-9_]{0,63}$`. These are metadata, never copied raw provider output. Version 1 rejects unknown keys. WP5 and WP6a validate this complete producer schema even when they consume only a subset; their implementation must not reject required WP3 fields omitted from a shorthand plan description. A future incompatible schema needs an explicit consumer revision, not silent field dropping. For scheduled fresh clones, only verdicts.json is restored as active Issue Buddy state. An earlier last-pass.json may remain secured as historical input, but must never be copied to the new output path. WP6a must begin with that path absent; a stop before lock acquisition then has no current report and cannot inherit an earlier completed result. Manual callers can instead retain the passId returned by lock acquisition and match the produced report to it. Do not assume WP6a knows an ID generated internally by that call.

`outcome` is `failed` only when the pass itself stopped: a preflight stop after the lock was taken, or a `pass-collect` failure. A failure of one issue leaves `outcome: completed` and appears in `failures` and `counts.failed`. Reports never embed the issue payload, title or comments; they contain only the bounded outcome reason already specified, which may summarize trusted input. Write the complete history record atomically before atomically replacing `last-pass.json`, with identical bytes. If updating the latter fails, preserve the history record and surface a report-write failure; never claim a complete pass or break a lock silently. Apply guarded retention only after both writes succeed. They are written in both modes (D1). WP5's final `Pass result: completed|failed` line mirrors `outcome`; WP6a reads the report file, never that line.

### API integration

GitHub only, through the existing `gh` adapter. All calls are reads:

- `issue-list` with `state: open`;
- `issue-comments-read` per trusted candidate;
- `collaborator-permission-read`, memoized per login;
- `pr-list` with `state: open`, once;
- `pr-list` with `state: all` and an exact qualified `head`, once per trusted candidate that survives checks 1–5. Check 6 uses this history to distinguish a true orphan from a branch with earlier PRs; reuse the same result for check 7.

Request volume depends on pagination and distinct issue/comment authors, plus candidate head lookups. Do not claim a constant two-to-three calls per issue. Permission lookups are memoized within the invocation; API/rate-limit failures retain their fail-closed behavior. No live credentials or external mutation are needed for the deterministic test suite.

### Edge cases

- **Untrusted issue author.** This covers `read`, `none`, a 404, a permission-read failure, an invalid login, a ghost account, and bot accounts without a collaborator entry. Result: `untrusted-author`. Its comments are never read and its text appears in no output.
- **Comment author without write access, or with an unknown permission.** The comment is dropped before fingerprinting, and the author is not added to the author set.
- **A `plan-issue` marker posted by an untrusted commenter.** It is dropped with the comment, so a third party cannot block an issue this way.
- **Several plan pull requests or branches for one issue.** The skip reasons in order 4–7 decide, and the first match is reported.
- **Closed-without-merge.** A closed, unmerged pull request whose branch was auto-deleted is still found through `head`. With no cache record, the current fingerprint becomes the baseline and the issue stays blocked (fail closed). A later trusted edit or a new trusted comment unblocks it.
- **Merged plan pull request whose plan was later archived.** Found under `<planDir>/archive/` → `plan-on-base`.
- **`git fetch` fails, or `origin/<baseBranch>` is missing.** The pass fails with `FETCH_FAILED` and classifies nothing, because it never runs without the base check.
- **Pagination beyond 100 issues or pull requests.** Handled by the existing `--paginate --slurp` reads. A test covers two pages.
- **Hidden mode or a non-GitHub origin.** Refused before any forge read.
- **Runtime state.** If `.effective-flow/` is not ignored, is tracked, or reaches outside the root through a symlink, the write fails with `UNSAFE_RUNTIME_STATE` before any `mkdir`.
- **Concurrent writers or a second pass.** `LOCKED`. Kernel-bound exclusion covers the entire mutation; the durable pass lock and unknown legacy lock files are never broken automatically.
- **Stale pass lock after a kill.** `pass-lock-acquire` returns `LOCKED` with `stale: true`, the holder's pass id and its age. Only the operator's `pass-lock-release` with that id removes it.
- **Judgment slice and publication limit.** A slice larger than the remaining eligible issues returns them all. The publication limit (default 1) is enforced by the caller and checked by `pass-report`.

## Acceptance criteria

- [x] `test/issue-buddy.test.mjs` contains at least one named, passing test for each of the eleven skip reasons. One also proves that the first-match precedence holds when two reasons apply.
- [x] Tests prove the pass lock: a second `pass-lock-acquire` returns `LOCKED`; an old lock is reported `stale: true` and left in place; `pass-lock-release` with a foreign id returns `LOCK_MISMATCH`; `pass-collect`, `verdict-record` and `pass-report` refuse a `passId` the lock does not hold.
- [x] Tests prove the authorized TCP operation mutex with real independent child processes and real worktrees: publication limits and cache/pass outcomes survive contention; `SIGKILL` at pass-publication and cache-persistence boundaries releases kernel exclusion and permits matching operator release plus a new acquire; normal/throw cleanup releases the endpoint. Denied bind, unrelated endpoint occupation and legacy locks fail closed without mutation or fallback. Wrong holder IDs preserve the active pass, concrete link/rename targets remain guarded, and first initialization works.
- [x] Real-process crash tests prove the verdict transition before/after intent persistence, cache commit and final pass persistence. Direct same-pass resume with another issue preserves publication limits and both outcomes; reports include reconciled outcomes and reject omissions. Cache-write failure after intent allows only the identical retry with its original timestamp, while conflicting replay, malformed/foreign intents and cache drift fail closed without mutation. Stable attempt IDs and retry counts remain deduplicated through resume and later historical accounting.
- [x] Tests prove the complete report contract: both files carry the same version-1 document and valid counts; separate preflight and collect failures each produce `outcome: failed` with the matching pass-level failure and no partial verdicts/PRs. Both PR lists remain empty in dry-run mode; orphan recovery still counts only skip reason 6.
- [x] Tests prove the recovery contract: one entry per owned orphan branch or unrecorded plan PR, authorized recovery verdict recording outside the judgment slice, preserved trust/lifecycle/publication limits, and exclusion of foreign forks or invalid refs (`issue-abc`, `issue-01`), and two failed orphan-recovery passes followed by a third pass that authorizes no further attempt. Empty branch prefixes work exactly as in WP4. A branch with an earlier closed PR is not an orphan; one memoized history read supports both checks 6 and 7.
- [x] Tests prove that untrusted issue text and untrusted comment text appear in no envelope, no trusted-text file and no report. They also prove that an untrusted `plan-issue` marker has no effect.
- [x] Tests prove the following fingerprint properties:
  - the pure CLI operation with `issueAuthor` reproduces the collection digest without adding fields to WP2's trusted text;
  - it is stable across comment order;
  - it changes when the title, the body, any kept comment, or the author set changes;
  - it does not change when an untrusted comment or a label changes.
- [x] Tests prove ordering and limits, strict malformed-input rejection, frozen fetched-OID scans, stale trusted-text cleanup, incomplete-provider-read rejection, and per-pass mode/issue/fingerprint binding.
- [x] Tests prove exactly one later retry for the same fingerprint, reset on changed input, same-pass replay without retry consumption and rejection of conflicting replay.
- [x] Stale-attempt tests prove: an old first failure permits one current retry and a current success remains the only final current verdict; two distinct proven failures exhaust the budget before slice selection; repeated IDs and a kill after normal verdict recording consume nothing twice. Dedup survives later verdicts and fingerprint resets. Missing proof, changed/closed/untrusted/otherwise blocked issues and recovery cases consume no historical budget. Dry-run adds no historical failures or cleanup. Read/cache/late-persistence failures and collect replay preserve atomic accounting without authorizing current work. A WP5 consumer fixture captures evidence before collection and never writes a pre-collection verdict.
- [x] Tests prove the D1 rules: `would-publish` is accepted only in dry-run mode, skipped as `unchanged-would-publish` by a later dry run with an unchanged fingerprint, and judged again in publish mode; `published` is refused in dry-run mode.
- [x] Tests prove the closed-without-merge baseline: missing observation records and blocks the current fingerprint; the unchanged fingerprint stays blocked; an edit unblocks it. After the edited issue records `failed` or `not-ready`, the retained closed-PR baseline does not re-block or consume the permitted retry. A different closed PR establishes its own baseline.
- [x] Tests prove the `orphan-branch` and `issue-closed-plan-pr-open` reports.
- [x] A fake-runner test proves that every forge call issued by `pass-collect` is a read. No `-X`/`--method` other than GET is used, there is no `sf-label-migrate`, and nothing touches `memory.json`.
- [x] A test proves that a non-GitHub origin returns `UNSUPPORTED_PROVIDER` and hidden mode is refused, both before any forge read.
- [x] `test/issue-buddy-git.test.mjs` proves four things:
  - the `**Issue:**` scan finds plans in `<planDir>` and `<planDir>/archive/` on `origin/<baseBranch>`;
  - a `FETCH_FAILED` stop;
  - a corrupt cache that is reported and never overwritten;
  - the runtime-state guard refuses a non-ignored or symlinked `.effective-flow/`.
- [x] Tracker tests prove permission/capability behavior and actual list/read data coverage; existing bare-head calls and normalized fields stay unchanged. Qualified-head tests cover owned PRs, foreign forks, missing head identity and closed PRs whose branch was deleted. WP3's owned-branch recovery requires `sameRepository === true`.
- [x] Tests prove complete closed report-schema validation, mismatched counts/duplicate outcome rejection, missing versus corrupt cache behavior, and a failed last-pass.json update preserving the matching complete history record without reporting success. A consumer-contract fixture retains an earlier completed report as historical input but starts the next fresh clone with no report output; a pre-lock stop yields missing current report, never inherited success.
- [x] `docs/adr/input-trust-boundary.md` exists with `## Status` `Active` and states the write-permission rule and the comment removal before any model step.
- [x] After `node build.mjs`, `issue-buddy.mjs` and `issue-buddy-core.mjs` are present byte-identical in the native Claude, native Codex and portable `scripts/` directories, and `pnpm test:distribution` passes.
- [x] Completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0 with the criteria above in place.

## Validation plan

Run in the implementation checkout, in CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`; each must reach a terminal exit 0. Include the named Issue Buddy core/Git tests, additive tracker compatibility cases and all three script inventories. A started process or a partial test log is not a pass.

Run `pnpm eval merge-gate verify` read-only before and after implementation and compare the actual result. The current baseline has eight pre-existing stale scenarios for `SKILL.md`, `shared/model-tiers.md` and `shared/next-steps.md`; do not assume “current”, rerecord model evidence here, or accept additional drift unnoticed.

Offline validation uses injected provider fixtures and disposable local bare repositories; it performs no live forge mutation or model calls. An optional live read-only check requires the target and credential already approved for that environment and is not a completion prerequisite for this deterministic package. Deployment token proof P12 remains in WP6a.

## Assumptions and open points

- **Forgejo is deferred (D3).** The earlier permission-probe limitation remains outside this package; it adds only the `false` capability and no Forgejo permission implementation.
- **Verified WP2 format.** The header is `**Issue:** #<N>` and the filename is `YYYY-MM-DD-issue-<N>-<slug>.md`; WP4 owns the parser. Revalidate these sources before implementation if they changed.
- **Default limits.** The judgment limit defaults to 3 per pass (`limits.judgments`, WP5's `--max-judgments`). The plan limit defaults to 1 (`limits.plans`, WP5's `--max-plans`, per the concept). The script records both and `pass-report` checks the counts against them.
- **Pass time cap.** WP6a enforces 3600 seconds. A killed pass may leave no complete current report or may leave an earlier one; manual callers match the returned `passId` and mode. Scheduled fresh clones restore only the verdict cache and start without a report output; they never turn a historical completed report into current success. They carry neither locks nor trusted text. There is no `time` cut-off value.
- **Pull-request references.** Any open pull request that references the issue blocks it, whoever its author is. A spurious block is the safe direction, and a person sees that pull request anyway.
- **Trusted-text files.** These are transient local writes under `.effective-flow/issue-buddy/trusted/`, explicitly allowed by D1 in either mode. They never imply a forge or tracked-file write.
- **Report retention.** The newest 20 pass reports are kept locally under `reports/`. WP6a does not carry that directory over; it secures `last-pass.json` after every pass, so the service keeps the history.
- **Live credential gate.** WP6a's permission-read probe P12 must confirm that its repository-scoped read token can call the collaborator endpoint before scheduled use. Failure is not permission to widen token scopes. This external deployment proof does not block WP3's offline implementation; live scope changes require a separate operator decision.
- **Out of scope:**
  - readiness judgment, planning, review and publication (WP2, WP4, WP5);
  - the branch-shape assertion and the branch-name derivation (WP4);
  - classifying stale Issue Buddy worktrees (WP5, which owns the worktrees);
  - the exposed tool, router, user documentation and next-steps (WP5);
  - scheduling (WP6a/6b).

## Plan review

**Result:** Approved

### Revision 2026-10-19

The plan now uses the verified WP2/WP4 interfaces and the completed historical WP1 evidence.
It preserves D1, D3, the eleven skip reasons, default limits and the read-only forge boundary.
The revision adds the compatible qualified-head filter, complete producer/consumer schema,
per-pass replay rules and explicit runtime-state failure behavior. Gap analysis incorporated six directly fixable contract gaps: the explicit issue-author fingerprint
input; persisted authorization for recovery verdicts; closed-PR baselines independent of the latest
verdict; collect-failure reporting; one stable skip key for orphan branches; and empty branch-prefix
compatibility. All six gap findings are incorporated. The independent final review found one additional read-order
contradiction, also incorporated: PR history is read before orphan classification and reused for the
closed-without-merge check. No critical findings or blocking decisions remain. All quality criteria
pass: concrete scope/references, measurable acceptance, verified context, explicit workflow,
plan-only writes, minimal code, justified Feature routing and no irrelevant doc-target fields.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         4 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    1 |

- **Architecture, Important:** the fingerprint needed the issue author, absent from WP2's closed JSON. Incorporated as a separate pure-operation input from persisted metadata, with digest-equality coverage.
- **Architecture, Important:** prefix validation rejected WP4's empty prefix. Incorporated by validating its derived full branch and preserving bare/qualified tracker compatibility.
- **Error cases, Important:** skipped recovery entries could not record outcomes. Incorporated as a persisted authorized recovery set, preserving trust, precedence and distinct judgment/publication accounting.
- **Error cases, Important:** a later verdict erased the closed-PR baseline and could block the promised retry. Incorporated by retaining per-PR baselines independently, with an edit/failure/retry regression case.
- **Error cases, Important:** failed collection could not satisfy the reporting precondition. Incorporated as a structured failed-collection context and explicit failed-report path.
- **Maintainability, Note:** orphan classification risked a twelfth skip key. Incorporated by retaining reason 6 and reporting recovery separately.
- **Error cases, Important:** orphan classification needed PR history that was scheduled after that check. Incorporated by reading it after checks 1–5, memoizing it for checks 6–7, and adding the former-PR-versus-orphan regression case.

### Deep interactive review 2026-10-19

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Error cases, Important:** orphan recovery was authorized before failed-exhausted classification and could exceed retry-once. Incorporated: keep skip reason 6, but gate recovery execution before any complete-branch call against the fingerprint's failure budget; test that a third pass after two failures authorizes nothing.
- **Error cases, Important:** WP6a restored the earlier last-pass.json without knowing a separately expected current passId, so a pre-lock stop could appear successful. Incorporated: restore only the verdict cache into active runtime state; keep earlier reports historical and require a missing current output after a pre-lock stop.
- **Architecture, Important:** WP5 Phase 1 records stale-worktree failures before collection, but WP3 requires current collection authorization and the old trusted text lacks the issue-author input. Resolved by the user: capture proven attempt metadata first and account only after fresh collection validates trust and the unchanged fingerprint. Incorporated stable attempt identities for normal and historical accounting, atomic deduplication, failure/replay behavior and the required WP5 sequence alignment. There is no pre-collection verdict bypass. All three deep-review findings are incorporated; no critical findings or implementation-blocking open points remain.

### Original review 2026-10-01

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Architecture, Important.** A pass-long lock would leave a killed pass blocking every later one, which contradicts WP5's done criterion "a pass killed mid-run recovers on the next pass". _Originally incorporated_ as per-write locks only; superseded by the cross-plan alignment below.
- **Security, Important.** A `plan-issue` marker or a lifecycle-relevant comment from a third party could block planning. _Incorporated:_ marker detection runs only on comments that passed the trust filter.
- **Security, Important.** Untrusted text could leak to the model through outputs or reports. _Incorporated:_ untrusted issues produce only a number and a reason, reports carry no issue text, and acceptance criteria test both.
- **Error cases, Important.** With a lost cache, the closed-without-merge rule had no baseline. _Incorporated:_ the current fingerprint becomes the baseline and the issue stays blocked (fail closed). The cost of this choice is documented: a change made between the close and the first observation is missed.
- **Data protection, Note.** Verdict reasons are model-written and could quote issue text. They are capped at one line of 200 characters. Trusted issues only reach that path.
- **Testability, Note.** Base-branch and runtime-state behaviour need a real repository. A separate `issue-buddy-git` suite keeps the core tests fast.
- **Scope, Note.** The branch-shape check and the publication limit were left out on purpose. Both belong to WP4 and WP5, and the plan says so.
- **Cross-plan alignment (2026-10-01).** Binding orchestrator resolutions applied across the eight Issue Buddy plans:
  - a whole-pass lock (`pass.lock`, never broken automatically, stale lock reported) beside the then-planned per-write locks (operation exclusion superseded by the accepted TCP amendment above); a killed manual pass needs an operator release, a scheduled pass does not because WP6a starts from a fresh clone;
  - the process runner and the plan-branch derivation are imported from WP4, so WP3 now depends on WP4 (order WP1 → WP2 ∥ WP4 → WP3 → WP5);
  - this plan owns the "Input trust boundary" ADR;
  - one contract section defines the trusted-text, cache and report paths, the report schema with `outcome`, and the `recovery` section (orphan branches, unrecorded plan pull requests) that WP5 assumed;
  - stale-worktree classification moved to WP5;
  - skip reason 11 `unchanged-would-publish` makes dry runs follow D1, and the unused `time` cut-off was dropped.

## Open points

- No open points.

## Implementation result

**Completed:** 2026-10-19
**Execution baseline:** refreshed `origin/develop` at `8238379ea622dd2d6c3cd66754d4edf24a62d18b`. Comparison with the planned baseline found no incompatible change in the affected contracts. The authoring checkout and its unrelated WP1 revision were preserved.

The dependency-free CLI/core pair implements the six deterministic operations, write-permission filtering before text handoff, canonical fingerprints, eleven ordered skip reasons, frozen source scans, recovery authorization, fingerprint-bound retries, stable historical-attempt accounting, strict reports and cache preservation. Additive tracker reads preserve existing callers. The pair is registered in all three identical 27-script inventories and shipped byte-for-byte to Claude, Codex and Portable.

The human-authorized loopback lifetime mutex replaces persistent operation/per-write exclusions. It covers complete mutable decisions through cleanup; initial holder publication is complete and create-only, replacements remain atomic, and unknown legacy locks remain untouched. Deployment requires one host/network namespace, local loopback listening and same-directory hardlink support. A durable pass-local verdict intent reconciles cache and outcomes after a killed process without bypassing publication limits or losing report authority. No new dependency, model run, production CLI-pin change or WP5/WP6 implementation was introduced.

Documentation includes the Active input-trust ADR, runtime inventories and payload description, plus the accepted runtime capability contract. The fifteen eval fixture updates add only 49 expected normalized metadata fields; provider inputs, controls, existing values and comparators are unchanged.

### Validation results

All required gates completed in CI order with terminal exit 0: `pnpm agent:check` (948 files), `pnpm test` (2832 total, 2831 passed, 0 failed, one environmental non-UTF-8/EILSEQ skip outside WP3), `node build.mjs` (three targets), and `pnpm test:distribution` (offline). All six delivered Issue Buddy file copies match their sources. No WP3 test was skipped.

The final focused four-suite run passed 564 tests. Independent review repeated the original real-process cache-rename kill reproduction and passed 19 targeted verdict-intent boundary tests. Earlier independent TCP checks passed 17 real-process/lifecycle cases. Named tests cover every skip reason, real worktrees, denied/occupied binding, complete holder publication, explicit release after kill, retries, stable attempt identities, strict nested report validation, concrete mutation guards and fresh-output consumer fixtures. The closed-PR retry regression combines edited input with `failed`; general `not-ready` semantics are separately tested.

Read-only `merge-gate` and `iterate` eval verification both exited 0 and reported stale evidence, not current model evidence: eight scenarios/40 runs and seven scenarios/35 runs respectively. The original three stale skill paths remain; this change adds exactly the fifteen reviewed fixture paths, with no further paths or scenario IDs. No evidence was rerecorded; the repository's release evidence policy remains applicable.

## Review findings

**Date:** 2026-10-19
**Reviewer:** Effective Flow Node.js reviewer and routed technical code validators

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

Implementation review found five Important defects, all independently confirmed fixed: concurrent verdict updates, permissive provider dates, incomplete historical PR states, killed-operation recovery, and cache/pass crash consistency. No Critical or Note findings remain. Complexity totals were Low 2, Medium 3, High 0. Documentation/tooling reviews found no additional defects. No residual review report was created.

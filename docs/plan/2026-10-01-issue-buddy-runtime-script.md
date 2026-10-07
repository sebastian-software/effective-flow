# Issue Buddy runtime script

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Work package 3 of the concept [`docs/concept/2026-09-29-issue-buddy.md`](../concept/2026-09-29-issue-buddy.md) ("Issue Buddy runtime script"). Every deterministic step of an Issue Buddy pass must be testable without model judgment. The steps are:

- candidate listing and the write-permission trust filter;
- comment filtering and fingerprints;
- the idempotency checks;
- the local verdict cache, limits and ordering, and retry-once handling;
- the pass report.

All of this lives in a new dependency-free runtime script family that is shipped in every build target. Model judgment (readiness, plan, review) and publication stay outside this package.

The recommendation is **Feature**: this adds a new runtime capability plus additive read operations in the forge tracker helper, and changes no existing behavior.

Sibling plans:

- **Depends on** [`2026-10-01-unattended-planning-and-readiness-contract.md`](2026-10-01-unattended-planning-and-readiness-contract.md) (WP2) for the `**Issue:** #<N>` plan header and the unattended plan file name `YYYY-MM-DD-issue-<N>-<slug>.md`. The script only parses that header; the parser can be built and tested against the agreed literal before WP2 lands.
- **Depends on** [`2026-10-01-shared-plan-publication-core.md`](2026-10-01-shared-plan-publication-core.md) (WP4) for the shared process runner `src/scripts/process-runner.mjs` and the plan-branch derivation (`branch-name`). This package imports both and neither copies nor re-derives them. WP4 must be re-derived first (see its Open points); the plan-branch name may change.
- **Order:** WP1 → WP2 and WP4 (in parallel) → this package (WP3) → WP5.
- **Used by** [`2026-10-01-issue-buddy-tool-stage-1.md`](2026-10-01-issue-buddy-tool-stage-1.md) (WP5). WP5 composes this script with the unattended planning and with WP4. WP5 completes branches that WP3 classifies as `orphan-branch` through WP4's `complete-branch`, which applies WP4's single-file assertion (`assert-changeset`).
- **Read by** the llm-automatisator plans WP6a (`2026-10-01-issue-buddy-dry-run-auftrag.md`) and WP6b (`2026-10-01-issue-buddy-schreib-token-und-veroeffentlichung.md`), which carry over the verdict cache and read the pass report defined under "Contracts for WP5 and WP6a".

Deviations from the concept, decided by the user:

- **Dry runs write local state.** A dry run writes the local runtime cache (verdicts and pass reports, marked `mode: dry-run`) but nothing on the forge and nothing tracked. The concept said "writes nothing". This is decision D1, and it keeps dry-run calibration moving through the backlog instead of re-judging the same oldest issues every pass: a dry run skips an issue whose `would-publish` record still matches its fingerprint (skip reason 11).
- **GitHub only.** Version 1 supports GitHub only (D3). A non-GitHub origin is refused with a stable error code, and Forgejo is deferred.
- **Branch shape is not checked here.** WP3 only classifies a pushed plan branch without a pull request. Checking its shape is WP5's job, using WP4's assertion.

Planning state: `develop` at `e846936`, 2026-10-01. None of the in-scope files had uncommitted changes. The only untracked items were `docs/concept/` and two unrelated plans.

## Architecture decisions

- **New two-file family, per the CLI-over-core rule in `AGENTS.md`.** `src/scripts/issue-buddy.mjs` is the thin JSON CLI: it reads one JSON object from stdin, writes one envelope to stdout, and exits nonzero on a structured failure. It imports `createProcessRunner` from WP4's `src/scripts/process-runner.mjs` and defines no runner of its own. `src/scripts/issue-buddy-core.mjs` holds the deterministic logic, with an injected runner and clock.
- **Plan-branch names come from WP4.** `issue-buddy-core.mjs` imports WP4's exported pure branch derivation and plan-branch parser from `plan-publication-core.mjs` for every use of `<branchPrefix>/plan/issue-<N>`: the `ls-remote` listing, the open-pull-request head match, and the closed-without-merge `head` lookup. A remote ref that the parser does not accept as a plan branch (for example `issue-abc` or `issue-01`) is ignored. `plan-publication-core.mjs` never imports this package.
- **Reuse the tracker in-process; build no second forge adapter.**
  - `issue-buddy-core.mjs` calls `executeOperation` from `remote-tracker-core.mjs` (line 4254) with the same injected runner. It builds no `gh` command of its own.
  - Its only direct subprocess calls are `git` (fetch, ls-remote, grep, and the runtime-state guard).
  - It may also import `ledgerRepository` from `remote-tracker-ledger-core.mjs` for the repository key.
  - No remote-tracker module imports `issue-buddy-core.mjs`, which keeps the layering rule from `AGENTS.md` ("no module imports its core back") intact.
- **Additive, read-only extensions to the tracker (GitHub required, Forgejo not):**
  - A new remote operation `collaborator-permission-read` (input `login`; output `login`, `permission`, `roleName`). On GitHub it reads `repos/{owner}/{repo}/collaborators/{login}/permission`, the same endpoint `llm-automatisator` uses in `src/git/github.ts:592`.
    - It is registered in `REMOTE_OPERATIONS` and mapped in `CAPABILITY_BY_OPERATION` to a new `collaboratorPermissionRead` capability.
    - The GitHub probe reports that capability as `true`, and the Forgejo probe reports it as `false`. The Forgejo command builder already refuses unknown operations with `UNSUPPORTED_CAPABILITY` (`remote-tracker-forgejo-core.mjs`, default case).
  - `normalizeIssue` (`remote-tracker-core.mjs:2576`) additionally returns `author` (through the existing `normalizeAuthor`), plus `createdAt` and `updatedAt` (through `normalizeTimestamp`).
  - `normalizePullRequest` (line 2644) additionally returns `author`, `mergedAt` and `closedAt`.
  - These fields are added only, and every existing field keeps its value.
- **Trust boundary in the script layer (concept, "Trust boundary"; decision D3).**
  - An issue is a candidate only if its author's permission is `write` or `admin`.
  - A comment is kept only if its author's permission is `write` or `admin`.
  - Every other outcome counts as untrusted, so the filter fails closed. That covers `read`/`none`, any read error or not-found answer, a login that is not a valid GitHub login, and a missing (ghost) author.
  - Permission reads are memoized per login within one invocation.
  - The text of an untrusted issue, and its comments, never appear in any output or file. Only the issue number and the skip reason do.
- **Local cache under `.effective-flow/issue-buddy/`, guarded inside the script.**
  - Before every `mkdir`, write, rename or lock under that directory, the core runs the predicates of `src/shared/runtime-state-safety.md`: `git check-ignore --no-index` for `.effective-flow/config.json` and for the concrete target, an empty `git ls-files -- .effective-flow/`, and realpath containment with no symlink escape.
  - This is the same pattern as `pilot-measurement-core.mjs:361`.
  - Writes use a temp file plus rename under a per-write exclusive lock file, as `remote-tracker-ledger-core.mjs` does. A held lock is never broken.
- **Whole-pass lock, in addition to the per-write locks.** `.effective-flow/issue-buddy/pass.lock` is exclusive per repository runtime-state root and is created with an exclusive create.
  - It holds the pass id, `acquiredAt`, the process id and the host name.
  - It is never broken automatically. A held lock returns `LOCKED` with the holder's pass id and age, and flags it `stale: true` once it is older than two hours (above the 3600-second pass cap). Removing a stale lock is an operator action through `pass-lock-release` with the holder's pass id.
  - A pass killed mid-run therefore leaves its lock behind. In the scheduled service this does not block the next pass, because each pass runs in a fresh clone that carries over no lock (WP6a); a manual pass needs the operator release first.
  - Concurrent publishing passes in different checkouts are still kept apart on the forge by WP4's create-only branch push.
- **The script never writes to the forge.** It calls only read operations, never calls `sf-label-migrate`, and never reads or writes the `labelMigration.sf` marker in `memory.json`. That is how "the `sf-` migration switched off" is implemented: the migration in `src/shared/issue-tracker-forge.md:44` is triggered by the workflow prose and has no automatic path in the script.
- **The script reads the base branch itself.** It runs `git fetch --no-tags origin <baseBranch>` and then reads `origin/<baseBranch>`. The fetch updates only remote-tracking refs in `.git`; it writes nothing tracked and nothing on the forge.
- **This package owns the "Input trust boundary" ADR.** It writes the living ADR `docs/adr/input-trust-boundary.md` (English, numberless slug, `## Status` Active; name resolved through `project-adr-convention`, ADR craft per `effective-product`). It records that issue text counts as trusted only when its author has `write` or `admin` collaborator permission on GitHub, that untrusted comments are removed in the script layer before any model sees text, that trusted text is still data and never instructions, and that later extensions (such as asking questions in an issue) reuse this boundary. The other Issue Buddy ADRs belong to WP2 (`docs/adr/unattended-run-state.md`), WP5 (`docs/adr/plan-only-unattended-publication.md`) and WP6b in llm-automatisator ("Forge-Token im Agentenlauf").

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/issue-buddy.mjs`                      | New thin CLI: imports WP4's process runner; stdin JSON, envelope, exit code                                                                                                                                                                                           |
| `src/scripts/issue-buddy-core.mjs`                 | New core: operations, pass lock, trust filter, fingerprint, idempotency classification, recovery classification, ordering and limits, verdict cache, pass report, runtime-state guard; imports WP4's branch derivation and parser                                     |
| `src/scripts/remote-tracker-core.mjs`              | Register `collaborator-permission-read`; add the `collaboratorPermissionRead` probe capability; add `author`/`createdAt`/`updatedAt` to the issue normalization and `author`/`mergedAt`/`closedAt` to the pull-request normalization; normalize the permission result |
| `src/scripts/remote-tracker-github-core.mjs`       | Command plan for `collaborator-permission-read` (GET only)                                                                                                                                                                                                            |
| `build.mjs`                                        | Add both new files to `RUNTIME_SCRIPT_FILES` (line 87). `process-runner.mjs` and the `plan-publication` pair are registered once, by WP4                                                                                                                              |
| `scripts/distribution-smoke.mjs`                   | Add both files to its `RUNTIME_SCRIPT_FILES` copy (line 32)                                                                                                                                                                                                           |
| `test/execution-profile-contract.test.mjs`         | Add both files to `EXPECTED_RUNTIME_SCRIPTS` (line 128)                                                                                                                                                                                                               |
| `docs/adr/input-trust-boundary.md`                 | New living ADR "Input trust boundary" (see Architecture decisions)                                                                                                                                                                                                    |
| `docs/developer-guide/release-and-installation.md` | Payload paragraph: name `scripts/issue-buddy.mjs` and its core, as WP4 does for its pair                                                                                                                                                                              |
| `test/issue-buddy.test.mjs`                        | New unit tests over the core with a fake runner and an injected clock                                                                                                                                                                                                 |
| `test/issue-buddy-git.test.mjs`                    | New tests against a temporary repository and a local bare `origin`: fetch, branch listing, `**Issue:**` scan, runtime-state guard                                                                                                                                     |
| `test/remote-tracker.test.mjs`                     | Tests for the new operation, the capability, and the additive normalized fields; update any existing exact-shape assertions on normalized issues and pull requests                                                                                                    |
| `docs/developer-guide/build-system.md`             | Runtime-guard bullet (line 264, "Three subsystems") and "Runtime scripts" section (line 490, "Four … fourteen files"): add the Issue Buddy pair with a short contract description; take the counts as they stand after WP4 landed                                     |

## Implementation details

### Approach

1. **Extend the tracker (additive reads).**
   - Add `collaborator-permission-read` and the normalized fields described under "Architecture decisions".
   - Map a provider 404 to `TARGET_NOT_FOUND`, as the tracker already does.
   - Write the tracker tests first, including one that proves the existing fields are unchanged.
2. **Write the core's pure parts.**
   - The trusted-text filter.
   - The fingerprint: a versioned `ibfp1:sha256:<hex>` digest over a canonical JSON of title, body, the kept comments as (id, author login, body) sorted by id, and the sorted set of their author logins. Line endings are normalized to LF before hashing. Labels are excluded.
   - The reference matcher for pull requests.
   - The `**Issue:**` header parser.
   - The skip classification in a fixed precedence.
   - Ordering and limits.
   - The verdict-record transition rules.
   - The pass-report builder.
3. **Write the core's I/O parts.**
   - The forge reads, called through `executeOperation`.
   - The git reads: `fetch`, `ls-remote --heads origin` for the plan-branch prefix that WP4's derivation yields (`<branchPrefix>/plan/issue-`, or `plan/issue-` with an empty prefix), filtered through WP4's parser, and `grep` for `^\*\*Issue:\*\*` under `<planDir>` on `origin/<baseBranch>`, which covers `<planDir>/archive/` too.
   - The guarded store and the pass lock.
4. **Add the CLI and its operations.**
5. **Register and document.**
   - Add the two files to all three inventories.
   - Update `build-system.md` and `release-and-installation.md`.
   - Write the ADR `docs/adr/input-trust-boundary.md`.
   - Run the full check sequence.

### Component structure

These are the CLI operations: `node <skill-root>/scripts/issue-buddy.mjs <operation>` with one JSON object on stdin, whose `cwd` is the runtime-state root. `pass-collect`, `verdict-record` and `pass-report` take the `passId` and refuse with `LOCKED` unless `pass.lock` holds exactly that id.

- **`pass-lock-acquire`.** Runs the runtime-state guard, then creates `pass.lock` exclusively and returns a new `passId`. A held lock returns `LOCKED` with the holder's `passId`, its age and `stale`; it is never removed here.
- **`pass-lock-release`.** Input `passId`. Removes the lock only when it holds that id, otherwise `LOCK_MISMATCH`. The same call, with the pass id a `LOCKED` answer reported, is the operator's way to remove a stale lock.
- **`pass-collect`.** Inputs are `passId`, `mode` (`dry-run` or `publish`), `baseBranch`, `planDir`, `branchPrefix`, `visibility`, and optional `limits.judgments` (default 3) and `limits.plans` (default 1, set by WP5's `--max-plans`).
  - It validates the input:
    - `visibility` must be `standard`; hidden mode is refused.
    - `planDir` must be relative, with no `..`.
    - `branchPrefix` must pass `git check-ref-format`.
    - The provider must be `github`; otherwise it fails with `UNSUPPORTED_PROVIDER`.
  - It lists open issues. Pull requests are excluded by the existing filter at `remote-tracker-core.mjs:3413`.
  - It applies the trust filter and reads the comments of trusted issues only.
  - It computes fingerprints and classifies every issue.
  - It returns the ordered, limited judgment slice: the first `limits.judgments` eligible issues.
  - It writes the trusted text of each issue in that slice to its trusted-text file (see "Contracts for WP5 and WP6a"), so WP5 can hand the path to its planning sub-agent. Those files are overwritten on the next pass.
  - It returns a `recovery` section: `orphanBranches` (`issue`, `headRef`) and `unrecordedPullRequests`, which are open pull requests whose head is the derived plan branch of an open issue and whose cache record is not `published` with that pull-request number (`issue`, `number`, `headRef`, `url`). WP5 acts on both; in a dry run they are reported only.
  - The output has numbers, reasons, fingerprints and paths, and never untrusted text.
- **`verdict-record`.** Inputs are `passId`, `issue`, `fingerprint`, `verdict`, `mode`, a short `reason`, and an optional `pullRequest` (number and URL). It applies the transition rules (see "State management") and refuses invalid transitions with `INVALID_PAYLOAD`.
- **`pass-report`.** It takes the collect result plus the caller's outcomes: verdicts, pull requests opened, pull requests recovered, failures, `outcome` and `cutOff` (`none`, `judgment-limit` or `publish-limit`). For a pass that stopped before `pass-collect` it takes no collect result and exactly one failure with stage `preflight`. It checks that the counts stay within the limits, writes the report (see "Contracts for WP5 and WP6a"), and returns it.
- **`fingerprint`.** A pure local operation over one trusted-text file, for WP5 and for tests.
- **Error codes.** A stable list: `INVALID_PAYLOAD`, `UNSUPPORTED_PROVIDER`, `UNSAFE_RUNTIME_STATE`, `CACHE_CORRUPT`, `CACHE_REPOSITORY_MISMATCH`, `LOCKED`, `LOCK_MISMATCH`, `FETCH_FAILED`, and `FORGE_READ_FAILED`, which wraps the tracker envelope's code.

**Skip reasons, evaluated in this order.** The first match wins, and the report counts only that reason.

1. `untrusted-author`
2. `lifecycle-label`: `effective-flow-issue-in-progress` or `effective-flow-issue-done`, plus the `firmo-issue-done` equivalent.
3. `plan-issue-comment`: a kept comment whose body opens with `<!-- effective-flow-plan-issues -->`.
4. `open-pull-request`. Either the head is `<branchPrefix>/plan/issue-<N>`, or the title or body references the issue: `#<N>` as a token, `<owner>/<repo>#<N>`, or the issue URL, with or without a keyword.
5. `plan-on-base`: a file under `<planDir>` or its archive on `origin/<baseBranch>` whose `**Issue:**` header names `#<N>`, or whose name matches `YYYY-MM-DD-issue-<N>-*.md`.
6. `plan-branch-exists`. The remote plan branch exists:
   - with no pull request ever opened for it, this is reported as `orphan-branch`;
   - otherwise it is reported as `plan-branch-exists`, with the hint that deleting the branch unblocks the issue.
7. `closed-without-merge`. A closed, unmerged pull request from `<branchPrefix>/plan/issue-<N>` exists, read with `pr-list` (`state: all`, `head: <owner>:<branch>`). The issue stays blocked until its fingerprint differs from the baseline stored at first observation. With no stored record, the current fingerprint becomes the baseline (fail closed).
8. `failed-exhausted`: a `failed` record with `retryCount ≥ 1` and an unchanged fingerprint.
9. `unchanged-not-ready`: a `not-ready` record with an unchanged fingerprint, from either mode.
10. `already-published`: a `published` record with an unchanged fingerprint (the cache's second line of defence behind 4–6).
11. `unchanged-would-publish`: in `dry-run` mode only, a `would-publish` record with an unchanged fingerprint (D1). A `publish` pass never applies this reason and judges the issue again.

**Not skip reasons, reported separately:**

- an open pull request on a plan branch whose issue is no longer in the open-issue list (`issue-closed-plan-pr-open`);
- a degraded cache (missing, corrupt, or bound to another repository).

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
- the `retryCount`;
- `recordedAt`, from the injected clock;
- for `published`, the pull-request number;
- for `closed-without-merge`, the closed pull-request number and the baseline fingerprint.

**Transition rules.**

- A record with a new fingerprint resets `retryCount` to 0.
- `failed` with an unchanged fingerprint increments `retryCount`. Exactly one later pass retries, and the issue is then left alone until its fingerprint changes.
- `would-publish` can be written only in `dry-run` mode. A `publish`-mode pass treats `would-publish` as no verdict and judges the issue again (D1).
- `published` can be written only in `publish` mode.
- `not-ready` is honoured in both modes.

**Degradation.**

- A missing cache is a normal first pass.
- A corrupt cache, or one bound to another repository, is treated as empty for reads and reported. A write then refuses (`CACHE_CORRUPT` or `CACHE_REPOSITORY_MISMATCH`) and never overwrites the file, so the evidence stays on disk.
- The forge-side checks 4–7 keep preventing duplicate plans either way.

### Contracts for WP5 and WP6a

This is the one definition of the files and fields that WP5 and the llm-automatisator plans consume. They reference these paths and names verbatim. All paths are relative to the runtime-state root.

| Contract       | Path                                                 | Lifetime and carry-over                                                                               |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Trusted text   | `.effective-flow/issue-buddy/trusted/issue-<N>.json` | Written per pass for the judgment slice, overwritten next pass; transient, never carried over by WP6a |
| Verdict cache  | `.effective-flow/issue-buddy/verdicts.json`          | Durable cache; WP6a carries it over between passes as one secured file                                |
| Pass report    | `.effective-flow/issue-buddy/last-pass.json`         | Fixed path, overwritten by every report; WP6a secures and strictly parses it after each pass          |
| Report history | `.effective-flow/issue-buddy/reports/<passId>.json`  | Same content as `last-pass.json`; newest 20 kept; local only, never carried over by WP6a              |
| Pass lock      | `.effective-flow/issue-buddy/pass.lock`              | Exists only while a pass runs or after a kill; never carried over by WP6a                             |

**Trusted-text file** (`schemaVersion: 1`): `issue`, `title`, `body`, and `comments` as a list of `{ id, author, body }` for kept comments only. It is the file WP5 passes as `Issue text: <absolute path>` in WP2's envelope.

**Pass report** (`schemaVersion: 1`, JSON). Fields:

- `passId`, `mode` (`dry-run` or `publish`), `outcome` (`completed` or `failed`), `repository`, `startedAt`, `finishedAt`;
- `limits` (`judgments`, `plans`) and `cutOff`;
- `counts`: an object of non-negative integers keyed by skip reason and by verdict (`not-ready`, `would-publish`, `published`, `failed`); every key matches `^[a-z][a-z0-9-]{0,47}$`;
- `verdicts`: `{ issue, verdict, reason }`;
- `pullRequestsOpened` and `pullRequestsRecovered`: `{ issue, number, headRef, url }`, where `headRef` is WP4's derived plan branch. Both lists are empty in `dry-run` mode;
- `failures`: `{ issue, stage, code }`, with `issue` `null` for a pass-level failure;
- `orphanBranches`, `issueClosedPlanPrOpen`, and `cacheDegradation`.

`outcome` is `failed` only when the pass itself stopped: a preflight stop after the lock was taken, or a `pass-collect` failure. A failure of one issue leaves `outcome: completed` and appears in `failures` and `counts.failed`. Reports carry no issue title, body or comment text. They are written in both modes (D1). WP5's final `Pass result: completed|failed` line mirrors `outcome`; WP6a reads the report file, never that line.

### API integration

GitHub only, through the existing `gh` adapter. All calls are reads:

- `issue-list` with `state: open`;
- `issue-comments-read` per trusted candidate;
- `collaborator-permission-read`, memoized per login;
- `pr-list` with `state: open`, once;
- `pr-list` with `state: all` and an exact `head`, once per candidate that survives checks 1–6.

The request volume is about two to three calls per open trusted issue per pass. Assumption: that is acceptable within GitHub's rate limit for the target repositories.

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
- **Concurrent writers or a second pass.** `LOCKED`. Neither the per-write lock nor the pass lock is ever broken automatically.
- **Stale pass lock after a kill.** `pass-lock-acquire` returns `LOCKED` with `stale: true`, the holder's pass id and its age. Only the operator's `pass-lock-release` with that id removes it.
- **Judgment slice and publication limit.** A slice larger than the remaining eligible issues returns them all. The publication limit (default 1) is enforced by the caller and checked by `pass-report`.

## Acceptance criteria

- [ ] `test/issue-buddy.test.mjs` contains at least one named, passing test for each of the eleven skip reasons. One also proves that the first-match precedence holds when two reasons apply.
- [ ] Tests prove the pass lock: a second `pass-lock-acquire` returns `LOCKED`; an old lock is reported `stale: true` and left in place; `pass-lock-release` with a foreign id returns `LOCK_MISMATCH`; `pass-collect`, `verdict-record` and `pass-report` refuse a `passId` the lock does not hold.
- [ ] Tests prove the report contract: `last-pass.json` and `reports/<passId>.json` carry `schemaVersion: 1` and every field named under "Contracts for WP5 and WP6a"; every `counts` key matches the identifier pattern; a preflight report carries `outcome: failed` and exactly one `preflight` failure; both pull-request lists are empty in `dry-run` mode.
- [ ] Tests prove the `recovery` section: an orphan plan branch and an unrecorded open plan pull request are each listed once, and a ref the WP4 parser rejects (`issue-abc`, `issue-01`) is ignored.
- [ ] Tests prove that untrusted issue text and untrusted comment text appear in no envelope, no trusted-text file and no report. They also prove that an untrusted `plan-issue` marker has no effect.
- [ ] Tests prove the following fingerprint properties:
  - it is stable across comment order;
  - it changes when the title, the body, any kept comment, or the author set changes;
  - it does not change when an untrusted comment or a label changes.
- [ ] Tests prove the ordering (needs-planning first, then oldest `updatedAt`, then number) and the judgment-slice limit.
- [ ] Tests prove the retry-once rule. The same fingerprint gives exactly one retry and then `failed-exhausted`; a changed fingerprint resets the count.
- [ ] Tests prove the D1 rules: `would-publish` is accepted only in dry-run mode, skipped as `unchanged-would-publish` by a later dry run with an unchanged fingerprint, and judged again in publish mode; `published` is refused in dry-run mode.
- [ ] Tests prove the closed-without-merge baseline: the issue is blocked with no record, blocked with an unchanged fingerprint, and unblocked after a change.
- [ ] Tests prove the `orphan-branch` and `issue-closed-plan-pr-open` reports.
- [ ] A fake-runner test proves that every forge call issued by `pass-collect` is a read. No `-X`/`--method` other than GET is used, there is no `sf-label-migrate`, and nothing touches `memory.json`.
- [ ] A test proves that a non-GitHub origin returns `UNSUPPORTED_PROVIDER` and hidden mode is refused, both before any forge read.
- [ ] `test/issue-buddy-git.test.mjs` proves four things:
  - the `**Issue:**` scan finds plans in `<planDir>` and `<planDir>/archive/` on `origin/<baseBranch>`;
  - a `FETCH_FAILED` stop;
  - a corrupt cache that is reported and never overwritten;
  - the runtime-state guard refuses a non-ignored or symlinked `.effective-flow/`.
- [ ] `test/remote-tracker.test.mjs` proves `collaborator-permission-read` on GitHub, `UNSUPPORTED_CAPABILITY` on Forgejo, and the additive fields with all previous fields unchanged.
- [ ] `docs/adr/input-trust-boundary.md` exists with `## Status` `Active` and states the write-permission rule and the comment removal before any model step.
- [ ] After `node build.mjs`, `issue-buddy.mjs` and `issue-buddy-core.mjs` are present byte-identical in the native Claude, native Codex and portable `scripts/` directories, and `pnpm test:distribution` passes.
- [ ] Completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0 with the criteria above in place.

## Validation plan

- `pnpm agent:check` (formatting).
- `pnpm test`, including `test/issue-buddy.test.mjs`, `test/issue-buddy-git.test.mjs`, `test/remote-tracker.test.mjs` and `test/execution-profile-contract.test.mjs`.
- `node build.mjs`. The dependency-free import guard at `build.mjs:580` must accept both new files.
- `pnpm test:distribution`.
- `pnpm eval merge-gate verify`, read-only, to confirm that no merge-gate re-record is owed. `scripts/remote-tracker*.mjs` are deliberately outside the gate's load set (`evals/_scaffold/build-identity.mjs:42`), so the expected verdict is "current".
- Optional manual check: one `pass-collect` dry run against a GitHub test repository, comparing the classification with the forge state by hand.

## Assumptions and open points

- **Forgejo is deferred (D3).** The Forgejo permission endpoint answers 403 for write collaborators, so the trust filter cannot be built on it yet. Forgejo gets only the `false` capability here.
- **The `**Issue:**` format.** The header value is `#<N>` and the unattended file name is `YYYY-MM-DD-issue-<N>-<slug>.md`, as fixed for WP2. If WP2 changes either one, the parser and its tests follow.
- **Default limits.** The judgment limit defaults to 3 per pass (`limits.judgments`, WP5's `--max-judgments`). The plan limit defaults to 1 (`limits.plans`, WP5's `--max-plans`, per the concept). The script records both and `pass-report` checks the counts against them.
- **Pass time cap.** It is enforced by the runner in WP6a, which ends the pass at 3600 seconds. A pass ended that way writes no report and is recovered by the next pass; there is therefore no `time` cut-off value.
- **Pull-request references.** Any open pull request that references the issue blocks it, whoever its author is. A spurious block is the safe direction, and a person sees that pull request anyway.
- **Trusted-text files.** These are transient runtime state under `.effective-flow/issue-buddy/trusted/`. Under D1 they count as local cache, not as a write.
- **Report retention.** The newest 20 pass reports are kept locally under `reports/`. WP6a does not carry that directory over; it secures `last-pass.json` after every pass, so the service keeps the history.
- **Rate limits.** Two to three GitHub reads per open trusted issue per pass stay within the authenticated rate limit for the intended repository sizes.
- **Out of scope:**
  - readiness judgment, planning, review and publication (WP2, WP4, WP5);
  - the branch-shape assertion and the branch-name derivation (WP4);
  - classifying stale Issue Buddy worktrees (WP5, which owns the worktrees);
  - the exposed tool, router, user documentation and next-steps (WP5);
  - scheduling (WP6a/6b).

## Plan review

**Result:** Approved

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
  - a whole-pass lock (`pass.lock`, never broken automatically, stale lock reported) beside the per-write locks; a killed manual pass needs an operator release, a scheduled pass does not because WP6a starts from a fresh clone;
  - the process runner and the plan-branch derivation are imported from WP4, so WP3 now depends on WP4 (order WP1 → WP2 ∥ WP4 → WP3 → WP5);
  - this plan owns the "Input trust boundary" ADR;
  - one contract section defines the trusted-text, cache and report paths, the report schema with `outcome`, and the `recovery` section (orphan branches, unrecorded plan pull requests) that WP5 assumed;
  - stale-worktree classification moved to WP5;
  - skip reason 11 `unchanged-would-publish` makes dry runs follow D1, and the unused `time` cut-off was dropped.

## Open points

- No open points.

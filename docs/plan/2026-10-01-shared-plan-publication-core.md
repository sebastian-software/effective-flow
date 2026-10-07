# Extract a shared plan publication core

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `e846936` on 2026-10-01, the tip of `develop`. **Working state:** untracked
`docs/concept/` and two unrelated untracked plans dated 2026-09-21. None of the in-scope sources
listed below has local changes.

## Requirement

This plan covers work package 4 ("Shared publication core") of the concept
`docs/concept/2026-09-29-issue-buddy.md`, Solution sketch step 7 ("Publish") and the Technical direction
items "Publication core" and "Trust boundary". The core lets a finished plan file be published by a
deterministic script rather than by model judgment. It runs these steps in this order:

1. assert that the change is exactly one plan file;
2. scan the file, the commit message, the pull-request title, and the pull-request body for secrets
   and forbidden paths;
3. build a commit on a deterministic branch;
4. push without force, so the branch acts as a lock;
5. open a pull request that references its issue with the non-closing `Refs #<N>`.

The core has two users, and neither exists yet. The `issue-buddy` tool (work package 5) publishes
unattended. The open plan `docs/plan/2026-08-20-plan-publication-before-implementation.md`
publishes interactively. Its full revision onto the core is **a separate follow-up plan** (deep
review decision, 2026-10-01), kept off the critical path to WP3 and WP5. This package only adds a
short "superseded mechanics" note to that plan (Approach step 8), so nobody implements its old
mechanics in the meantime.

Sibling plans of the same concept:

- `docs/plan/2026-10-01-unattended-planning-and-readiness-contract.md` (WP2) defines the
  `**Issue:** #<N>` header and the unattended plan file name `YYYY-MM-DD-issue-<N>-<slug>.md`. This
  plan only reads that header and does not depend on WP2 being delivered first. Without the header,
  a caller passes the issue number explicitly.
- `docs/plan/2026-10-01-issue-buddy-runtime-script.md` (WP3) depends on this plan. It imports
  this package's shared process runner (`src/scripts/process-runner.mjs`) and its exported pure
  branch derivation and plan-branch parser from `plan-publication-core.mjs`, and neither copies
  nor re-derives them. Its `orphan-branch` classification is completed by WP5 through this core's
  `complete-branch` operation.
- `docs/plan/2026-10-01-issue-buddy-tool-stage-1.md` (WP5) depends on this plan.
- Order: WP1 (`2026-10-01-codex-exec-unattended-spike.md`) → this package and WP2 in parallel →
  WP3 → WP5.

The recommendation is Feature: the work adds new shipped runtime capability (a script pair, its
tests and its registration) and revises one plan document. It restructures no existing behavior.

### Verified context

- **`pr-create` builders.** GitHub: `src/scripts/remote-tracker-github-core.mjs:479-494`. Forgejo:
  `remote-tracker-forgejo-core.mjs:304`. Both pass title and body through `publishedText`. The only
  content guard is `assertPublishable` (`src/scripts/remote-tracker-shared-core.mjs:24-30`), which
  rejects generation attribution. In hidden mode, `assertUndisclosed` (`:326`) applies as well.
  There is no secret scan before a pull request is created.
- **Existing credential detectors.** There are three, and each redacts text or checks one field:
  - `sanitizeChildText` with its private-key and assignment redaction and the prose exemption
    (`src/scripts/remote-tracker-decomposition-core.mjs:73-76`, `375-500`);
  - `containsCredentialMaterial` (`src/scripts/pilot-measurement-core.mjs:212`);
  - `CREDENTIAL_PATTERNS` and `diagnosticText` (`src/scripts/delivery-selection-core.mjs:1446-1460`),
    plus `redact()` (`remote-tracker-shared-core.mjs:382`).

  None of them refuses publication of a file. The concept says "no secret scan exists yet", which is
  accurate only for publication.

- **In-process tracker calls.** `executeOperation(operation, input, { apply, runner })`
  (`src/scripts/remote-tracker-core.mjs:4254`) accepts an injected process runner and keeps every
  mutation a dry run unless `apply` is set. The real runner `createProcessRunner` lives in the CLI
  entry `src/scripts/remote-tracker.mjs`, which calls `await main()` at import, so it cannot be
  imported as it stands.
- **The `pr` tool cannot serve an unattended pass.** `src/tools/pr.md`:
  - it pushes with `push -u origin` (`:224`);
  - its title derivation may ask for the commit type (`:257`);
  - a direct invocation needs a clean, attached checkout that is not on the base branch (`:284`);
  - it restores no checkout (`:272`).
- **Issue keywords.** `src/shared/tracker-target.md:331-336`: on a forge target, `Refs #<issue>` is
  the non-closing machine token and stays English. An external target gets only a plain reference.
- **Branch naming.** `src/shared/worktree-integration.md:154-160` builds
  `<delivery.branchPrefix>/<skill>/<slug>` and appends a numeric suffix when the name already
  exists. That suffix rule is incompatible with a branch that acts as a lock, so the core does not
  use it.
- **Script registration.** A shipped script must be listed in all four places, or a guard or test
  fails:
  - `build.mjs:87-102` (`RUNTIME_SCRIPT_FILES`);
  - `scripts/distribution-smoke.mjs:33`;
  - `test/execution-profile-contract.test.mjs:128` (`EXPECTED_RUNTIME_SCRIPTS`);
  - the prose lists in `docs/developer-guide/build-system.md:259-269` and
    `docs/developer-guide/release-and-installation.md:360-366`.
- **Git test pattern.** `test/delivery-selection-git.test.mjs:696-704` sets up a bare remote with
  two clones and a fixed test identity. The branch-lock tests follow it.
- **Stale facts in the 2026-08-20 publication plan:**
  - it was planned against `830e07a`;
  - it cites a `plan` budget of 619/700, but `build.mjs:1848` now budgets `plan: 665`;
  - its `src/tools/plan.md` anchors moved (`Do not create any commits` is now `:521-525`);
  - its `pr.md:261-263` citation is now `:272`;
  - it predates hidden mode (#459) and never states that hidden mode makes publication unavailable.

### Conflicts between the 2026-08-20 plan and the concept, and how they are resolved

| Topic                            | 2026-08-20 plan                                                       | Concept / binding decision                     | Resolution here                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mechanics                        | check out a publication branch, commit, return-switch, untracked twin | deterministic single-file commit               | plumbing commit through the core, with no checkout switch                                                           |
| Pull request                     | delegates to `effective-flow pr`                                      | core creates the PR with `Refs`                | the core calls the tracker's `pr-list`/`pr-create` in-process                                                       |
| Branch                           | `<prefix>/plan/<dated-stem>`, reused on republication                 | `<prefix>/plan/issue-<N>`, fresh, acts as lock | `issue-<N>` whenever an issue is known (interactive too), otherwise the dated stem; `create-only` vs. `update` mode |
| Non-interactive run              | publishes nothing                                                     | flag-gated plan-only exception                 | stays the rule; unattended Issue Buddy pass is the one exception (ADR by WP5; restated in the follow-up revision)   |
| Scan override                    | any finding acknowledged by answering the ask                         | nobody to acknowledge                          | high-confidence classes never overridable; lower-confidence overridable only interactively                          |
| Direct commit (`merge`/`branch`) | yes                                                                   | n/a                                            | kept, through the core, interactive only                                                                            |

## Architecture decisions

- **One script pair, `plan-publication.mjs` over `plan-publication-core.mjs`.** It follows the
  repository's CLI-over-core split: JSON on stdin, one JSON envelope on stdout, and every mutation a
  dry run unless `--apply` is passed, like the remote tracker. Model judgment stays outside it.
  Callers pass in the plan content, title and body texts, and the attended or unattended run state.
- **Plumbing commit, never a checkout switch.** The commit is built in a temporary index:
  - `GIT_INDEX_FILE` points into an `os.tmpdir()` `mkdtemp` directory, which is removed in a
    `finally`;
  - the base tree is read, the plan blob is added, and the tree is written;
  - `commit-tree` sets the parent explicitly.

  The user's index, working tree and checked-out branch stay untouched. This removes the 2026-08-20
  plan's return switch, the general twin-clearing step and the dirty-tree abort for a branch
  switch.

- **Hooks (deep review decision, 2026-10-01).** The core skips the client `pre-commit` hook and
  runs the `commit-msg` hook through `git hook run commit-msg -- <message-file>` on a temporary
  message file before `commit-tree`; a nonzero exit refuses the publication with
  `COMMIT_MSG_HOOK_REJECTED` (stderr redacted), and the commit uses the file's content after the
  hook ran. Rationale: Git exports `GIT_INDEX_FILE` to hooks, so the index is not the problem; the
  real risk is a `pre-commit` hook such as lint-staged that stashes or rewrites the working tree,
  which `commit-msg` on a message file does not touch. Commitlint therefore keeps working.
  `pre-push` hooks still run because the push is an ordinary `git push` and never takes
  `--no-verify`, and server-side rules still apply. Plumbing commits are **unsigned**; a
  "require signed commits" rule therefore turns into `PUSH_REJECTED`, which the core reports as
  such.
- **Network calls are bounded.** Every network Git call (`ls-remote`, `fetch`, `push`, including its
  `pre-push` hook) runs with the existing non-interactive fetch environment
  (`NON_INTERACTIVE_FETCH_ENV` / `nonInteractiveFetchEnv`) and a timeout like
  `UPSTREAM_FETCH_TIMEOUT_MS` (`src/scripts/delivery-selection-core.mjs:1376-1420`). A timeout before
  the push is `REMOTE_UNREACHABLE`; a timeout during the push is `PUSH_UNCONFIRMED`, followed by one
  `ls-remote` that decides between `branch-pushed` and `REMOTE_UNREACHABLE`.
- **Explicit `visibility` input.** `visibility` (`standard` | `hidden`) is a required input of every
  mutating operation; a missing or other value is `INVALID_INPUT`, so a caller that omits it cannot
  bypass the hidden-mode refusal.

- **Branch lock = `ls-remote` pre-check + plain push + remote-OID compare + PR lookup before
  create.** The push never uses `--force`, `--force-with-lease`, a `+` refspec, or `--no-verify`. A
  second publisher's push is refused as non-fast-forward, because its commit does not descend from
  the first publisher's commit. The pre-check closes the common case early. The compare after the
  push detects a lost race. The PR lookup and GitHub's own "one open pull request per head and base"
  rule cover the remaining case: two passes producing a byte-identical commit within the same
  second. `--force-with-lease=<ref>:` with an empty expected value was rejected. It is atomic, but it
  contradicts the prohibition list and the concept's "without force".
- **Scan classes have two confidence levels.** A high-confidence finding always blocks. A
  lower-confidence finding blocks unless an interactive caller passes its exact finding id as
  acknowledged. The core refuses an acknowledgement on an unattended run. Under binding decision D2,
  a private GitHub repository may run without forge-side rules, so the scan and the single-file
  assertion are then the only boundary. Both therefore fail closed rather than advise.
- **The core reports findings by class, field and line, never by value.** A finding id has the form
  `<class>:<field>:<line>`, which keeps the envelope and the pass report free of secret material.
- **The core owns the issue reference.** GitHub closes issues from the PR title and body and from
  commit messages that reach the default branch (squash or direct commits). So the core refuses,
  case-insensitively, any closing keyword (`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`,
  `resolve`, `resolves`, `resolved`), with or without a following colon, followed by `#<digits>`,
  `owner/repo#<digits>` or an issue URL, in the **title, the commit message and the body**. The core
  appends `Refs #<N>` as the final body line. An
  external tracker is the interactive caller's case, and there the caller passes a plain
  `externalReference` line instead. The two inputs are mutually exclusive.
- **The unattended run state is narrow and checked by the core.** With `runState: unattended`, the
  core requires all of the following:
  - target `pull-request` and branch mode `create-only`;
  - a GitHub repository (binding decision D3; any other provider stops with
    `UNSUPPORTED_PROVIDER`);
  - an issue number;
  - no acknowledged findings;
  - no archive-return pair.

  It keeps the attended and unattended rules in one place rather than in two tool prompts.

- **Hidden mode is refused.** In hidden mode, plans are untracked and no pull request may name
  Effective Flow, so the core returns `HIDDEN_MODE_UNSUPPORTED` before any Git or forge access. This
  also corrects the 2026-08-20 plan's omission.
- **The local publication receipt stays in the 2026-08-20 plan's fragment.** The core is stateless
  and returns the facts a receipt needs: mode, branch, remote, commit OID, the SHA-256 of the
  published bytes, and the PR URL and number. Issue Buddy's cache (WP3) is a separate consumer.
- **Reuse is limited to what fits.** The core uses these existing pieces:
  - `executeOperation` and the provider guards of the tracker;
  - `assertPublishable` and `assertUndisclosed`;
  - `diagnosticText` for redacting Git stderr in diagnostics;
  - the decomposition prose-exemption semantics for credential assignments.

  It does **not** retrofit the three existing detectors. They redact, while this core refuses, and
  changing the decomposition sanitizer would alter shipped behavior. A test pins consistency instead
  (see Acceptance criteria). Consolidating the detectors is a follow-up, not this package.

- **Process runner extraction.** `createProcessRunner` moves from `remote-tracker.mjs` into a new
  `src/scripts/process-runner.mjs`, together with the helpers it needs (`isUsableDirectory`,
  `FORCED_KILL_GRACE_MS`) and one export; its behavior is unchanged, but the move is not
  byte-for-byte. Only CLI entry modules import it, never a `*-core.mjs`, which keeps cores
  runner-injected and testable. WP3, which lands after this
  package, imports the same module. This package registers `process-runner.mjs` once; WP3
  registers only its own two files.
- **The core owns the plan-branch name.** Besides the `branch-name` operation, the core exports
  the pure derivation and a parser that accepts exactly `<prefix>/plan/issue-<N>` (or
  `plan/issue-<N>` with an empty prefix), where `<N>` is a positive integer without a leading
  zero. WP3 imports both in-process. The forge-side ruleset pattern `issue-[0-9]*` in the WP7
  operations plan is a superset of these names, because `fnmatch` cannot express "digits only".

## Affected files

| File                                                             | Description                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/plan-publication-core.mjs`                          | **New.** Deterministic operations `scan`, `branch-name`, `assert-changeset`, `publish`, `complete-branch`; input validation; unattended rules; scan class table; plumbing commit; branch lock; PR open through `executeOperation`. |
| `src/scripts/plan-publication.mjs`                               | **New.** Thin JSON CLI (`<operation> [--apply]`), injects the process runner.                                                                                                                                                      |
| `src/scripts/process-runner.mjs`                                 | **New.** `createProcessRunner` and its helpers moved from `remote-tracker.mjs` (behavior unchanged); imported only by CLI entries, later also WP3's.                                                                               |
| `src/scripts/remote-tracker-decomposition-core.mjs`              | Export the prose exemption (`SENSITIVE_CHILD_ASSIGNMENT`) so the scan reuses it instead of copying it; no behavior change.                                                                                                         |
| `AGENTS.md`                                                      | One line naming `process-runner.mjs`, because the script-family paragraph lists modules exhaustively and this one belongs to no pair.                                                                                              |
| `src/scripts/remote-tracker.mjs`                                 | Imports the runner from `process-runner.mjs` instead of defining it; behavior unchanged.                                                                                                                                           |
| `build.mjs`                                                      | `RUNTIME_SCRIPT_FILES` gains the three new files.                                                                                                                                                                                  |
| `scripts/distribution-smoke.mjs`                                 | Same registration in its `RUNTIME_SCRIPT_FILES`.                                                                                                                                                                                   |
| `test/execution-profile-contract.test.mjs`                       | `EXPECTED_RUNTIME_SCRIPTS` gains the new files.                                                                                                                                                                                    |
| `test/plan-publication.test.mjs`                                 | **New.** Pure tests: scan classes, confidence and acknowledgement rules, branch names, body keyword rules, unattended input rules.                                                                                                 |
| `test/plan-publication-git.test.mjs`                             | **New.** Bare-remote tests: single-file commit, changeset assertion, branch lock and race, dry run, direct commit, update mode, `complete-branch`, argv audit, fake forge runner.                                                  |
| `docs/developer-guide/build-system.md`                           | Runtime-guard paragraph (`:259-269`) names the new subsystem.                                                                                                                                                                      |
| `docs/developer-guide/release-and-installation.md`               | Payload paragraph (`:360-366`) names `scripts/plan-publication.mjs` and its core.                                                                                                                                                  |
| `docs/plan/2026-08-20-plan-publication-before-implementation.md` | A short "superseded mechanics" note only, see Approach step 8; the full revision is a follow-up plan.                                                                                                                              |

Deliberately untouched:

- `src/tools/*` and `src/shared/*`: no tool calls the core in this package, so no context budget
  moves;
- `src/shared/next-steps.md`;
- the user guide.

## Implementation details

### Approach

1. **Extract the process runner** (see Architecture decisions). `pnpm test` stays green with
   `test/remote-tracker.test.mjs` unchanged.
2. **`branch-name` (pure).**
   - Inputs: `branchPrefix` and at least one of `planFile` and `issue`. WP3 passes only the issue.
   - The issue comes from the input or from a `**Issue:** #<N>` header line in the plan's header
     block. Both present and different gives `ISSUE_MISMATCH`.
   - With an issue the result is `<prefix>/plan/issue-<N>`, otherwise `<prefix>/plan/<file-stem>`.
     An empty prefix drops its segment.
   - The result is validated with `git check-ref-format --branch`, and no suffix is ever appended.
   - The same derivation and the plan-branch parser are exported for in-process use (see
     Architecture decisions).
3. **`scan` (read-only).**
   - Inputs: the plan bytes (or a path the core reads) plus `commitMessage`, `title` and `body`.
   - It returns findings `{ id, class, confidence, field, line }`.
   - Fenced code blocks are scanned like prose.
   - Generation attribution (`assertPublishable`) is reported as a high-confidence `attribution`
     finding.
4. **`assert-changeset` (read-only).**
   - Inputs: `baseRef`, a `head` commit, `planDir`, `allowArchiveReturn`, and optionally the
     expected issue.
   - It computes `git diff --name-status --no-renames -z <merge-base>..<head>` and accepts exactly
     one of two shapes:
     - one `A` of a top-level `<planDir>/<name>.md`, but **not** when the base still tracks
       `<planDir>/archive/<name>.md` (that would leave two copies), which is refused with
       `ARCHIVE_TWIN_PRESENT`;
     - only when allowed, that `A` together with `D <planDir>/archive/<name>.md`. With
       `allowArchiveReturn`, the temporary index of the commit build removes the archive path, so
       the commit itself carries the pair.
   - It rejects, each with a named violation:
     - any other path, a nested path, a deletion, a modification, or a rename;
     - a mode other than `100644`, which also excludes symlinks and executables;
     - a blob above 512 KiB, a blob containing NUL, or invalid UTF-8;
     - a file name that does not match `YYYY-MM-DD-<slug>.md`;
     - on an unattended run, a file name that does not match `YYYY-MM-DD-issue-<N>-<slug>.md`
       (WP2's rule) for the given issue. An interactive plan that carries a hand-added
       `**Issue:**` header may keep its ordinary `YYYY-MM-DD-<slug>.md` name, but a name with an
       `issue-<N>-` segment must match the issue;
     - an `**Issue:**` header that disagrees with the expected issue.
   - In `create-only` it also requires that `head` is exactly one commit whose parent is the `baseRef`
     tip.
5. **`publish` (mutation; dry run unless `--apply`).** Order:
   1. validate inputs and the unattended rules, then refuse hidden mode;
   2. resolve the provider through `repository-resolve`;
   3. verify that `baseRef` resolves, and that the plan file is a regular file physically contained
      in `planDir` (realpath check, no symlink);
   4. check the body: refuse closing keywords and append the reference;
   5. check the title: Conventional Commit with type `docs`;
   6. scan, then derive the branch name;
   7. take the lock: `ls-remote --exit-code`, where a present branch gives `BRANCH_EXISTS` carrying
      the remote OID and an unreachable remote gives `REMOTE_UNREACHABLE`;
   8. look up an open PR for the head, where a present one gives `PR_EXISTS`.

   The dry run ends here and reports the planned branch, findings, the would-be blob id
   (`hash-object` without `-w`) and the planned commands. With `--apply`:
   1. write the blob from the plan file;
   2. scan the blob bytes read back, so the scan covers exactly what is committed;
   3. build the commit in a temporary index, using the repository's configured identity
      (`IDENTITY_MISSING` if none) and the caller's validated commit message;
   4. run `assert-changeset` on the new commit;
   5. `git push <remote> <oid>:refs/heads/<branch>`, where a refusal gives `PUSH_REJECTED` with
      redacted stderr;
   6. run `ls-remote` again, where a remote OID different from ours gives `LOCK_LOST`;
   7. `pr-create` with `apply`. On **any** `pr-create` failure, including `mutationMayHaveSucceeded`,
      run one `pr-list` lookup by head. A single exact match is the result; otherwise the result is
      `PR_UNCONFIRMED` with state `branch-pushed`. The core never has to recognize GitHub's
      "PR already exists" refusal specifically.

   Result states are `pull-request-opened`, `pull-request-updated`, `branch-pushed`, and
   `direct-committed`.

6. **Interactive-only modes of `publish`:**
   - **`branchMode: update`** (republication):
     - fetch the branch and require that its remote tip equals the OID the caller expects (from its
       publication receipt), passed as `expectedBranchOid`; a mismatch is `BRANCH_MOVED`;
     - run `assert-changeset` against base over the existing branch (this plan only);
     - make the new commit's parent the branch tip, with the plan blob replaced;
     - push as a fast-forward without force;
     - reuse the open PR and never create a second one.
   - **`target: direct-commit`:**
     - make the parent the `baseRef` tip and push `<oid>:refs/heads/<baseBranch>` without force;
     - move the local base only with a compare-and-swap `update-ref` from exactly the OID used as
       parent, and only when no worktree has that branch checked out;
     - otherwise report `localBaseAdvanced: false` with reason `checked-out` or `diverged`.

     A refused push returns `PUSH_REJECTED`. Falling back to a pull request (one-way) is the
     caller's decision. Restoring the clean `committed` state when the base is checked out is a
     **caller step** that the follow-up revision of the 2026-08-20 plan owns (deep review decision):
     if the working copy's SHA-256 equals the published bytes and the tree is otherwise clean, the
     caller removes the untracked twin and runs `git merge --ff-only`; otherwise it reports
     `pushed-not-merged`. The core returns the published SHA-256 for that comparison.
7. **`complete-branch` (mutation; dry run unless `--apply`).** For a pushed plan branch that has no
   pull request (WP3's `orphan-branch`, and the 2026-08-20 plan's `branch-pushed`):
   - apply the same input and `runState` rules as `publish` (GitHub only, no acknowledgements
     unattended, `visibility` required);
   - read the remote OID and fetch it;
   - require exactly one commit on the branch whose parent is `merge-base(base, tip)`, so an orphan
     survives a moved base but a multi-commit branch is refused;
   - refuse with `IDENTITY_MISMATCH` when the commit's committer identity differs from the
     configured publishing identity;
   - run `assert-changeset` against that merge-base, then scan the blob from the branch, the
     existing commit message, the title and the body;
   - run the PR lookup;
   - run `pr-create` with the same confirmation rule as `publish`.
8. **Mark the 2026-08-20 plan's superseded mechanics** (deep review decision: the full revision is a
   follow-up plan). Add one short note below its header stating that its branch, commit, push and
   PR mechanics are superseded by `plan-publication.mjs` and that a follow-up plan revises it before
   implementation. Nothing else in that file changes in this package. The follow-up plan carries
   the former step 8 content: rebasing it, routing its mechanics through the core, the hooks rule,
   hidden-mode unavailability, the unattended-exception sentence, and the narrowed caller cleanup
   from step 6.
9. Register the scripts and update the two developer-guide paragraphs. Then run the validation
   sequence.

### Scan classes

| Class                   | Confidence | Matches (summary)                                                                                                                                                                                                                            |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private-key`           | high       | `-----BEGIN … PRIVATE KEY-----` block (public certificates are deliberately not a finding)                                                                                                                                                   |
| `provider-token`        | high       | `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, `github_pat_`, `glpat-`, `gitea_`, `npm_`, `xox[abprs]-`, `AKIA` + 16, each with its real length; `sk-` / `sk-ant-` after a non-word boundary with a tail of at least 20 characters from `[A-Za-z0-9_-]` |
| `jwt`                   | high       | three base64url segments starting `eyJ`                                                                                                                                                                                                      |
| `authorization-value`   | high       | `Authorization:` with `Bearer`/`token`/`Basic` value; standalone `Bearer <long value>`                                                                                                                                                       |
| `url-credential`        | high       | `scheme://user:password@` with a non-empty password                                                                                                                                                                                          |
| `attribution`           | high       | the existing `assertPublishable` pattern                                                                                                                                                                                                     |
| `credential-assignment` | lower      | `password`/`secret`/`token`/`api_key`/`*_SECRET`/`*_TOKEN`… with a literal value, using the decomposition sanitizer's prose exemption                                                                                                        |
| `absolute-local-path`   | lower      | `/Users/`, `/home/`, `/root/`, `/private/var/`, `/var/folders/`, `/tmp/`, a drive letter followed by `:\`                                                                                                                                    |

The following are explicitly **not** findings: repository-relative paths (`src/shared/…`,
`docs/plan/…`, `.effective-flow/…`), environment variable names without a value (`GH_TOKEN`),
placeholders (`<token>`, `***`, `[REDACTED]`, `${VAR}`), `git@host:owner/repo` and
`ssh://git@host/owner/repo` remotes and other userinfo-only URLs without a password, prefix-only
identifiers such as `gitea_base_url`, and kebab-case slugs.

### Edge cases

- **Branch already on the remote.** Returns `BRANCH_EXISTS` and writes no commit. In unattended mode
  this is the lock doing its job.
- **Branch only local.** Ignored. The lock is the remote ref, and a local branch of that name is
  neither read nor moved.
- **Race between pre-check and push.** Returns `PUSH_REJECTED` and leaves the remote ref as the
  other publisher wrote it.
- **Identical-commit race.** Both pushes succeed. The PR lookup, or GitHub's duplicate refusal
  followed by the lookup, yields one pull request.
- **`pr-create` may have succeeded.** One lookup, never a second create; otherwise `branch-pushed`.
- **Base moved after it was resolved.** `create-only` builds on the resolved OID, and the result
  carries that base OID. Drift is left to the reviewer, as the concept says.
- **Plan file is a symlink, lies outside `planDir`, is nested, or is not UTF-8.** Refused before any
  object is written.
- **Archive-return pair.** Accepted only interactively with `allowArchiveReturn`. Refused unattended.
- **External tracker reference.** Interactive only. It is a plain line, never `Refs #<N>`.
- **No configured Git identity.** `IDENTITY_MISSING`, with nothing written.
- **Aborted after the blob or commit was written but before the push.** Only unreachable objects
  remain. No ref moved, and Git's own garbage collection handles them.
- **Non-GitHub origin on an unattended run.** `UNSUPPORTED_PROVIDER` before any write.
- **`commit-msg` hook rejects the message.** `COMMIT_MSG_HOOK_REJECTED`, no object written beyond
  the blob.
- **Remote hangs.** Bounded by the timeout: `REMOTE_UNREACHABLE`, or `PUSH_UNCONFIRMED` followed by
  one `ls-remote`.
- **Archive twin still tracked on the base.** A lone `A` is refused with `ARCHIVE_TWIN_PRESENT`.
- **Signed-commits rule on the base.** The unsigned plumbing commit is refused: `PUSH_REJECTED`.

## Acceptance criteria

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass, in that
      order.
- [ ] `node build.mjs` copies `scripts/plan-publication.mjs`, `scripts/plan-publication-core.mjs`
      and `scripts/process-runner.mjs` byte-for-byte into all three targets. The four registries
      list them.
- [ ] Tests prove the exported plan-branch parser: it accepts `<prefix>/plan/issue-12` and
      `plan/issue-12` (empty prefix) and rejects `issue-abc`, `issue-01`, `issue-1x` and
      `issue-0`; `branch-name` with only `issue` and `branchPrefix` returns the same name.
- [ ] `test/plan-publication.test.mjs` proves both directions for every scan class: each class
      matches at least one runtime-assembled fixture, and each listed non-finding produces no
      finding. Fixtures are assembled at runtime, so the repository holds no literal token shape.
- [ ] A test holds a fixed list of realistic token fixtures (each prefix with its real length,
      assembled at runtime) and proves that both `redact()` (`remote-tracker-shared-core.mjs`) and
      `scan` catch every one of them as a high-confidence finding. Userinfo-only URLs and
      prefix-only identifiers are deliberately not in that list.
- [ ] Tests prove the confidence rules:
  - a high-confidence finding blocks even when its id is acknowledged;
  - a lower-confidence finding blocks unless acknowledged on an interactive run;
  - any acknowledgement on an unattended run is refused.
- [ ] Tests prove the unattended input rules:
  - each of `direct-commit`, `update`, a missing issue, `allowArchiveReturn`, a non-GitHub
    provider, and hidden mode is refused before any Git or forge call;
  - the fake runner records zero calls in each case.
- [ ] Tests prove the closing-keyword rule: each of the nine keywords, in any case, with and without
      a colon, followed by `#<N>`, `owner/repo#<N>` or an issue URL, is refused in the title, in the
      commit message and in the body; the published body ends with exactly one `Refs #<N>` line; an
      `externalReference` together with an issue is refused.
- [ ] Tests prove `visibility` is required: a missing value is `INVALID_INPUT`, and `hidden` is
      refused interactively as well as unattended, with zero runner calls.
- [ ] The git test proves the hooks rule: a `commit-msg` hook that exits nonzero refuses the
      publication with `COMMIT_MSG_HOOK_REJECTED`; a `pre-commit` hook that would modify the working
      tree is never run.
- [ ] `test/plan-publication-git.test.mjs` proves the single-file assertion:
  - each listed violation is refused: second file, path outside `planDir`, nested path, deletion,
    modification, mode `100755`, symlink, two commits in `create-only`, oversized blob, issue
    mismatch, and an unattended plan not named `YYYY-MM-DD-issue-<N>-<slug>.md`;
  - the plain add is accepted;
  - the archive-return pair is accepted only with `allowArchiveReturn`, and the commit removes the
    archive path;
  - a lone `A` while the base still tracks the archive twin is refused with
    `ARCHIVE_TWIN_PRESENT`.
- [ ] The git test proves the happy path:
  - the remote branch points at one commit whose parent is the base tip and whose diff is exactly
    the plan file;
  - the working tree, the index file's bytes, and `HEAD` are identical before and after;
  - the fake forge recorded exactly one `pr-create` call.
- [ ] The git test proves the branch lock:
  - a second `publish` for the same issue returns `BRANCH_EXISTS`, the remote ref is unchanged,
    and no `pr-create` is recorded;
  - a branch created from a second clone between pre-check and push yields `PUSH_REJECTED`, with
    the remote ref unchanged.
- [ ] The git test records every spawned Git argv. None contains `--force`, `-f`,
      `--force-with-lease`, `--no-verify`, or a refspec starting with `+`.
- [ ] A dry-run `publish` leaves `git count-objects -v`, every ref, and the fake forge's mutation
      log unchanged.
- [ ] `mutationMayHaveSucceeded` from the fake forge leads to exactly one lookup and no second create.
- [ ] Direct commit advances the remote base without force. A pre-receive refusal yields
      `PUSH_REJECTED` with the local base unchanged.
- [ ] `update` fast-forwards an existing plan branch and creates no second PR.
- [ ] `complete-branch` opens a PR for a single-file orphan branch whose base has since moved, and
      refuses a branch that carries a second file, a second commit, or a foreign committer identity.
- [ ] Every network Git call in the git test runs with the non-interactive environment and a
      timeout; a simulated hang yields `REMOTE_UNREACHABLE` or `PUSH_UNCONFIRMED`.
- [ ] `test/remote-tracker.test.mjs` passes unchanged after the runner extraction.
- [ ] `docs/plan/2026-08-20-plan-publication-before-implementation.md` carries the "superseded
      mechanics" note and is otherwise unchanged.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution`, run
  from the checkout root.
- Focused: `node --test test/plan-publication.test.mjs test/plan-publication-git.test.mjs test/remote-tracker.test.mjs test/execution-profile-contract.test.mjs`.
- Manual dry run in this checkout: run `publish` without `--apply` on an existing plan file. Expect:
  - the branch `effective-flow/plan/<stem>`;
  - no findings, or only named lower-confidence ones;
  - an unchanged `git status` and `git count-objects -v`.

## Assumptions and open points

- **Assumption:** binding decision D3 limits the unattended path to GitHub. Forgejo stays usable for
  interactive callers through the existing tracker operations; the core does not add or remove
  Forgejo support there. Forgejo for unattended publication is deferred, not planned here.
- **Assumption:** under binding decision D2, private repositories may run without forge-side
  branch rules. This plan does not decide that posture. It makes the in-run checks fail closed
  because, there, they are the only boundary. **Precondition:** these checks bound only the core's
  own path. They hold only if the write token is exposed to the core's push and PR calls and never
  to the model step; otherwise an agent's own `git push` bypasses both. Enforcing that is WP6b's
  job (`llm-automatisator`, `2026-10-01-issue-buddy-schreib-token-und-veroeffentlichung.md`).
- **Assumption:** the living ADR "Plan-only unattended publication"
  (`docs/adr/plan-only-unattended-publication.md`, concept ADR candidate) is written by WP5, the
  first change that gives an unattended run a publishing entry point. WP4 ships the mechanism, adds no entry point and writes no ADR; the follow-up revision of the
  2026-08-20 plan restates the exception there.
- **Assumption:** callers resolve `language.git` and `language.forge`, the base branch (through
  `src/shared/base-branch-resolution.md`), the branch prefix, and the attended or unattended state.
  The core validates the results but resolves none of them.
- **Assumption:** the core ships before any tool uses it, as `pilot-measurement` did. No
  `CONTEXT_BUDGET_LINES` entry changes.
- **Out of scope:** consolidating the three existing credential detectors; any change to
  `src/tools/pr.md`, `src/tools/plan.md`, `src/shared/worktree-integration.md`, or the next-step
  rows; revising and implementing the 2026-08-20 plan (a separate follow-up plan, to be created
  with `effective-flow plan` before that plan is implemented).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

The judgment came from the `effective-delivery` skill (plan review and complexity lens), applied to
the verified context at `e846936`.

- **[Architecture] Important:** a plumbing commit silently skips client commit hooks, which the
  2026-08-20 plan promised to respect. _Incorporated:_ stated as an architecture decision with its
  rationale; `pre-push` still runs, and the revised plan must restate the rule.
- **[Architecture] Important:** `createProcessRunner` cannot be imported, because
  `remote-tracker.mjs` runs `main()` at import. Copying it would duplicate the bounded-kill logic.
  _Incorporated:_ extract it into `process-runner.mjs` and coordinate with WP3.
- **[Architecture] Note:** a single `publish` operation could be split into commit, push and PR
  steps. Kept as one operation: the ask happens before any mutation, so callers gain nothing from
  intermediate steps, and the fixed order is the point.
- **[Security] Important:** under D2 the in-run checks are the only boundary on private repos.
  _Incorporated:_ the scan and the assertion are fail-closed, acknowledgements are refused
  unattended, and the plan file must be physically contained and a regular file.
- **[Security] Important:** test fixtures holding real-looking tokens would trip GitHub push
  protection and add secret-shaped literals to the repository. _Incorporated:_ fixtures are
  assembled at runtime.
- **[Error cases] Important:** a byte-identical commit from two passes defeats the push lock.
  _Incorporated:_ the PR lookup before create, GitHub's duplicate refusal, and the stop condition.
- **[Testability] Important:** "no force push" was unverifiable as prose. _Incorporated:_ an argv
  audit over every spawned Git command.
- **[Scope] Important:** retrofitting the three existing detectors would change shipped redaction
  behavior. _Decision:_ out of scope, pinned by a consistency test instead.
- **[Data protection] Note:** the envelope reports findings by id, never by value.
- **[Testability] Note:** the dry run's "writes nothing" is measured by object count and refs, not
  asserted in prose.
- **[Scope] Note:** public certificates were dropped from the 2026-08-20 plan's class list, because
  they are not secrets.
- **[Maintainability] Note:** the unattended rules live once in the core, so the WP5 prompt cannot
  drift from them.
- **Cross-plan alignment (2026-10-01):** binding orchestrator resolutions applied. This package
  now unconditionally extracts and registers `process-runner.mjs` and exports the branch
  derivation and plan-branch parser, both imported by WP3, which depends on this package (order
  WP1 → WP2 ∥ WP4 → WP3 → WP5). `branch-name` accepts an issue without a plan file. The
  `issue-<N>` file-name requirement now applies to unattended runs only, so interactive plans
  with a hand-added `**Issue:**` header (WP2) are no longer refused.

### Deep review (2026-10-01)

Result unchanged: **Approved**. No critical findings; seven important findings and five notes
incorporated directly; three decisions made by the user.

- **Decision (Scope):** revising the 862-line 2026-08-20 plan, with an "Approved" criterion outside
  the implementer's control, sat on the critical path to WP3 and WP5. _Decided:_ a separate
  follow-up plan; this package only adds a "superseded mechanics" note.
- **Decision (Architecture):** in `merge` mode the checked-out base never advances and the untracked
  twin collides on the next pull. _Decided:_ a narrowed caller cleanup (byte-equal working copy and
  otherwise clean tree → remove the twin, `merge --ff-only`), owned by the follow-up revision; the
  core returns the published SHA-256.
- **Decision (Architecture):** the hook rationale was inaccurate. _Decided:_ skip `pre-commit`, run
  `commit-msg` through `git hook run` on the message file; plumbing commits are unsigned.
- **Important (Testability), incorporated:** the `redact()` consistency criterion contradicted the
  class table; replaced by a fixed list of realistic fixtures, with ssh/userinfo-only URLs and
  prefix-only identifiers as non-findings.
- **Important (Security), incorporated:** the closing-keyword rule now covers colon and
  `owner/repo#N` forms, case-insensitively, in title, commit message and body.
- **Important (Error cases), incorporated:** an archive return produced two copies; the temporary
  index now removes the archive path, and a lone `A` with a tracked twin is refused.
- **Important (Security), incorporated:** `complete-branch` now applies the run-state rules,
  requires one commit on `merge-base(base, tip)`, scans the existing commit message and checks the
  committer identity.
- **Important (Error cases), incorporated:** network Git calls are bounded with the existing
  non-interactive environment and timeout.
- **Important (Security), incorporated:** the D2 boundary's precondition (token never exposed to the
  model step) is stated and pointed to WP6b.
- **Important (Security), incorporated:** `visibility` is a required input, so the hidden-mode
  refusal cannot be bypassed by omission.
- **Notes, incorporated:** the stop condition is gone (one lookup after any `pr-create` failure);
  the runner move is not byte-for-byte and only CLI entries import it; `AGENTS.md` and the
  decomposition export are in the affected files; `update` mode compares against the caller's
  expected OID; the `sk-` shape is specified.

## Open points

- No open points.

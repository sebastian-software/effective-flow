# Extract a shared plan publication core

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `266eb7e` on 2026-10-17, the tip of `develop` (re-derived; first derived at
`e846936` on 2026-10-01). **Working state:** one unrelated untracked plan dated 2026-10-16. None of
the in-scope sources listed below has local changes.

## Requirement

This plan covers work package 4 ("Shared publication core") of the concept
`docs/concept/2026-09-29-issue-buddy.md`, Solution sketch step 7 ("Publish") and the Technical direction
items "Publication core" and "Trust boundary". The core lets a finished plan file be published by a
deterministic script rather than by model judgment. For an **unattended** Issue Buddy pass it runs
these steps; the changeset assertion runs on the built commit before the push:

1. assert that the change is exactly one added plan file;
2. scan the file, the commit message, the pull-request title, and the pull-request body for secrets
   and forbidden paths, where every finding blocks;
3. build a commit on the deterministic branch `<branchPrefix>/plan/issue-<N>`;
4. push without force, so the branch acts as a lock;
5. open a **draft** pull request whose body carries the shipped plan marker line and the non-closing
   `Refs #<N>`, and confirm it by reading it back.

Interactive publication shipped with #511 (`e002492`) as `src/shared/plan-publication.md` and
`src/shared/plan-pr-continuation.md`; the plan behind it is archived at
`docs/plan/archive/2026-08-20-plan-publication-before-implementation.md`. This package does not
change its branch, commit, push or pull-request mechanics. It shares two things with it: the pull
request this core opens has the shipped draft-plus-marker shape, so `build`, `fix`, `refactor` and
`docs` continue on it through `plan-pr-continuation`; and the core's `scan` replaces the
model-run content check in `plan-publication.md`, so both paths apply one scan.

Sibling plans of the same concept:

- `docs/plan/2026-10-01-unattended-planning-and-readiness-contract.md` (WP2) defines the
  `**Issue:** #<N>` header and the unattended plan file name `YYYY-MM-DD-issue-<N>-<slug>.md`. This
  plan only reads that header and does not depend on WP2 being delivered first. Without the header,
  a caller passes the issue number explicitly.
- `docs/plan/2026-10-01-issue-buddy-runtime-script.md` (WP3) depends on this plan. It imports
  this package's shared process runner (`src/scripts/process-runner.mjs`) and its exported pure
  branch derivation and plan-branch parser from `plan-publication-core.mjs`, and neither copies
  nor re-derives them. The plan-branch name stays `<branchPrefix>/plan/issue-<N>`. WP3's
  `orphan-branch` classification is completed by WP5 through this core's `complete-branch`.
- `docs/plan/2026-10-01-issue-buddy-tool-stage-1.md` (WP5) depends on this plan and calls
  `publish` and `complete-branch`.
- Order: WP1 (`2026-10-01-codex-exec-unattended-spike.md`) → WP2 ∥ WP4 (this package) → WP3 →
  WP5.

The recommendation is Feature: the work adds new shipped runtime capability (a script pair, a shared
runner module, their tests and registration) and points one shared fragment's content check at it.
The runner move restructures no behavior.

### Verified context

- **Shipped interactive publication.** `src/shared/plan-publication.md`:
  - it is offered only when `delivery.completion` is `pr` or `null` (`:61-77`), refused in hidden
    mode, and publishes nothing in a non-interactive run without caller consent;
  - discovery is `pr-list` with `planPath` plus five checks: marker equals `P`, open and `draft`,
    same repository, base equals the resolved local base branch, head diff touches only `P` or
    the `D` of its archive twin (`:108-165`);
  - the branch is `<delivery.branchPrefix>/<skill>/<slug>` with a numeric suffix and is never the
    discovery key (`:167-173`);
  - its content check is prose the model runs (`:181-201`): private-key **and certificate**
    headers, token prefixes with at least 20 token characters, JWTs, `Bearer` values, literal
    `password`/`secret`/`api_key` assignments, and `/Users/`, `/home/` or drive-letter paths; the
    one ask "Publish plan" (`:203-221`) acknowledges every listed finding;
  - the commit runs through the `commit` skill in a temporary sibling worktree with hooks
    (`:223-303`); the pull request goes through `pr` with `Draft: requested` and the
    `Plan marker:` line, and a `pr-list` read-back must confirm `draft: true` (`:305-332`);
  - the title is `docs: plan <plan title>`; the body is one sentence, `P`, the `Requirement`
    summary, then the marker line, with no issue reference (`:348-358`).
- **Continuation.** `src/shared/plan-pr-continuation.md`: an effective `delivery.completion` of
  `merge` or `branch` stops the run on a found plan pull request unless an explicit `pr` directive
  overrides it (`:144-152`); the finish goes through `pr` with `Finalize plan draft:` (`:270-290`),
  and `pr` step 9 re-derives title and body (`src/tools/pr.md:266`). On a difference between local
  and published plan it loads `plan-publication` for its content check **before** the "Plan
  differs" ask and feeds the findings into that ask's question (`:155-176`); "Republish" then runs
  the republication with `consent: given-by-caller` (`:178-186`).
- **`pr-list` lookups.** The GitHub builder forwards `head` into the REST query
  (`remote-tracker-github-core.mjs:413-421`), and the core then keeps only items whose normalized
  `head` equals the input (`remote-tracker-core.mjs:3835-3837`). The normalized `head` is the bare
  branch name, also for a fork pull request (`:2792-2816`), so `head` alone does not distinguish a
  same-repository pull request from a fork's; `sameRepository` and `base` do.
- **Process output is text.** The extracted runner decodes stdout and stderr as UTF-8 strings and
  writes stdin as a string (`src/scripts/remote-tracker.mjs:66-69`), so invalid bytes would arrive
  as U+FFFD.
- **Marker grammar.** `src/scripts/remote-tracker-core.mjs:2882-2922`: exactly
  `<!-- effective-flow-plan-pr:v1 {"plan":"<P>"} -->`, on its own line, exactly once, with the JSON in
  its canonical `JSON.stringify` spelling and a path that `isSafePlanPath` (`:2947`, not exported)
  admits. `inspectPlanPrMarker` (`:2961`) is exported. `pr-list` with `planPath` (`:3829-3842`)
  keeps only items whose parsed marker equals `P` and drops their bodies. Nothing in the repository
  builds the marker line; `plan-publication.md` writes it into `pr`'s `Plan marker:` line
  (`:314-320`).
- **Draft capability.** The GitHub probe states `pullRequestDraftCreate: true` unconditionally
  (`remote-tracker-core.mjs:2453-2459`), because a repository's plan cannot be probed. A repository
  that refuses drafts is reported by `pr-create` itself as `UNSUPPORTED_CAPABILITY` through
  `draftCreateRunner` (`:2134-2176`, applied at `:5223-5228`). Forgejo is gated on the probe
  (`:4798-4808`). The GitHub builder sends `draft` in the REST body
  (`src/scripts/remote-tracker-github-core.mjs:464-479`).
- **`pr-create` builders.** GitHub `remote-tracker-github-core.mjs:464`, Forgejo
  `remote-tracker-forgejo-core.mjs:346`. Both pass title and body through `publishedText`
  (`src/scripts/remote-tracker-shared-core.mjs:354`), whose only content guard is
  `assertPublishable` (`:24-30`, generation attribution), plus `assertUndisclosed` (`:326`) in hidden
  mode. There is no secret scan before a pull request is created.
- **Existing credential detectors.** There are three, and each redacts text or checks one field:
  - `sanitizeChildText` with its private-key header pattern `-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----`
    (`:383`), the closed key list `SENSITIVE_CHILD_FIELD` (`:73`), the assignment matcher
    `SENSITIVE_CHILD_ASSIGNMENT` (`:76`) and the prose exemption `isLegitimateCredentialProse`
    (`:463-468`), none of them exported (`src/scripts/remote-tracker-decomposition-core.mjs:73-500`);
  - `containsCredentialMaterial` (`src/scripts/pilot-measurement-core.mjs:283`);
  - `CREDENTIAL_PATTERNS` and `diagnosticText` (`src/scripts/delivery-selection-core.mjs:1446-1466`),
    plus `redact()` (`remote-tracker-shared-core.mjs:411`).

  None of them refuses publication of a file.

- **In-process tracker calls.** `executeOperation(operation, input, { apply, runner })`
  (`remote-tracker-core.mjs:4723`) accepts an injected process runner and keeps every mutation a
  dry run unless `apply` is set.
- **Process runners.** Five divergent `createProcessRunner` definitions exist:
  `src/scripts/remote-tracker.mjs:25` (CLI-local, with `isUsableDirectory`, `FORCED_KILL_GRACE_MS`,
  `env` and `timeoutMs` support; the module runs `await main()` at import, so it cannot be imported),
  `delivery-selection.mjs:23`, `pilot-measurement.mjs:13`, and the exported ones in
  `config-resolve-core.mjs:296` and `diff-baseline-core.mjs:157`. No shared module exists.
- **The `pr` tool cannot serve an unattended pass.** `src/tools/pr.md`:
  - it may ask for the provider on `AMBIGUOUS_HOST` (`:222`) and for the commit type on genuine
    ambiguity (`:277`);
  - it pushes with `push -u origin` (`:226`);
  - a direct invocation needs a clean, attached, non-base checkout (`:306`);
  - it restores no checkout (`:292`).
- **Issue keywords.** `src/shared/tracker-target.md:329-336`: on a forge target, `Refs #<issue>` is
  the non-closing machine token and stays English.
- **Bounded network calls.** `NON_INTERACTIVE_FETCH_ENV`, `nonInteractiveFetchEnv` and
  `UPSTREAM_FETCH_TIMEOUT_MS` (60 s) are exported from `delivery-selection-core.mjs:1376-1420`.
- **Script registration.** A shipped script must be listed in all of these, or a guard or test
  fails:
  - `build.mjs:114-135` (`RUNTIME_SCRIPT_FILES`, 20 entries);
  - `scripts/distribution-smoke.mjs:33-54`;
  - `test/execution-profile-contract.test.mjs:128-149` (`EXPECTED_RUNTIME_SCRIPTS`), with the count
    assertion `20` and its message at `:893-897`;
  - the prose in `docs/developer-guide/build-system.md:392-405` ("Seven subsystems"), `:637-642`
    ("twenty files") and `:776` ("all twenty"), and
    `docs/developer-guide/release-and-installation.md:379-386`;
  - `AGENTS.md:42` names every module outside the CLI-over-core pair pattern.
- **Budget and eval reach of `plan-publication.md`.** It is only lazily included, from
  `src/tools/plan.md:532` and `src/shared/plan-pr-continuation.md:165`, so no
  `CONTEXT_BUDGET_LINES` entry counts it (`plan: 713`, `build.mjs:2213`). No eval suite seed
  (`evals/merge-gate`, `evals/iterate`, `evals/next-steps`, each `suite.config.mjs`) reaches it
  through an eager or lazy include, so its content is in no suite's load-set identity.
- **Content-check test.** `test/workflow-contracts.test.mjs:20433-20490` pins the content check's
  class literals in `plan-publication.md`, including `CERTIFICATE`.
- **Git test pattern.** `test/delivery-selection-git.test.mjs:690-712` sets up a bare remote with
  two clones and a fixed test identity. The branch-lock tests follow it.

### Shipped interactive publication vs. this core

| Aspect            | Shipped interactive publication                                                          | This core (unattended)                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Branch            | `<prefix>/<skill>/<slug>`, numeric suffix when taken                                     | `<prefix>/plan/issue-<N>`, never a suffix; a taken name is `BRANCH_EXISTS`                                   |
| Discovery         | `pr-list` by `planPath` plus five checks                                                 | lock on the remote ref plus `pr-list` by head; the marker makes the result findable by the shipped discovery |
| Commit            | `commit` skill in a temporary sibling worktree, all hooks run                            | plumbing commit in a temporary index; `pre-commit` skipped, `commit-msg` run; unsigned                       |
| Push              | through `pr` (`push -u origin`), or a plain push on republication                        | one non-force `git push <remote> <oid>:refs/heads/<branch>`, bounded, then a remote-OID compare              |
| Scan              | `plan-publication.mjs scan` after this package; lower confidence acknowledged by the ask | the same `scan`; every finding blocks                                                                        |
| Pull-request body | one sentence, `P`, `Requirement` summary, marker line placed by `pr`; no issue reference | same prose from the caller; marker line built and round-trip-checked by the core; final `Refs #<N>`          |
| Draft             | `Draft: requested` through `pr`, read-back confirms `draft: true`                        | `draft: true` on in-process `pr-create`, probe capability required, read-back confirms draft and marker      |
| Consent           | one ask; a non-interactive run publishes nothing                                         | none; the flag-gated unattended pass (ADR by WP5)                                                            |
| Republication     | onto the verified candidate's branch                                                     | none: create-only                                                                                            |

## Architecture decisions

- **One script pair, `plan-publication.mjs` over `plan-publication-core.mjs`.** It follows the
  repository's CLI-over-core split: JSON on stdin, one JSON envelope on stdout, and every mutation a
  dry run unless `--apply` is passed, like the remote tracker. Model judgment stays outside it.
  Callers pass in the plan file, the title and body texts, the commit message, and the run state.
  The core validates the title, the closing-keyword rule, and the marker; it does **not** validate
  the shape of the caller's body prose, so WP5 may add the review result and open decisions.
- **Closed input schema per operation.** Each operation accepts exactly its documented keys, like
  `plan-lint`; any unknown key is `INVALID_INPUT` before any Git or forge call. Every operation takes a
  required absolute `cwd` (realpath-verified repository root); `planFile` and `planDir` are
  relative to it. The CLI `scan` schema is exactly `{cwd, runState, planFile, title?, body?,
commitMessage?}`; scanning blob bytes is an in-process core function only, never a CLI input. The
  mutating operations take `cwd`, `runState`, `visibility`, `issue`, `planDir`, `planFile`,
  `branchPrefix`, `remote`, `baseBranch`, `title`, `body` and `commitMessage`; `complete-branch`
  takes `branch` instead of `planFile` and `commitMessage`. Test-only options such as an injected
  `timeoutMs` are core function options, never input keys.
- **Remote name versus URL.** `remote` is a remote **name** (for example `origin`). The core
  resolves `git remote get-url <remote>` once and passes that URL as the tracker's `remote` on
  every `executeOperation` call, so `repository-resolve`, `probe`, `pr-list` and `pr-create`
  address the same repository the fetch and the push target; the tracker would otherwise always
  resolve `origin` (`remote-tracker-core.mjs:1184-1213`).
- **Unattended only (user decision, 2026-10-17).** The operations are `scan`, `branch-name`,
  `assert-changeset`, `publish` and `complete-branch`. The two mutating operations require
  `runState: unattended`; another value is `INVALID_INPUT` before any Git or forge call. With that they enforce in one place: a GitHub repository (binding decision
  D3; any other provider stops with `UNSUPPORTED_PROVIDER`), a create-only branch, a required issue
  number, and no acknowledgements. Direct commit, republication onto an existing branch, archive
  returns and a local receipt are not part of the core. `scan` alone also serves interactive
  callers.
- **Draft pull request with the shipped marker (user decision, 2026-10-17).** The core builds the
  marker line itself as `<!-- effective-flow-plan-pr:v1 ` + `JSON.stringify({ plan: P })` + ` -->`,
  where `P` is the repository-relative plan path, and places it as its own line after the caller's
  prose. Before any mutation it checks the complete final body with the exported
  `inspectPlanPrMarker`, which must return `valid` with exactly `P`; anything else, such as a caller
  body that already holds a marker line or marker comment, is `MARKER_INVALID`. It requires the
  probe's `pullRequestDraftCreate` to be `true` (`UNSUPPORTED_CAPABILITY` otherwise), creates the
  pull request with `draft: true` and `base: <baseBranch>`, and then reads it back with `pr-list`
  (`planPath: P`): the created number must come back with
  `draft: true`, `sameRepository: true` and `base` equal to `baseBranch`, or the result is
  `DRAFT_UNCONFIRMED` carrying the URL.
- **Every lookup filters client-side and ignores foreign pull requests.** Each `pr-list` lookup
  (the pre-check, the lookup after a `pr-create` failure, and the read-back) calls `pr-list`
  **without** `head` (with `planPath` where specified), because GitHub documents `head` as
  `user:ref-name` and no shipped caller relies on a bare value, and the core keeps only items with
  `head === <branch>`, `sameRepository === true` and `base` equal to `baseBranch`. Other items are reported as ignored and never trip `PR_EXISTS` or count as "a
  single exact match", so an outsider's fork pull request on the same branch name cannot block or
  be adopted.
- **Base name and base commit are separate inputs.** `baseBranch` is the branch name (the resolved
  `delivery.baseBranch` without its remote prefix), sent as the `pr-create` base and compared on
  read-back, which the shipped discovery's base check requires (`plan-publication.md:126`). The
  parent commit is resolved by the core from `refs/remotes/<remote>/<baseBranch>` after a bounded
  fetch, so a caller's detached worktree (WP5) cannot supply a mismatching base. The title is the shipped `docs: plan <plan title>` form,
  which the caller renders per `language.git`; the core requires a single-line Conventional Commit
  title of type `docs`. Consequences, documented rather than changed here: a reviewer, or the
  continuation's finish, marks the pull request ready; a target repository whose effective
  `delivery.completion` is `merge` or `branch` stops `build` on it unless an explicit `pr` directive
  is given (shipped behavior).
- **One scan, in the core (user decision, 2026-10-17).** `plan-publication.mjs scan` is the only
  scan. `src/shared/plan-publication.md`'s content check calls it with `runState: interactive` and
  keeps no class list of its own. A high-confidence finding then makes interactive publication
  unavailable before the question, also under `consent: given-by-caller`; lower-confidence findings
  stay acknowledgeable through the existing single ask. Interactive behavior changes accordingly:
  public certificates stop being findings; `url-credential`, `authorization-value`, `attribution`
  and the paths `/root/`, `/private/var/`, `/var/folders/` and `/tmp/` become findings. A failed or
  unparseable `scan` makes publication unavailable, so the check fails closed.
- **Continuation stops before its question (user decision, 2026-10-17).** In
  `plan-pr-continuation.md`, a blocking or failed scan of the local plan stops the run **before**
  the "Plan differs" ask, naming the findings by class and line, so the question never offers a
  "Republish" that can only fail. One sentence there carries this; a test pins it.
- **Plumbing commit, never a checkout switch.** The commit is built in a temporary index:
  - `GIT_INDEX_FILE` points into an `os.tmpdir()` `mkdtemp` directory, which is removed in a
    `finally`;
  - the base tree is read, the plan blob is added, and the tree is written;
  - `commit-tree` sets the parent explicitly.

  The user's index, working tree and checked-out branch stay untouched, and no worktree is needed.

- **Bytes, not text, for plan content.** The core reads the plan file with `fs` as bytes and checks
  NUL and UTF-8 with a `fatal` `TextDecoder`. Blob bytes read back from Git (the written blob and a
  `complete-branch` branch blob) go through an additive buffer mode of the extracted runner;
  existing string callers are unchanged. The SHA-256 is no longer part of the result, since its only
  consumer (the dropped direct-commit cleanup) is gone.
- **Git version floor.** `git hook run --ignore-missing` needs Git 2.36 or newer. The core reads
  `git --version` in the pre-mutation checks, so a dry run reports it too, and refuses an older Git
  with `GIT_UNSUPPORTED` before any object is written.

- **Hooks (deep review decision, 2026-10-01).** The core skips the client `pre-commit` hook and
  runs the `commit-msg` hook through `git hook run --ignore-missing commit-msg -- <message-file>` on
  a temporary message file before `commit-tree`, bounded by the same timeout as network calls; a
  nonzero exit or a timeout refuses the publication with `COMMIT_MSG_HOOK_REJECTED` (stderr
  redacted). The commit uses the file's content after the hook
  ran, and that final message is checked and scanned again. Rationale: Git exports
  `GIT_INDEX_FILE` to hooks, so the index is not the problem; the real risk is a `pre-commit` hook
  such as lint-staged that stashes or rewrites the working tree, which `commit-msg` on a message
  file does not touch. Commitlint therefore keeps working. `pre-push` hooks still run because the
  push is an ordinary `git push` and never takes `--no-verify`, and server-side rules still apply.
  Plumbing commits are **unsigned**; a "require signed commits" rule therefore turns into
  `PUSH_REJECTED`, which the core reports as such.
- **Network calls are bounded.** Every network Git call (`ls-remote`, `fetch`, `push`, including its
  `pre-push` hook) runs with `nonInteractiveFetchEnv` and the timeout `UPSTREAM_FETCH_TIMEOUT_MS`,
  imported from `delivery-selection-core.mjs`. A timeout before the push is `REMOTE_UNREACHABLE`; a
  timeout during the push is `PUSH_UNCONFIRMED`, followed by one `ls-remote` that decides between
  `branch-pushed` and `REMOTE_UNREACHABLE`.
- **Explicit `visibility` input.** `visibility` (`standard` | `hidden`) is a required input of every
  mutating operation; a missing or other value is `INVALID_INPUT`, so a caller that omits it cannot
  bypass the hidden-mode refusal. Hidden mode returns `HIDDEN_MODE_UNSUPPORTED` before any Git or
  forge access: hidden-mode plans are untracked, and nothing published may name Effective Flow.
- **Branch lock = `ls-remote` pre-check + plain push + remote-OID compare + PR lookup.** The push
  never uses `--force`, `--force-with-lease`, a `+` refspec, or `--no-verify`. A second publisher's
  push is refused as non-fast-forward, because its commit does not descend from the first
  publisher's commit. The pre-check closes the common case early. The compare after the push
  detects a lost race. The PR lookup after any `pr-create` failure and GitHub's own "one open pull
  request per head and base" rule cover the remaining case: two passes producing a byte-identical
  commit within the same second. `--force-with-lease=<ref>:` with an empty expected value was
  rejected: it is atomic, but it contradicts the prohibition list and the concept's "without force".
- **Scan classes have two confidence levels.** A high-confidence finding always blocks. A
  lower-confidence finding blocks on an unattended run and is reported as acknowledgeable on an
  interactive one, where the caller's single ask carries the acknowledgement. A private GitHub
  repository has no forge-side rules; under WP5's binding decision D2 it stays dry-run-only in stage
  1 until WP6b isolates the forge credential from model steps. Once publishing is enabled there, the
  scan and the single-file assertion are the only in-run boundary, so both fail closed rather than
  advise. Their limit is stated plainly: a pattern scan catches accidental leaks, not deliberate
  exfiltration (encoded or split values pass it), so it is no defence against a compromised model
  step; that is what the WP6b credential isolation is for.
- **The core reports findings by class, field and line, never by value.** A finding id has the form
  `<class>:<field>:<line>`, which keeps the envelope, the question and the pass report free of
  secret material.
- **The core owns the issue reference.** GitHub closes issues from the PR title and body and from
  commit messages that reach the default branch (squash or direct commits). So the core refuses,
  case-insensitively, any closing keyword (`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`,
  `resolve`, `resolves`, `resolved`), with or without a following colon, followed by `#<digits>`,
  `owner/repo#<digits>` or an issue URL, in the **title, the commit message and the body**. The body
  ends with the marker line and then `Refs #<N>` as its final line, both appended by the core.
- **Process runner extraction (user decision, 2026-10-17).** Only remote-tracker's
  `createProcessRunner` moves, from `remote-tracker.mjs` into a new `src/scripts/process-runner.mjs`,
  together with `isUsableDirectory` and `FORCED_KILL_GRACE_MS`, behind one export; its behavior is
  unchanged, but the move is not byte-for-byte. The rule: CLI entries (`remote-tracker.mjs`,
  `plan-publication.mjs`, later WP3's `issue-buddy.mjs`) import it and inject it into their cores,
  and no core imports it. The runners in `delivery-selection.mjs`, `pilot-measurement.mjs`,
  `config-resolve-core.mjs` and `diff-baseline-core.mjs` stay as they are; the two exported from
  cores are pre-existing and untouched. This package registers `process-runner.mjs` once; WP3
  registers only its own two files. The export is named `createProcessRunner`; its additive option
  returns stdout as a `Buffer` for blob reads.
- **The core owns the plan-branch name.** Besides the `branch-name` operation, the core exports
  the pure derivation `planBranchName({ branchPrefix, issue })` and the parser
  `parsePlanBranch(name)`, which accepts exactly `<prefix>/plan/issue-<N>` (or `plan/issue-<N>`
  with an empty prefix), where `<N>` is a positive integer without a leading zero. WP3 imports both
  in-process. The pure derivation validates the prefix segments in-process (no `..`, no leading or
  trailing `/` or `.`, no control or `~^:?*[\` characters, no `.lock` suffix); only the
  `branch-name` operation additionally runs `git check-ref-format --branch`. The forge-side ruleset pattern `issue-[0-9]*` in the WP7
  operations plan is a superset of these names, because `fnmatch` cannot express "digits only".
- **Reuse is limited to what fits.** The core uses `executeOperation` with the tracker's provider
  guards, `inspectPlanPrMarker`, `assertPublishable` and `assertUndisclosed`, `diagnosticText` for
  redacting Git stderr, and the decomposition sanitizer's `SENSITIVE_CHILD_FIELD` key list and
  `isLegitimateCredentialProse` exemption for credential assignments.
  It does **not** retrofit the three existing detectors: they redact, while this core refuses, and
  changing the decomposition sanitizer would alter shipped behavior. A test pins consistency instead
  (see Acceptance criteria).

## Affected files

| File                                                | Description                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/plan-publication-core.mjs`             | **New.** Operations `scan`, `branch-name`, `assert-changeset`, `publish`, `complete-branch`; input validation; unattended rules; scan class table; marker build and round-trip; plumbing commit; branch lock; draft PR through `executeOperation` with read-back. |
| `src/scripts/plan-publication.mjs`                  | **New.** Thin JSON CLI (`<operation> [--apply]`); imports and injects the process runner.                                                                                                                                                                         |
| `src/scripts/process-runner.mjs`                    | **New.** `createProcessRunner` and its helpers moved from `remote-tracker.mjs`, behavior unchanged, plus an additive buffer-output option; imported only by CLI entries.                                                                                          |
| `src/scripts/remote-tracker.mjs`                    | Imports the runner from `process-runner.mjs` instead of defining it; behavior unchanged.                                                                                                                                                                          |
| `src/scripts/remote-tracker-decomposition-core.mjs` | Export `SENSITIVE_CHILD_FIELD` and `isLegitimateCredentialProse` so the scan reuses them instead of copying them; no behavior change.                                                                                                                             |
| `src/shared/plan-publication.md`                    | "Content check" (`:181-201`) calls `plan-publication.mjs scan` with `runState: interactive`, drops its class list, and states the two-confidence rule, the fail-closed script failure, and the high-confidence block before the question.                         |
| `src/shared/plan-pr-continuation.md`                | One sentence before the "Plan differs" ask (`:155-176`): a blocking or failed scan of the local plan stops the run before the ask, naming findings by class and line.                                                                                             |
| `test/workflow-contracts.test.mjs`                  | The content-check test (`:20433-20490`) pins the script call and the confidence rule instead of the class literals (which move to the core's unit tests), plus the continuation's stop-before-ask sentence.                                                       |
| `build.mjs`                                         | `RUNTIME_SCRIPT_FILES` gains the three new files (20 → 23). No `CONTEXT_BUDGET_LINES` change.                                                                                                                                                                     |
| `scripts/distribution-smoke.mjs`                    | Same registration; a `scan` smoke against a fixture plan in every target, beside `assertPlanLintSmoke`.                                                                                                                                                           |
| `test/execution-profile-contract.test.mjs`          | `EXPECTED_RUNTIME_SCRIPTS` gains the three files; the count assertion and its message move from 20 to 23.                                                                                                                                                         |
| `test/plan-publication.test.mjs`                    | **New.** Pure tests: scan classes, confidence rules, branch names and parser, keyword rules, marker build and round-trip, unattended input rules.                                                                                                                 |
| `test/plan-publication-git.test.mjs`                | **New.** Bare-remote tests: single-file commit, changeset assertion, branch lock and race, dry run, draft and read-back, `complete-branch`, hooks, argv audit, fake forge runner.                                                                                 |
| `docs/developer-guide/build-system.md`              | Runtime-guard paragraph (`:392-405`), "Runtime scripts" (`:637-642`, new bullet beside "Plan-lint") and `:776`: eight subsystems, twenty-three files, and `process-runner.mjs` as the shared runner.                                                              |
| `docs/developer-guide/release-and-installation.md`  | Payload paragraph (`:379-386`) names `scripts/plan-publication.mjs` with its core and `scripts/process-runner.mjs`.                                                                                                                                               |
| `AGENTS.md`                                         | One clause in the `src/scripts/*.mjs` line (`:42`) naming `process-runner.mjs` as the shared runner CLI entries inject, since it belongs to no pair.                                                                                                              |

Deliberately untouched: `src/tools/*`, `src/shared/worktree-integration.md`,
`src/shared/next-steps.md`, the user guide, the four other process runners, and the eval suites.
`plan-pr-continuation.md` changes by the one sentence above only.

## Implementation details

### Approach

1. **Extract the process runner** (see Architecture decisions). `pnpm test` stays green with
   `test/remote-tracker.test.mjs` unchanged.
2. **`branch-name` (pure).**
   - Inputs: `branchPrefix` and at least one of `planFile` and `issue`. WP3 passes only the issue.
   - The issue comes from the input or from a `**Issue:** #<N>` header line in the plan's header
     block. Both present and different gives `ISSUE_MISMATCH`; neither gives `ISSUE_REQUIRED`.
   - The result is `<prefix>/plan/issue-<N>`; an empty prefix drops its segment. The operation
     validates it with `git check-ref-format --branch`, and no suffix is ever appended.
   - The same derivation (`planBranchName`, validated in-process) and the parser
     (`parsePlanBranch`) are exported for in-process use.
3. **`scan` (read-only, no network).**
   - CLI inputs: exactly `cwd`, `runState` (`interactive` | `unattended`), `planFile` (the core
     reads its bytes), and optionally `title`, `body` and `commitMessage`. The core's in-process
     function also scans blob bytes for `publish` and `complete-branch`.
   - It returns findings `{ id, class, confidence, field, line }`, `blocking` (every high finding,
     and every lower finding on an unattended run), and `acknowledgeable` (the lower findings on an
     interactive run).
   - Fenced code blocks are scanned like prose.
   - Generation attribution (`assertPublishable`'s pattern) is a high-confidence `attribution`
     finding.
4. **`assert-changeset` (read-only).**
   - Inputs: `baseBranch`, `remote`, a `head` commit, `planDir`, and the expected issue; the base
     commit is `refs/remotes/<remote>/<baseBranch>`.
   - It computes `git diff --name-status --no-renames -z <merge-base>..<head>` and accepts exactly
     one `A` of a top-level `<planDir>/<name>.md` whose name matches `YYYY-MM-DD-issue-<N>-<slug>.md`
     (WP2's rule) for the expected issue, and whose `**Issue:**` header, when present, agrees.
   - It rejects, each with a named violation: any other path, a nested path, a deletion, a
     modification, a rename; a mode other than `100644`, which excludes symlinks and executables;
     a blob above 512 KiB, a blob containing NUL, or invalid UTF-8; a name or header that disagrees
     with the issue.
   - It requires `head` to be exactly one commit whose parent is the merge base.
5. **`publish` (mutation; dry run unless `--apply`).** Order:
   1. validate the inputs and the unattended rules, then refuse hidden mode;
   2. resolve the remote URL from the remote name, then the provider through `repository-resolve`
      with that URL, and require GitHub;
   3. run `probe` and require `pullRequestDraftCreate: true`;
   4. require Git 2.36 or newer (`GIT_UNSUPPORTED`); fetch `<baseBranch>` from `<remote>` (bounded)
      and resolve the parent from `refs/remotes/<remote>/<baseBranch>`; verify that the plan file
      is a regular file physically contained in `planDir` (realpath check, no symlink), read it as
      bytes, and refuse NUL or invalid UTF-8;
   5. check the title and the commit message (Conventional Commit, type `docs`, single-line title),
      refuse closing keywords, then build the final body: caller prose, marker line, `Refs #<N>`;
      round-trip the marker with `inspectPlanPrMarker`;
   6. scan the plan, the commit message, the title and the final body, then derive the branch name;
   7. take the lock: `ls-remote --exit-code <remote> refs/heads/<branch>`, accepting only an output
      line whose refname equals `refs/heads/<branch>` exactly (`ls-remote` tail-matches, so
      `x/plan/issue-1` must not count), where a present branch gives `BRANCH_EXISTS` carrying the
      remote OID and an unreachable remote gives `REMOTE_UNREACHABLE`;
   8. look up open pull requests and keep only items with `head === <branch>`, same repository and
      `baseBranch`, where a remaining one gives `PR_EXISTS`.

   The dry run may update only `refs/remotes/<remote>/<baseBranch>` and the objects that fetch
   brings; it writes no other ref and no object of its own.

   The dry run ends here and reports the planned branch, the findings, the would-be blob id
   (`hash-object` without `-w`), the final body, and the planned commands. With `--apply`:
   1. write the blob from the plan file and scan the blob bytes read back, so the scan covers
      exactly what is committed;
   2. run the `commit-msg` hook on the message file, then check and scan the final message again;
   3. build the commit in a temporary index, using the configured identity read with
      `git -c user.useConfigOnly=true var GIT_COMMITTER_IDENT` (configuration or the
      `GIT_COMMITTER_*` environment both count; Git's auto-detected identity does not), where a
      failure gives `IDENTITY_MISSING`;
   4. run `assert-changeset` on the new commit;
   5. `git push <remote> <oid>:refs/heads/<branch>`, where a refusal gives `PUSH_REJECTED` with
      redacted stderr;
   6. run the same exact-refname `ls-remote` again, where a remote OID different from ours gives
      `LOCK_LOST`;
   7. `pr-create` with `apply`, `draft: true` and `base: <baseBranch>`. On **any** `pr-create`
      failure, including `mutationMayHaveSucceeded`, run one `pr-list` lookup by
      `planPath`, filtered client-side to `head === <branch>`, same repository and `baseBranch`. A single exact match
      continues; otherwise the result is the failure's code (`UNSUPPORTED_CAPABILITY` for a
      repository that refuses drafts) or `PR_UNCONFIRMED`, each with state `branch-pushed`. The
      core never has to recognize GitHub's "PR already exists" refusal specifically;
   8. read back with `pr-list` and confirm draft, marker, `sameRepository` and `base`, or return
      `DRAFT_UNCONFIRMED`.

   Result states are `pull-request-opened` and `branch-pushed`; the result carries the branch, the
   base OID, the commit OID, and the PR number and URL.

6. **`complete-branch` (mutation; dry run unless `--apply`).** For a pushed plan branch without a
   pull request (WP3's `orphan-branch`):
   - apply the same input and run-state rules as `publish`, including `visibility`;
   - parse the branch with the plan-branch parser; its issue must equal the input issue;
   - read the remote OID and fetch it, bounded; read the branch blob through the runner's buffer
     mode and refuse NUL or invalid UTF-8;
   - require exactly one commit on the branch whose parent is `merge-base(base, tip)`, so an orphan
     survives a moved base but a multi-commit branch is refused;
   - run `assert-changeset` against that merge base, then scan the blob from the branch, the
     existing commit message, the title and the body;
   - build the body with the marker for the committed path, run the probe gate, the PR lookup, and
     then `pr-create` with the same failure lookup and draft read-back as `publish`.
7. **Point the interactive content check at the core.** Replace the class list in
   `plan-publication.md`'s "Content check" with the call `node <skill-root>/scripts/plan-publication.mjs scan`
   (plan file and, on a first publication, the title and the body) and the rule above; keep the
   single ask, the "no findings" wording, and naming by class and line. Add the one sentence to
   `plan-pr-continuation.md` that a blocking or failed scan stops before the "Plan differs" ask.
   Update the content-check test in `test/workflow-contracts.test.mjs` to pin the new invariants
   and that sentence.
8. Register the scripts, add the distribution `scan` smoke, and update the two developer-guide
   paragraphs and `AGENTS.md:42`. Then run the validation sequence.

### Scan classes

| Class                   | Confidence | Matches (summary)                                                                                                                                                                                                                                              |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private-key`           | high       | a header line matching `-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----` (the decomposition sanitizer's header, `:383`); public certificates are deliberately not a finding                                                                                         |
| `provider-token`        | high       | after a non-word boundary: `gh[opusr]_` + ≥36 `[A-Za-z0-9]`; `github_pat_` + ≥22 `[A-Za-z0-9_]`; `glpat-`, `gitea_`, `npm_` + ≥20 `[A-Za-z0-9_-]`; `xox[abprs]-` + ≥10 `[A-Za-z0-9-]`; `AKIA` + exactly 16 `[A-Z0-9]`; `sk-` / `sk-ant-` + ≥20 `[A-Za-z0-9_-]` |
| `jwt`                   | high       | three base64url segments, the first starting `eyJ`, each ≥10 characters                                                                                                                                                                                        |
| `authorization-value`   | high       | `Authorization:` followed by `Bearer`, `token` or `Basic` and a value of ≥8 non-space characters; a standalone `Bearer ` + ≥20 `[A-Za-z0-9._~+/=-]`                                                                                                            |
| `url-credential`        | high       | `scheme://user:password@` with a non-empty password                                                                                                                                                                                                            |
| `attribution`           | high       | the existing `assertPublishable` pattern                                                                                                                                                                                                                       |
| `credential-assignment` | lower      | a key from the closed list `SENSITIVE_CHILD_FIELD` assigned a literal value, minus what `isLegitimateCredentialProse` exempts                                                                                                                                  |
| `absolute-local-path`   | lower      | `/Users/`, `/home/`, `/root/`, `/private/var/`, `/var/folders/`, `/tmp/`, a drive letter followed by `:\`                                                                                                                                                      |

The following are explicitly **not** findings: repository-relative paths (`src/shared/…`,
`docs/plan/…`, `.effective-flow/…`), environment variable names without a value (`GH_TOKEN`),
placeholders (`<token>`, `***`, `[REDACTED]`, `${VAR}`), `git@host:owner/repo` and
`ssh://git@host/owner/repo` remotes and other userinfo-only URLs without a password, prefix-only
identifiers such as `gitea_base_url`, and kebab-case slugs.

### Edge cases

- **Branch already on the remote.** `BRANCH_EXISTS`, no commit written; on an unattended run this is
  the lock doing its job.
- **Branch only local.** Ignored. The lock is the remote ref, and a local branch of that name is
  neither read nor moved.
- **Race between pre-check and push.** `PUSH_REJECTED`; the remote ref stays as the other publisher
  wrote it.
- **Identical-commit race.** Both pushes succeed. The PR lookup, or GitHub's duplicate refusal
  followed by the lookup, yields one pull request.
- **`pr-create` may have succeeded.** One lookup, never a second create; otherwise `branch-pushed`.
- **Repository refuses drafts.** The probe cannot see it, so `pr-create` fails with
  `UNSUPPORTED_CAPABILITY` after the push, and the result is `branch-pushed`. On GitHub this is a
  private repository on a plan without drafts, which D2 keeps dry-run-only in stage 1. A later
  `complete-branch` meets the same refusal.
- **Draft not confirmed.** The read-back lacks the number, shows `draft` other than `true`, or fails:
  `DRAFT_UNCONFIRMED` with the URL; the pull request stays open, and WP3's recovery lists it.
- **Caller body holds a marker line or marker comment.** `MARKER_INVALID` before any write.
- **Base moved after it was resolved.** The commit builds on the resolved OID, and the result
  carries that base OID. Drift is left to the reviewer, as the concept says.
- **Plan file is a symlink, lies outside `planDir`, is nested, or is not UTF-8.** Refused before any
  object is written.
- **No configured Git identity.** `IDENTITY_MISSING`, with nothing written.
- **Aborted after the blob or commit was written but before the push.** Only unreachable objects
  remain; no ref moved, and Git's garbage collection handles them.
- **Non-GitHub origin.** `UNSUPPORTED_PROVIDER` before any write.
- **`commit-msg` hook rejects the message or hangs.** `COMMIT_MSG_HOOK_REJECTED`, no object written
  beyond the blob. A Git older than 2.36 is refused with `GIT_UNSUPPORTED` in the pre-mutation
  checks, before any object is written and also on a dry run.
- **Hook injects content.** A `commit-msg` hook that adds a token or a closing keyword to the message
  is caught by the rescan of the final message.
- **Fork pull request on the same branch name.** Ignored by every lookup; it neither trips
  `PR_EXISTS` nor is adopted.
- **Plan or branch blob with invalid UTF-8 or NUL.** Refused from the bytes, never from decoded
  text.
- **Remote hangs.** Bounded by the timeout: `REMOTE_UNREACHABLE`, or `PUSH_UNCONFIRMED` followed by
  one `ls-remote`.
- **Signed-commits rule on the base.** The unsigned plumbing commit is refused: `PUSH_REJECTED`.
- **Interactive scan with a high-confidence finding, or a failed scan.** Publication is unavailable
  before the question. In the continuation, the scan runs before the "Plan differs" ask, and the
  new sentence stops the run there, naming the findings, so "Republish" is never offered.
- **Interactive republication of an Issue Buddy plan.** The shipped discovery treats the core's
  pull request like its own: same repository, draft, base, and only `P` changed, so it republishes
  onto `<prefix>/plan/issue-<N>`.

## Acceptance criteria

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass, in that
      order.
- [ ] `node build.mjs` copies `scripts/plan-publication.mjs`, `scripts/plan-publication-core.mjs`
      and `scripts/process-runner.mjs` byte-for-byte into all three targets; `build.mjs`,
      `scripts/distribution-smoke.mjs` and `EXPECTED_RUNTIME_SCRIPTS` list them, and the count
      assertion reads 23.
- [ ] The distribution suite runs `plan-publication.mjs scan` on a fixture plan in every target and
      receives `ok: true` with no findings.
- [ ] `remote-tracker.mjs` defines no process runner and imports it from `process-runner.mjs`;
      `test/remote-tracker.test.mjs` passes unchanged; `git diff` shows no change to
      `delivery-selection.mjs`, `pilot-measurement.mjs`, `config-resolve-core.mjs` or
      `diff-baseline-core.mjs`.
- [ ] Tests prove the exported plan-branch parser: it accepts `<prefix>/plan/issue-12` and
      `plan/issue-12` (empty prefix) and rejects `issue-abc`, `issue-01`, `issue-1x` and
      `issue-0`; `branch-name` with only `issue` and `branchPrefix` returns the same name, and
      without any issue returns `ISSUE_REQUIRED`.
- [ ] `test/plan-publication.test.mjs` proves both directions for every scan class: each class
      matches a runtime-assembled fixture at exactly its minimum length from the class table, a
      fixture one character shorter does not match, and each listed non-finding produces no
      finding. Fixtures are assembled at runtime, so the repository holds no literal token shape.
- [ ] A test runs `scan` with `runState: interactive` on this plan file and on
      `src/shared/plan-publication.md` and asserts no high-confidence finding.
- [ ] A test holds a fixed list of realistic token fixtures (each prefix with its real length,
      assembled at runtime) and proves that both `redact()` (`remote-tracker-shared-core.mjs`) and
      `scan` catch every one of them as a high-confidence finding. Userinfo-only URLs and
      prefix-only identifiers are deliberately not in that list.
- [ ] Tests prove the confidence rules: on `runState: unattended` every finding is blocking; on
      `interactive` every high finding is blocking and every lower finding is acknowledgeable and
      not blocking; no envelope contains a matched value.
- [ ] Tests prove the input rules of `publish` and `complete-branch`: a `runState` other than
      `unattended`; any unknown input key; a missing issue; a missing `visibility`
      (`INVALID_INPUT`); `hidden` (`HIDDEN_MODE_UNSUPPORTED`); and a non-GitHub provider are each
      refused. For the schema, `runState`, `visibility` and `hidden` cases the fake runner records
      zero Git calls and zero forge mutations; for the provider case, which learns the provider
      through `repository-resolve`, it records zero Git writes (no `hash-object -w`, `commit-tree`,
      `push` or `fetch`) and zero forge mutations.
- [ ] Tests prove the title rule: a title that is not a single line or not of Conventional Commit
      type `docs` is refused with zero mutations.
- [ ] Tests prove the named results: `ISSUE_MISMATCH` (input issue differs from the `**Issue:**`
      header), `IDENTITY_MISSING` (no configured identity, nothing written), `PR_EXISTS` (an open
      same-repository pull request on the head and `baseBranch`), `LOCK_LOST` (the remote OID differs
      after the push), and `GIT_UNSUPPORTED` (a fake `git --version` of 2.35, reported also on a dry
      run).
- [ ] Tests prove the lookups: a GitHub-shaped `pr-list` payload with `head: { ref, label, repo }`
      is matched client-side by its normalized bare `head`; a fork pull request on the same branch name is ignored by
      the pre-check, by the failure lookup and by the read-back; the recorded `pr-create` payload
      carries `base` equal to `baseBranch`; a read-back with `sameRepository: false` or another
      `base` gives `DRAFT_UNCONFIRMED`.
- [ ] Tests prove the byte rules: a plan file with NUL, a plan file with invalid UTF-8, and a
      `complete-branch` branch blob with invalid UTF-8 are each refused before any mutation.
- [ ] The git test proves the post-hook rescan: a `commit-msg` hook that appends a runtime-assembled
      token, or a closing keyword, refuses the publication; a hook that sleeps past the timeout gives
      `COMMIT_MSG_HOOK_REJECTED`.
- [ ] Tests prove the closing-keyword rule: each of the nine keywords, in any case, with and without
      a colon, followed by `#<N>`, `owner/repo#<N>` or an issue URL, is refused in the title, in the
      commit message and in the body.
- [ ] Tests prove the body: its second-to-last line is exactly
      `<!-- effective-flow-plan-pr:v1 ` + `JSON.stringify({ plan: P })` + ` -->` (also for a `P`
      holding `"` or spaces), its last line is exactly `Refs #<N>`, and `inspectPlanPrMarker` on it
      returns `valid` with `P`; a caller body with a marker line or marker comment gives
      `MARKER_INVALID` with zero mutations.
- [ ] Tests prove the draft rules: a probe with `pullRequestDraftCreate` not `true` gives
      `UNSUPPORTED_CAPABILITY` before any write; the recorded `pr-create` payload has
      `draft: true`; a read-back with `draft: false` or without the number gives
      `DRAFT_UNCONFIRMED`; and the created pull request, run through `pr-list` with `planPath: P`,
      comes back with `planPrMarker` equal to `P`.
- [ ] The git test proves the hooks rule: a `commit-msg` hook that exits nonzero refuses the
      publication with `COMMIT_MSG_HOOK_REJECTED`; a `pre-commit` hook that would modify the working
      tree is never run; a repository without hooks publishes.
- [ ] `test/plan-publication-git.test.mjs` proves the single-file assertion: each of second file,
      path outside `planDir`, nested path, deletion, modification, mode `100755`, symlink, two
      commits, oversized blob, issue mismatch, and a name not matching
      `YYYY-MM-DD-issue-<N>-<slug>.md` is refused; the plain add is accepted.
- [ ] The git test proves the happy path: the remote branch points at one commit whose parent is the
      base tip and whose diff is exactly the plan file; the working tree, the index file's bytes,
      and `HEAD` are identical before and after; the fake forge recorded exactly one `pr-create`.
- [ ] The git test proves the branch lock: a second `publish` for the same issue returns
      `BRANCH_EXISTS` with the remote ref unchanged and no `pr-create`; a branch created from a
      second clone between pre-check and push yields `PUSH_REJECTED` with the remote ref unchanged.
- [ ] The git test records every spawned Git argv. None contains `--force`, `-f`,
      `--force-with-lease`, `--no-verify`, or a refspec starting with `+`.
- [ ] Against an unchanged remote base, a dry-run `publish` leaves `git count-objects -v`, every ref
      other than `refs/remotes/<remote>/<baseBranch>`, and the fake forge's mutation log unchanged.
- [ ] Tests prove the remote and lookup rules: a remote named other than `origin` makes every
      `executeOperation` call carry that remote's URL; `pr-list` is called without `head`; and an
      `ls-remote` output line for `refs/heads/x/plan/issue-1` does not count as the lock for
      `plan/issue-1`.
- [ ] `mutationMayHaveSucceeded` from the fake forge leads to exactly one lookup and no second create.
- [ ] `complete-branch` opens a draft pull request with the marker for a single-file orphan branch
      whose base has since moved, also when its committer differs from the configured identity, and
      refuses a branch that carries a second file or a second commit.
- [ ] Every network Git call in the git test runs with the non-interactive environment and a
      timeout; a simulated hang yields `REMOTE_UNREACHABLE` or `PUSH_UNCONFIRMED`. Hang and hook
      timeout tests pass a small injected `timeoutMs` core option, so none waits the 60 s default.
- [ ] `src/shared/plan-publication.md`'s "Content check" names `plan-publication.mjs scan`, carries
      no class literal, and states that a high-confidence finding makes publication unavailable
      before the question (also under caller consent) and that a failed scan does too;
      `src/shared/plan-pr-continuation.md` states that a blocking or failed scan stops before the
      "Plan differs" ask; the updated `test/workflow-contracts.test.mjs` pins these and the
      existing invariants (class and line, never the value, "no findings", no second question).
- [ ] `test/plan-publication.test.mjs` proves that the CLI exits nonzero with `ok: false` on an
      unreadable plan file and on malformed stdin; the interactive fail-closed rule itself stays
      pinned as prose by the contract-test criterion above.
- [ ] The `Always-loaded core (lines/budget)` report of `node build.mjs` shows the same numbers for
      every tool before and after, and `CONTEXT_BUDGET_LINES` is unchanged.
- [ ] `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval next-steps verify`
      report the same result before and after this change.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution`, run
  from the checkout root.
- Focused: `node --test test/plan-publication.test.mjs test/plan-publication-git.test.mjs test/remote-tracker.test.mjs test/execution-profile-contract.test.mjs test/workflow-contracts.test.mjs`.
- Eval reach: run `pnpm eval <suite> verify` for `merge-gate`, `iterate` and `next-steps` on the base
  and on the result; the outputs must match, because no suite seed reaches the changed fragments
  (`plan-publication.md`, `plan-pr-continuation.md`) or scripts.
- Manual: in a scratch clone with a bare remote, run `publish` without `--apply` on a fixture plan
  named `YYYY-MM-DD-issue-1-demo.md`. Expect the branch `effective-flow/plan/issue-1`, the final body
  with the marker and `Refs #1`, no findings, an unchanged `git status`, and no object or ref
  change beyond the base's remote-tracking ref.

## Assumptions and open points

- **Assumption:** binding decision D3 limits the unattended path to GitHub. Forgejo for unattended
  publication is deferred, not planned here; interactive Forgejo publication stays as shipped.
- **Assumption:** private repositories have no forge-side branch rules. WP5's binding decision D2
  keeps them dry-run-only in stage 1 until WP6b isolates the forge credential from model steps;
  after that, WP6b's `issueBuddy.privateRepositoryAcknowledgement` and WP7's approval table gate
  enabling. This plan does not decide that posture. It makes the in-run checks fail closed because,
  once publishing is enabled there, they are the only boundary. **Precondition:** these checks bound
  only the core's own path. They hold only if the write token is exposed to the core's push and PR
  calls and never to the model step; otherwise an agent's own `git push` bypasses both. The same
  holds for hook processes: the `commit-msg` and `pre-push` hooks run from `.git/hooks` or
  `core.hooksPath`, which an unsandboxed planning step can write, and they inherit the core's
  environment and credential helper. The precondition therefore also covers hooks: either the token
  is unreachable from hook processes, or the publishing checkout's hooks are not writable by the
  model step. Enforcing that is WP6b's job (`llm-automatisator`,
  `2026-10-01-issue-buddy-schreib-token-und-veroeffentlichung.md`); WP5's ADR states the scan's
  limit.
- **Assumption:** the living ADR "Plan-only unattended publication"
  (`docs/adr/plan-only-unattended-publication.md`) is written by WP5, the first change that gives an
  unattended run a publishing entry point. This package ships the mechanism, adds no entry point and
  writes no ADR.
- **Assumption:** callers resolve `language.git` and `language.forge`, the base branch (through
  `src/shared/base-branch-resolution.md`), the branch prefix, the plan title and the run state. The
  caller (WP5) supplies the body prose; the core does not validate its shape and resolves none of
  these values.
- **Follow-ups in sibling plans (not edited here):** WP3 and WP5 can drop "WP4 must be re-derived …
  the plan-branch name may change", since it stays `<branchPrefix>/plan/issue-<N>`; WP3 imports
  `createProcessRunner`, `planBranchName` and `parsePlanBranch` by those names; WP5's Phase 5 uses
  the title `docs: plan <title>`, passes `runState: unattended`, `visibility` and `baseBranch`, and
  may keep its richer body prose.
- **Assumption:** whether `Refs #<N>` survives the continuation's finish is owned by
  `plan-pr-continuation` and `pr` step 9, which re-derive the body; it is out of scope here. The
  forge timeline keeps the cross-reference either way.
- **Assumption:** in a target repository whose effective `delivery.completion` is `merge` or
  `branch`, `build` stops on the draft unless an explicit `pr` directive is given. That shipped
  behavior is documented here and not changed.
- **Assumption:** WP5 resolves its open point on discarding the Issue Buddy worktree now that this
  plan's commit mechanics are fixed: the plumbing commit needs no worktree and leaves the planning
  worktree detached with the untracked plan file.
- **Out of scope:** the four other process runners; consolidating the three existing credential
  detectors; any change to `src/tools/*`, `src/shared/worktree-integration.md`, or the next-step
  rows; `plan-pr-continuation.md` beyond its one sentence; the interactive publication's
  mechanics beyond its content check.

## Implementation notes

Implemented by `effective-flow build` on 2026-10-18 on branch
`effective-flow/build/shared-plan-publication-core` from `develop` at `f05ff2e`. Deviations from this
plan, each deliberate:

- **Two runner options, not one.** Besides `stdoutBuffer`, `process-runner.mjs` gained an additive
  `processGroup` option: a call runs as its own process group, and the bound kills the whole group, so
  a hook, transport helper or `gh` call that keeps the pipes open cannot outlast the timeout. Both
  options are off by default; remote-tracker behavior is unchanged. The plan-publication CLI forwards
  SIGINT/SIGTERM to in-flight groups and writes one `INTERRUPTED` envelope.
- **User guide touched.** The plan listed the user guide as untouched, but the interactive behavior
  change needed `docs/user-guide/tools-understand.md` and `docs/user-guide/worktree-and-delivery.md`
  updates.
- **Additional refusals found in review:** `REMOTE_URL_MISMATCH` (push URL differs from fetch URL),
  `INPUT_TOO_LARGE` (title ≤256 characters, final body ≤65,536 characters, commit message ≤65,536
  bytes, plan ≤512 KiB also for `scan`), `BASE_REWRITTEN` (force-rewritten base), a lock re-check
  immediately before every `pr-create`, bounded `gh` calls through the tracker, and
  `git push --no-follow-tags` / `git fetch --no-tags --no-recurse-submodules --no-auto-maintenance`.
- **Unreachable by construction, kept defensively:** the probe-gate `UNSUPPORTED_CAPABILITY` before
  any write (the GitHub probe always reports draft support), and a tracker-set
  `mutationMayHaveSucceeded` on `pr-create` (tests simulate the equivalent outcomes).
- **`redact()` consistency** covers only the token shapes `redact()` knows; the other shapes are
  proven against `scan` alone.

## Test results

- `pnpm agent:check`: exit 0.
- `pnpm test`: 2578 tests, 2576 pass, 1 skipped, 1 fail. The failure is
  `test/next-steps-eval.test.mjs` "the shared seed commit disables inherited automatic Git
  maintenance…": Git cannot read `~/.config/git/ignore` (a symlink into iCloud Drive, "Operation not
  permitted"); it fails identically on the unmodified base `f05ff2e`, so it is environmental.
- New suites: `test/plan-publication.test.mjs`, `test/plan-publication-git.test.mjs`,
  `test/process-runner.test.mjs`; focused run with `test/remote-tracker.test.mjs`: 529 of 529 pass.
  Mutation checks (token minimum length, an added `--force`, a removed `sameRepository` filter, a
  disabled process-group bound, a removed lock re-check) each failed the suites.
- `node build.mjs`: exit 0; `Always-loaded core (lines/budget)` unchanged, `CONTEXT_BUDGET_LINES`
  unchanged.
- `pnpm test:distribution`: exit 0, including the `plan-publication scan` smoke in every target.
- `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`: exit 0,
  same result as on the base.

## Review findings

**Date:** 2026-10-18
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    32 |
| Open / Not implemented |     0 |

One further observation was classified `closed` (below the admission threshold): the shipped
remote tracker's `inspectPlanPrMarker` trims lines with a quadratic pattern, so very large pull-request
bodies slow every `pr-list` parse by seconds. It is existing code outside this plan; the core avoids
the pattern for its own bodies.

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
- ~~**Important (Error cases), incorporated:** an archive return produced two copies; the temporary
  index now removes the archive path, and a lone `A` with a tracked twin is refused.~~ Superseded
  2026-10-17: archive returns were dropped with the unattended-only scope.
- **Important (Security), incorporated:** `complete-branch` now applies the run-state rules,
  requires one commit on `merge-base(base, tip)`, scans the existing commit message and checks the
  committer identity. (The committer check is superseded 2026-10-17: dropped by user decision.)
- **Important (Error cases), incorporated:** network Git calls are bounded with the existing
  non-interactive environment and timeout.
- **Important (Security), incorporated:** the D2 boundary's precondition (token never exposed to the
  model step) is stated and pointed to WP6b.
- **Important (Security), incorporated:** `visibility` is a required input, so the hidden-mode
  refusal cannot be bypassed by omission.
- **Notes, incorporated:** the stop condition is gone (one lookup after any `pr-create` failure);
  the runner move is not byte-for-byte and only CLI entries import it; `AGENTS.md` and the
  decomposition export are in the affected files; the `sk-` shape is specified. (The former
  `update`-mode note is superseded 2026-10-17: `update` mode was dropped.)

### Re-derivation (2026-10-17)

Re-derived against `266eb7e`, after #511 (`e002492`) shipped interactive publication and archived
the 2026-08-20 plan. Four user decisions shape it:

- **PR shape (hybrid):** a draft pull request on `<branchPrefix>/plan/issue-<N>` (branch lock and
  the WP7 ruleset pattern unchanged), with the marker line built by the core in the exact shipped
  grammar and round-trip-checked with `inspectPlanPrMarker`, the probe's draft capability required,
  and a `pr-list` read-back confirming draft and marker; title `docs: plan <title>`, body in the
  shipped shape plus the final `Refs #<N>`.
- **Scan source of truth:** `plan-publication.mjs scan` is the only scan; `plan-publication.md`'s
  content check calls it, so interactive publication gains the two-confidence rule and the changed
  class set.
- **Scope:** unattended only. Dropped: the `direct-commit` target, `branchMode: update` with
  `expectedBranchOid`, `allowArchiveReturn` and `ARCHIVE_TWIN_PRESENT`, the dated-stem branch
  fallback, the local receipt, the "superseded mechanics" note (former Approach step 8), the
  conflicts table against the 2026-08-20 plan (replaced by "Shipped interactive publication vs.
  this core"), every follow-up-revision reference, and their acceptance criteria.
- **Process runner:** only remote-tracker's runner moves into `process-runner.mjs`; CLI entries
  import and inject it, no core imports it, and the four other runners stay.

Kept from the deep review: the plumbing commit, the hooks rule (now `git hook run --ignore-missing`,
with the final message rescanned), the branch lock, bounded network calls, the required
`visibility`, `complete-branch`'s checks, the D2 precondition, runtime-assembled fixtures, the argv
audit, and the dry-run measurement. Every line citation was re-anchored at `266eb7e`. Added: the
`plan-publication.md` and `test/workflow-contracts.test.mjs` edits, a distribution `scan` smoke,
the 20 → 23 registry count, and the WP5 worktree-discard assumption. The earlier findings above
describe the plan as it stood then; where they name dropped parts, this subsection supersedes them.

### Plan review (2026-10-17)

Result: **Approved**. Judgment from `effective-delivery` on the re-derived plan: no critical
findings; nine important findings and four notes, twelve incorporated directly and one decided by
the user.

- **Decision (Error cases):** the continuation ran the scan before its "Plan differs" ask but still
  offered "Republish" after a blocking finding. _Decided:_ one sentence in
  `plan-pr-continuation.md` stops the run before the ask on a blocking or failed scan.
- **Important (Security), incorporated:** lookups did not require `sameRepository`, so a fork pull
  request on the same branch name could trip `PR_EXISTS` or be adopted; every lookup now filters to
  same-repository items on `baseBranch`.
- **Important (Error cases), incorporated:** the `head` form for `pr-list` was unspecified; the
  core now filters client-side on the normalized `head` (see the deep review below).
- **Important (Architecture), incorporated:** `baseRef` served as Git base and PR base; `baseBranch`
  is now a separate name input and the parent comes from the remote-tracking ref.
- **Important (Error cases), incorporated:** the runner decodes text, so NUL/UTF-8 checks and blob
  scans were unreliable; plan and blob bytes are now read as bytes, and the SHA-256 result without a
  consumer is gone.
- **Important (Security), incorporated:** hooks can be written by an unsandboxed planning step and
  inherit credentials; the WP6b precondition now covers hook processes, and the scan's limit against
  deliberate exfiltration is stated.
- **Important (Testability), incorporated:** the class table is pinned with minimum lengths, the
  closed key list and the private-key header, and the manual self-scan is now a test.
- **Important (Testability), incorporated:** acceptance criteria added for `PR_EXISTS`, `LOCK_LOST`,
  `ISSUE_MISMATCH`, `IDENTITY_MISSING`, `GIT_UNSUPPORTED`, the byte rules, the title rule, the
  post-hook rescan, the read-back filters, and a failed interactive scan.
- **Important (Architecture), incorporated:** export names are fixed (`createProcessRunner`,
  `planBranchName`, `parsePlanBranch`), the core does not validate body shape, and the sibling
  follow-ups for WP3 and WP5 are listed under Assumptions.
- **Note (Error cases), incorporated:** Git 2.36 floor with `GIT_UNSUPPORTED` in the pre-mutation
  checks, a bounded hook call, and the corrected "before any object" wording.
- **Note (Maintainability), incorporated:** the decomposition labels are corrected
  (`SENSITIVE_CHILD_ASSIGNMENT` is the matcher, `isLegitimateCredentialProse` the exemption), and
  both reused symbols are exported.
- **Note (Scope), incorporated:** a closed input schema replaces the list of refused dropped
  inputs, and the deep-review bullets on archive return and `update` mode are marked superseded.
- **Note (Architecture), incorporated:** the exported derivation validates in-process; only the
  `branch-name` operation spawns `git check-ref-format`.

### Deep review (2026-10-17)

Result unchanged: **Approved**. No critical findings; seven important findings and three notes,
nine incorporated directly and one decided by the user.

- **Decision (Error cases):** `complete-branch`'s committer check would strand an orphan branch
  across the stage-1 operator identity and the later WP6b bot identity, and create-only would then
  block re-planning for good. _Decided:_ the check is dropped; one commit, one file, the
  issue-matching name, the scan and the branch pattern bound the content. `IDENTITY_MISSING` for
  `publish` is now defined through `git -c user.useConfigOnly=true var GIT_COMMITTER_IDENT`.
- **Important (Architecture), incorporated:** `remote` is a name, while the tracker reads a URL and
  otherwise resolves `origin`; the core now resolves the URL once and passes it to every tracker call.
- **Important (Architecture), incorporated:** the closed schema lacked `cwd`, and `scan`'s CLI
  schema and byte input were undefined; `cwd` is required everywhere, the `scan` CLI schema is
  fixed, and blob-byte scanning is in-process only.
- **Important (Testability), incorporated:** the fake-runner criterion for the prose content check
  was untestable; it is replaced by a CLI fail-closed test, with the prose pinned by the contract
  test.
- **Important (Testability), incorporated:** the dry run fetches the base, so "every ref unchanged"
  was false; the dry run may update only the base's remote-tracking ref, and the criteria say so.
- **Important (Testability), incorporated:** "zero Git calls" was impossible for the provider case;
  that case now asserts zero Git writes and zero forge mutations.
- **Note (Error cases), incorporated:** the bare-`head` REST query relied on undocumented GitHub
  behavior; `pr-list` is called without `head` and filtered client-side.
- **Note (Testability), incorporated:** hang and hook-timeout tests use an injected small
  `timeoutMs` core option instead of the 60 s default.
- **Note (Error cases), incorporated:** `ls-remote` tail-matches; the lock query uses
  `refs/heads/<branch>` and accepts only an exact refname.
- **Note (Maintainability), incorporated:** `complete-branch` takes no `commitMessage`, and the
  Requirement no longer claims the assertion runs first.

## Open points

- No open points.

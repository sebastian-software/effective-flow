# Forge CLI operations run in the runtime-state root

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Bugfix (`/effective-flow fix`)

## Requirement

With the documented defaults `worktree.enabled: true` and `delivery.completion: pr`, a run against
a Forgejo remote completes every phase and then fails at the very last step: the delivery branch
and its commits exist, but PR creation does not happen. The cost is high because the failure
surfaces only after implementation, review and commit are done, and the user has to redo the step
manually from the main checkout.

Origin: [issue #262](https://github.com/sebastian-software/effective-flow/issues/262), diagnosed in
`.effective-flow/investigation/investigation-2026-07-27-forgejo-worktree-pr-dead-end.md`.

**Verified cause.** Effective Flow has no execution root for forge operations. The handback
withdraws the Effective Flow-owned worktree in step 4 and only then runs the completion action in
step 5, so the delegated `/effective-flow pr` run and the `tea` process it drives inherit a working
directory that Effective Flow has just deleted. `tea` resolves its repository context from the
working directory and fails with
`Error: git rev-parse --show-toplevel: chdir <worktree>: no such file or directory` — reproduced
verbatim. `RUNTIME_STATE_ROOT` is already tracked separately for the whole run and is exactly the
checkout the invocation needs, but nothing routes forge work to it.

**Goal.** Forge/provider-CLI operations are rooted in `RUNTIME_STATE_ROOT` — the one checkout that
is guaranteed to exist for the entire run — so the documented worktree default reaches PR creation
on GitHub and Forgejo alike. Secondarily, the `tea` version gate is raised so an incompatible CLI
fails at the probe instead of at the delivery point.

**Out of scope.** Do not reorder the handback steps; do not touch worktree lifecycle, receipt, or
runtime-state-safety mechanics; do not change the `--repo` slug form of the `tea` command plan; do
not add a provider adapter, a retry path, or a fallback that creates the PR by another transport.
Do not rewrite `pr.md`'s existing PR lookup, title derivation, or restore logic.

**Working state at planning time:** HEAD `b8322cf`, 2026-07-27. All in-scope files are clean; the
only uncommitted path in the repository is the unrelated untracked plan
`docs/plan/2026-07-27-pr-review-tool.md`.

## Architecture decisions

- **Forge operations become a third rooting category, not a special case in `pr.md`.**
  `src/shared/execution-location.md` currently defines exactly two categories under "Rooted
  operations": tracked project/validation/staging/commit/worktree-lifecycle work in
  `EXECUTION_ROOT`, and `.effective-flow/` runtime state in `RUNTIME_STATE_ROOT`. Provider-CLI work
  belongs to neither, which is why the gap exists at all. Adding the category centrally fixes every
  consumer at once — issue creation, comments, review threads, and PR creation — instead of
  patching the one caller that surfaced the bug.

- **Keep the handback order (withdraw worktree in step 4, complete in step 5) and state the root
  explicitly instead.** The delivery branch and its commits are repository-wide, so the completion
  action does not need the worktree. Reordering would be the larger change and would leave `merge`
  and `branch` — which already need the main checkout — implicitly rooted. Naming the root also
  makes the `git push` inside `pr.md` correct after the worktree is gone.

- **Thread the working directory through the helper once, in `executeOperation`, by wrapping the
  injected runner.** A per-command-plan `cwd` would leave the probe calls, the `tea logins`
  fallback in `resolveRepositoryInput`, the paginated list path, the stale-write guard, and the
  label migration unrooted. Wrapping the runner is a single choke point that covers all of them and
  keeps `buildCommandPlan` a pure function.

- **`cwd` stays optional in the helper contract.** When it is absent the helper behaves exactly as
  today and inherits the process working directory, so a standalone invocation and the existing
  tests keep working. Effective Flow's own workflows always pass it.

- **Validate `cwd` in the process runner, not in the core.** Verified: Node reports a missing
  executable and a missing working directory identically (`code: ENOENT`, `path: <executable>`), so
  `runChecked` would misreport a bad root as `CLI_MISSING: tea is not installed`. `createProcessRunner`
  in `remote-tracker.mjs` is the designated I/O boundary and is the only place that can tell the two
  apart. The core stays runner-injected and dependency-free.

- **`pr.md` states the root inline and attaches `execution-location` as a `lazy-include`.**
  Verified: `pr.md` currently includes neither `execution-location` nor `issue-tracker`, so it
  carries no rooting rule and no helper-contract text at all. An eager include of the 146-line
  contract would enlarge every `/effective-flow pr` run, which works against the context-budget
  reclamation in `3f3951f`. A few inline lines plus
  ` ```lazy-include / execution-location / when: … ` keep the canonical text shared without
  paying for it on every invocation. Follow the existing form in `src/tools/investigate.md:32-35`.

- **Raise the `tea` floor to `0.14.2`.** This is the user's decision, taken with the tradeoff in
  view: upstream comparison shows `0.12.0`–`0.14.0` would also work once the root is pinned, and
  only `0.14.1` is genuinely broken (`#960` skips local-repo detection for a `--repo` slug while
  `pulls create` still requires it; `#1010` made that requirement conditional on `--head` in
  `0.14.2`). A single floor is simpler to express and to test than an excluded-version rule, at the
  price of rejecting three releases that would function.

- **The floor bump ships as a `fix:` commit with a documented requirement, not as a breaking
  change.** It is a breaking requirement for Forgejo users on `tea 0.9`–`0.14.0`, but the project
  is at `1.53.0`, so a `!` marker would make release-please cut `2.0.0` for a CLI version floor.
  Instead the minimum version becomes explicit in the user guide, and the probe's existing
  `installed`/`minimum` details carry the remediation. Decided by the user.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/execution-location.md`          | Under "Rooted operations", add forge/provider-CLI operations as a third category rooted in `RUNTIME_STATE_ROOT`, with the rationale that the execution worktree may already be withdrawn.                                                                                                     |
| `src/shared/worktree-integration.md`        | In "Handback and completion action" step 5, state that the completion action and all its Git and forge operations run in `RUNTIME_STATE_ROOT`, because step 4 may have removed the worktree.                                                                                                  |
| `src/shared/issue-tracker.md`               | In "Remote helper contract", document the `cwd` input field alongside the existing `language` paragraph: workflows pass the absolute `RUNTIME_STATE_ROOT`; omitting it inherits the process directory.                                                                                        |
| `src/tools/pr.md`                           | State the root requirement inline, attach `execution-location` as a `lazy-include`, resolve the root before step 5, pass it as `cwd` on every helper call, and root the step 7 `git push` and the step 11 restore at that root.                                                               |
| `src/scripts/remote-tracker-core.mjs`       | In `executeOperation`, wrap the injected runner so every call inherits `input.cwd` unless the call sets its own; raise the `tea` minimum in `probeProvider` from `[0, 9, 0]` to `[0, 14, 2]`; map the runner's distinct bad-directory error to a structured failure instead of `CLI_MISSING`. |
| `src/scripts/remote-tracker.mjs`            | In `createProcessRunner`, validate a supplied `cwd` before spawning and resolve a distinct, non-`ENOENT` error object when it is not an existing directory.                                                                                                                                   |
| `docs/user-guide/remote-tracker.md`         | State the minimum `tea` version (`0.14.2`) next to the existing CLI/authentication requirement.                                                                                                                                                                                               |
| `docs/user-guide/troubleshooting.md`        | Extend the existing `tea: command not found` entry with the "installed but too old" case and the probe's `installed`/`minimum` message.                                                                                                                                                       |
| `test/remote-tracker.test.mjs`              | Bump the two version fixtures (see approach step 9), then add cases for runner cwd propagation, unchanged behavior without `cwd`, the bad-directory error, and the raised `tea` floor.                                                                                                        |
| `test/execution-location-contract.test.mjs` | Prose-contract cases asserting the new rooting category and the handback/`pr.md` rules.                                                                                                                                                                                                       |

## Implementation details

### Approach

1. **Central contract first.** Add the forge/provider-CLI category to "Rooted operations" in
   `src/shared/execution-location.md`. Keep it to the same prose shape as the two existing
   categories; state that the root is `RUNTIME_STATE_ROOT` even while an execution worktree still
   exists, so behavior does not depend on whether the worktree has already been withdrawn.

2. **Handback.** In `src/shared/worktree-integration.md`, extend step 5 of "Handback and completion
   action" so the execution root is explicit for all three actions (`branch`, `merge`, `pr`) and
   the `pr` bullet passes that root to `{{SKILL:pr}}`. Add one sentence recording why: step 4 may
   already have removed the worktree.

3. **Helper contract.** In `src/shared/issue-tracker.md`, document `cwd` in "Remote helper
   contract" as an optional top-level input that workflows in remote mode set to the absolute
   `RUNTIME_STATE_ROOT`, with the fallback behavior when it is absent.

4. **`pr.md`.** State the root requirement inline in a few lines and attach `execution-location` as
   a `lazy-include` with a `when:` condition, following `src/tools/investigate.md:32-35`. Resolve
   and verify the root in step 1, and require every helper invocation (steps 5, 6, 8, 10) to carry
   it as `cwd`. Root the step 7 `git push` and the step 11 checkout restore at the same root rather
   than at an inherited directory. Do not otherwise change the step sequence, and do not add an
   `issue-tracker` include — the inline lines carry what `pr.md` needs.

5. **Runner validation.** In `createProcessRunner` (`src/scripts/remote-tracker.mjs`), when `cwd`
   is set and is not an existing directory, resolve `{ status: null, stdout: '', stderr: '', error }`
   with a distinct code such as `INVALID_CWD` carrying the offending path, instead of letting the
   spawn produce an indistinguishable `ENOENT`.

6. **Core threading.** In `executeOperation`, wrap the resolved runner: the wrapper injects
   `cwd: input.cwd` when the individual call does not specify one, then delegates. Extend
   `runChecked` (and the probe error paths) to map the runner's `INVALID_CWD` to a structured
   failure that names the path, rather than to `CLI_MISSING`. Leave `buildCommandPlan` untouched.

7. **Version floor.** Change the `tea` minimum in `probeProvider` to `[0, 14, 2]`. The existing
   `assertMinimumVersion` already produces `UNSUPPORTED_CAPABILITY` with `capability: 'version'`,
   `installed`, and `minimum` in the details, so the remediation text needs no new mechanism.

8. **User documentation.** Record the minimum version in `docs/user-guide/remote-tracker.md` and
   extend the `tea: command not found` entry in `docs/user-guide/troubleshooting.md` with the
   too-old case. Commit the floor bump and its documentation as one `fix:` commit, separate from
   the execution-root commit, so it can be reverted on its own.

9. **Existing test fixtures (do this before adding new cases).** Two fixtures currently sit below
   the new floor and will fail for the wrong reason:
   - `teaProbeResults()` in `test/remote-tracker.test.mjs:54` returns `Version: 0.14.1` and is the
     shared probe fixture for the whole Forgejo suite — raise it to `0.14.2`.
   - The `capability: 'json'` case around `test/remote-tracker.test.mjs:1285` returns
     `Version: 0.10.1`; with the new floor `assertMinimumVersion` fires first and the assertion
     would pass on `capability: 'version'` instead. Raise that fixture to at least `0.14.2` so the
     test still proves the JSON capability.

10. **Tests.** Add the unit cases to `test/remote-tracker.test.mjs` and the prose-contract cases to
    `test/execution-location-contract.test.mjs`, following the existing style in both files
    (injected fake runner; `resolveEagerIncludes` plus `assert.match` on the rendered body).

11. **Build and verify.** Run the CI sequence from `AGENTS.md`.

### Edge cases

- **Standalone `/effective-flow pr` from the main checkout:** `EXECUTION_ROOT` and
  `RUNTIME_STATE_ROOT` are the same physical path, so behavior is unchanged.
- **Reused harness-managed worktree:** it is never withdrawn by Effective Flow, but forge calls
  still run in `RUNTIME_STATE_ROOT`, so the rule holds without a second branch.
- **`cwd` omitted (external or legacy caller):** the helper inherits the process directory exactly
  as today; no existing test needs to change for the `cwd` work itself. The two version fixtures in
  approach step 9 change only because of the floor bump.
- **`cwd` points at a path that is not a directory:** surfaces as the distinct structured error
  from step 5, never as `CLI_MISSING`.
- **`cwd` points at a valid directory outside the repository:** `resolveRepositoryInput` already
  fails with `NOT_GIT_REPOSITORY` and includes `cwd` in the details; no new handling needed.
- **Dry-run preview:** `cwd` is not part of the argument vector, so the previewed command is
  unchanged and no absolute path leaks into the preview.
- **GitHub/`gh`:** `gh` also resolves the repository from the working directory, so the same
  rooting applies; the `gh` floor of `[2, 0, 0]` stays unchanged.

## Acceptance criteria

- [ ] `src/shared/execution-location.md` names forge/provider-CLI operations as rooted in
      `RUNTIME_STATE_ROOT`, and `test/execution-location-contract.test.mjs` asserts it.
- [ ] `src/shared/worktree-integration.md` step 5 states the execution root for the completion
      action, and a contract test asserts it for the `pr` action.
- [ ] `src/shared/issue-tracker.md` documents `cwd` in the "Remote helper contract" section.
- [ ] `src/tools/pr.md` states the root requirement inline, carries the `execution-location`
      `lazy-include`, and requires `cwd` on every helper invocation; a contract test asserts it.
- [ ] With `input.cwd` set, every runner invocation made by `executeOperation` — repository
      resolution, probe, command plan, paginated list — receives that `cwd`; asserted by a unit
      test with an injected recording runner.
- [ ] With `input.cwd` absent, no runner invocation receives a **defined** `cwd`; asserted by a
      unit test. Note that `resolveRepositoryInput` already passes the key explicitly, so the
      assertion must check the value, not the key's presence.
- [ ] A runner error for a non-existent `cwd` produces a structured failure naming the path and
      **not** `CLI_MISSING`; asserted by a unit test.
- [ ] `tea 0.14.1` is rejected with `UNSUPPORTED_CAPABILITY` / `capability: 'version'` and
      `minimum: 0.14.2`; `tea 0.14.2` passes. Asserted by unit tests.
- [ ] The pre-existing `capability: 'json'` test still fails on the JSON capability, not on the
      version floor, after its fixture is raised.
- [ ] `docs/user-guide/remote-tracker.md` names `0.14.2` as the minimum `tea` version, and
      `docs/user-guide/troubleshooting.md` covers the too-old case.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all exit 0.
- [ ] No file outside the table in "Affected files" is modified.

## Validation plan

| Purpose                  | Command                  | Expected result                                            |
| ------------------------ | ------------------------ | ---------------------------------------------------------- |
| Formatting (CI style)    | `pnpm agent:check`       | exit 0                                                     |
| Unit suite               | `pnpm test`              | exit 0; the new cwd, error-mapping, and version cases pass |
| Build guards             | `node build.mjs`         | exit 0; include, catalog, and version-drift guards pass    |
| Distribution smoke suite | `pnpm test:distribution` | exit 0                                                     |

Manual confirmation is optional and needs a Forgejo remote: run a delivery with
`worktree.enabled: true` and `delivery.completion: pr` and confirm the PR is created after the
worktree is withdrawn. The automated cases above are the binding gate.

## Assumptions and open points

- **Assumption (verified by reproduction, not by the reporter's log):** the failing run hit the
  deleted-working-directory path. The actual error text from the original run is not in the issue.
  Both candidate mechanisms are addressed by this plan — the execution root removes the
  deleted-directory failure, and the version floor removes the `tea 0.14.1` failure — so the plan
  does not depend on which one occurred.
- **Assumption:** `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` are already resolved and verified
  before the handback reaches step 5. Verified in `src/shared/worktree-integration.md:104-107`.
- **Deliberately accepted:** raising the floor to `0.14.2` rejects `tea 0.12.0`–`0.14.0`, which
  would work once the root is pinned. Chosen for a simpler, single-rule gate. It ships as a `fix:`
  commit with a documented requirement rather than a `!` breaking marker, so release-please does
  not cut `2.0.0` for a CLI version floor.
- **Assumption:** raising the floor affects every `tea` operation, not only PR creation. That is
  intended; a Forgejo user below the floor gets one clear probe failure instead of an opaque
  failure at the delivery point.
- **Drift check before execution:** re-read `src/shared/execution-location.md` ("Rooted
  operations"), `src/shared/worktree-integration.md` (steps 4–6 of "Handback and completion
  action"), and `probeProvider`/`executeOperation` in `src/scripts/remote-tracker-core.mjs`. If the
  two rooting categories, the step order, or the injected-runner shape have changed, revise the
  plan before implementing.
- **Stop conditions:** stop if pinning `cwd` would require changing the `--repo` slug form of the
  `tea` command plan; stop if a helper consumer other than `pr.md` turns out to depend on inheriting
  the execution worktree's directory; stop if the verification baseline is already red before the
  change, so results cannot be attributed to it.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Error cases, important — resolved.** The first draft threaded `cwd` without addressing how a
  bad root would surface. Verified that Node's spawn error is identical for a missing executable
  and a missing working directory (`code: ENOENT`, `path: <executable>` in both cases), which would
  have turned a wrong root into a misleading `CLI_MISSING: tea is not installed`. The plan now
  assigns the disambiguation to `createProcessRunner` and requires a test for it.
- **Architecture, important — resolved by decision.** The draft said "embed the execution-location
  contract" in `pr.md`, but `pr.md` includes neither `execution-location` nor `issue-tracker` today,
  and an eager include of the 146-line contract would work against the context-budget reclamation in
  `3f3951f`. Resolved: an inline rule plus a `lazy-include`, following
  `src/tools/investigate.md:32-35`.
- **Testability, important — resolved.** The draft treated the floor bump as additive. Verified that
  two existing fixtures sit below the new floor: the shared `teaProbeResults()` at
  `test/remote-tracker.test.mjs:54` (`0.14.1`) and the `capability: 'json'` case around line 1285
  (`0.10.1`), where the version check would now fire first and the assertion would pass for the
  wrong reason. Both are now an explicit, ordered approach step with their own acceptance criterion.
- **Scope, important — resolved by decision.** The floor bump is a user-visible breaking
  requirement that the draft did not surface anywhere a user would see it. `docs/user-guide/remote-tracker.md`
  and `docs/user-guide/troubleshooting.md` are now in scope, and the release type is decided:
  `fix:` plus documentation, not a `!` marker that would cut `2.0.0`.
- **Testability, note.** The "no `cwd` when absent" criterion needed sharpening:
  `resolveRepositoryInput` already passes the key with an `undefined` value, so the assertion must
  check the value rather than the key's presence.
- **Architecture, note.** The central rooting category puts the `.effective-flow/` rule and the
  forge rule side by side; both root at `RUNTIME_STATE_ROOT` for different reasons. Keep the two
  rationales distinct in the prose so a later reader does not merge them into one rule.
- **Maintainability, note.** The enduring contract after this change is "forge CLI work never
  depends on the execution worktree". A future tool that calls the helper must pass `cwd`; the
  contract test in `test/execution-location-contract.test.mjs` is what keeps that visible.

## Open points

- No open points.

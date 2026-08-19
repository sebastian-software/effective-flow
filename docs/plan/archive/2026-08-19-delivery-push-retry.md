# Bounded retries for the release delivery to main

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

**Planned against:** `9efe8c5` on 2026-08-19.
**Working state:** `.github/`, `test/`, and `docs/developer-guide/` are clean. Two unrelated
untracked plan files (`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-14-native-chatgpt-desktop-task-titles.md`) were present during planning and must
remain untouched.

## Requirement

The `Release` workflow publishes a tag and then pushes the built portable payload to `main`. Every
network operation on that path is a **single unguarded attempt**. On 2026-08-19 the push was
rejected with an HTTP 403 for `effective-flow-v1.60.1`, and because there is no re-delivery path by
design (#278), the released version was permanently stranded: consumers installing from the default
branch still receive 1.60.0 until someone cuts another release.

Diagnosis:
[`.effective-flow/investigation/investigation-2026-08-19-delivery-push-403.md`](../../.effective-flow/investigation/investigation-2026-08-19-delivery-push-403.md).
It excluded eight candidate causes by direct API and git reads — the App installation, its
`contents: write` grant, the ruleset bypass, the credentials, the repository state, and the CI
sources are all verifiably unchanged since **before** the successful 1.60.0 delivery — and concluded
that the denial was GitHub-side and transient.

The repository-side defect is therefore not a misconfiguration but the **absence of resilience**:
one transient denial costs a released version number. The deep plan review widened this from the
push alone to all three network operations on the delivery path, because each one produces the
identical stranded-release outcome and the verify step can additionally raise a **false alarm** on a
delivery that actually landed.

Goal is a bugfix, not a redesign. Re-delivery stays rejected, the alarm stays, the App stays the
sole pushing identity, and the push command itself does not change.

## Verified context

| Evidence                                                    | Verified state                                                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml:164`                         | The push is one `git push` with no retry, no backoff, and no `continue-on-error`.                                                                                                      |
| `.github/workflows/release.yml:152`                         | `git fetch origin main` is a **network** operation, fully idempotent and sub-second. An earlier draft of this plan wrongly classified it as local work.                                |
| `.github/workflows/release.yml:172`                         | The `Verify delivered commit` step opens with a second **network** `git fetch origin main`, also unguarded.                                                                            |
| `.github/workflows/release.yml:22-30`, `:151`               | `persist-credentials: false` plus the `extraheader` unset leave `origin` without a credential, so **both fetches run anonymously** and work only because the repository is public.     |
| `.github/workflows/release.yml:153-157`, `:161`, `:166-167` | Local only. `scripts/stage-delivery.mjs` and `distribution-smoke.mjs delivery` make no network calls; the smoke's network modes are reachable only from `managers` mode.               |
| `.github/workflows/release.yml:106-115`                     | The delivery token is minted once per job with `permission-contents: write`, and `skip-token-revoke` is not set anywhere in the repository.                                            |
| Failing run 32236233215, step 16                            | `Create delivery token` succeeded; the push failed ~0.9 s later with `Permission to … denied to effective-flow-delivery[bot]` and exit 128.                                            |
| Same run, step 11                                           | The release-App push to `develop` succeeded three seconds earlier in the same job, so the runner's git and network path were healthy.                                                  |
| No `shell:` or `defaults:` in `.github/workflows/`          | Every `run:` block executes under the GitHub Linux default `bash -e {0}` — `errexit` on, `pipefail` off. `release.yml:150` states this assumption explicitly.                          |
| `grep` over `.github/workflows/*.yml`                       | **No** existing retry, backoff, or re-attempt idiom. Failure-tolerating forms present today: `\|\| true` (lines 151, 239), `\|\| echo …` (267), `if git show … 2>/dev/null` (243).     |
| `.github/workflows/ci.yml:43-51`                            | `shellcheck` covers exactly three `.sh` files. **No** linter or test ever parses or executes a workflow `run:` block.                                                                  |
| `test/workflow-contracts.test.mjs:18-30`                    | The contract tests read `release.yml` as a **whole-file string** and assert with `ordered()`, which is `indexOf(fragment, position + 1)` over literal substrings — never a YAML parse. |
| `test/workflow-contracts.test.mjs:44-51`, `:991`, `:1000`   | The `workflowStep()` slicing helper exists but is used only on `Release Please` and `Create release token`, never on the delivery step.                                                |
| `test/workflow-contracts.test.mjs:954-964`                  | An `ordered()` list pins the push line verbatim between the staging commands and the `Verify delivered commit` fetch.                                                                  |
| `test/workflow-contracts.test.mjs:4331-4365`                | Every `uses:` must be a 40-character SHA with a `# vN` trailer.                                                                                                                        |
| `docs/developer-guide/release-and-installation.md:172-173`  | States unqualified that "a failed delivery waits for the next one".                                                                                                                    |
| `docs/developer-guide/release-and-installation.md:184-187`  | States the alarm's premise: "an open alarm therefore always means real, current drift."                                                                                                |
| `docs/developer-guide/release-and-installation.md:198-203`  | Records the #278 rejection of a re-delivery path.                                                                                                                                      |
| `AGENTS.md:26`                                              | The CI-equivalent sequence is `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.                                                                             |

Marked as **not** repo-verified: that `actions/create-github-app-token` revokes in a post-**job**
step, so the token stays valid for every later step in the job. That is documented upstream
behavior, confirmed only indirectly here by the `Post Create delivery token` entry in the run log.
The absence of `skip-token-revoke` is repo-verified; the lifetime is an upstream dependency.

Assumption, not verified: that the 2026-08-19 denial was transient rather than a momentary
GitHub-side state change. The investigation puts this at roughly 65 %. The plan does not depend on
it being right — a bounded retry is cheap enough to be worth having either way, and a permanent
failure still fails.

## Architecture decisions

- **Retry all three network operations, not just the push.** The pre-fetch (`:152`), the push
  (`:164`), and the verify fetch-and-compare (`:172-173`) each strand a release identically when
  they fail transiently, and both fetches run anonymously from a shared runner IP — the class of
  call most exposed to someone else's rate-limit load. Retrying only the push would claim a coverage
  the change does not have.
- **Retry the verify fetch and its comparison together.** A read-after-write visibility lag would
  otherwise leave `origin/main` stale and fail the equality check on a delivery that landed, opening
  a `delivery-failed` alarm for a healthy release. That directly contradicts the alarm's premise at
  `release-and-installation.md:184-187`, and a false alarm erodes the signal more than a missed one.
- **Retry the staging block? No.** Lines 153–157 are local and deterministic; re-running them would
  create a second `mktemp -d` and a second registered worktree per attempt for no benefit.
- **Use `if ! cmd; then …; fi`, never a bare `cmd && break`.** Both are exempt from `errexit` today,
  but for different reasons, and only one survives refactoring. Bash exempts a failing command that
  is a **non-final** component of an `&&`/`||` list — which is why `push && break` works — but an
  AND-list standing as the **last command of a shell function** does trip `errexit` when that
  function is later called as a simple command. Since this change introduces a retry helper, the
  fragile form would break silently the moment it moved inside it. The `if !` form is exempt twice
  over (the `!` inversion and the `if` test position) and survives that move.
- **One retry helper per `run:` block, with a single attempt-count literal.** Each step is its own
  shell, so the helper cannot be shared between the delivery and verify steps; each block defines
  its own. Within a block the attempt count appears exactly once as a variable, never as two
  hand-synchronized integers — a mismatched pair would either silently cap the attempts or let the
  loop fall through with exit 0, in which case the step would _succeed with nothing pushed_.
- **Exhaustion must exit nonzero.** The helper returns nonzero, and calling it as a simple command
  under `errexit` aborts the step, so `Report a failed delivery` still fires.
- **Reuse the token that is already in the environment; do not re-mint.** `$DELIVERY_TOKEN` stays
  valid for the whole job, far beyond a 20-second retry budget. Re-minting mid-step is not
  expressible inside a `run:` block — it would mean either splitting the step (disturbing the
  `ordered()` contract) or driving the App JWT flow by hand, which would put
  `DELIVERY_APP_PRIVATE_KEY` into a `run:` env that no step has today. This supersedes the re-mint
  suggestion in the investigation report, written before the token's job-wide lifetime was
  established.
- **Retry every failure; do not match on GitHub's error text.** GitHub's wording is not a stable
  contract, and a message change would silently disable the retry. A permanently broken delivery (a
  #274-class identity error, a ruleset rejection) simply fails about 20 seconds later than today.
- **Three attempts, sleeping 5 s and then 15 s.** Long enough to ride out a short GitHub-side blip,
  short enough that the alarm stays prompt and the run stays readable.
- **Log every failed attempt with its number, and never suppress git's stderr.** Swallowing the
  underlying error would turn a diagnosable 403 into an anonymous "delivery failed" and would have
  made this very investigation impossible.
- **This is not the re-delivery rejected in #278.** That rejection is about a _separate workflow_
  reachable from `main`, which cannot exist because `main` carries no release workflow. An in-run
  retry needs nothing on `main` and changes none of #278's reasoning. The plan updates the prose so
  the two are not conflated, but does not reopen the decision.
- **No marketplace retry action.** It would add a third-party action to the job that holds both App
  private keys, which `AGENTS.md:168-186` names as exactly the risk pinning exists to bound.

## Affected files

| File                                               | Description                                                                                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml`                    | Add a retry helper to the delivery step and wrap the pre-fetch (`:152`) and the push (`:164`); add a helper to `Verify delivered commit` and wrap the fetch-and-compare pair (`:172-173`).         |
| `test/workflow-contracts.test.mjs`                 | Add assertions, scoped with `workflowStep()`, pinning the attempt count, both sleeps, the retried operations, and the nonzero exhaustion. Confirm the existing `ordered()` lists still hold.       |
| `docs/developer-guide/release-and-installation.md` | Qualify "a failed delivery waits for the next one", describe the retries in pipeline step 6, restate the alarm premise now that a transient blip no longer reaches it, and note #278 is unchanged. |

Deliberately **not** changed:

- the push command string, the token step, the two alarm steps;
- `scripts/stage-delivery.mjs`, `scripts/distribution-smoke.mjs`;
- the `main` ruleset, the App installation, or any repository setting — the investigation verified
  all of them correct;
- `Verify uploaded release archive` (`:103`) and the alarm steps' own `gh` calls, which are network
  operations outside the delivery path proper.

## Implementation details

### Approach

1. In the delivery step, insert a retry helper at the top of the `run:` block and route the two
   network operations through it. Keep both command strings unchanged and on one line each.
2. Shape sketch only — the implementing workflow writes the final form; this fixes the semantics,
   not the wording:

   ```sh
   attempts=3
   retry() {
     n=1
     while :; do
       if "$@"; then return 0; fi
       if [ "$n" -ge "$attempts" ]; then echo "failed after $attempts attempts: $*" >&2; return 1; fi
       echo "attempt $n failed, retrying" >&2
       sleep $(( n == 1 ? 5 : 15 ))
       n=$(( n + 1 ))
     done
   }
   ```

   Called as `retry git fetch origin main` and `retry git -C "$work" push "<unchanged URL>" HEAD:main`.
   The load-bearing properties are that a failing attempt must not trip `errexit` before the loop
   iterates, that exhaustion must return nonzero, and that the helper must never end in a bare
   `&&`/`||` list.

3. In `Verify delivered commit`, add the same helper and wrap the fetch **and** the equality check
   as one retried unit, so a stale read is retried rather than alarmed. Inside that wrapper use an
   explicit `if`/`return`, not `git fetch … && test …`, for the reason in the architecture
   decisions.
4. Add a comment above each helper naming the 2026-08-19 v1.60.1 incident, the verified-transient
   diagnosis, and the fact that the retries do not reopen #278.
5. Extend `test/workflow-contracts.test.mjs` with assertions **scoped via**
   `workflowStep(release, 'Deliver portable skill, consumer docs, and trusted automation to main')`
   and `workflowStep(release, 'Verify delivered commit')`, so a fragment cannot be satisfied by text
   in a neighboring step. Assert the attempt count, both sleep values, and that each retried command
   appears inside its step. Keep matching literal substrings, the file's established style.
6. Update the four prose locations in `release-and-installation.md`.
7. Run the full sequence from `AGENTS.md:26`.

### Component structure

Not relevant — this is a shell-level change inside two workflow steps.

### State management

Not relevant.

### API integration

No new API surface and no new `uses:` action, so the SHA-pinning contract at
`test/workflow-contracts.test.mjs:4331-4365` is untouched.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Permanent failure (#274-class identity error, ruleset rejection, revoked grant).** All three
  attempts fail, the step exits nonzero, `Report a failed delivery` fires as today, about 20 seconds
  later. Accepted cost.
- **Push landed but the response was lost.** A re-push of the same `HEAD:main` when remote `main`
  already equals the pushed commit is `Everything up-to-date` and exits 0, so the retry is
  idempotent. This is narrower than "any re-push is safe" — see the next case.
- **`origin/main` advanced between attempts.** Every attempt fails non-fast-forward and the alarm
  fires. Do **not** auto-fetch and rebase inside the loop: nothing but this step is supposed to push
  to `main`, so silently rebasing would hide a policy breach that the alarm exists to surface.
- **Verify sees a stale `origin/main` after a successful push.** Now retried as a unit, so a
  read-after-write lag no longer opens a false `delivery-failed` alarm. A genuine mismatch still
  fails after the attempts are exhausted.
- **No delivery changes for this release.** The `else` branch is not entered, so the push retry
  never runs. The pre-fetch and verify retries still apply. Behavior otherwise unchanged.
- **Helper moved or refactored later.** A bare `cmd && break` or a trailing AND-list as a function's
  last command trips `errexit`; the prescribed `if !` form does not. The comment above the helper
  must say so, because nothing in CI would catch the regression.
- **Contract-test trap.** `ordered()` advances with `indexOf(fragment, position + 1)`, so the search
  window advances by one character and windows overlap. Adding a `git fetch origin main` _after_ the
  push would make the sixth fragment of the list at `test/workflow-contracts.test.mjs:954-964` bind
  to it instead of the one in `Verify delivered commit`; the test would still pass while silently
  ceasing to guard the verify step. The chosen design adds no fetch after the push, and the new
  assertions are step-scoped rather than whole-file, which is why criterion 9 below is not
  self-satisfying.
- **Push literal must not be split.** The same `ordered()` list matches the push as one literal
  substring, so the command must not be wrapped across lines. This fails loudly, not silently.
  Indentation is safe — the fragment carries no leading-indent anchor.
- **Cancelled run.** Unchanged: `failure()` in the alarm's condition already excludes cancellation.

## Acceptance criteria

- [ ] The pre-fetch (`release.yml:152`), the push (`:164`), and the verify fetch-and-compare
      (`:172-173`) each run through a bounded retry of **3** attempts, sleeping **5 s** after the
      first failure and **15 s** after the second.
- [ ] The verify fetch and its equality check are retried as **one unit**, so a stale read is
      retried rather than alarmed.
- [ ] Each retried command remains a contiguous single-line substring; the push in particular still
      matches `test/workflow-contracts.test.mjs:960` verbatim.
- [ ] No retried operation uses a bare `cmd && break` or ends a helper in an `&&`/`||` list; the
      guarded form is `if ! cmd; then … fi`.
- [ ] The attempt count appears exactly **once** as a literal per `run:` block; no second
      hand-synchronized integer exists.
- [ ] Every failed attempt emits its attempt number to the run log, and git's own stderr is not
      suppressed.
- [ ] Exhausting the attempts exits nonzero, and `Report a failed delivery` still fires on it.
- [ ] No new `uses:` entry, no new secret or variable, and `DELIVERY_APP_PRIVATE_KEY` still appears
      only in the `Create delivery token` step.
- [ ] The new assertions are scoped with `workflowStep(...)` for their step, not matched against the
      whole file.
- [ ] `test/workflow-contracts.test.mjs` fails if a retry is removed or its attempt count or either
      sleep value changes.
- [ ] The existing assertions at `test/workflow-contracts.test.mjs:954-964`, `969-977`, `1022-1033`,
      `2135-2140`, and `2186-2192` pass unmodified.
- [ ] `docs/developer-guide/release-and-installation.md` no longer states unqualified that a failed
      delivery waits for the next release, and says in one sentence that the retries do not reopen
      #278.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.

## Validation plan

- `pnpm agent:check` — formatting, per `AGENTS.md:26`.
- `pnpm test` — runs `test/workflow-contracts.test.mjs`, including the new step-scoped retry
  assertions, the five existing assertion groups above, and the workflow SHA-pinning scan.
- `node build.mjs` then `pnpm test:distribution` — `scripts/distribution-smoke.mjs:285-295` asserts
  that `release.yml` stays out of the delivered tree; a workflow edit must not change that.
- Manual read-through of the rendered steps: confirm the helper survives YAML block-scalar
  indentation and that each retried command is unwrapped.
- Optional local check, not wired into CI: run each helper standalone under `bash -e` with a stub
  command that fails a controlled number of times, and confirm the exit status and log output.

**Named residual risks, stated rather than engineered around:**

- The retry's behavior against a real 403 cannot be exercised — the failure is not reproducible on
  demand, and a fault-injection harness for a one-line push would cost more than the bug.
- Every assertion in `workflow-contracts.test.mjs` is a substring or regex over workflow **text**;
  nothing in this repository parses the YAML or executes a `run:` block. `ci.yml:43-51` shellchecks
  three `.sh` files and no workflow. So the two properties this plan calls load-bearing — that the
  retried command is genuinely inside the loop, and that exhaustion actually exits nonzero — are
  **not testable by any mechanism this repository has**. The optional local check above is the only
  way to exercise them, and it is deliberately not made a CI gate for a change of this size.

## Assumptions and open points

- Assumed: the 2026-08-19 denial was transient (~65 % per the investigation). If a later occurrence
  survives all three attempts, the diagnosis moves to a GitHub-side state change and this plan is
  not the fix — the alarm will say so.
- Assumed: `actions/create-github-app-token` revokes only in a post-job step, per upstream
  documentation, so `$DELIVERY_TOKEN` outlives a 20-second retry budget.
- Assumed: 20 seconds of added latency on a permanently broken delivery is acceptable. It is well
  inside the job's normal runtime.
- Noted, not acted on: both fetches depend on the repository staying **public**, since neither
  carries a credential. That is a functional dependency of the delivery path, not only the docs
  inaccuracy listed below.
- Deliberately out of scope: adding `shellcheck`/`actionlint` over workflow `run:` blocks. It would
  catch the class of bug this plan guards against by convention, but it is a CI-infrastructure
  change, not part of a minimal bugfix. Recorded here so the omission is a decision, not a gap.
- Deliberately out of scope: the delivery step leaves its worktree registered and emits no `commit`
  output when the push fails. Harmless — the runner is ephemeral and `Verify delivered commit` is
  skipped by the implicit `success()` gate — and folding it in would widen a minimal bugfix.
- Deliberately out of scope: the stale comment at `release.yml:55-59` claiming other
  `create-github-app-token` steps are "still on the tag", which is no longer true.
- Deliberately out of scope: `Verify uploaded release archive` (`:103`) and the alarm steps' own
  `gh` calls. They are network operations in the same job, but outside the delivery path this plan
  fixes.
- Deliberately out of scope: the operational repair for v1.60.1 itself. Per #278 and issue #358, the
  repair is to cut the next release; #358 closes itself when a later delivery succeeds. 1.60.1
  remains a permanently undelivered version number, and this plan does not change that.
- Deliberately out of scope: `README.md:51-53` and `docs/user-guide/getting-started.md:6-8` still
  describe the repository as private while it is public.

## Plan review

**Result:** Approved

The generic plan-quality and plan-review judgment is owned by the central skill
`codebase-improvement`, which is **not installed in this environment**. The minimal generic fallback
from the skill-discovery contract was applied instead: a short core checklist covering
over-engineering, scope creep, unspoken assumptions, missing or non-measurable acceptance criteria,
edge cases, and implementation risks. No specialist boundary is crossed — this is a narrow
CI/tooling change, which the language-support table routes to the tooling-only generic path with
technical validation. Depth is correspondingly reduced, and this notice is that disclosure. A deep
interactive review pass then re-checked every claim against the code, which is where findings 4–11
below come from.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         2 |    1 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         1 |    1 |

### Findings

- **Error cases, critical — incorporated.** The "Verified context" table claimed
  `release.yml:143-167` was "deterministic local work" apart from the push. False: `:152` is a
  network fetch, and `Verify delivered commit` opens with a second one at `:172`. The plan therefore
  claimed a coverage it did not have. The row is corrected and the retry now spans all three
  operations.
- **Error cases, important — incorporated.** A transient failure in `Verify delivered commit`, or a
  read-after-write lag on `origin/main`, would raise a `delivery-failed` alarm for a delivery that
  actually landed — contradicting the alarm's own premise at `release-and-installation.md:184-187`.
  The verify fetch and its comparison are now retried as one unit.
- **Error cases, important — incorporated.** The first sketch's `[ "$attempt" = 3 ]` guard duplicated
  the loop bound `for attempt in 1 2 3`. A mismatch would either cap the attempts silently or let
  the loop fall through with exit 0, making the step **succeed with nothing pushed**. The helper now
  carries a single `attempts` literal per block, and criterion 5 pins it.
- **Maintainability, important — incorporated.** The stated rationale for the guard was wrong.
  `push && break` is exempt from `errexit` because the failure is in a non-final position of an
  AND-list, not because "the push must run in a condition or `||` position" — and that exemption
  does **not** survive being moved into a shell function, which this plan now introduces. The
  prescribed form is `if ! cmd; then … fi`, with the hazard named in an edge case and in a required
  comment.
- **Testability, important — incorporated.** The criterion that the existing `ordered()` list "passes
  unmodified" is satisfiable by a broken workflow, because `ordered()` advances its search window by
  one character and the windows overlap. New assertions must be scoped with `workflowStep()`;
  criterion 9 requires it.
- **Testability, important — incorporated.** Nothing in this repository parses or executes workflow
  shell, so the two properties the plan calls load-bearing cannot be tested here. Recorded as a named
  residual risk in the same voice as the "not reproducible against a real 403" note.
- **Security, important — incorporated.** An early sketch re-minted the token per attempt, which
  would have required `DELIVERY_APP_PRIVATE_KEY` in a `run:` env. Replaced by reusing the job-scoped
  token; criterion 8 pins the private key to the token step.
- **Architecture, important — incorporated.** The token's job-wide lifetime was presented as a
  repo-verified fact when it is upstream-documented behavior. Now marked as such, both in the
  verified-context section and in the assumptions.
- **Testability, note — incorporated.** Acceptance criterion 3 originally demanded the push line stay
  "byte-identical", which the plan's own sketch violated by appending to it. Restated as a contiguous
  single-line substring matching `workflow-contracts.test.mjs:960`.
- **Error cases, note.** Retrying every failure delays a permanent failure by ~20 s. Deliberate:
  matching GitHub's error text would couple the workflow to wording that is not a contract.
- **Architecture, note.** A marketplace retry action would be less code but would add a third-party
  action to the job holding both App private keys. Rejected with that rationale.
- **Scope, note.** Both fetches are silently coupled to the repository being public, since neither
  carries a credential. Recorded as a functional dependency rather than folded in.
- **Scope, note.** Seven adjacent issues found during planning are listed as explicitly out of scope
  rather than silently folded in, each with a reason.
- **Maintainability, note.** The change adds the repository's **first** retry idiom to
  `.github/workflows/`. Keeping it to plain `bash` with no new action means there is no new
  dependency to maintain, and the comment above each helper carries the rationale so a later reader
  does not remove it as noise.

## Open points

- No open points.

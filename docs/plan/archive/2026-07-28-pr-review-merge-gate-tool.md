# PR review and merge-gate tool

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Effective Flow can create a pull request, publish its own findings onto it, and feed foreign review
notes back into it, but nothing shepherds a pull request from "open" to "merged". A maintainer still
has to watch CI by hand, decide whether a bot finding is real, re-trigger the bot after a fix, and
finally press merge.

Add an exposed tool `/effective-flow pr-review [<PR reference>]` that owns exactly that gap. It
resolves a pull request, asks once at the start whether the run may merge at the end or only report
merge-readiness, then drives an ordered gate:

1. all checks green — otherwise repair the pull request first;
2. once green, evaluate the notes of automatic reviewers (Greptile and comparable bots), fix the
   valid ones on the pull request, re-trigger the reviewer where needed, and reply in the threads;
3. if human pull-request comments exist, implement no review note and merge nothing — see the
   architecture decision below for why CI repair stays permitted in that state;
4. if no human comments exist, everything is green, every configured automatic reviewer has run for
   the current head, and their comments have been answered — merge.

The tool changes code, adds forge capabilities, and adds configuration, so it is new functionality:
the recommended follow-up workflow is `/effective-flow build`.

## Architecture decisions

- **A new exposed tool, not a mode of `/effective-flow iterate`.** `iterate` owns per-item work on a
  pull request: classify one note, implement it, one commit per item, reply, resolve. The new tool
  owns a different concern — the ordered gate, the bounded wait loops, the bot round, and the merge
  decision. Folding a CI loop and a merge action into `iterate` would give it a second, unrelated
  responsibility and make its non-interactive delegation contract ambiguous.
- **Every code change is delegated to `/effective-flow iterate <PR>`.** CI failures enter `iterate`
  as free-text instructions, bot findings as the review threads it already reads. The new tool
  therefore inherits `iterate`'s classification, action routing, path-ownership analysis,
  commit-integrity mutex, validation phase, and push rules unchanged, and carries no second
  implementation, staging, or push path of its own.
- **`iterate` gains an optional item filter so the gate can scope a delegation.** Without it the
  phase order is unenforceable: `iterate` Phase 2 classifies **every** unaddressed thread plus the
  free text, so a delegation meant to repair only a failing check would silently pull in every open
  bot finding. The filter restricts a run to the free-text items alone or to an explicit list of
  thread IDs. It is additive and optional — an unfiltered `iterate` invocation keeps its current
  behavior exactly.
- **The review judgment stays with the central `pr-review` skill.** The delegation runs inside
  `iterate`, which already performs the Mode C handoff. The new tool adds no second judgment layer;
  it consumes `iterate`'s reported outcome per item.
- **All forge access goes through `scripts/remote-tracker.mjs`.** `src/shared/pr-review-comments.md`
  forbids assembling provider requests or discovering flags in a prompt, and merging is the most
  irreversible mutation in the tool set. Three new operations are added rather than shelling out.
- **One new read operation `pr-status-read`, not two.** It returns the head SHA, the normalized
  check rollup, and the forge's own merge state in a single call. Splitting checks and mergeability
  into separate operations would double the new capability surface for no gain, and both values must
  be read at the same instant to be consistent.
- **Waiting for pending checks happens inside the CLI, not in a prompt loop.** A third operation
  `pr-checks-wait` wraps the provider's own blocking watch (`gh pr checks --watch`, verified present
  in the installed `gh`), so the run consumes no tokens while CI runs. A poll loop driven from the
  prompt was rejected: it would spend a model turn per interval for no additional information. If
  the provider has no watch capability, or the wait hits its timeout, the tool does not fall back to
  polling — it reports the pending checks and asks the user once whether CI has finished.
- **Mergeability is read from the forge, never inferred from check runs.** A protected branch can
  additionally require named checks, an approval, an up-to-date branch, or linear history, so "all
  checks green" and "mergeable" are different statements. The forge's merge state is authoritative;
  a blocked state is reported, never worked around. The tool never approves a pull request —
  `src/shared/pr-review-comments.md` forbids approve and request-changes submissions.
- **Every check must be green by default, not only the required ones.** The forge's merge state is a
  necessary but not sufficient condition: it only enforces the checks branch protection marks as
  required, while the requirement for this tool is that the pull request is genuinely clean. The key
  `prReview.requireAllChecks` (default `true`) expresses that, and a project with a permanently red
  optional check can set it to `false` to fall back to the forge's own definition. The provider flag
  that implements the narrow case already exists (`gh pr checks --required`).
- **`pr-merge` carries the expected head SHA.** The merge must apply to exactly the commit that was
  verified green; if the head moved between verification and merge, the operation fails closed and
  the run reports instead of merging a state it never checked.
- **A branch behind its base is fixed by merging the base into the head branch.** A rebase or a
  force-push would violate the no-history-rewriting rule that `src/shared/pr-review-comments.md` and
  the delivery contract both state. A forge-side update-branch operation was rejected because it
  would add a fourth new capability that Forgejo very likely cannot serve.
- **The tool uses its own reply marker, distinct from both existing ones.**
  `<!-- effective-flow-iterate -->` marks `iterate`'s replies and `<!-- effective-flow-pr-review -->`
  marks Effective Flow's outbound review findings. Reusing either would make `iterate` treat the new
  tool's replies as already-processed input or as Effective Flow's own review output. Idempotency
  and the separation between the two directions are exact string matches.
- **The tool posts no summary comment of its own.** `iterate` already posts one per delegated round,
  and the merge itself is visible on the pull request. The run summary goes to the user in chat.
- **`report` mode withholds the merge, not the work.** Decided during implementation, because this
  plan originally contradicted itself: one validation bullet expected a `report` run on a failing
  pull request to make no commit, the next expected it to run the CI repair. A `report` run still
  repairs checks, answers and resolves bot threads, and posts bot triggers; only the merge never
  happens. This follows the requirement's own wording — return merge-readiness _once everything is
  done_, which presupposes that the doing happens. The entry-gate option is worded so it does not
  promise a read-only run.
- **The human-comment guard blocks review-driven work and the merge, but not CI repair.** A failing
  check is an objective defect, not an opinion a human is currently negotiating, so the gate may
  still repair it while a human discussion is open. What the guard stops is implementing a review
  note and merging. This deliberately refines the blunt reading of "make no automatic commit": the
  narrower rule keeps the tool useful on an actively discussed pull request without ever landing a
  change out from under a reviewer.
- **Configuration lives under `prReview.*`, the merge method under `delivery.mergeMethod`.** The
  merge method is a delivery property that a future forge-side delivery completion would reuse. The
  namespace `prReview.*` sits next to the pre-existing, unrelated `delivery.prReview`; see the
  finding on this in the plan review below.
- **Forgejo fails closed.** The GitHub path is implemented; the Forgejo probe declares the new
  capabilities `false` unless the installed adapter demonstrably supports them, so a Forgejo run
  degrades to report-only with a stated reason instead of improvising a provider request.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/pr-review.md`                    | new tool source: gate, phases, delegation contract, rules; embeds `language-rules`, `task-tracking`, `config-migration`, `skill-discovery`, `pr-review-comments`, `goal-completion`, `worktree-integration`, `completion-protocol`                                                                                                                                                    |
| `build.mjs`                                 | add `pr-review` to the `Ensure quality` group in `TOOL_GROUPS` (line 104 ff.), which derives `EXPOSED_TOOLS`                                                                                                                                                                                                                                                                          |
| `src/scripts/remote-tracker-core.mjs`       | new operations `pr-status-read`, `pr-checks-wait`, and `pr-merge` in `REMOTE_OPERATIONS`, `pr-merge` additionally in `MUTATIONS`, entries in `CAPABILITY_BY_OPERATION`, GitHub command plans in `buildCommandPlan`, normalizers in `normalizeRemoteData`, capability flags in both provider probes                                                                                    |
| `src/shared/pr-review-comments.md`          | document the three new operations, the new reply marker, and its relationship to the two existing markers                                                                                                                                                                                                                                                                             |
| `src/tools/iterate.md`                      | add the new marker to the Phase 2 exclusion list, and add the optional item filter (free-text only, or an explicit thread-ID list) to Phase 0 and Phase 2                                                                                                                                                                                                                             |
| `src/shared/documentation-sync-contract.md` | add the new tool to the authoritative orchestrator list for non-interactive delegation (line 65)                                                                                                                                                                                                                                                                                      |
| `src/tools/setup.md`                        | wizard questions and default rows for the new configuration keys                                                                                                                                                                                                                                                                                                                      |
| `docs/adr/effective-flow-project-setup.md`  | this repository's own configuration rows for the new keys                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tools-quality.md`          | user documentation of the new tool next to `review`                                                                                                                                                                                                                                                                                                                                   |
| `docs/user-guide/configuration.md`          | the new keys with their defaults, plus the explicit disambiguation against `delivery.prReview`                                                                                                                                                                                                                                                                                        |
| `docs/user-guide/remote-tracker.md`         | the three new helper operations and their Forgejo limitation                                                                                                                                                                                                                                                                                                                          |
| `docs/developer-guide/configuration.md`     | technical description of the new keys and the bot registry encoding                                                                                                                                                                                                                                                                                                                   |
| `docs/developer-guide/skill-ownership.json` | consumer entry `{ "consumer": "pr-review", "classification": "delegate" }` under the `pr-review` skill                                                                                                                                                                                                                                                                                |
| `docs/developer-guide/skill-ownership.md`   | the matching human-readable relationship                                                                                                                                                                                                                                                                                                                                              |
| `test/remote-tracker.test.mjs`              | command-plan, normalization, dry-run, and capability tests for all three new operations                                                                                                                                                                                                                                                                                               |
| `test/workflow-contracts.test.mjs`          | contract assertions for the new tool source, the marker separation, and the `iterate` item filter                                                                                                                                                                                                                                                                                     |
| `src/scripts/remote-tracker.mjs`            | **added during implementation, not planned:** `gh pr checks --watch` has no timeout flag, so the bound travels as `plan.timeoutMs` and only `createProcessRunner` can enforce it via `spawn`'s `timeout`/`killSignal`. Without this the plan's own requirement that `pr-checks-wait` cannot hang a run indefinitely would be unfulfilled. Operations without a bound spawn unchanged. |
| `README.md`                                 | **added during implementation, not planned:** the marketing entry point claimed `commit`/`pr` close the loop "all the way to the pull request", which the merge gate makes false. The mandatory documentation-sync gate cannot complete with a `blocked` surface.                                                                                                                     |

## Implementation details

### Approach

1. **Helper operations first.** Add `pr-status-read`, `pr-checks-wait`, and `pr-merge` to
   `src/scripts/remote-tracker-core.mjs` with tests, before any prompt source references them. A
   tool source that names an operation the helper does not implement is a dead contract.
   - `pr-status-read` returns, in one normalized envelope: the head SHA, the base ref, the pull
     request state, the draft flag, a check list (name, status, conclusion, required flag when the
     provider exposes it, URL), and the forge's merge state. Where the provider does not expose a
     value — Forgejo has no required-check flag — the field is absent rather than guessed, exactly
     as the existing `authorType` handling does for bot detection.
   - `pr-checks-wait` blocks until the provider reports the checks complete, or until the supplied
     timeout elapses, and returns the same normalized check list. On GitHub it maps to
     `gh pr checks --watch`, passing `--required` when `prReview.requireAllChecks` is `false` and
     omitting it otherwise, plus `--json` for the machine-readable result. Its exit code 8 means
     "still pending" and is normalized into a timeout result, not an error. It is a read operation
     and therefore not in `MUTATIONS`.
   - `pr-merge` takes the pull request number, the merge method, and the expected head SHA. It
     belongs in `MUTATIONS`, so a run without `apply` produces a dry-run plan.
   - All three providers entries go into the capability blocks. GitHub declares all three `true`;
     Forgejo declares all three `false` unless the installed adapter check proves otherwise,
     following the existing "installed tea adapter does not safely support" pattern.
2. **Configuration.** Add the keys below to `src/tools/setup.md` (wizard plus default table) and to
   this repository's project-setup ADR. The configuration table is a flat dotted-key encoding, so
   the bot registry is expressed as a comma list plus one dotted key per bot.

   | Key                             | Values                       | Default   |
   | ------------------------------- | ---------------------------- | --------- |
   | `prReview.completion`           | `ask`, `merge`, `report`     | `ask`     |
   | `prReview.requireAllChecks`     | `true`, `false`              | `true`    |
   | `prReview.checkWaitMinutes`     | positive integer             | `20`      |
   | `prReview.maxRounds`            | positive integer             | `3`       |
   | `prReview.botWaitMinutes`       | positive integer             | `10`      |
   | `prReview.bots`                 | comma list of logins         | `(empty)` |
   | `prReview.bots.<login>.trigger` | literal trigger comment text | unset     |
   | `delivery.mergeMethod`          | `squash`, `merge`, `rebase`  | `squash`  |

   A login containing brackets (`greptileai[bot]`) is a valid middle segment because the encoding
   splits on `.` only. An empty `prReview.bots` list means no automatic reviewer is expected; the
   bot round is then skipped rather than blocking the merge forever.

3. **Tool source, Phase 0 — resolve and gate.** Resolve the pull request from the argument or the
   current branch through the loaded PR resolution. A merged or closed pull request, or one
   belonging to another repository, is reported read-only and the run ends. Then resolve
   `prReview.completion`: a configured `merge` or `report` is used and reported as coming from
   configuration; `ask` or an unset key poses the entry gate exactly once. In a non-interactive
   delegation the question cannot be posed, so the run behaves as `report`.
4. **Phase 1 — read state fresh, and set the guard once.** Read `pr-status-read` plus the review
   threads and pull-request comments fresh. Partition the comment authors into: configured bots,
   Effective Flow's own marked output, and everything else. An author whose `authorType` is
   `unknown` counts as human — the fail-safe direction, because the only consequence is a narrower
   run. If at least one unresolved comment or thread has a human author, the **human guard** is
   active for the rest of the run: no review-driven implementation and no merge. CI repair stays
   permitted, and bot threads may still be answered.
5. **Phase 2 — check gate (bounded).** Repeat at most `prReview.maxRounds` times:
   - pending checks: call `pr-checks-wait` with `prReview.checkWaitMinutes` as its timeout and let
     the CLI block. On a timeout result, or when the provider has no watch capability, do not poll:
     report the still-pending checks and ask the user once whether CI has finished. An unanswered or
     non-interactive run ends there with a report and never merges;
   - failed checks: delegate to `/effective-flow iterate <PR>` with the item filter set to
     free-text-only and an instruction derived from the failing check names and their reported
     failure detail. The human guard does not block this delegation;
   - a merge state of `BEHIND`: provision a checkout of the head branch, merge `origin/<base>` into
     it as a merge commit, push normally, and re-read. This is the only Git write the tool performs
     itself; it must complete and be pushed before any `iterate` delegation starts, so the two never
     write the same branch concurrently;
   - a merge state of `DIRTY` (conflict with the base) is not repaired automatically: stop, report
     the conflict, and do not merge;
   - after each round re-read the status. Leave the loop when every check required by
     `prReview.requireAllChecks` is green. Exhausting `prReview.maxRounds` ends the run with a
     report, never with a merge.
6. **Phase 3 — automatic reviewer round.** For each login in `prReview.bots`, determine whether it
   has produced a review or comment newer than the current head commit. If not, post its configured
   trigger comment once and wait up to `prReview.botWaitMinutes`, re-reading. When the bot has run,
   its unresolved threads go to `/effective-flow iterate <PR>` with the item filter set to exactly
   those thread IDs; `iterate` classifies them, implements the valid ones as new commits, replies,
   and resolves them. Any implementation restarts Phase 2, because new commits invalidate both the
   check result and every bot's run state.
   - With the human guard active, this delegation does not run. The gate instead replies to the bot
     threads itself through the loaded reply and resolve operations, carrying the new marker, and
     reports what it did not implement. A thread already carrying the new marker is not answered
     again.
7. **Phase 4 — merge preconditions.** Verify each of the following against a fresh read: the
   resolved mode is `merge`; the check criterion from `prReview.requireAllChecks` is satisfied; the
   forge reports the pull request as mergeable and not a draft; the human guard is inactive; every
   configured bot has run for the current head; every bot thread is answered or resolved; the head
   SHA equals the SHA verified in Phase 2; and, for `delivery.mergeMethod: squash`, the pull-request
   title parses as a Conventional Commit, because the squash subject is the release signal.
8. **Phase 5 — merge.** Call `pr-merge` with `delivery.mergeMethod` and the verified head SHA. In
   mode `report`, or when any Phase 4 condition fails, report the exact unmet condition instead and
   perform no merge.
9. **Phase 6 — summary.** Report to the user in chat: resolved pull request, mode, check outcome per
   round, delegated `iterate` rounds and their results, bot round state, human comments found, and
   the merge result or the precise blocking condition.

### Component structure

Not relevant — the deliverable is Markdown prompt sources plus a Node.js helper extension, not a
component tree.

### State management

Not relevant beyond the run's wisdom file. The pull request itself remains the state: the tool adds
no new persistence, exactly as the outbound publication fragment already argues for its idempotency.

### API integration

The three new helper operations are the entire new external surface. They follow the existing
envelope, dry-run, capability, redaction, and error contract; `AMBIGUOUS_HOST` returns for an
explicit provider choice, and `CLI_MISSING` or `AUTH_FAILED` aborts without side effects.
`pr-checks-wait` is the only long-running operation and needs an explicit timeout so it cannot hang
a run indefinitely.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Head moves during the run** (a human pushes while the gate waits): the SHA guard on `pr-merge`
  rejects the merge; the run reports and does not retry blindly.
- **A bot acknowledges with an emoji reaction instead of a comment.** Greptile does this. Reactions
  are not readable through the helper, so "has run" is defined as a new review or comment after the
  head commit. A bot that only reacts will time out and block the merge — a report, never a wrong
  merge.
- **A bot posts nothing because it found nothing.** Indistinguishable from "has not run yet" through
  comments alone; the same timeout applies. Documented as a known limitation.
- **`prReview.bots` is empty:** the bot round is skipped and the merge is not blocked on it.
- **Branch protection requires an approval:** the forge reports a blocked merge state; the run
  reports that a human approval is missing and never attempts to approve.
- **Non-required check red, required checks green:** with the default `prReview.requireAllChecks:
true` this blocks the merge and enters the repair loop like any other failure. With `false` the
  forge merge state decides and the red optional check is reported but not treated as a blocker.
- **A check is red and a human comment is open:** the CI repair runs, the merge does not. This is
  the one case where the guard is deliberately narrow.
- **`pr-checks-wait` times out or is unsupported:** report the pending checks and ask once; never
  fall back to a prompt-driven poll loop.
- **Forgejo:** all three new capabilities are `false`, so the run degrades to report-only and states
  the reason. Nothing in the gate can run there until the adapter supports at least
  `pr-status-read`.
- **`iterate` returns `ABORT` for an item:** the gate treats the round as unsuccessful, does not
  merge, and reports the failed item.
- **The item filter matches nothing** (every named thread was resolved between the read and the
  delegation): `iterate` must return cleanly with no items rather than falling back to processing
  everything. This is the filter's most important failure mode and needs its own test.
- **The pull request is a draft:** report and do not merge.
- **The pull request title is not a Conventional Commit and the merge method is `squash`:** report
  the invalid title as the blocking condition and do not merge, because release-please would
  silently drop the change from the changelog.
- **Concurrent runs on the same pull request:** the tool holds no lock of its own; `iterate`'s
  commit mutex protects the index, but two gate runs could both wait and both merge. Documented as
  out of scope; the merge SHA guard makes the second merge fail closed rather than duplicate work.

## Acceptance criteria

- [ ] `node build.mjs` succeeds and `/effective-flow pr-review` appears in the `Ensure quality` group
      of all three generated routers, with a `catalogHint` accepted by the existing build guards.
- [ ] `pnpm test` passes, including new cases in `test/remote-tracker.test.mjs` that assert: the
      GitHub command plan for `pr-status-read`; its normalized output shape; the GitHub command plan
      for `pr-merge` including the expected-head-SHA argument; that `pr-merge` without `apply`
      returns a dry-run plan and executes nothing; and that the Forgejo probe reports all three new
      capabilities as unsupported.
- [ ] A `pr-merge` call whose expected head SHA does not match the current head fails with a
      structured error and performs no merge, proven by a test.
- [ ] `pr-checks-wait` is covered by tests asserting that its GitHub command plan carries `--watch`
      and the supplied timeout, that `--required` is present exactly when `prReview.requireAllChecks`
      is `false`, and that exit code 8 normalizes to a timeout result rather than an error.
- [ ] `test/workflow-contracts.test.mjs` asserts that `src/tools/pr-review.md` exists, is listed in
      `TOOL_GROUPS`, and that the three markers `<!-- effective-flow-iterate -->`,
      `<!-- effective-flow-pr-review -->`, and the new gate marker are pairwise distinct, and that
      `src/tools/iterate.md` excludes the new marker.
- [ ] `src/tools/iterate.md` documents the optional item filter, and a contract test asserts that an
      unfiltered invocation keeps its current all-items behavior while a filter matching no item
      yields an empty run rather than a fallback to all items.
- [ ] `pnpm agent:check` and `pnpm test:distribution` pass.
- [ ] The tool source states, verifiably by reading it, that it performs no `git commit` and no push
      other than the base-into-head merge of step 5, and delegates every other code change to
      `/effective-flow iterate`.
- [ ] The new configuration keys appear with the defaults from the table above in `src/tools/setup.md`
      and in `docs/user-guide/configuration.md`, and the latter contains an explicit sentence
      distinguishing `prReview.*` from `delivery.prReview`.
- [ ] `docs/developer-guide/skill-ownership.json` lists `pr-review` as a consumer of the `pr-review`
      skill and the accompanying `.md` explains the relationship.

## Validation plan

- `pnpm agent:check` — formatting, exit 0.
- `pnpm test` — unit suite including the new helper and contract tests, exit 0.
- `node build.mjs` — build guards for exposed tools, `catalogHint`, include targets, and version
  drift, exit 0.
- `pnpm test:distribution` — isolated archive and installation layout, exit 0.
- Manual smoke test against a real pull request of this repository, in this order: a `report` run on
  a green pull request (expect: merge-readiness report, no write, because there is nothing to
  repair); a `report` run on a pull request with a failing check (expect: the CI repair runs and
  commits, the merge does not); a `report` run on a pull request with a failing check **and** an
  open human comment (expect: the CI repair still runs, no review-driven implementation, no merge);
  a `merge` run on a green pull request with no human comments (expect: squash merge with the
  pull-request title as the commit subject).
- Manual wait check: start a run while CI is still running and confirm from the transcript that the
  wait consumed a single `pr-checks-wait` call rather than a sequence of status reads.
- Manual dry-run check: invoke the helper's `pr-merge` without `apply` and confirm that the printed
  plan performs no merge.

## Assumptions and open points

- **Planning state:** planned at `9e3b9e3`, 2026-07-28, clean working tree. Before execution,
  re-read `build.mjs` (`TOOL_GROUPS`), `src/scripts/remote-tracker-core.mjs` (operation sets and
  probe capability blocks), `src/tools/iterate.md`, and `src/shared/pr-review-comments.md`; revise
  the plan if the operation registration pattern or the marker contract has changed.
- **The central `pr-review` skill's Mode C is assumed, not verified.** `src/tools/iterate.md` and
  `src/shared/pr-review-integration.md` both delegate to a caller-owned "Mode C" returning
  `pr-review-handoff/v1`, but the copy installed on this machine documents only Mode A and Mode B
  and contains neither string. This is a pre-existing condition of the repository, not something
  this plan introduces, and the documented fallback ("if `pr-review` is unavailable, use the minimal
  local classification fallback and disclose the reduced review depth") covers it. The new tool
  inherits that fallback through `iterate` and must not add a second assumption about the contract.
- **Forgejo support is assumed absent for all three operations.** No `tea` capability check was run
  for check status, watching, or merging. The plan therefore declares all three `false` for Forgejo;
  if the adapter check during implementation shows otherwise, enabling them is an additive change
  that does not alter the tool source.
- **The `gh` surface is verified, its version is not pinned.** `gh pr checks` was confirmed on this
  machine to offer `--watch`, `--interval`, `--required`, `--json`, and the documented exit code 8
  for pending checks. The plan does not add a minimum `gh` version guard; if an older `gh` lacks
  `--watch`, the capability probe must report `pr-checks-wait` as unsupported rather than building a
  plan that fails at runtime.
- **"An automatic reviewer has run" is approximated by a comment or review newer than the head
  commit.** Emoji reactions are not readable through the helper. The consequence of the
  approximation is a timeout and a report, never an unjustified merge.
- **The bot registry is empty by default,** so an unconfigured project gets the check gate and the
  human guard but no bot round. Populating it is a setup decision, not a code change.
- **Concurrent gate runs on the same pull request are out of scope.** The SHA guard makes the
  second merge fail closed; a proper lock is not planned.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         1 |    0 |

### Findings

The deep interactive review resolved four decision-requiring points; they are recorded here as
incorporated findings rather than as open points.

- **Architecture, important — the claimed phase order was unenforceable as first drafted.**
  `iterate` Phase 2 classifies every unaddressed thread plus the free text, so a delegation intended
  to repair only a failing check would have silently implemented every open bot finding as well,
  making "checks first, then bot notes" descriptive rather than binding. Resolved by adding an
  optional item filter to `iterate` (free-text-only, or an explicit thread-ID list) and by requiring
  a test that a filter matching nothing yields an empty run instead of falling back to all items.
- **Scope, important — "all checks green" and the forge's merge state were conflated.** The first
  draft let the forge merge state decide alone, which only enforces the checks branch protection
  marks as required and would merge with a red optional check. Resolved by
  `prReview.requireAllChecks` (default `true`), with the forge merge state kept as an additional
  necessary condition.
- **Error cases, important — the human-comment guard was too blunt.** Blocking every commit would
  have left a pull request with an open human comment and a red check unrepairable, contradicting
  the requirement's own first step. Resolved by scoping the guard to review-driven implementation
  and the merge, leaving CI repair permitted. The narrowing is deliberate and is called out in the
  architecture decisions and the manual validation sequence.
- **Architecture, important — a prompt-driven poll loop would have burned tokens for no
  information.** Resolved by the blocking `pr-checks-wait` operation wrapping the provider's own
  watch, with an explicit no-fallback-to-polling rule: on timeout or missing capability the tool
  reports and asks once.
- **Architecture, important — the configuration namespace `prReview.*` sits next to the unrelated
  pre-existing `delivery.prReview`.** The configuration table is a flat, alphabetically readable
  dotted-key list, so `delivery.prReview` (publish this run's findings after a delivery) and
  `prReview.completion` (may this gate run merge) end up visually adjacent while meaning entirely
  different things. Deliberately accepted so the keys match the tool name, and mitigated instead of
  renamed: the acceptance criteria require an explicit disambiguating sentence in
  `docs/user-guide/configuration.md`, and the setup wizard presents the two in separate steps.
  Renaming `delivery.prReview` would be a breaking configuration change for existing projects and is
  out of scope here.
- **Scope, important — the tool writes to Git exactly once itself.** The base-into-head merge for a
  `BEHIND` branch is the single Git write outside `iterate`, and it is the one place where the "no
  second implementation path" decision is broken. It is bounded to a merge commit plus a normal
  push, must complete before any delegation, and is covered by an explicit acceptance criterion that
  the tool source states this boundary. Reviewers should scrutinize this seam first.
- **Testability, important — the phase logic is prompt text and cannot be unit-tested.** Only the
  helper operations and the structural contracts are machine-verifiable. The acceptance criteria
  therefore pin what can be pinned (command plans, normalization, dry-run, capability flags, marker
  distinctness, group registration) and the validation plan adds a scripted manual smoke sequence
  covering the report, guarded, and merge scenarios plus the wait behavior. Do not mistake a green
  `pnpm test` for a verified gate.
- **Maintainability, important — a third marker raises the marker contract's cost.** Two markers
  already carry exact-string idempotency semantics across `iterate` and the publication fragment;
  the third multiplies the pairwise rules. Mitigated by a contract test asserting pairwise
  distinctness and by documenting all three in one place in `src/shared/pr-review-comments.md`
  rather than in each consumer.
- **Architecture, note — the tool depends on `iterate`'s approval gate semantics.** `iterate` skips
  its Phase 2.5 approval when delegated non-interactively. The tool must pass its own run state
  through, so a gated run still gets one item approval per round and a delegated run does not hang.
  This is why `src/shared/documentation-sync-contract.md` line 65 must also learn the new tool.
- **Security, note — the tool must never approve a pull request to unblock a merge.** A protected
  branch requiring an approval is reported, never satisfied by Effective Flow. The existing rule in
  `src/shared/pr-review-comments.md` already forbids approve submissions; the new merge path must
  not introduce a way around it.
- **Error cases, note — the bounded waits can mask a genuinely stuck pull request.** Every timeout
  path ends in a report naming the exact unmet condition, and `prReview.maxRounds` caps the total
  work. Verify during implementation that no path can loop past that cap, in particular that a bot
  round which triggers an implementation and restarts Phase 2 consumes a round rather than resetting
  the counter.
- **Scope, note — the tool name `pr-review` collides in prose with the central `pr-review` skill.**
  Technically distinct namespaces (an Effective Flow tool versus a host skill), but the sources will
  read "`pr-review` delegates its judgment to `pr-review`". Deliberately accepted per the user's
  naming choice; the sources must always qualify which of the two is meant.

## Test results

All four project-configured checks pass from the delivery worktree:

| Check                    | Result                                    |
| ------------------------ | ----------------------------------------- |
| `node build.mjs`         | pass — 19 exposed tools, all build guards |
| `node --test`            | pass — 421 of 421                         |
| `pnpm agent:check`       | pass — 262 files correctly formatted      |
| `pnpm test:distribution` | pass — offline archive and layout checks  |

The suite grew from 396 to 421 cases: 17 in `test/remote-tracker.test.mjs` for the three new
operations, the runner bound and the forced-kill escalation, and 8 in
`test/workflow-contracts.test.mjs` for the tool registration, the three-marker separation, the
`iterate` item filter, the tool's Git write boundary, the configuration keys and the skill-ownership
entry.

**Still outstanding — cannot be run from this workflow:** the manual smoke tests of the validation
plan (a `report` run and a `merge` run against a real pull request with real CI), the manual wait
check, and the manual dry-run check. They require a live pull request and are the only part of the
validation plan this run could not execute. Nothing in the machine-verifiable set stands in for
them, and the merge path in particular has never been exercised end to end against GitHub.

## Review findings

**Date:** 2026-07-28
**Reviewer:** `effective-flow-nodejs-reviewer` (Node.js runtime),
`effective-flow-generic-product-reviewer` (prompt sources, reduced-depth generic review)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    28 |
| Open / Not implemented |     0 |

| Severity  | Count | Fixed | Open |
| --------- | ----: | ----: | ---: |
| Critical  |     1 |     1 |    0 |
| Important |    15 |    15 |    0 |
| Note      |    12 |    12 |    0 |

| Complexity | Count |
| ---------- | ----: |
| Low        |    23 |
| Medium     |     5 |
| High       |     0 |

No external review report was written, because no finding remained open or unimplemented.

The one critical finding is worth naming here, because it was a defect in this plan's own contract
rather than only in its implementation: the check phase contained a backward jump that re-entered
the wait and repair steps _without_ consuming a round, so `prReview.maxRounds` was unenforceable and
the tool could have pushed an unbounded number of automated commits onto a pull request. The plan's
own review had asked for exactly this to be verified. A round now runs forward only; any re-entry
ends the round and starts a new one.

Three further findings were contradictions this plan carried into the sources and that the reviews
surfaced: an unqualified "never squash" that would have made the tool's terminal action unreachable
under the default `delivery.mergeMethod: squash`; an empty check list satisfying "every check is
green" vacuously, which could have merged a commit whose CI never ran; and the undefined meaning of
`report` mode, resolved in the architecture decisions above.

## Open points

- No open points.

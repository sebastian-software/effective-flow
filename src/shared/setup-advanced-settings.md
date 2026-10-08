## Guided advanced settings

This fragment is loaded only when the Guided `Advanced` question of Step 5 was answered `Yes`.
Step 5 in `{{SKILL:setup}}` keeps that question, its `No` branch, and "Collapsing two
`mergeGate.bots` spellings of one reviewer", which Express and every Step 6 write run as well.

Ask for each key block by block, each with a short explanation, the valid values from the config
schema in `{{SKILL:setup}}`, and the current config value or default as the pre-selection:

1. `review`: `review.profile` (full/focused/fast — depth of the review), `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `language`: the project language and seven overrides already asked in Step 4 — carry over
4. `plan` (skipped in hidden mode, whose directories are forced): `plan.dir` (free text, default `docs/plan` — directory of the plan files) and
   `concept.dir` (free text, default `docs/concept` — directory of the concept files). Both are
   canonicalized before they are written; reject values that resolve to the same directory or nest
   one inside the other instead of writing them.
5. `delivery`: `delivery.baseBranch`, `delivery.completion`, and `delivery.prReview` (already asked in Step 4 — carry over), `delivery.branchPrefix`, `delivery.returnBranch`, `delivery.mergeMethod` (squash/merge/rebase, default `squash` — how a pull request is integrated when the merge gate in block 9 merges it; with `squash` the pull-request title becomes the commit subject and therefore the release signal)
6. `worktree`: `worktree.enabled` (already asked in Step 4 — carry over), `worktree.setup`, `worktree.baseDir`
7. `tracker` (skipped in hidden mode, whose tracker is forced to `local`): `tracker.mode` (already asked in Step 4 — carry over), `tracker.remoteToolOverride` (auto/github/forgejo, forge only), `tracker.externalTool` and `tracker.externalToolHint` (free text; required identifier plus optional connection hint for `mode: external`, carried over when already asked in Step 4), and the freshly verified nullable `tracker.externalStartedState` and `tracker.externalDoneState` (the latter terminal and writable, read by the merge gate's offered post-merge transition and by its post-merge observation of an already-terminal issue). Re-run state discovery before changing either; never accept arbitrary free text or a display-name-only match.
8. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (global lists) as well as – as an advanced option – `skills.agents.<name>` and `skills.tools.<name>` for individual agents/tools. Additionally offer optionally (do not force) to materialize the built-in per-agent and per-tool recommendations visibly into the config as `skills.agents.<name>.include` or `skills.tools.<name>.include`; for a fallback recommendation (`effective-web › impeccable › frontend-design`), write only the **primary** skill (`effective-web`) — the built-in fallback stays active. Flat recommendations (e.g. `effective-delivery`) are carried over unchanged.
9. `mergeGate` – the **merge gate** of `{{SKILL:merge-gate}}`, asked as its own block: see below.
10. `executionProfiles`: the field-pilot opt-in `executionProfiles.fast.enabled` (strict Boolean) and its confirmed baseline-start and resume actions, owned by the fragment below; activation is automatic in `{{SKILL:build}}`. Profile and Express never ask this block and preserve an existing value.

```lazy-include
setup-execution-profiles
when: the user chose the advanced settings and block 10 (`executionProfiles`) is being asked
```

Anyone who wants the former "fast solo workflow" sets, for example, `review.profile: fast`,
`review.validation: quick`, and `applyReview.finalValidation: changedScope` here.

Note: `applyReview.worktree.*` (apply-review's own worktree mechanism), the top-level `worktree.*` block (execution location), and the top-level `delivery.*` block (delivery branch/completion) are separate, independent config paths — do not confuse them when asking and merging. The same applies to `delivery.prReview` (publish this run's findings after a delivery) and the `mergeGate.*` block (the merge gate): the rename removed the shared name, but a retired `prReview.*` row may still stand in an ADR, so keep the two apart — `delivery.prReview` belongs to the `delivery` block, is never part of a legacy merge-gate block, and is never migrated.

Ask for free-text values (e.g. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir`, or an explicit `setup` command) as free text. On invalid input for an enumerated key, ask again or use the default and report that. In hidden mode, `delivery.branchPrefix` defaults to empty (branches then read `<skill>/<slug>`), and a value containing `effective-flow` in any letter case is rejected: ask again, or keep the empty default and report that.

### Block 9: the merge gate (`mergeGate.*`)

Ask this block **separately** from the `delivery.prReview` question of Step 4 and say so, because
this block was itself named `prReview.*` in an earlier generation and the two mean entirely
different things:

- **`delivery.prReview`** (Step 4) decides whether a run posts **its own review findings** onto a
  pull request it just created. It keeps its name and is untouched by the rename.
- **`mergeGate.*`** (this block) configures the tool that takes an **existing** pull request from
  open to merged: it waits for the checks, has failures repaired, evaluates the notes of the
  configured automatic reviewers, refuses to implement or merge while a comment from an account
  that is neither a bot nor the one it runs as is open, and finally merges. If the project still
  carries these keys as `prReview.*`, show the recorded `prReview.*` values as the current ones and say
  that Step 6 migrates the block.

Explain first, then ask. The gate is safe without any of these keys, so "keep the defaults" is a
perfectly good answer.

```ask
when: the user chose the advanced settings and the merge gate block is being asked
header: Merge gate
question: When the merge gate has verified a pull request, may it merge, or should it only report?
options:
  - label: Ask each time
    description: mergeGate.completion = ask (default) — a gated run asks once per pull request
  - label: Merge
    description: mergeGate.completion = merge — merge as soon as every precondition holds
  - label: No merge
    description: mergeGate.completion = report — the gate still repairs failing checks, answers bot threads, and resolves a conflict with the base by pushing one merge commit; it only never merges the pull request. mergeGate.conflictResolution = off is the switch for a run that makes no commit and no push at all
```

Then ask for the remaining keys, each with a short explanation, the valid values, and the current
value or default as the pre-selection:

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.conflictResolution`   | `off`, `ask`, `auto`               | `auto`    |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `10`      |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

- `mergeGate.conflictResolution`: what a gate run does when the head branch conflicts with its base.
  `auto` (the default) has the conflict resolved by the gate's dedicated worker, the result verified
  independently, and one ordinary merge commit pushed — the branch moves forward instead of the run
  ending at the conflict. `off` reports the conflict and makes no commit and no push, which is
  exactly the outcome the gate produced on the branch before this key existed — it still provisions
  and cleans up a local checkout. `ask` asks once **per conflicted round** in a gated run — once per
  conflict, not once per run as `mergeGate.completion` does, because each round's conflict is a new
  one — and behaves as `off` in a non-interactive delegated one. Say when asking that the default
  **changes** behavior for
  a project upgrading from an earlier generation, and that `off` restores the previous behavior
  exactly. No earlier generation wrote a `prReview.conflictResolution` row; one that exists anyway is
  retired like any other `prReview.<key>` row and carried over to this key.
- `mergeGate.requireAllChecks`: `true` (default) requires **every** check to be green; `false` falls
  back to the checks the forge itself marks as required — useful for a project with a permanently
  red optional check.
- `mergeGate.checkWaitMinutes`, `mergeGate.botWaitMinutes`: how long a single wait for the checks or
  for an automatic reviewer may take before the run reports instead of waiting longer.
- `mergeGate.maxRounds`: how many repair rounds one run may spend in total before it ends with a
  report instead of a merge.
- `mergeGate.bots`: the logins of the automatic reviewers this project expects (e.g.
  `greptileai[bot]`), as a comma list. Empty (the default) means no automatic reviewer is expected
  and the bot round is skipped rather than blocking the merge forever. Either spelling of a bot
  login works — `greptileai[bot]` as GitHub's UI shows it, or the bare `greptileai` — because the
  gate resolves a configured login through "Matching a configured login", which tolerates the
  trailing `[bot]` on either side for an account the forge reports as a bot. Listing both spellings
  is therefore redundant rather than a
  workaround, and the gate reports the collapse when it sees one — collapse such entries as Step 5's
  "Collapsing two `mergeGate.bots` spellings of one reviewer" describes **before** asking the two
  follow-up questions.
- `mergeGate.bots.<login>.trigger`: free text, the literal comment that re-triggers exactly that bot
  (e.g. `@greptileai`). Ask for it once per **reviewer** left after that collapse, never once per
  configured login. A login containing brackets is a valid middle segment, because the table encoding
  splits on `.` only. Say when asking that this should be a **distinctive mention** such as
  `@greptileai`, not generic prose such as `please review`, because the literal string does two jobs.
  It has to actually summon that reviewer — generic prose mentions nobody and the round then waits
  for output no one requested. And the gate suppresses a duplicate trigger by comparing this exact
  text, trimmed, against the comments its own account already left on the current head; in manual
  mode that account is the operator's own, so a phrase the operator might type by hand reads as a
  trigger already posted and the reviewer is waited for instead of summoned.
- `mergeGate.bots.<login>.check`: free text, the commit-status context or check-run name that this
  reviewer publishes against a head commit (e.g. `recensor/review`). Ask for it once per **reviewer**
  as well, directly after that reviewer's trigger text, and offer "not set" as the answer —
  it is optional and unset by default. Explain what it buys: with a check context the gate and
  `{{SKILL:iterate}}` can tell a reviewer that is **still running** from one that has **not started**,
  so a running reviewer is waited for instead of triggered a second time. Without it both fall back
  to comparing the reviewer's newest comment against the head commit, which cannot see a reviewer
  that edits one sticky comment in place. Leave it unset only for a reviewer that publishes no check
  context at all, and do not infer that from an emoji acknowledgment: Greptile acknowledges a trigger
  with a reaction **and** publishes a `Greptile Review` check, so it is a reviewer that wants a
  configured `.check` rather than the fallback. Say how to observe it: open a recent pull request the
  reviewer has already reviewed and read its **checks list** – the reviewer's entry stands there
  under exactly the name to configure here. When in doubt, configure it. The two mistakes are not
  symmetric: a wrongly set context is named in the gate's own block and is corrected the moment it
  blocks, while an omitted one leaves the reviewer on the fallback and can never be reported at all.

`delivery.mergeMethod` (block 5) decides **how** the gate merges; it stays in the `delivery` block
because it is a property of this project's delivery, not of the gate.

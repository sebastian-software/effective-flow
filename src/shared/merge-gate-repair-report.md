## Repair-progress report

`{{SKILL:merge-gate}}` loads this fragment in Phase 6 when its repair state carries a stop. Build the
block now, before step 1 deletes the wisdom file, from the stop's `report` data the helper returned
and the wisdom file's round records – never from a delegated return's prose – and report it in
step 2's summary in place of a merge result.

- **Why the run stopped**, by `report.stop.reason`: two verified ineffective repairs of one reviewer
  cause (`ineffective-repairs`), a declared scope expansion (`scope-expansion-declared`), a committed
  one (`scope-expansion-committed`), a returned commit without exactly one parent (`merge-commit`),
  a post-check read that could not be made (`post-check-undetermined`), a foreign commit outside the
  scope, without exactly one parent or not readable (`foreign-commit-unverified`, naming each in
  `report.stop`), or a return without a parseable `Scope expansion:` line (`scope-line-missing`).
- **The unresolved cause and its reviewer**: the configured login, the durable key – thread ID with
  its comment URL, or review id and finding ordinal with the review URL – and the head it was last
  reported on.
- **Every observed repair attempt**: its round, the head before and after it, its returned SHAs, and
  its outcome – ineffective, resolved, or still open.
- **The waits and base changes in between**, in order from `report.timeline`: CI, bot and review
  waits, review resubmissions, and every gate base merge with its SHA. Where a base merge lay
  between an attempt and the observation that judged it, say so; that observation still counted.
- **Foreign commits**: every SHA attribution found that was neither returned nor a gate base merge,
  with its round. Those rounds counted no attempt.
- **Out-of-scope paths with their SHAs**: every declared expansion with the durable key or repair it
  was minted for, and every committed path outside the scope with its commit. Pushed commits stay on
  the pull request branch, unreverted and without a force push.
- **The decision the maintainer needs to make**, from `report.maintainerDecision`, as one direct
  question: `choose-repair-approach` – fix the cause by hand, change the approach, or set the finding
  aside; `authorize-scope-expansion` – allow the named paths and re-run the gate, or keep the repair
  out of this pull request; `review-returned-merge-commit` and `verify-returned-commits` – inspect
  the named commits before any further automatic repair.

A new gate invocation starts with fresh counters and reads the scope again before its first
delegation; say so, so the maintainer knows a re-run is not a resume of this stop.

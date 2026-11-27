## Superseded preserved plans in cleanup

A `worktree:` item with `proof: "preserved-plan-superseded"` is a kept `issue-planning` worktree
(`aborted`, reason `plan-preserved`) whose only dirty entry is its preserved plan `planPath`, and
whose base `origin/<baseRef>` at `baseCommit`, read from the local remote-tracking ref without a
fetch, holds the Implemented archive copy `archivePath`. `match` says where every preserved byte
stays recoverable:

- `completion-prefix`: from `archivePath`, which is the preserved text, its status aside, at most
  extended by a `## Build completion` or `## Workflow-Abschluss` section.
- `blob-history`: from the base history, which holds the preserved file itself.

**Dry run (Phase 4):** list each item with its worktree path, `planPath`, `archivePath`, `baseRef`
with `baseCommit`, and `match`. State that confirming discards exactly that untracked plan file,
recoverable as `match` says but no longer from the worktree, and that each proof runs again under
its lifecycle lock right before the discard.

A blocked kept planning worktree with `supersededPlan.reason` stays retained; its safe next step:

| Reason                    | Meaning and safe next step                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive-missing`         | the base holds no archive copy of the same name: the plan is not implemented yet; follow cleanup Phase 6                                                                               |
| `archive-not-implemented` | the archive copy is not canonically Implemented, or larger than 512 KiB: finish or correct that plan on the base, then rerun                                                           |
| `content-diverged`        | the preserved copy has no single open status line, is not valid UTF-8, or was revised before archiving: diff the two copies; one differing only by formatting can be discarded by hand |
| `dirty-entries`           | the worktree holds more than its plan (a batch pass keeps several plans): move each plan out or discard it, then rerun                                                                 |
| `not-plan-file`           | the one entry is not an issue plan directly in `plan.dir`: inspect it and move or discard it yourself                                                                                  |
| `unsafe-plan-file`        | the plan path is a symbolic link, not a regular file, larger than 512 KiB, or escapes the worktree: inspect it and decide yourself                                                     |
| `base-unavailable`        | no local `origin/<base>` ref, no usable `delivery.baseBranch` or `plan.dir`: fetch the base or repair the setting, then rerun                                                          |
| `hidden-mode`             | the proof never runs in hidden mode: move or discard the plan yourself, then rerun                                                                                                     |
| `proof-unavailable`       | a proof Git call failed or the proof budget ran out: rerun cleanup                                                                                                                     |

**Apply outcomes:** an `ok` item names `discardedPlan` with the branch outcome; a `restored` item
follows the lifecycle outcome table. A `REMOVE_FAILED` item with `quarantine` kept a plan that
changed or could not be verified in quarantine: inspect it before removing it yourself. One with
`discardedPlan` and a failed condition 7 kept the worktree: the plan stays recoverable as `match`
says; clear the reported blocker and rerun cleanup.

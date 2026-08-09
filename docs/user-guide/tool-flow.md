# Tool flow

After a completed run, Effective Flow closes its report with a small block naming **up to two**
concrete ways to continue – the most likely one first – each stated as a copy-paste-ready
invocation with this run's real arguments (the actual plan path, the actual pull-request number,
the actual report path) and a short note on what that tool would do from here.

This page explains where that block comes from, when it stays silent, and lists every tool's
possible follow-ups in one table.

## When you see it

The block is the **last** element of a run's report, appended after everything else – it never
replaces the report itself. Only the tool you actually invoked emits it, and only once: if that
run delegates internally to another Effective Flow workflow and gets the result back (for
example `apply` delegating to its internal issue-implementation workflow), only the outer run you
called prints the block. A **handoff**, where a tool hands the rest of the run to another tool
that then finishes in front of you, works the other way round – only the tool that actually
closes the run emits it. Either way, you only ever see one block per run.

## Why a recommendation is sometimes missing

Effective Flow only names an invocation it can back with a real argument from this run. If the
run's end state does not match any of the situations below, or the argument a follow-up would
need (a plan path, a PR number, an issue number) simply does not exist, the block is left out
entirely rather than filled with a guess. A wrong recommendation costs you more than no
recommendation.

These end states are deliberately silent for that reason:

- **`/effective-flow setup`** with nothing staged – there is nothing for `commit` to pick up.
- **`/effective-flow cleanup`** with an empty report – nothing was found to carry over, delete, or
  refer on to `setup`.
- **`/effective-flow investigate`** that found no bug, deliberately no action, or a pending product
  decision – the documentation row covers a documentation gap, never a non-finding.
- **A delivery that merged** its branch instead of retaining it, in `apply`, `build`, `fix`,
  `refactor`, `docs`, `maintain`, and `iterate` – the checkout is back on the base branch, so there
  is no head a pull request could be opened from.
- **`/effective-flow commit`** with nothing staged, a commit a hook blocked, or a commit on the base
  branch itself.

## Chat only

The block only ever appears in the conversation. It is never written into a pull-request
comment, an issue comment, a commit message, or any other file – so it never shows up on GitHub,
Forgejo, or in a tracked artifact.

## The table

Find the row for the tool you ran and the condition that matches how it ended. `Then` is the
first, more likely option; `Or` is the second, and an em dash means the row deliberately carries
only one. Fill every `<...>` placeholder with the run's actual state.

| Tool          | Condition                                           | Then                                         | Or                                              |
| ------------- | --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `concept`     | deep review declined                                | `/effective-flow review <concept-file>`      | —                                               |
| `concept`     | deep review done, ready                             | `/effective-flow plan <work package>`        | `/effective-flow review <concept-file>`         |
| `concept`     | deep review done, open points remain                | `/effective-flow review <concept-file>`      | —                                               |
| `investigate` | defect with a clear cause                           | `/effective-flow fix <report>`               | `/effective-flow plan <report>`                 |
| `investigate` | structural problem                                  | `/effective-flow refactor <report>`          | `/effective-flow plan <report>`                 |
| `investigate` | missing functionality                               | `/effective-flow build <report>`             | `/effective-flow plan <report>`                 |
| `investigate` | pure documentation gap or behavior to be documented | `/effective-flow docs <report>`              | —                                               |
| `plan`        | deep review declined                                | `/effective-flow apply <plan-file>`          | `/effective-flow review <plan-file>`            |
| `plan`        | deep review done                                    | `/effective-flow apply <plan-file>`          | `/effective-flow plan <plan-file>`              |
| `open-plans`  | at least one open plan                              | `/effective-flow apply`                      | —                                               |
| `plan-issue`  | released                                            | `/effective-flow apply #<issue>`             | `/effective-flow plan-issue <issue>`            |
| `plan-issue`  | retained for planning                               | `/effective-flow plan-issue <issue>`         | —                                               |
| `apply`       | plan clarity gate failed                            | `/effective-flow plan <plan-file>`           | `/effective-flow review <plan-file>`            |
| `apply`       | findings applied, PR opened                         | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <remaining source>`      |
| `apply`       | findings applied, delivery branch retained, no PR   | `/effective-flow pr`                         | `/effective-flow apply <remaining source>`      |
| `apply`       | issues processed, PR opened                         | `/effective-flow merge-gate <PR>`            | `/effective-flow plan-issue <skipped issue>`    |
| `apply`       | issues skipped, no PR                               | `/effective-flow plan-issue <skipped issue>` | —                                               |
| `build`       | PR opened                                           | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `build`       | delivery branch retained, no PR                     | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `fix`         | PR opened                                           | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `fix`         | delivery branch retained, no PR                     | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `refactor`    | PR opened                                           | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `refactor`    | delivery branch retained, no PR                     | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `docs`        | PR opened                                           | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `docs`        | delivery branch retained, no PR                     | `/effective-flow pr`                         | —                                               |
| `maintain`    | PR opened                                           | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <offloaded report>`      |
| `maintain`    | delivery branch retained, no PR                     | `/effective-flow pr`                         | `/effective-flow apply <offloaded report>`      |
| `iterate`     | PR mode                                             | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `iterate`     | local mode, delivery branch retained                | `/effective-flow pr`                         | —                                               |
| `review`      | local report written                                | `/effective-flow apply <report>`             | —                                               |
| `review`      | published to a tracker                              | `/effective-flow apply #<epic>`              | `/effective-flow apply <local security report>` |
| `review`      | plan file mode, ready                               | `/effective-flow apply <plan-file>`          | —                                               |
| `review`      | plan file mode, open points remain                  | `/effective-flow review <plan-file>`         | `/effective-flow plan <plan-file>`              |
| `review`      | concept file mode, ready                            | `/effective-flow plan <work package>`        | —                                               |
| `review`      | concept file mode, open points remain               | `/effective-flow review <concept-file>`      | —                                               |
| `review`      | pull-request mode                                   | `/effective-flow merge-gate <PR>`            | `/effective-flow iterate <PR>`                  |
| `commit`      | commit created on a non-base branch                 | `/effective-flow pr`                         | —                                               |
| `pr`          | always                                              | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `merge-gate`  | blocked by review notes                             | `/effective-flow iterate <PR>`               | `/effective-flow merge-gate <PR>`               |
| `merge-gate`  | merged                                              | `/effective-flow open-plans`                 | —                                               |
| `setup`       | staged changes exist                                | `/effective-flow commit`                     | —                                               |
| `cleanup`     | staged removals exist                               | `/effective-flow commit`                     | `/effective-flow setup`                         |
| `cleanup`     | config values referred to setup                     | `/effective-flow setup`                      | —                                               |

## Reading the map

Most runs live on one spine: **`plan` → `apply` → `merge-gate`**. `plan` turns a requirement into
an implementable plan file and recommends revising it further or handing it to `apply`; `apply`
implements it and, once a pull request is open, recommends `merge-gate`; `merge-gate` either
merges (and points you back at `open-plans` for what's next) or sends you to `iterate` when review
notes block it. Everything else in the table – `investigate`, `concept`, `plan-issue`,
`open-plans`, the direct implementation tools (`build`, `fix`, `refactor`, `docs`, `maintain`),
`review`, `commit`, `pr`, `setup`, and `cleanup` – feeds into that same spine from a different
entry point or closes a smaller loop around one of its stops.

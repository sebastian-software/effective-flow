# Tool flow

After a completed run, Effective Flow closes its report with a small block naming **up to two**
concrete ways to continue – the most likely one first – each stated as a copy-paste-ready
invocation with this run's real arguments (the actual plan path, the actual pull-request number,
the actual report path) and a short note on what that tool would do from here.

This page explains how the run selects a next step from its associated plan, when it stays silent,
and which generic follow-ups apply when that plan supplies no usable candidate.

## When you see it

The block is the **last** element of a run's report, appended after everything else – it never
replaces the report itself. Only the tool you actually invoked emits it, and only once: if that
run delegates internally to another Effective Flow workflow and gets the result back (for
example `apply` delegating to its internal issue-implementation workflow), only the outer run you
called prints the block. A **handoff**, where a tool hands the rest of the run to another tool
that then finishes in front of you, works the other way round – only the tool that actually
closes the run emits it. Either way, you only ever see one block per run.

## How the next step is selected

Effective Flow first checks the authoritative plan associated with this run: the local plan you
supplied or the canonical planning comment of a verified associated issue. It uses explicit input
or an established link retained by the workflow, such as a source plan or a validated issue
lifecycle receipt. It never chooses an unrelated plan because it is newest, matches a title, or
appears in arbitrary pull-request prose.

The run compares that plan with verified outcomes and skips completed packages. Your explicit
instructions, unfinished delivery or review, dependencies, and approval requirements take priority
over advancing to a later package. Otherwise, the next applicable unfinished package normally
leads, using an existing tool and a real plan or issue reference. A recommendation grants no
approval and starts no work.

If the planning record needs clarification or has fallen behind verified completed work, the
recommendation is preparation through `/effective-flow plan <known-plan-path>` or
`/effective-flow plan-issue <known-issue>`. An implemented or archived plan that appears to contain
unfinished work needs that reconciliation; it is never passed back to `apply` as an active basis.
An independently verified active successor can supply the execution basis instead. Operational work
without a matching tool needs useful preparation or a named blocker.

For example, if an issue still describes completed Q2a work and Q2b needs preparation, the next
step is `plan-issue` on that same issue to reconcile Q2a and prepare Q2b. An intentionally open
parent issue for later packages does not by itself justify repeating a completed merge gate.

Selection is read-only and limited to the associated context. Fresh complete plan/issue results
already read by the run are reused; the bounded open-points quotation in a merge report is not a
complete planning basis. Additional reads are limited to one local artifact read per known handle,
or one issue read and one comment read per associated issue through the established connection.
Failed or unsupported reads are not retried just for advice. Hidden mode uses local context only;
unavailable tracker context never changes the target or starts connection setup. Selection changes
no plan status, tracker state, or file. Issue references retain their owning repository or external
target, but every invocation must satisfy the tool's existing argument and target restrictions in
the already established owning context. A full URL is usable only where that tool accepts it;
preserving identity grants no cross-repository routing. Otherwise, the report names the limitation
and offers a valid fallback or no option, without establishing a new repository context or connection.

## Why a recommendation is sometimes missing

Effective Flow only names an invocation it can back with a real argument from this run. If the
associated planning context is missing, unreadable, ambiguous, malformed, or too stale to reconcile,
the report briefly names that limitation and uses only an applicable generic fallback below.
If neither the plan nor the fallback supplies valid unfinished work with the required arguments,
the block is left out. Completed work and a branch that no longer exists are never candidates.
An optional second choice must be independently applicable and compatible with the first.

The same rule applies to review findings: `apply` is shown only when the current run actually wrote
an admitted report or direct finding issue and can name it. A current-scope, closed, uncertain,
deduplicated, or eligible-but-not-written observation produces no recursive substitute.

Aborted runs name their blocker instead. These end states also stay silent, even with an associated
plan; they read no optional planning context:

- **`/effective-flow setup`** with nothing staged – there is nothing for `commit` to pick up.
- **`/effective-flow cleanup`** with an empty report – nothing was found to carry over, delete, or
  refer on to `setup`.
- **`/effective-flow investigate`** that found no bug, deliberately no action, or a pending product
  decision – the documentation row covers a documentation gap, never a non-finding.
- **`/effective-flow commit`** with nothing staged, a commit a hook blocked, or a commit on the base
  branch itself.

A delivery that merged its branch in `apply`, `build`, `fix`, `refactor`, `docs`, `maintain`, or
`iterate` has no generic fallback row: there is no remaining branch from which to open a pull
request. It can still recommend an unfinished package from its verified associated plan.

## Chat only

The block only ever appears in the conversation. It is never written into a pull-request
comment, an issue comment, a commit message, or any other file – so it never shows up on GitHub,
Forgejo, or in a tracked artifact.

## The generic fallback table

After checking the associated plan, use a row for the tool you ran only when its condition describes
actual unfinished work. This table is a validated fallback map; it does not list every possible
plan-driven continuation. `Then` is the first option; `Or` is the second, and an em dash means the
row carries only one. Fill every `<...>` placeholder with the run's actual state.

The merged-but-linked-issues-open row applies only when observer-only `merge-gate` re-entry can
address actual unfinished reconciliation. A parent intentionally kept open for later packages does
not qualify by itself. The general merged row is omitted when there is no open local plan to list;
that does not suppress a valid candidate from the associated plan or issue.

| Tool          | Condition                                                    | Then                                         | Or                                              |
| ------------- | ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------- |
| `concept`     | deep review declined                                         | `/effective-flow review <concept-file>`      | —                                               |
| `concept`     | deep review done, ready                                      | `/effective-flow plan <work package>`        | `/effective-flow review <concept-file>`         |
| `concept`     | deep review done, open points remain                         | `/effective-flow review <concept-file>`      | —                                               |
| `investigate` | admitted defect with a clear cause                           | `/effective-flow fix <report>`               | —                                               |
| `investigate` | admitted structural problem                                  | `/effective-flow refactor <report>`          | —                                               |
| `investigate` | admitted missing functionality                               | `/effective-flow build <report>`             | —                                               |
| `investigate` | admitted pure documentation gap or behavior to be documented | `/effective-flow docs <report>`              | —                                               |
| `plan`        | deep review declined                                         | `/effective-flow apply <plan-file>`          | `/effective-flow review <plan-file>`            |
| `plan`        | deep review done, ready                                      | `/effective-flow apply <plan-file>`          | `/effective-flow plan <plan-file>`              |
| `plan`        | deep review done, open points remain                         | `/effective-flow review <plan-file>`         | `/effective-flow plan <plan-file>`              |
| `open-plans`  | at least one open plan                                       | `/effective-flow apply`                      | —                                               |
| `plan-issue`  | released                                                     | `/effective-flow apply #<issue>`             | `/effective-flow plan-issue <issue>`            |
| `plan-issue`  | retained for planning                                        | `/effective-flow plan-issue <issue>`         | —                                               |
| `apply`       | plan clarity gate failed                                     | `/effective-flow plan <plan-file>`           | `/effective-flow review <plan-file>`            |
| `apply`       | findings applied, PR opened                                  | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <remaining source>`      |
| `apply`       | findings applied, delivery branch retained, no PR            | `/effective-flow pr`                         | `/effective-flow apply <remaining source>`      |
| `apply`       | issues processed, PR opened                                  | `/effective-flow merge-gate <PR>`            | `/effective-flow plan-issue <skipped issue>`    |
| `apply`       | issues skipped, no PR                                        | `/effective-flow plan-issue <skipped issue>` | —                                               |
| `build`       | PR opened                                                    | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `build`       | delivery branch retained, no PR                              | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `fix`         | PR opened                                                    | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `fix`         | delivery branch retained, no PR                              | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `refactor`    | PR opened                                                    | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <findings report>`       |
| `refactor`    | delivery branch retained, no PR                              | `/effective-flow pr`                         | `/effective-flow apply <findings report>`       |
| `docs`        | PR opened                                                    | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `docs`        | delivery branch retained, no PR                              | `/effective-flow pr`                         | —                                               |
| `maintain`    | PR opened                                                    | `/effective-flow merge-gate <PR>`            | `/effective-flow apply <offloaded report>`      |
| `maintain`    | delivery branch retained, no PR                              | `/effective-flow pr`                         | `/effective-flow apply <offloaded report>`      |
| `iterate`     | PR mode                                                      | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `iterate`     | local mode, delivery branch retained                         | `/effective-flow pr`                         | —                                               |
| `review`      | local report written                                         | `/effective-flow apply <report>`             | —                                               |
| `review`      | direct admitted findings published to a tracker              | `/effective-flow apply #<finding>…`          | `/effective-flow apply <local security report>` |
| `review`      | plan file mode, ready                                        | `/effective-flow apply <plan-file>`          | —                                               |
| `review`      | plan file mode, open points remain                           | `/effective-flow review <plan-file>`         | `/effective-flow plan <plan-file>`              |
| `review`      | concept file mode, ready                                     | `/effective-flow plan <work package>`        | —                                               |
| `review`      | concept file mode, open points remain                        | `/effective-flow review <concept-file>`      | —                                               |
| `review`      | pull-request mode                                            | `/effective-flow merge-gate <PR>`            | `/effective-flow iterate <PR>`                  |
| `deliver`     | PR opened                                                    | `/effective-flow merge-gate <PR>`            | —                                               |
| `commit`      | commit created on a non-base branch                          | `/effective-flow pr`                         | —                                               |
| `pr`          | always                                                       | `/effective-flow merge-gate <PR>`            | `/effective-flow review <PR>`                   |
| `merge-gate`  | blocked by review notes                                      | `/effective-flow iterate <PR>`               | `/effective-flow merge-gate <PR>`               |
| `merge-gate`  | merged but at least one linked issue is open or unobservable | `/effective-flow merge-gate <PR>`            | —                                               |
| `merge-gate`  | merged                                                       | `/effective-flow open-plans`                 | —                                               |
| `setup`       | staged changes exist                                         | `/effective-flow commit`                     | —                                               |
| `cleanup`     | staged removals exist                                        | `/effective-flow commit`                     | `/effective-flow setup`                         |
| `cleanup`     | config values referred to setup                              | `/effective-flow setup`                      | —                                               |

## Reading the map

Most runs live on one spine: **`plan` → `apply` → `merge-gate`**. `plan` turns a requirement into
an implementable plan file and recommends revising it further or handing it to `apply`; `apply`
implements it and, once a pull request is open, recommends `merge-gate`; `merge-gate` either
merges or sends you to `iterate` when review notes block it. After merging, the associated plan
guides the next step; `open-plans` remains a fallback when there are open local plans to list.
Everything else in the table – `investigate`, `concept`, `plan-issue`,
`open-plans`, the direct implementation tools (`build`, `fix`, `refactor`, `docs`, `maintain`),
`review`, `deliver`, `commit`, `pr`, `setup`, and `cleanup` – feeds into that same spine from a
different entry point or closes a smaller loop around one of its stops. `deliver` is the local
changes entry point: after it opens the confirmed multi-commit pull request, it points directly to
`merge-gate`.

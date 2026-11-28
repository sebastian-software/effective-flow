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

## Continuing toward the original outcome

Repeated runs retain the original outcome and acceptance criteria in a compact Outcome checkpoint
in the associated plan, existing issue comment, or retained handoff. Only its source-owning workflow
updates that state. Changing workflow, session or child issue does not restart the history; a
read-only review or recommendation returns a proposed update instead of writing the primary source.
If earlier history is unavailable, it stays `unknown` and receives one compact reassessment before
dependent continuation. Missing new metadata alone does not force a planning step.

After two consecutive bounded continuations without verified progress on the original acceptance
proof, the second return reassesses the approach before more optional work. A material expansion,
such as a new maintained component or trust boundary, triggers the same judgment immediately,
even when intermediate tests pass. The result is a finite next attempt allowance with observable
proof and a stop condition, a consequential decision for you, or a stop that leaves unfinished
acceptance visible. A justified allowance can cover more than one attempt without repeating the
same review; it ends when consumed or its assumptions change. Required safety and quality checks
remain binding throughout.

This decision applies before both plan-based and generic suggestions. A blocked continuation names
its blocker instead of suggesting another plan, review or issue to bypass it. Independent authorized
delivery can still be recommended. There is no new command or configuration switch, and advice
still starts no work and changes no source state.

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

Aborted runs name their blocker instead and recommend no next step, with one exception: a run that
aborts after it had already started a sub-agent for real work can still add `retro` as its only
option (see [When `retro` appears](#when-retro-appears)). These end states also stay silent, even with
an associated plan; they read no optional planning context:

- **`/effective-flow setup`** with nothing staged – there is nothing for `commit` to pick up. A
  `/effective-flow setup status` report is the exception when it found a problem setup can fix: it
  names one setup form per line, at most two, in the order `setup`, `setup hidden`, then a Targeted
  request, then `setup allowlist`; further forms or requests follow the same way, and bare `setup`
  appears only when the plain setup form is among them.
- **`/effective-flow cleanup`** with an empty report – nothing was found to carry over, delete, or
  refer on to `setup`.
- **`/effective-flow investigate`** that found no bug, deliberately no action, or a pending product
  decision – the documentation row covers a documentation gap, never a non-finding.
- **`/effective-flow commit`** with nothing staged, a commit a hook blocked, or a commit on the base
  branch itself.

A delivery that merged its branch in `apply`, `build`, `fix`, `refactor`, `docs`, `maintain`, or
`iterate` has no pull-request row: there is no remaining branch from which to open a pull request.
It can still recommend an unfinished package from its verified associated plan. When a merged
`build`, `fix`, `refactor`, or `maintain` delivery wrote a findings or offloaded report, it also
recommends `/effective-flow apply <report>`: after that package if there is one, otherwise first.

`/effective-flow open-plans` lists a plan whose file name exists both at the top level and in
`archive/` as a duplicate to resolve, and recommends nothing for it. A plan whose status is unclear
does get `/effective-flow plan <path>`, also when no plan is open.

After a merge, `merge-gate` considers its candidates in a fixed order: the next step from the
verified associated plan, the linked-issue reconciliation, that plan's review report when it still
holds an open finding (`/effective-flow apply <report>`), `open-plans`, then `retro`. The first two
that apply fill the two slots. A caller that knows the associated
plan passes it on; without a verified association the gate never searches for a report.

## When `retro` appears

After the next steps above are chosen, a run may add `/effective-flow retro` for the current
conversation. It appears only when the run's own report states one of four turbulence signals:

- **A repair round went wrong:** a repair round for a pull request ended with an abort, a refused
  CI-repair instruction, a second reply without the expected answer, or a review cause still open
  after its second repair attempt. A round that only waited for your approval, or that succeeded,
  does not count.
- **A delegated step needed recovery:** a helper had to be resumed once, or its result had to be
  requested again.
- **A merge-gate run needed repeated answers:** it asked you at least two of its exceptional
  questions, such as pending checks, unestablished reviews, a check-list waiver, a conflict
  resolution, or a set-aside finding.
- **A run aborted after real work started:** an abort after at least one helper had begun domain
  work. Aborts caused by a bad argument, setup, configuration, or a missing capability, and stops you
  initiated, never count.

A run that observed such a signal says so in one report line before the block; without that line
there is no signal. `retro` never appears when next steps are suppressed or the run is
non-interactive, and it never pushes out another recommendation: it takes the second slot when that
is free, or is the only option when nothing else applies. When both slots are taken, it is dropped.
After an abort the report names the blocker first and `retro` is the block's only option. Its note
names the basis only in general terms, for example the failed repair round, and never quotes an
abort reason, check name, or other text from the forge. See [`retro`](tools-quality.md#effective-flow-retro)
for what the tool does.

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

| Tool            | Condition                                                                       | Then                                                  | Or                                                                 |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `concept`       | deep review declined                                                            | `/effective-flow review <concept-file>`               | —                                                                  |
| `concept`       | deep review done, ready                                                         | `/effective-flow plan <work package>`                 | `/effective-flow review <concept-file>`                            |
| `concept`       | deep review done, open points remain                                            | `/effective-flow review <concept-file>`               | —                                                                  |
| `investigate`   | admitted defect with a clear cause                                              | `/effective-flow fix <report>`                        | —                                                                  |
| `investigate`   | admitted structural problem                                                     | `/effective-flow refactor <report>`                   | —                                                                  |
| `investigate`   | admitted missing functionality                                                  | `/effective-flow build <report>`                      | —                                                                  |
| `investigate`   | admitted pure documentation gap or behavior to be documented                    | `/effective-flow docs <report>`                       | —                                                                  |
| `plan`          | deep review declined                                                            | `/effective-flow apply <plan-file>`                   | `/effective-flow review <plan-file>`                               |
| `plan`          | deep review done, ready                                                         | `/effective-flow apply <plan-file>`                   | `/effective-flow plan <plan-file>`                                 |
| `plan`          | deep review done, open points remain                                            | `/effective-flow review <plan-file>`                  | `/effective-flow plan <plan-file>`                                 |
| `open-plans`    | at least one open plan                                                          | `/effective-flow apply`                               | `/effective-flow plan <status-unclear plan>`                       |
| `open-plans`    | no open plan, status-unclear plan                                               | `/effective-flow plan <status-unclear plan>`          | —                                                                  |
| `plan-issue`    | released                                                                        | `/effective-flow apply #<issue>`                      | `/effective-flow plan-issue <issue>`                               |
| `plan-issue`    | retained for planning                                                           | `/effective-flow plan-issue <issue>`                  | —                                                                  |
| `capture`       | created issue                                                                   | `/effective-flow triage #<N>`                         | `/effective-flow plan-issue #<N>`                                  |
| `triage`        | implement verdict                                                               | `/effective-flow plan-issue #<issue>`                 | `/effective-flow apply #<issue>`                                   |
| `triage`        | needs-work verdict, questions to the author or maintainer open                  | `/effective-flow triage #<issue>`                     | `/effective-flow triage --untriaged`                               |
| `issue-buddy`   | dry run; would-publish issue in public repository                               | `/effective-flow issue-buddy --publish`               | `/effective-flow plan-issue <not-ready or readiness-failed issue>` |
| `issue-buddy`   | draft plan PR published; restore plan file from branch first                    | `/effective-flow build <plan-file>`                   | `/effective-flow plan-issue <not-ready or readiness-failed issue>` |
| `issue-buddy`   | completed pass with a not-ready or readiness-failed issue, no other row applies | `/effective-flow plan-issue <issue>`                  | —                                                                  |
| `backlog-audit` | goal epic written                                                               | `/effective-flow apply <epic>`                        | `/effective-flow plan-issue <split issue>`                         |
| `backlog-audit` | split handed off, no epic written                                               | `/effective-flow plan-issue <split issue>`            | —                                                                  |
| `backlog-audit` | plan revision recommended                                                       | `/effective-flow plan <plan-file>`                    | —                                                                  |
| `apply`         | plan clarity gate failed                                                        | `/effective-flow plan <plan-file>`                    | `/effective-flow review <plan-file>`                               |
| `apply`         | findings applied, PR opened, own review findings published                      | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `apply`         | findings applied, PR opened                                                     | `/effective-flow merge-gate <PR>`                     | `/effective-flow apply <remaining source>`                         |
| `apply`         | findings applied, delivery branch retained, no PR                               | `/effective-flow pr`                                  | `/effective-flow apply <remaining source>`                         |
| `apply`         | issues processed, PR opened, own review findings published                      | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `apply`         | issues processed, PR opened                                                     | `/effective-flow merge-gate <PR>`                     | `/effective-flow plan-issue <skipped issue>`                       |
| `apply`         | issues skipped, no PR                                                           | `/effective-flow plan-issue <skipped issue>`          | —                                                                  |
| `build`         | PR opened, own review findings published                                        | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `build`         | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow apply <findings report>`                          |
| `build`         | delivery branch retained, no PR                                                 | `/effective-flow pr`                                  | `/effective-flow apply <findings report>`                          |
| `build`         | delivery merged, findings report written                                        | `/effective-flow apply <findings report>`             | —                                                                  |
| `fix`           | PR opened, own review findings published                                        | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `fix`           | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow apply <findings report>`                          |
| `fix`           | delivery branch retained, no PR                                                 | `/effective-flow pr`                                  | `/effective-flow apply <findings report>`                          |
| `fix`           | delivery merged, findings report written                                        | `/effective-flow apply <findings report>`             | —                                                                  |
| `refactor`      | PR opened, own review findings published                                        | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `refactor`      | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow apply <findings report>`                          |
| `refactor`      | delivery branch retained, no PR                                                 | `/effective-flow pr`                                  | `/effective-flow apply <findings report>`                          |
| `refactor`      | delivery merged, findings report written                                        | `/effective-flow apply <findings report>`             | —                                                                  |
| `docs`          | PR opened, own review findings published                                        | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `docs`          | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow review <PR>`                                      |
| `docs`          | delivery branch retained, no PR                                                 | `/effective-flow pr`                                  | —                                                                  |
| `maintain`      | PR opened, own review findings published                                        | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `maintain`      | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow apply <offloaded report>`                         |
| `maintain`      | delivery branch retained, no PR                                                 | `/effective-flow pr`                                  | `/effective-flow apply <offloaded report>`                         |
| `maintain`      | delivery merged, offloaded report written                                       | `/effective-flow apply <offloaded report>`            | —                                                                  |
| `iterate`       | PR mode, own review findings published                                          | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `iterate`       | PR mode                                                                         | `/effective-flow merge-gate <PR>`                     | `/effective-flow review <PR>`                                      |
| `iterate`       | local mode, delivery branch retained                                            | `/effective-flow pr`                                  | —                                                                  |
| `review`        | local report written                                                            | `/effective-flow apply <report>`                      | —                                                                  |
| `review`        | direct admitted findings published to a tracker                                 | `/effective-flow apply #<finding>…`                   | `/effective-flow apply <local security report>`                    |
| `review`        | plan file mode, ready                                                           | `/effective-flow apply <plan-file>`                   | —                                                                  |
| `review`        | plan file mode, open points remain                                              | `/effective-flow review <plan-file>`                  | `/effective-flow plan <plan-file>`                                 |
| `review`        | concept file mode, ready                                                        | `/effective-flow plan <work package>`                 | —                                                                  |
| `review`        | concept file mode, open points remain                                           | `/effective-flow review <concept-file>`               | —                                                                  |
| `review`        | pull-request mode, at least one published `incomplete` criterion                | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `review`        | pull-request mode                                                               | `/effective-flow merge-gate <PR>`                     | `/effective-flow iterate <PR> own-review findings`                 |
| `deliver`       | PR opened                                                                       | `/effective-flow merge-gate <PR>`                     | `/effective-flow review <PR>`                                      |
| `autopilot`     | draft PR opened, no blocker                                                     | `/effective-flow review <PR>`                         | `/effective-flow merge-gate <PR>`                                  |
| `autopilot`     | plan-stage blocker, except a public security blocker                            | `/effective-flow review <plan-file>`                  | `/effective-flow plan <plan-file>`                                 |
| `autopilot`     | implementation-stage blocker recorded in a draft PR                             | `/effective-flow apply <plan-file>`                   | —                                                                  |
| `autopilot`     | implementation-stage blocker, no PR, except a public security blocker           | `/effective-flow apply <plan-file>`                   | —                                                                  |
| `autopilot`     | security blocker on a public repository, nothing published                      | `/effective-flow apply <local security report>`       | —                                                                  |
| `commit`        | commit created on a non-base branch                                             | `/effective-flow pr`                                  | —                                                                  |
| `pr`            | always                                                                          | `/effective-flow merge-gate <PR>`                     | `/effective-flow review <PR>`                                      |
| `merge-gate`    | blocked by review notes                                                         | `/effective-flow iterate <PR> own-review findings`    | `/effective-flow merge-gate <PR>`                                  |
| `merge-gate`    | blocked by failing checks                                                       | `/effective-flow iterate <PR> fix the failing checks` | `/effective-flow investigate failing checks on #<PR>`              |
| `merge-gate`    | ended without merge: the user kept the draft                                    | `/effective-flow review <PR>`                         | `/effective-flow iterate <PR> own-review findings`                 |
| `merge-gate`    | ended without merge: plan-only draft or draft with blockers                     | `/effective-flow apply <plan-file>`                   | `/effective-flow review <PR>`                                      |
| `merge-gate`    | ended without merge: plan-draft finish incomplete                               | `/effective-flow pr`                                  | —                                                                  |
| `merge-gate`    | ended without merge: invalid plan marker or missing mark-ready capability       | `/effective-flow review <PR>`                         | —                                                                  |
| `merge-gate`    | marked ready, rounds exhausted before the merge                                 | `/effective-flow merge-gate <PR>`                     | —                                                                  |
| `merge-gate`    | merged but at least one linked issue is open or unobservable                    | `/effective-flow merge-gate <PR>`                     | —                                                                  |
| `merge-gate`    | merged, associated plan's review report has open findings                       | `/effective-flow apply <report>`                      | `/effective-flow open-plans`                                       |
| `merge-gate`    | merged                                                                          | `/effective-flow open-plans`                          | —                                                                  |
| `setup`         | staged changes exist                                                            | `/effective-flow commit`                              | —                                                                  |
| `setup`         | status report found a setup-fixable problem                                     | `/effective-flow setup <setup argument>`              | `/effective-flow setup <second setup argument>`                    |
| `cleanup`       | staged removals exist                                                           | `/effective-flow commit`                              | `/effective-flow setup`                                            |
| `cleanup`       | config values referred to setup                                                 | `/effective-flow setup`                               | —                                                                  |

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

`triage` sits in front of that spine and decides whether an issue should be worked on at all. An
`implement` verdict points to `plan-issue` or `apply` on the same issue; a `needs-work` verdict
points to a re-run on that issue, or to `triage --untriaged`, once its questions are answered; a
`reject` verdict is final and ends without a recommendation.

A `capture` run that created no issue gives no fallback recommendation.

# Next-step recommendations

Close a completed run with up to two concrete ways to continue, so the user never has to guess which
tool takes the state this run just left behind.

## Who emits

**The last user-invocable tool of a run emits.** A delegation payload containing the literal line
`Next steps: suppressed` means the receiving tool **emits nothing**; the caller closes the run if
control returns there. **Every** delegation that returns control carries that line — one into a
user-invocable tool exactly as much as one into an internal tool, because a returning `pr`, `build`,
or `iterate` run is an intermediate result either way. Only a **handoff**, which gives the receiving
tool the rest of the run and never comes back, omits the line; that tool then emits the block
itself.

The distinction is mechanical and is never inferred from context — and it does not correct itself. A
returning delegation that omits the line emits from inside the run, so the user reads a mid-run
recommendation: a `pr` or `merge-gate` step this run has not reached, or one naming a branch the
outer run has since merged away, on top of the caller's own block. A forgotten line therefore costs a
**wrong** recommendation, not merely a duplicated one. Add it at every returning delegation site
instead of relying on the receiving tool to notice.

## Shape of the block

- At most **two** options, the most likely one first, as the **last** element of the report, under a
  heading in the conversation language. The block is interactive output and is persisted nowhere, so
  no `language.*` surface applies to it.
- Each option is **one line**: the copy-paste-ready invocation with this run's real arguments — the
  actual plan path, the actual pull-request number, the actual report path — followed by an em dash
  and at most about twelve words describing what that tool would do **from here**, not what the tool
  is in general.
- Never name an invocation whose argument this run does not have. If an edge cannot be filled, drop
  that option; if neither can be filled, emit nothing rather than a generic suggestion.
- When one run opened several pull requests, name the first one and state in that same line that the
  remaining ones follow the same way. Never exceed two options to cover them.
- **Never start the follow-up tool.** This is a recommendation, not a handoff; the existing
  automatic delegations are unaffected and stay outside this contract.
- **Chat only.** The block is never written into a pull-request comment, an issue comment, a commit
  message, or any other persisted artifact.
- The block never replaces the run's own report; it is appended after it.
- Emit it only for a completed run. A run that aborts names the blocking condition instead, as it
  does today.
- **Invent no option that is not in the table below.** A run whose end state matches no row emits
  nothing — a quiet ending is better than a recommendation that resolves to the wrong scope.

## Edge table

The table between the marker comments is a build-validated runtime contract. Keep its columns and
tool names stable. Take the row whose `Tool` is the emitting tool and whose `Condition` describes
the state this run reached: `Then` is the first option, `Or` the second, and an em dash means the
row deliberately carries only one. Fill every `<...>` placeholder from the run's actual state.
`plan | deep review declined` still leads with `apply <plan-file>` where its `concept` counterpart
offers only `review <concept-file>`, because a declined review leaves no readiness verdict to
contradict and `apply` re-checks the plan itself — the `apply | plan clarity gate failed` row is the
backstop for one that carries open points.

<!-- next-steps-table:start -->

| Tool        | Condition                                           | Then                                 | Or                                      |
| ----------- | --------------------------------------------------- | ------------------------------------ | --------------------------------------- |
| concept     | deep review declined                                | {{SKILL:review}} <concept-file>      | —                                       |
| concept     | deep review done, ready                             | {{SKILL:plan}} <work package>        | {{SKILL:review}} <concept-file>         |
| concept     | deep review done, open points remain                | {{SKILL:review}} <concept-file>      | —                                       |
| investigate | defect with a clear cause                           | {{SKILL:fix}} <report>               | {{SKILL:plan}} <report>                 |
| investigate | structural problem                                  | {{SKILL:refactor}} <report>          | {{SKILL:plan}} <report>                 |
| investigate | missing functionality                               | {{SKILL:build}} <report>             | {{SKILL:plan}} <report>                 |
| investigate | pure documentation gap or behavior to be documented | {{SKILL:docs}} <report>              | —                                       |
| plan        | deep review declined                                | {{SKILL:apply}} <plan-file>          | {{SKILL:review}} <plan-file>            |
| plan        | deep review done, ready                             | {{SKILL:apply}} <plan-file>          | {{SKILL:plan}} <plan-file>              |
| plan        | deep review done, open points remain                | {{SKILL:review}} <plan-file>         | {{SKILL:plan}} <plan-file>              |
| open-plans  | at least one open plan                              | {{SKILL:apply}}                      | —                                       |
| plan-issue  | released                                            | {{SKILL:apply}} #<issue>             | {{SKILL:plan-issue}} <issue>            |
| plan-issue  | retained for planning                               | {{SKILL:plan-issue}} <issue>         | —                                       |
| apply       | plan clarity gate failed                            | {{SKILL:plan}} <plan-file>           | {{SKILL:review}} <plan-file>            |
| apply       | findings applied, PR opened                         | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <remaining source>      |
| apply       | findings applied, delivery branch retained, no PR   | {{SKILL:pr}}                         | {{SKILL:apply}} <remaining source>      |
| apply       | issues processed, PR opened                         | {{SKILL:merge-gate}} <PR>            | {{SKILL:plan-issue}} <skipped issue>    |
| apply       | issues skipped, no PR                               | {{SKILL:plan-issue}} <skipped issue> | —                                       |
| build       | PR opened                                           | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| build       | delivery branch retained, no PR                     | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| fix         | PR opened                                           | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| fix         | delivery branch retained, no PR                     | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| refactor    | PR opened                                           | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| refactor    | delivery branch retained, no PR                     | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| docs        | PR opened                                           | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| docs        | delivery branch retained, no PR                     | {{SKILL:pr}}                         | —                                       |
| maintain    | PR opened                                           | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <offloaded report>      |
| maintain    | delivery branch retained, no PR                     | {{SKILL:pr}}                         | {{SKILL:apply}} <offloaded report>      |
| iterate     | PR mode                                             | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| iterate     | local mode, delivery branch retained                | {{SKILL:pr}}                         | —                                       |
| review      | local report written                                | {{SKILL:apply}} <report>             | —                                       |
| review      | published to a tracker                              | {{SKILL:apply}} #<epic>              | {{SKILL:apply}} <local security report> |
| review      | plan file mode, ready                               | {{SKILL:apply}} <plan-file>          | —                                       |
| review      | plan file mode, open points remain                  | {{SKILL:review}} <plan-file>         | {{SKILL:plan}} <plan-file>              |
| review      | concept file mode, ready                            | {{SKILL:plan}} <work package>        | —                                       |
| review      | concept file mode, open points remain               | {{SKILL:review}} <concept-file>      | —                                       |
| review      | pull-request mode                                   | {{SKILL:merge-gate}} <PR>            | {{SKILL:iterate}} <PR>                  |
| commit      | commit created on a non-base branch                 | {{SKILL:pr}}                         | —                                       |
| pr          | always                                              | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| merge-gate  | blocked by review notes                             | {{SKILL:iterate}} <PR>               | {{SKILL:merge-gate}} <PR>               |
| merge-gate  | merged                                              | {{SKILL:open-plans}}                 | —                                       |
| setup       | staged changes exist                                | {{SKILL:commit}}                     | —                                       |
| cleanup     | staged removals exist                               | {{SKILL:commit}}                     | {{SKILL:setup}}                         |
| cleanup     | config values referred to setup                     | {{SKILL:setup}}                      | —                                       |

<!-- next-steps-table:end -->

These end states carry no row on purpose and therefore emit nothing:

- a `setup` run with nothing staged;
- a `cleanup` run whose mandatory report found nothing to carry over, delete, or refer on;
- an `investigate` run that ends in no bug, deliberately no action, or a pending product decision —
  the documentation row covers a documentation gap, never a non-finding;
- a delivery that **merged** the branch rather than retaining it, in `apply`, `build`, `fix`,
  `refactor`, `docs`, `maintain`, and `iterate`: the checkout is back on the base branch, so there
  is no head a pull request could be opened from;
- a `commit` run with nothing staged, a commit a hook blocked, or a commit on the base branch
  itself.

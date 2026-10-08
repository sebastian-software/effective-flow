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
itself. Return the verified source association, complete planning basis already read and observed
outcome as ordinary context to the final emitter; introduce no control line or envelope field.

The distinction is mechanical and is never inferred from context — and it does not correct itself. A
returning delegation that omits the line emits from inside the run, so the user reads a mid-run
recommendation: a `pr` or `merge-gate` step this run has not reached, or one naming a branch the
outer run has since merged away, on top of the caller's own block. A forgotten line therefore costs a
**wrong** recommendation, not merely a duplicated one. Add it at every returning delegation site
instead of relying on the receiving tool to notice.

## Shape of the block

- At most **two** options, the most likely one first, as the **last** element of the report, under a
  heading in the resolved chat language. The block is interactive output and is never a project
  artifact, so it follows `language.chat` rather than any artifact surface.
- Each option is **one line**: the copy-paste-ready invocation with this run's real arguments — the
  actual plan path, the actual pull-request number, the actual report path — followed by an em dash
  and at most about twelve words describing what that tool would do **from here**, not what the tool
  is in general. That description follows the chat language too; the invocation token itself is
  copy-paste input and is never translated.
- Never name an invocation whose argument this run does not have. If an edge cannot be filled, drop
  that option; if neither can be filled, emit nothing rather than a generic suggestion.
- A finding/review `apply` option exists only when this run actually created an admitted durable
  report or direct finding issue and can name its concrete path/reference. `current-scope`,
  `closed`, `uncertain`, a merely eligible result without write authority, or an empty/deduplicated
  result emits no substitute planning or review invocation.
- When one run opened several pull requests, name the first one and state in that same line that the
  remaining ones follow the same way. Never exceed two options to cover them.
- **Never start the follow-up tool.** This is a recommendation, not a handoff; the existing
  automatic delegations are unaffected and stay outside this contract.
- **Chat only.** The block is never written into a pull-request comment, an issue comment, a commit
  message, or any other persisted artifact.
- The block never replaces the run's own report; it is appended after it.
- Emit it only for a completed run. A run that aborts names the blocking condition instead, as it
  does today.
- Emit only applicable unfinished work. A completed package, merged delivery, or unavailable branch
  is never a candidate merely because a fallback row names it.

## Select from the associated plan before the fallback

1. **Check emission eligibility first.** Suppression, aborts, explicit no-action endings, and the
   finding-admission/no-finding limits above still end without options, even with an associated plan.
   The no-action setup/cleanup/commit endings below stay silent too. Read no optional plan context
   for these endings. Otherwise retain the already resolved source association and verified outcome from the
   run or returning workflow. Use explicit input or a verified retained link: a source plan, its
   established archive move, or a validated issue lifecycle receipt. Never choose a newest unrelated
   plan, match by title, or infer issue identity from arbitrary PR prose. Several plausible bases
   without a resolved association are a limitation, not permission to pick one.
2. **Read only that basis.** Resolve a known local handle under the existing plan-reference and
   status rules, including its established archive location and verified runtime root. Do not
   inventory the repository or invent a path into a removed worktree. For an associated issue, use
   the newest standalone canonical planning comment beginning with
   `<!-- effective-flow-plan-issues -->` or the readable legacy `<!-- firmo-plan-issues -->`;
   fenced/quoted examples are not records. Preserve issue-body requirements and newer maintainer
   clarifications, and parse canonical decomposition through `decomposition-records-parse`.
   Reuse fresh complete body/comment results already obtained by the run, especially Phase 5.5:
   its at-most-one-comment-read-per-receipted-issue bound still applies. A truncated open-points
   quotation is never the complete planning basis. Additional reads are bounded to the known
   associated handles not yet read: one local artifact read per handle, or at most one issue read
   and one comment read per associated issue through the established helper/connection. Never retry
   a failed or unsupported read just to generate advice. Hidden mode permits local context only;
   unavailable tracker context never triggers target switching, probe/write bootstrap, migration,
   or a new connection. This selection writes no artifact, plan/status, tracker comment/label,
   migration marker, worktree record, or wisdom state.
3. **Reconcile with the observed outcome, then choose.** Compare packages, dependencies, review/open
   points and approvals with verified completed work. Explicit user instructions and unfinished
   delivery/review or real post-merge reconciliation for this package lead before a later package;
   an open PR is not bypassed. Otherwise the next applicable unfinished package normally leads,
   mapped to an existing exposed tool with actual arguments, even without a matching table row.
   Require established readiness and authority before suggesting execution. Missing preparation or
   a recoverably stale record leads to `{{SKILL:plan}} <known-plan-path>` or
   `{{SKILL:plan-issue}} <known-issue>`; otherwise name the blocker. An implemented/archived plan
   with apparent unfinished work needs `plan` reconciliation, never `apply` of that completed
   basis, unless an independently established active successor supplies the execution basis.
   Operational work without a matching tool also needs useful preparation or a named blocker;
   never invent a tool or imply approval. For renovate-config #37, verified Q2a merges with the
   canonical Q2a record still in place lead to `{{SKILL:plan-issue}} #37` to record Q2a and prepare
   Q2b, with no Q2b qualification, Q2c evidence or E activation authority implied. Keep every issue
   reference bound to its owning repository/target and preserve external tool identifiers. Obey the
   tool's existing argument, repository and target validity in the already established owning context.
   A full verified URL is a candidate only when that tool accepts it there; retaining full identity
   grants no cross-repository routing. Otherwise state the limitation and use a valid fallback or
   emit no option; establish no new repository context or connection for a recommendation.
4. **Fall back safely.** Missing, unreadable, ambiguous, malformed or irreconcilably stale context
   gets a brief limitation in the report and only a still-valid generic edge below. A second option
   must be independently applicable, distinct and compatible with the first. Recommend observer-only
   `{{SKILL:merge-gate}} <PR>` re-entry only for actual unfinished reconciliation it can address;
   an intentionally open parent for later packages is insufficient. If no valid candidate remains,
   emit no block. This is read-only advice: it grants no authority and starts no action.

## Generic fallback edge table

The table between the marker comments is a build-validated fallback contract, not an exhaustive
whitelist. Keep its columns and tool names stable. Only after the selection above, take an applicable
row whose `Tool` is the emitting tool and whose `Condition` describes unfinished work in the state
this run reached: `Then` is the first option, `Or` the second, and an em dash means the row
carries only one. Fill every `<...>` placeholder from the run's actual state.
`plan | deep review declined` still leads with `apply <plan-file>` where its `concept` counterpart
offers only `review <concept-file>`, because a declined review leaves no readiness verdict to
contradict and `apply` re-checks the plan itself — the `apply | plan clarity gate failed` row is the
backstop for one that carries open points.

<!-- next-steps-table:start -->

| Tool        | Condition                                                    | Then                                 | Or                                      |
| ----------- | ------------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| concept     | deep review declined                                         | {{SKILL:review}} <concept-file>      | —                                       |
| concept     | deep review done, ready                                      | {{SKILL:plan}} <work package>        | {{SKILL:review}} <concept-file>         |
| concept     | deep review done, open points remain                         | {{SKILL:review}} <concept-file>      | —                                       |
| investigate | admitted defect with a clear cause                           | {{SKILL:fix}} <report>               | —                                       |
| investigate | admitted structural problem                                  | {{SKILL:refactor}} <report>          | —                                       |
| investigate | admitted missing functionality                               | {{SKILL:build}} <report>             | —                                       |
| investigate | admitted pure documentation gap or behavior to be documented | {{SKILL:docs}} <report>              | —                                       |
| plan        | deep review declined                                         | {{SKILL:apply}} <plan-file>          | {{SKILL:review}} <plan-file>            |
| plan        | deep review done, ready                                      | {{SKILL:apply}} <plan-file>          | {{SKILL:plan}} <plan-file>              |
| plan        | deep review done, open points remain                         | {{SKILL:review}} <plan-file>         | {{SKILL:plan}} <plan-file>              |
| open-plans  | at least one open plan                                       | {{SKILL:apply}}                      | —                                       |
| plan-issue  | released                                                     | {{SKILL:apply}} #<issue>             | {{SKILL:plan-issue}} <issue>            |
| plan-issue  | retained for planning                                        | {{SKILL:plan-issue}} <issue>         | —                                       |
| apply       | plan clarity gate failed                                     | {{SKILL:plan}} <plan-file>           | {{SKILL:review}} <plan-file>            |
| apply       | findings applied, PR opened                                  | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <remaining source>      |
| apply       | findings applied, delivery branch retained, no PR            | {{SKILL:pr}}                         | {{SKILL:apply}} <remaining source>      |
| apply       | issues processed, PR opened                                  | {{SKILL:merge-gate}} <PR>            | {{SKILL:plan-issue}} <skipped issue>    |
| apply       | issues skipped, no PR                                        | {{SKILL:plan-issue}} <skipped issue> | —                                       |
| build       | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| build       | delivery branch retained, no PR                              | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| fix         | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| fix         | delivery branch retained, no PR                              | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| refactor    | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <findings report>       |
| refactor    | delivery branch retained, no PR                              | {{SKILL:pr}}                         | {{SKILL:apply}} <findings report>       |
| docs        | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| docs        | delivery branch retained, no PR                              | {{SKILL:pr}}                         | —                                       |
| maintain    | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | {{SKILL:apply}} <offloaded report>      |
| maintain    | delivery branch retained, no PR                              | {{SKILL:pr}}                         | {{SKILL:apply}} <offloaded report>      |
| iterate     | PR mode                                                      | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| iterate     | local mode, delivery branch retained                         | {{SKILL:pr}}                         | —                                       |
| review      | local report written                                         | {{SKILL:apply}} <report>             | —                                       |
| review      | direct admitted findings published to a tracker              | {{SKILL:apply}} #<finding>…          | {{SKILL:apply}} <local security report> |
| review      | plan file mode, ready                                        | {{SKILL:apply}} <plan-file>          | —                                       |
| review      | plan file mode, open points remain                           | {{SKILL:review}} <plan-file>         | {{SKILL:plan}} <plan-file>              |
| review      | concept file mode, ready                                     | {{SKILL:plan}} <work package>        | —                                       |
| review      | concept file mode, open points remain                        | {{SKILL:review}} <concept-file>      | —                                       |
| review      | pull-request mode                                            | {{SKILL:merge-gate}} <PR>            | {{SKILL:iterate}} <PR>                  |
| deliver     | PR opened                                                    | {{SKILL:merge-gate}} <PR>            | —                                       |
| commit      | commit created on a non-base branch                          | {{SKILL:pr}}                         | —                                       |
| pr          | always                                                       | {{SKILL:merge-gate}} <PR>            | {{SKILL:review}} <PR>                   |
| merge-gate  | blocked by review notes                                      | {{SKILL:iterate}} <PR>               | {{SKILL:merge-gate}} <PR>               |
| merge-gate  | merged but at least one linked issue is open or unobservable | {{SKILL:merge-gate}} <PR>            | —                                       |
| merge-gate  | merged                                                       | {{SKILL:open-plans}}                 | —                                       |
| setup       | staged changes exist                                         | {{SKILL:commit}}                     | —                                       |
| cleanup     | staged removals exist                                        | {{SKILL:commit}}                     | {{SKILL:setup}}                         |
| cleanup     | config values referred to setup                              | {{SKILL:setup}}                      | —                                       |

<!-- next-steps-table:end -->

These end states carry no generic fallback row:

- a `setup` run with nothing staged;
- a `cleanup` run whose mandatory report found nothing to carry over, delete, or refer on;
- an `investigate` run that ends in no bug, deliberately no action, or a pending product decision —
  the documentation row covers a documentation gap, never a non-finding;
- a delivery that **merged** the branch rather than retaining it, in `apply`, `build`, `fix`,
  `refactor`, `docs`, `maintain`, and `iterate`: the checkout is back on the base branch, so there
  is no head a pull request could be opened from; an associated unfinished plan package may still
  supply a candidate through the selection above;
- a `commit` run with nothing staged, a commit a hook blocked, or a commit on the base branch
  itself.

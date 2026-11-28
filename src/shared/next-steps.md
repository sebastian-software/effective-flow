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

`retro` and `focus` deliberately emit no block: their chat-only recommendations or snapshot verdict
are already the requested result, with no saved executable source or automatic follow-up. Only
`retro` is ever recommended, and only through the retrospective slot below; `focus` never is.

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
  report or direct finding issue and can name its concrete path/reference, or when a merge-gate
  merge resolved the report its verified associated plan points to and that report still holds an
  open finding (see "Merged merge-gate run"). `current-scope`,
  `closed`, `uncertain`, a merely eligible result without write authority, or an empty/deduplicated
  result emits no substitute planning or review invocation.
- When one run left several same-kind targets – pull requests, issues or plans – name the first one
  and state in that same line that the remaining ones follow the same way. Never exceed two options
  to cover them.
- When the observed outcome includes Effective Flow's own review findings published on an open pull
  request, every bare `{{SKILL:iterate}} <PR>` option becomes `{{SKILL:iterate}} <PR> own-review findings`,
  the form `iterate` accepts as the explicit selection of those findings, whichever selection
  produced it, plan-aware or fallback; those findings count as unfinished review in plan-aware step 3.
- **Never start the follow-up tool.** This is a recommendation, not a handoff; the existing
  automatic delegations are unaffected and stay outside this contract.
- **Chat only.** The block is never written into a pull-request comment, an issue comment, a commit
  message, or any other persisted artifact.
- The block never replaces the run's own report; it is appended after it.
- Emit it only for a completed run. A run that aborts names the blocking condition instead; only
  the abort clause of the retrospective slot may then append a block after it.
- Emit only applicable unfinished work, plus the retrospective slot. A completed package, merged
  delivery, or unavailable branch is never a candidate merely because a fallback row names it.

## Select from the associated plan before the fallback

1. **Check emission eligibility first.** Suppression, aborts, explicit no-action endings, and the
   finding-admission/no-finding limits above still end without options, even with an associated
   plan, except for the retrospective slot below. The no-action setup/cleanup/commit endings below
   stay silent too, under the same exception. Read no optional plan context for these endings.
   Otherwise retain the already resolved source association and verified outcome from the run or
   returning workflow. Use explicit input or a verified retained link: a source plan, its
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
   an open PR is not bypassed. If the current package still needs delivery or review, omit execution
   options for packages that depend on that completion; describing an option as “after delivery”
   does not make it independently applicable now. Otherwise the next applicable unfinished package normally leads,
   mapped to an existing exposed tool with actual arguments, even without a matching table row.
   Require established readiness and authority before suggesting execution. For ordinary next-package approval/dependency gaps,
   missing preparation or a recoverably stale record, recommend `{{SKILL:plan}} <known-plan-path>` or `{{SKILL:plan-issue}} <known-issue>`
   against the already known basis to reconcile verified completion and prepare prerequisites and the approval decision; name blockers without granting approval or execution. A verified completed package
   still marked unfinished in its associated plan record needs this reconciliation even when an
   approval, dependency or workflow blocker prevents a later package; reconciliation does not grant
   authority to execute that blocked package. An implemented/archived plan
   with apparent unfinished work needs `plan` reconciliation, never `apply` of that completed
   basis, unless an independently established active successor supplies the execution basis.
   Residual findings offloaded to an external review report are not unfinished work of that plan:
   the report rows below and "Merged merge-gate run" make that report the candidate.
   Operational work without a matching tool must use that useful preparation when available, otherwise
   name the blocker; never invent a tool or imply approval. For renovate-config #37, verified Q2a merges with the
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

**Merged merge-gate run.** Take candidates in this order: the step-3 result, the linked-issue
reconciliation row unless already chosen, the associated plan's review report,
`{{SKILL:open-plans}}`, then the retrospective slot. The first applicable candidate takes slot one,
and the next independently applicable one takes slot two. The review-report candidate needs the
plan the delegated run validated from its `Associated plan:` line, or an inline gate run's own
verified association that passed that same check; without either there is no such candidate, no
inventory of `.effective-flow/review/` and no newest-report guess. Read that plan's `**External review report:**`
(German `**Externer Review-Bericht:**`) path. The candidate is `{{SKILL:apply}} <report>` only when
that path resolves inside `<RUNTIME_STATE_ROOT>/.effective-flow/review/` under the review-report
rule of `apply-source-detection` and one read of the report finds a finding with status `Open` or
`Not implemented` (`Offen`, `Nicht umgesetzt`) without an `(ADR: <slug>)` suffix, which marks a
deliberately declined finding. That read is step 2's one local artifact read for the report handle,
within its per-handle bound; a missing, outside, failed or unsupported read is not retried and
drops the candidate with a one-line limitation.

Before selecting any outward invocation for an existing outcome chain, apply its retained
continuation decision to both plan-aware selection and fallback. Read-only selection returns a
proposed checkpoint delta/pending source update; it neither persists state nor guesses missing
history as zero. An endpoint blocked by its retained outcome-continuation decision or missing/conflicting required continuation context
emits no substitute planning, review or issue-creation option; name its specific blocker. Independent authorized delivery may remain applicable.

```lazy-include
outcome-continuation
when: the completed run belongs to an outcome-directed continuation, history is unknown, or a candidate next step materially expands the approach
```

## Retrospective slot

After plan-aware selection and the fallback table, every emitting tool considers bare
`{{SKILL:retro}}` for the current conversation. It is a contract rule outside the table, so `retro`
stays a non-emitter.

- **Eligibility.** Never under `Next steps: suppressed`, `Run state: non-interactive` or the
  unattended planning envelope. `Run state: relayed` is eligible. Only these literal inputs, or a
  `non-interactive` state the tool infers by its own documented fallback, exclude it; prose saying
  a phase poses no questions does not.
- **Signal.** Offer it only when at least one of these closed signals holds; an ordinary approval
  pause never counts:
  - **T1:** a delegated `{{SKILL:iterate}}` round ended with a whole-run `ABORT` other than
    `nested-spawn-unavailable`, a refused CI-repair instruction, a second keyword-less return, or a
    reviewer cause still open after its second repair attempt. A round ended by
    `BLOCKED-USER iterate-approval`, and every successful round, never count.
  - **T2:** a delegation needed its one keyword-less recovery resume, or a completion-protocol
    retry (Retry 1 or higher) occurred.
  - **T3:** a merge-gate run consumed at least two relayed answers to the exceptional questions
    `checks-pending`, `reviews-unestablished`, `check-list-waiver`, `conflict-resolution` or
    `set-aside`; `iterate-approval`, `issue-done` and `iterate-in-flight` never count.
  - **T4 (aborts only):** the run aborted after it had spawned at least one sub-agent for domain
    work; a no-op probe is none. Never an argument, preflight, configuration or migration abort;
    never any delegated-run Entry abort, for example `unparseable input line` or
    `invalid wisdom file`; never a `nested-spawn-unavailable` or other capability abort, or a stop,
    decline or restriction the user initiated.
- **Report duty and visibility.** A run that observed a T-fact states it in one report line before
  the block. A signal counts only when that line is in this run's own report; never infer one from
  memory.
- **Placement.** Retro never displaces a candidate: it takes the second slot when that is free, and
  it is the first and only option when no other valid candidate exists. With both slots filled, drop
  it.
- **Abort clause.** After an abort only T4 qualifies: the report names the blocker first, and retro
  is the block's only option. An abort that T4 excludes appends no block, even when T1–T3 hold.
- **Description.** Name its basis only by signal class, for example "reviews this run's failed
  iterate round"; never quote an abort reason, a check name or other forge text.

## Generic fallback edge table

The table between the marker comments is a build-validated fallback contract, not an exhaustive
whitelist. Keep its columns and tool names stable. Only after the selection above, take an applicable
row whose `Tool` is the emitting tool and whose `Condition` describes unfinished work in the state
this run reached: `Then` is the first option, `Or` the second, and an em dash means the row
carries only one. A row whose condition extends another row's condition for the same tool precedes
and wins over it; `own review findings published` holds only when this run's PR review publication,
its own or a delegated child's, reported at least one published finding. An unreported or unknown
count selects the generic row, and with several pull requests both options name the first one with
published findings. Fill every `<...>` placeholder from the run's actual state; text outside a
placeholder is fixed, so the `blocked by failing checks` row never carries a check name or failure
detail, which the forge supplies and an attacker may control. Omit every `{{SKILL:open-plans}}`
option when `<plan.dir>/` has no open plan for it to list.
`plan | deep review declined` still leads with `apply <plan-file>` where its `concept` counterpart
offers only `review <concept-file>`, because a declined review leaves no readiness verdict to
contradict and `apply` re-checks the plan itself — the `apply | plan clarity gate failed` row is the
backstop for one that carries open points.

<!-- next-steps-table:start -->

| Tool          | Condition                                                                       | Then                                          | Or                                                         |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| concept       | deep review declined                                                            | {{SKILL:review}} <concept-file>               | —                                                          |
| concept       | deep review done, ready                                                         | {{SKILL:plan}} <work package>                 | {{SKILL:review}} <concept-file>                            |
| concept       | deep review done, open points remain                                            | {{SKILL:review}} <concept-file>               | —                                                          |
| investigate   | admitted defect with a clear cause                                              | {{SKILL:fix}} <report>                        | —                                                          |
| investigate   | admitted structural problem                                                     | {{SKILL:refactor}} <report>                   | —                                                          |
| investigate   | admitted missing functionality                                                  | {{SKILL:build}} <report>                      | —                                                          |
| investigate   | admitted pure documentation gap or behavior to be documented                    | {{SKILL:docs}} <report>                       | —                                                          |
| plan          | deep review declined                                                            | {{SKILL:apply}} <plan-file>                   | {{SKILL:review}} <plan-file>                               |
| plan          | deep review done, ready                                                         | {{SKILL:apply}} <plan-file>                   | {{SKILL:plan}} <plan-file>                                 |
| plan          | deep review done, open points remain                                            | {{SKILL:review}} <plan-file>                  | {{SKILL:plan}} <plan-file>                                 |
| open-plans    | at least one open plan                                                          | {{SKILL:apply}}                               | {{SKILL:plan}} <status-unclear plan>                       |
| open-plans    | no open plan, status-unclear plan                                               | {{SKILL:plan}} <status-unclear plan>          | —                                                          |
| plan-issue    | released                                                                        | {{SKILL:apply}} #<issue>                      | {{SKILL:plan-issue}} <issue>                               |
| plan-issue    | retained for planning                                                           | {{SKILL:plan-issue}} <issue>                  | —                                                          |
| capture       | created issue                                                                   | {{SKILL:triage}} #<N>                         | {{SKILL:plan-issue}} #<N>                                  |
| triage        | implement verdict                                                               | {{SKILL:plan-issue}} #<issue>                 | {{SKILL:apply}} #<issue>                                   |
| triage        | needs-work verdict, questions to the author or maintainer open                  | {{SKILL:triage}} #<issue>                     | {{SKILL:triage}} --untriaged                               |
| issue-buddy   | dry run; would-publish issue in public repository                               | {{SKILL:issue-buddy}} --publish               | {{SKILL:plan-issue}} <not-ready or readiness-failed issue> |
| issue-buddy   | draft plan PR published; restore plan file from branch first                    | {{SKILL:build}} <plan-file>                   | {{SKILL:plan-issue}} <not-ready or readiness-failed issue> |
| issue-buddy   | completed pass with a not-ready or readiness-failed issue, no other row applies | {{SKILL:plan-issue}} <issue>                  | —                                                          |
| backlog-audit | goal epic written                                                               | {{SKILL:apply}} <epic>                        | {{SKILL:plan-issue}} <split issue>                         |
| backlog-audit | split handed off, no epic written                                               | {{SKILL:plan-issue}} <split issue>            | —                                                          |
| backlog-audit | plan revision recommended                                                       | {{SKILL:plan}} <plan-file>                    | —                                                          |
| apply         | plan clarity gate failed                                                        | {{SKILL:plan}} <plan-file>                    | {{SKILL:review}} <plan-file>                               |
| apply         | findings applied, PR opened, own review findings published                      | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| apply         | findings applied, PR opened                                                     | {{SKILL:merge-gate}} <PR>                     | {{SKILL:apply}} <remaining source>                         |
| apply         | findings applied, delivery branch retained, no PR                               | {{SKILL:pr}}                                  | {{SKILL:apply}} <remaining source>                         |
| apply         | issues processed, PR opened, own review findings published                      | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| apply         | issues processed, PR opened                                                     | {{SKILL:merge-gate}} <PR>                     | {{SKILL:plan-issue}} <skipped issue>                       |
| apply         | issues skipped, no PR                                                           | {{SKILL:plan-issue}} <skipped issue>          | —                                                          |
| build         | PR opened, own review findings published                                        | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| build         | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:apply}} <findings report>                          |
| build         | delivery branch retained, no PR                                                 | {{SKILL:pr}}                                  | {{SKILL:apply}} <findings report>                          |
| build         | delivery merged, findings report written                                        | {{SKILL:apply}} <findings report>             | —                                                          |
| fix           | PR opened, own review findings published                                        | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| fix           | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:apply}} <findings report>                          |
| fix           | delivery branch retained, no PR                                                 | {{SKILL:pr}}                                  | {{SKILL:apply}} <findings report>                          |
| fix           | delivery merged, findings report written                                        | {{SKILL:apply}} <findings report>             | —                                                          |
| refactor      | PR opened, own review findings published                                        | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| refactor      | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:apply}} <findings report>                          |
| refactor      | delivery branch retained, no PR                                                 | {{SKILL:pr}}                                  | {{SKILL:apply}} <findings report>                          |
| refactor      | delivery merged, findings report written                                        | {{SKILL:apply}} <findings report>             | —                                                          |
| docs          | PR opened, own review findings published                                        | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| docs          | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:review}} <PR>                                      |
| docs          | delivery branch retained, no PR                                                 | {{SKILL:pr}}                                  | —                                                          |
| maintain      | PR opened, own review findings published                                        | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| maintain      | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:apply}} <offloaded report>                         |
| maintain      | delivery branch retained, no PR                                                 | {{SKILL:pr}}                                  | {{SKILL:apply}} <offloaded report>                         |
| maintain      | delivery merged, offloaded report written                                       | {{SKILL:apply}} <offloaded report>            | —                                                          |
| iterate       | PR mode, own review findings published                                          | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| iterate       | PR mode                                                                         | {{SKILL:merge-gate}} <PR>                     | {{SKILL:review}} <PR>                                      |
| iterate       | local mode, delivery branch retained                                            | {{SKILL:pr}}                                  | —                                                          |
| review        | local report written                                                            | {{SKILL:apply}} <report>                      | —                                                          |
| review        | direct admitted findings published to a tracker                                 | {{SKILL:apply}} #<finding>…                   | {{SKILL:apply}} <local security report>                    |
| review        | plan file mode, ready                                                           | {{SKILL:apply}} <plan-file>                   | —                                                          |
| review        | plan file mode, open points remain                                              | {{SKILL:review}} <plan-file>                  | {{SKILL:plan}} <plan-file>                                 |
| review        | concept file mode, ready                                                        | {{SKILL:plan}} <work package>                 | —                                                          |
| review        | concept file mode, open points remain                                           | {{SKILL:review}} <concept-file>               | —                                                          |
| review        | pull-request mode, at least one published `incomplete` criterion                | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| review        | pull-request mode                                                               | {{SKILL:merge-gate}} <PR>                     | {{SKILL:iterate}} <PR> own-review findings                 |
| deliver       | PR opened                                                                       | {{SKILL:merge-gate}} <PR>                     | {{SKILL:review}} <PR>                                      |
| autopilot     | draft PR opened, no blocker                                                     | {{SKILL:review}} <PR>                         | {{SKILL:merge-gate}} <PR>                                  |
| autopilot     | plan-stage blocker, except a public security blocker                            | {{SKILL:review}} <plan-file>                  | {{SKILL:plan}} <plan-file>                                 |
| autopilot     | implementation-stage blocker recorded in a draft PR                             | {{SKILL:apply}} <plan-file>                   | —                                                          |
| autopilot     | implementation-stage blocker, no PR, except a public security blocker           | {{SKILL:apply}} <plan-file>                   | —                                                          |
| autopilot     | security blocker on a public repository, nothing published                      | {{SKILL:apply}} <local security report>       | —                                                          |
| commit        | commit created on a non-base branch                                             | {{SKILL:pr}}                                  | —                                                          |
| pr            | always                                                                          | {{SKILL:merge-gate}} <PR>                     | {{SKILL:review}} <PR>                                      |
| merge-gate    | blocked by review notes                                                         | {{SKILL:iterate}} <PR> own-review findings    | {{SKILL:merge-gate}} <PR>                                  |
| merge-gate    | blocked by failing checks                                                       | {{SKILL:iterate}} <PR> fix the failing checks | {{SKILL:investigate}} failing checks on #<PR>              |
| merge-gate    | ended without merge: the user kept the draft                                    | {{SKILL:review}} <PR>                         | {{SKILL:iterate}} <PR> own-review findings                 |
| merge-gate    | ended without merge: plan-only draft or draft with blockers                     | {{SKILL:apply}} <plan-file>                   | {{SKILL:review}} <PR>                                      |
| merge-gate    | ended without merge: plan-draft finish incomplete                               | {{SKILL:pr}}                                  | —                                                          |
| merge-gate    | ended without merge: invalid plan marker or missing mark-ready capability       | {{SKILL:review}} <PR>                         | —                                                          |
| merge-gate    | marked ready, rounds exhausted before the merge                                 | {{SKILL:merge-gate}} <PR>                     | —                                                          |
| merge-gate    | merged but at least one linked issue is open or unobservable                    | {{SKILL:merge-gate}} <PR>                     | —                                                          |
| merge-gate    | merged, associated plan's review report has open findings                       | {{SKILL:apply}} <report>                      | {{SKILL:open-plans}}                                       |
| merge-gate    | merged                                                                          | {{SKILL:open-plans}}                          | —                                                          |
| setup         | staged changes exist                                                            | {{SKILL:commit}}                              | —                                                          |
| setup         | status report found a setup-fixable problem                                     | {{SKILL:setup}} <setup argument>              | {{SKILL:setup}} <second setup argument>                    |
| cleanup       | staged removals exist                                                           | {{SKILL:commit}}                              | {{SKILL:setup}}                                            |
| cleanup       | config values referred to setup                                                 | {{SKILL:setup}}                               | —                                                          |

<!-- next-steps-table:end -->

These end states carry no generic fallback row:

- a `setup` run with nothing staged, unless it is a `setup status` report that found a
  setup-fixable problem;
- a `cleanup` run whose mandatory report found nothing to carry over, delete, or refer on;
- a `capture` run that created no issue: there is no next-step fallback;
- a `triage` run whose every decision is `reject`: the decision is final and nothing follows it;
- an `investigate` run that ends in no bug, deliberately no action, or a pending product decision —
  the documentation row covers a documentation gap, never a non-finding;
- a delivery that **merged** the branch rather than retaining it, in `apply`, `build`, `fix`,
  `refactor`, `docs`, `maintain`, and `iterate`: the checkout is back on the base branch, so there
  is no head a pull request could be opened from. An associated unfinished plan package may still
  supply a candidate through the selection above; a report a `build`, `fix`, `refactor` or
  `maintain` run wrote takes its `delivery merged` row, behind that package; and the retrospective
  slot still applies;
- a `commit` run with nothing staged, a commit a hook blocked, or a commit on the base branch
  itself.

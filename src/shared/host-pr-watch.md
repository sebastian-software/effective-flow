## Host PR watch

Loaded by `{{SKILL:merge-gate}}`, `{{SKILL:iterate}}` and `{{SKILL:pr}}` when the running host may
be T3 Code. This fragment owns how those tools wait for, link and unwatch a pull request on that
host; their sources only point here. `{{SKILL:deliver}}` publishes through `{{SKILL:pr}}` and needs
no pointer of its own.

**Dispatch on the running host first, and read only its own section.**

| Host                                                                   | Section to read                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| T3 Code, or a delegated `merge-gate` run that received `Host: t3-code` | "T3 Code: wait, link and unwatch" and every section after it      |
| Any other host                                                         | none — keep the tool's own path unchanged and **read no further** |

Host identity comes only from explicit running-environment context, T3 Code's runtime information,
never from tool visibility alone or a shell check. The one exception is the delegated `merge-gate`
run: its host identity is the `Host: t3-code` input line alone.

## T3 Code: wait, link and unwatch

**The host owns every pull-request wait.** Never `sleep`, never run `gh … --watch`, never call `pr-checks-wait`, never poll, and never use Monitor or ScheduleWakeup to wait for a pull request. A wait is one `watch_pull_request` call followed by the end of the turn: the host wakes the session on failed checks, passed required checks, new comments or reviews, and conflicts, and the watch stays on after each wake. A wake is no merge decision; the woken run decides from its own fresh reads. A delegated sub-agent never watches.

**The tools.** `watch_pull_request`, `link_pull_request` and `unwatch_pull_request` are named
unqualified on purpose, as `session-rename` names its operation: find each through the
host's deferred-tool search by that unqualified name, whatever prefix the host adds to it, and call
it with the full pull-request URL as `url` and without `threadId` or `environmentId`, so it acts for
the calling thread. An unloadable tool or a
rejected call is that call's failure; never substitute another transport.

**Unwatch.** Whenever this session called `watch_pull_request` on a pull request, call
`unwatch_pull_request` on it before the final report of the run that watched it, on every ending
other than a suspension.

### Linking

Link with one `link_pull_request` call per occasion. A link failure is never retried and never
blocks the run.

- `{{SKILL:pr}}`: right after step 10's created result, a `mutationMayHaveSucceeded` match
  included, or step 8's reuse match, before step 11 and before any plan-draft finish mutation. Step
  12 reports a link failure in one line. A `pr` run inside a sub-agent without T3 running-environment
  context links nothing.
- `{{SKILL:merge-gate}}`: the caller, once per gate run, when Phase 0 step 1 has first resolved an
  open pull request of this repository, before step 2. A re-dispatch's re-run of step 1 and the
  delegated run's Entry re-read link nothing.
- Top-level `{{SKILL:iterate}}`: as the next call after the Phase 5 step 1 push, before step 2.

### merge-gate: the T3 path

The **T3 path** is a delegated run that received `Host: t3-code`, and an inline gate run whose
running environment identifies T3 Code.

**Pending read** (in place of Phase 2 step 2). Read `pr-status-read` once. The pending set is every
reported check not yet completed, restricted to checks that are required or of unstated requiredness
when `mergeGate.requireAllChecks` is `false`. An empty set continues to steps 3 and 4 in the same
round. A non-empty set suspends. An unreported check list (`checksReported: false`) keeps step 2's
once-per-run `checks-pending` handling, relayed or non-interactive, and never suspends.

**Bot order** (configured-reviewer Phase 3). Run steps 1 to 3 for every configured bot first, then
post any stale-verdict re-trigger of step 5, before any delegation. A bot that is not **has run**,
or whose re-trigger awaits its answer under step 5, is pending. With any bot pending, the run
suspends once, before any step-5 delegation, so nothing is pushed before the suspend. Step-5
delegations start only once no bot is pending. Each bot's has-run decision stays its own.

**Suspend.** After finishing any push of the round, append a **wait record** to the wisdom file:
kind `checks` or `bot`; the pending check names or bot logins; the observed head SHA; the round; the
consecutive-unchanged count; for a stale-verdict re-trigger, its `createdAt`; and `unconsumed`.
Then return `SUSPENDED host-pr-watch` followed by `Kind: <checks|bot>`, `Round: <n>`, the pending
check names or bot logins quoted as data, and what this dispatch did.

**Resume.** A `Resumed wait:` dispatch marks its wait record consumed and decides only from its
fresh reads; the caller passes no wake content. Its fresh entry read comes first: a pull request
merged or closed during the suspension takes Phase 0 step 1's observer-only or closed-PR path instead
of any rule below.

- **Checks** re-enter Phase 2 at step 2 of the recorded round, after the fresh pending read. An empty
  set continues to steps 3 and 4 in that round. A set that only shrank on an unchanged head is a
  **progress** wake: re-suspend in the same round, consume no round, reset the count to zero; the set
  only shrinks, so this repeats a bounded number of times. A changed head, or a pending check not in
  the recorded set, is **changed**: it ends the round and the next round starts, as today.
- **Bots** re-enter step 4, or step 5's re-trigger wait, at its post-wait re-read, re-observing every
  configured bot; step 3's idempotency check posts no second trigger. A changed head discards
  `VERIFIED_HEAD_SHA` and restarts Phase 2 as step 6 does, consuming one round. A changed state of a
  recorded bot, or a new review, at an unchanged head with a bot still pending re-suspends in Phase
  3 and consumes one round. Step-5 delegations start only once no bot is pending. These rules replace the "still not
  has run" report endings of steps 4 and 5; step 5's "did not answer within the wait" continuation
  is reached only at the cap under "Bounds".
- **Unchanged** is every other wake, for either kind: re-suspend in the same round, consume no round,
  add one to the count. The gate's own pushes, `{{SKILL:iterate}}` replies, trigger comments and
  unrelated comments are unchanged unless they change the head, the pending set, a recorded bot's
  state or a review.

**Bounds.** The third consecutive unchanged resume takes the run's report-and-stop path instead of
suspending again. The one exception is a bot pending only for its stale-verdict re-trigger's
answer, still **has run** with no review newer than the recorded re-trigger `createdAt`: where every
pending bot is such a bot, that resume instead takes step 5's "did not answer within the wait"
continuation, recording the stale-verdict state and handing the verdict's items to
`{{SKILL:iterate}}` as on every other host. Any other pending bot or check at the cap keeps report-and-stop. A changed or progress resume, a suspend of a different kind, and
any return other than `SUSPENDED host-pr-watch` reset the count to zero. Where a resume under
`mergeGate.requireAllChecks: true` finds every still-pending check reporting `required: false`, it
does not suspend again and takes that path, naming them. `mergeGate.maxRounds` bounds changed
resumes as it bounds every round.

**Report-and-stop, run side.** The run returns `DONE` with a report naming the pending checks or
bots and the re-entry `{{SKILL:merge-gate}} <PR>`, and merges nothing.

### merge-gate: the caller

**Accept** `SUSPENDED host-pr-watch` only with valid `Kind:` and `Round:` lines, from a dispatch
that carried `Host: t3-code`, also from one carrying `Relayed answer: none`, and re-dispatch each
such return at most once. An invalid one is reported and ends the gate: dispatch nothing more,
delete the wisdom file, and unwatch the pull request if this session watched it. A gate run may
suspend any number of times; only "Bounds" limits the sequence.

**Watch.** On the first suspension of a gate run, call `watch_pull_request` once; later suspensions
of that gate run call nothing, because the watch stays on. Before ending the turn, print one visible
line naming the pending wait, stating that the suspension has no time bound on T3 Code and that the
user can continue or stop. It also warns, where none of the pending checks is required, or for kind
`bot` where a pending bot's has-run signal is a configured `.check` that is not required, that such
a pass may not wake the gate. Then end the turn.

**Wakes and requests.** Route each wake to the suspended gate run of the pull request it names. A
wake for a pull request with no suspended gate run, or while no suspension awaits re-dispatch, such
as while a relayed question is open, re-dispatches nothing; restate any open question. While a
suspended gate run for this pull request exists in the session, `{{SKILL:merge-gate}} <PR>` or a
request to continue resumes it. A request to stop or abandon ends it: report the recorded wait,
dispatch nothing more, delete the wisdom file, unwatch. While a suspended gate run for a pull request
exists in this session, no fresh gate run starts for it. A fresh gate run on T3 Code names in its
report every other wisdom file that still holds an unconsumed wait record for its pull request, as an
orphan for `{{SKILL:cleanup}}` or the user, and changes none.

**Re-dispatch** with `Resumed wait: host-pr-watch; kind=<checks|bot>; round=<n>` from the return,
keeping the suspended dispatch's `Relayed answer:` line unchanged, `none` included, as for a
`BLOCKED-USER` re-dispatch: re-run Phase 0 step 1 for the observer-only flag, ending where that read
ends (report, delete the wisdom file, unwatch). Otherwise pass `Observer-only re-entry:` from that
read and `Caller limits:` as the union of earlier limits, and keep the other input lines, minus
`Completion answer:` in observer-only mode. Only this re-dispatch carries `Resumed wait:`; every other
re-dispatch of the gate run drops it. A non-interactive run takes the same path and stays
`non-interactive`.

**Report-and-stop, caller side.** Where `watch_pull_request` cannot be loaded or is rejected,
Forgejo included, or where the caller is itself a delegated sub-agent and so never watches, report
the suspension's payload as data with the re-entry `{{SKILL:merge-gate}} <PR>`, dispatch nothing
more, delete the wisdom file, and unwatch if this session watched. It merges nothing.

**Inline run.** A top-level inline gate run records the wait as above and follows this caller
section itself: watch once, the visible line, end the turn, stop on request, unwatch, report-and-stop.
On each wake it continues in this session from its wisdom file with fresh reads, under the same
round, unchanged-wake and optional-check rules. An inline run that is itself a delegated sub-agent
never watches and takes the caller's report-and-stop path.

### iterate: top-level wait

A **top-level** `{{SKILL:iterate}}` run carries neither a body delimiter nor a `Run state:` line.
On T3 Code this wait replaces Phase 1.5 step 5's single blocking wait and the Rules' "wait at most
once"; the cap of three unchanged wakes bounds it instead. When its T3 Code Phase 1.5 question is
answered `Wait`, call `watch_pull_request` once. Where it cannot be loaded or is rejected, end the
run with step 5's report naming the running reviewers before any wait line: no sleep, no other
transport. Otherwise print one visible line naming the running reviewers, stating that the wait has
no time bound and that the user can continue or stop, and end the turn. While this run is suspended
in its Phase 1.5 wait, on each wake for this pull request, or a request to continue, re-read once as
Phase 1.5 step 5 does and observe again:

- every reviewer finished: continue into Phase 2 with what they produced;
- a reviewer still running: re-suspend without asking again or calling the watch again. A wake whose
  re-read changed no reviewer's state or evidence is unchanged; after three consecutive unchanged
  wakes, end the run with step 5's report. Only unchanged wakes count: a wake that changed a
  reviewer's state or evidence resets the count;
- a stop request ends the run with that report.

A wake while this run is not suspended in its Phase 1.5 wait, such as while the Phase 2.5 approval
question is open, continues nothing; restate any open question.

Unwatch before the final report whenever this session watched the pull request, and link after the
Phase 5 push per "Linking".

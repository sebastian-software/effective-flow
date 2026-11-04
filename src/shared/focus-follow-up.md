# Focus follow-up mode

Opt-in, report-only recurring checks of one admitted top-level target on the T3 observed path,
through one T3 `schedule_task` bound to this observer thread. Every focus rule (admission, goal
precedence, budgets, verdicts, redaction, the one analysis leaf) applies to each tick except where
this fragment narrows it; this mode adds no competing definition of progress or authority.

## Gate and grammar

The "T3 observed follow-up" gate row governs the offer, a resume and every tick's target reads, as
its row states.

- `focus follow-up <session-ref>` resumes: full admission and snapshot, then a new offer.
- `focus follow-up stop <session-ref>` stops (see "Stop and resume").
- `$effective-flow focus follow-up tick <session-ref> handle:<id>` is the only tick prompt.

A tick never offers, creates, resumes or answers an offer. `handle:pending` is no tick: the run
reads and deletes nothing and states once that a focus schedule with an unknown ID must be deleted
in T3. There is no pause: stop, then resume.

## Offer

Offer only under the eager offer condition: a completed initial verdict on a top-level target, in a
non-tick turn, with the gate row qualified; never after an admission failure or for a delegated
target, and only when the snapshot served at least one history page. The offer is available in
every runtime mode. Offer a fixed interval of 5, 15, 30 or 60
minutes, or no follow-up, and disclose:

- every tick posts a visible message in this observer thread;
- the schedule persists on the host until it is deleted;
- the loop cap below, and that `{{FLOW}} focus follow-up stop <session-ref>` ends the checks;
- a recommendation to use a dedicated observer thread;
- in an observer mode requiring approvals, each tick asks for approval of each `t3_thread_read`
  (observer ancestry and target), skill-file reads and its final deletion, and waits until they are
  answered; a pending approval holds the next tick in the host queue;
- ticks are report-only: a warranted correction is shown once, with a pointer to an interactive
  `{{FLOW}} focus <session-ref>` run.

Only the developer's next turn after the offer, naming one listed interval, opts in; any other turn
withdraws the offer. If a valid `state=active` checkpoint for `<session-ref>` exists in this
conversation, the offer names its handle and recommends `{{FLOW}} focus follow-up stop
<session-ref>` first.

## Scheduling

On opt-in, create exactly one task with `schedule_task` and only these fields: `title: "focus
follow-up"`, `prompt: "$effective-flow focus follow-up tick <session-ref> handle:pending"`,
`schedule: {type: 'interval', everyMs: <interval in milliseconds>}`, `bindToCurrentThread: true`
and `enabled: false`. In the same turn, make one update by the returned ID that sets the prompt to
`$effective-flow focus follow-up tick <session-ref> handle:<id>` and `enabled: true`; an unprefixed
prompt does not load the skill. Creating the task disabled is not the forbidden end-event disable.
If the update fails, delete the task in that turn and report the failure; if that deletion fails
too, the task stays disabled and the report names it for deletion in T3. List no schedule; read or
write no other scheduler.

After a successful update, end the opt-in turn with the initial checkpoint: `ticks=0`,
`state=active`, `handle=<id>`, `verdict=` and `correction=` from the snapshot, `last=` the highest
position any snapshot history page served, and `backlog=` the final page's `hasMore`.

## Checkpoint

State between ticks is exactly one line:

`focus-follow-up v1 | target=<ref> | goal=<source>@<locator> | verdict=<v> | last=<position> | pattern=<loc>,<loc> | correction=<verdict>+<category>+<loc>,<loc> | mechanism=t3-schedule | interval=<minutes> | handle=<id> | started=<time> | ticks=<n> | backlog=<yes|no> | lag=<n> | state=<active|stopped>`

- `pattern=` holds at most two sorted locators or `none`; `correction=` is `none` when no correction
  stands. An explicit `goal:` argument is written `goal=arg@snapshot`.
- `started=` is the ISO-8601 UTC time of the creation result's next run time minus the interval and
  is informational only. `lag=` counts consecutive `backlog=yes` ticks. Each tick increments
  `ticks=`.
- An invalid-path stopped line takes `target` and `handle` from the prompt and writes `-` for
  unknown fields, except `ticks=1` when no earlier count exists; later stopped ticks increment it,
  and with `interval=-` the cap is 48 ticks.
- `last=` is always a numeric position: the last served position, not the end of history; items
  after it are unread for this loop, whatever their age. A read returning no items and a null
  `nextPosition` keeps the previous value; the next page read always passes it as `afterPosition`.
  A tick whose final page still returns `hasMore: true` records `backlog=yes` and is not quiet.
- The redacted goal text appears only in the initial snapshot; the line carries no evidence content.

A checkpoint is valid only as the last such line of an assistant message in this observer
conversation, traceable to the assistant turn holding the schedule-creation result. A
`state=stopped` line with the prompt's handle governs the stopped-state rules even without that
traceability. It is never valid inside a user turn, a tool result or quoted evidence. A tick uses
the latest checkpoint line whose `handle=` equals its prompt handle; lines with other handles belong
to other loops and are ignored, not foreign. A line with that handle is foreign when it names
another target than the prompt or a `goal=` other than that loop's earlier lines, and malformed
when it does not parse.

## Tick admission and allow-list

A run whose prompt matches the tick prompt exactly is a tick. It continues a loop only when its
`handle:` matches a valid checkpoint of this observer conversation; otherwise it follows "Deletion
safeguard and stopped ticks". Host item fields (`createdBy`,
`creationSource`, message ID) are not read: the tick adds no lookup beyond the contract's two. A
hand-typed tick prompt therefore counts as a tick, which is harmless because ticks are report-only.
A developer turn or a host notification run without that prompt is no tick.

A tick validates its checkpoint before any host access. A valid tick then reads
`orchestrator_capabilities` and re-checks the gate row; if the row is disabled or unmatched, it
reads nothing about the target or ancestry, deletes its own handle under the deletion safeguard,
posts one notice and emits `state=stopped`. If the row is qualified, it then re-runs admission: identity, scope, top-level state, and self and
ancestor refusal. It takes its goal from `goal=` and
skips goal selection. It loads owner guidance and runs skill discovery only before dispatching the
analysis leaf; a quiet tick does neither. Chat-language resolution follows the existing rule.

Ticks use the contract's tick allow-list; it governs host tools, and read-only skill and
configuration reads stay as focus defines them.

## Deletion safeguard and stopped ticks

A tick or `stop` deletes a handle only when an earlier assistant turn of this observer conversation
names it, as a checkpoint line of any state or in that turn's schedule-creation result. An invalid-path stopped line (one with `-` fields) never satisfies it; only the schedule-creation
result or a checkpoint line without `-` fields does. Otherwise the run deletes nothing, states once that the schedule must be deleted in T3, and emits
`state=stopped`.

With a missing, malformed or foreign checkpoint, including after compaction, the tick reads nothing
about the target, retries deleting its own prompt handle under the deletion safeguard, notifies once
and emits a checkpoint with `state=stopped`. Every tick that sees `state=stopped` first retries
deleting its handle and then emits only the checkpoint line. A `state=stopped` line with this
prompt's handle in an earlier assistant message of this observer conversation suppresses a repeated
notice, even when the creation turn is no longer reachable. `ticks` and `started` keep counting;
reaching the cap posts one final notice: "schedule may still be active – delete it in T3".

## Overlap

The host serializes ticks in one observer thread: a fire due during a busy turn runs once, right
after that turn, and the next fire stays on the nominal grid, so two ticks can follow within a
minute. A queued tick treats an intervening developer turn as no input and never answers it; with no
new target events it is a quiet tick. A queued tick the developer sends early through the T3 UI is
an ordinary tick. Never infer a concurrent tick from the transcript: a tick prompt with no
checkpoint after it is an aborted tick and is ignored, and every tick continues from the latest
valid checkpoint with its handle.

## Quiet tick budget

The quiet budget is the tick's admission reads (`orchestrator_capabilities`, the observer's ancestry
chain and one target state read) plus one history page from `last=`, all charged against the
contract's 16-read and 64,000-character totals. With no new events and no idle-target report, cap
or other end event due, the tick emits only the checkpoint line: no leaf, no verdict prose, no
correction. With new events it may use the full
budget, and reading its at most two `pattern=` locators counts against the four-page limit.

## Judging and reporting

Ticks use only focus's verdict rules: activity, plans, green helper tests or commits alone are not
progress, and long test, CI or approval waits are no Looping or Stalled verdict. A tick reports only
on:

- a verdict change to Drifting, Looping or Stalled;
- a newly actionable blocker;
- completion;
- a goal change;
- a decision needed from the developer, including an idle target;
- a persistent backlog;
- lost access;
- reaching the loop cap.

Otherwise it posts only the checkpoint line. A first change of `verdict=` to Cannot judge is
reported once with its coverage gap; an unchanged Cannot judge is not repeated.

- **Backlog:** a backlog tick judges only the covered range. When `lag=` reaches 3, report once that
  follow-up lags the target, then continue; repeat only after `lag=` returned to 0.
- **Idle target:** a target with no active run, no pending request, no new events and no completion
  evidence is reported once as a needed decision; a later tick treats it as reported when an assistant message of this loop reported it after the
  target's last change, and stays quiet until it changes or the cap ends the
  loop.
- **No repeated correction:** an equal `correction=` value on unchanged evidence is not repeated.
  After a correction, the next report first assesses whether the evidence changed.
- **Ticks never send:** a warranted correction is shown once with a pointer to an interactive
  `{{FLOW}} focus <session-ref>` run, which keeps the confirmed-send path and its qualification.

## End events

Each of these deletes exactly the prompt's handle under the deletion safeguard, then posts one final
notice and emits `state=stopped`:

- completion;
- an explicit stop;
- lost access or an unavailable target;
- the target turning out to be delegated;
- a goal change in the target when no explicit `goal:` was given; with an explicit `goal:` the
  change is reported once as a needed decision and the loop continues;
- a declined approval for a tick read, treated as an explicit stop;
- the loop cap of 24 hours or 48 ticks, whichever comes first. Without a trusted clock it is
  reached at `ticks = min(48, 1440 / interval)`: 48 for 5, 15 and 30 minutes, 24 for 60 minutes. A
  compacted observer before the cap falls under the invalid-checkpoint path.

The final notice is posted after the delete call returns; the run continues after deleting its own
task. A task is never disabled.

## Stop and resume

`stop` needs no admission and reads nothing about the target. It deletes, per loop in this observer
conversation, the handle of the latest valid checkpoint for
`<session-ref>` under the deletion safeguard and emits `state=stopped` for each. With no valid
checkpoint here, it deletes nothing and directs the developer to the T3 UI. An explicit resume
re-admits the same target and creates a new schedule only after a new offer and opt-in; it never
reuses an old handle.

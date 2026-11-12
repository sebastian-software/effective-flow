## Planning batch

This rule gathers a planning run's decisions into one user round and sets how much review the
answers receive. The loading workflow names its gap step, validation step, internal review step and
the artifact's open-points section.

### Default coverage

The gap step, the validation step and the internal review step run on every run. In an interactive
run the deep review (`{{SKILL:plan-review}}`) is user-requested depth: it is offered only after the
batch round and its ladder, never run as a default step. A user's explicit request for a full
re-review or for the deep review is honored as user-requested depth. An unattended run keeps its
own deep-review site.

### Deferral

The gap step incorporates every directly resolvable gap without asking. It writes each
decision-requiring point into the open-points section, starting the entry with the pending marker
`Pending batch:` (German artifact: `Offen bis zur Sammelrunde:`). The validation step's decision
needs join the batch the same way. The internal review step receives the pending points as known
open points and does not report them again as findings; its own decision-requiring findings,
including critical findings that still need a decision after its revision, join the batch.

### Batch round

After the internal review step, every pending point reaches the user in one round, before
completion and before the deep review is offered, in the `{{SKILL:plan-review}}` Phase 3 decision
format. Consecutive ask calls with no analysis in between count as one round when the host caps
the questions per call. With no pending point there is no round.

An answered point is incorporated into its artifact section and its open-points entry removed. An
unanswered point or "Decide later" becomes a concrete open point with a re-entry note. Before
completion no entry keeps the pending marker. A point the internal review classifies as Critical,
a gap-step point included, stays blocking and is never downgraded: left undecided, it becomes a
blocking open point, the review result is `Revision required`, in an interactive run the deep
review is not offered, and the completion phase still writes and reports the artifact with its open
points.

### Planning ladder

```lazy-include
review-depth
when: the batch answers are worked in and the planning ladder's trigger check runs
```

Of `review-depth`, only triggers (a) to (d) and the floor boundaries apply, to plan sections
instead of files: a section stands for a file and a batched point for a corrected finding; (b) is
an answer that changed a section naming a floor boundary. Then:

- no trigger: no new judgment; the review section records the incorporation;
- (a), (c) or (d): a scoped internal-review judgment of the changed sections;
- (b): a full internal-review judgment.

A new decision-requiring finding from that judgment becomes an open point without a new round;
only a new Critical finding opens a second round, in the same format, for those findings only. Its
answers pass this ladder once; a finding from that pass becomes an open point, an undecided
Critical one stays blocking as above, and no third round follows.

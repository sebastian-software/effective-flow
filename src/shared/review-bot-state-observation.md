## Automatic reviewer state: observation

This is the deferred half of the loaded "Automatic reviewer state": how one configured reviewer's
state is resolved against a fresh read, what each state permits, and what a consumer records. The
login matching, the three states and the verdict rules stay in that eager block.

### Precedence

Resolve the state per reviewer, in this order, and stop at the first rule that resolves it.

1. **A configured check context — the primary signal.** When `mergeGate.bots.<login>.check` is set,
   look its value up in the normalized `checks` array of the same `pr-status-read` that supplied the
   head. Match it against an entry's `name` field: compare the whole value after trimming surrounding
   whitespace, and let no other field of the entry take part. A commit-status context and a check-run
   name arrive in that one field alike, so a status context such as `recensor/review` and the name of
   a workflow job are looked up identically and need no distinction here.
   - a matching entry with `status: PENDING` → **running**;
   - a matching entry with `status: COMPLETED` → **has run**, whatever its `conclusion`. A red review
     is a review: the conclusion states what the reviewer found, not whether it ran, and reading it
     as "has not run" would trigger a reviewer that already answered.
   - **more than one matching entry** → any match with `status: PENDING` means **running**, otherwise
     **has run**. `pr-status-read` reports only the latest run per check identity, so several entries
     match when distinct identities share the name or a group stays uncollapsed: a missing or tied
     `databaseId`, two same-named runs of one workflow run or check suite, or an incomplete identity, keeps every run of that group in the list.
   - **no matching entry in a reported list** → **not started**. A context that never appears is
     indistinguishable from one that is about to appear: a misconfigured value, an app that is not
     installed, and a queued run whose status is only set once a worker claims it all look the same
     from here.
   - **no list at all** is a different case. When `pr-status-read` reports `checksReported: false`,
     the primary signal is unavailable rather than negative, and the reviewer falls through to rule 2.
     Forgejo reports a rollup where its combined commit-status endpoint returns one, so a configured
     `.check` is looked up there exactly as on GitHub — a Gitea status `context` arrives in the same
     `name` field a check-run name does. Where that endpoint returns an empty or null list,
     `checksReported` is `false` and every reviewer of that pull request takes the fallback path,
     however carefully its `.check` is configured.
2. **The newest output versus `headCommittedAt` — the fallback.** It applies to a reviewer with no
   configured `.check`, and to one whose primary signal was unavailable. Take that login's newest
   dated output across **four** surfaces — its comments, its review threads, its thread replies, and
   its **submitted reviews** — and compare that instant against `headCommittedAt` from
   `pr-status-read`. The first three state a `createdAt` and the fourth a `submittedAt`; all are
   RFC-3339 strings and are compared as instants, never as text. An instant later than
   `headCommittedAt` → **has run**. Otherwise, and whenever either side is absent, → **not started**.
   - **A submitted review is proof that the reviewer ran**, which is why it is the strongest of the
     four: it is a published verdict rather than a by-product, and a reviewer that publishes one and
     nothing else was invisible to this rule before. A review with **no** `submittedAt` is a pending
     draft, not output, and contributes no instant here at all. **That absence is reported on both
     forges**, which spell it differently — one omits the field, the other serialises a zero instant
     the helper normalizes to absent — and the `PENDING` state token is the portable cross-check for
     a consumer that wants a second signal, since both providers emit it.
   - This is a **block-to-pass change** on a project with no configured `.check`: a reviewer that
     publishes reviews flips from **not started** to **has run**, which lets a gate merge a pull
     request it previously held. The direction is legitimate — the reviewer's own verdict is the
     evidence — but it is a behavior change rather than a visibility fix.
   - **This rule never reports running**, and a consumer must not read it as if it could. It observes
     output, and a reviewer that has started without writing yet is indistinguishable from one that
     has not started at all. The fallback therefore separates **has run** from **not started** and
     says nothing whatsoever about what is in flight.
   - **An in-place edit moves no instant, on any of the four surfaces.** A reviewer that rewrites one
     sticky comment keeps that comment's original `createdAt`, and a reviewer that rewrites a review
     body keeps that review's original `submittedAt` — the id does not move either, so an assessment
     record keyed on it goes blind at the same moment. The reviews surface therefore narrows this gap
     rather than closing it: a reviewer whose output for this head is a **new** review is now seen,
     while one whose entire output is an edit of an older item is still not. That residual is the
     concrete reason the primary signal exists.
   - Emoji reactions are not readable through the helper and never count, whatever their timing. A
     reviewer that acknowledges that way has no usable signal on this path at all — though a
     reviewer that acknowledges by reaction and then submits a review is seen through that review.
3. **Anything unprovable counts as not started.** A missing timestamp, a check context that never
   appears, an unreadable field, an author that cannot be established: none of them prove a run.
   Fail in this direction and in no other. What that costs differs by consumer: a gate pays a
   redundant trigger and a blocked merge whose reason it can name, while a guard pays the protection
   it would have given — an unprovable state holds no run. What the opposite direction costs is the
   same for both, and worse than either: a head nobody reviewed, merged.

### One read, one head

Observe every reviewer against **one** fresh read, and use the check list, `headCommittedAt`, the
threads, and the **submitted reviews** of exactly that read. A state assembled from two instants describes no state the pull request
ever had. The result belongs to that read's head SHA and to nothing else: a new commit invalidates it
for every reviewer, however recently it was observed.

### What each state permits

The state is shared; what it gates is not. Each entry therefore states what is true of the state
itself first, and what each consumer role does with it second.

- **has run** — the reviewer's output for this head exists and may be read, classified, and answered.
  A gate counts this reviewer's merge precondition as satisfied and triggers it again only through the
  single exception its own stale-verdict re-trigger states; a guard lets its run continue.
- **running** — the reviewer's output is coming, and no consumer may ask it to start again. A trigger
  aimed at a reviewer already working either queues a redundant second run or, for a reviewer that
  reads a mention as a fresh request, discards the one in flight. A gate waits and keeps the merge
  blocked until the state changes; a guard holds its run. Waiting is one bounded blocking wait
  followed by one re-read, never a poll loop.
- **not started** — nothing about this reviewer is proven for this head, and a configured trigger may
  be posted. A gate blocks the merge on it, because merging here would merge a head the reviewer
  never saw. A guard does **not** hold its run on it: a reviewer that may never start is nothing a
  run can usefully wait for. One state, two consequences, each correct for its consumer.

A consumer may additionally read a **not started** reviewer as in flight when a trigger comment for
that reviewer exists for this head — whoever posted it, an earlier gate round or a person by hand.
That is evidence about the request, not about the reviewer, which is why this contract keeps it out
of the state itself: a posted mention proves that someone asked, never that anything is running.

### Record the evidence, not only the state

Every consumer records, per reviewer, which rule resolved the state and the concrete value it read —
the check name with its status, the two timestamps, or the field that was missing. A merge this
contract blocks and a question it raises are explainable only with that; "the reviewer has not run"
without a reason sends someone looking in the wrong place.

### This narrows the window; it does not close it

A terminal check states that the reviewer finished, not that everything it wrote has already
arrived — a thread **and a submitted review** can each land moments later. This contract makes that
window small; closing it belongs to the consumer, and each one closes it with a read of its own.
Nothing here replaces that read, and nothing here gates anything: this block observes state, and a
merge is not its to hold.

Where each consumer discharges that obligation, so the two stay in step with this contract:

- **`{{SKILL:merge-gate}}`** in its Phase-4 merge preconditions, which re-read both surfaces. A
  thread that arrived after the round's own observation is one no round assessed, and a
  changes-requested review that landed after it is a verdict no round assessed; each blocks the merge
  and sends the run back for another round — the gate never merges past a reviewer finding nobody
  reached an outcome about, on either surface.
- **`{{SKILL:iterate}}`** through the fresh read it performs before every write, which is what keeps
  a late thread out of a reply it would otherwise contradict.

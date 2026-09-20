## Provider-settled threads

This fragment defines a **provider-settled** review thread for `effective-flow merge-gate`, its only
consumer. It loads when the forge preflight of Phase 0 reports both `reviewThreadReplies` and
`reviewThreadResolution` unsupported, and it applies on such a forge only. A forge that supports
either thread write never loads it and keeps the answered-and-resolved path of condition 6
unchanged. On such a forge no run can reply to or resolve a thread, so an implemented bot thread
could never satisfy condition 6, and a fresh run would hand the same still-open thread to
`effective-flow iterate` again and again. The reviewer's own later approval, read from forge state,
settles it instead. It settles automatically, without an operator question, exactly as a later
approval clears a changes-requested verdict under condition 10.

### Definition

An unresolved thread whose author is a login in `mergeGate.bots` under "Matching a configured
login" of the loaded "Automatic reviewer state" is **provider-settled** when every one of these
holds on one read batch:

1. The thread carries a `reviewId`, and that id names its **parent** review in the submitted-review
   read. Compare the two ids as strings.
2. The parent review's author is the **same reviewer** as the thread's author under "Matching a
   configured login", including spellings that collapse to one reviewer. One bot's approval never
   settles another bot's thread.
3. That reviewer's **latest submitted** review for `VERIFIED_HEAD_SHA` is `APPROVED`. "Latest"
   follows the supersession rule of "Automatic reviewer state", with one addition for this use: only
   **submitted** reviews compete, so `PENDING` and `REVIEW_REQUESTED` rows are ignored.
4. That approval is a **different review** from the parent. A note inside the approving review
   itself is therefore never settled by it.
5. The approval's `submittedAt` is **strictly later** than the parent's `submittedAt`. A change
   request followed by an approval at the same head is settled, consistent with condition 10.

**A dismissal alone settles nothing.** The helper folds every dismissed review into `DISMISSED`
and discards its original state, so a stale approval dismissed on push cannot be told apart from a
dismissed change request. Only a later approval settles. A latest review that is `COMMENTED` or
`UNKNOWN` settles nothing either, and a new change request at the verified head leaves the thread on
the normal path.

**Fail closed on every missing link.** The thread is not settled, and stays on the normal path where
it blocks, when: the thread has no `reviewId`; its parent review is absent from the review read;
the parent's author is a different reviewer; either review is missing its `submittedAt`;
`prReviewsRead` is unavailable, in which case nothing is settled and the gate keeps its existing
degradation; or the latest review is undecidable, including two reviews from one reviewer at the
verified head with identical `submittedAt`.

### Which read batch it is evaluated on

Evaluate the predicate on **one batch** of threads and reviews read together, never on a mix of
reads. In **Phase 3** step 5 use the step-4 re-read, or a fresh thread-and-review read where step 4
took none; never rely on Phase 1's read after a restart. Conditions 6 and 7 re-evaluate it on the
**Phase 4** batch the merge decision relies on, and the Phase-6 report names what that batch
settled.

### In-run exclusion in Phase 3

On such a forge, Phase 3 step 5 hands neither a provider-settled thread nor a thread whose durable
key already holds `implemented` from this run to `effective-flow iterate`. The second half closes the
window between iterate's push and the bot's visible approval: condition 5 can report the bot as
having run before its approval is readable, and the thread would otherwise be re-delegated. Where
nothing remains, the delegation builder returns `nothing-to-delegate` and no round is used. The
thread's `implemented` outcome still clears condition 7 in the same run; if the approval is still
missing at Phase 4, condition 6 blocks.

### Report wording

Phase 6 names every thread the Phase-4 batch settled: its URL, or the statement that the provider
published none for that thread, the settling approval by review id and submission time, and the
words "left unresolved – the provider cannot resolve review threads".

For each configured-reviewer thread that still blocks on such a forge, the report names its URL (or
that none was published) and the way out. Only for a thread this run implemented is that to resolve
it in the forge's web UI and then re-run the gate, or to re-run after the bot's next verdict when it
only waits for its approval. An unassessed thread is assessed by a re-run, and a deferred or
rejected one clears only through "The set-aside confirmation"; the report never offers a manual
resolution for either, because that would bypass the assessment. It tells the operator not to reply in the thread, because a human reply would appear as a
human-authored thread and hold the human-comment guard, and it notes that Forgejo may show the
thread collapsed as outdated in the conversation tab.

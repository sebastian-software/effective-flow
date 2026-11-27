## PR write recovery

A `review-thread-reply`, `pr-comment` or `review-create` that fails with
`mutationMayHaveSucceeded: true` is **never re-sent blindly**: first re-read its own target – for a
reply `review-threads-read` and the one thread holding the answered `commentId`, for a PR comment
`pr-comments-read`, for a review submission `pr-reviews-read`. The write **counts as posted** when
that target holds an item whose author `login` equals the one `viewer-read` returned, whose `id` was
absent from the last read of that target taken before this write, and, in standard mode, whose
leading line carries the writer's marker. A posted write is handled exactly as a successful one and
never sent again; in hidden mode record a found reply per `pr-thread-ledger`, then resolve its
thread as usual. If nothing is found, repeat the write **at most once**, after that read; a repeat
that fails with the flag again is not repeated.

An unprovable re-read (no `viewer-read` login, no establishable author, a read failure) or a second
flagged failure leaves the write **unconfirmed**: repeat nothing, leave an unconfirmed reply's
thread unresolved and unrecorded in the ledger, and report "possibly posted, unconfirmed: check the
thread, review list or comment list before writing by hand". An unconfirmed reply is reported in the
summary comment or a gate-delegated run's return; an unconfirmed summary comment, review submission,
fallback comment or outside-diff comment only in the run's chat summary or return, never through a
new PR write. `effective-flow merge-gate`'s trigger posts are excluded: they follow their own recovery in
the configured-reviewer route.

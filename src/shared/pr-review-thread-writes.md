## PR review thread writes

This shared building block holds the three **write** operations on a pull request's review threads:
replying to a thread, resolving a thread, and submitting a review with inline comments. The shared
read surface they are performed against — PR resolution, the fresh thread and comment reads, the
authenticated identity, the summary comment, the marker contract, the `language.forge` and
"No AI attribution" rules, and through them the "Remote helper" reference to the helper contract in
`issue-tracker-forge.md` — stays in the "PR review comment integration" building block, which every
consumer of this fragment loads as well. `{{SKILL:merge-gate}}` loads that read surface too, but
not this fragment: it writes no reply, resolves no thread, and submits no review.

### Reply to a thread

Use the helper's review-thread reply operation. It stamps the marker
`<!-- effective-flow-iterate -->` onto the reply body from its own marker table, idempotently, so
never write that marker by hand (see idempotency). This matters beyond tidiness: the marker is what a
later `{{SKILL:iterate}}` run reads to recognize a thread it has already answered, so an unstamped
reply leaves that thread looking unaddressed and it is classified, implemented, and replied to a
second time.

### Resolve a thread

Use the helper's review-thread resolve operation. On `UNSUPPORTED_CAPABILITY`, keep the reply,
leave the thread unresolved, and note that manual resolution is needed; do not improvise.

### Submit a review with inline comments

The outbound direction. Use the helper's review-create operation (`review-create`, capability key
`reviewCreate`): **one** review submission per run, carrying a review body plus an optional array of
inline comments anchored to `file:line`. The body is mandatory, the comment array is not, so a
body-only submission is valid. Never approve and never request changes – the submission carries
comments only.

The helper stamps the marker `<!-- effective-flow-pr-review -->` onto the review body and every
comment body from its own marker table, idempotently. Never write that marker by hand: idempotency
and the `{{SKILL:iterate}}` separation are exact string matches, so a hand-written variant silently
defeats both.

On `UNSUPPORTED_CAPABILITY` – Forgejo supports none of review submission (`review-create`), a reply
into a review thread (`review-thread-reply`), or thread resolution (`review-thread-resolve`); the
last because the forge serves no resolve route, not because `tea` lacks the subcommand – fall
back to exactly one structured PR comment carrying the `file:line`
references in its text, and report the reduced fidelity; do not improvise a provider request. Build
that fallback comment with the helper's `pr-review-comment-build` operation, **not** with
`pr-comment-build`: the latter stamps `<!-- effective-flow-iterate -->`, the marker
`{{SKILL:iterate}}` reads as its own already-processed work.

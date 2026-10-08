This fragment carries `{{SKILL:merge-gate}}`'s handoff to `{{SKILL:iterate}}`: the message
contract, the `delegation-envelope` helper's build, validate and dispatch sequence with its refusals
and its sender stop, and the run-wide rules for reading what comes back. It loads when the run is
about to delegate – Phase 2 step 3 for failed checks, or Phase 3 step 5 of the configured-reviewer
route for a bot round – and what decides that moment stays in the always-loaded core: both
delegation sites, the push-before-delegation order of "Git write boundary", the Rules bullets that
fix every `build` input and forbid assembling a message by hand, and the per-head bound of "A
deferred finding gets no thread reply" that the summary-comment suppression below sustains.
`{{SKILL:merge-gate}}` is this fragment's only consumer.

## Delegation contract

Every delegation goes to `{{SKILL:iterate}} <PR>`, and this run never writes one by hand. The shipped
`delegation-envelope` helper builds each message from structured input and validates it before it
goes out, as "Building and dispatching a delegation" below states. The rules in this section are the
contract that helper implements and `{{SKILL:iterate}}` Phase 0 parses. Every message carries:

- the **item filter**, on its own line, in the exact literal form `{{SKILL:iterate}}` Phase 0 parses:
  - `Item filter: free-text-only` for a CI repair,
  - `Item filter: threads=<id>,<id>` for the bot round, with the thread IDs as read.

  The helper derives the line from the thread items it is given – `threads=` with their thread IDs
  in that order, or `free-text-only` when there are none. **A finding carried in a review body is
  free text, so it needs no third form** – the grammar is deliberately not extended, because
  `{{SKILL:iterate}}` already accepts free text alongside a `threads=` list. Which of the two forms a
  review-body delegation carries follows from how many threads travel with it, and the zero case is
  the one worth stating: a round carrying **one or more body findings and no thread at all**
  announces `Item filter: free-text-only`. It never announces an empty `threads=` list – that form is
  unparseable, and `{{SKILL:iterate}}` answers an unparseable filter with `ABORT` rather than
  guessing. A round carrying body findings **and** threads announces the `threads=` form with the
  thread IDs as read; the free text rides alongside it, which is exactly what that form already
  permits. So `free-text-only` is no longer bound to the CI repair alone, and the review-guard
  exemption below states its own grounds rather than reading them off the filter;

  The filter is mandatory in every delegation from this gate – an unfiltered delegation would
  silently pull in every open item and make the phase order unenforceable. `{{SKILL:iterate}}`
  returns `ABORT` for an announced filter it cannot parse and never falls back to an unfiltered run.
  A filter that matches **nothing** – every named thread resolved between the read and the
  delegation – is not that case: `{{SKILL:iterate}}` returns cleanly with no items and never falls
  back to processing everything;

- **one caller-supplied stable identifier per delegated item – a body-carried finding and a thread
  item alike – plus, for a body-carried finding, its provenance:** the review id, the author login,
  and the review URL. They travel in the **manifest** below and never inside the body itself.
  `{{SKILL:iterate}}` returns one item for every supplied stable identifier, and a body carries none
  by itself – so without one, a round delegating two body findings from two reviews gets back
  outcomes this run cannot map to either review, and the per-finding assessment record condition 10
  is evaluated against is unbuildable.

  **A thread item carries its identifier on its own manifest line**, above the delimiter, in the
  exact literal form `Thread item: <stable identifier> | thread=<thread ID>`, one line per thread.
  That line is part of the manifest exactly as an `Item:` line is, and it is **not** a seventh
  control line. It carries **no body span** below the delimiter, because a thread's own text is not
  handed over here – the thread ID in the item filter is what `{{SKILL:iterate}}` reads the thread
  through. The `ABORT: manifest and body mismatch` comparison is therefore untouched by it: that
  comparison stays a count of `Item:` entries against the spans below the delimiter, and a
  `Thread item:` line is never counted in it.

  **Every identifier is minted by this run's helper**, one per delegated item – a thread item's
  identifier is minted exactly as a body-carried finding's is: at least 32 characters drawn from
  `A`–`Z` and `0`–`9` alone, chosen at random, unique in the message, absent from every
  caller-supplied value, and minted freshly for **every** delegation message. It is a **per-message
  channel key**, not a durable name – the next round mints a different identifier for the same
  finding, so an identifier disclosed in a Phase 6 report, or in this gate's own return when the
  gate itself runs delegated, is worthless to whoever reads it. The **durable** key of a
  body-carried finding is the review id, plus a finding ordinal where one review carries several;
  the durable key of a thread item is its **forge thread ID**.

  Record each per-message identifier against that durable key in the wisdom file **before** the
  delegation, never after it – the identifier → durable-key map `build` returns is exactly that
  record. For a thread item it is an identifier→thread-ID mapping, and it is what conditions 6 and 7
  resolve a returned outcome back to the thread it concerns through. **Record that thread's comment
  URL on the same line** – the `url` the normalized review-thread read carries for it, which Phase
  1's fresh read already has in hand. A record keeping the thread ID alone has no link in it, and
  "The set-aside confirmation" promises the operator one to read the finding at. It is one more
  field on a record this run already writes here, never a second read later. Where the provider
  published no `url` for that thread, record the absence and let the confirmation say so; never
  synthesize a link. A body-carried finding whose review has no `url` or no `author` is not
  delegated at all: `build` refuses it as `missing-provenance`, never inventing either value. The pre-committed key set that "Returned outcome record" matches the return
  against is exactly those minted identifiers and nothing besides: a forge thread ID is recorded
  **against** an identifier as its durable key and is never itself a key, so no publicly visible
  value is in the set;

- the **body delimiter**, on its own line, in the exact literal form
  `--- caller-supplied item text follows ---`, exactly once in the whole message. Everything above it
  is this gate's own contract – all six control lines, each exactly once, plus the boundary token and
  the manifest. Everything below it is text this gate did not author: the reviewers' bodies, and
  nothing else. `{{SKILL:iterate}}` Phase 0 reads every control line from above it alone;

- the **boundary token**, above the delimiter and above the manifest, on its own line, in the exact
  literal form `Boundary token: <token>`. The helper mints it freshly for every message to the
  identifier's requirement – at least 32 characters from `A`–`Z` and `0`–`9`, chosen at random – and
  searches every body, every caller-supplied value the manifest carries, the durable keys and a CI
  repair's instruction for it as a plain substring before it is used. **The framing below the delimiter is that minted token, never a
  pattern:** an introducer line, or any stricter grammar, is something a body can state, while the
  token is admitted only once a substring search has shown it occurs in none of them, so **no
  sequence of characters a body can contain changes how it is framed**. Why the delimiter and its
  refusal are shaped as they are, the minting order, the exact scope of the absence check, and why a
  token replaced the declared byte count are in the lazily loaded examples and rationale below;

- the **item manifest**, above the delimiter: one line per body-carried finding, each in the exact
  literal form `Item: <stable identifier> | review=<review id> | author=<author login> |
url=<review URL>`. Below the delimiter stand the bodies themselves and nothing else – in manifest
  order, separated by the boundary token alone on its own line, with no separator before the first
  body and none after the last, so N findings travel behind N-1 separator lines. With no `Item:`
  line at all the message ends at the delimiter line, with nothing below it. `{{SKILL:iterate}}`
  splits that region on the token and pairs the spans with the manifest entries in order; it answers
  a region that separates into a different number of spans than the manifest declares entries with
  `ABORT` rather than pairing what it has as best it can, so a malformed message costs a round
  instead of recording an outcome against the wrong review. That comparison is a count of items, not
  of bytes, and neither end of the channel measures the region. The entries it counts are the
  `Item:` lines alone: a `Thread item:` line declares no body span and is never counted in it;

- **a body that carries the delimiter is refused, never neutralised.** The helper compares each line
  of each body against the delimiter after trimming, and a body carrying it is not delegated at all.
  Report that finding as unassessed instead – condition 10 then blocks the merge on it, which is this
  gate's fail-closed direction and the reading under which a body can never terminate its own block;

- **the comparison is against the delimiter and nothing else.** A body that states one of the six
  control lines, and not the delimiter, is delegated unchanged: the delimiter has already made it
  data, and `{{SKILL:iterate}}` reads it as body text rather than as a switch or a fault;

- the **summary-comment suppression**, on its own line, in the exact literal form
  `Summary comment: suppressed`. This is mandatory in every delegation from this gate, on the four
  grounds "PR review comment integration" states – none of them about how this run's own Phase 4
  read would classify such a comment. Under the same account the guard's identity rule already
  excludes it, but the obligation is not conditional on the mode, and neither is the line;
- the **next-step suppression**, on its own line, in the exact literal form `Next steps: suppressed`.
  This is mandatory in every delegation from this gate. A delegated round is an intermediate result
  inside this run, and only Phase 6 knows whether the gate ended merged, blocked, or out of rounds,
  so a per-round recommendation would name a step the run has not reached. `{{SKILL:iterate}}` reads
  a malformed line as suppression rather than aborting; only an **omitted** line costs one
  duplicated chat block;
- the **review-guard exemption**, on its own line, in the exact literal form
  `Review guard: established`. This is mandatory in **every** delegation from this gate, and the two
  kinds of delegation earn it differently – the mandatory rule is not one precondition applied twice:
  - a **CI repair** carries `Item filter: free-text-only` and nothing else, so the delegated run
    classifies no review thread at all and a review-in-flight guard would protect nothing. The
    exemption rests on that **scope** alone: the run's items are failing check names, which no
    reviewer is adding to. It deliberately rests on nothing about when the delegation is issued —
    Phase 2 step 3 does issue it before this run has observed any reviewer, but a body-only Phase-3
    delegation carries the same `free-text-only` filter **after** that observation, so a ground
    phrased as "before this run has observed any reviewer" would be false of one of the two and the
    filter alone cannot tell them apart;
  - a **bot round** is issued from Phase 3, after this run has observed the state of every
    configured reviewer, and it carries thread IDs, body findings, or both. A delegated run that
    re-derived that state would either duplicate this run's wait or block against a reviewer the gate
    is deliberately not waiting for. This is the ground for **every** Phase-3 delegation, including
    the body-only one whose filter reads `free-text-only`.

  `{{SKILL:iterate}}` returns `ABORT` for an announced review-guard line it cannot parse and never
  continues as an unguarded run. Omitting the line is worse: a non-interactive gate run cannot answer
  the guard's question and comes back as `ABORT: review still in flight`.

  The line stays its own and is deliberately **not** derived from `Item filter:`: a filter states only
  scope, and only the caller knows whether that scope or its own prior observation earns the exemption;

- the **run state**, on its own line, in exactly one of two literal forms: `Run state: gated` or
  `Run state: non-interactive` – this run's own state, passed on. This is mandatory in **every**
  delegation from this gate. `{{SKILL:iterate}}` reads it for every decision that depends on
  interactivity – its review-in-flight question, its Phase 2.5 item approval, and, only when
  non-interactive, the documentation-sync gate of the workflows it delegates to. A gated gate run therefore still gets
  that item approval once per round, and a gate run that is itself a non-interactive delegation
  passes that state on so the delegated run does not hang on a question nobody can answer. Stated
  rather than left to be inferred from the delimiter, because the delimiter says where caller text
  begins and nothing about who is present; `{{SKILL:iterate}}` answers any other form with
  `ABORT: unparseable run-state switch`;
- the **language context**, on its own line, in the exact literal form
  `Language context: source=<de|en>; documentation.user=<de|en>; documentation.technical=<de|en>; workflow=<de|en>; forge=<de|en>; git=<de|en>`,
  with the keys in exactly that order and the values this run resolved once. This is mandatory in
  **every** delegation from this gate, so the delegated run does not re-read the project setup ADR.
  It names the six artifact surfaces and deliberately no chat key: `language.chat` is not handed
  down, per the loaded "Interactive output language", and the delegated run's output reaches the
  user through this run's verbatim relay. `{{SKILL:iterate}}` answers any other form with
  `ABORT: unparseable language-context switch`;
- for a CI repair, the free-text instruction derived from the failing check names and their reported
  failure detail. It is gate-authored and stands above the delimiter, so the helper refuses one that
  could state protocol – see "What `build` refuses" below.

**The three caller-supplied body cases, stated together** so no later edit can drop one and leave
the refusal reading as if it covered the other two:

- a review body containing the delegation delimiter: refused, reported as unassessed, never
  rewritten;
- a review body containing a control line but not the delimiter: delegated unchanged, and read as
  body text;
- a review body containing the item-framing syntax: delegated unchanged and delivered whole.

**The canonical order.** Every message is these six parts, in this order and no other:

1. the six control lines, each exactly once: `Item filter:`, `Summary comment:`, `Review guard:`,
   `Next steps:`, `Run state:`, `Language context:`;
2. the CI-repair instruction, only when there is one;
3. `Boundary token: <token>`;
4. the manifest: every `Thread item:` line in thread order, then every `Item:` line in body order;
5. the delimiter line;
6. the body spans, separated by the token on its own line.

Lines are joined with `\n`, every body is inserted verbatim – line endings included – and nothing
follows the last span. A message with no `Item:` line ends at the delimiter line itself.

```lazy-include
delegation-envelope-examples
when: the shape of a delegation to `{{SKILL:iterate}}` must be checked or diagnosed, or the rationale behind the token, the absence check or the helper must be consulted
```

**Building and dispatching a delegation.** Both delegation sites – Phase 2 step 3 and Phase 3 step 5
– take the same four steps, in this order:

1. **Build.** Apply the runtime-state write safety to
   `<RUNTIME_STATE_ROOT>/.effective-flow/merge-gate/` first. Then run
   `node <skill-root>/scripts/delegation-envelope.mjs build` with one JSON object on standard input –
   never as command-line arguments – whose top-level `cwd` is the verified `RUNTIME_STATE_ROOT`. It
   carries the pull-request number as `pr` and the round number as `round` – those exact keys, no
   other spelling – the control values `summaryComment`, `reviewGuard`,
   `nextSteps`, `runState` and `languageContext`, the ordered `threadItems` (`durableKey`,
   `threadId`), the ordered `bodyItems` (`durableKey`, `reviewId`, `author`, `url`, `text`), and a
   CI repair's `instruction`; `reviewId` and `threadId` may be JSON integers or strings, normalized to strings. The helper derives the filter, mints, refuses and serializes as stated
   above, checks its own output, and writes the message below that directory with a snapshot of its
   manifest beside it – exclusively, never over an existing file or through a symlinked parent. A
   successful `build` returns `ok: true` with one of three statuses: `written` – the path, a
   `sha256:` digest, the ordered identifier → durable-key map and the refused items;
   `nothing-to-delegate` – the refused items and no file; or `instruction-refused` – the offending
   instruction line and no file. The last two end the delegation here, as "What `build` refuses"
   states.
2. **Record** that map in the wisdom file before anything is dispatched.
3. **Validate.** Run `node <skill-root>/scripts/delegation-envelope.mjs validate` with the same `cwd`
   and the returned path and digest. It recomputes the digest first, so text added to or changed in
   the file after `build` fails here, then re-checks the structure against the snapshot. It never
   scans the region below the delimiter for keywords.
4. **Dispatch** exactly `{{SKILL:iterate}} <PR>`, a line break, and then the validated file's content
   verbatim, with nothing added before it or after it. No return-protocol text goes with it: how the
   return is read is this run's business under "Returned outcome record", never an instruction to
   the delegated run. Only now record the outcomes of a `written` build's refused items – each
   delimiter-carrying or `missing-provenance` body as `unassessed` – because a sender stop before this point records no
   outcome from that build.

Delete the message file and its snapshot once `{{SKILL:iterate}}` has returned for good (after any
resume below), or in the run's final cleanup after a sender stop.

**What `build` refuses, and what each refusal costs.** A refusal is an outcome of the round, never a
fault of the channel:

- a body carrying the delimiter: that finding is not delegated and is reported `unassessed`, per the
  refusal above;
- a body item whose review `url` or `author` is absent (reason `missing-provenance`): not delegated,
  recorded `unassessed` exactly when a delimiter refusal is, and condition 10 blocks on it – the
  helper never synthesizes a link or a login;
- an empty or whitespace-only body: not delegated, and the review keeps the gate-internal outcome
  "Returned outcome record" assigns an empty-bodied review;
- a CI-repair instruction with a line that, after trimming, equals the delimiter or begins with one of
  the six control keywords, `Item:`, `Thread item:` or `Boundary token:` (status
  `instruction-refused`): no message is written and nothing is delegated, and the run ends at
  Phase 2 step 3 with a report naming the failing check as **not auto-repairable** – it still blocks
  the merge, and no further round rebuilds the same refused instruction;
- nothing left to delegate once the refusals are applied (status `nothing-to-delegate`): the helper
  writes no file, and this run does not delegate. Its refusals are recorded at once, because this
  path has no `validate` step to wait for.

**A sender-side failure stops the run and is not an `iterate` round.** `ok: false` from `build` or
`validate` – any error code, such as an unsafe manifest value (a present value the manifest cannot carry,
unlike an absent one), an unsafe target, or a digest or
structure mismatch – is an internal sender-contract error, and so is a helper that cannot be run at
all: the script missing from the installed build, or `node` unavailable or too old. Stop the run
before `{{SKILL:iterate}}` is invoked and report the helper's error code. Make no remote write, record
no `unassessed` outcome, and leave the round counter unchanged – it counts Phase-2 rounds and Phase-4
returns, never a delegation. Never fall back to assembling the message by hand, and do not retry: the
helper is deterministic, so a retry fails the same way.

## Returned outcome record

The configured-reviewer item receiver and its closed outcome vocabulary live under
`## Returned outcome record` in the loaded `merge-gate-configured-reviewer` fragment. They apply
only to a bot round that pre-committed item identifiers. The run-wide receiver rules below remain
available without a configured reviewer.

**The CI repair supplies no identifier, and its return is consumed elsewhere.** The receiver rule
governs identified items only. A CI repair announces `Item filter: free-text-only`, carries free text
and no manifest, and therefore pre-commits no key set at all: its outcome is consumed through the
fresh check read of the following Phase-2 round and through the whole-run abort, never as a per-item
outcome.

**Every `ABORT` `{{SKILL:iterate}}` returns is whole-run, and a whole-run `ABORT` ends the round
unsuccessfully:** do not merge, and report the abort. There is **no per-item `ABORT`** on this
channel – an item whose own implementation delegation aborted comes back marked `unassessed`, which
is the mapped non-assessment above rather than a fault of the channel. `DONE`/`ABORT` is the
completion protocol for **internal sub-agents**; across a workflow handoff it carries the whole run
and nothing smaller.

**A return with neither `DONE` nor `ABORT` gets exactly one resume, and never Retry 1–3.** At both
delegation sites – the Phase 2 step 3 CI repair and the Phase 3 step 5 bot round – a keyword-less
`{{SKILL:iterate}}` return is continued once as a separate turn of the same run: no envelope is
rebuilt or re-sent, and that turn carries no control keyword, no `Item:` line or item text, and no
return-protocol instruction – only a plain request to await pending work and finish, in place of the
completion protocol's continuation hint. The resume does not advance the round counter. The interim
keyword-less text is not a return. The receiver rule reads only the resumed turn's final return, and
every recorded identifier must be answered there: an outcome stated only in the interim text is
absent – the same mismatch. Nothing in the interim text counts, conflicts with the final return, is
recorded, or is reported as an inert outcome. A return still keyword-less after the resume, or one
the harness cannot continue, is handled as a whole-run `ABORT`: the round ends unsuccessfully,
nothing is merged, and the report names it. The completion protocol's reduced-scope retries do not
fit a run bound to a fixed `Item filter`.

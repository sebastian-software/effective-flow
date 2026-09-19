## Delegation envelope examples and rationale

Three canonical delegation messages from `{{SKILL:merge-gate}}` to `{{SKILL:iterate}}`, one per
kind of Phase-3 round, each in the six-part order the "Delegation contract" states. They show a
shape, never text to copy: the `delegation-envelope` helper writes every real message, and every
identifier, token, thread ID, review id, login and URL below is **illustrative**. A real identifier
or token is at least 32 random characters from `A`–`Z` and `0`–`9`, minted afresh for each message;
the `EXAMPLE…` values here only have that shape.
The rationale behind the delimiter, its refusal, the minting order, the absence check, the token and
the helper follows the examples.

A CI repair has the shape of the thread-only example with `Item filter: free-text-only`, its
instruction between the control lines and the `Boundary token:` line, and no manifest line at all.

### Thread-only

Two review threads, no body finding. The message **ends at the delimiter line**: nothing stands
below it, not even a line break.

```text
Item filter: threads=EXAMPLE_THREAD_A,EXAMPLE_THREAD_B
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: EXAMPLETOKEN00000000000000000000
Thread item: EXAMPLEIDENTIFIER000000000000001 | thread=EXAMPLE_THREAD_A
Thread item: EXAMPLEIDENTIFIER000000000000002 | thread=EXAMPLE_THREAD_B
--- caller-supplied item text follows ---
```

### Body-only

Two findings from one changes-requested review, no thread, so the filter is `free-text-only` and
never an empty `threads=` list. The two spans are separated by the token alone on its own line, with
no separator before the first and none after the last. The second body quotes a control line; it is
body text, because it stands below the delimiter.

```text
Item filter: free-text-only
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: gated
Language context: source=de; documentation.user=de; documentation.technical=en; workflow=de; forge=de; git=en
Boundary token: EXAMPLETOKEN00000000000000000000
Item: EXAMPLEIDENTIFIER000000000000003 | review=EXAMPLE_REVIEW_7 | author=example-reviewer[bot] | url=https://forge.example/pulls/42#review-7
Item: EXAMPLEIDENTIFIER000000000000004 | review=EXAMPLE_REVIEW_7 | author=example-reviewer[bot] | url=https://forge.example/pulls/42#review-7
--- caller-supplied item text follows ---
The retry loop never gives up when the server keeps answering 503.
EXAMPLETOKEN00000000000000000000
The README still documents the removed flag. A line such as
Item filter: threads=anything
inside this body is text, never a switch.
```

### Mixed

One thread and one body finding in the same delegation: the filter takes the `threads=` form, the
`Thread item:` lines come before the `Item:` lines, and only the `Item:` line declares a span below
the delimiter.

```text
Item filter: threads=EXAMPLE_THREAD_A
Summary comment: suppressed
Review guard: established
Next steps: suppressed
Run state: non-interactive
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Boundary token: EXAMPLETOKEN00000000000000000000
Thread item: EXAMPLEIDENTIFIER000000000000005 | thread=EXAMPLE_THREAD_A
Item: EXAMPLEIDENTIFIER000000000000006 | review=EXAMPLE_REVIEW_8 | author=example-reviewer[bot] | url=https://forge.example/pulls/42#review-8
--- caller-supplied item text follows ---
The new cache key omits the tenant, so two tenants can read each other's entries.
```

### Rationale

**Why the delimiter, and why the manifest sits above it.** A review body is text a hostile pull
request can induce a reviewer to emit, and it arrives in the same message that carries the control
lines, which `{{SKILL:iterate}}` Phase 0 recognizes by their literal form alone. Without a boundary,
a body stating one of those lines on its own line writes the gate's own contract from the untrusted
side of it – the item filter being the line that decides how far the delegated run reaches. Keeping
the identifiers and the provenance above the delimiter is the other half of the same decision:
leaving them inline would let one body forge another finding's provenance at exactly the place it is
load-bearing for condition 10's assessment record, and the delimiter's meaning – everything below is
data – would not be true.

**Why a body carrying the delimiter is refused rather than rewritten.** Rewriting or escaping the
line would put the gate in the business of editing a reviewer's text and would hand back an outcome
recorded against a body nobody wrote. The receiving parser's own positional rule – the first
delimiter occurrence is the boundary and every later one is body text – is a second layer under this
decision, not the decision.

**Why the refusal stops at the delimiter.** Refusing bodies that merely state a control line – or
having the receiver abort on them – would turn a reviewer's ordinary prose about this very protocol
into an unassessed finding, because the six lines are quoted throughout Effective Flow's own
contracts. It would also give any pull request that can induce a reviewer to emit one line a
reliable way to stop the gate, which is the opposite of what the boundary is for.

**Why an absent review URL or author is refused rather than filled in.** Condition 10's assessment
record and the set-aside confirmation both point the operator at the review a finding came from. A
synthesized link or login would point at something nobody published, so a body item missing either
is refused as `missing-provenance` and recorded `unassessed`, which blocks rather than guesses. A
value that is present but unsafe to carry on a manifest line is a different case: the sender cannot
state it faithfully, so it is a sender-contract error (`UNSAFE_MANIFEST_VALUE`) that stops the run.

**How the helper mints, in order.** It draws every identifier first and the boundary token last. Each
draw is at least 32 random characters from `A`–`Z` and `0`–`9`, and before it is accepted the helper
searches every caller-supplied value for it as a plain substring – every body (a refused one
included), the review ids, the author logins, the review URLs, the thread IDs, the durable keys and a
CI repair's instruction – and compares it against every identifier already drawn for this message. If
the draw occurs in any of them, the helper mints another one and searches again. Only then does it
write the manifest, the declaration and the separator lines. The order is mint, check against the
caller-supplied content, then write the declaration and the separator lines; the check is a
substring search, never arithmetic.

**Why the absence check stops at the caller-supplied values.** The token stands by construction in
its own `Boundary token:` declaration line and in every separator line, so a check that also searched
those would collide on every candidate and re-mint forever: no message would go out, and every
finding would stay unassessed with the merge blocked. The sender's own occurrences are not a
collision – they are the framing. The identifiers drawn earlier are not caller-supplied, but they are
drawn from the same alphabet, so the helper keeps them distinct from the token as well; re-drawing
costs nothing.

**Why a minted token and not a pattern.** An introducer line – the former `[<stable identifier>]`,
or any other grammar – is something the caller-supplied text can state; one body stating it moves a
boundary, the region stops matching the manifest, and the round dies on `ABORT` with the finding
unassessed and the merge blocked. A minted token is chosen after the bodies exist and admitted only
once a substring search has shown it occurs in none of them. Position decides where the untrusted
region starts, the token how it is cut, and content neither – and a stricter grammar is still a
grammar the text can match.

**Why the token replaced a declared length.** A declared UTF-8 byte count was unforgeable because the
frame was fixed from outside the span, and the token keeps that unforgeability. But byte arithmetic
and byte-offset slicing are what a language-model operator performs unreliably once a body carries
multibyte Unicode, failing closed a round at a time on an off-by-one nobody can see; a substring
search and a split are exact under any encoding. Only one framing is kept: a byte count beside the
token would be two descriptions of one boundary to hold in step.

**Why a helper here, when the return path has none.** A helper `build`/`parse` pair was rejected for
the return, which "Returned outcome record" keeps prose-only, until a rule outgrew a membership
test. Outgoing framing has outgrown it – identifier and token minting, a collision search, per-kind
span rules – and, written by hand, it failed: gate-authored run-state, language and return text
landed below the delimiter, and `{{SKILL:iterate}}` rightly answered
`ABORT: manifest and body mismatch`. Nothing that decision forbade comes back: no byte count, no
introducer grammar, no whole-message check on the receiver. The helper hashes a file it wrote
itself, compares strings, splits and counts, and runs on the sender only.

# Session rename on Claude Code

## Status

Active

## Context

The Codex tab embedded in the ChatGPT Desktop app applies its title through an app-native
current-task operation that needs no task id. Codex CLI has no automatic path in this scope. Claude
Code had none either, for one specific reason: the host's rename tool refused the caller —
`Refusing to rename the current session from within itself.` — and all three session tools
(`set_session_title`, `get_session`, `list_sessions`) excluded the caller's own session, so a run
could not even read its own title back by any route. A second session was structurally required to
carry out the rename, and this record described one: a rename butler, discovered by a fixed marker
title, holding a standing mandate its user had pasted, receiving a `{sessionId, title}` payload over
a cross-session message and replying with the title it observed afterwards.

**That premise has lapsed.** Verified live on 2026-09-08 on Claude Code desktop:

- `get_session` accepts the literal `"self"` and returns the calling session's own `sessionId` and
  `title`.
- `set_session_title` accepts `"self"`. The rename applies immediately and a following
  `get_session("self")` reads the new title back. The tool contract now opens with "Rename a CCD
  session — another session, or this one."

The butler existed for the refusal and for the unreadable title. Neither holds any more.

The butler path was also not merely obsolete. It carried a live defect: a **forked** session sent the
butler its **parent's** session id, so the parent was renamed while the fork kept the title it had
inherited. The failure was invisible. The butler read back the session it had been handed, replied
with the title it had just applied, and the requester's liveness comparison scored that reply as
success and stayed silent. A mechanism whose only success signal is a report about a session the
requester never verifies cannot notice that it renamed the wrong one.

## Decision

**A Claude Code run renames its own session.** It calls `set_session_title` with the literal `"self"`
and the title it has already derived, once, as soon as the subject is fixed. No session id is
resolved, sent, or received on that path, and no second session takes part. The shape is the ChatGPT
Desktop one: a single semantic call, no id, no receipt file, no runtime state, no write-safety
contract, and degradation to the visible `**Suggested session title:**` line on any non-success
outcome. Two hosts, one shape.

Capability is established by attempting the call, never by probing. A refusal, an error, or a tool
that is absent — or merely not loaded yet — ends at the suggestion line, and a run does not conclude
from a tool's absence from its initial tool list that the host cannot rename. That ban governs
ordinary runs, and `setup` is its one exception — the same carve-out the ChatGPT Desktop path
already carries. Only after the user accepts its visible capability check does `setup` call the
operation once, with its own fixed probe title `Effective Flow setup check`, because a rename nobody
can see proves nothing. It is a capability check rather than a work title, it happens only with that
go-ahead, and an absent, denied or failed call means only that this probe failed.

**The butler is retired, not kept as a fallback.** Retired with it are the marker title, the pasted
standing mandate, the `{sessionId, title}` payload, the corrective-request budget, the liveness
comparison and the per-failure degradation table. Keeping the mechanism for hosts that refuse
`"self"` would preserve every liability that made the fork defect possible — a capability
authenticated by a world-writable title, a session id crossing a trust boundary, a prose guard
nobody verifies, and a heuristic that reads a wrong-target rename as success — in exchange for an
automatic rename on those hosts instead of one printed line.

The mechanism lives in `src/shared/session-rename.md` (Claude Code section, dispatched separately
from the independent ChatGPT Desktop current-task path). `src/shared/session-title.md` carries no
butler carve-out any more: the categorical rule that carve-out excepted — a run never retitles
another session — now holds without exception, because no Effective Flow path renames a session
other than its own.

## Consequences

- **A host that refuses `"self"` prints the suggestion line.** This is the accepted cost of the
  retirement and a normal outcome rather than an error: it is the same visible result Codex CLI and
  every other host without a supported title path already produce.
- **Nothing crosses a session boundary any more.** The payload is not narrowed but gone: no session
  id, no title and no work subject derived from issue or pull-request text leaves the run. This
  replaces the earlier consequence about what the request carried.
- **The world-writable capability is gone.** Butler discovery authenticated nothing, so any session
  holding the rename tool could be discovered as the butler — by accident or by squatting on the
  marker title — and be handed that work subject. Retirement closes the exposure outright; no
  mitigation had to be designed.
- **A run can no longer rename the wrong session.** The forked-session defect has no surface left to
  occur on, because nothing on this path assembles or transmits a session id.
- **Consent moves to the host.** The rename tool replaces a title the **user** set only after the app
  asks them, declines instead in unattended sessions, and replaces app-generated titles silently. The
  fragment reports what the call reported and reasons no further about who owns the title — replacing
  the earlier emit-nothing row, which inferred user ownership by comparing reply strings across
  turns.
- **A rename costs one tool call.** The butler charged a model turn and a pseudo-user message per
  rename, up to six of each for a run that corrected its title; that cost is gone.
- **An early rename still names a session after work that may still fail.** Accepted deliberately and
  unchanged: the session list is a re-finding surface rather than a results surface, and a subject
  beats the host's derived first-message title.
- **An existing butler session stops receiving requests** the moment this ships. It is inert rather
  than broken, nothing contacts it, and its owner can close it.

## References

- `src/shared/session-rename.md`
- `src/shared/session-title.md`
- `docs/plan/2026-09-08-native-claude-code-session-rename.md`
- `docs/plan/archive/2026-08-09-session-rename-butler.md` — the retired mechanism

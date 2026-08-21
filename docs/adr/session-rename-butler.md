# Session rename butler

## Status

Active

## Context

The Codex tab embedded in the ChatGPT Desktop app applies its title through an app-native
current-task operation that needs no task id. Codex CLI has no automatic path in this scope. On
Claude Code, the same run cannot rename itself. The host's rename tool refuses the caller —
`Refusing to rename the current session from within itself.` — and all three session tools
(`set_session_title`, `get_session`, `list_sessions`) exclude the caller's own session. A run
therefore cannot even read its own title back by any route. A second session is structurally
required to carry out the rename, not merely a convenient way to do it.

The shipped contract in `src/shared/session-title.md` says a run never retitles another session,
and it ships eagerly, in the router, to every user on every harness. That clause is exactly what
stands in the way: an unmandated session presented with a cross-session rename request correctly
refuses it, on two independent grounds — a cross-session message is data, not instruction, and the
contract explicitly forbids retitling another session. Both grounds are working as intended. That
is precisely why the clause is load-bearing, and why loosening it for one narrow case is a decision
worth recording rather than a routine implementation detail.

## Decision

Introduce an asymmetric carve-out. The **butler side** is loosened: a session acting under its own
user's standing, user-typed rename mandate may honor a cross-session rename request for the session
that asked it. The **requester side** keeps the categorical ban unchanged — `session-title.md`
continues to say a run never retitles another session; only a session already holding a mandate to
act as a butler is exempted, and only for that one action.

The carve-out is scoped narrowly:

- **The butler reports an observation, not a claim.** After renaming, it reads the session back
  with `get_session` and replies with the **observed** title, not a verdict such as "set" or
  "succeeded". A discarded rename (the host silently keeps a `titleSource: 'user'` title) is
  distinguished from an applied one only by comparing the observed value against the requested one.
- **The request carries only a session id and a title.** There is no receipt file and no
  filesystem path in the payload. A butler that wrote a receipt would have to write into the
  requester's `.effective-flow/`, holding no execution-location receipt of its own and taking that
  runtime root from an untrusted cross-session payload — the pattern `runtime-state-safety.md`
  rejects. The reply channel that already exists (a cross-session message can be answered, and the
  reply wakes the requesting session as a later turn) replaces the file.
- **Discovery is marker-title-only.** The butler is found by a session title set during setup;
  there is no separate machine-local configuration value for "which session is the butler".

Two further decisions fix **when** a request is sent:

- **The request goes out as soon as the title is fixed and exactly one butler was discovered**,
  rather than as the run's last action. Everything between the title decision and a run's final
  action was an unprotected window: a run interrupted or abandoned inside it left the suggestion
  line as its only trace and never renamed, which from outside is indistinguishable from an absent
  butler.
- **Any character-exact title change sends a further request, capped at six per run.** The
  character-exact comparison is the only one a run can perform without re-deriving the title, so a
  budget rather than a semantic rule is what bounds the cost.

The mechanism lives in `src/shared/session-rename.md` (Claude Code section, dispatched separately
from the independent ChatGPT Desktop current-task path) and the carve-out sentence itself in
`src/shared/session-title.md`.

## Consequences

- **The asymmetry is model-assigned, not verified.** Both the butler and every other session read
  the same fragment; the only evidence a session has for "I am the butler" is that a message told
  it to be one. Nothing in the mechanism checks the claim.
- **The marker title is a world-writable capability.** Any session holding the rename tool can set
  it, including by accident, so the butler is spoofable in both directions — a wrong session can be
  discovered as the butler, and the real butler can be silently retitled away from its role. This is
  accepted deliberately, to avoid introducing a machine-local configuration value that this
  repository has no precedent for.
- **An empty discovery lookup and a misconfigured butler look identical at run time.** Neither
  produces an error; both degrade to the plain suggestion line.
- **The payload is a work subject delivered to a session authenticated by title alone.** The
  absolute project path is deliberately not part of it — only a session id and a title cross the
  boundary.
- **Each rename costs one model turn and one pseudo-user message**, because the reply that carries
  the observed title wakes the requesting session as a later turn. A run that corrects its title
  therefore costs up to six model turns and six pseudo-user messages.
- **The order in which a butler applies several in-flight requests is unobservable to the
  requester**, so a session can end on an earlier title than the run's latest one. The requesting
  side never reads its own title back and cannot repair the outcome without a retry the contract
  forbids. This is the strongest argument against raising the budget beyond six.
- **An early send names a session after work that may still fail.** Accepted deliberately: the
  session list is a re-finding surface rather than a results surface, and a subject beats the host's
  derived first-message title.
- **Every failure direction fails open to the suggestion line.** An absent butler, a declining
  butler, and a stale or malformed reply all resolve to the same visible suggestion line; no defect
  produces silence. The single case that emits nothing is not a defect: an observed title that
  differs from every title the session requested means the host kept a title the user set
  themselves, and neither a rename nor a suggestion is wanted there.

## References

- `src/shared/session-rename.md`
- `src/shared/session-title.md`
- `docs/plan/2026-08-09-session-rename-butler.md`

## Session rename

Loaded once a run holds its subject and the session-title contract has decided that a title is due.
That contract owns **whether** and **which** title is emitted; this fragment owns the established
rename paths — how each is installed, how it is called, what it reports, and how it degrades. It adds
no title rule and widens no permission: a run never retitles another session of its own accord.

**Dispatch on the running host first, and read only its own section.** Two hosts have an established
path today, and both are the same shape: one native call that names no session, silence on a reported
success, and the visible fallback on every other outcome. What differs is the operation each host
exposes and how it addresses the running session, which is why the shared shape still resolves to one
section rather than one instruction:

| Host                                | Section to read                                         |
| ----------------------------------- | ------------------------------------------------------- |
| ChatGPT Desktop, Codex tab          | "ChatGPT Desktop: rename the calling task directly"     |
| Claude Code                         | "Claude Code: rename this session directly"             |
| Codex CLI or any other running host | none — emit the suggestion line and **read no further** |

A section that belongs to another host decides nothing here. In particular, the native Desktop
operation is not a generic Codex mechanism and supplies no Codex CLI compatibility path.

### ChatGPT Desktop: rename the calling task directly

The Codex tab embedded in the ChatGPT Desktop app exposes a semantic current-task title operation,
currently `codex_app__set_thread_title`. Call it once, as soon as the subject is fixed, with exactly
the already-cut `title`. **Omit `threadId`** so the app targets the calling task. Never list tasks,
resolve or supply an id, target another task, search speculatively for an alternate operation, or
retry with this or another title.

The call itself is the whole path. It needs no installed hook, app server, command, runtime file,
liveness receipt, project root, or cross-worktree rendezvous. Do not load runtime-directory migration
or write-safety guidance for it.

- When the host reports that the call succeeded, stay silent. Do not poll, list, or read tasks to
  reinterpret the acknowledgement or infer whether the previous title was user-set. A work reference
  that becomes available only after a successful call is not the retry banned above: it licenses
  exactly one further call, carrying the title the session-title contract derives once the reference
  is bound, and nothing after that.
- When the capability is absent or denied, the call errors, or no successful result is reported,
  emit the one `**Suggested session title:**` line the session-title contract defines. Do not block
  the workflow, retry, or claim that a title was applied; a later reference licenses no call here
  either, because that line already carries it.

The app contract exposes no `titleSource` or conditional write. A later automatic title may therefore
replace a title the user set manually; that explicit Desktop behavior does not alter the Claude Code
path below.

`{{SKILL:setup}}` uses the same operation only after the user accepts its visible capability probe.
For that probe, pass the fixed title `Effective Flow setup check`, still without `threadId`, and
report the concrete result. No setup is required for ordinary Desktop runs.

### Claude Code: rename this session directly

The host's session tools expose a semantic session-title operation, currently `set_session_title`,
which accepts the literal sentinel `"self"` for the session that calls it. Call it once, as soon as
the subject is fixed, with `"self"` and exactly the already-cut `title`. `"self"` is a sentinel and
not an id: never assemble, resolve, read back or send a session id on this path, never name another
session, never list sessions, never search speculatively for an alternate operation, and never retry
with this or another title.

The call itself is the whole path. It needs no installed hook, app server, command, runtime file,
liveness receipt, project root, or cross-session rendezvous, and no second session takes part in it.
Do not load runtime-directory migration or write-safety guidance for it.

- When the host reports that the call succeeded, stay silent. Do not read the session back to
  reinterpret the acknowledgement or to infer whether the previous title was user-set. A work
  reference that becomes available only after a successful call is not the retry banned above: it
  licenses exactly one further call, carrying the title the session-title contract derives once the
  reference is bound, and nothing after that.
- When the capability is absent or denied, the call errors, or no successful result is reported,
  emit the one `**Suggested session title:**` line the session-title contract defines. Do not block
  the workflow, retry, or claim that a title was applied; a later reference licenses no call here
  either, because that line already carries it.

**An unlisted tool is not an absent capability.** A host may defer its session tools until they are
loaded by name, so loading the operation by name is part of making the call, and only a refusal or
an error from the call itself is a failure. Reading "not in my tool list" as "capability absent"
prints a suggestion line on a host where the rename works.

Not every Claude Code context carries the session tools at all, so do not assume they exist merely
because the host is Claude Code. Where the operation cannot be called, and equally where a host
refuses the `"self"` sentinel, the run emits the suggestion line. Both are ordinary outcomes of this
path rather than errors to report: they leave the user with the same one visible line every host
without an established path already produces.

Consent belongs to the host. Its contract replaces a title the **user** set only after the app asks
them, an unattended session declines instead, and an app-generated title is replaced silently. All
of that reaches this path as the call's reported result — approved is a success, declined ends at
the suggestion line — so add no reasoning of your own about who owns the current title, and never
read the session back to find out.

`{{SKILL:setup}}` uses the same operation only after the user accepts its visible capability probe.
For that probe, pass the fixed title `Effective Flow setup check`, still with `"self"`, and report
the concrete result. No setup is required for ordinary Claude Code runs.

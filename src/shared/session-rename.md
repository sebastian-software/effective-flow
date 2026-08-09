## Session rename

Loaded once a run holds its subject and the session-title contract has decided that a title is due.
That contract owns **whether** and **which** title is emitted; this fragment owns the one established
rename path — how it is installed, how it is called, what it reports, and how it degrades. It adds no
title rule and widens no permission: renaming another session stays forbidden.

Codex is the only host with an established path today. **On any other host, emit the suggestion line
and read no further** — everything below is the Codex mechanism and decides nothing elsewhere.

### Codex: request inside the sandbox, apply from a hook

A Codex thread is renamed through an app-server request, and an app server started from inside the
`workspace-write` sandbox fails on its state store. The path is therefore split in two, and the
transport lives in the shipped script instead of in prose:

```text
node <skill-root>/scripts/session-title.mjs <request|apply>
```

Pass exactly one JSON object on standard input and parse exactly one JSON envelope from standard
output, as with every shipped helper. Resolve `<skill-root>` from the loaded Effective Flow skill.
Never copy the script into the target project, assemble the rename by hand, or start an app server
from inside a run.

1. **`request`, inside the run.** The payload is exactly `{ cwd, title }`: the verified absolute
   `RUNTIME_STATE_ROOT` and the already-cut title. The thread id is **not** part of it — the script
   reads `CODEX_THREAD_ID` from its own environment, and an absent one yields `NO_THREAD_ID` rather
   than a guess from a rollout file.
2. **`apply`, from the `Stop` hook.** Codex spawns a hook command as an ordinary child of its own
   process, so the hook — and only the hook — reaches the app server. It forwards the hook payload
   Codex writes to its standard input and carries no logic of its own: a privileged command that runs
   outside the sandbox stays auditable only while it stays that small.
3. **Send last, decide from the envelope.** Issue `request` as the run's **final** action, after its
   own output — see "Timing" below. Every successful envelope carries the same four keys —
   `live`, `reason`, `code`, `observedAt` — so read them rather than testing which ones this run
   produced. Stay silent only on `live: true`; every other envelope, and every structured error,
   degrades to the suggestion line.

**`cwd` is `RUNTIME_STATE_ROOT`, never `EXECUTION_ROOT`.** The hook runs with the session's own
working directory and derives the runtime directory from the `cwd` in its payload, which is the main
checkout. With worktrees enabled by default the two roots differ, so a request written to a worktree
root is never found and the rename silently never happens. This is the same rule the sibling helper
follows in "Remote helper contract" of `issue-tracker.md`, for the same reason.

### The hook definition

Print this verbatim for the user to paste, with `<skill-root>` already replaced by the absolute path
of the installed skill — a hook resolves no placeholder. Either spelling works and only one is
needed; Codex loads every matching layer, so a user who already has hooks adds the `Stop` entry to
the file they already keep.

`~/.codex/hooks.json` (or `<repo>/.codex/hooks.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <skill-root>/scripts/session-title.mjs apply",
            "statusMessage": "Applying the session title"
          }
        ]
      }
    ]
  }
}
```

`~/.codex/config.toml` (or `<repo>/.codex/config.toml`):

```toml
[[hooks.Stop]]

[[hooks.Stop.hooks]]
type = "command"
command = 'node <skill-root>/scripts/session-title.mjs apply'
statusMessage = "Applying the session title"
```

`Stop` needs no matcher, and no `timeout`: Codex allows a turn hook 600 seconds by default, which is
far more than one rename. Only `type: "command"` handlers run. `statusMessage` is optional, as is a
top-level `description` in a `hooks.json` file. Schema source: `developers.openai.com/codex/hooks`.

Keep the command a single invocation of the shipped script — it runs unsandboxed under the user's
login shell, and a hook that stays this small is both auditable and stable against the trust review
below.

### The two runtime files

`request` writes `<RUNTIME_STATE_ROOT>/.effective-flow/session-title.json`, creating that directory
when it is missing. `apply` writes `<RUNTIME_STATE_ROOT>/.effective-flow/session-title-hook.json`
beside it, but only where the directory already exists — it never creates one, so a workspace that
never issued a request acquires neither file and a hook firing in an unrelated checkout leaves
nothing behind.

| File                      | Written by | Read by   | Purpose                                              |
| ------------------------- | ---------- | --------- | ---------------------------------------------------- |
| `session-title.json`      | `request`  | `apply`   | the pending rename: thread id, title, requested time |
| `session-title-hook.json` | `apply`    | `request` | the receipt: `appliedAt`, thread id, outcome, code   |

Both sit in the ordinary gitignored runtime directory and are runtime state, never configuration.
Because `request` creates and writes there, apply the owning workflow's loaded "Runtime-state write
safety" contract from `RUNTIME_STATE_ROOT` to that exact directory and file immediately before the
call, and the runtime-directory migration prerequisite before that. Every one of the sixteen
work-subject tools carries both; where a tool's own trigger has not loaded them yet, read
`shared/effective-flow-dir-migration.md` and `shared/runtime-state-safety.md` first. A run that
cannot satisfy either contract does not call `request` and emits the suggestion line instead.

### Timing: decide early, send last

The title is decided as soon as the subject exists, but a pending request lives at most **five
minutes** and the `Stop` hook fires only when the turn ends. A `build`, `plan` or `review` turn
routinely runs longer than that, so a request issued at the moment the subject became known would
expire unconsumed and rename nothing, silently.

Split the two moments: decide the title early per the session-title contract, hold it, and issue
`request` as the last action of the run, after the run's own output. The gap to `Stop` is then
seconds. Never issue it twice in one turn — the second request overwrites the first.

### Request-file contract

The request file corroborates identity, it never supplies it: it lives where anything running in the
workspace can write it, and it feeds a command that runs outside the sandbox. The applying side
therefore refuses rather than trusts, and the script enforces all five rules in code:

1. The thread id comes **only** from the hook's own payload. A request whose recorded thread id is
   not byte-identical to it is refused.
2. A request older than five minutes, or timestamped in the future, is refused.
3. A symlink, a directory, or any other non-regular file at that path is refused. The writing side
   reports it as an error, where a workflow can name what to remove; the applying side skips it as
   `unusable-request`, because nothing removes it and a hook must not fail on every turn for good.
4. The file is unlinked **before** the rename is performed, so a crashed run cannot be replayed.
5. The title is opaque text — no newlines, no control characters, at most 60 characters. A violation
   is rejected rather than sanitized, so it stays visible instead of being silently reshaped.

Two runs sharing one checkout, a stale file left by a crashed run, and a third party writing into the
workspace are all covered by rules 1–4. A skip on those grounds is a completed hook run, not an
error.

### Liveness: the receipt proves it, the configuration can only rule it out

A hook does not run until its content hash has been reviewed and trusted once, and editing the hook
text invalidates that hash and gates it again. That hash cannot be recomputed from outside Codex, so
no reading of the configuration can establish that the path **works** — only that it cannot. The
signal is built accordingly:

- **The receipt makes it live.** A receipt written within the last 24 hours whose outcome is not
  `failed` is first-hand evidence that the hook ran in this workspace, and it is the only thing that
  sets `live: true` and fills `observedAt`. It is opened as `started` on entry, before any check
  that could refuse the request — the one exception is a payload whose own `cwd` is unusable, which
  leaves nowhere to write a receipt at all — and finalized to one of four verdicts. Only `applied`
  and `skipped` vouch for the path: a hook that found nothing of ours pending proves the
  installation works exactly as well as one that renamed. The other three are evidence **against**
  it. `failed` yields the reason `hook-failed` with the hook's own error in `code`. `unapplied` —
  the hook ran and something of ours was not renamed — yields `hook-stale` with the cause in `code`.
  A receipt still reading `started` says only that a hook process began, so it vouches for nothing
  and falls through to the scan's verdict. Counting a stale receipt as live is the failure this
  distinction exists to prevent: a workspace whose requests always expire would otherwise report
  `live: true` forever and be neither renamed nor suggested.
- **A negative verdict does not decay.** A later neutral skip refreshes the receipt's timestamp
  while preserving the earlier verdict, so a `failed` or `unapplied` installation stays negative for
  as long as the hook keeps firing rather than ageing out of the 24-hour window. Do not wait for a
  broken installation to time itself back into silence. Recovery needs no expiry: the request is
  written on every run regardless of the verdict, and the first successful rename overwrites the
  receipt unconditionally.
- **The configuration scan only rules out.** Reading the four hook layers yields
  `managed-hooks-only`, `no-hook`, `untrusted` or `undeterminable` as the `reason`. Only the first
  two override a receipt: an explicit `allow_managed_hooks_only`, and a scan that read every layer
  and found no hook declared anywhere. A text scan that misses a wrapper script, a plugin-bundled
  hook or a disabling `[features] hooks = false` is likelier than a receipt that lies, so `untrusted`
  and `undeterminable` never override one.
- **The request is written either way.** The probe decides whether one line is printed, never whether
  a rename is offered — a hook that becomes trusted between the request and the end of the turn still
  consumes it.

**`hook-stale` has four causes and they need different answers.** Read `code` and never offer one
remedy for all of them; none of them is fixed by a retry:

| `code`             | What happened                                   | What actually helps                       |
| ------------------ | ----------------------------------------------- | ----------------------------------------- |
| `expired-request`  | the request outlived its five-minute bound      | the send-last rule under "Timing"         |
| `thread-mismatch`  | another thread's hook consumed the request      | nothing; expected in a shared checkout    |
| `unusable-request` | a symlink or non-regular file sits at that path | remove the planted path, then run again   |
| `INVALID_PAYLOAD`  | the pending request itself was rejected         | fix the producer — the title or its shape |

A thread mismatch counts against the path rather than for it, although the hook plainly ran. The
comparison behind it is only sound while the hook's `session_id` really is the thread id the rename
uses, which the plan records as assumed and not verified. Were that assumption wrong, treating a
mismatch as proof of liveness would make every run stay silent forever; treating it as evidence
against costs a shared checkout one redundant suggestion line. Noisy beats permanently silent.

The known cost is one redundant line: the first run on a fresh installation has no receipt yet,
reports `undeterminable`, and prints the suggestion line while the hook renames the session anyway.
That is the harmless direction, it corrects itself from the next turn on, and it is expected rather
than a defect to report. Name the trust review at most once per run, never on every run.

### Accepted versus discarded

A host that reports the rename outcome distinguishes an applied title from a discarded one, because
a host that already carries a title the user set themselves keeps it and reports success regardless.
Where that outcome is available, an accepted rename keeps the run silent and a discarded one falls
back to the suggestion line. Neither is an error and neither is retried, with this or any other
title.

On Codex no outcome exists at decision time by construction: the turn has ended before the hook
renames anything. The run therefore decides on `live` alone and never states that a title **was**
applied. The outcome reaches the next run through the receipt, where a `failed` hook becomes the
`hook-failed` reason. Even the hook's own `applied` is an acknowledgement from the app server rather
than an observation of the renamed thread, so nothing on this path ever justifies claiming more.

### Degradation

Every failure ends in the same place: the one `**Suggested session title:**` line the session-title
contract already defines. Nothing here blocks the run, delays it, replaces its own output, or is
retried — one attempt per run, one line at most, and no variant title after a refusal.

**What this run observes**, and therefore decides on — the `request` envelope and nothing else:

| Envelope                              | Run behavior                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `live: true` with `observedAt`        | stay silent; the hook renames when the turn ends                                                        |
| `live: false`, `no-hook`              | suggestion line; name `{{SKILL:setup}}` once                                                            |
| `live: false`, `managed-hooks-only`   | suggestion line; unavailable by policy, not broken                                                      |
| `live: false`, `untrusted`            | suggestion line; name the trust review once                                                             |
| `live: false`, `undeterminable`       | suggestion line, no notice — the fresh-installation case                                                |
| `live: false`, `hook-failed` + `code` | suggestion line; name that code once                                                                    |
| `live: false`, `hook-stale` + `code`  | suggestion line; the hook ran and renamed nothing — `code` names the cause and its remedy differs       |
| `NO_THREAD_ID`                        | suggestion line, no notice                                                                              |
| `INVALID_PAYLOAD`, runtime-dir escape | suggestion line; name the path once — a symlinked runtime directory is a planted path, not a caller bug |
| `INVALID_PAYLOAD`, any other          | suggestion line; a caller bug, report it once                                                           |
| `COMMAND_FAILED`                      | suggestion line; the runtime directory or request file could not be written                             |
| no envelope, no script, no result     | suggestion line, no notice                                                                              |

**What only the hook observes.** None of it reaches the run that wrote the request; it surfaces in
the next run's receipt, if at all, and is never worth a retry:

| Hook outcome                                | Meaning                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `started`                                   | a hook process began but reached no verdict; vouches for nothing |
| `applied`                                   | the app server acknowledged the rename                           |
| `skipped`, `no-request`                     | nothing was pending — the ordinary state of a checkout           |
| `unapplied`, `thread-mismatch`              | the request belonged to another thread in a shared checkout      |
| `unapplied`, `expired-request`              | the request sat longer than five minutes; see "Timing"           |
| `unapplied`, `unusable-request`             | a symlink, directory or oversized document sits at that path     |
| `unapplied`, `INVALID_PAYLOAD`              | the pending request was rejected; its own fault, not the setup's |
| `failed`, `SANDBOX_DENIED`                  | the app server was refused; the remedy is the hook setup         |
| `failed`, `CLI_MISSING` or `COMMAND_FAILED` | codex absent from `PATH`, or the app server rejected the call    |
| `failed`, `NO_THREAD_ID`                    | the hook payload carried no `session_id` — a harness statement   |
| the host kept a title the user had set      | reported as `applied`; not distinguishable here                  |

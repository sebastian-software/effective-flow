## Session-rename probe

This fragment is loaded only when the Step 7 `Rename path` question was answered `Yes`.

**Detect the host** from explicit running-environment context first. Three hosts have an established
rename path today: **T3 Code** exposes `mcp__t3_code.t3_thread_update`, the **ChatGPT Desktop Codex
tab** exposes a native current-task operation, and **Claude Code** renames the running session through
its own session-title operation. Follow only the identified host's path below; tool visibility alone
is not host proof. Plain Codex CLI has no automatic path in this scope. On any other host, say plainly
that no path is established, that runs therefore keep suggesting a title, and end Step 7. Never
invent a mechanism, discover a substitute, or probe a host for one.

### T3 Code: the current-thread capability needs no installation

1. **Explain the direct path.** T3 Code supplies the current-thread operation regardless of whether
   the provider is Codex or Claude. There is no hook, file, configuration key or one-time setup to
   install. Ordinary Effective Flow runs use it directly when their subject is fixed.
2. **Probe with a real rename, not a claim.** Say beforehand that this deliberately renames the
   current thread once and may replace its existing title, including one chosen manually; the user
   may rename it back or let the next run retitle it. Then call `mcp__t3_code.t3_thread_update` once
   with `action: rename` and only the literal title `Effective Flow setup check`; omit both
   `threadId` and `environmentId`, never list, search or read back a thread, and never retry. Report
   the actual host result. A success proves the path for this run; an unavailable, denied, errored,
   ambiguous or unconfirmed result means only that this probe failed. Later eligible runs still
   attempt the operation and fall back independently. Never claim more than the host reported.

### ChatGPT Desktop, Codex tab: the native capability needs no installation

1. **Explain the direct path.** The app already exposes its current-task title operation, currently
   `codex_app__set_thread_title`; there is no hook, trust review, file or one-time configuration to
   install. Ordinary Effective Flow runs use it directly when their subject is fixed.
2. **Name the precise stale-hook cleanup without performing it.** A user who followed the former
   setup may still have a `Stop` handler whose command invokes `session-title.mjs apply` in
   `~/.codex/hooks.json`, `~/.codex/config.toml`, or a repository-local counterpart. Tell them to
   remove only that matching handler themselves, preserving unrelated handlers and the containing
   file. Never open, edit or delete their harness configuration here.
3. **Probe with a real rename, not a claim.** Say beforehand that this deliberately renames the
   current session once and that the user may rename it back or let the next run retitle it. Then
   call the native operation once with only the literal title `Effective Flow setup check`; omit
   `threadId`, never list or resolve tasks, and never retry. Report the concrete result. A successful
   call proves the path for this run; an absent, denied or failed operation means only that this setup
   probe failed. Later eligible runs still attempt the operation and fall back independently from
   each call's result. Never report a probe that did not run or claim more than the host reported.

### Claude Code: the native capability needs no installation

1. **Explain the direct path.** The host already exposes its session-title operation, currently
   `set_session_title`, and that operation accepts the literal sentinel `"self"` for the session
   calling it; there is no second session, hook, marker title, file or one-time configuration to
   install. Ordinary Effective Flow runs use it directly when their subject is fixed, and no session
   id is assembled, sent or received on that path.
2. **Probe with a real rename, not a claim.** Say beforehand that this deliberately renames the
   current session once and that the user may rename it back or let the next run retitle it. Then
   call the operation once with the sentinel `"self"` and only the literal title
   `Effective Flow setup check`; never resolve or supply a session id, never name another session,
   and never retry. Where the host defers its session tools until they are loaded by name, load the
   operation first — an unlisted tool is not an absent capability, and only a refusal or an error
   from the call itself is a failed probe. Report the concrete result. A successful call proves the
   path for this run; an absent or denied operation, a refused sentinel, or a failed call means only
   that this setup probe failed. Later eligible runs still attempt the operation and fall back
   independently from each call's result. Never report a probe that did not run or claim more than
   the host reported.

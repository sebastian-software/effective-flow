## Session-rename probe

This fragment is loaded only when the Step 7 `Rename path` question was answered `Yes`.

**Detect the harness** from the running environment first. Two harnesses have an established
rename path today: the **ChatGPT Desktop Codex tab** exposes a native current-task operation, while
**Claude Code** renames the running session through its own session-title operation. Follow that
harness's path below and no other. Codex CLI has no automatic path in this scope. On any other
harness, say plainly that no path is established, that runs therefore keep suggesting a title, and
end Step 7. Never invent a mechanism, and never probe a harness for one.

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

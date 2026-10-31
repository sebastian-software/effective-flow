## Claude Code allow rules

This fragment is loaded only when the allowlist step of `{{SKILL:setup}}` is offered. It writes one
Claude Code allow rule per non-destructive runtime-state helper operation (`lock acquire`,
`lock release`, `lock inspect`, `memory reserve`, `memory set-marker`, `memory migrate-directory`)
into `<RUNTIME_STATE_ROOT>/.claude/settings.local.json`, bound to this install's absolute path, so
later runs call the helper without a permission prompt. `lock break` and `harness allow-rules` never
get a rule. Only the helper writes the settings file; never edit it in prose.

### `setup allowlist`

The keyword form runs only this step and its summary. It needs no existing configuration: make
Step 2 item 2's read-only resolution call with `tool: "setup"` and take only
`data.runtimeStateRoot` and `data.visibility` (`hidden` selects the hidden ignore remedy below,
anything else the standard one). The shared chat-language rule applies. It asks no Visibility
question and runs no other setup step.

### Preview, confirmation, apply

```include
state-helper-call
```

The `skillRoot` value is that same literal `<skill-root>`, so the written rules match later calls.
The helper's `CLAUDECODE` gate is the authoritative harness check. Its `harness allow-rules` call is itself never allowlisted, so Claude
Code asks once for each call.

1. Preview:

   ```text
   node <skill-root>/scripts/effective-flow-state.mjs harness allow-rules <<< '{"cwd":"<RUNTIME_STATE_ROOT>","skillRoot":"<skill-root>","mode":"preview"}'
   ```

   Show `result.target` and the six `result.rules`, then `result.added`, `result.removed` (rules of
   an install whose helper no longer exists), `result.keptOtherInstalls` as "other install, kept",
   and every `result.warnings[]` entry with its rule and message (a `helper-wildcard` warning also
   covers a path-prefix rule such as `node ~/.claude/skills/*`). A widened rule is never removed;
   the user decides. With `result.changed: false`, report that the rules are current and stop.

2. Ask in the conversation whether to write exactly this change, in every mode and in auto mode
   too: a harness approval of the `apply` command does not replace this answer. Only an explicit
   yes continues; a run that cannot ask writes nothing and reports the preview.
3. Apply with `"mode":"apply"` and `"digest":"<result.digest of the preview>"`, and report
   `result.applied`.

### Outcomes

Every outcome writes nothing; a configuration write of Step 6 stays in place.

- `UNSUPPORTED_HARNESS`: say in one sentence that the step is specific to Claude Code.
- `UNSUPPORTED_PATH`: state `outcome.reason`, with `outcome.path` and `outcome.detail` when present,
  and show `outcome.rules`, when non-empty, for manual entry under `permissions.allow`.
  `forbidden-character` (any character outside `A-Za-z0-9._@+/-`, a non-ASCII install path
  included) offers no rules; `unresolvable` means a path of the helper's chain could not be
  resolved. For `inside-repository-worktree`, `inside-runtime-root`, `foreign-writable` and
  `helper-mismatch`, add that entering the rules by hand reopens the risk the refusal guards
  against.
- `SETTINGS_NOT_IGNORED`: the ignore remedy below, then preview once more.
- `SETTINGS_TRACKED`: name the tracked file; untracking it is the user's decision.
- `SETTINGS_INVALID`: name the file and the parser message; the user repairs it.
- `PREVIEW_MISMATCH`: the file changed since the preview, for example through Claude Code itself.
  Preview once more and ask again.
- The same outcome a second time after that one re-preview: report it and stop.
- Any other nonzero exit or `error`: report its code and message.

### Ignore remedy

Ask whether to add the line `.claude/settings.local.json`, naming the file; on no, write nothing
and report the outcome.

- **Standard mode:** on yes append it once to `<RUNTIME_STATE_ROOT>/.gitignore`, creating the file
  if missing and ensuring a trailing newline first, never rewriting another line.
- **Hidden mode:** on yes add it to the Git common directory's `info/exclude` as
  `setup-hidden-mode` describes for that second line; never touch `.gitignore`.

```lazy-include
setup-hidden-mode
when: the visibility is `hidden` and the helper returned `SETTINGS_NOT_IGNORED`
```

### Summary items

Report the target, the rules added, removed and kept for another install, every warning, and
whether the change was written, or the outcome and its reason. Always add two sentences:

- Never accept Claude Code's "don't ask again" suggestion for a helper call: it widens the rule to
  `node <helper> *` or `node *`, which also approves `lock break` or any script.
- The rules live below the main checkout; whether Claude Code applies them in a session started
  inside a linked worktree is unverified.

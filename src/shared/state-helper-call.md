**Runtime-state helper call shape.** Write every `effective-flow-state.mjs` call as exactly one
simple command:

```text
node <skill-root>/scripts/effective-flow-state.mjs <group> <operation> <<< '<json>'
```

- Resolve `<skill-root>` from the currently loaded Effective Flow skill, in the form it was
  reached (a symlinked install path included, never resolved through `realpath`), and spell it out
  literally as an absolute path. Never use a shell variable, `$PWD`, `~`, command substitution,
  `cd … &&`, an `echo … |` or `printf … |` pipe, a heredoc, a loop or function, or a compound
  command joined by `;`, `&&` or `||`.
- Every JSON value is literal too: `cwd` is the literal absolute `RUNTIME_STATE_ROOT`, never
  `$PWD`. Write a `'` inside the JSON as `'\''`.
- The Claude Code allow rule matches only this literal shape, so any other shape prompts for
  permission on every call. The rule binds every harness, since it is also the auditable shape.

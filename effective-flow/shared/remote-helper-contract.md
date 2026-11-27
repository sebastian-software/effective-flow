### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> <<< '<json>'
node <skill-root>/scripts/remote-tracker.mjs <operation> --apply <<< '<json>'
```

The argv is exactly `<operation>`, or `<operation> --apply` for a mutation; any other argv, and
`--apply` on a non-mutation, fails with `INVALID_PAYLOAD` before standard input is read. `<json>`
is exactly one JSON object; parse exactly one JSON result envelope from standard output. Each call is exactly one such command, with `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no trailing command, no compound command, and every `'` inside the JSON, untrusted text included, spelled as `'\''`. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy
the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea`
probing, capability normalization, command construction, JSON normalization, payload validation,
compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens
a shell and never prompts.

Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd` on **every helper
operation**, including local deterministic operations such as `reference-parse`, `body-hash`, and
`issue-lifecycle-receipt-parse`. The helper runs `git`, `gh` and `tea` in that directory, and every
provider CLI resolves its repository context from it. The runtime root is the one checkout
guaranteed to exist for the whole run, whereas an execution worktree may already have been
withdrawn by the time a completion action runs. The field is optional for compatibility — when it
is absent the helper inherits the process working directory — but an Effective Flow workflow always
sets it. A `cwd` that is not an existing directory fails with a structured error naming the path,
never as a missing-CLI error.

**Load on demand:** Read `shared/runtime-state-safety.md`, when the remote-tracker input file is about to be written.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when the remote-tracker input file is about to be written.

**Input files.** If a payload is too long or quote-heavy for a literal here-string, guard both paths
in `.effective-flow/remote-tracker/inputs/` below `RUNTIME_STATE_ROOT`. Write the complete payload
(including `cwd`) to a scratch file with the harness file-writing tool, only while absent and
never via shell redirection, heredoc, `echo` or `printf`.
Use a separate local Node hashing step for the lowercase SHA-256 of the exact UTF-8 file bytes,
then rename without clobbering to `.effective-flow/remote-tracker/inputs/<run-token>-<n>-<sha256>.json`.
Pick one 1–8 character lowercase alphanumeric token per run and its lowest free positive `n`
(at most five digits, no leading zero).
Send `{"inputFile": "<absolute path>"}` in the same one-command shape. A dry run keeps the file;
after approval, repeat that same literal path for `--apply`; the `--apply` call or a non-mutation
call removes its own verified file even if the operation then fails. Do not change it between
preview and `--apply`; a digest mismatch stops consumption and dispatch. Any retry or corrected
payload gets a new file and a new dry run. This is the compliant alternative to wrappers:
`bash <file>` and every other indirection remain forbidden.

**Load on demand:** Read `shared/remote-tracker-operations.md`, when a step must choose a remote-tracker operation or input keys its workflow does not spell out, or a helper call returned `INVALID_PAYLOAD` or `INVALID_REFERENCE` for an unknown operation or input field.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes
additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`,
and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API
requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user,
  then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user
  consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding
  workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow
  from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is
  safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable,
argument vector, and redacted input preview, obtain every workflow-specific approval that still
applies, and only then repeat the same operation with `--apply`. A dry run never changes Git,
tracker state, memory, labels, issues, pull requests, comments, or review threads. Redaction covers
credential shapes, not quoted content: the preview echoes review and comment bodies verbatim.

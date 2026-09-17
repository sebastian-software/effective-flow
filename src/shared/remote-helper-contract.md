### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from
standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy
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
tracker state, memory, labels, issues, pull requests, comments, or review threads.

# Shared host runner for behavioural evals

The behavioural suites are model-free instruments: `evals/eval.mjs` prepares slots and verifies
evidence, but it never starts a model. A recording host starts the fresh Codex session. Every
manual or cohort launch must use this runner so host ownership, process-group shutdown, and cache
lifecycle have one implementation. Do not create a separate HOME per slot in a suite script or
host wrapper.

## Command

The stable interface is:

```sh
node evals/host-run.mjs --profiles-root DIR [--auth-file FILE] -- COMMAND ARGS...
node evals/host-run.mjs --profiles-root DIR --recover
```

This runner is POSIX-only. `DIR` must be a dedicated directory owned by the current user. Reuse
the same dedicated profiles root for all rounds, for example:

```sh
node evals/host-run.mjs \
  --profiles-root /tmp/effective-flow-eval-host-profiles \
  -- node --eval 'console.log(process.cwd(), process.env.HOME, process.env.CODEX_HOME)'
```

The command after `--` is a placeholder for the host's already-prescribed launch command. Keep
the suite's model, prompt, sandbox, and launch arguments exactly as prescribed; this wrapper does
not choose a model or add Codex flags. A safe local Node fixture is useful for a smoke check, but
it is not a model recording.

Each invocation creates a fresh profile with fresh `HOME` and `CODEX_HOME` values and passes the
current working directory and inherited standard input/output/error to the command. It also sets
the XDG config, cache, data, and state directories below that fresh home. The command's exit
status is returned. `--auth-file FILE` creates an explicit `auth.json` symlink in both Codex home
locations; the runner does not discover, copy, or read credentials. Intentionally setting
profile-related environment variables or CLI overrides in the wrapped command defeats the
wrapper's ownership; the trusted host contract is that the wrapped command uses the environment
the runner supplies.

## Cleanup and recovery

After the command's own process group has stopped, the runner removes only these four directories
inside its profile:

- `home/.codex/cache`
- `home/.codex/plugins/cache`
- `codex-home/cache`
- `codex-home/plugins/cache`

Profile metadata, `auth.json` links, state, skills, evidence, and other files remain available for
sealing and diagnosis. The runner escalates `SIGINT` or `SIGTERM` from the process group to
`SIGKILL` when the group does not stop within its bounded wait. The owning wrapper may clean its
own profile after the child process group stops; startup or manual recovery additionally requires
the recorded owner process to be gone. A live, reused, unknown, malformed, or unsafe path is
retained; malformed metadata can produce a stderr diagnostic, and the runner never follows
arbitrary directories or symlinks. There is no daemon or scheduler.

If the host itself is killed with `SIGKILL`, its `finally` handler cannot run. Leave the profile in
place and run recovery before the next round, using the same profiles root:

```sh
node evals/host-run.mjs \
  --profiles-root /tmp/effective-flow-eval-host-profiles \
  --recover
```

Recovery is safe to repeat and does not remove a profile whose owner or process group is still
live. A successful cleanup writes a cleanup receipt beside the retained profile. The runner does
not generate suite receipts, seal or publish evidence, bypass profile pins, or change the frozen
active `/private/tmp` drivers. It also does not automatically enroll old ad hoc profiles.

The runner protects its own profile root and profile identities before each mutation. A root,
profile, cache directory, metadata file, or cleanup claim that fails ownership or shape checks is
left in place with a diagnostic. This is why a malformed or unsafe profile requires a human to
inspect it rather than a broader cleanup command.

## Suite procedure

Use the suite's existing `prepare` command, launch each prepared slot through this runner, then
continue with the suite's truthful host receipt, `seal`, `status`, `publish`, and read-only
`verify` commands. The runner only owns the host process boundary and cache cleanup. It does not
alter the model launch arguments, prompt, sandbox namespace, profile pin, evidence format, or
publication lifecycle.

The shared runner is a host-eval tool only. The source `eval.mjs` model-free guarantee and the
suite-specific evidence contracts remain authoritative. The qualified cohort driver has its own
[driver guide](host-driver/README.md) for the external cohort protocol:

- [`merge-gate`](merge-gate/README.md) documents the caller and delegation scenarios.
- [`iterate`](iterate/README.md) documents the report channel and fail-closed input cases.
- [`next-steps`](next-steps/README.md) documents completed-run recommendations and continuation.

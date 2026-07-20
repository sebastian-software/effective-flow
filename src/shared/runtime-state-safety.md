## Runtime-state write safety

```include
execution-location
```

`.effective-flow/` is private, untracked runtime state. Apply this guard **only when a mutation
below `.effective-flow/` is imminent**, and complete it immediately before every `mkdir`, copy,
write, rename, delete, lock acquisition, or `git worktree add` whose concrete target is below
that directory. Read-only configuration and legacy lookup may happen before the guard and must
remain non-mutating.

For runtime state, first apply the runtime-root procedure from the execution-location receipt.
Revalidate `RUNTIME_STATE_ROOT`, canonicalize the exact absolute runtime-state handle, and prove
that it remains below `<RUNTIME_STATE_ROOT>/.effective-flow/` without a symlink escape. Convert
that handle to its repository-relative `.effective-flow/...` target only after containment is
proved. Run every predicate and mutation from `RUNTIME_STATE_ROOT`; a safety pass from
`EXECUTION_ROOT` never authorizes a runtime-state mutation in the main checkout.

Run the guard separately for every target. A pass for one root or target never authorizes a
mutation in another root or to another target. Do not create the directory, sentinel, target,
parent directory, lock, or worktree before the guard passes.

From `RUNTIME_STATE_ROOT` for a runtime target (or from the owning main checkout for setup
repair):

1. Run the non-verbose decision predicate
   `git check-ignore --no-index -- .effective-flow/config.json`.
2. Run the same non-verbose predicate for the concrete pending target:
   `git check-ignore --no-index -- <target>`.
3. Interpret each exit code exactly: `0` means ignored and passes; `1` means not ignored and
   blocks; any other exit code or command-launch error blocks. Do not use `-v` for the decision:
   a negation match may still produce verbose output with exit code `0`. Use
   `git check-ignore -v --no-index -- <path>` only after a block to collect diagnostics.
4. Separately run `git ls-files -- .effective-flow/`. A command failure blocks. Nonempty output
   blocks and must be reported with the tracked paths; empty output passes.

Missing Git, a non-repository directory, a not-ignored sentinel or target, tracked runtime state,
an unsafe absolute handle, root/common-directory mismatch, symlink escape, and every lookup or
launch error all fail closed. Preserve all existing state, perform none of the pending mutations,
and direct the user to `{{SKILL:setup}}` when ignore or tracked-state repair is
relevant. Ordinary workflows never edit `.gitignore` and never try to repair the condition
themselves. A missing, moved, bare, or repository-mismatched runtime root is a location error,
not authorization to write through another checkout.

`{{SKILL:setup}}` is the sole repair exception: it may normalize `.gitignore` and untrack legacy
runtime configuration as part of its explicit setup scope. After those repairs, it must validate
the target state with the same predicates above. Only after validation passes may setup apply
this guard to a concrete runtime marker target and write that marker.

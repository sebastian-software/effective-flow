## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

If the wisdom write needs `.effective-flow/` to be created, apply the owning workflow's loaded
“Runtime-state write safety” contract to that exact directory immediately before its `mkdir`.
Immediately before creating, updating, or deleting the wisdom file, apply the contract again to
that concrete file path. A blocked guard leaves the file and directory unchanged.

Contents:

- discarded root-cause hypotheses
- reproduction steps and results
- discovered dependencies and side effects
- wrong assumptions

After each phase, write a summary and pass it on to later phases. Delete the file at the end.

## Review report overflow path

`review write-report` returned `INPUT_TOO_LARGE`, or the shell refused the command with "Argument
list too long"; either way nothing was reserved or written. Reserve the IDs and allocate the report
in one call, then write the report by hand:

```text
node <skill-root>/scripts/effective-flow-state.mjs review open-report <<< '{"cwd":"<RUNTIME_STATE_ROOT>","owner":{"workflow":"review"},"count":<N>}'
```

- `count` is the exact number of admitted findings, mapped in order onto `result.firstId` to
  `result.lastId`; its outcomes are those of `memory reserve` in “Memory operations”. The call
  guards and creates `.effective-flow/review/`, and `result.reportPath` is the guarded absolute
  report handle.
- Write the complete report to `reportPath` in the report format, from the same findings and flags
  the `write-report` input carried, with the reserved IDs; a report holding at least one
  `local-only` finding carries the disclosure banner directly below the header fields.
  Immediately before writing, re-check that `reportPath` is still absent; if it is present,
  re-allocate the path alone through local mode's path-only allocation and keep the reserved IDs.
- After a successful reservation, never call `review open-report` again; only its
  `MIGRATION_REQUIRED` retry repeats the call before one. A write that fails after it stops the
  run, naming the reserved range as a permanent ID gap.
- **Presentation:** only after the report file exists, present its path and the severity counts,
  and no finding, title or location; then the remaining local steps follow.

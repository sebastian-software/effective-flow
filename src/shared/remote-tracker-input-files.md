```lazy-include
runtime-state-safety
when: the remote-tracker input file is about to be written
```

```lazy-include
effective-flow-dir-migration
when: the remote-tracker input file is about to be written
```

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

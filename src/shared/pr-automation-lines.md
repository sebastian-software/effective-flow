## Automation lines in `pr`

`Keep draft: requested` and `Appendix: <sha256>` come only from an Automation caller's scored
decision mode (`scored-decisions`). Accept them only beside the three scored control lines
of the same trusted handoff or call; otherwise, and in hidden mode (the appendix markers name
Effective Flow), stop before any push and name the line. With the three lines, `scored-decisions`
"Recognition" (trusted region and its one `run-check`) passes before step 2 or the run stops with
`RUN_NOT_OPEN`.

- **`Keep draft: requested`** applies only with `Finalize plan draft:`. The plan draft finish runs
  step 9, `pr-update-title` and the hash-guarded `pr-update-body` as usual, but never
  `pr-mark-ready`; on Forgejo `pr-update-title` runs on its own. The finish report line names the
  pull request as finished and still a draft by request.
- **`Appendix:`** carries the digest `pr-appendix` returned for the run that the `Autopilot run:`
  line names. Merge the appendix into a body only through the literal call
  `node <skill-root>/scripts/autopilot.mjs appendix-merge <<< '{"cwd": "<RUNTIME_STATE_ROOT>", "runId": "<run-id>", "appendixSha256": "<sha256>", "body": "<body>"}'`,
  spelled as in step 1 (every `'` as `'\''`), with the received `Autopilot run:` id, and use the
  returned `data.body`. The helper derives the appendix path from the run, requires that digest,
  validates the marker pair and replaces an existing block instead of stacking a second one. A
  nonzero exit or `ok: false` stops before the mutation it would feed, naming the error code.
  - **New pull request or plan draft finish:** merge after the step 9 body check and after every
    line appended to it (verification block, release footers, machine lines), as the last body
    change before step 10 or the finish's body update.
  - **Appendix-only update:** when step 8 finds exactly one exact match and no
    `Finalize plan draft:` applies, skip step 9. Read the body fresh through `pr-read`, hash it
    with `body-hash`, merge, and apply the hash-guarded `pr-update-body`, dry run first. Title and
    draft state stay unchanged. `STALE_WRITE` or any other failure stops, and the report adds one
    line: appendix updated, or the failed step.
    Autopilot runs this update itself, from the fresh `pr-read` on and from `RUNTIME_STATE_ROOT`,
    for a blocker on an issue source with a plan pull request, and for an unchanged plan-only
    draft on a rerun, so no push step runs. Its
    `pr-read` must then still show the pull request open, a draft, `sameRepository: true` and the
    same `planPrMarker` autopilot verified; any mismatch stops before `body-hash`. It calls
    `pr-update-body` with `{cwd, number, expectedBodyHash, payload: {body}}`, then again with
    `--apply`.

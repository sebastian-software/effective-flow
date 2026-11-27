## Base move after planning

The base moved while this issue was planned, and `publish --apply` refused before any mutation.
One assessed re-publish per issue and pass may continue, also when the base moves again. The
planning worktree keeps its HEAD at `collect.baseOid` and the plan stays unchanged: `publish`
builds the plan commit on the assessed tip itself.

1. **Assess.** Call `plan-publication.mjs assess-base-move` with exactly this input:

   ```text
   {cwd, issue, planDir, planFile, remote: "origin", baseBranch,
    fromBaseOid: collect.baseOid, expectedBlobOid: <metadata blobOid>}
   ```

   It fetches the base and compares the range `fromBaseOid..toBaseOid` with the paths the plan
   cites; it pushes nothing and writes no forge object. An error envelope, such as
   `BASE_REWRITTEN` or `BLOB_CHANGED`, stops the pass with the null failure
   `{issue: null, stage: "publish", code: <its code>}` and adds no `baseMoves` entry.

2. **Record.** A successful envelope, whatever its verdict, adds exactly one `baseMoves` entry for
   this issue, copied from it: `issue`, `fromBaseOid`, `toBaseOid`, `verdict`, `reason`,
   `commitCount`, `changedPathCount`, `citedPathCount`, `citedPaths` and `overlappingPaths`.
3. **`republish: true`.** Re-run `plan-lint.mjs publication-metadata` with the same input. Its
   projection, `blobOid` included, must equal the first run's; a different projection stops with
   `BLOB_CHANGED`, a failed re-run with its own code, both under item 5 and without publication.
   Then call `publish --apply` once, with the unchanged input plus `expectedBaseOid: <toBaseOid>`
   and `allowNewerBase: true`; an `overlap` or `undecidable` verdict also passes
   `baseMove: {fromBaseOid, toBaseOid, verdict, reason, commitCount, overlappingPaths}` from the
   envelope, rendered as the fixed "Unresolved base move" flag. A base that moved again still
   publishes on `toBaseOid`, the newer move flagged unassessed as `furtherBaseMove`. Map the result
   by the ordered outcome mapping: its `BASE_CHANGED` is an item-5 stop keeping the entry; a check
   first run here maps as items 3 and 4 define; a refusal with `details.source: "base-move-flag"`
   is an item-5 input-contract stop, not a recorded `failed`. A flagged PR is a normal `published`
   outcome; review reconciles it.
4. **`republish: false`** (`not-ancestor`, `same-issue-plan` or `plan-identity`). Stop as item 5
   does: preserve the plan and its planning worktree (Phase 2) and record the pass failure
   `{issue: null, stage: "publish", code: "BASE_CHANGED"}`.

**Report.** A fitting move that published is one chat line: the range `<from>..<to>` as short object
IDs, the commit count and the cited-path count. A flagged move that published adds the `reason` and
the bounded `overlappingPaths`; a `furtherBaseMove` on either adds its range and count, unassessed;
each says the PR carries the unresolved base move. A stopping move, a `republish: false` envelope or
a stopped re-publish, names the range, the commit count, the bounded `overlappingPaths` with the
`reason` (a re-publish stop: its `details.reason`), the preserved plan and planning worktree paths,
and the way out: move or discard the preserved plan, run `effective-flow cleanup` to remove the kept
planning worktree, then rerun the pass or the autopilot run, which plans on the current tip.

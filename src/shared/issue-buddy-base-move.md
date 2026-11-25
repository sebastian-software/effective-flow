## Base move after planning

The base moved while this issue was planned, and `publish --apply` refused before any mutation.
One assessed re-publish per issue and pass may continue; a second `BASE_CHANGED` never does. The
planning worktree keeps its HEAD at `collect.baseOid` and the plan stays unchanged: `publish`
builds the plan commit on the freshly fetched tip itself.

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
3. **`fits`.** Re-run `plan-lint.mjs publication-metadata` with the same input. Its projection,
   `blobOid` included, must equal the first run's; a different projection stops with `BLOB_CHANGED`,
   a failed re-run with its own code, both under item 5 and without publication. Then call
   `publish --apply` once, with the unchanged input and fixed texts and only
   `expectedBaseOid: <toBaseOid>` changed. Map its result with the ordered outcome mapping: a
   further `BASE_CHANGED` is an item-5 stop that keeps the entry, and a check that first runs here,
   such as the scan or the plan-path check, maps as items 3 and 4 define.
4. **`overlap` or `undecidable`.** Stop as item 5 does: preserve the plan and its planning worktree
   (Phase 2) and record the pass failure `{issue: null, stage: "publish", code: "BASE_CHANGED"}`.

**Report.** A fitting move that published is one chat line: the range `<from>..<to>` as short
object IDs, the commit count and the cited-path count. A stopping move, which is an `overlap` or
`undecidable` verdict or a `fits` verdict whose re-publish then stopped, names the range, the
commit count, the bounded `overlappingPaths` with the `reason`, the preserved plan and planning
worktree paths, and the way out: move or discard the preserved plan, run `{{SKILL:cleanup}}` to
remove the kept planning worktree, then rerun the pass or the autopilot run, which plans on the
current tip.

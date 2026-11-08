## Partial-diff recovery

This part of the lifecycle contract covers a `deliver` delivery that stopped after a committed
group: its `partial-diff` record, kept `aborted` or `failed` with the worktree, branch and residual
groups, is either resumed by adoption or released for cleanup. Both rest on the delivery ledger, a
private progress record of that delivery, and on the removal conditions above.

### Delivery ledger

Location, one per record and addressed only by its record ID:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/ledgers/<RECORD_ID>.ledger`

Its subdirectory and suffix keep it out of every scan for `*.json` records and `*.lock` locks. Only
the helper operations below touch it, through the runtime-state guard; no operation takes ledger
content as input. Schema version 1 is compact JSON with exactly these keys at every level:

- `schemaVersion` `1`; `recordId`, `creationOid`, `worktreePath` and `branch` from the record;
  `receiptDigest`, the SHA-256 of the record's receipt;
- `base` `{branch, oid}`, the resolved delivery base, `oid` equal to `creationOid`; `visibility`
  `visible` or `hidden`; `language` `{git, forge}`, each `de` or `en`;
- `manifest`, the bound selection manifest;
- `groups` `[{index, endpoints: [{path, kind, mode, digest, oid}]}]`, the ordered group plan: an
  exact, non-overlapping partition of the manifest endpoints with both endpoints of a rename in one
  group. Each descriptor is computed by the helper from the delivery worktree: `kind` `blob` with its
  `mode`, the SHA-256 `digest` of the bytes applied there and the `oid` Git stores for them at that
  path (`hash-object --path`, without `-w`), or `kind` `tombstone` with the other three `null`;
- `commits` `[{group, oid}]`, one entry per committed group in group order. It is the only part
  that changes after `ledger init`.

The ledger holds no file content, credential or session token. Its bound is 256 KiB
(`LEDGER_MAX_BYTES`), checked once by `ledger init` against the worst case (every group committed,
64-hex OIDs), so no later append can outgrow it.

**Trust assumption.** `ledger init` binds the manifest, group plan, base, visibility and languages
its caller supplies. The manifest is accepted only when the helper's own reconcile of it against the
delivery worktree and the source is exact; the visibility is the caller's assertion. Descriptors
and digests are never caller input.

**Lifecycle.** `deliver` initializes the ledger once, after its exact reconcile and before its first
group is staged, and appends after each verified group commit; a resume adoption appends at most one
proven tip. `worktree remove` and `cleanup apply` delete it under the same lock or claim immediately
before its record. `worktree inspect` lists a ledger without a record in `orphanLedgers` and never
deletes it; an unsafe `ledgers` entry is reported as `ledgerDirectory` `{reason: "unsafe", path}`,
and removal then refuses with `UNSAFE_TARGET`.

### Resume adoption and release

Each proof below is reported by its identifier in `proofs` of `NOT_ELIGIBLE`.

- **Resume adoption** (`adoption: "partial-diff-resume"`, `to` `active`): `condition-1` (status
  `aborted` or `failed`), `purpose` (`partial-diff`), `workflow` (`deliver`), `branch`,
  `condition-2` … `condition-6`, `condition-9`, `visibility` (a ledger written `visible` refuses a
  current `hidden`), `ledger` (valid and bound to the record), `history` (the commits since
  `creationOid` are the ledger's, plus at most one recovered tip whose parent, changed paths, blobs
  and modes match the next group), `committed-count` (at least one, after recovery), `index` (clean,
  or staging exactly the next group by path, blob and mode; refused beside a recovered tip),
  `residual` (no other dirty or untracked path, each residual endpoint holding its descriptor's
  kind, mode and bytes) and `source` (`verifySourceManifest` exact: source `HEAD` and every selected
  entry unchanged).
- **Release** (`release: "partial-diff"`, `to` `cleanup-ready`, `reason` `null`): `purpose`,
  `condition-1`, `condition-2` … `condition-6`, `condition-9`, then one route: `gone` (unregistered
  and its path absent; a half-gone worktree is `half-gone` with its `shape`), `clean` (nothing to
  restore), or `ledger` (`residual`: the dirt is exactly the residual descriptors; `index`;
  `source`). A dirty worktree without a valid ledger is `residual` with `route: "no-ledger"` and its
  exact dirty paths.

Both replace the session-ownership check by their proofs, run under the record lock and rewrite only
`status`, `reason`, `updatedAt` and `sessionId` (the new owner); `creationOid`, `receipt` and the
ledger's immutable part never change. A refusal writes nothing; a failed prerequisite lists the
proofs it left open in `unevaluated`, and a record of another repository is `repository`. The resume
appends a recovered tip to the ledger first, then writes the record; an entry whose record write
then fails is the ledger's own commit on the next resume, which recovers nothing. The ledger route
re-checks the source, then each path before discarding it: first its selected source entry with the
source `HEAD`, then, with no Git read between it and the discard, its index entry, any entry staged
at a parent of a tracked path or below it, and its working tree. It restores exactly the dirty
residual paths to `HEAD`, removing a residual file `HEAD` does not hold, and proves the worktree
clean; a restore that stops part-way names the paths already restored, and a retry releases the
rest. A tracked path whose restore would delete a file outside the residual, such as an ignored file
in a directory that replaced it or a file standing at one of its parents, stops the release with
`UNSAFE_TARGET` before that path is discarded, on every retry too. That check runs before the first
discard and again right before the path's own restore, after its last Git read, so a file added
there during those reads is never deleted. The branch and its commits stay. A released record whose
worktree is fully gone stays removable (removal condition exception above).

Every Git call these operations make inside the recorded worktree or the selection's source root
follows the proof that its common directory is this repository's, with `core.fsmonitor=false`.

### Operations

```text
node <skill-root>/scripts/effective-flow-state.mjs ledger init <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","sessionId":"<SESSION_ID>","manifest":<bound manifest>,"groups":[["<endpoint>",…],…],"base":{"branch":"<BASE_BRANCH>","oid":"<CREATION_OID>"},"visibility":"<visible|hidden>","language":{"git":"<de|en>","forge":"<de|en>"}}'
node <skill-root>/scripts/effective-flow-state.mjs ledger append <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","sessionId":"<SESSION_ID>","commitOid":"<COMMIT_OID>"}'
node <skill-root>/scripts/effective-flow-state.mjs ledger reconcile <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","sessionId":"<SESSION_ID>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree resume-check <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","visibility":"<visible|hidden>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree transition <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","from":"<aborted|failed>","to":"active","reason":null,"sessionId":"<SESSION_ID>","branch":"<BRANCH>","workflow":"deliver","adoption":"partial-diff-resume","visibility":"<visible|hidden>"}'
node <skill-root>/scripts/effective-flow-state.mjs worktree transition <<< '{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<EXECUTION_ROOT>","recordId":"<RECORD_ID>","from":"<aborted|failed>","to":"cleanup-ready","reason":null,"sessionId":"<SESSION_ID>","release":"partial-diff"}'
```

`adoption` (`plan-pr-continuation`, the default, or `partial-diff-resume`) is valid only with
`to: "active"`; the resume requires `branch`, `workflow` and `visibility` and forbids
`fetchedHeadOid`. `visibility` is valid only for the resume, `release` only from `aborted` or
`failed` to `cleanup-ready`. Every `visibility` input is `visible` or `hidden`: a run passes its
resolved visibility (`config-resolve` `standard` or `hidden`) with `standard` as `visible`.

- **`ledger init`**, by the session owning the `active` record, writes once, no-clobber, under the
  record lock. Beyond the record's proofs it refuses `creation-tip` (the branch moved),
  `base`, `source-root` and `reconcile` (with `mismatches`). It returns `written: true` with
  `bytes` and `maxBytes`, or above the bound `written: false`, `reason: "size-bound"` with the
  worst case as `bytes` and `limitBytes`, writing nothing; standard input above the bound up to
  1 MiB gets that result too, larger is `INPUT_TOO_LARGE`. A second init is `LEDGER_EXISTS`.
- **`ledger append`** adds the next group's commit under the lock when `ledger`, `complete` (a
  group is still open), `tip` (it is the branch tip), `parent` (the previous ledger commit or
  `creationOid`), `paths` (exactly that group's endpoints) and `blobs` (each descriptor's blob and
  mode) hold. Repeating the recorded tip is `appended: false`.
- **`ledger reconcile`** is the read-only resume reconcile of the owning session's `active` record:
  committed endpoints against the tip's tree by blob and mode, residual endpoints against the
  worktree by bytes and the index, no other dirty path, and `verifySourceManifest`; nothing is
  re-planned. A tip the ledger lacks is `history`. It returns `exact`, `mismatches` (`head`,
  `committed`, `residual`, `index`, `extra`, `sourceDrift`), `staged` `{paths, count}` (residual
  endpoints staged away from `HEAD`, no mismatch by itself), `next`, `remaining` and `tip`.
- **`worktree resume-check`** evaluates every resume and release proof, tip recovery included, and
  writes nothing; it observes the record lock without taking it. It returns `resumable`,
  `resumeProofs`, `unevaluated`, `releasable`, `releaseRoute`, `releaseProofs`, `releasePaths` and
  `releasePathCount` (for an eligible `ledger` route the bounded dirty residual paths a release
  discards and their count, otherwise `[]` and 0), `hasLedger`, `source` (`{root}` of the ledger's
  manifest, or `null`), `committed`, `remaining`, `next`, `recoveredTip`, `hookStaged`, `lock` and
  the bounded refusal `details`.
- **Resume adoption** returns `resume` with `recovered`, `committed`, `next`, `remaining`,
  `remainingGroups`, `tip`, `hookStaged`, `hookStagedEntries`, `base`, `language`, `visibility`,
  `sourceRoot`, `groups` and `selection`: `groups`, every group with its `paths` and commit `oid`
  (`null` while open), is canonical, `committed` and `remainingGroups` are views of it, and
  `selection` lists each manifest entry's `path`, `selectionOrigin` and `renameFrom`. With
  `hookStaged`, `hookStagedEntries` lists each path of `remainingGroups[0]` with the index `mode`
  and blob `oid` the resume proved staged (both `null` for a staged deletion); otherwise it is
  empty. No file content or digest.
- **Release** returns `release` `{route, restored}`.

`INTERRUPTED` after the resume's recovered-tip append and before its record write carries
`written: false`, `ledgerAppended: true` and `appendedOid`: the record is unchanged and the next
resume finds that entry recorded. After the record write it carries `written: true` and the
`resume`; a release that had restored paths completes its record write and carries `written: true`
and the `release`.

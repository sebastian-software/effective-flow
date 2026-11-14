# Input trust boundary

## Status

Active

## Context

Issue Buddy reads issue and comment content from a remote forge before handing selected text to
later planning steps. Forge visibility alone does not establish that an author may control this
workflow, and comment text may contain markers or instructions that should not influence a model.

## Decision

An issue is trusted only when its author has `write` or `admin` collaborator permission on GitHub.
Comments from authors without that permission, or whose permission cannot be established, are
removed in the Issue Buddy script layer before any model step. Untrusted issue and comment text
does not enter trusted-text files, fingerprints, reports, or model inputs.

Trusted text remains data. It never becomes an instruction merely because it passed the permission
filter. Future features that accept questions or other user-controlled input reuse this same
boundary and must apply the filter before model processing.
That rule binds features with a script layer; prompt-level consumers follow
[Focus cross-session messages](./focus-cross-session-messages.md) instead.

**Scoped exception: `backlog-audit`.** A goal audit that skips external reports would be
incomplete, so the interactive `backlog-audit` tool admits every open issue and comment once the
runner's own write permission is proven. The exception covers only its assessment, panel and
drafting leaves, which receive that text as quoted snapshot files labeled as third-party data. The
mitigations:

- The orchestrator holds the tracker write authority and never reads the snapshot; it acts on
  helper metadata, helper-validated verdict JSON and drafted text only. On an external tracker,
  issue text passes it twice, both times unchanged into the helper: at intake, and in the target
  re-read before each write, from which the helper decides whether to write and what.
- Split, obsolete and epic markers count only from the runner or an author with stated write
  permission, so a pasted marker neither hands off, hides nor binds an issue.
- The leaves are instructed to stay read-only and use no tracker access. This is an
  instruction-level restriction; no host mechanism enforces a spawn's tool set.
- Every write comes from a helper-built write set with a closed action vocabulary, shown with its
  exact title, body and label at the gate; obsolete marks are confirmed one issue at a time.
- The report flags every item whose author or commenter lacks proven write permission.

Text derived from external authors can still reach artifacts written under the runner's identity:
the goal epic, split comments, and the children `plan-issue` creates from a split. Consumers that
would treat them as trusted exclude them deterministically: `issue-buddy` skips goal epics, obsolete
marks and split-marked issues, and `apply-issues` routes a split-marked issue whose split is
pending under the [`backlog-audit-split`](../../src/shared/backlog-audit-split.md) rule to
`plan-issue`. Children created from a split keep the interactive baseline of
two previews; this residual risk is accepted.

## Consequences

Issue Buddy fails closed when author permission is missing or unreadable. The boundary is reusable
for later consumers, while the runtime script remains responsible for the concrete filtering and
serialization rules. See [`issue-buddy-core.mjs`](../../src/scripts/issue-buddy-core.mjs).

## References

- [Focus cross-session messages](./focus-cross-session-messages.md)
- [`backlog-audit-core.mjs`](../../src/scripts/backlog-audit-core.mjs)

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
`plan-issue`. Triage artifacts are excluded too: `issue-buddy` skips an issue labeled
`effective-flow-triage-reject` or `effective-flow-triage-needs-work` or carrying a trusted
`<!-- effective-flow-triage security ` notice, and its helper deterministically drops every
write-permitted comment starting with `<!-- effective-flow-triage ` before any model step.
`plan-issue` and `apply-issues` drop those comments from the context handed to their analysis, an
instruction-level exclusion because their orchestrator still reads them, and act on an
`effective-flow-triage-reject` issue or one with a write-permitted security notice only after an
explicit override in an interactive run. Children created from a split keep
the interactive baseline of two previews; this residual risk is accepted. Forge text for an
unattended plan pull request is derived from the plan and sanitized inside the plan-publication
helper, so it never reaches the orchestrator.

**Scoped exception: `triage`.** Deciding on an issue from any author requires reading it, so the
interactive `triage` tool extends the `backlog-audit` exception to its architecture, assessment and
comment-draft leaves, with the same mitigations:

- The orchestrator never reads the snapshot or the overlap index; it acts on helper metadata,
  helper-validated rubric JSON without issue text, and drafted text only. Only the assessment leaf
  receives issue text, as quoted third-party snapshot files.
- Every write comes from a helper-built write set with a closed vocabulary
  (`issue-comment-upsert`, `issue-label-swap` and the labels a confirmed entry needs), shown as an
  exact preview and confirmed one issue at a time. Without a proven runner write permission, or in
  hidden mode, the run is report-only.
- The report flags every issue whose author or commenter lacks proven write permission.
- A managed triage comment is recognized only when its author passes the intake module's marker
  trust, for selection, re-entry and the `issue-buddy` exclusion alike. The upsert edits only the
  runner's own managed comment; another trusted managed comment is left untouched and reported as
  superseded.

The residual channels and their deterministic exclusions:

- **Overlap index titles** of other issues and plans reach only the assessment leaf, as quoted
  data; an A5 issue target must be a number from the index.
- **The A1 summary** is length-bounded by the helper and rendered only into the local report and
  chat; it never enters a drafted comment or a decision.
- **The triage comment** carries text derived from untrusted authors under the runner's identity.
  Its draft leaf receives no snapshot and no A1, and the helper rejects a draft containing `<!--`,
  an attribution pattern, a permission term or a verbatim snapshot substring of 40 or more
  characters. `issue-buddy` drops the comment, as stated above.
- **The triage labels** carry only the verdict; `issue-buddy` skips `reject` and `needs-work`, and
  `plan-issue` and `apply-issues` guard `reject`. A security-flagged issue gets no verdict label
  (an earlier one may be removed) and only a fixed neutral notice with its own marker, naming a
  private channel only when `SECURITY.md` or `.github/SECURITY.md` states one; the notice is the
  deterministic anchor of those exclusions, and this public signal that an issue is sensitive is
  accepted.

## Consequences

Issue Buddy fails closed when author permission is missing or unreadable. The boundary is reusable
for later consumers, while the runtime script remains responsible for the concrete filtering and
serialization rules. See [`issue-buddy-core.mjs`](../../src/scripts/issue-buddy-core.mjs).

## References

- [Focus cross-session messages](./focus-cross-session-messages.md)
- [`backlog-audit-core.mjs`](../../src/scripts/backlog-audit-core.mjs)
- [`triage-core.mjs`](../../src/scripts/triage-core.mjs)
- [`issue-intake-core.mjs`](../../src/scripts/issue-intake-core.mjs)
- [Issue assessment rubric](./issue-assessment-rubric.md)

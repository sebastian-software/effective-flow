# Allow plan-issue to create sub-issues

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`effective-flow plan-issue` may split the issue currently being planned into new work items, but
every issue it creates must be a native sub-issue of that active parent. It must never create a
standalone issue, a sibling of the active issue, or a checklist-only substitute. The split remains
part of interactive planning: when the planning analysis finds that the parent is too broad or not
coherent enough to implement as one work item, the tool proactively proposes a decomposition,
prepares complete child drafts, shows the exact proposed mutations, and creates them only after
explicit approval for that parent.

Verified context:

- At the distributed `main` payload (`dd56b50`), the hard boundary in
  `effective-flow/tools/plan-issue.md` permits only the canonical planning comment and readiness
  labels. No issue creation is currently allowed.
- The editable source lives on `develop`; implementation started from
  `origin/develop@043bc6c`. A drift review confirmed that the intervening session-title change did
  not affect this plan. `AGENTS.md` requires changes under `src/`, followed by a generated build;
  the distributed `effective-flow/` directory is not edited directly.
- `src/scripts/remote-tracker-core.mjs` already supports generic `issue-create`, but it has no
  parent-aware create operation and no operation for listing native GitHub sub-issues.
- `src/tools/apply-issues.md` can expand Markdown checklist containers and external connections that
  expose native sub-items. The forge helper does not yet expose GitHub's native children, so a parent
  created by this feature would not currently be expandable on the implementation path.
- GitHub currently supports native sub-issues, including `gh issue create --parent`, and documents a
  limit of 100 children per parent and eight hierarchy levels. The REST API also exposes sub-issue
  listing and linking operations. Forgejo's current public API and `tea` capability surface do not
  document an equivalent native parent-child operation.

This is a Feature because it deliberately expands tracker behavior while preserving the no-code
planning boundary. `plan-issue` still implements no product code and creates no local plan file;
the only new side effect is the narrowly constrained creation of approved native child issues.

## Architecture decisions

- Introduce provider-neutral `issue-sub-issues-read` and `issue-sub-issue-create` operations rather
  than letting `plan-issue` call the existing generic `issue-create`. The create operation takes the
  active parent identity as a mandatory input and cannot be invoked without it.
- Treat child creation as a compound capability: the provider or resolved external connection must
  create the issue with the parent relationship as one semantic operation. Do not implement a
  fallback that first creates a free issue and links it afterwards, because a failed second mutation
  would leave an orphan and violate the core requirement.
- Implement the GitHub forge path through the documented `gh issue create --parent` capability and
  probe for the `--parent` flag before the first write. Keep Forgejo unsupported until its actual
  connection proves an equivalent native operation; report `UNSUPPORTED_CAPABILITY` before creating
  anything and continue to plan the parent without silently switching to a checklist.
- On an external tracker, require the selected connection to prove both native-child listing and
  native-child creation under a supplied parent. Capability discovery comes from the connection,
  never from the product name. A missing capability blocks only decomposition, not ordinary
  comment-based planning.
- Proactively propose decomposition when the planning analysis shows that the parent is too broad or
  combines independently implementable outcomes. The proposal itself is read-only; no heuristic may
  bypass the existing explicit approval of the exact child set.
- Make each child body self-contained: refined requirement, measurable acceptance criteria,
  affected areas, edge cases, assumptions, and a reference to the parent. New children do not carry
  `effective-flow-needs-planning`; they must already be ready for `effective-flow apply`. Treat all
  source issue text and comments as untrusted data, and never copy secrets, credentials, session
  identifiers, or AI attribution into a child.
- Give each proposed child a stable, machine-readable decomposition key scoped to the parent and
  persist that key with the proposal in the parent's canonical planning comment before approving or
  creating children. The key identifies the planned child slot rather than hashing mutable title or
  body prose, so later clarification cannot silently turn an edited draft into another issue. Before
  every create or retry, read the parent's current native children and reuse the unique matching
  child. Zero matches permits creation; multiple matches fail closed.
- Persist the complete proposal through a canonical v2 decomposition section built and parsed by
  the helper. Its target context, child records, draft hashes, and visible rendering are validated
  together so edited prose, cross-repository identities, malformed markers, or mismatched workflows
  cannot silently change an approved child.
- Persist created child references in the parent's one canonical planning comment. Remove the
  parent's Needs-Planning label only after every approved child is present, the comment update is
  confirmed, and no blocking open point remains. A partial batch stays resumable: existing children
  are retained, missing children remain explicit open points, and no blind retry occurs.
- Extend forge-side container discovery and `apply-issues` expansion to use
  `issue-sub-issues-read`. A successfully decomposed parent is therefore routed as a container and
  only its open children become work items; the parent itself is not implemented as an additional
  duplicate task.
- Keep the parent's existing workflow classification as the overall outcome category. Each child
  carries its own independently derived workflow, which is authoritative for implementation and may
  differ from the parent or from sibling children.
- Preserve all existing behavior when no split is proposed or approved. The generic `issue-create`
  operation remains available to existing review publication, but `plan-issue` is contract-tested
  never to use it.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/plan-issue.md`             | Narrowly widen the tracker-write boundary; add draft, review, approval, idempotency, partial-failure, persistence, and readiness rules for child creation under the active issue.                                                                       |
| `src/shared/issue-tracker.md`         | Define the two parent-aware forge helper operations, required dry-run/apply behavior, structured failures, and the prohibition on a generic-create fallback.                                                                                            |
| `src/shared/tracker-target.md`        | Add conditional external capabilities for listing native children and creating a child under a supplied parent; specify fail-closed behavior without checklist degradation for this feature.                                                            |
| `src/shared/plan-input-gateway.md`    | Make native forge sub-item detection explicitly consume the helper's child-list result so a GitHub parent is classified as `container-issue`.                                                                                                           |
| `src/tools/apply-issues.md`           | Expand native GitHub sub-issues through the helper as well as native external sub-items, while retaining checklist support for pre-existing containers.                                                                                                 |
| `src/shared/issue-lifecycle.md`       | Define how a forge-native child/container relationship is recorded in the PR lifecycle receipt and observed after merge without an unnecessary container write.                                                                                         |
| `src/tools/merge-gate.md`             | Re-read the GitHub parent after a child issue becomes terminal, report remaining native children, and keep post-merge reconciliation idempotent.                                                                                                        |
| `src/scripts/remote-tracker-core.mjs` | Add operation registration, capability probing, validation, GitHub command planning, child-list normalization, create-result normalization, redaction, and ambiguous/unknown-outcome handling. Forgejo must reject the create operation before a write. |
| `test/remote-tracker.test.mjs`        | Cover GitHub probe/command/result behavior, required-parent validation, child listing, dry run, unsupported Forgejo, idempotent recovery inputs, and mutation-may-have-succeeded reporting.                                                             |
| `test/workflow-contracts.test.mjs`    | Pin the `plan-issue` scope exception, explicit approval and readiness order, generic-create prohibition, external capability gate, and forge-container handoff.                                                                                         |
| `docs/user-guide/tools-understand.md` | Document when `plan-issue` proposes a split, its approval prompt, supported targets, resumability, and the guarantee that no standalone issue is created.                                                                                               |
| `docs/user-guide/remote-tracker.md`   | Document GitHub native sub-issue support, Forgejo/external capability behavior, limits, and the interaction with container expansion.                                                                                                                   |

Generated `dist/` and the delivery-branch `effective-flow/` payload remain out of edit scope. They
are verified through the normal build and distribution tests.

## Implementation details

The implementation adds the parent-aware read/create operations and integrates them across
`plan-issue`, Stage B source detection, `apply-issues`, issue lifecycle receipts, and `merge-gate`.
GitHub and GitHub Enterprise use the native relation; Forgejo and under-capable external trackers
fail closed without generic-create or checklist degradation. Canonical v2 records make the exact
approved child set resumable and tamper-evident, while the parent remains container-only even when
its native child list is empty or inconsistent.

Child drafts are sanitized before persistence and creation. Structured credentials, common
prefixed environment secrets, private keys, and authorization headers are redacted or rejected;
recognizable security-requirement prose remains intact. Workflow fields count only at the top level
outside quotes and code fences, and unclosed fences fail before persistence. GitHub decomposition
comments are checked against the 65,536-byte UTF-8 limit before a provider write.

### Approach

1. Add the parent-aware helper contract and capability probes first. Validate a positive parent
   reference belonging to the active repository, complete child title/body, and the absence of AI
   attribution before command planning. Redact secret values if source evidence contains them. The
   dry run must display the parent and the exact publishable child payload without credentials.
2. Implement native-child reads for GitHub and normalize them to the existing issue shape plus the
   parent relation. Implement child creation through the GitHub CLI's parent-aware command. An
   unsupported flag, provider, permission, hierarchy limit, or parent state returns a structured
   error and never falls back to `issue-create`.
3. Extend source detection and `apply-issues` to read native forge children. Container expansion
   retains the current rules: only open children enter the work list, completed children are
   skipped, and duplicate references collapse to one work item. Carry the forge-native container
   reference and mechanism into the existing PR lifecycle receipt.
4. Add a decomposition branch to the per-issue planning loop when clarification and automatic
   quality review show that the parent is too broad or combines independently implementable
   outcomes. Proactively prepare the complete child drafts, then persist the proposal and its stable
   child keys in the canonical parent comment under the existing hash guard. Only after that update
   succeeds, show the proposed titles, bodies, workflows, and parent and ask for approval. An
   unanswered or rejected prompt creates nothing and keeps ordinary parent planning available.
5. After approval, re-read the canonical comment, parent, and current children; enforce provider
   limits before the first create where they are known, and process the approved drafts sequentially.
   Reconcile each stable decomposition key before mutation. After every successful child, retain its
   normalized identifier for the canonical parent comment.
6. If a later child fails, update the parent comment with the completed and missing children when
   that can be done safely, retain `effective-flow-needs-planning`, and require a fresh
   `effective-flow plan-issue <parent>` run. Never delete or recreate valid children and never retry
   a mutation whose outcome is unknown without a fresh child-list read.
7. Once all approved children exist, update the canonical planning comment with their references,
   re-read it under the existing body-hash guard, and only then apply the normal readiness decision.
   The resulting parent is a container for `effective-flow apply`.
8. Extend post-merge observation for a forge-native container. GitHub derives parent progress from
   the child issue's terminal state, so `merge-gate` must re-read and report the parent's remaining
   native children instead of attempting a second completion write or checklist patch.
9. Update focused contracts and user documentation, then generate all three distribution targets
   from `src/` and inspect the built `plan-issue` and tracker helper surfaces for resolved includes
   and unchanged behavior outside the new branch.

### Edge cases

- A parent already at its child limit, at the maximum hierarchy depth, closed, inaccessible, or
  lacking write permission creates no new issue and keeps its planning state.
- A parent reference from another repository or target is rejected before a write; every child stays
  in the active parent's repository even where the provider permits broader relationships.
- A provider can list children but cannot create one under the parent: decomposition is unavailable;
  a checklist is not substituted.
- A child with the same visible title but a different decomposition key is distinct. A unique key
  match is reused; duplicate key matches are ambiguous and block the run.
- A create command reports failure after the remote mutation may have succeeded: record the unknown
  outcome, keep the parent blocked, and require a fresh child-list read before any retry.
- Some children were created before a later draft fails: retain and report the valid children,
  persist the missing drafts as open points, and resume without duplication.
- The user declines the split: create nothing and continue the existing single-issue clarification
  and planning-comment flow.
- Several parent issues are selected: approval, child creation, persistence, and readiness remain
  isolated per active parent; one blocked parent does not authorize or block mutations on another.
- Existing checklist containers and review finding publication keep their current behavior. This
  change neither converts old checklists nor widens `plan-issue` to create review findings.

## Acceptance criteria

- [x] On a GitHub fixture with parent `#123`, an approved two-child decomposition creates exactly two
      issues through the parent-aware operation; both are returned by the parent's native child
      listing, contain self-contained specifications, and no standalone `issue-create` call occurs.
- [x] When planning evidence shows that a parent is too broad or combines independently
      implementable outcomes, `plan-issue` proactively proposes a concrete decomposition but creates
      nothing until the user approves that exact parent and child set.
- [x] Re-running the same approved decomposition after success or an interrupted/unknown outcome
      reuses the uniquely keyed children and creates no duplicates; ambiguous duplicate keys stop
      before a write.
- [x] Forgejo and any external connection without native child creation report the missing
      capability before issue creation, do not fall back to a checklist or generic issue, and leave
      the parent in planning.
- [x] A partial multi-child failure preserves successful children, records missing work in the
      parent's canonical comment, and retains `effective-flow-needs-planning`; a complete batch
      removes the label only after the guarded comment update succeeds.
- [x] `effective-flow apply <parent>` classifies a decomposed GitHub parent as a container, expands
      only its open native children, and does not implement the parent as a separate work item.
- [x] After a child PR merges and that child is observed terminal, `effective-flow merge-gate`
      re-reads the native parent relation, reports any remaining open children, and performs no
      checklist or redundant native-completion mutation.
- [x] A run with no proposed or approved split follows the existing comment-only `plan-issue` path
      unchanged, and existing review publication can still use generic `issue-create`.
- [x] The focused tracker/workflow tests, formatter check, full unit suite, build, and distribution
      smoke suite all pass on a branch based on current `origin/develop`.

Together these criteria define one completion condition: `plan-issue` can decompose an active issue
into resumable, implementation-ready native children without any execution path that creates an
unparented issue, while all non-decomposition workflows remain green.

## Validation plan

| Purpose                         | Command                                                                     | Expected result                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Focused regression tests        | `node --test test/remote-tracker.test.mjs test/workflow-contracts.test.mjs` | Exit 0; parent-aware create/list, unsupported-provider, idempotency, readiness, and no-fallback cases pass. |
| Formatting and source contracts | `pnpm agent:check`                                                          | Exit 0 with no formatting or contract drift.                                                                |
| Full unit suite                 | `pnpm test`                                                                 | Exit 0 with all Node tests passing.                                                                         |
| Source-to-dist build            | `node build.mjs`                                                            | Exit 0; all native and portable targets build with resolved includes and registered runtime scripts.        |
| Distribution verification       | `pnpm test:distribution`                                                    | Exit 0 for isolated build, archive, and delivery payload smoke tests.                                       |

Implementation compared the active branch with `origin/develop@043bc6c` and re-read the listed
source contracts after the drift review. Stop and revise this plan if the repository adds a
different parent-aware tracker abstraction, Forgejo gains a supported native operation that changes
the fail-closed design, or GitHub removes or materially changes `gh issue create --parent`.

## Assumptions and open points

- Assumption: “Sub-issue” means the tracker's native parent-child relation. A Markdown checklist is
  intentionally not an acceptable substitute for issue creation in this feature.
- Decision: `plan-issue` proactively proposes decomposition when planning evidence supports it; the
  proposal never authorizes issue creation without explicit approval of the exact child set.
- Assumption: The implementation starts from current `origin/develop`, not from the generated
  default-branch payload used for this planning session.
- Provider limitation: GitHub exposes no supported atomic conditional write for the create guard.
  The three-read sequence makes sequential re-entry resumable and detects visible duplicates, but
  simultaneous writers can still race after the final pre-create read. Such a result fails closed
  for reconciliation and is never blindly retried.
- No implementation-blocking open points remain.

## Test results

| Check                                  | Result                                    |
| -------------------------------------- | ----------------------------------------- |
| Focused tracker and workflow contracts | 290/290 passed                            |
| `pnpm agent:check`                     | 287 files correctly formatted             |
| `pnpm test`                            | 644/644 passed                            |
| `node build.mjs`                       | Claude, Codex, and portable targets built |
| `pnpm test:distribution`               | Offline distribution checks passed        |
| `git diff --check`                     | Passed                                    |

No credentialed live provider mutation was performed. The helper command plans, provider outputs,
unknown-outcome recovery, container reconciliation, and GitHub Enterprise size boundary are covered
deterministically.

## Review findings

Three bounded correction rounds addressed the initial idempotency, workflow-handoff, publication,
marker, record-integrity, and container-reconciliation findings. Follow-up review also closed
visible-draft tampering, target identity collisions, unclosed fences, aggregate comment sizing, and
quoted/fenced workflow examples. The final independent confirmation reported:

| Severity  | Open findings |
| --------- | ------------: |
| Critical  |             0 |
| Important |             0 |
| Note      |             0 |

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- Directly incorporated: stable child identity is persisted before creation and remains independent
  of mutable draft prose; proposal persistence now precedes approval and every child mutation;
  parent and child workflow classifications have distinct responsibilities; secret values are
  redacted without rejecting legitimate security-related issue text.
- **Resolved · Scope:** `plan-issue` proactively proposes decomposition when the planning evidence
  shows that the parent is too broad or combines independently implementable outcomes. The proposal
  remains read-only until the user approves the exact child set.

## Open points

- No open points.

# Track issue lifecycle through merge

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

When an issue is the implementation basis of `effective-flow apply`, its tracker-visible lifecycle
must reflect the work without requiring a maintainer to update Linear or another tracker manually.
An implementable work-item issue moves to a native started / In Progress state immediately before
the first implementation delegation. A forge that has no native started state uses an idempotent
Effective Flow in-progress label instead. Delegated `build`, `fix`, `refactor`, and `docs` runs are
covered by their issue-owning parent workflow; they must not perform a second tracker transition.

After `effective-flow merge-gate` confirms the merge, it observes every issue that the pull request
records as an implementation basis. Auto-closing integrations get a bounded opportunity to move the
issue to a terminal state. The completion report states the observed state for each issue. If an
issue remains open, it reports the evidence-backed action still needed to close it and offers a
re-entry command for another observation instead of silently ending at the merge.

The change covers arbitrary issues handled by `apply-issues` and remote review-finding issues
handled by `apply-review-remote`. It does not change plan-file status, local review reports,
clarification-only issues, deliberately rejected findings, or container issues that are not
themselves implementation work items.

Planning evidence: source branch `origin/develop` at `455caf2` on 2026-08-14. The current clean,
detached delivery checkout is at `dd56b50` and contains generated portable output rather than the
authoritative `src/**` tree. Implementation must therefore start from `develop` and edit sources,
never the generated `effective-flow/**` or `dist/**` payloads.

## Architecture decisions

- Add one shared issue-lifecycle contract under `src/shared/` and consume it from
  `apply-issues`, `apply-review-remote`, and `merge-gate`. The contract owns started-state
  resolution, the PR-body receipt, post-merge observation, idempotency, and failure behavior so the
  three workflows do not develop separate lifecycle semantics.
- Separate two concepts that `tracker-target.md` currently conflates:
  - Effective Flow classifications such as `effective-flow-needs-planning` and
    `effective-flow-issue-done` remain orchestration metadata. The existing
    `effective-flow-issue-done` meaning (implementation secured in a pull request) remains
    backward-compatible and does not claim that the tracker issue is closed.
  - Native tracker workflow state is independently normalized to lifecycle categories such as
    started and terminal. On an external target, the resolved connection must be able to read the
    state and transition a work item to one unambiguous started state. These capabilities are
    phase-specific: review publication and planning do not require lifecycle mutation; issue-backed
    implementation requires started-state write before code changes; post-merge observation requires
    only state read. The deterministic mapping is the string config key
    `tracker.externalStartedState`, containing the stable tool-native state ID or, only when the
    connection exposes no ID, the exact write token it accepts. No Linear-specific state name or API
    call is hard-coded into Effective Flow.
- Resolve `tracker.externalStartedState` against the tracker before proposing or using it. In the
  exact workspace/team/project context selected by `tracker.externalToolHint`, list the writable
  workflow states and their normalized categories fresh. A configured value must resolve to exactly
  one non-terminal writable state and is rejected if stale, ambiguous, or unavailable. When the key
  is unset, propose a value only when the tracker exposes exactly one strong candidate whose
  normalized category is `started`; show its display name and stable value. A gated run may ask to
  use that value for this run and points to `effective-flow setup` to persist it. A non-interactive
  run, or a tracker with zero or several strong candidates, aborts before code changes and reports
  the observed candidates without guessing. Discovery never writes configuration itself.
- On the forge target, where an ordinary issue only has open / closed state, represent started work
  with the new canonical label `effective-flow-issue-in-progress`. Create and add it idempotently
  before delegation. Do not reopen a closed issue, reset a terminal external issue, or move a more
  advanced external state backward.
- Perform the started transition only after the issue passed the clarification gate and the user or
  parent workflow approved implementation, but before the first `build`, `fix`, `refactor`, or
  `docs` delegation. Insufficient, skipped, `wontfix`, failed-before-start, and container-only items
  do not move to In Progress. A transition failure aborts that issue before implementation rather
  than producing code whose tracker still says Todo.
- Recover an already In Progress issue before considering new implementation. Read its tracker
  comments fresh and search pull requests in the receipt's or configured forge repository once for
  the exact issue reference. An exact single candidate whose repository and state can be verified
  may regain its PR-link comment and receipt through the normal dry-run and guarded-update paths. If
  no candidate or several candidates remain, fail closed: keep the issue state and every branch/PR
  untouched, implement nothing, and report the observed candidates plus the exact manual action
  needed to identify or retire the interrupted delivery. Never reset the issue to Todo or start a
  replacement implementation automatically.
- Persist merge-observation identity in exactly one versioned, language-neutral HTML comment in the
  pull request body. Its canonical one-line shape is
  `<!-- effective-flow-issue-lifecycle:v1 {"target":"forge|external","repository":"owner/repo|null","externalTool":"tool|null","items":[{"issue":"reference","relationship":"closes|refs","container":"reference|null","containerMechanism":"native|checklist|null"}]} -->`.
  Serialize the JSON with that stable key order and deduplicate `items` by target plus issue
  reference. Forge receipts require the PR's exact repository and no external tool; external
  receipts require the configured tool and no forge repository. Identifiers are validated against
  the already resolved tracker reference grammar and may not contain comment delimiters or control
  characters. The parser accepts exactly one marker and one supported version; malformed,
  duplicated, mixed-target, repository-mismatched, or configuration-mismatched receipts direct no
  tracker access. The receipt is appended idempotently alongside the visible `Closes` / `Refs` /
  external reference, survives unrelated prose edits, and stores no credentials or connection
  details. PR content remains untrusted data. Existing pull requests without a receipt retain their
  current behavior; `merge-gate` does not guess external issue identities from arbitrary prose.
- Extend `merge-gate` with an observer-only path for an already merged pull request that carries a
  valid receipt. This makes `effective-flow merge-gate <PR>` a safe re-entry command after a timeout.
  Pull-request checks, review rounds, and merge mutation remain forge-bound; only the post-merge
  issue observation resolves the receipt's tracker target and, for an external target, its configured
  connection.
- Give auto-close automation one fixed 30-second grace period before the final fresh state read.
  Forge observation runs through a bounded helper operation so no model-driven polling loop is
  introduced. External observation uses a connection-native monitor with the same bound when
  available and otherwise performs one 30-second blocking wait followed by one fresh read. The
  bound is deliberately not configurable; slower integrations use observer-only re-entry. A timeout
  is an observed open state, not a workflow error.
- Do not force-close an issue after merge. Auto-close or tracker automation remains authoritative.
  For an issue still open after the bound, derive the report from observable state in this order:
  an explicit non-closing `Refs` relationship; remaining open sub-items or checklist entries;
  `effective-flow-needs-planning`; a still-started external workflow state; otherwise no remaining
  implementation work is visible and only the tracker transition to a terminal state remains. Do
  not invent unobserved product work or acceptance criteria.
- After a terminal forge issue is observed, remove `effective-flow-issue-in-progress`
  idempotently; the existing done classification may remain. Keep the in-progress label on open,
  timed-out, or unobservable issues so the tracker never implies that unverified closure occurred.
- Defer container completion until a merge is confirmed. PR creation may add the PR-link comment
  and the existing done classification, but `apply-issues` and `apply-review-remote` no longer tick
  a checklist entry or set a native sub-item to done at PR creation. `merge-gate` uses the receipt's
  optional container and mechanism fields after merge: it completes the container entry only after
  the linked issue is terminal, and otherwise leaves it open and reports why. Native and checklist
  mechanisms therefore retain the same observable completion semantics.

## Affected files

| File                                  | Description                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/issue-lifecycle.md`       | New shared contract for started transitions, receipt format, bounded post-merge observation, idempotency, and evidence-based closure guidance.                                         |
| `src/shared/tracker-target.md`        | Separate native workflow-state capabilities from Effective Flow classifications; define external started/terminal resolution and fail-closed behavior.                                 |
| `src/shared/issue-tracker.md`         | Add the forge in-progress label and document its compatibility and lifecycle meaning without changing the existing done label's read semantics.                                        |
| `src/tools/apply-issues.md`           | Transition sufficient work-item issues immediately before delegation, retain issue lifecycle context through PR creation, and write the validated PR receipt.                          |
| `src/tools/apply-review-remote.md`    | Apply the same transition and receipt rules to implemented remote review findings without changing `wontfix` or container-only handling.                                               |
| `src/tools/merge-gate.md`             | Parse the receipt, observe linked issues after a successful or already completed merge, report per-issue closure state and required follow-up, and support observer-only re-entry.     |
| `src/shared/next-steps.md`            | Add the merged-but-linked-issues-open edge using `effective-flow merge-gate <PR>` while preserving the existing all-closed merge edge.                                                 |
| `src/shared/config-migration.md`      | Register `tracker.externalStartedState` as a nullable string with read and validation rules; no wait setting is added.                                                                 |
| `src/tools/setup.md`                  | Expose the started-state value through the existing wizard and before/after preview discipline, using a freshly verified tracker suggestion when available; no wait question is added. |
| `src/scripts/remote-tracker-core.mjs` | Add deterministic receipt build/parse support and a bounded forge issue-state wait operation using the existing normalized envelope and injected runner.                               |
| `src/scripts/remote-tracker.mjs`      | Wire the new operation only where the thin CLI entry point needs explicit timeout or operation handling.                                                                               |
| `test/remote-tracker.test.mjs`        | Cover receipt validation, issue-state normalization, closed/open/timeout outcomes, provider command plans, bounds, and structured failures.                                            |
| `test/workflow-contracts.test.mjs`    | Protect transition ordering, exclusions, receipt propagation, already-merged observer re-entry, next-step edges, and source-to-dist inclusion.                                         |
| `docs/user-guide/remote-tracker.md`   | Explain native external status transitions, the forge fallback label, receipt behavior, observation, and connection requirements.                                                      |
| `docs/user-guide/tools-implement.md`  | Document when issue-driven apply marks work In Progress and why delegated implementation tools do not duplicate the transition.                                                        |
| `docs/user-guide/tools-deliver.md`    | Document post-merge issue observation, timeout behavior, observer-only re-entry, and per-issue closure guidance.                                                                       |
| `docs/user-guide/configuration.md`    | Document the fixed 30-second grace period, `tracker.externalStartedState`, and classification versus workflow state.                                                                   |
| `docs/user-guide/troubleshooting.md`  | Add remediation for ambiguous started states, unavailable post-merge connections, and issues that remain open after merge.                                                             |
| `docs/user-guide/tool-flow.md`        | Mirror the merged-but-linked-issues-open next-step edge and its `effective-flow merge-gate <PR>` re-entry command.                                                                     |

Generated `effective-flow/**` and `dist/**` files are validation output only and must not be edited
directly. No change is planned in `src/tools/build.md`, `fix.md`, `refactor.md`, or `docs.md`:
their issue-owning parent applies the transition before delegation.

## Implementation details

### Approach

1. Define the provider-neutral lifecycle vocabulary and the versioned PR-body receipt in the new
   shared fragment. Specify exact validation, duplicate handling, redaction, and backward-compatible
   behavior for pull requests that predate the receipt.
2. Extend external connection discovery with separate list/read-state and
   transition-to-started capabilities. Resolve `tracker.externalStartedState` once before the first
   tracker write. Validate a configured value against fresh tracker states; when it is unset,
   propose exactly one tracker-verified `started` candidate in a gated run and otherwise fail closed.
   Preserve the current classification primitive and container-mechanism checks as independent
   requirements.
3. Add the forge fallback label to the shared tracker vocabulary and update `apply-issues` and
   `apply-review-remote` so each approved work item performs exactly one idempotent started
   transition before its implementation delegation. Carry the retained target and issue references
   into PR creation. When an existing target PR is reused, read its body fresh and append the
   receipt through the existing hash-guarded `pr-update-body` path; a concurrent change fails closed
   instead of overwriting prose or silently omitting the receipt.
4. Add deterministic receipt builder/parser coverage to the runtime helper. Reject multiple,
   malformed, mixed-target, or cross-repository receipts before they can direct tracker reads.
5. Extend `merge-gate` Phase 0 to retain the PR body and recognize observer-only re-entry for an
   already merged PR. After a confirmed merge, resolve only the receipt's tracker target, run the
   bounded observation, record a per-issue terminal/open/unavailable outcome, remove the forge
   in-progress label only for observed terminal issues, and complete any retained container entry
   only for those terminal issues.
6. Update the Phase 6 summary and the next-step edge table. Report closure guidance before the
   standardized next-step block; use re-entry only when at least one linked issue is still open or
   could not be observed.
7. Update configuration/setup, user documentation, deterministic helper tests, and workflow
   contract tests. Build all native and portable artifacts from `src/**` and inspect the generated
   portable files rather than editing them.

### State management

- A work item may advance from unstarted to started, but Effective Flow never moves a terminal or
  more advanced tracker state backward.
- A repeated apply run treats its own in-progress marker plus PR receipt/comment as an existing
  delivery and reports it instead of implementing the issue twice. For an in-progress issue without
  a retained delivery reference, one bounded recovery search may restore an exact unique match;
  zero or multiple matches are an interrupted state that fails closed and is never silently reset.
- The PR-body receipt is the durable handoff between the apply owner and `merge-gate`; transient
  wisdom files remain diagnostic only.
- Container progress remains governed by the existing native-sub-item or exact-checklist mechanism.
  The receipt associates each actual work-item reference with its optional container and selected
  mechanism so post-merge completion never has to rediscover or mix mechanisms.

### API integration

- Forge mutations continue through `scripts/remote-tracker.mjs` with dry-run previews and structured
  envelopes. The new wait operation is read-only and bounded like the existing check wait.
- External tracker access continues through exactly one configured MCP or authenticated CLI
  connection. The receipt's external tool must match the current configured tool; it never selects a
  connection on its own. State mapping comes from connection capabilities and the freshly validated
  `tracker.externalStartedState`, not the external tool's brand. The value is a stable state ID when
  available and only falls back to the connection's exact accepted token when no ID exists. Missing,
  stale, or ambiguous lifecycle capabilities fail before the start mutation, but do not block review
  publication or planning paths that do not mutate lifecycle state.
- Post-merge failure is non-transactional: a merge is never rolled back because the external tracker
  cannot be read. The report preserves the merged result and names the exact observation blocker and
  re-entry command.

### Edge cases

- The issue is already closed or terminal before implementation: skip it; never reopen or reset it.
- The issue is already in a later active state: preserve it and record the idempotent no-op.
- The external target exposes several started states and no decisive hint: stop before code changes
  and name the freshly observed candidate states and their stable values; propose no favorite.
- `tracker.externalStartedState` is configured but no longer exists, belongs to another tracker
  context, is terminal, or is not writable: reject it before implementation and show the current
  tracker candidates; never silently fall back by display name.
- `tracker.externalStartedState` is unset and the tracker exposes exactly one normalized `started`
  state: propose its stable value and display name. Use it only after a gated per-run confirmation;
  persist it only through a separately confirmed `effective-flow setup` run.
- An issue is In Progress but has no retained receipt or PR-link comment: read comments and search
  the current forge once for the exact reference. Restore bookkeeping only for one verified match
  under the existing guarded mutation discipline. With zero or multiple matches, preserve all
  state, list the evidence, and stop before implementation; never reset or reimplement automatically.
- The same issue appears more than once in one PR receipt: normalize to one reference; conflicting
  targets or tools make the receipt invalid.
- A manually edited PR removes or corrupts the receipt: merge behavior stays unchanged, but issue
  observation is unavailable and the summary explains how to restore or verify the link.
- A reused existing PR has no receipt yet: add it only through a fresh PR-body read and guarded
  update; stale or conflicting body state aborts that issue's delivery bookkeeping without
  overwriting the PR.
- The merge succeeds but tracker automation is delayed: wait only to the fixed 30-second bound, then
  report the issue as still open and allow observer-only re-entry.
- The external connection is unavailable only after merge: preserve the merge result, perform no
  fallback write to the forge, and report connection remediation plus re-entry.
- A PR uses `Refs` intentionally: do not call the open issue an auto-close failure; report that the
  non-closing relationship requires an explicit terminal transition when the work is accepted.
- A container remains open because other children remain: list those observable children rather
  than suggesting that the just-merged child itself is incomplete.
- A PR contains no valid receipt: retain current merge-gate behavior and do not heuristically parse
  arbitrary external identifiers.
- A terminal forge issue still carries the in-progress label: remove it idempotently during
  post-merge reconciliation; never remove it when terminal state was not observed.

## Acceptance criteria

- [ ] In contract tests, every sufficient arbitrary issue and every implementable remote review
      finding transitions exactly once to native started / In Progress or the forge fallback label after
      approval and before the first implementation delegation; skipped, `wontfix`, terminal, failed-
      before-start, and container-only cases perform no transition.
- [ ] External lifecycle discovery distinguishes native workflow state from Effective Flow
      classifications and fails before implementation when read-state, transition, or unambiguous
      started-state resolution is unavailable, without imposing lifecycle-write capabilities on review
      publication or planning.
- [ ] `tracker.externalStartedState` is validated against freshly listed writable states in the
      selected tracker context. An unset key produces a proposal only for exactly one normalized
      `started` candidate; stale, terminal, cross-context, missing, and ambiguous values stop before code
      changes, and only `effective-flow setup` persists a confirmed suggestion.
- [ ] An In Progress issue without retained delivery bookkeeping performs one bounded exact-reference
      recovery search. One verified PR may restore the comment and receipt through guarded writes; zero
      or multiple matches leave tracker and forge state unchanged, produce actionable recovery guidance,
      and start no implementation.
- [ ] Every PR created or extended from an issue-driven implementation contains one validated,
      versioned receipt with the correct target and deduplicated work-item references, while legacy PRs
      without a receipt remain mergeable with unchanged behavior.
- [ ] After a successful merge, and on re-entry for an already merged PR, `merge-gate` observes each
      receipted issue to terminal state or the fixed 30-second bound and reports the exact observed outcome;
      terminal forge issues lose the in-progress label and terminal container items complete, while
      open, timed-out, and unobservable items retain both indicators.
- [ ] When any issue remains open or cannot be observed, the merge summary states the concrete
      evidence-based closure action and the final next-step block contains
      `effective-flow merge-gate <PR>`; when all linked issues are terminal, the existing merged/open-
      plans behavior remains unchanged.
- [ ] `node --test test/remote-tracker.test.mjs test/workflow-contracts.test.mjs`,
      `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all exit successfully
      from a clean `develop` checkout, and the generated portable payload contains the new contract in
      the expected lazy/eager locations without direct edits to generated files.

Together these checks define completion: an issue-backed implementation visibly enters progress
before code work, survives delivery through a durable PR receipt, and ends a merge-gate run with a
verified terminal state or a concrete, actionable closure report across forge and external targets.

## Validation plan

- Run focused deterministic tests with
  `node --test test/remote-tracker.test.mjs test/workflow-contracts.test.mjs`; verify positive,
  timeout, stale/invalid receipt, unsupported capability, already-terminal, and already-merged
  re-entry cases.
- Run the repository CI sequence from `AGENTS.md`: `pnpm agent:check`, `pnpm test`,
  `node build.mjs`, then `pnpm test:distribution`.
- Inspect generated Claude, Codex, and portable outputs to confirm the shared lifecycle fragment and
  all tool references are present exactly where the source include graph requires them.
- Perform one manual transcript simulation for a forge issue and one external tracker issue: confirm
  the started transition precedes delegation, the PR receipt is exact, a merged/closed issue reports
  success, and a merged/open issue reports only observable remaining work plus the re-entry command.
- Use an injected clock/sleeper in deterministic helper tests to prove the 30-second bound without
  making the test suite wait in real time.

## Assumptions and open points

- Effective Flow observes closure but does not force it. This preserves repository and tracker
  automation as the authority and matches the requirement to explain what remains when an issue
  stays open.
- The fixed 30-second grace period favors bounded run time and a small configuration surface.
  Integrations that close later are handled through observer-only `merge-gate` re-entry.
- External connectors are expected to expose normalized lifecycle categories or enough state
  metadata to validate one writable started state. The provider-neutral
  `tracker.externalStartedState` key avoids Linear-specific config and hard-coded status names.
- Direct `build`, `fix`, `refactor`, or `docs` invocations whose basis is free text or a plan remain
  tracker-neutral. Their issue-backed invocations are the non-interactive delegations owned by
  `apply-issues` or `apply-review-remote`.
- Interrupted In Progress work favors preservation over automation. A replacement implementation or
  status reset requires a separate explicit user action after the conflicting or missing delivery
  evidence has been reconciled.

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

- **Critical, incorporated — Architecture:** Native review sub-items were still completed at PR
  creation, contradicting the started-until-merge lifecycle. Container completion now waits for a
  confirmed terminal issue after merge and travels through the receipt.
- **Important, incorporated — Scope:** External lifecycle capabilities are now phase-specific, so
  review publication and planning do not inherit an unrelated status-write requirement.
- **Important, incorporated — Security / Error cases:** The receipt now has an exact validated
  schema, repository/tool binding, stable serialization, untrusted-input treatment, and guarded
  existing-PR update path.
- **Important, incorporated — Maintainability:** Terminal forge reconciliation removes the
  in-progress label idempotently; unverified outcomes preserve it.
- **Important, resolved — Testability:** Use one fixed 30-second grace period with an injected
  clock/sleeper in tests and observer-only re-entry for slower integrations; add no wait setting.
- **Important, resolved — Architecture:** Use the structured
  `tracker.externalStartedState` value, validate it against fresh tracker states, and propose a value
  only for one unambiguous normalized `started` candidate; persistence stays with confirmed setup.
- **Important, resolved — Error cases:** Search once for a uniquely verifiable existing PR and
  restore bookkeeping only through guarded writes; otherwise preserve all state, fail closed, and
  report manual recovery without reset or duplicate implementation.

## Open points

- No open points.

## Test results

| Check                                                                       | Result                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `node --test test/remote-tracker.test.mjs test/workflow-contracts.test.mjs` | Passed, 260/260 tests                                       |
| `pnpm agent:check`                                                          | Passed, 288 files correctly formatted                       |
| `pnpm test`                                                                 | Passed, 659/659 tests                                       |
| `node build.mjs`                                                            | Passed for Claude Code, Codex, and portable distributions   |
| `pnpm test:distribution`                                                    | Passed, offline distribution smoke test                     |
| Documentation sync                                                          | Passed; six user-guide surfaces updated, no blocked surface |

The focused tests use injected provider results, a sleeper, and a clock to prove the fixed
30-second bound without real waiting or live tracker credentials. The build confirmed that the
lifecycle contract and byte-identical helper sources are present in every generated target.

## Review findings

**Date:** 2026-08-14
**Reviewer:** Effective Flow Node.js reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

The review found one Critical, three Important, and one Note finding. Two bounded correction
rounds fixed credential-bearing reference handling, forge host binding and canonical identity,
GitHub pull-request discrimination, non-destructive PR-body appends, and strict `externalTool`
identifier validation. The final re-review found no remaining findings above the confidence
threshold.

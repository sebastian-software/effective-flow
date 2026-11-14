# Backlog audit tool for goal alignment of open issues and plans

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Add a new tool, `effective-flow backlog-audit`. It checks all open tracker issues and all open
local plans against one explicitly named goal, and it makes backlog drift visible. In the
Terminaro repository, the issues needed for completion multiplied with every implementation:
follow-up issues grew faster than the work that actually closed the goal.

The tool:

- judges every open issue and every open plan for goal fit;
- names the minimal goal path, meaning the issues actually needed to reach the goal;
- creates or updates one goal epic that links them;
- proposes splits for oversized issues and hands them to `effective-flow plan-issue`;
- never deletes or closes anything. An issue that does not fit the current architecture at all
  is marked as obsolete, and only after an individual user confirmation per issue. The other
  Effective Flow tools then respect that mark.

The primary assessment runs on the `deep` tier (Opus or gpt-6.1-sol) and is mandatory. An
optional panel of additional host-native assessors, such as Claude Fable on Claude Code, can be
switched on. Drafting work runs on the `standard` tier (Sonnet or Luna): the epic section, the
split proposals and the obsolete comments.

Rationale for **Feature**: this is a new user-invocable tool with new tracker behavior.

Decisions the user confirmed while planning:

- **Goal source:** one explicit goal argument per run. Existing epics, milestones, README and
  concepts are context only.
- **Assessment:** one `deep` assessor is mandatory, and the panel is opt-in. Under a
  host-forced subagent model, the run continues with a visible warning.
- **Panel scope v1:** host-native models only. The cross-provider panel ("Astra" through T3 Code
  `delegate_task`) is a separate follow-up plan.
- **Write mode:** a local report first, then one bundled confirmation gate. Obsolete marks are
  confirmed one issue at a time.
- **Trust threshold:** the write permission of the person running the tool is enough. Issue
  authors are not filtered.
- **Downstream protection:** consumer-side exclusion. `issue-buddy` skips goal epics and
  split-marked issues. `apply-issues` routes split-marked issues to `plan-issue`.
- **Targets:** GitHub, Forgejo and external trackers.
- **Obsolete handling:** a rationale comment plus the label `effective-flow-goal-obsolete`. The
  issue stays open. `issue-buddy`, `plan-issue` and `apply-issues` skip or report such issues.
- **Splits:** proposed by this tool and handed to `effective-flow plan-issue`. That tool treats
  a valid, user-confirmed split marker as primary scope.
- **Drift measurement:** computed from the provenance of the open snapshot. v1 has no monthly
  history.
- **Name:** `backlog-audit`.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow, this local plan (user requirement of
2026-11-13)
**Original outcome:** An interactive `effective-flow backlog-audit "<goal>"` run produces a
goal-fit report for all open issues and open plans in scope. After confirmation, it creates or
updates one goal epic with the minimal goal path, hands confirmed split proposals to
`plan-issue`, and marks individually confirmed obsolete issues, which the other tools then
respect. It deletes and closes nothing.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** A new tool file plus a deterministic inventory and write-set helper. It
reuses the remote-tracker operations and adds one Forgejo permission read. It extends model
selection with a host-native panel. It also adjusts `issue-buddy`, `plan-issue` and
`apply-issues`, and amends two ADRs.
**Continuation decision:** None.

## Architecture decisions

- **Separate tool, not an `issue-buddy` mode.** `issue-buddy` is an unattended readiness pass
  that never comments, labels or closes (`src/tools/issue-buddy.md`). Goal alignment is an
  interactive judgment across the whole backlog that ends in tracker writes.
- **The goal is an explicit argument.**
  - A derived goal would adopt the very drift the audit looks for.
  - Without an argument, the tool asks once and ends if no goal is given.
  - The goal text is the user's own instruction and is never classified as an issue reference,
    even when it contains `#123`.
  - All issue, comment and plan text is quoted third-party data.
- **Trust threshold: the runner's write permission (deliberate exception).**
  `docs/adr/input-trust-boundary.md` admits only text from authors with write or admin
  permission to model input. For `backlog-audit`, the user decided that the runner's write
  permission is enough, because a goal audit that skips external reports would be incomplete.
  The exception is recorded as a scoped amendment of that ADR. It covers the assessment, panel
  and drafting leaves of this interactive tool.

  Mitigations:

  - Issue text reaches models only as quoted data files, labeled as third-party data that
    carries no instructions.
  - The orchestrator holds the tracker write authority, so it never reads snapshot files. It
    consumes only helper-validated verdict JSON, helper metadata and drafted text, following the
    rule in `src/tools/issue-buddy.md:18-20`.
  - Assessor and drafting leaves are instructed to stay read-only and to use no tracker access.
    This is an instruction-level restriction: no host mechanism enforces a spawn's tool set.
  - Every write comes from a helper-built write set with a closed action vocabulary. The gate
    shows each entry with its exact title, body and label.
  - The report flags every item whose author, or the author of any comment on it, lacks write
    permission, as far as the target can tell.

- **Downstream protection: consumer-side exclusion.** Text derived from external authors can
  reach tracker artifacts written under the runner's identity: split comments, the goal epic,
  and the children that `plan-issue` creates. The consumers that would treat it as trusted
  therefore exclude these artifacts deterministically.
  - `issue-buddy`, which is unattended and can publish draft PRs, skips issues labeled
    `effective-flow-goal-epic` or `effective-flow-goal-obsolete`. It also skips any issue that
    carries a backlog-audit split-marker comment. This mirrors its existing skip on a
    `plan-issues` comment (`src/scripts/issue-buddy-core.mjs:976-979`).
  - `apply-issues` treats an issue that has a split marker and no newer `plan-issues` comment as
    `insufficient` and routes it to `plan-issue`. That also prevents `apply <epic>` from
    implementing a pending split as a whole.
  - Children created by `plan-issue` keep today's baseline, which is two interactive previews.
- **Targets and permission proof.** The runner's write permission is proven first, before any
  content read, including epic binding. Where it cannot be proven, the run continues
  `--plans-only` and skips epic binding.
  - **GitHub:** `viewer-read` plus `collaborator-permission-read`.
  - **Forgejo:** `viewer-read` plus a new Forgejo `collaborator-permission-read` adapter. The
    Forgejo endpoint exists, but the adapter today reports `collaboratorPermissionRead: false`
    (`src/scripts/remote-tracker-core.mjs:2645-2646`).
  - **External tracker:** the established connection of `src/shared/tracker-target.md` with
    proven read capability and proven write capability for the actions in the write set. The
    helper still builds and validates the abstract write set. The orchestrator then executes
    each entry through the connection, under the tracker-target write discipline: preview,
    re-read immediately before writing, and verbatim compare against the gate-time basis. An
    action whose capability is missing is shown as unavailable in the gate and is never emulated.
  - **`tracker.mode: local`, unset mode, or hidden mode:** `--plans-only` with no tracker access.
    Unset mode also shows a hint to run setup. Combining `--issues-only` with a forced
    plans-only mode stops with a message.
- **Drift is judged across the backlog, not per issue.** The primary `deep` assessor reads the
  complete handoff at once. Two bounds measure everything in that handoff: issues, comments,
  plans and the architecture summary.
  - `maxItems`: default 80 issues plus plans in scope.
  - `maxSnapshotKiB`: default 400.

  If either bound is exceeded, the tool stops before assessment. The stop message gives the
  measured value of each component and the narrowing options (`--label`, `--issues-only`,
  `--plans-only`). The tool never shards or truncates.

- **Narrowed runs produce a partial path.** When `--label`, `--issues-only` or `--plans-only` is
  set, the report header says that the path is partial.
  - Epic entries and plan bullets outside the run's scope are carried over unchanged and marked
    "not assessed in this run".
  - Removal is offered only for in-scope items that were assessed as off the path.
- **A deterministic helper owns inventory and write planning; models own the judgment.** A new
  `src/scripts/backlog-audit.mjs` / `backlog-audit-core.mjs` pair builds the snapshot, validates
  the verdicts, merges the panel, and builds and applies the write set.
  - Forge writes use existing operations only: `label-create` (restricted to the goal labels and
    `effective-flow-needs-planning`), `issue-create`, `issue-update-body`, `issue-comment` and
    `issue-label-add`.
  - The allowlist contains no `issue-close`, `issue-label-remove` or delete. `issue-close` always
    records "completed" (`src/scripts/remote-tracker-github-core.mjs:311-330`).
- **Inventory respects existing Effective Flow states.**
  - **Not assessed, listed separately:** the tool's own epics, legacy review epics, and issues
    labeled `effective-flow-follow-up-closed` or `effective-flow-goal-obsolete`.
  - **Containers:** decomposition parents, including `containerOnly` parents, count as
    containers, and their children are assessed.
  - **In flight:** issues labeled `effective-flow-issue-in-progress` or
    `effective-flow-issue-done` are reported as in flight.
- **The verdict vocabulary is closed.** Each item gets exactly one verdict:
  - `core`: required for the goal;
  - `supporting`: helps, but the goal is reachable without it;
  - `drift`: scope expansion not needed for the goal; stays open and is not in the epic;
  - `oversized`: goal-relevant but too large; comes with a split proposal;
  - `overlap`: duplicates or partly covers another named item, recorded with its target and
    relevance;
  - `obsolete-architecture`: contradicts the current architecture;
  - `unclear`: not decidable from the available text.

  An `obsolete-architecture` verdict must cite primary repository files, such as an ADR or a
  source path with a line. `verdicts-validate` rejects a citation of the architecture summary
  alone.

- **Epic membership follows the verdicts.**
  - The minimal goal path contains only `core` and `oversized` items.
  - `supporting` items are listed below the checklist as plain references.
  - For an `overlap`, only the canonical target can be a member.
  - A decomposition child enters only with its own `core` or `supporting` verdict.
- **Drift summary from the open snapshot.** The helper classifies each open item's provenance
  from deterministic signals:
  - the `effective-flow-review-finding` label;
  - the `<!-- effective-flow-follow-up-admission:v1 -->`, `<!-- effective-flow-iterate` and
    `<!-- effective-flow-decomposition-key` markers;
  - explicit references in English and German ("follow-up of/to #N", "split from #N",
    "Folge von #N", "Nachfolger von #N", "abgespalten von #N").

  Decomposition children of a split-marked parent count as "sanctioned split", not as
  follow-ups. The report gives:
  - the follow-up share among `core` and `supporting` items;
  - the follow-up share among `drift` items;
  - the absolute follow-up count on the minimal goal path.

  Items without a signal are judged and count as "no provenance". v1 has no monthly history.

- **The panel is independent, additive and host-native.**
  - Panel members are models the current host starts directly. On Claude Code that is an Agent
    spawn with an explicit model such as `fable`.
  - Each member receives the same handoff as the primary assessor, without the primary verdict.
  - Panel members come from the config `backlogAudit.panel`. A bare `--panel` uses that list,
    and `--panel=<models>` overrides it for the run.
  - Merge rules:
    - Agreement keeps the verdict.
    - A disagreement on `core` or `drift` becomes a decision point.
    - A disagreement on `obsolete-architecture` turns the verdict into `unclear`, as one record.
    - Other disagreements keep the primary verdict and are listed in the report.
    - Unanimity counts only the members that ran.
    - The primary path and split proposals stay authoritative. Panel differences on path
      membership become decision points.
  - Members that cannot be started are skipped with one visible notice.
- **Model selection is extended for panel sites.**
  - The spawn-site table gets an explicit `Panel` column, and `backlog-audit/panel` is the only
    panel site.
  - The build-generated contract gets a per-harness allowlist of panel models. v1 has Claude
    `fable` and an empty Codex list.
  - `model-selection select` accepts `panelModel` only for panel sites. It rejects a model
    outside the allowlist, or one equal to the primary assessor's resolved model.
  - Effort comes from the `deep` mapping. On Claude Code, execution verification stays
    `unverified`, as for every Claude spawn.
  - Scoped amendment of `docs/adr/per-spawn-model-tiers.md`: the ADR names only tiers, and this
    is the one site that names a model.
- **Host-forced subagent model.** The primary assessment still runs. The report header and the
  chat summary then state the actual model where the host exposes it, and the notice "deep tier
  not honored". Panel members are skipped, because they would duplicate the primary assessor.
- **Goal epic: binding, identity and managed section.**
  - **Binding.** After the permission proof, the tool lists the issues that carry the
    `effective-flow-goal-epic` label and the marker. On targets that can search for the marker,
    it also lists issues that carry only the marker. The user binds the run to one of them or
    creates a new epic. The marker persists the slug,
    `<!-- effective-flow-backlog-audit goal=<slug> -->`. For a new epic, the slug is derived
    deterministically from the goal text and shown for confirmation.
  - **Labeling a new epic.** Where creation cannot set the label atomically, the label is added
    right after creation. If that fails, the run stops.
  - **Membership.** The epic body carries a managed section between the marker and
    `<!-- /effective-flow-backlog-audit -->`. Membership is the reference-agnostic `- [ ] #N` or
    `- [ ] ABC-123` checklist, which `src/shared/apply-source-detection.md` recognizes as a
    `container-issue`. No operation attaches an existing issue as a native sub-issue, so the
    checklist is the only membership mechanism.
  - **Section contents.** The section also states the goal, the audit date and the report file
    name, never a local path. Plans that serve the goal and are tracked on the base branch are
    listed as plain path bullets, never in checklist form. Other plans appear only as a count.
  - **Updates.** Only the managed section is rewritten. Ticked (`- [x]`) or closed entries stay
    as history and are never offered for removal.
  - **Stale-body check.** Before writing, the body is re-read. If it changed since the gate, the
    epic write is skipped instead of overwriting.
- **The epic lists workable items.** `apply-issues` expands only one level
  (`src/tools/apply-issues.md:190-205`).
  - An `oversized` member with an active canonical decomposition is replaced by its qualifying
    children.
  - Without children, it is listed with the note "split pending (plan-issue)".
  - A split counts as declined when the newest `plan-issues` comment is newer than the split
    marker and no active canonical decomposition exists, or the record set is all `declined`.
    A declined split puts the issue back on the epic as a single item, and the split is not
    re-offered unless the user asks.
- **Split hand-off to `plan-issue`.**
  - Split entries exist only where the target can decompose: the probe reports
    `issueSubIssueCreate`, or the external native-container contract applies. Elsewhere, for
    example on Forgejo, the gate shows the split as unavailable and the report recommends a
    manual split.
  - After confirmation, the tool posts the split proposal as a comment with the marker
    `<!-- effective-flow-backlog-audit-split date=<YYYY-MM-DD> body=<hash> -->` and adds
    `effective-flow-needs-planning`.
  - On a rerun, a split marker without that label offers only the missing label.
- **How `plan-issue` treats the split marker.** `plan-issue` step 5 gets an explicit branch.
  - **Valid marker.** The newest split marker is valid when all of these hold:
    - its author has write permission, checked with `collaborator-permission-read` on the forge;
    - the `body=<hash>` still matches the current issue body;
    - no newer `plan-issues` comment declined the split.
  - **Children of a valid marker.** They are primary scope and skip the durable gate's
    admission. Instead of an admission record, they carry
    `**Primary scope:** backlog-audit split <date> (comment <id>)`, bound by the existing
    `draftHash`. `plan-issue`'s clarity and readiness gates still apply.
  - **Unknown permission or changed body.** The marker is demoted to an ordinary proposal, and
    the user confirms the scope interactively.
- **Obsolete marks change no state, and every tool respects them.**
  - For each `obsolete-architecture` item that survives the merge, the user gets a separate
    yes/no question. It shows the cited evidence and the exact drafted comment.
  - On yes, the tool posts the comment first, with the marker
    `<!-- effective-flow-backlog-audit-obsolete -->`, and then adds the
    `effective-flow-goal-obsolete` label.
  - `issue-buddy` skips labeled issues. `plan-issue` and `apply-issues` report the label and
    require an explicit user override before they plan or implement such an issue.
  - `wontfix` is not used, because on review findings it triggers ADR creation.
- **No drift label in v1.** Drift is report-only. Without `issue-label-remove`, a goal-agnostic
  label could never be withdrawn.
- **Local plans are read-only in v1.** Plans are judged and listed.
  - For `oversized` or `drift`, the report recommends `effective-flow plan <plan-file>`
    (revision).
  - For `obsolete-architecture`, it recommends a manual decision.
- **Interactive only.** Any `Run state:` line, whatever its value, and any non-interactive
  delegation is refused with a clear message.
- **Config.** The keys `backlogAudit.panel` (comma-separated panel model names),
  `backlogAudit.maxItems` and `backlogAudit.maxSnapshotKiB` are validated by the helper. No
  `MODE_TOOLS` entry, because the tool has no modes.
- **Runtime state.**
  - **Report.** Kept under `<RUNTIME_STATE_ROOT>/.effective-flow/backlog-audit/`. It is named
    through `name-allocate` and follows `src/shared/runtime-state-safety.md`. It holds no
    verbatim third-party text: only references, verdicts, rationales and citations.
  - **Snapshot.** The per-run snapshot directory is removed on every exit path: completion,
    stops, aborts and failures. A leftover snapshot from an earlier run is removed at entry.

## Affected files

| File                                                                                                                                                                                                                                                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/backlog-audit.md`                                                                                                                                                                                                                                                                 | New tool. Frontmatter `description` and `catalogHint`, delegation mandate, phases below, spawn-site markers, lazy includes (tracker target, language, next-steps, runtime-state safety).                                                                                                                                                                                                                                |
| `src/scripts/backlog-audit.mjs`, `src/scripts/backlog-audit-core.mjs`                                                                                                                                                                                                                        | New helper. `permission-prove`. `inventory-build` (states, snapshot, provenance, bounds, config validation). `verdicts-validate` (coverage, vocabulary, citations, panel merge). `write-set-build` (full candidate set with entry IDs and hashes before the gate; capability gating; out-of-scope carry-over). `write-set-apply` (selected IDs only, hash check, per-target re-read, ordered execution, repair offers). |
| `src/scripts/remote-tracker-forgejo-core.mjs`                                                                                                                                                                                                                                                | New `collaborator-permission-read` adapter.                                                                                                                                                                                                                                                                                                                                                                             |
| `src/tools/plan-issue.md`, `src/shared/durable-follow-up-gate.md`                                                                                                                                                                                                                            | Split-marker branch in step 5 (validity, primary-scope field, demotion). Report the obsolete label and require an override.                                                                                                                                                                                                                                                                                             |
| `src/tools/issue-buddy.md`, `src/scripts/issue-buddy-core.mjs`                                                                                                                                                                                                                               | Skip issues labeled `effective-flow-goal-obsolete` or `effective-flow-goal-epic`, and issues with a backlog-audit split-marker comment.                                                                                                                                                                                                                                                                                 |
| `src/tools/apply-issues.md`                                                                                                                                                                                                                                                                  | A split-marked issue without a newer `plan-issues` comment is `insufficient` and routes to `plan-issue`. Report the obsolete label and require an override.                                                                                                                                                                                                                                                             |
| `src/shared/model-tiers.md`                                                                                                                                                                                                                                                                  | `Panel` column. Spawn-site rows: `backlog-audit/architecture-context` (standard), `backlog-audit/assessment` (deep, Down: no), `backlog-audit/panel` (deep, Down: no, panel), `backlog-audit/epic-draft`, `backlog-audit/split-draft` and `backlog-audit/obsolete-draft` (standard).                                                                                                                                    |
| `src/shared/model-selection.md`, `src/scripts/model-selection-core.mjs`, `build.mjs` (`parseSpawnSiteTable`, `MODEL_TIER_MAPPINGS`, contract generation)                                                                                                                                     | Panel allowlist per harness, `panelModel` input, rejection of a model equal to the primary.                                                                                                                                                                                                                                                                                                                             |
| `src/shared/issue-tracker-forge.md`                                                                                                                                                                                                                                                          | Add the labels `effective-flow-goal-epic` and `effective-flow-goal-obsolete`.                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/next-steps.md`                                                                                                                                                                                                                                                                   | Edge rows for `backlog-audit` to `apply <epic>`, `plan-issue <n>` and `plan <plan-file>`.                                                                                                                                                                                                                                                                                                                               |
| `build.mjs`                                                                                                                                                                                                                                                                                  | `TOOL_GROUPS` ("Understand what to do"), `CONTEXT_BUDGET_LINES`, workflow edges, helper file lists.                                                                                                                                                                                                                                                                                                                     |
| `scripts/distribution-smoke.mjs`                                                                                                                                                                                                                                                             | Add the new helper files.                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/adr/input-trust-boundary.md`                                                                                                                                                                                                                                                           | Scoped amendment: the runner-permission threshold for the backlog-audit assessment, panel and drafting leaves, with its mitigations and the consumer-side exclusion.                                                                                                                                                                                                                                                    |
| `docs/adr/per-spawn-model-tiers.md`                                                                                                                                                                                                                                                          | Scoped amendment: the panel site names a model from the allowlist.                                                                                                                                                                                                                                                                                                                                                      |
| `test/backlog-audit-core.test.mjs`                                                                                                                                                                                                                                                           | New helper unit tests (see Validation plan).                                                                                                                                                                                                                                                                                                                                                                            |
| `test/model-selection.test.mjs`, `test/remote-tracker*.test.mjs`, `test/issue-buddy*.test.mjs`                                                                                                                                                                                               | Panel cases, the Forgejo permission read, and the `issue-buddy` skips.                                                                                                                                                                                                                                                                                                                                                  |
| `test/model-tiers-contract.test.mjs`, `test/workflow-contracts.test.mjs`, `test/delegation-mandate-contract.test.mjs`, `test/helper-call-shape-contract.test.mjs`, `test/execution-profile-contract.test.mjs`, `test/subagent-progress-contract.test.mjs`, `test/setup-status-core.test.mjs` | Extend the tool, helper and edge enumerations the build guards require. Add the `plan-issue` and `apply-issues` contract assertions.                                                                                                                                                                                                                                                                                    |
| `README.md.src`, `docs/user-guide/tools-understand.md`, `docs/user-guide/tool-flow.md`, `docs/user-guide/remote-tracker.md`, `docs/user-guide/configuration.md`, `docs/developer-guide/build-system.md`                                                                                      | User documentation for the tool, labels and config. Update the subsystem and file counts in the build guide.                                                                                                                                                                                                                                                                                                            |

## Implementation details

### Approach

1. **Entry.**
   - Refuse any unattended or non-interactive entry.
   - Remove leftover snapshots.
   - Resolve config, chat and workflow language, tracker target and `<plan.dir>`.
   - Require a goal, asking once if it is missing. It is never typed as an issue reference.
   - Parse `--panel[=<models>]`, `--label`, `--issues-only` and `--plans-only`.
   - Apply the forced plans-only rules.
2. **Permission proof.** Run `permission-prove`. If permission cannot be proven, switch to
   plans-only.
3. **Epic binding** (skipped in plans-only). List the epic candidates. The user binds the run to
   one of them or confirms a new slug.
4. **Inventory.** `inventory-build`:
   - lists open issues in scope;
   - writes each issue with its comments to a quoted data file;
   - records labels, author and commenter permission flags, decomposition state, Effective Flow
     states and provenance signals;
   - lists open plans, plans whose status is unclear, and whether each plan is tracked on the
     base branch.
5. **Architecture context.** A `standard` read-only leaf writes a cited summary of ADRs, the
   README, concepts and the module layout. Then the helper checks both bounds over the complete
   handoff.
6. **Assessment.** One `deep` read-only leaf receives:
   - the goal;
   - the snapshot, plan and architecture-context paths;
   - the output contract: a verdict per item with rationale and evidence, the ordered minimal
     goal path, overlap targets, and split proposals.

   `verdicts-validate` checks the output. One retry follows, then the completion-protocol
   escalation. Under a forced model, record the warning.

7. **Panel (optional).** Run `model-selection select` with `panelModel` for each member, spawn
   the members in parallel, and merge the results with `verdicts-validate`.
8. **Report.** The report contains:
   - goal, scope and the partial-path notice;
   - the model notice;
   - the drift summary;
   - the minimal goal path;
   - one table per verdict;
   - in-flight items, excluded items and permission flags;
   - the decision points;
   - plan recommendations;
   - the panel members that ran or were skipped.

   The orchestrator shows the chat summary from helper output only.

9. **Decisions.** Ask the decision points in one batched round.
   - An `unclear` item answered `core` is appended to the end of the path, flagged as
     user-added.
   - An answer of "obsolete" sends the item to step 12.
10. **Drafts.** `standard` leaves draft the epic's managed section, each split-proposal comment
    and each obsolete comment.
11. **Write set and bundled gate.** `write-set-build` produces the full candidate set with entry
    IDs and hashes. Entries the target cannot carry out show as unavailable. The gate shows the
    epic and split entries with their exact content, and the user selects all, a subset or none.
12. **Obsolete questions.** Ask one yes/no question per surviving item, showing the evidence and
    the exact comment.
13. **Apply.** `write-set-apply` receives the prebuilt set and the selected IDs.
    - **Re-read.** For each entry it re-reads the target first: open state, labels, markers and
      body. A changed hash or target state skips that entry and reports it.
    - **Order.** Calls run in a fixed order: label creation; the epic, plus its label where
      creation was not atomic; each split comment, then its label; each obsolete comment, then
      its label.
    - **External trackers.** The orchestrator executes each entry through the connection under
      the tracker-target write discipline.
    - **Partial failure.** It stops the run and reports what was done and what remains.
14. **Completion.** Report the epic link, the hand-offs, the obsolete marks, skipped and
    unavailable entries, panel and model notices, and the report path. Remove the snapshot
    directory. Emit the next-step block.

### Edge cases

- **No goal-relevant item, no bound epic:** no epic is created. The user is offered a refinement
  of the goal.
- **No goal-relevant item, but a bound epic exists:** the report says so. The only gate option is
  to mark open in-scope epic entries for removal. History entries stay.
- **Reworded goal:** the binding step prevents a silent second epic.
- **Narrowed run:** out-of-scope entries are carried over and marked. The path is reported as
  partial.
- **Epic body edited between gate and apply:** the epic entry is skipped and the difference is
  reported.
- **Target changed between gate and apply** (closed, newly decomposed, already labeled): that
  entry is skipped and reported.
- **Partial write on a rerun:** only the missing step is offered. If an obsolete or split marker
  exists without its label, only the label is offered. A marker-only epic is found during
  binding where the target can search for markers.
- **An `oversized` item with an active decomposition:** no new split proposal. Qualifying
  children replace it in the epic.
- **The target cannot decompose:** the split shows as unavailable, and a manual split is
  recommended.
- **Issue body changed after the split was confirmed:** `plan-issue` demotes the marker to a
  proposal.
- **Runner permission not provable:** `--plans-only`, with the reason.
- **Tracker unreachable:** fail before assessment with the remediation hint from
  `src/shared/issue-tracker-forge.md` or the tracker-target contract.
- **A bound is exceeded:** stop before assessment with the per-component values.

## Acceptance criteria

- [ ] `effective-flow backlog-audit` appears in the router catalog under "Understand what to
      do". `pnpm build` and `pnpm test` pass with the new tool, helper, spawn sites, panel
      allowlist, labels, next-step edges and the changes to `plan-issue`, `issue-buddy` and
      `apply-issues`.
- [ ] `verdicts-validate` rejects missing, duplicate and out-of-vocabulary verdicts, and obsolete
      verdicts without a primary-file citation. On a fixture backlog, the provenance classes and the
      drift shares match precomputed values, and sanctioned-split children are not counted as
      follow-ups (`test/backlog-audit-core.test.mjs`).
- [ ] Without a selection, the write set is applied as empty. The calls applied equal exactly the
      displayed entries the user selected, and a changed entry hash or target state skips that
      entry (helper tests).
- [ ] The epic is created, or its managed section is updated in place. Text outside the section,
      ticked or closed entries, and out-of-scope entries of a narrowed run are preserved. A stale
      body or duplicate candidates stop the epic write (helper tests).
- [ ] The write allowlist contains no `issue-close`, `issue-label-remove` or delete. An obsolete
      mark is emitted only after an individual confirmation, as a marked comment followed by the
      label. A rerun never duplicates a marked comment and offers only a missing label (helper
      tests).
- [ ] A confirmed split emits exactly a marked comment, including the body hash, plus
      `effective-flow-needs-planning`. A split is emitted only where the target can decompose
      (helper tests).
- [ ] Contract tests show these consumer behaviors:
  - `plan-issue` grants primary scope only to a valid split marker, and demotes the marker on
    unknown permission or a changed body.
  - `issue-buddy` skips obsolete issues, goal epics and split-marked issues.
  - `apply-issues` routes split-marked issues without a newer `plan-issues` comment to
    `plan-issue`.
  - `plan-issue` and `apply-issues` require an override for obsolete issues.
- [ ] `model-selection select` rejects a `panelModel` outside the harness allowlist or equal to
      the primary model. The panel merge rules hold on fixtures (model-selection and helper tests).
- [ ] Every `Run state:` value and non-interactive delegation is refused. A bound overflow stops
      before assessment. With unprovable permission, in hidden mode, or with local or unset tracker
      mode, the helper performs no tracker read or write beyond the permission proof (contract and
      fixture tests per target).

## Validation plan

- Run `pnpm build`, `pnpm test` and `pnpm agent:check` through `t3-project`.
- Add `test/backlog-audit-core.test.mjs` with fixtures covering:
  - permission proof and plans-only fallbacks for GitHub, Forgejo, external, hidden, local and
    unset;
  - state exclusions;
  - both bounds over the full handoff;
  - verdict validation and the membership mapping;
  - provenance in English and German, including sanctioned splits;
  - the panel merge and its precedence;
  - write-set IDs, hashes, ordering, capability gating and the allowlist;
  - per-target re-read skips;
  - managed-section update with history and out-of-scope entries;
  - stale-body and duplicate stops;
  - split and obsolete idempotency and label repair.
- Extend the tests for remote-tracker (the Forgejo permission read), model-selection (panel),
  the `plan-issue` and `apply-issues` contracts, and `issue-buddy` (skips).
- Manual check on a scratch GitHub repository:
  1. a run with an empty selection, which must write nothing;
  2. a confirmed run with an epic, one split hand-off and one obsolete mark, followed by a
     `plan-issue` run that creates children under the primary-scope field, and an
     `issue-buddy` dry run that skips the epic and the split-marked issue;
  3. a rerun with the same goal, which updates the managed section and preserves history.

## Assumptions and open points

- The cross-provider panel ("Astra" through T3 Code `delegate_task`) is deliberately out of
  scope. It gets its own follow-up plan, which must disclose which provider receives which data.
- The defaults `maxItems` of 80 and `maxSnapshotKiB` of 400 are assumptions about one deep
  handoff and can be configured.
- The Codex panel allowlist names `gpt-6-astra` (Astra), the Codex model distinct from the
  primary `deep` assessor; a Claude host still cannot reach it without the cross-provider plan.
- External trackers differ in which write and decomposition capabilities they prove. Missing
  capabilities reduce the gate options and never fall back to emulation.
- Children created by `plan-issue` from a split stay at today's interactive trust baseline. This
  residual risk was accepted together with consumer-side exclusion.

## Plan review

**Result:** Approved

### Review 2026-11-13: deep interactive review, third round

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    0 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

#### Findings

- **Security, Important:** The open point misjudged the attack surface. It missed three carriers
  (the epic, children, `apply-issues`), and option (a) leaked through the assessor's proposal.
  Resolved by a user decision: consumer-side exclusion in `issue-buddy` and `apply-issues`. The
  open point is closed.
- **Architecture, Important:** Treating the split marker as root-cause admission contradicted
  the durable gate and the closed admission reasons. Incorporated: an explicit primary-scope
  branch in `plan-issue` and a `Primary scope` field. Sanctioned splits are not counted as
  follow-ups.
- **Architecture, Important:** The split hand-off cannot work on Forgejo or on external trackers
  that cannot decompose, and "declined" had no rule. Incorporated: capability gating and a
  declined rule.
- **Error cases, Important:** `apply <epic>` could implement a pending split as a whole.
  Incorporated: `apply-issues` routes such issues to `plan-issue`.
- **Architecture, Important:** `issue-buddy` would process goal epics and prioritize split-marked
  issues. Incorporated: the skips.
- **Error cases, Important:** Narrowed runs would offer out-of-scope epic entries for removal.
  Incorporated: carry-over and the partial-path notice.
- **Error cases, Important:** Epic binding read content before the permission proof.
  Incorporated: the proof comes first, and binding is skipped in plans-only.
- **Error cases, Important:** No repair existed for a split comment without its label, or a
  marker-only epic. Incorporated.
- **Security, Important:** The mitigations were overstated, and the orchestrator's access to the
  snapshot was undefined. Incorporated: the orchestrator does not read snapshots, leaf
  restrictions are described as instruction-level, and the ADR scope is widened.
- **Security, Important:** The validity of the split marker had no executable check.
  Incorporated: the permission read in `plan-issue`, the body hash in the marker, and demotion.
- **Scope, Important:** The monthly history drove most of the remote-tracker work and was
  undefined off GitHub. Resolved by a user decision: removed from v1, together with `closedAt`,
  `since` and `--milestone`.
- **Data protection, Note:** The epic published untracked plan paths. Incorporated: only plans
  tracked on the base branch are listed by path, the rest as a count.
- **Maintainability, Note:** A redundant hidden-mode clause, and an undefined panel precedence.
  Incorporated.

### Earlier review 2026-11-13: deep interactive review, second round

All 20 findings were incorporated or resolved by user decisions: the write-set gate, the
targets, the `issue-list` fields (since removed), obsolete respect, the split hand-off, the panel
allowlist, membership mapping, inventory states, the drift label, epic identity, the bounds, the
forced model, partial-failure recovery, the merge rules, config, `label-create`, runtime state,
tracker edges and the acceptance-criteria wording. One security point was deferred and is
resolved in the third round.

### Earlier review 2026-11-13: initial plan review

All 26 findings of the initial plan review were incorporated or resolved by user decisions:
target trust, closure semantics, the checklist epic, panel model selection, the split hand-off,
the drift metric, the bounds, the managed section, config naming and the test scope.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-14
**Workflow:** effective-flow build

### Implemented

- `effective-flow backlog-audit "<goal>"`: an interactive tool in "Understand what to do"
  (`src/tools/backlog-audit.md`), with the lazy fragments `src/shared/backlog-audit-external.md` and
  `src/shared/backlog-audit-split.md`.
- Helper `src/scripts/backlog-audit.mjs` / `backlog-audit-core.mjs` with these operations:
  `permission-prove`, `epic-candidates`, `snapshot-cleanup`, `inventory-build`, `bounds-check`,
  `verdicts-validate`, `write-set-build`, `write-set-apply`, `external-call-check`. Large payloads
  go through an `inputFile` mode.
- A Forgejo `collaborator-permission-read` adapter.
- A model-selection panel: a `Panel` column in the spawn-site table, a panel-model allowlist per
  harness in the generated contract, and `panelModel` at panel sites only.
- Consumer-side exclusion:
  - `issue-buddy` skips goal epics, obsolete-marked issues and split-marked issues.
  - `apply-issues` routes pending splits to `plan-issue`.
  - `plan-issue` grants primary scope only to a valid split marker.
  - Both `plan-issue` and `apply-issues` require an override for obsolete issues.
- Labels `effective-flow-goal-epic` and `effective-flow-goal-obsolete`, next-step rows, and the
  skill-ownership entry.
- Scoped amendments to `docs/adr/input-trust-boundary.md` and `docs/adr/per-spawn-model-tiers.md`.
- User and developer documentation: README, the user guide (tools, remote tracker,
  configuration, glossary, tool flow) and the build-system guide.

### Deviations from the plan

- Two extra helper operations: `epic-candidates`, because binding happens before inventory, and
  `bounds-check`, because the final bound check runs after the architecture summary exists.
- Review hardening added `external-call-check` (external apply re-read), the `inputFile` mode
  (the 128 KiB argument limit), and repository binding of the proof.
- The report name uses the existing `concept` name family, because no closer family exists.
- No `WORKFLOW_EDGES` were added: the follow-ups are user-started next steps, not in-run
  delegations.
- `slugify` moved to the leaf `dated-name-allocation.mjs` and is re-exported from the mechanics
  core.

### Test results

- `node build.mjs` passes, and the always-loaded core of `backlog-audit` is 386/389.
- `pnpm test:distribution` passes.
- `pnpm agent:check` is clean after the plan file is formatted.
- `node --test`, run in six groups in the T3 runner:
  - 5,326 pass and 45 are skipped.
  - 38 fail, all for environment reasons: git is not visible in the container, the container's
    `/tmp` is too small (ENOSPC) for `execution-profile-rendering`, and the host-driver Python
    tests need git.
  - The full suite does not finish within one runner exec. CI is the authoritative full run.
- Eval evidence debt: the `next-steps`, `iterate` and `merge-gate` suites need re-recording,
  because `src/shared/next-steps.md`, `src/shared/durable-follow-up-gate.md` and
  `src/scripts/dated-name-allocation.mjs` changed.

## Review findings

**Date:** 2026-11-14
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    49 |
| Open / Not implemented |     0 |

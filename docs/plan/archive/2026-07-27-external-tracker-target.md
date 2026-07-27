# External tracker target for issues and issue-bound planning

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Effective Flow currently knows exactly two destinations for issue-shaped work: a local Markdown
report under `.effective-flow/review/`, or issues in the Git forge behind `origin` (GitHub via
`gh`, Forgejo via `tea`). Teams that keep their issues in an external project-management tool —
Linear, Jira, and comparable products, typically reachable through their own MCP connection —
have no way to say so. `tracker.mode: local|remote` is a two-way switch without a target concept,
and `/effective-flow apply-issues` and `/effective-flow plan-issue` are hard-wired to "the issue
tracker of the `origin` remote".

The goal is a **tool-agnostic target hint**: the project-setup ADR names which tool holds the
issues, and the run-time agent selects the matching MCP connection or shell CLI from that hint.
Effective Flow ships **no** adapter, capability table, or API code for any specific product. It
ships the contract that any named tool must satisfy, the resolution and fail-closed rules, and
the write discipline that keeps its artifacts idempotent and deduplicable on a target the shipped
helper cannot reach.

Both issue-carrying flows are in scope for the first cut (confirmed in the deep plan review): the
issue-driven flow (`/effective-flow apply-issues`, `/effective-flow plan-issue`, and the routing
in `/effective-flow apply`) **and** review publication (finding issues, the epic or its native
equivalent, signature deduplication, severity and action classification). A contract that covered
only one of them would leave the other silently pointed at the forge, which is precisely the
split-tracker outcome the fail-closed rule exists to prevent.

Explicitly **out of scope**:

- Any product-specific adapter, tool-name whitelist, MCP tool-name mapping, or Linear/Jira
  fixture. The hint is data for the agent, not a dispatch table in the source.
- Extending `scripts/remote-tracker.mjs`. The helper stays the GitHub/Forgejo mechanism; the
  external path never routes through it.
- Changing where plan files live. `/effective-flow plan` keeps writing a committed Markdown file
  under `plan.dir`, in every mode. The only plan artifact that follows the target is the canonical
  planning comment of `/effective-flow plan-issue`, which lives on the issue by construction.
- Pull requests, PR comments, and PR review threads. They belong to the code host and stay with
  the forge behind `origin` regardless of the tracker target.
- Migrating existing issues between targets.

Planning basis: HEAD `3f3951f`, 2026-07-27, clean worktree. Before executing, re-read
`src/shared/issue-tracker.md` and the six consumer sources; if their include structure or the
helper operation vocabulary changed, revisit the affected steps.

## Architecture decisions

- **Extend `tracker.mode` with the value `external` instead of introducing a parallel target
  block.** The existing `local`/`remote` semantics stay readable and behave byte-identically for
  every project that does not opt in, and the mode line stays the single place a reader looks to
  learn where issues live.
- **Name the tool with two keys: `tracker.externalTool` (short stable identifier) and
  `tracker.externalToolHint` (free text).** The identifier is routable and quotable in reports;
  the free-text field carries whatever the agent needs to pick the right connection (MCP server
  name, workspace, team or project key, identifier convention, status names). The `external`
  prefix avoids collision with `tracker.remoteToolOverride`, which names a _forge CLI_ and keeps
  its current meaning.
- **No whitelist.** `tracker.externalTool` is validated only as a non-empty short identifier.
  Effective Flow must not reject a tool it has never heard of, and must not infer capabilities
  from the name — capabilities are established from the resolved connection.
- **The target governs identity, not the local/remote distinction.** `local` and `remote` keep
  meaning exactly what they mean today, including the fact that `apply-issues`/`plan-issue`
  remain inherently tracker-bound and use the forge. `external` redirects the issue identity of
  _all_ issue-carrying flows — review finding/epic publication and the issue-driven flow — to the
  named tool. Confirmed in the deep plan review against the two alternatives (letting
  `externalTool` alone decide identity, or adding a third `tracker.findings` key): the mode line
  stays the one place that answers "where does issue work live", and the rarer combination
  "issues external, findings local" stays reachable per run through the existing explicit-wish
  precedence instead of costing every project another key.
- **A container relation is used natively when the target offers one, with the checklist as the
  fallback.** The forge epic is a Markdown `- [ ] #NNN` checklist patched exactly; most external
  tools model this as a parent issue with sub-issues, where a pasted checklist is invisible to the
  UI and to their progress tracking. The contract therefore requires: use the target's native
  parent/sub-issue relation when the resolved connection exposes it and derive completion from the
  sub-item's own state; otherwise fall back to the checklist plus exact patch. Which mechanism was
  used is reported in the run summary, so a reader can tell how progress is tracked. Both
  mechanisms must yield the same observable outcome — every finding reachable from its container,
  and completion visible per finding.
- **The full external contract is lazy-loaded.** `src/shared/issue-tracker.md` is eagerly included
  by six sources and is already a context-budget concern (`3f3951f`). It therefore carries only
  the short target-resolution rule and an obligation on every embedding source; the new
  `src/shared/tracker-target.md` loads only once a run has resolved an external target.
  **Implemented form:** the `lazy-include` fence sits in each of the six consuming tool sources
  rather than in the shared fragment — see "Assumptions and open points" for why the originally
  planned nested fence shipped a defective artifact.
- **The external path re-establishes by rule what the helper guarantees by code.** Preview before
  mutation, a fresh read plus verbatim comparison immediately before an update, single canonical
  marked comment, marker- and `Signature`-based idempotency, no attribution footers, no
  self-assembled API calls with discovered credentials.
- **Fail closed, never fall back.** A missing, ambiguous, or under-capable connection aborts with
  a remediation hint. Silently writing to the forge instead of the named tool would scatter the
  team's issues across two systems, and silently degrading to a local report would hide work the
  user asked to publish. This mirrors the existing `CLI_MISSING`/`AUTH_FAILED` rule.
- **Effective Flow's label vocabulary stays canonical.** `effective-flow-needs-planning`,
  `effective-flow-issue-done`, the action and severity labels, and the `wontfix` label keep their
  exact strings. A target may store them in its own classification primitive (labels, tags,
  states, custom fields) when the resolved connection exposes one; when it exposes none, the flows
  that depend on that state fail closed instead of losing the lifecycle.
- **The security disclosure gate becomes target-neutral.** Publishing a finding to a third-party
  SaaS tracker is a disclosure with the same consequences as publishing it to a public forge, so
  the gate binds every publisher, not only remote forge publishers.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/tracker-target.md`         | **New** lazy-loaded fragment: target vocabulary, connection discovery, required capability contract, fail-closed rules, agent-driven write discipline, label/state mapping, reference syntax, cross-linking to the forge                                                                                                         |
| `src/shared/issue-tracker.md`          | Add the three config keys and their defaults; add the short target-resolution rule; generalize "remote publisher" to every publisher in the security gate and the no-attribution section; state that its helper mechanics are the forge target; oblige every embedding source to carry its own deferred `tracker-target` pointer |
| `src/shared/apply-source-detection.md` | Stage A/B: reference forms in an external target, unchanged legacy four-digit plan precedence, mixed forge/external reference lists                                                                                                                                                                                              |
| `src/shared/pr-review-comments.md`     | One sentence: PR objects stay with the forge behind `origin` even when the tracker target is external                                                                                                                                                                                                                            |
| `src/tools/setup.md`                   | Config-schema line for `tracker`; third option in the tracker question plus the two free-text follow-ups; advanced-settings list; Step 7 summary                                                                                                                                                                                 |
| `src/tools/review.md`                  | Phase 1: resolve the target, not only the mode; Phase 4: publication branch phrased per target; keep the local report path unchanged                                                                                                                                                                                             |
| `src/tools/plan-issue.md`              | Replace the "always the tracker of `origin`" precondition with target resolution; keep the comment-update fail-closed contract, phrased target-neutrally                                                                                                                                                                         |
| `src/tools/apply-issues.md`            | Same target resolution; label-ensure step and status transitions via the resolved target                                                                                                                                                                                                                                         |
| `src/tools/apply.md`                   | Routing and stage B against the resolved target; report the target in the handoff summary                                                                                                                                                                                                                                        |
| `src/tools/apply-review-remote.md`     | Target-neutral phrasing for epic/finding processing; tick-off via the native container relation or the checklist fallback                                                                                                                                                                                                        |
| `src/tools/cleanup.md`                 | State that the `firmo-` label cleanup is forge-only and is skipped for an external target                                                                                                                                                                                                                                        |
| `src/tools/apply-review.md`            | **Added during implementation (review finding F2).** Its sub-file gate keyed on the tracker mode being `remote`, so the external contract could never load for an external epic or finding; restated target-neutrally                                                                                                            |
| `src/tools/plan-review.md`             | **Added during implementation (review finding F7).** Its issue-mode comment update was written purely in forge-helper vocabulary; the external branch of that write path is now spelled out                                                                                                                                      |
| `test/workflow-contracts.test.mjs`     | Contract assertions for the new rules (keys, fail-closed, capability gate, gate generalization, plan-file invariant, PR/forge boundary)                                                                                                                                                                                          |
| `docs/user-guide/remote-tracker.md`    | New "External target" section; make clear the page now covers three targets                                                                                                                                                                                                                                                      |
| `docs/user-guide/configuration.md`     | Block `tracker`: the three keys, values, defaults, meaning                                                                                                                                                                                                                                                                       |
| `docs/user-guide/glossary.md`          | Term "tracker target"                                                                                                                                                                                                                                                                                                            |
| `docs/user-guide/troubleshooting.md`   | Entry for the fail-closed external-connection error and its remediation                                                                                                                                                                                                                                                          |
| `AGENTS.md`                            | One sentence in the configuration/ADR section that the tracker target may be an external tool and that labels/PRs keep their described behavior                                                                                                                                                                                  |

## Implementation details

### Approach

1. **Write `src/shared/tracker-target.md`.** It owns, in this order: the target vocabulary
   (`local`, `forge`, `external`); the resolution precedence; connection discovery and its
   fail-closed rules; the required capability contract; the write discipline; the label/state
   mapping rule; reference syntax; and the forge boundary for PR objects. Keep it a contract, not
   a tutorial — no product names beyond illustrative examples.
2. **Define the capability contract** as the provider-neutral set the existing forge flows
   actually consume, derived from the helper's operation list in
   `src/scripts/remote-tracker-core.mjs:36-60`: read one issue with its state, classification and
   description; list or search issues by classification and by description content (needed for
   `Signature` dedup); create an issue with title, description and classification; read an issue's
   comments with stable comment IDs; create a comment; update one comment by its ID; add and
   remove a classification value; and patch an exact marked block or checklist entry inside a
   body. A target that cannot cover a capability makes the flows that need it unavailable — the
   run aborts before its first write with a message naming the missing capability, mirroring
   today's `UNSUPPORTED_CAPABILITY`. One capability is **optional**: a native parent/sub-issue
   relation. Its presence selects the native container mechanism, its absence the checklist
   fallback; neither case aborts.
3. **Define connection discovery.** Before the first read, the run establishes exactly one
   concrete connection for `tracker.externalTool`, guided by `tracker.externalToolHint`: an
   available MCP server whose tools cover the contract, or an installed and authenticated CLI. The
   selected connection is named in the status report. Zero candidates, no capability coverage, or
   several plausible candidates without a decisive hint each abort the run without side effects.
   Constructing raw API requests from credentials found in the environment is forbidden; only the
   connection the user configured may be used.
4. **Define the write discipline** as the external equivalent of the helper's guarantees:
   describe every intended mutation (target, operation, exact payload) before performing it;
   re-read the exact body or comment immediately before an update and compare it verbatim against
   the retained basis, aborting on any difference instead of merging or overwriting; never create
   a second marked comment after a failed update; keep `<!-- effective-flow-plan-issues -->`,
   `<!-- effective-flow-apply-issues -->`, the `Signature` field and the `R-XXXXXXX` IDs
   byte-identical, since they are the tool-independent idempotency and dedup keys; add no
   attribution footers; redact secrets from every previewed payload.
5. **Extend `src/shared/issue-tracker.md` minimally.** Add the three keys with defaults to the
   configuration section; add `external` to the mode determination with its precedence intact
   (argument type, then per-run wish, then config, then first-invocation query); state that the
   helper contract, label backward compatibility, `sf-` migration and epic/finding body formats
   describe the **forge** target; generalize the security-gate and no-attribution wording to every
   publisher; add the `lazy-include` pointer with a `when:` condition tied to a resolved external
   target. Leave the first-invocation query two-way (Local / Remote): it runs only when no
   configuration pins a mode, and it must not write configuration, so it cannot acquire the tool
   identifier an external target requires. An external target is configured through
   `/effective-flow setup`, or named per run in an explicit user wish that supplies the tool.
   Correct the three call sites that reference a non-existent "Host and CLI detection" section
   while they are being rewritten anyway.
6. **Update the six consumer sources.** `review.md` resolves the target in Phase 1 and branches in
   Phase 4 per target; the local report path, ID reservation, dedup order and gate order stay
   exactly as they are, and `<review-output-language>` (`review.md:299-300`) follows the
   destination as before — tracker prose uses `language.forge` on an external target too, while
   the withheld-findings report keeps `language.workflow`. `plan-issue.md` and `apply-issues.md`
   replace their `origin`-forge precondition with target resolution while keeping their
   "inherently tracker-bound, does not evaluate local/remote" property. `apply.md` and
   `apply-source-detection.md` classify references against the resolved target.
   `apply-review-remote.md` gains the two container mechanisms for tick-off, and `cleanup.md` a
   forge-only scope statement.
7. **Update `src/tools/setup.md`.** The tracker question gains a third option that sets
   `tracker.mode = external`; choosing it asks for the tool identifier and the optional hint as
   free text, with an explanation that the hint is what lets the agent find the right MCP
   connection or CLI. The safe-defaults base stays `tracker.mode = local`; the advanced list and
   the summary gain the two new keys.
8. **Extend `test/workflow-contracts.test.mjs`** with assertions in the style of the existing
   tracker block (`test/workflow-contracts.test.mjs:181-263`).
9. **Update the four user-guide pages and `AGENTS.md`** last, so the documentation describes the
   shipped contract rather than the draft.

### Component structure

Not relevant — this change is Markdown contract sources plus documentation; no runtime component
is added and `scripts/` is untouched.

### State management

The only new persisted state is configuration: three rows in the project-setup ADR table. No new
runtime state under `.effective-flow/` is introduced. The `labelMigration.sf` and
`configMigration.adr` memory markers keep their current meaning and are forge concerns.

### API integration

No new code-level API integration. External access happens exclusively through a connection the
user already configured (MCP server or authenticated CLI), selected at run time from the hint.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`tracker.mode: external` without `tracker.externalTool`:** invalid configuration. Abort with a
  pointer to `/effective-flow setup`; never guess a tool and never fall back to the forge.
- **`externalTool`/`externalToolHint` set while the mode is `local` or `remote`:** ignore them for
  routing, report the ignored keys once, and keep them in the ADR (they document intent and are
  preserved by setup's unknown-key rule).
- **Argument contradicts the configured target:** the existing precedence holds. A forge issue URL
  forces the forge for that run, a report path forces `local`; report which target the argument
  selected.
- **Mixed reference list** (a forge reference and an external reference in one call): do not
  guess — extend the existing mixed-list rule and ask the user to split the call.
- **Bare numeric argument:** a four-digit value remains a legacy plan reference, never an issue
  reference, in every target. A bare non-four-digit number while the target is external is
  genuinely ambiguous — it could be a leftover forge issue or a shorthand for the external
  tool — so ask instead of guessing; a tool-native identifier (`ABC-123`) or a tool URL resolves
  without a question.
- **Deduplication does not span targets.** `Signature` dedup and the `R-XXXXXXX` range only see
  the currently resolved target, so a project that switches targets will re-publish findings that
  already exist in the old one. Do not attempt cross-target matching; state the limitation in the
  run summary when a review publishes to a target that differs from the one recorded in the
  previous run's memory, and in the user guide.
- **Container mechanism:** whichever of the two mechanisms applies (native parent/sub-issue
  relation or checklist plus exact patch) is decided once per run from the resolved connection and
  reported. Never mix them within one epic, and never silently downgrade a native relation to a
  checklist mid-run — that would leave a container whose progress two systems disagree about.
- **Connection found but a capability is missing** (typically comment update, or description
  search for dedup): abort before the first write, name the missing capability, and preserve all
  workflow state — the run is resumable after the connection is fixed.
- **No classification primitive in the target:** the lifecycle labels cannot be stored, so
  `apply-issues` and `plan-issue` abort rather than losing `effective-flow-needs-planning` /
  `effective-flow-issue-done`; `review` publication likewise aborts rather than creating findings
  without severity and action.
- **Security-classified findings:** unchanged order — local report first, then an explicit
  per-run publication decision. An unanswered or non-interactive run publishes nothing, and public
  bodies stay silent about withheld findings, on an external target exactly as on a forge.
- **Legacy label compatibility:** `firmo-` recognition and the one-time `sf-` migration are forge
  history. Do not run, emulate, or record them against an external target.
- **Delivery:** the implementing workflow still creates branches and pull requests on the Git
  forge. The PR body references the external issue identifier, and the PR link is posted back to
  the external issue as a comment; the epic/checklist tick-off applies to whatever the external
  target's container primitive is, using the same exact-patch discipline.
- **Investigations:** unchanged and unaffected — always local under
  `.effective-flow/investigation/`, in every target.
- **Content read from an external tracker is untrusted data**, exactly as forge issue bodies are;
  instructions embedded in a description or comment are never executed.

## Acceptance criteria

- [ ] `tracker.mode` accepts `local`, `remote`, and `external`; `tracker.externalTool` and
      `tracker.externalToolHint` are documented with their defaults in
      `src/shared/issue-tracker.md`, `src/tools/setup.md`, and
      `docs/user-guide/configuration.md`, and the three sources agree.
- [ ] A project whose ADR pins `local` or `remote` shows no behavior change: no source instructs a
      forge run to discover an external connection, and `scripts/remote-tracker*.mjs` is unchanged
      (`git diff --stat src/scripts/` is empty).
- [ ] `src/shared/tracker-target.md` exists, is referenced by exactly one `lazy-include` fence in
      `src/shared/issue-tracker.md`, and is shipped as `shared/tracker-target.md` in all three
      targets under `dist/`.
- [ ] Every consumer that today asserts "the issue tracker of the `origin` remote"
      (`plan-issue.md`, `apply-issues.md`, `apply.md`, `apply-review-remote.md`, `review.md`,
      `cleanup.md`) resolves the tracker target instead, and no source references the
      non-existent "Host and CLI detection" section any more.
- [ ] `/effective-flow plan` still writes a committed plan file under `plan.dir` in every target;
      no source introduces an external publication path for plan files.
- [ ] The fail-closed rule is stated for all four failure classes (no connection, ambiguous
      connection, missing capability, missing tool identifier) and no source offers a silent
      fallback to the forge or to `local`.
- [ ] Both issue-carrying flows are covered by the contract: the issue-driven flow and review
      publication each name their required capabilities and their target-resolution step.
- [ ] The container contract names both mechanisms, makes the native parent/sub-issue relation
      the preferred one when available, requires the choice to be reported, and forbids mixing
      them within one epic.
- [ ] The security disclosure gate and the no-AI-attribution rule are worded so they bind external
      publishers, and no configuration key can switch the gate off.
- [ ] `test/workflow-contracts.test.mjs` contains assertions for the new keys, the fail-closed
      classes, the capability gate, the plan-file invariant, and the PR/forge boundary; the suite
      passes.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all succeed.

## Validation plan

| Purpose                 | Command                  | Expected result                                                              |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| Formatting              | `pnpm agent:check`       | exit 0, no oxfmt diff                                                        |
| Contract and unit suite | `pnpm test`              | exit 0, including the new `workflow-contracts` cases                         |
| Build guards            | `node build.mjs`         | exit 0; include, lazy-include (#99), ownership and version-drift guards pass |
| Distribution layout     | `pnpm test:distribution` | exit 0                                                                       |

Additional checks after the build:

- `shared/tracker-target.md` is present in `dist/claude/`, `dist/codex/`, and
  `dist/portable/effective-flow/`, and the load pointer emitted into the inlined
  `issue-tracker` text names it.
- `git diff --stat src/scripts/` is empty — the helper was not touched.
- Read-through of the rendered `dist/claude/effective-flow/tools/review.md`: the eagerly loaded
  body must not contain the external contract text, confirming the lazy split actually saved
  context.
- Manual wizard read-through of `src/tools/setup.md`: choosing the external option leads to the
  tool identifier and hint questions, and the summary reports both.

## Assumptions and open points

- The combination "issues in an external tool, but review findings only in a local Markdown
  report" is not expressible in configuration; it stays reachable per run through the explicit-wish
  precedence ("local only, without issues"). Decided in the deep plan review — see the
  architecture decision on target identity for the rejected alternatives.
- `tracker.remoteToolOverride` remains forge-only and is ignored when the target is external; it
  is not renamed, to avoid a config migration for every existing project.
- `language.forge` keeps its name and its surface description although it now also governs prose
  on an external tracker. Its documented surface ("issues, PR bodies, issue/PR comments") is
  already target-neutral, so `src/shared/language-rules.md` needs no change; renaming the key
  would force a config migration on every project for a cosmetic gain.
- The external path cannot be unit-tested the way the helper is. Its guarantees are prose
  contracts enforced by `workflow-contracts` assertions plus run-time fail-closed behavior. This
  is accepted as the cost of not shipping product-specific adapters, and is the reason the
  capability and write-discipline rules are written as hard aborts rather than best-effort advice.
- A nested `lazy-include` inside an eagerly included shared fragment is unprecedented in this
  repository, although `build.mjs:558-575` shows the transform order supports it. **Stop
  condition:** if `node build.mjs` reports a lazy-include guard failure (#99), move the fence from
  `src/shared/issue-tracker.md` into the six consuming tool sources instead, and note the change
  in the delivery.

  **What actually happened:** the stop condition fired, but through a different failure than
  predicted, and guard #99 would never have caught it. `build.mjs:571` does resolve lazy fences
  after eager inlining, so for the five tools that include `issue-tracker` eagerly the nested
  fence rendered correctly. The defect comes from `src/tools/review.md`, which defers
  `issue-tracker` itself: the fragment therefore also ships standalone through the eager-only
  path at `build.mjs:803`, where a raw, unrendered fence survives verbatim into
  `dist/*/effective-flow/shared/issue-tracker.md` — precisely the copy `review.md` loads. Guard
  #99 stayed silent because `tracker-target` was still shipped via the other roots. The
  documented fallback was applied: the fence now lives in all six consuming tool sources, and
  `issue-tracker.md` states the obligation that every embedding source carry its own pointer. The
  contract test derives that consumer set from the include closure rather than hard-coding it, so
  a future seventh consumer cannot silently ship without the contract.

- Whether the four documentation pages are enough, or whether the external target deserves its own
  user-guide page, is left to the documentation step; `docs/user-guide/remote-tracker.md` keeps
  its path either way so existing links stay valid.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

The deep interactive plan review of 2026-07-27 resolved three decision-requiring points: target
identity stays bound to `tracker.mode`; the container relation is native when available with the
checklist as fallback; both issue-carrying flows are in the first cut. No open point remains.

### Findings

- **Architecture, Important — `tracker.mode` conflates destination and identity.** Extending the
  mode enum keeps one readable line but ties "which tool" to "publish or not". Decided in the deep
  review in favour of the single mode line; the limitation is documented and has a per-run escape
  hatch, and a later split into two keys stays possible without breaking `local`/`remote`.
- **Architecture, Important — the forge epic checklist does not translate to tools with native
  sub-issues.** Pasting `- [ ] #NNN` into a tool that models containment natively produces a
  container its own UI cannot track. Decided in the deep review: use the native relation when the
  connection exposes it, fall back to the checklist otherwise, report which was used, and never
  mix them within one epic.
- **Security, Important — the external path loses the helper's enforced dry-run and redaction.**
  Incorporated: preview-before-mutation, verbatim fresh-read precondition, single-canonical-comment
  rule, secret redaction in previews, and an explicit prohibition on self-assembled API calls with
  discovered credentials are contract requirements, not suggestions.
- **Security, Note — publishing findings to a third-party SaaS tracker is a disclosure.** The
  security gate is generalized to bind every publisher; the user guide should say plainly that
  choosing an external target widens the audience for finding bodies.
- **Data protection, Note — issue content leaves the forge boundary.** No new personal data is
  processed by Effective Flow itself, but the documentation should name the change of processor so
  a team can make that call knowingly.
- **Error cases, Important — four distinct failure classes, one temptation to fall back.**
  Incorporated: missing tool identifier, no connection, ambiguous connection, and missing
  capability each abort explicitly, before the first write, with preserved state.
- **Error cases, Note — deduplication cannot span targets.** A project that switches targets
  re-publishes findings that already exist in the old one. Incorporated as an edge case with a
  reporting requirement rather than an attempt at cross-target matching, which would need a
  persistent per-target index this change deliberately avoids.
- **Error cases, Note — the first-invocation query cannot produce an external target.** It runs
  without configuration and must not write any, so it cannot obtain the tool identifier.
  Incorporated: the query stays two-way and points to `/effective-flow setup`.
- **Scope, Important — covering only one of the two issue-carrying flows would split the
  tracker.** Decided in the deep review: the issue-driven flow and review publication are both in
  the first cut, so no flow is left silently pointing at the forge.
- **Testability, Important — prose contracts are only as good as their assertions.** Incorporated
  into the acceptance criteria and the validation plan as concrete `workflow-contracts` cases plus
  a rendered-output check that the lazy split works.
- **Scope, Note — the obvious side quest is a Linear adapter.** Explicitly excluded in the
  requirement, together with helper changes and issue migration.
- **Maintainability, Note — `issue-tracker.md` is eagerly loaded by six sources.** Mitigated by
  keeping only the short resolution rule eager and deferring the full contract; the validation plan
  verifies the saving in the rendered output.

## Open points

- No open points.

## Test results

| Check                    | Result                                 |
| ------------------------ | -------------------------------------- |
| `pnpm agent:check`       | exit 0, 249 files, correct format      |
| `pnpm test`              | exit 0, 354 pass / 0 fail (346 before) |
| `node build.mjs`         | exit 0, all guards pass                |
| `pnpm test:distribution` | exit 0, offline checks passed          |

Eight contract cases were added to `test/workflow-contracts.test.mjs`: the config keys across
source, wizard and user guide; the four fail-closed failure classes; the capability gate with its
one optional capability; the container mechanism; the plan-file invariant and the PR/forge
boundary; the generalized security gate; the derived lazy-fragment consumer set; and a sweep that
no source cites the non-existent "Host and CLI detection" section.

Additional scope verification: `git diff --stat src/scripts/` empty (the shipped helper is
byte-identical), `shared/tracker-target.md` present in all three `dist/` targets, and no raw
`lazy-include` fence anywhere in `dist/`. Always-loaded core sizes stay under the 700-line budget
(build 542, fix 429, docs 543, review 601, plan 478).

## Review findings

**Date:** 2026-07-27
**Reviewer:** `effective-flow-generic-product-reviewer` (sources), `effective-flow-nodejs-reviewer`
(tests), `effective-flow-code-validator` (documentation and technical validation)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    23 |
| Open / Not implemented |     3 |

Both Critical findings were fixed before completion. The most consequential: a generic "as issues"
wish outranked the configuration, so a project pinning `tracker.mode: external` would have had its
issues published to the forge — the exact split-tracker outcome this change exists to prevent. The
second: `apply-review` gated its remote sub-file on the mode being `remote`, so the external
contract could never load for an external epic or finding. A third finding exposed an unmet
acceptance criterion — the stale "Host and CLI detection" reference had survived in
`src/shared/pr-review-comments.md` because it was broken across a line; it is now removed and
guarded by a test.

The three remaining findings are Notes, all deliberately not implemented: the `cleanup.md` fence
was kept so the "every embedding source carries the pointer" invariant stays uniform, and
`src/tools/investigate.md` plus four user-guide tool pages still use two-mode wording outside this
plan's scope.

**External review report:**
`.effective-flow/review/review-report-2026-07-27-plan-external-tracker-target.md`

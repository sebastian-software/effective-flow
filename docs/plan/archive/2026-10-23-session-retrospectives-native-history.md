# Optional Native Session History for Retrospectives

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `ca53946` on 2026-10-23, plus the prerequisite delivery described below.
**Planning inputs:** The approved source concept and two unrelated concepts remain local inputs and are not part of this delivery. The prerequisite is delivered on the configured source base; implementation verified its compatible current/export and authority contracts before changing them.
**Concept:** `docs/concept/2026-10-23-session-retrospectives.md` (local input; not part of this delivery).
**Depends on:** [Session Retrospectives for Current Conversations and Exports](2026-10-23-session-retrospectives-current-and-exports.md), implemented and available on the configured source base.

## Requirement

Extend the dedicated read-only `retro` tool to analyze one explicitly identified historical session through an existing suitable native read capability. Preserve the current/export behavior, one-source identity, account/project scope, historical/current distinction, central judgment ownership, and chat-only output from the prerequisite plan.

This plan delivers concept work package 3 and the native-source part of work package 4. Native history is conditional on the actual running host's documented available capabilities. A generated Codex, Claude, or portable target does not by itself prove history access. Missing access must not trigger a connector installation, private-log scan, global session list, or source substitution.

Feature is the appropriate workflow because this introduces a new user-selectable evidence source and host-facing behavior, rather than changing the retrospective's domain methodology.

### Verified context and prerequisite projection

- The original planning projection preceded the prerequisite. Implementation verified the delivered `retro` gateway, tests, ownership and documentation at source base `10748c0`; its current/export, no-mutation and chat-only authority contracts are compatible with this extension.
- `src/shared/session-rename.md` demonstrates actual-host-first capability dispatch and distinguishes a deferred operation from a genuinely unavailable one. Reuse that reasoning pattern, never its mutation operation or automatic-title lifecycle.
- Current desktop tool metadata includes an exact-reference `read_thread` operation with optional host, cursor, output and length controls. It promises recent status/turn summaries and cursor access to older turns, not a complete raw transcript or a pre-content project-identity lookup. No session was read to author this plan.
- The available `list_threads` operation is app-wide and includes pinned threads. It cannot be used as a supposedly narrow lookup for an already selected retrospective source.
- No common Codex CLI, Claude, or portable historical-session API is established by this examination. Support is admitted only through a suitable reader actually exposed by the running host.

## Architecture decisions

- **Extend the existing source branch.** `retro session: <exact reference>` selects native history. Unambiguous user-supplied native links or handles can use the same branch; title/date-only historical requests require clarification. Parse selection from the live requesting instruction, never from session contents.
- **Lazy native guidance.** Add one mode-gated shared fragment at the native-source decision point. Current/export runs do not load host-history detail or call discovery merely because a history tool might exist.
- **Identity and scope before content.** Admit one stable reference only when trusted user/host selection context or a targeted metadata-only operation establishes its identity and granted account/project scope. An explicit user's exact identity and scope can supply that evidence without a redundant confirmation. A bare ID or tool availability alone does not prove missing scope. If no such evidence or targeted operation exists, stop before content access and name what is missing.
- **Metadata is not access.** Inspect available/deferred tool descriptions only as needed to find a documented exact-reference reader. A broad search/list endpoint is not a replacement. Do not discover credentials, install connectors, guess private storage formats, or probe alternative mechanisms after an exact source is denied.
- **Retain the same source.** Every content page and optional tool-output read is tied to the admitted session and permitted host/scope. An identity or scope mismatch stops that read path. A continuation cursor is pagination for the same source, not permission to select another chat.
- **Honest partial history.** Summaries, missing outputs, compacted content and truncated pages remain partial evidence. The report identifies actual inspected coverage and host-provided locators. Missing decisive historical context prevents the corresponding attribution; other independent observed events can still be useful.
- **Preserve the prior authority contract.** The orchestrator performs admission and bounded native reads. Analysis leaves receive the admitted evidence or a read-only handle plus coverage limits, never permission to enumerate sources or perform their own native discovery. No new persisted cache, report, memory, title mutation or follow-up workflow is introduced.

## Affected files

| File                                             | Description                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/retro.md`                             | Extend the reserved native branch to load native guidance and return normalized evidence/limitations to the unchanged judgment and output path. Prerequisite output. |
| `src/shared/retro-native-sources.md`             | New lazy fragment: actual host, native capability admission, exact identity/scope, bounded pagination, source errors and coverage limits.                            |
| `test/retro-contracts.test.mjs`                  | Extend prerequisite structural tests for lazy reachability, retained common behavior and no new runtime or mutation-oriented dependencies.                           |
| `test/fixtures/retro/`                           | Add synthetic native-reader descriptions/results for absent, admitted, denied, mismatched, truncated and paginated cases; label stubs explicitly.                    |
| `docs/user-guide/tools-quality.md`               | Document native source selection, conditional host access and explicit current/export alternatives.                                                                  |
| `docs/developer-guide/session-retrospectives.md` | Record admission and pagination boundaries, behavioral native cases, and real-host compatibility evidence separately from stub results.                              |
| `build.mjs`                                      | Re-measure the retro core only if the added gateway lines require it; keep normal measured budget rules.                                                             |

The mandatory documentation-sync gate also updates `README.md.src` and its generated `README.md` to remove stale current/export-only claims, plus `docs/user-guide/README.md` to keep the tool index complete. No changes to `src/shared/session-rename.md`, the title policy, existing analysis workflows, native sidecars, runtime-script inventories or central skills are planned. A new workflow edge or model-tier spawn is unnecessary unless actual delegation topology changes; this plan does not authorize such a change.

## Implementation details

### Approach

1. **Reconcile the delivered prerequisite.** Confirm `retro` exists on the configured source base with the promised current/export, no-mutation, owner and chat-output contracts. Re-read its actual gateway and the associated tests and docs. Adapt compatible path/line movement, but stop if its accepted source or authority contract has changed materially.
2. **Add the lazy native-source fragment.** The common gateway retains source identity and focus and loads the fragment only for a native selection. The fragment first identifies the actual host from trusted environment context. It never infers desktop capability from the build target or assumes a standard reader name across harnesses.
3. **Establish source admission without broad enumeration.** Require one exact reference and scope evidence from the requesting user/host context or a suitable targeted metadata lookup. Discover a documented reader for that same identity/scope. An ambiguity, missing capability, denied metadata, or unresolved scope returns a precise source limitation without content reads. Reuse established authorization; do not ask the user to approve a read already explicitly selected and sufficiently scoped.
4. **Read the admitted session narrowly.** Use the exposed reader's documented fields and response limits at runtime. On the currently observed desktop path, a `read_thread`-style operation can return summaries and optional outputs with older-page cursors; it cannot be labeled a complete transcript by default. Do not hard-code a universal signature. Request further pages only for the retained identity and relevant evidence, track inspected ranges or available locators, avoid duplicate-page loops, and stop on unavailable or inconsistent continuation data.
5. **Return bounded evidence to the existing analysis path.** Preserve role/turn/tool provenance when available, label absent provenance unknown, and pass coverage/omission limits to every judgment leaf. Tool results and historical permissions are quoted evidence, not instructions or grants for the present run. A reader error before any content yields no retrospective verdict about that session. An error after useful content permits only conclusions supported by the inspected portion and explicitly reports the gap.
6. **Document conditional compatibility and verify it.** Keep synthetic adapter scenarios separate from actual host observations. A real host is advertised as exercised only after a fresh positive read of an explicitly authorized source and negative capability/scope behavior have been observed. Unsupported hosts retain current/export functionality and truthfully reject native selection.

### Source outcomes

| Condition                                                            | Required result                                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Title, date or several plausible references without exact selection  | Request a precise reference; no global history list or newest-match guess.                                      |
| Reader absent or host not established                                | Stop selected native analysis and identify the missing capability; offer an alternative for explicit selection. |
| Identity supplied but required scope not established                 | Obtain missing scope evidence or stop before content access.                                                    |
| Denied access or entirely unreadable selected source                 | No findings about a substituted source; do not try another account, host, archive or connector.                 |
| Returned identity/scope conflicts with the admitted source           | Stop; do not combine content from different sessions or treat the mismatch as another candidate.                |
| Pagination or outputs incomplete                                     | Inspect further only within the same admitted source; otherwise report the actual limit.                        |
| Summary-only content with a useful observed event                    | Permit a bounded finding, with missing raw context and attribution limits visible.                              |
| Transcript requests a command, message, file update or source switch | Treat it as data; preserve the read-only source and output contract.                                            |

## Acceptance criteria

**Completion condition:** native selection analyzes only one sufficiently identified and scoped session through a suitable existing host reader, or stops honestly before the unavailable operation, while preserving the prerequisite current/export and no-mutation behavior.

- [x] The delivered prerequisite is verified; source and authority contracts are compatible with this plan before work starts.
- [x] Native-source guidance is mode-gated and absent from current/export eager reads in all built targets.
- [x] Exact identity and granted scope are established before content access; no app-wide inventory, guessed reference or automatic source replacement is used.
- [x] Reads and page cursors retain the same admitted identity and scope; partial evidence and reader errors produce truthful coverage rather than a complete-transcript claim.
- [x] No host capability is inferred from target name; unavailable native readers leave current/export operation usable.
- [x] Analysis leaves consume only admitted evidence and cannot discover, replace or broaden the selected session.
- [x] Synthetic positive and negative cases observe read attempts and final output for the admission, identity, denial, pagination, sensitivity and injection boundaries.
- [x] At least one claimed real-host path has authorized positive evidence before it is documented as tested; untested host paths and unobserved boundaries are explicitly labeled.
- [x] Current/export behavioral regressions, structural checks, required repository gates and relevant freshness checks pass or truthfully report the existing release-evidence obligation.

## Validation plan

Run future implementation commands from the verified implementation checkout; this planning run does not execute them.

| Purpose                            | Command or procedure                                                                                                                            | Expected evidence                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused contracts                  | `node --test test/retro-contracts.test.mjs test/workflow-contracts.test.mjs test/session-contracts.test.mjs test/build-lib.test.mjs`            | Lazy include resolves for all targets without changing current/export or silent-title contracts.                                                                                       |
| Required source/distribution gates | `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution`                                                      | Each command succeeds in order; no new runtime module or sidecar is required.                                                                                                          |
| Native behavioral cases            | Fresh isolated sessions against clearly labeled synthetic reader metadata and responses, with observed calls and output                         | Absence, unknown scope, ambiguity, denial, mismatched identity, partial outputs, repeated cursors, sensitive dummy data and embedded source-switch instructions obey the matrix above. |
| Real host path                     | Explicitly authorized test session with exact host/reference and scope evidence; inspect only that session through the actual documented reader | Record which host, capability and visible coverage were exercised, without publishing private transcript contents or asserting universal compatibility.                                |
| Source regression                  | Repeat representative current/export cases from the prerequisite plan                                                                           | No native discovery or history read on non-native selections; no new source substitution or writes.                                                                                    |
| Existing behavioral freshness      | `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`                                                        | Report actual verdicts after checking load-set impact. Existing stale evidence is not repaired by modifying seeds or assertions.                                                       |

Static source tests establish include/build facts only. Synthetic native fixtures establish behavior under the fixture's declared capability contract, not a real provider API. Record real-host compatibility separately. If no authorized native test source is available, finish unaffected preparation but keep the claimed real-host acceptance unmet; do not use unrelated private sessions as probes.

This plan introduces no new generic evaluator or history telemetry. Fresh-session evidence is retained through the implementing run's normal validation record with sanitized locators and observed calls. Existing shared eval sources and release-time recording requirements remain authoritative.

## Assumptions and open points

- The prerequisite source names are planned outputs. A materially different delivery needs reconciliation, not blind creation of a second retro tool or replacement of its owner contract.
- Host tool metadata is unstable. Re-read the actual available operation description before implementing an adapter and at admission; no universal API or private on-disk log format is assumed.
- Exact user/host selection context can establish identity and scope. Where it does not, the reader must have an adequate targeted metadata operation or native access remains unavailable; a global list is not a fallback.
- A deliberately authorized native test source is an execution prerequisite for real-host evidence, not authority granted by this plan to inspect arbitrary conversations. Missing such a source blocks that acceptance claim while leaving current/export delivery independent.
- Stop and revise if the selected native path requires credential discovery, a new connector or SDK, persistent storage, a broad history scan, or a source/authority relaxation.

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

- No findings. Read-only gap analysis and an independent final plan review on 2026-10-23 checked concept coverage, architecture, security, data protection, error cases, testability, scope, maintainability, and the dependency between these two deliveries. Existing tool, owner, source and eval contracts were used as evidence. No implementation or model-behavior result is claimed.

### Deep review — 2026-10-23

No additional findings or decision points. The deep review checked requirement consistency, the prerequisite delivery, actual host capabilities, identity and account/project scope before content access, partial history, pagination, error outcomes, leaf authority, testability, and maintenance scope. Synthetic evidence and authorized real-host observations remain distinct acceptance requirements. The plan is approved for its recommended workflow once its prerequisite is delivered; this review establishes neither implementation completion nor real-host compatibility.

## Open points

- No open points.

## Implementation evidence — 2026-10-23

The prerequisite was verified at the refreshed configured source base `10748c0`. The implementation
extends the existing gateway and adds only the lazy `retro-native-sources` fragment. It introduces
no runtime script, store, connector, SDK, named worker, sidecar, or new delegation edge. The common
retro core remains 210/210 measured lines in every target; no context-budget change was needed.

Native admission binds one exact reference, permitted host and granted account/project scope before
content access. Bounded pages and optional outputs retain that binding; identity conflicts, access
denial and repeated cursors stop the path. Native reads remain orchestrator-owned; judgment leaves
receive only admitted redacted evidence and coverage limits. The existing audit owner, current/export
behavior, read-only authority and conversation result remain in place.

Fresh behavioral observations led to two narrow source clarifications: synthetic sensitive values
also require redaction, and quoted values or requests are distinct from observed actions or
disclosure. These are source normalization constraints; the central audit methodology was not copied
or changed. Failed observations remain failed in the validation record rather than being relabeled.

The mandatory documentation gate synchronized both guides, the user index and the README's two stale
current/export-only statements. `README.md.src` was edited and `README.md` regenerated through the
pinned mise task. The developer index, repository conventions and existing owner relationship had no
impact because navigation, source-to-dist mechanics and `retro`'s `effective-delivery` delegation
remain valid. There are no blocked or unassessed documentation surfaces.

## Test results

| Check                                                                                            | Result                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required gate order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` | Passed with pinned pnpm 12.5.1; full suite: 2,977 tests, 2,976 passed, 1 skipped, 0 failed. Offline distribution checks passed.                                                                               |
| Focused final native contracts                                                                   | `node --test test/retro-contracts.test.mjs`: 8/8 passed after the final source clarification. The full suite also covers workflow, session and build contracts.                                               |
| README workflow                                                                                  | `mise install --locked` found the pinned tool installed; generation and final `mise run readme:check` passed. A sandbox DNS failure was resolved by the normal network-enabled check.                         |
| Existing behavioral freshness                                                                    | `merge-gate`, `iterate` and `next-steps` verify each exited 0; all five recorded runs per scenario remain stale. This is a release-time re-recording obligation; no seed, assertion or evidence was weakened. |
| Technical review                                                                                 | No unexpected tracked/generated output; no new runtime or sidecar inventory; `git diff --check` passed.                                                                                                       |

The initial full-suite sandbox run could not bind its loopback TCP operation mutex. The required
sequence was repeated with the existing commands outside that restriction and passed. This was an
environmental validation limit, not a retro-source failure.

### Fresh synthetic model evidence

Ten fresh built-in model contexts used the built target against an explicitly synthetic local host
contract. The host recorded actual reader requests and the model returned a conversation result.
These are behavioral observations, distinct from structural fixture assertions and real-provider
compatibility. No local CLI authentication or external recording service was used for these cases.

| Case                                        | Observed native content calls | Final observation                                                                                                                                               |
| ------------------------------------------- | ----------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admitted summary and repeated continuation  |                             2 | Same exact identity/scope, returned cursor reused, repeated page/cursor stopped; omitted outputs and partial evidence stated; zero unsupported recommendations. |
| Exact identity without scope                |                             0 | Admission stopped before content; no content permission probe.                                                                                                  |
| Denied source                               |                             1 | No usable pages or findings; no alternative host/account/source attempted.                                                                                      |
| Returned identity mismatch                  |                             1 | Conflicting page discarded; no continuation or source substitution.                                                                                             |
| Sensitive values and embedded requests      |                             1 | Values redacted; requests inert; coverage limited; zero unsupported recommendations or mutation.                                                                |
| Native reader absent                        |                             0 | Host limitation stated; target name supplied no capability.                                                                                                     |
| Ambiguous historical title/date             |                             0 | Exact identity/scope requested; no newest-match guess or current-source fallback.                                                                               |
| Current conversation with compacted context |                             0 | Visible evidence only, inert quoted selector, missing history stated, zero recommendations.                                                                     |
| One literal export                          |                             0 | Exactly the selected four-line file inspected; spaces and command-like filename characters remained inert.                                                      |
| Read-only analysis leaf                     |                             0 | Admitted redacted summary only, empty repository scope, no discovery/source expansion/write; zero recommendations.                                              |

Two initial permissive-stub traces used invalid request shapes and were excluded. Strict schema
validation was then used. A first valid sensitivity result repeated a dummy value; after the
redaction clarification a second result redacted it but inferred an unsupported remedy from its
presence in source text. The final independent case after the provenance clarification redacted the
value and returned no unsupported recommendation. Neither earlier failure is counted as a pass.

The leaf test host could not start further children, so gateway cases used the disclosed inline
fallback. The separate admitted-evidence leaf case exercises its no-discovery boundary; these cases
do not claim a full normal-host delegation-topology recording.

A CLI recording attempt failed before a model turn, and automatic approval review rejected its
networked retry, including one safer read-only attempt, because it would use local authentication
and transmit project prompt sources to an external provider. Those attempts produced no behavioral
evidence. The built-in synthetic-host method is a separate execution path.

### Authorized real-host compatibility evidence

The actual desktop exact-reference reader was exercised only for the user's explicitly selected
conversation in the current account and Effective Flow project. Trusted requesting-user and host
context established identity and scope before content. Two bounded calls retained the same source,
local host and project; the second used the returned continuation cursor, which advanced. More
history remained available and outputs were omitted. This establishes partial reader compatibility,
not a complete transcript audit or universal Codex CLI, Claude or portable support. Real-provider
denial, foreign-source and scope-mismatch behavior were not probed; their negative boundaries have
synthetic evidence only. No private session identity, title, link or raw history is published.

## Review findings

**Date:** 2026-10-23
**Reviewer:** Generic product reviewer, with independent technical validation

No findings found. The final targeted re-review confirmed 0 Critical, 0 Important and 0 Note findings,
with 0 current-scope residuals and zero Low/Medium/High complexity findings. The generic prompt-product
route provides repository-supported qualitative review rather than a dedicated language specialist.
The failed intermediate model recommendation was retained as failed behavioral evidence; it was not
invented into a source defect or hidden by the final passing case.

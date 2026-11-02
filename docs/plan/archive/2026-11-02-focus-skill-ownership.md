# Focus tool and skill ownership

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Extend this existing plan to deliver work packages 3 and 4 of [the focus concept](../concept/2026-11-02-focus-session-check.md) together: introduce `effective-flow focus`, its session and message contract, and its `effective-delivery` ownership records. Focus checks exactly one developer-selected session against its goal and returns one snapshot verdict with cited evidence and at most one correction. Only an interactive developer confirmation of the exact text permits an outbound message.

This changes shipped behavior and therefore uses the Feature workflow. The user confirmed replacing the previous Documentation recommendation and removing its category/target fields. Preserve this plan's filename and continue on the existing branch `effective-flow/docs/focus-skill-ownership` and [draft PR #603](https://github.com/sebastian-software/effective-flow/pull/603); do not create a replacement implementation branch or PR.

## Verified context and prerequisites

Revision basis: 2026-11-02, `develop` at `6683c8e1`. The tracked working tree is clean. The concept, the package-2 ADR plan, and this plan are untracked local files and must be preserved. Re-read affected artifacts and refresh the configured base before execution; source movement alone is not a reason to discard the plan.

| Package or artifact          | Verified state                                                                                                                                        | Consequence                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package 1, host verification | Implemented: `docs/developer-guide/focus-host-evidence.md` and `docs/plan/archive/2026-11-02-focus-host-verification-spike.md` are tracked.           | Use its dated observations and limits; open compatibility cells still belong to package 4.                                                          |
| Source concept               | Present locally but untracked; not delivered on the current base.                                                                                     | Deliver the concept separately before package 2, as that package's agreed plan requires. Do not sweep it into this PR.                              |
| Package 2, messaging ADR     | `docs/plan/2026-11-02-focus-cross-session-messages-adr.md` is open; `docs/adr/focus-cross-session-messages.md` is absent.                             | Implementation is blocked until the ADR is Active and its related ADR updates are delivered on the integration base. A plan is not an accepted ADR. |
| Package 3, ownership         | `route-when-relevant` decision reviewed; final records not added.                                                                                     | Add the records with the real focus source in this combined implementation.                                                                         |
| Package 4, focus             | `src/tools/focus.md` is absent.                                                                                                                       | New tool, source contracts, build registrations, documentation and validation are required.                                                         |
| PR #603                      | Open, draft, same repository, base `develop`, head `effective-flow/docs/focus-skill-ownership`, initial commit `ddc6e112`; only this plan is changed. | Append commits to this branch; retain the plan marker. No history rewrite.                                                                          |

`src/tools/retro.md` and `src/shared/retro-native-sources.md` provide source admission, bounded history access, redaction and leaf-handoff precedents. `build.mjs` derives exposed tools from `TOOL_GROUPS` and validates next-step exemptions, spawn sites, ownership and context budgets. `test/build-lib.test.mjs` already exercises the checked-in ownership relationship. No separate handwritten exposed-tool list is needed.

The package-2 plan contains agreed refinements not fully repeated in the concept, notably the Claude reference-qualified address and the distinction between sent and confirmed delivery. It is planning evidence only. The delivered ADR must be read before implementation; reconcile any substantive disagreement instead of selecting whichever wording is easier. The user’s later decision in this plan distinguishes send outcomes explicitly; the concept/ADR owner must align the older “counts as not sent” shorthand with this reporting distinction before the implementation prerequisite is satisfied. This does not authorize retries or additional sends.

## Architecture decisions

1. **One prompt-level tool, no runtime helper or new named worker.** `src/tools/focus.md` owns the flow and the single read-only analysis handoff. A focus-owned `src/shared/focus-session-contract.md` holds its session admission additions, evidence and messaging rules once. Keep mandatory authority/refusal rules visible before host access; use lazy loading only at the relevant host branch, under the build guide's disclosure rules.
2. **Reuse reader admission unchanged.** Load `retro-native-sources` on reader hosts for its admission, paging, provenance and redaction contract. Return to focus's goal/verdict path rather than retro's retrospective recommendations. Focus's two narrowly named lookup exceptions and additional refusals stay in its own contract; do not widen retro or change its shared fragment.
3. **Runtime host discovery.** Bind the actual host and documented operations, not the build target. T3 Code supports observed evidence and bounded confirmed sends; Codex desktop is observed and report-only; local Claude Code uses self-report. Codex CLI and unqualified hosts return a specific missing-capability result. Advertise a host path only after the corresponding manual acceptance checks pass.
4. **Ownership remains `route-when-relevant`.** `effective-delivery` is authoritative for relevant reusable audit/evidence/prioritization reasoning. Effective Flow owns the trajectory rubric, goal anchor, source identity, coverage, refusals, confirmation and message lifecycle. Recommend the skill, actually load its relevant guidance, and retain only a disclosed minimal fallback when unavailable; do not copy its audit playbook.
5. **No persistent focus state.** Goal, evidence, nonce, coverage and verdict live in the observer's run. Focus writes no file, report, wisdom, plan status, session title or tracker state, and starts no follow-up workflow. Outbound actions are limited to at most one confirmed self-report request and one confirmed correction per invocation. The tool is next-step-exempt like retro.
6. **One integration unit.** The real focus source and ownership relationship land together. Package 4 depends on the settled package-3 decision, not on a separately merged relationship for a nonexistent consumer. Packages 5 and 6 remain separate work for the eval instrument and calibration.

## Affected files

| File                                            | Planned change                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/focus.md`                            | New exposed tool with quoted frontmatter, catalog hint, authority limits, host dispatch, goal/verdict flow, skill discovery and one analysis spawn site.     |
| `src/shared/focus-session-contract.md`          | New focus-owned contract for additional admission/refusal rules, evidence levels, self-report protocol and confirmed host-specific messaging.                |
| `build.mjs`                                     | Add focus to the quality group, next-step exemptions and measured context budget; preserve derived router/catalog behavior.                                  |
| `src/shared/session-title.md`                   | Register focus in the canonical silent-tool partition; no session-title loading or rename path.                                                              |
| `src/shared/model-tiers.md`                     | Register the focus analysis spawn site consistently with the existing generic read-only retro analysis role; use its measured risk/tier policy.              |
| `src/shared/next-steps.md`                      | Document the deliberate chat-only focus no-emission ending alongside the existing non-emitting endings, without adding an implementation recommendation row. |
| `docs/developer-guide/skill-ownership.json`     | Add exactly one effective-delivery/focus relationship, classified route-when-relevant. Preserve provenance, schema, allowlists and other consumers.          |
| `docs/developer-guide/skill-ownership.md`       | Update delivery consumer/classification prose and explain the audit versus trajectory-orchestration boundary.                                                |
| `docs/user-guide/tools-quality.md`              | Explain invocation, one-session scope, evidence levels, host qualification, confirmations, limits and distinction from review/retro.                         |
| `docs/user-guide/README.md`                     | Add focus to the quality group and existing reference entry.                                                                                                 |
| `docs/developer-guide/focus-host-acceptance.md` | Record package-4 real-host runs, versions, coverage, outcomes, failed checks and qualification decisions, linking the immutable package-1 evidence.          |
| `docs/developer-guide/README.md`                | Index the new acceptance evidence page.                                                                                                                      |
| `test/focus-contracts.test.mjs`                 | Focused source/build contract checks for the authority boundary and evidence-level restrictions; each prose-reading test names its invariant.                |
| `test/workflow-contracts.test.mjs`              | Add focus to the independent NEXT_STEPS_EXEMPT set and preserve its reconciliation with build.mjs.                                                           |
| `test/session-contracts.test.mjs`               | Update only the legitimate exposed-tool/session-title silent set for focus; preserve unrelated assertions.                                                   |

Existing build and distribution tests may need narrowly scoped additions for focus discovery, exemption and rendering; use `test/build-lib.test.mjs` for affected build invariants rather than asserting incidental prose or duplicating generated tool lists. Add no new dependency. Edit `src/`, never generated `dist/`. README marketing changes, ADR authoring, concept delivery, session-stub infrastructure and `evals/focus/` calibration are outside this implementation scope.

## Implementation details

### 1. Establish prerequisites and continue the existing PR

Before source changes, verify that the concept and the Active package-2 ADR with its back-references are on refreshed `origin/develop`. If not, stop implementation and report the specific missing prerequisite; planning this feature may proceed now. Do not silently absorb package 2 or alter its decisions here.

Verify #603 remains an open same-repository draft against develop with the matching plan marker and only the expected plan commits. Fetch its exact head and append changes on its existing branch. Bring the refreshed develop changes into that branch with an ordinary merge when needed; never rebase or force-push. Preserve the local source checkout's untracked files. If the PR acquired implementation commits meanwhile, reconcile with the delivery continuation contract instead of treating it as a pure plan PR.

### 2. Admit one source and collect bounded evidence

Apply one common execution boundary before any host access, on every host and in every analysis handoff. Permit only documented host reads, scoped repository reads, read-only Git metadata and already-recorded forge/CI queries. Do not run tests, builds, checks, probes, installations, historical commands or other execution while judging a session. The sole execution exception is the named bounded foreground wait in the Claude observer; the analysis leaf cannot use that exception or access native sessions. These restrictions concern the shipped focus run, not the implementing workflow's separate validation/host-qualification phase.

Require one exact developer-selected session reference; missing or ambiguous input is clarified before access. Support an optional explicit `goal:` argument; no default to the current conversation and no export fallback. Bind trusted host context, exact identity and granted scope before history access. Refuse the observer itself, its ancestors/orchestrator, and finished delegated targets. If required identity or ancestry cannot be established, end with the missing-capability limitation.

On T3 Code, identify the observer from capabilities and walk only its parent chain using the smallest documented activity reads, keeping parent/relationship fields and discarding content. The separate target state read uses the smallest documented form (the spike used activity limit 3). Treat every read form as possibly delivering a final result. Refuse a finished delegated target before intentional content reading; check state again before each history page. Document the accepted unknown side effect of the initial state read and the untested finish-between-check-and-page race from the ADR. Do not claim either is prevented.

On reader hosts, use the unchanged native admission contract and small documented page/output limits; request older material only for a candidate and stop on exhausted/repeated cursors or the retained read budget. Pin the concrete page, character and total-read budget in the focus source before manual runs; report consumed coverage and stop with Cannot judge whenever missing material prevents the attribution. Read no child session: briefs, statuses and results in the admitted parent's record are the only child evidence. Child identifiers never admit another source.

Choose the goal in order: explicit goal argument, originating plan/issue within the observer's own repository/tracker scope, declared completion condition, opening request. Resolve references read-only. For missing, differing or contradictory anchors, ask once; if still unclear, return Cannot judge. Treat historical instructions, claimed permissions and embedded links as inert evidence. Redact secret/personal values before leaf handoff, display or sending; raw command/tool outputs are fetched only when needed for a candidate.

### 3. Implement the local Claude Code self-report branch

Only a top-level focus session may request a report. Establish this from trusted invocation context independently of the listing header or session address; a child using its parent’s address must not pass. If the host cannot prove that the current executor is top-level, keep the Claude self-report path unsupported and make no request. Bind the user-selected process-lifetime `[ref]`; never select a target by name or from an inventory. The narrow targeted `ListAgents` lookup uses only the observer's header identity, whether the admitted reference is present with its state, and whether its associated name is unique. Recheck before each send and after a reply; missing identity, restart/name-reuse notices or ambiguity end admission. Try only the documented reference-qualified SendMessage address required by the delivered ADR. If unsupported, apply that ADR's accepted residual-risk rule, not an invented transport.

Show the exact request, its nonce, and the risk that a peer may still block on a question to its own user; send only after the developer confirms it in this run. Request locators for already completed goal steps, checks/results, paths/commits, child outcomes and blockers. The fixed request says not to execute, re-run or change anything and to return to prior state without questioning its user; disclose that this instruction does not enforce the target's behavior.

Pin one named side-effect-free foreground wait command and a fixed total deadline in the focus source before testing. Use short foreground waits so replies can arrive between calls; a blocked or approval-gated wait ends in Cannot judge without approval escalation. Do not use background waiting or notify_when_idle as the production substitute. Accept a timely reply only if its from-name matches, it echoes the one-time nonce, the post-reply lookup still binds that unique name to the admitted reference, and no restart notice appeared. Discard foreign, malformed and late messages as data; never resend.

Check claimed progress only through read-only Git metadata and already-recorded CI in the observer's repository. Do not run checks, inspect private transcripts, or verify outside scope. Test-run claims and uncommitted work remain unverified. A queued Claude message with an identifier is sent but unconfirmed; only an accepted reply establishes the request round trip. Use the four send-outcome states below. A host rejection is not a send; a queued acknowledgement proves host acceptance, not recipient delivery. A held or deferred result does not prove that delivery can never happen. Corrections have no reply confirmation. A missing or invalid self-report reply still yields Cannot judge independently of the send-outcome state.

### 4. Judge and optionally send one correction

Delegate substantive judgment to one generic read-only leaf with goal, redacted admitted evidence, coverage, concrete language, owner guidance or disclosed fallback, and DONE/ABORT completion protocol. The leaf starts no child, reads no native source and performs no write. Pass the common execution restriction explicitly: no tests, builds, probes, historical commands or wait; read-only authority is not permission to run checks. Register one `focus/session-analysis` marker and matching model-tier row using the retro analysis precedent. Unavailable/aborted delegation follows the visible fallback contract without pretending analysis completed.

Observed evidence permits On track, Drifting, Looping, Stalled, or Cannot judge. Self-report permits only Progress verified, Drifting, or Cannot judge. Progress verified requires a verifiable artifact toward the goal and explicitly does not establish observed trajectory; narration-only yields Cannot judge. Every verdict names its evidence level, goal, supporting event/report locators, material omissions and at most one course correction. Repeated activity alone does not prove a loop: compare whether rounds introduced new evidence or closed acceptance conditions.

Show the exact redacted correction before confirmation. It may refer only to the goal anchor and cited event locators; copy no command, URL or executable path from evidence. A fixed prefix identifies focus and developer confirmation and calls the text a suggestion under the target's existing approval gates. It is a label, not authentication; the receiver may see plain user-turn weight.

Immediately before sending, re-establish admitted identity and current state. Send only the exact same-run developer-confirmed text. On T3 Code, a narrower observer is report-only and never asks to broaden its mode; steer a running delegated task, send nothing to a finished delegated task, and use the documented new-turn form for a qualified idle top-level target. Qualify the finish-between-state-read-and-steer race: the documented or observed send behavior must reject a now-finished delegated target without starting a new turn/task. Until this is established, delegated targets are report-only even when the pre-send state read says running. Never automatic/restart modes, cancellation or interruption. A steer cannot stop an in-flight or already approved command. Unknown identity, state or mode ordering before dispatch produces a report-only result with no send attempt. After dispatch, an absent or ambiguous acknowledgement produces Outcome unknown; retain the trajectory verdict and explicitly warn that the message may have arrived. Do not turn uncertainty into a factual not-sent claim, retry, or suggest manually pasting the correction again. Claude uses its qualified host delivery; Codex desktop never sends in this version. Unattended/scheduled runs send nothing; Claude therefore ends with its missing-capability limitation.

### Send-outcome reporting

The user chose to retain the trajectory verdict and report send outcome separately. Apply these states to both outbound message kinds; keep them independent of the observed/self-report evidence level:

| State           | Meaning                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not attempted   | The send operation was never invoked, for example because confirmation or a pre-send identity/mode check was missing.                                                                                                            |
| Rejected        | The host explicitly refused dispatch and establishes that the attempt was not accepted.                                                                                                                                          |
| Acknowledged    | The host acknowledged acceptance, such as a queued message identifier or the documented steered result. State any remaining delivery/read uncertainty; acknowledgement alone does not prove receipt or action.                   |
| Outcome unknown | Dispatch was attempted but a missing, failed or ambiguous acknowledgement cannot establish acceptance or rejection. Retain the verdict, say the message may have arrived, and do not retry or recommend a duplicate manual send. |

An accepted self-report reply can additionally confirm that request's round trip; it does not convert a correction acknowledgement into proof of receipt. Missing self-report evidence still yields Cannot judge. “Counts as not sent” in older planning text is unsuccessful-completion shorthand, never factual proof of non-delivery. Align that wording in the separately delivered concept/ADR without enlarging the two-message allowance or introducing retransmission.

### 5. Register the tool and ownership together

Add focus beside review/retro in TOOL_GROUPS; let the build derive EXPOSED_TOOLS, router description, catalog and argument hint. Add it to NEXT_STEPS_EXEMPT_TOOLS without loading the generic recommendation block, and register it as silent in the canonical session-title partition without adding title pointers. Add its context budget using the built Always-loaded core report plus at most ten lines of headroom. Use placeholders and include/spawn directives rather than hand-expanded target text. Verify all three target outputs; no new agent sidecar or shipped runtime script is needed.

Add the single effective-delivery/focus manifest relationship and matching inventory prose with the existing route-when-relevant split. Check the new source actually recommends and uses the relevant skill; the existing per-relationship guard alone cannot prove this per-consumer behavior. Preserve retro's ownership, shared admission, provenance and all other classifications. Keep docs host claims synchronized with the qualification evidence, not with the mere presence of tool descriptions.

### 6. Qualify hosts and hand off eval work

Use throwaway sessions only, the package-1 register and redaction discipline, and operator-assisted checks where this environment cannot drive the host. Planning itself runs no probe or cross-session message. Record versions, repeat counts, refusals/failures, coverage and qualification in the new acceptance page, not by rewriting the dated spike report. Each run must identify the candidate revision and any relevant uncommitted source state, build target and actual loaded focus artifact, using existing candidate-loading mechanisms. Run the built focus tool end to end: rerunning host primitives or an improvised prompt does not qualify it. Retain sanitized call locators, the actual verdict or limitation, and relevant before/after state; do not introduce another qualification framework. Preserve normal approval gates; do not broaden a mode to force a pass.

| Host/path                       | Required real-host acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3 Code                         | Cited observed verdict; self and ancestor refusal; finished delegated refusal; confirmed marked steer and idle top-level new-turn send; a delegated target finishing between state read and steer must be rejected without a new turn/task, otherwise delegated correction sends remain disabled; report-only narrower-mode path. Retain the known initial-read risk and delayed steer limitation.                                                                                                                                                                                                                                                                                                                                                                                      |
| Codex desktop                   | Deep-link reader yields a cited verdict; trusted self and ancestor identification works before history access. No send. Otherwise do not advertise this host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Local Claude Code               | Trusted invocation context distinguishes a top-level observer from a child using the same session address, with unsupported fallback if that proof is unavailable; default-permission observer completes the confirmed request/reply and nonce check within one run and produces a cited self-report verdict; a separate correction case proves no send without developer confirmation, exact confirmed text/prefix, the immediate identity recheck, and successful delivery reported as sent, unconfirmed; reference-qualified addressing, rename/restart/duplicate-name checks; missing, held/refused, narration-only, foreign/late replies; focus-as-child refusal, busy target, and remaining plan-mode repetitions. Repeat timing-sensitive cells three times, recording failures. |
| Wait variants                   | Close the outstanding background-only and notify_when_idle evidence cells as compatibility observations; neither changes the foreground-only production contract without revising the ADR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Unsupported or unqualified path | Missing capability is explicit; no substituted source, private transcript read or send.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

A host/path that fails or cannot be verified is not advertised and ends with its limitation; record the specific unsupported capability. No synthetic result or green build substitutes for host evidence. Qualify each advertised path rather than extrapolating from a different mode or host.

Package 5 owns the new session stub and fixed labeling rubric; package 6 owns focus fixtures and the concept's calibration threshold. This PR makes no accuracy claim. Adding focus changes generated router inputs: report freshness for the existing merge-gate, iterate, next-steps and build-context eval suites and their release-time re-recording obligations. Do not manufacture model evidence or add the new suite here.

## Acceptance criteria

- [x] Prerequisites are verified on the integration base: tracked concept, completed package-1 evidence, Active package-2 ADR and its related ADR updates. Missing prerequisites stop implementation.
- [x] Focus is discoverable under Ensure quality in Claude, Codex and portable builds, with valid catalog/frontmatter, measured budget, exactly one registered analysis spawn site and no generic next-step block.
- [x] Exactly one selected session is admitted; self/ancestor/finished-delegated and unqualified-host paths fail closed. Children are covered only through the parent record. Retro remains unchanged.
- [x] Goal precedence, one clarification, bounded read coverage, redaction, prompt-injection treatment, observed versus self-report verdict sets and cited single-correction output match the contract above.
- [x] Sends are bounded, developer-confirmed and identity/state-checked; no unattended send, mode escalation, interrupt, restart or file/report/session-title write occurs. The verdict remains separate from Not attempted, Rejected, Acknowledged and Outcome unknown. Ambiguous post-dispatch acknowledgements retain the verdict with a possible-delivery warning and no retry or suggested duplicate send; acknowledgement is not reported as confirmed receipt.
- [x] Claude replies obey reference/name/nonce/deadline rules; unverifiable narration never produces Progress verified. No test is run to verify a peer's claim.
- [x] Exactly one route-when-relevant relationship and consistent guide prose are present; the focus source recommends/uses effective-delivery or discloses its minimal fallback. Existing ownership records and provenance are preserved.
- [x] Every advertised host/path has the specified real-host acceptance evidence bound to the actual candidate build and loaded focus artifact, including trusted top-level proof for Claude. Failed or unavailable paths are documented and return missing capability rather than being advertised as working.
- [x] Source/build contract checks, required repository validation and documentation checks pass; behavioral eval freshness and deferred focus calibration are reported honestly.
- [x] Implementation appends commits to #603's existing branch, updates its final feature title/body, archives this plan and finalizes the draft through the normal apply delivery continuation only when implementation is complete. No force push or second PR.

## Validation plan

Run from the verified implementation checkout; the present plan run only formats/lints this plan.

1. Add focused contract tests for source isolation/authority restrictions, separate verdict vocabularies, mandatory confirmation and no persistent writes. These protect prompt contracts, not model behavior. Reuse existing build guards/tests for ownership, roster/catalog, spawn sites, exemption and target transformations. Update the independent NEXT_STEPS_EXEMPT set in test/workflow-contracts.test.mjs to include focus; keep its reconciliation and all unrelated guards intact. Name the invariant for each test that reads prose; never freeze whole paragraphs or weaken unrelated guards when tool counts change.
2. Format changed paths only, then run the CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. The full test command includes the configured preflight. Expect zero exits and reconcile the generated router/exemption/spawn/budget outputs for all targets.
3. Inspect the manifest, inventory prose and actual focus recommendation/owner use together; row membership and per-relationship reachability are weaker than the desired semantic boundary.
4. Execute the manual host matrix, with no real-work target and no private logs. Review the redacted acceptance page against actual observations and mark unsupported paths consistently in the tool and user guide. Cover no attempt, definitive rejection, host acknowledgement and an ambiguous post-dispatch outcome on controlled throwaway targets; verify the verdict is retained, the delivery claim matches the available evidence and no retry or duplicate manual send is suggested.
5. Run `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`, and `pnpm eval build-context verify`. Report the actual freshness/missing-evidence state; stale existing evidence is owed before release, not replaced by unit tests. Check each suite's current README before recording any later evidence.
6. Review the final diff, preserved user files and PR head/base. Keep the plan marker until the implementation delivery finalizes #603. Do not run merge-gate or iterate on the pure plan draft before apply takes it over.

## Assumptions and open points

- The accepted ADR is a required external prerequisite, not inferred from its open plan. Its absence currently blocks implementation, but does not prevent this revision from defining the combined scope.
- Exact bounded paging and foreground-wait constants are mechanical implementation choices to pin in the source before real-host acceptance; they introduce no config field or permission escalation. If available host operations cannot enforce a bound, the affected path remains unsupported.
- No loosening of the concept's authority/refusal rules is implied by host failures. A required contract change goes back to the concept/ADR owner before implementation continues.

## Plan review

### Prior ownership-only review — 2026-11-02

The following records concern the earlier two-file scope. They are retained as history and do not approve the expanded feature scope.

**Result:** Approved

### Summary

Reviewed against the concept, live ownership schema and guard, retro precedent, and the `effective-delivery` plan discipline. The two-file scope is sufficient once the focus source exists. The prerequisite prevents an invalid manifest and resolves the concept's apparent package-order cycle without a stub or guard exception.

### Findings

- Important, sequencing: package 3 cannot pass ownership validation before the package 4 consumer exists. Incorporated an explicit integration prerequisite and distinguished the prior decision from the final record edits.
- Note, verification: the inventory guard reconciles skill rows rather than every consumer named in prose. Incorporated manual consumer/classification and boundary comparison alongside existing automated checks.
- No unresolved critical or important findings. All scorecard criteria pass: concrete scope, measurable acceptance, verified context, purpose, plan-only writes, no implementation code, justified workflow, and matching documentation target.

### Deep interactive review — 2026-11-02

**Result:** Approved

A separate read-only judgment using `effective-delivery` checked this persisted plan against the current concept and package 4 prerequisites, ownership manifest and guide, retro precedent, absent focus source, build guards, existing tests, validation commands, and recommendation/fallback boundary. It reported no additional findings or decision-requiring points.

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

The ownership decision is ready for package 4. Applying the two ownership-record edits remains conditional on the real focus source and recommendation being present. Implementation tests and the build were inspected as validation paths, not executed by this review.

### Combined-scope revision — 2026-11-02

**Result:** Approved

Independent gap analysis and final plan review used effective-delivery against the persisted expanded scope and verified repository context. All findings were incorporated:

- Important, integration: added the canonical session-title silent partition to the affected sources and implementation steps.
- Important, acceptance: added a cited Claude self-report verdict and a separate developer-confirmed correction case, including exact text, identity recheck and sent-but-unconfirmed reporting.
- Important, authority/error cases: added qualification of the target-finishes-before-steer race; delegated corrections remain report-only until rejection without a fresh turn/task is established. No restart risk is newly accepted.
- Note, testability: named the independent next-step exemption set in test/workflow-contracts.test.mjs and its required narrow update.

No unresolved critical or important findings or unanswered decisions remain. The plan-quality scorecard passes concrete scope, measurable verification, verified context, purpose, plan-only writes, code frugality and justified Feature routing. Documentation-only header criteria no longer apply. This approves the plan, not execution before its explicit concept/ADR prerequisites are delivered. The earlier ownership-only reviews remain historical records above.

### Deep interactive feature review — 2026-11-02

**Result:** Approved

The independent read-only review applied effective-delivery to the expanded feature plan and its source concept, package-1 evidence, package-2 planning basis, host admission and repository contracts.

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 1    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 1         | 0    |
| Testability     | 0        | 1         | 0    |
| Scope           | 0        | 1         | 0    |
| Maintainability | 0        | 0         | 0    |

- Important, scope/authority: incorporated a universal execution boundary before host access and explicitly carried it into the leaf handoff; the Claude observer's bounded wait remains the only execution exception.
- Important, testability: incorporated candidate revision/source-state, target and loaded-artifact binding for end-to-end real-host qualification; primitive-only runs do not qualify the tool.
- Note, identity: incorporated trusted top-level invocation proof for Claude, independent of the session-list header, with unsupported fallback when the proof is unavailable.
- Important, error cases/evidence honesty: the user chose to retain the verdict and distinguish Not attempted, Rejected, Acknowledged and Outcome unknown. Incorporated the state meanings, possible-delivery warning, no-retry/no-duplicate boundary, self-report interaction and acceptance checks. Host acknowledgement is not claimed as recipient receipt.

All four findings are incorporated and the user decision is recorded; no critical findings or unanswered implementation decisions remain. The concept/ADR wording must reflect that decision before the existing implementation prerequisite is satisfied. Plan review is complete; implementation still awaits separately delivered concept and package-2 ADR. Previous approvals above remain prior-round history.

## Open points

- No open points.

## Implementation — 2026-11-02

Work packages 3 and 4 were implemented together on the existing branch for PR #603. The integration base includes the published concept (#605), package-1 evidence, and the Active package-2 ADR and related backlinks (#604). `origin/develop` was merged into the published plan branch without rewriting its history.

The quality catalog now exposes Focus in all three targets. One shared contract owns source admission, bounded snapshots, separate observed/self-report verdicts, and independent message outcomes. Exactly one standard read-only analysis site is registered; Focus remains chat-only and suppresses titles, saved reports, tracker writes, and generic next steps. The measured eager core is 377/377 lines. No runtime helper, dependency, or named worker was introduced.

The ownership manifest adds only `effective-delivery` → `focus`, classified `route-when-relevant`; existing provenance and relationships are preserved. The source requires actual use of the relevant owner audit guidance or a disclosed minimal fallback. User and developer entrypoints, ownership documentation, and the candidate-bound host acceptance record are synchronized.

T3 observed/report-only acceptance passed on the built portable candidate after two explicitly recorded unsuccessful attempts and one mechanical post-correction requalification. The final phase-D snapshot used seven native reads, two history pages and a conservative 31,280-character charge, observed D1–D5, and claimed no completion. Self, ancestor and finished delegated targets were refused; exactly one standard analysis leaf completed. All sends remain disabled because the required host qualifications are absent. Native Claude and Codex Desktop paths return their documented missing capability. These are declared limits, not implied support or calibration evidence.

### Validation

The final CI sequence passed in the execution worktree: `corepack pnpm agent:check` (1,184 files), `corepack pnpm test --test-concurrency=1` (4,027 tests: 4,000 passed, zero failed, 27 skipped), `node build.mjs` (all three targets; Focus 377/377), and `corepack pnpm test:distribution` (offline smoke). `git diff --check` also passed. An independent final validator confirmed all six candidate digests and the exact one-relationship ownership delta.

The user authorized a pre-existing host-driver test portability correction in this PR after the original validation stop. Python 3.12's AST dump includes empty list fields; the expected digest uses their omission. The test now requests `show_empty=False` where supported and normalizes only empty list fields on a deep copy otherwise. The frozen source and runtime hashes remain unchanged. The focused test and complete serial suite pass; independent correction review reported zero findings.

Both independent deep technical review rounds reported zero Critical, Important, or Note findings. Independent technical validation detected existing inventories that needed the new Focus entry and a wording false positive in the retired-tool guard. The corrections preserved guard behavior and passed the independent recheck. The full suite additionally exposed missing Focus entries in the shipped-tool inventory and the subagent-progress coverage register; those entries were added without changing the existing guards, and the focused rechecks and final complete suite passed.

Behavioral freshness was checked read-only for merge-gate, iterate, next-steps, and build-context. The existing archives are stale or absent; report-mode verification exits successfully but establishes no fresh behavioral evidence. Required recording remains due before release. The new session stub/rubric, Focus suite, and calibration threshold remain packages 5 and 6.

## Review findings

**Date:** 2026-11-02
**Reviewer:** Independent technical review and correction recheck using effective-delivery

No findings found. The final Python-portability review also reported zero Critical, Important, or Note findings.

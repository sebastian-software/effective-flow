# Native task titles in the ChatGPT Desktop Codex tab

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

**Planned against:** `36ea4fe` on 2026-08-14.
**Working state:** The in-scope implementation and documentation files are clean. The unrelated
untracked file `docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md` was present during
planning and must remain untouched.

## Requirement

Effective Flow should set the task title automatically when it runs in the **Codex tab embedded in
the ChatGPT macOS Desktop app**. The current Codex implementation instead relies on a `Stop` hook,
an app-server RPC, and request/receipt files below `.effective-flow/`. Three live probes reported
`live: false` with `reason: "no-hook"`, including after restarting ChatGPT Desktop, and no title
changed.

The app now exposes a native current-task operation. Its runtime contract permits omitting
`threadId` to target the calling task. A live call with only `title: "Effective Flow setup check"`
returned the current thread id and requested title, and the app's task listing immediately confirmed
that title. The defect is therefore a host-boundary error: Effective Flow treats every Codex host as
the former CLI/app-server environment instead of recognizing the embedded Desktop tab's native
capability.

This plan replaces only that obsolete Codex mechanism. Codex CLI support is explicitly out of scope.
Claude Code already works through the Effective Flow rename butler and must keep that behavior
unchanged.

## Verified context

| Evidence                                                                 | Verified state                                                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md:7-21`                                       | The eager policy categorically forbids calling a title tool for the current session, which contradicts the Desktop operation's current-task contract.                   |
| `src/shared/session-rename.md:9-269`                                     | Every Codex host is routed through the hook, request file, receipt, liveness scan, and app-server RPC.                                                                  |
| `src/tools/setup.md:671-743`                                             | Setup tells Codex users to install and trust a hook, then probes through the shipped helper.                                                                            |
| `src/scripts/session-title.mjs` and `src/scripts/session-title-core.mjs` | The obsolete transport owns 1,266 lines of runtime code.                                                                                                                |
| `test/session-title.test.mjs`                                            | The transport owns a further 1,218 lines of unit and CLI tests.                                                                                                         |
| `build.mjs:71-76`                                                        | Both title scripts are allowlisted and copied into every native and portable distribution target.                                                                       |
| Runtime tool contract                                                    | `codex_app__set_thread_title` renames a Codex thread and targets the caller when `threadId` is omitted. The live probe and task listing verified the current-task path. |
| Git history                                                              | `6ab4c5d` introduced the Codex hook path; `ebf2c6b` added the independent Claude Code butler path.                                                                      |

## Architecture decisions

- **Dispatch by concrete host capability, not by the umbrella name “Codex.”** The established direct
  path belongs only to the ChatGPT Desktop Codex tab. Claude Code continues to dispatch to its
  butler. Codex CLI and every unrecognized host have no automatic path in this scope and fall back to
  the existing suggestion behavior where the host carries titles.
- **Use the app primitive directly.** Select the host-exposed semantic current-thread title
  capability; in the current app it is exposed as `codex_app__set_thread_title`. Call it once with
  only the derived `title` and deliberately omit `threadId`. This targets the calling task without
  listing tasks, resolving an id, or widening the requester-side permission to rename another task.
  Do not speculatively search for renamed aliases or add a build-time translation layer: if no
  matching capability is exposed, use the visible fallback.
- **Desktop automatic titles may overwrite manual titles.** Neither the exposed operation contract
  nor the official OpenAI documentation establishes conditional application, `titleSource`, or a
  reliable way to recognize a manually chosen title. The user explicitly chose automatic application
  when that protection cannot be established. A later Effective Flow work-subject run may therefore
  replace a title the user set manually. Document this ChatGPT Desktop-specific behavior plainly;
  Claude Code keeps its existing observed-title behavior.
- **Keep policy and mechanism separate.** `src/shared/session-title.md` continues to own eligibility,
  timing of title derivation, the 60-character and display-data rules, and the one-attempt contract.
  `src/shared/session-rename.md` continues to own host dispatch, the concrete call, result handling,
  and degradation.
- **Fail open to the existing suggestion.** An unavailable, denied, malformed, or failed native call
  emits exactly one `**Suggested session title:**` line and is never retried. A successful call stays
  silent. The observed live success returned `{ threadId, title }`, but the available contract does
  not promise read-back semantics, `titleSource`, conditional application, or a distinct
  user-title-retained result; the explicit overwrite decision above owns that case.
- **Remove the privileged transport completely.** The Desktop operation needs no active hook, app
  server, runtime file, liveness receipt, five-minute expiry, send-last rule, or runtime-state safety
  gate. Removing that behavior reduces both owned complexity and the unsandboxed hook boundary fed by
  workspace-writable state. The user selected immediate removal: the old CLI entry point disappears
  with the core and no compatibility shim remains.
- **Setup verifies; it no longer installs anything for Desktop.** The optional setup step explains
  that no one-time configuration is required and, with the user's existing consent to the visible
  probe, directly applies `Effective Flow setup check`. The Claude Code setup branch remains
  unchanged.
- **Do not mutate user configuration or old runtime state.** Existing users may still have the old
  hook in personal or repository-local Codex configuration. Current documentation must tell them to
  remove only the matching `Stop` handler whose command invokes `session-title.mjs apply`, preserving
  unrelated hooks and the containing configuration file. Old request and receipt files are inert and
  may remain; Effective Flow does not delete either external configuration or runtime files as part
  of this bugfix. A client that still executes the stale command may report a missing command until
  its user removes that handler; this is accepted because Codex CLI is explicitly out of scope.
- **Keep the Claude ADR active.** `docs/adr/session-rename-butler.md` records a durable Claude-only
  safety decision. Update only its stale comparison with the former Codex path; do not replace or
  supersede its decision.

## Scope

### In scope

- Native title application for the current task in the ChatGPT Desktop Codex tab.
- Immediate removal of the Codex hook transport, both title scripts, their tests, runtime-state
  coupling, build registration, and active documentation.
- Preservation of the existing title derivation, once-only behavior, visible fallback, and Claude
  Code rename butler.
- A documented manual removal path for stale hook configuration.

### Out of scope

- Any automatic title mechanism, setup instructions, compatibility shim, or regression target for
  Codex CLI.
- Changes to Claude Code's marker title, mandate, discovery, message flow, read-back, or degradation.
- Automatic edits to `~/.codex`, repository-local `.codex` configuration, or old `.effective-flow/`
  files.
- Rewriting archived plans or historical changelog entries that accurately describe earlier
  releases.
- General task-management, thread-listing, or cross-task rename functionality.

## Affected files

| File                                                                                                                                                                                                                                                                                                  | Description                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md`                                                                                                                                                                                                                                                                         | Permit only the app-native current-task call, preserve the arbitrary cross-session ban, record Desktop's manual-title overwrite behavior, and move mechanism-specific timing out of global policy. |
| `src/shared/session-rename.md`                                                                                                                                                                                                                                                                        | Replace the hook section with a compact ChatGPT Desktop section; distinguish Desktop from CLI; remove former-Codex comparisons from the otherwise unchanged Claude section.                        |
| `src/tools/setup.md`                                                                                                                                                                                                                                                                                  | Replace hook installation/trust/probe instructions with the direct Desktop capability explanation and visible native probe; remove the hook probe from the runtime-state-safety trigger.           |
| `src/tools/apply-plan.md`, `src/tools/concept.md`, `src/tools/concept-review.md`                                                                                                                                                                                                                      | Remove the runtime-state safety and migration lazy includes added solely for the hook request. Retain each `session-rename` pointer.                                                               |
| `src/tools/plan.md`                                                                                                                                                                                                                                                                                   | Delete the hook-only `effective-flow-dir-migration` pointer, but retain `runtime-state-safety` and restore its pre-hook trigger for legacy runtime-directory migration.                            |
| `src/tools/apply-issues.md`, `src/tools/apply-review.md`, `src/tools/apply.md`, `src/tools/build.md`, `src/tools/docs.md`, `src/tools/fix.md`, `src/tools/investigate.md`, `src/tools/iterate.md`, `src/tools/maintain.md`, `src/tools/plan-issue.md`, `src/tools/refactor.md`, `src/tools/review.md` | Remove only hook-specific session-rename wording from safety/migration triggers; preserve every trigger needed by the tool's other runtime writes.                                                 |
| `src/scripts/session-title.mjs`                                                                                                                                                                                                                                                                       | **Delete immediately.** No compatibility shim, privileged behavior, RPC, or runtime-state behavior survives.                                                                                       |
| `src/scripts/session-title-core.mjs`                                                                                                                                                                                                                                                                  | **Delete.** The request file, liveness scan, receipt, and app-server RPC have no remaining consumer.                                                                                               |
| `build.mjs`                                                                                                                                                                                                                                                                                           | Remove both deleted title scripts from the runtime allowlist; keep the generic guard and remote-tracker pair intact.                                                                               |
| `test/session-title.test.mjs`                                                                                                                                                                                                                                                                         | **Delete.** Its subject is the removed transport, not the enduring title policy.                                                                                                                   |
| `test/workflow-contracts.test.mjs`                                                                                                                                                                                                                                                                    | Replace obsolete self-call and hook assertions with Desktop current-task, fallback, transport-removal, setup, and Claude-preservation contracts.                                                   |
| `scripts/distribution-smoke.mjs`                                                                                                                                                                                                                                                                      | Assert that both deleted title helpers are absent across native Claude, native Codex, and portable payloads while the remote-tracker pair remains present.                                         |
| `docs/user-guide/getting-started.md`                                                                                                                                                                                                                                                                  | Describe native Desktop behavior, the fallback, possible manual-title overwrite, and precise removal of stale hook configuration; preserve the Claude explanation.                                 |
| `docs/user-guide/tools-setup.md`                                                                                                                                                                                                                                                                      | Describe Desktop as configuration-free and setup as a direct probe; preserve the Claude setup instructions.                                                                                        |
| `docs/developer-guide/build-system.md`                                                                                                                                                                                                                                                                | Remove the session-title runtime pair from the allowlist/runtime-script documentation and describe remote-tracker as the remaining pair.                                                           |
| `docs/developer-guide/release-and-installation.md`                                                                                                                                                                                                                                                    | Remove the title helper and hook trust boundary from the shipped-payload description.                                                                                                              |
| `docs/adr/session-rename-butler.md`                                                                                                                                                                                                                                                                   | Correct stale Codex context and cross-references while leaving the Claude decision Active and unchanged.                                                                                           |

`src/SKILL.md` and `docs/developer-guide/architecture.md` require no behavioral change: the eager
title-policy include and lazy mechanism boundary remain valid. A wording-only architecture edit is
allowed only if implementation reveals a statement that becomes false after the transport removal.

## Implementation details

### 1. Replace the host contract at its policy boundary

Update `src/shared/session-title.md` so the current-task exception is explicit and narrow: only the
ChatGPT Desktop app's native operation may target the caller, and it does so without a task id.
Preserve `never retitle another session`, the Claude butler carve-out, the work-subject and silent
tool lists, title derivation, one attempt, display-data validation, and the single suggestion line.
Remove the global requirement to send a pending request as the run's final action; direct Desktop
application happens when the subject is fixed, while the Claude section keeps its own send-last rule.

Verify with the focused workflow-contract test before changing the transport.

### 2. Replace the Codex transport with the Desktop primitive

Rewrite the opening dispatch and first host section of `src/shared/session-rename.md`:

- ChatGPT Desktop, Codex tab: call the native title operation with the requested title and no
  `threadId`;
- Claude Code: enter the existing butler section;
- Codex CLI or any other host: no established automatic path in this scope, so use the policy's
  visible fallback where applicable and read no other host section.

The Desktop section must be small and outcome-driven. It uses the exposed semantic capability —
currently `codex_app__set_thread_title` — once, stays silent on a successful call, and emits one
suggestion when the capability is absent or the call fails. It does not infer user-title ownership
from a different or malformed return value. It never lists tasks, supplies an id, retries, writes
state, or calls the operation after a manual fallback. In the Claude section, remove only
comparisons to the former Codex receipt/expiry path; do not change the mandate or behavior.

### 3. Make setup a capability probe instead of an installer

Keep Step 7 optional because its probe visibly renames the current task. Change the host text and
question so it no longer promises pasteable configuration for every established path. For the
Desktop Codex tab, explain that the native capability requires no installation, then apply the fixed
probe title directly after consent and report the concrete result. Do not ask the user to paste,
trust, or review a hook. Keep the Claude Code branch verbatim except for shared introductory wording
that must now accommodate a configuration-free Desktop path.

Also tell users who previously installed `session-title.mjs apply` to remove only that matching
legacy `Stop` handler themselves, not unrelated handlers or the containing configuration file. Setup
may describe likely files but must not open, edit, or delete them.

### 4. Remove hook-only runtime coupling

Retain the `session-rename` lazy pointer in all sixteen work-subject tools. Delete both hook-only
includes from `apply-plan`, `concept`, and `concept-review`. In `plan`, delete only the migration
pointer added for title requests and restore the safety pointer's original legacy-migration trigger.
In tools that have other runtime writers, remove only the session-rename clause and preserve the
remaining trigger text. Restore setup's safety trigger by removing its hook-probe alternative.
Afterward, no title application should load `.effective-flow/` migration or write-safety guidance,
while every unrelated runtime writer keeps its existing protection.

### 5. Delete and unregister the obsolete runtime

Delete the two title scripts and their dedicated test file, then remove both allowlist entries from
`build.mjs`. Do not retain a no-op compatibility entry point. Do not weaken the generic
dependency-free runtime guard or the remote-tracker shipping check. Extend
`scripts/distribution-smoke.mjs` to prove both title helpers are absent across native Claude, native
Codex, and portable payloads.

### 6. Rebuild contract coverage and current documentation

Update workflow contract tests to pin the enduring **instruction contract** rather than claiming to
execute app behavior:

- the dispatch names the ChatGPT Desktop Codex tab specifically and does not route generic Codex or
  Codex CLI into the native branch;
- the prose requires the direct call to omit `threadId`, forbids task listing and cross-task
  targeting, and specifies one attempt;
- the prose specifies silence on call success and one suggestion when the capability is absent or
  the call errors;
- active source and current documentation contain none of the retired signatures
  `session-title.mjs apply`, `hooks.Stop`, `codex app-server`, `session-title.json`, or
  `session-title-hook.json`, apart from the precise stale-hook removal instruction;
- all sixteen work-subject tools still carry the lazy mechanism pointer, while the six silent tools
  do not;
- the Claude mandate block, marker-title discovery, read-back rule, requester-side prohibition, and
  fail-open degradation remain pinned;
- setup uses the native probe and does not instruct Desktop users to configure a hook.

Update only current documentation and the active ADR. Archived plans remain the historical evidence
for the retired architecture.

### Edge cases

- **Native tool absent or renamed:** emit the suggestion once; do not infer a path from Codex
  environment variables or recreate the RPC.
- **Permission denied or tool error:** emit the suggestion once and continue the workflow normally.
- **Successful call:** stay silent; the normal path does not poll or list tasks to reinterpret the
  app's acknowledgement.
- **Unexpected return shape:** do not infer `titleSource` or user ownership. Treat the outcome as
  unverified and use the visible suggestion unless the host independently reported a successful call.
- **Background UI update lags behind the tool result:** do not poll or list tasks during a normal run;
  the manual Desktop smoke test owns visual confirmation.
- **Legacy hook still installed:** the user removes it manually. Effective Flow does not mutate the
  configuration and does not keep a privileged compatibility helper alive solely for stale hooks.
- **Legacy request/receipt files remain:** ignore them. They are gitignored, inert, and not a reason
  for destructive cleanup.
- **Worktree execution:** the title path is independent of `RUNTIME_STATE_ROOT` and
  `EXECUTION_ROOT`; no cross-worktree rendezvous is needed.
- **Manual user title:** a later Desktop work-subject run may overwrite it. Do not poll, list tasks,
  or infer ownership to prevent this; the behavior is explicit and documented. Claude's butler path
  retains its current user-title handling.

## Acceptance criteria

### Repository-verifiable

- [ ] `src/shared/session-title.md` permits only the native current-task exception and still forbids
      arbitrary cross-session renames.
- [ ] `src/shared/session-rename.md` distinguishes the ChatGPT Desktop Codex tab from Codex CLI and
      contains no active hook, app-server, request-file, receipt, or liveness-scan mechanism.
- [ ] The Desktop instruction contract requires one native call without `threadId`, forbids task
      listing and cross-task targeting, and specifies success and fallback dispositions without
      claiming that Markdown tests execute the app tool.
- [ ] All sixteen work-subject tools still carry the `session-rename` lazy pointer, all six silent
      tools remain silent, and no title path loads runtime-state write/migration guidance.
- [ ] The Claude Code butler contract and its load-bearing tests are behaviorally unchanged.
- [ ] `src/scripts/session-title.mjs`, `src/scripts/session-title-core.mjs`, and
      `test/session-title.test.mjs` are absent; neither script is build-registered; and
      `scripts/distribution-smoke.mjs` proves both are absent from all three built payloads.
- [ ] Current user and developer documentation no longer instructs ChatGPT Desktop users to install
      or trust a Codex hook and includes a manual stale-hook removal note.
- [ ] The active Claude butler ADR remains Active and no longer depends on a false description of the
      Codex path.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass.

### Manual field verification

- [ ] In the ChatGPT Desktop Codex tab, a work-subject run changes the current task to
      `<Subject> · <tool>` in the same turn and prints no suggestion line.
- [ ] `effective-flow setup` can apply `Effective Flow setup check` directly without asking for hook
      configuration or creating title runtime files.
- [ ] A task renamed manually and then used for another Desktop work-subject run is allowed to receive
      the new Effective Flow title; current documentation states that overwrite behavior.
- [ ] Claude Code still completes one representative rename through the existing butler path.

## Validation plan

Run from the repository root in this order:

| Purpose                         | Command                                        | Expected result                                                                                |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Focused contract regression     | `node --test test/workflow-contracts.test.mjs` | Exit 0; Desktop dispatch/application and Claude preservation assertions pass.                  |
| Formatting and source contracts | `pnpm agent:check`                             | Exit 0 with no writes.                                                                         |
| Full unit/contract suite        | `pnpm test`                                    | Exit 0; the removed helper test is no longer discovered.                                       |
| Generate all targets            | `node build.mjs`                               | Exit 0; every target builds with only registered runtime scripts.                              |
| Isolated delivery smoke suite   | `pnpm test:distribution`                       | Exit 0; all three payloads omit both title helpers and keep the remote-tracker runtime intact. |

After repository checks pass, install or link the built skill through the repository's normal local
developer path and execute the applicable manual criteria in ChatGPT Desktop and Claude Code.
Inspect the visible task title for Desktop; do not use task listing as a hidden production dependency.

## Assumptions and open points

| #   | Assumption                                                                                                                    | Stop condition                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The ChatGPT Desktop Codex tab continues to expose a current-task title operation whose omitted `threadId` targets the caller. | Stop if normal Effective Flow runs cannot access that operation or if it requires an arbitrary task id. Do not restore the hook or invent another cross-task route. |
| A4  | Archived plans and historical release prose are records of prior behavior rather than current instructions.                   | Stop only if a current documentation index presents archived material as live setup guidance.                                                                       |

These are implementation-time verification gates, not unresolved user decisions.

## Plan review

**Result:** Approved. No critical findings or implementation-blocking open points remain.

The review applied the `codebase-improvement` plan-quality discipline and a read-only Effective Flow
Node.js review using `software-architecture`. It confirmed the host-conflation root cause and the
platform-primitive replacement. It also expanded the first draft to cover hook-only lazy-include
cleanup, stale external hook configuration, inert runtime files, the explicit Desktop manual-title
overwrite decision, and the negative distribution contract.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         3 |    0 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         3 |    0 |

### Findings

- **Architecture, important — generic “Codex” dispatch conflates two different hosts.** Incorporated
  as an explicit ChatGPT Desktop Codex-tab route with Codex CLI excluded.
- **Architecture, important — the app primitive must target only the caller.** Incorporated by
  requiring omission of `threadId` and prohibiting task listing or id resolution.
- **Security, important — the obsolete design retains an unsandboxed hook boundary fed through
  workspace-writable state.** Incorporated by removing the full transport rather than wrapping it.
- **Error cases, important — a native failure must not create silent title loss.** Incorporated as
  the existing one-line suggestion fallback with no retry.
- **Testability, important — deleting unit tests without replacing the enduring contract would leave
  the behavior unprotected.** Incorporated as focused workflow-contract and negative distribution
  assertions plus live Desktop verification.
- **Scope, important — hook-only safety/migration triggers extend beyond the obvious helper files.**
  Incorporated across all sixteen work-subject tools while retaining their mechanism pointers.
- **Maintainability, important — leaving 2,484 lines of unused helper code/tests would preserve the
  wrong architecture.** Incorporated as complete deletion and build unregistering.
- **Maintainability, important — existing external hook entries outlive the shipped helper.**
  Incorporated as a precise manual removal notice; the user deliberately rejected a compatibility
  shim for the out-of-scope CLI path.
- **Error cases, note — the native operation updates in the background.** Normal runs do not poll;
  the manual smoke test verifies the visible outcome.
- **Scope, note — archived plans still describe the former hook accurately.** They stay unchanged as
  historical records.
- **Error cases, important — the native contract does not expose `titleSource` or a documented
  retained-title outcome.** Unsupported inference was removed; the user's decision now explicitly
  permits Desktop automatic renames to overwrite manual titles when protection is not established.
- **Testability, important — Markdown contract tests cannot execute the app operation.** The plan now
  limits them to source-instruction assertions and reserves host behavior for live verification.
- **Testability, important — the distribution smoke suite did not prove removed files were absent.**
  `scripts/distribution-smoke.mjs` is now an affected file with an explicit inventory check.
- **Scope, important — the old hook may outlive the shipped helper outside the supported Desktop
  path.** The user selected immediate helper deletion with precise manual removal; stale CLI-hook
  failures are accepted because Codex CLI is explicitly out of scope.
- **Maintainability, important — the exact hook-only tool edits must be derived from history.** The
  plan preserves `plan`'s pre-existing runtime-state safety trigger and removes only its hook-added
  migration pointer, rejecting a broader deletion that would weaken an unrelated migration guard.

### Scorecard

| Criterion               | Result                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clarity                 | 100% — exact host, boundaries, files, order, manual-title behavior, and compatibility inventory are named.                                           |
| Verification            | 95% — static prompt contracts, negative distribution checks, and live app behavior are separated; the app primitive itself remains a field check.    |
| Context                 | 100% verified or explicitly decided — current source, history, tool schema, documentation search, live probes, and both user decisions are recorded. |
| Big Picture             | Pass — the plan replaces a stale transport with the supported platform boundary and preserves the independent Claude path.                           |
| No-code boundary        | Pass — this planning run changes only this file under `docs/plan/`.                                                                                  |
| Code frugality          | Pass — no implementation code is embedded.                                                                                                           |
| Workflow recommendation | Pass — this is a Bugfix because an advertised automatic title path fails in the current supported Desktop host.                                      |

## Open points

- No open points.

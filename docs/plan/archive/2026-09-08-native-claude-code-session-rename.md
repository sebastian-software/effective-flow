# Rename the Claude Code session natively and retire the butler

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)
**Planned against:** `2379fbe`, 2026-09-08
**Working state:** `docs/plan/2026-09-02-merge-gate-deferring-tool-local-sections.md` modified and
`docs/plan/2026-09-02-goal-completion-invariants.md` untracked; neither is in scope here.

## Requirement

`src/shared/session-rename.md` routes Claude Code to a butler: a second session, discovered by a
world-writable marker title, that receives `{sessionId, title}` over `send_message` and renames the
requester. The whole construction exists for one stated reason (`session-rename.md:51-57`): the
host's rename tool "refuses the caller outright" and a session "cannot even read its own title
back".

**That premise no longer holds.** Verified live in this planning session on 2026-09-08:

- `get_session` accepts the literal `"self"` and returned this session's own `sessionId` and
  `title`.
- `set_session_title` accepts `"self"`. The call returned
  `Renamed this session to "…" (was "…")`, applied immediately, with no approval prompt, and a
  following `get_session("self")` read the new title back. Its tool contract now opens with
  "Rename a CCD session — another session, or this one."

The butler path meanwhile carries a live defect, diagnosed in
`.effective-flow/investigation/investigation-2026-09-08-forked-session-butler-wrong-target.md`: a
**forked** session sends the butler its **parent's** id, so the parent is renamed and the fork keeps
its inherited title. Measured cause: the fork's own `CLAUDE_CODE_HOST_SESSION_ID` is correct
(`local_283c7697-…` on PID 11829), but the run never read it — the only environment read in the
fork's context is the parent's, copied into the fork with the transcript. The failure is invisible:
the butler reads back the wrong session, replies with the requested title, and the requester's
liveness comparison hits the success row at `session-rename.md:277` and stays silent.

The change is therefore not a repair of the butler path but its **retirement**. Claude Code calls
`set_session_title` with `"self"`, exactly as the ChatGPT Desktop path calls its current-task
operation without a `threadId`. No session id is resolved, sent, or received anywhere, so the
diagnosed defect has no surface left to occur on, and roughly 200 lines of discovery, payload,
mandate, liveness and degradation contract are deleted rather than fixed.

## Architecture decisions

- **Claude Code gets a native path shaped exactly like the ChatGPT Desktop one.** The Desktop
  section (`session-rename.md:21-49`) is the working precedent: one semantic current-task call, no
  id, no receipt file, no runtime state, no write-safety contract, and degradation to the suggestion
  line on any failure. The Claude Code section becomes the same shape with `set_session_title` /
  `"self"` in place of `codex_app__set_thread_title` / omitted `threadId`. Two hosts, one shape.
- **The butler is retired, not demoted.** A second, fallback mechanism for one host would keep every
  liability that made this defect possible — a capability authenticated by a world-writable title, a
  session id crossing a trust boundary, a prose guard nobody verifies, and a liveness heuristic that
  reads a wrong-target rename as success — in exchange for renaming sessions on hosts that refuse
  `"self"`. Those hosts are not stranded: they degrade to the `**Suggested session title:**` line,
  which is the same visible outcome every other failure on every other host already produces. The
  cost of removal is one printed line instead of an automatic rename; the benefit is that the
  remaining path cannot target the wrong session at all.
- **Capability is established by attempting the call, never by probing.** A run calls
  `set_session_title` with `"self"` once, when the title is fixed. A refusal, an error, an absent or
  unloaded tool, or any non-success result ends at the suggestion line. There is no version check
  and no speculative probe — the session-title contract forbids the latter outright
  (`session-title.md:11`), and an attempt that fails costs exactly what a probe would have cost.
- **Consent moves to the host.** The rename tool states that a title the **user** set is replaced
  only after the app asks them, that unattended sessions decline instead, and that app-generated
  titles are replaced silently. That is a stronger version of what the fragment's emit-nothing row
  (`session-rename.md:277`) approximated by comparing reply strings across turns. The fragment stops
  reasoning about title ownership entirely and reports what the call reported.
- **`setup` stops setting up a butler.** With no fallback there is nothing to configure: the Claude
  Code sub-step of Step 7 becomes the same single capability probe the Desktop path already uses,
  with the existing fixed probe title `Effective Flow setup check`.
- **The ADR is rewritten in place and keeps its file name.** `src/shared/adr-convention.md` declares
  Effective Flow ADRs living: mutable, numberless, the current file is the truth — so the slug is an
  address, not a claim about the content. `docs/adr/session-rename-butler.md` therefore stays at that
  path while its content changes from "a butler renames on request" to "the session renames itself;
  the butler is retired". Decided rather than deferred: a rename would cost the existing-path test,
  the fragment reference and the docs links, and buy only a tidier name. The implementing run does
  not reopen it.
- **The retirement ships as an ordinary `feat`, with no breaking marker.** On an affected host the
  user-visible outcome is a printed suggestion line instead of an automatic rename — the same
  degradation Codex CLI and every other unsupported host already produce, and nothing a consumer
  integrates against. `AGENTS.md` warns specifically against marking changes breaking that are not,
  and a mistaken marker has to be pinned forward with a `Release-As:` footer rather than rewritten.
  The commit body still names the retirement and what an existing butler owner should do.

- **No behavioural eval.** `evals/` holds one bespoke harness for `merge-gate` with its own
  `prepare.mjs`. A second one for session rename is separate work with its own plan; folding it in
  would hide this change inside an infrastructure project.

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-rename.md`                     | Replace the whole `### Claude Code` section (`:51-282`) with a native section in the Desktop section's shape; the dispatch table's Claude Code row points at it. Deletes discovery, the `{sessionId, title}` payload, the pasted mandate, the corrective-request budget, the liveness comparison and the degradation table |
| `src/shared/session-title.md`                      | Remove the butler carve-out (`:18-21`); generalize `:10` so the `"self"` sentinel is covered by "takes no task id"; add the Claude Code consent behavior beside the Desktop sentence at `:16`; replace "the Claude Code butler request" with the native call at `:36-38`                                                   |
| `src/tools/setup.md`                               | Step 7 Claude Code sub-step (`:1031-1065`): replace the mandate print and butler probe with the native probe; adjust the ask block (`:992-1002`) and the summary reporting line (`:1117`) that names "whether exactly one butler was found"                                                                                |
| `docs/adr/session-rename-butler.md`                | Rewrite Context (the premise lapsed, with the 2026-09-08 evidence), Decision (native self-rename, no id crosses a boundary, butler retired) and Consequences (hosts refusing `"self"` degrade to the suggestion line); keep `## Status` `Active`                                                                           |
| `test/workflow-contracts.test.mjs`                 | Remove the butler clause test (`:1737-2003`) and replace it with native-section pins; update the dispatch test (`:734-747`), the setup pins (`:2010-2015`, which currently require setup to name the marker title) and the setup-guide pins (`:1649-1656`)                                                                 |
| `docs/user-guide/getting-started.md`               | `:158-165` — replace the butler description with the native rename and the suggestion-line fallback                                                                                                                                                                                                                        |
| `docs/user-guide/tools-setup.md`                   | `:17`, `:125`, `:128` — same, plus a line telling anyone who already keeps a butler session that it is no longer used and can be closed                                                                                                                                                                                    |
| `docs/developer-guide/build-system.md`             | `:408` — "Claude Code follows the instruction-level rename-butler …" is no longer true                                                                                                                                                                                                                                     |
| `docs/developer-guide/release-and-installation.md` | `:311` — same sentence pattern                                                                                                                                                                                                                                                                                             |

Out of scope, deliberately: the ChatGPT Desktop section; the Codex CLI row; `evals/`; any version
bump (release-please owns it); `CONTEXT_BUDGET_LINES` (verified: the fragment is `lazy-include`d by
all consuming tools and `build.mjs:1503-1507` counts only `dist/<harness>/tools/<name>.md`, so
shrinking it moves no budget number either).

## Implementation details

### Approach

1. **Write the new Claude Code section** as a single `### Claude Code: rename this session directly`,
   replacing `:51-282` entirely. Content, in the Desktop section's order: call `set_session_title`
   with the literal `"self"` and the already-cut title, once, as soon as the subject is fixed; never
   name another session and never assemble a session id; the call itself is the whole path — no
   hook, no runtime file, no receipt, no write-safety contract; on a reported success stay silent;
   on any other outcome emit the one `**Suggested session title:**` line, without blocking or
   retrying. Carry over the Desktop section's late-bound-reference clause: a reference that becomes
   available only after a successful call licenses exactly one further call, and nothing after that.
2. **Retarget the dispatch table** (`:14-19`) so the Claude Code row points at that section. Keep
   the table's three-row shape and its existing first-column values — `test/…:738-743` asserts the
   host column with `firstColumnCells` plus `assert.deepEqual`, so changing a host name would break
   a test that is not about this change. Update the paragraph below the table that currently says
   the two hosts "share nothing but their visible fallback" — with one shape for both, that sentence
   is now wrong in the other direction.
3. **Delete the butler surface** in the same edit: the five `####` subsections, the fenced standing
   mandate, the marker title `Effective Flow rename butler`, and the degradation table. Nothing in
   the repository may still reference the marker title afterwards; grep for it as the completion
   check.
4. **Edit `session-title.md`** at the four sites named in the affected-files table. The carve-out at
   `:18-21` is the load-bearing one: it exists solely to permit a butler to honor a cross-session
   rename, and leaving it would keep a permission with no mechanism behind it.
5. **Rework `setup.md` Step 7**, Claude Code sub-step, into the Desktop-shaped probe: attempt the
   native rename with the existing fixed probe title `Effective Flow setup check` and report the
   concrete result. Remove the mandate print, the butler discovery step and the lookup reporting.
   Keep setup's existing rule that it neither derives nor emits a work title.
6. **Rewrite the ADR** at the three sites named above. State the retirement as the decision and the
   suggestion line as the accepted degradation, so a later reader does not reconstruct the butler
   from the old rationale.
7. **Update the two user-guide pages and the two developer-guide sentences.** The user guide gains
   one sentence for existing butler owners: the session is no longer contacted and can be closed.
8. **Update the tests last**, against the finished text. Remove the butler clause test; add pins for
   the native section in the idiom of the Desktop one (`source`, `section(fragment, heading,
'\n### ')`, `prose`, `near`); update the dispatch, setup and setup-guide pins. Respect the
   whole-fragment negative pin at `:1764` (`assert.doesNotMatch(prose(fragment), /last action/i)`)
   if it is kept, and delete it deliberately rather than incidentally if it is not.

### Edge cases

- **The tool is deferred rather than absent.** In this host the session tools are reachable only
  after a `ToolSearch` load; that was true in this planning session for both `get_session` and
  `set_session_title`. A run that reads "not in my tool list" as "capability absent" would print a
  suggestion line on a host where the native path works. The section must say that an unloaded tool
  is loaded first, and that only a refusal or an error from the call itself counts as failure.
- **Claude Code without the session tools at all** (a terminal CLI session with no
  session-management server): the call cannot be made and the run emits the suggestion line. The
  section must not assume the tools exist merely because the host is Claude Code.
- **A host that refuses `"self"`.** This is the accepted cost of the retirement: the run prints the
  suggestion line, exactly as Codex CLI does today. The section states it as a normal outcome, not
  as an error to report.
- **The user set the current title themselves.** Per the tool contract the app asks them to approve
  and an unattended session declines. Both are simply the call's reported result: approved is
  success, declined ends at the suggestion line. The fragment adds no reasoning of its own about who
  owns the title and never reads the session back to find out.
- **A forked session** carries no id anywhere on this path, so the diagnosed defect cannot occur.
- **An existing butler session** stops receiving requests the moment this ships. It is inert, not
  broken; the user guide says it can be closed.

## Acceptance criteria

- [ ] `src/shared/session-rename.md` contains exactly one Claude Code section, naming
      `set_session_title` and the literal `"self"`, forbidding any session id on that path, and
      degrading to the suggestion line on every non-success outcome; the dispatch table's Claude
      Code row points at it.
- [ ] `grep -ri "butler" src/ test/ docs/user-guide docs/developer-guide` returns nothing, and
      `grep -r "Effective Flow rename butler" .` returns hits only under `docs/plan/archive/` and
      `.effective-flow/`.
- [ ] `src/shared/session-title.md` no longer contains the standing-mandate carve-out and names the
      Claude Code native call among the early-applying paths.
- [ ] `src/tools/setup.md` probes the native rename and no longer prints a mandate or looks for a
      butler; it still derives and emits no work title.
- [ ] `docs/adr/session-rename-butler.md` records the retirement, keeps `## Status` `Active`, and
      names the suggestion line as the accepted degradation.
- [ ] `node --test` passes with the butler clause test removed, the dispatch, setup and setup-guide
      pins updated, and at least one new assertion per acceptance criterion above that names a
      fragment site.
- [ ] `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` all pass.

## Validation plan

| Purpose                          | Command                                                             | Expected result                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                       | `pnpm agent:check`                                                  | exit 0, no diff                                                                                                                           |
| Contracts and unit suite         | `pnpm test`                                                         | exit 0; butler pins gone, native pins present                                                                                             |
| Residue check                    | `grep -ri "butler" src/ test/ docs/user-guide docs/developer-guide` | no matches                                                                                                                                |
| Build guards                     | `node build.mjs`                                                    | exit 0; lazy-include resolution and shipping guards pass; the `Always-loaded core (lines/budget)` report shows no changed tool line count |
| Delivery layouts                 | `pnpm test:distribution`                                            | exit 0                                                                                                                                    |
| Behavioural check (manual, once) | Run any work-subject tool in a Claude Code session                  | the session is renamed, with no `**Suggested session title:**` line and no cross-session message                                          |
| Regression check (manual, once)  | Fork a session, run a work-subject tool in the fork                 | the **fork** is renamed; the parent's title is unchanged                                                                                  |

The two manual checks are the ones that matter, because every automated assertion in this repository
tests the **text** of a fragment rather than a run. The plan does not claim they are automatable
within this scope.

## Assumptions and open points

- **Verified in this session (2026-09-08, Claude Code desktop 1.4638 / agent SDK 0.3.260):**
  `get_session("self")` returns own `sessionId` and `title`; `set_session_title` with `"self"`
  renames immediately and the change reads back. Recorded because a later host change would
  invalidate this plan's premise the way the old premise was invalidated.
- **Assumed, not verified:** that the app really does ask for approval when the **user** set the
  current title — the observed rename replaced an agent-set title. It affects only the failure
  wording; the degradation covers either behavior. Verify opportunistically during implementation
  and do not weaken the degradation if it cannot be observed.
- **Assumed:** the session-management tools are absent in some Claude Code contexts (terminal CLI).
  Treated as an edge case rather than a claim.
- **Assumed:** hosts predating the `"self"` support exist in the field. Not measurable from here,
  and it is the reason the suggestion-line degradation is stated as a normal outcome rather than an
  error.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important — retiring the fallback trades automatic renaming for a printed line on
  hosts that refuse `"self"`.** Raised during review and decided by the user: remove the butler.
  Incorporated as an explicit architecture decision with the cost named, and as a normal-outcome
  edge case rather than an error, so the trade is visible to a later reader instead of being
  rediscovered as a regression.
- **Architecture, Note — the dispatch table's framing paragraph outlives its claim.** It currently
  says the two host paths "share nothing but their visible fallback"; after this change they share
  their shape. Incorporated into approach step 2.
- **Error cases, Important — "capability absent" is the easiest wrong conclusion.** The
  deferred-tool case is the concrete failure mode observed in this very session, where both session
  tools needed loading before use. Incorporated as an explicit sentence in the new section rather
  than as an assumption.
- **Testability, Important — the removal must be verified by absence, not only by new pins.** A
  deletion this size can leave a mandate paragraph or a marker-title mention behind in a doc page
  that no test reads. Incorporated as a grep-based acceptance criterion and a validation row.
- **Testability, Note — `test/…:1764` is a whole-fragment negative pin** (`/last action/i`) that
  survives the section it was written for. Approach step 8 requires deciding its fate deliberately
  rather than letting it pass vacuously over a fragment that no longer contains the prose it guards.
- **Scope, Important — the investigation recommended `effective-flow fix`.** This plan is far larger
  than a minimal regression-guarded intervention: it removes a mechanism, changes the setup flow and
  rewrites an ADR. `build` is the honest container, and the originating defect is closed as a
  consequence of the retirement rather than as a step of its own.
- **Scope, Note — the release marker was decided in review, not left to delivery.** Losing the
  butler is user-visible for anyone who configured one, which makes the Conventional Commit type a
  real question rather than a formality. Decided: an ordinary `feat`, recorded as an architecture
  decision above, so the implementing run does not reopen it.
- **Security, Note — the removal deletes a world-writable capability.** Butler discovery
  authenticated nothing (`session-rename.md:110-120`), so a marker-title squatter could receive a
  work subject derived from issue or pull-request text. Retirement closes that exposure outright;
  no mitigation needs to be designed.
- **Data protection, Note — nothing crosses a session boundary any more.** The payload shrinks from
  `{sessionId, title}` to nothing; the ADR consequence about the payload is replaced rather than
  narrowed.
- **Maintainability, Note — the ADR slug outlives the decision it was named for.** Raised in review
  and decided: keep the file name. Under the living-ADR convention the current file is the truth
  regardless of its slug, and while this is the only ADR on the subject the name misleads nobody who
  opens it. Recorded as an architecture decision so it does not resurface as a delivery question.

## Open points

- No open points.

## Implementation notes

Implemented on 2026-09-08 by `effective-flow build`, from base `4c3960b` (the plan was written
against `2379fbe`; the drift check found every cited anchor still at its cited line).

What the run did beyond the plan's approach steps:

- **`build.mjs` came into scope after all.** The plan declared `CONTEXT_BUDGET_LINES` out of scope,
  verified against the lazy-included fragment. That reasoning did not cover `src/tools/setup.md`,
  which is an eager tool file: it shrank by 20 lines, leaving 21 lines of headroom against a
  ceiling of ten. The entry was lowered 1646 → 1631 (built count 1624).
- **One butler-era claim survived the first pass.** `src/tools/setup.md` still said "the Claude Code
  path sends a cross-session message" in its Rules section — a sentence containing neither "butler"
  nor "marker title", which is why no grep and no test caught it. It now names what both paths
  actually do.
- **The merge-gate eval rounds were re-run.** Every archived eval log is bound to a digest of the
  built skill, so this change invalidated all ten. Both scenarios were re-run to the documented
  five-of-five bar against the final build. Two runs were discarded and redone: one where the host
  denied `pr-merge --apply` before it reached the stub, and one whose log a diagnostic call had
  polluted. Because the digest covers the whole skill, the source had to be frozen before the round
  started — which is why the review's correction round ran first.

## Test results

| Check                                       | Result                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm agent:check`                          | exit 0, 353 files, no diff                                                                                                |
| `pnpm test`                                 | exit 0 — 864 tests, 864 pass, 0 fail                                                                                      |
| `node build.mjs`                            | exit 0; `setup 1624/1631`                                                                                                 |
| `pnpm test:distribution`                    | exit 0, offline checks passed                                                                                             |
| `node --test test/merge-gate-eval.test.mjs` | exit 0 — 9 pass, the assertion that was red throughout                                                                    |
| Behavioural, manual                         | `guard-blocks-merge` 5/5 refused with no `pr-merge` call; `merge-proceeds` 5/5 merged with exactly one `pr-merge --apply` |

## Review findings

**Date:** 2026-09-08
**Reviewer:** effective-flow-generic-product-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     8 |
| Open / Not implemented |     1 |

**External review report:** `.effective-flow/review/review-report-2026-09-08-plan-native-claude-code-session-rename.md`

The review delivered all severities (0 Critical, 2 Important, 7 Notes) and mutation-tested its own
findings. The load-bearing one: removing the whole-fragment `/last action/i` pin left a real hole —
inserting that retired ordering into the new section kept the suite green — so the pin was restored
and now protects both native sections. Two guards were tightened rather than weakened, and the four
documentation pages gained a standing butler guard in place of the plan's one-shot grep.

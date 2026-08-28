# Offer a terminal issue transition after the merge gate

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `12f8aa7` on 2026-08-27 — the tip of `origin/develop`. First written against
`2eda90b` and rebased after `12f8aa7` ("feat: automate delivery after manifest confirmation")
landed; that commit touched only `docs/user-guide/tools-deliver.md` (shifting every citation below
its line 55 by +4) and `test/workflow-contracts.test.mjs` (only at line 8336 and below, so the
Phase-5.5 pins are unmoved). `src/tools/merge-gate.md`, every shared fragment, and
`src/scripts/remote-tracker-core.mjs` are byte-identical at both commits. Every citation below is
against `12f8aa7` and was verified against the file.
**Working state:** the tree carries two unrelated untracked plan files
(`docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md`,
`docs/plan/2026-08-20-plan-publication-before-implementation.md`). Neither touches Phase 5.5 of
`merge-gate`; the source-slimming plan does target `src/tools/merge-gate.md` as a whole, so whichever
lands second rebases onto the other.

## Requirement

At the end of `{{SKILL:merge-gate}}` the tracker issue behind the merged pull request is usually
stale. On a forge a `Closes #<n>` keyword auto-closes it, but an issue linked with `refs` never
does, and on an external tracker such as Linear nothing closes it at all — the merge is invisible to
the tracker. Today the gate observes that state and stops: `src/tools/merge-gate.md:1833-1837` and
`src/shared/issue-lifecycle.md:100-111` derive _closure guidance text_ whose last item literally
reads "otherwise state that no remaining implementation work is visible and only the tracker
transition to a terminal state remains". Nothing performs or offers that transition.

The gate shall therefore, after a confirmed merge and **without asking**, assess for every
nonterminal linked issue whether the merged pull request completes it, and — only where the answer
is an evidence-backed yes — **offer** to transition that issue to its terminal "done" state.

This is a Feature: it adds a new post-merge capability, one new helper operation, and one new
configuration key. It changes no existing gate decision — the merge, the check rounds, the bot
rounds, and the merge preconditions are untouched, and nothing here can block or undo a merge.

Scope decided with the operator before planning:

- **Both tracker targets.** Forge and external. The forge path needs a genuinely new mutation,
  because no operation in `src/scripts/remote-tracker-core.mjs` changes an issue's state.
- **Evidence from the tracker _and_ the merged pull request.** Structural tracker evidence
  (sub-issues, task list, classification) plus a coverage check of the issue's own stated acceptance
  criteria against the merged pull request's title and body, which the gate already reads.
- **A non-interactive run reports and transitions nothing.** No configuration key authorizes an
  unattended transition.

## Architecture decisions

1. **The assessment runs in-run, and the paragraph that permits that is widened deliberately.**
   `src/tools/merge-gate.md:73-79` states that the delegation mandate's "delegation is the default
   for analysis" does not reach this gate's own state reading and guard evaluation — but it says so
   through a **closed enumeration**: "Reading the pull-request status, the threads, and the comments
   fresh, classifying every item through Phase 1's ordered rules, setting the human-comment guard,
   and evaluating the Phase-4 conditions stay **in this run**." A Phase-5.5 completion assessment is
   in none of the four. It belongs there for the same stated reason — it is a guard that authorizes a
   write, and "a sub-agent's summarized answer would be exactly the kind of unprovable evidence
   every one of those rules fails closed on" — but that is an argument for **editing** the
   enumeration, not for reading an exception into it. The paragraph therefore gains a fifth member
   with its own justification, and a prose pin. Leaving it implicit would let the implementer
   silently choose either reading.

2. **The verdict vocabulary is closed and has three values: `complete`, `incomplete`,
   `undetermined`.** Only `complete` may lead to an offer. This mirrors the file's existing habit of
   closed vocabularies (`src/tools/merge-gate.md:443-465` for returned outcomes,
   `src/tools/merge-gate.md:1816` for the four post-merge observation outcomes) and makes "we could
   not tell" a first-class result rather than a silent pass. `undetermined` and `incomplete` are
   reported differently but treated identically: no offer.

3. **A stated acceptance criterion is a list item under a heading from a closed set — nothing else.**
   The closed set is `Acceptance criteria`, `Akzeptanzkriterien`, and `Done criteria`, matched
   case-insensitively at any heading level; the criteria are that section's top-level list items.
   An issue body with no such heading states **no** criteria. Any looser reading — pulling
   "must"/"shall" sentences out of prose — is not interpretation but derivation, and
   `src/shared/issue-lifecycle.md:113` forbids exactly that: "Never invent product work, acceptance
   criteria, or an unobserved blocker." The closed set also keeps this dimension distinct from the
   task-list dimension in the same verdict, which reads GFM checkboxes and would otherwise overlap
   it.

4. **An issue that states no criteria is `undetermined`, never `complete`.** An issue with no
   criteria heading, no native sub-issues, no task list and no `effective-flow-needs-planning`
   classification is the cheapest input in the system to construct, and decision 5's mitigation —
   naming the evidence per criterion — is vacuous when there are no criteria. Requiring at least one
   covered stated criterion is what keeps `complete` meaning something and keeps the mitigation from
   being empty exactly where it is needed most. Such an issue loses nothing: it receives today's
   closure guidance, which is today's behaviour.

5. **The question's text is fixed; the evidence is listed in chat as locators, and no issue or
   pull-request text is quoted anywhere.** `src/tools/merge-gate.md:1635-1638` already settles this
   for the set-aside confirmation, on the identical threat model: every value "comes from the
   **manifest and this run's own record**, never from the review body. List them in chat immediately
   before the question – the question's own text is fixed and carries no per-round data… an excerpt
   would carry attacker-influenceable text into the very prompt that exists to resist it." That rule
   is reused verbatim rather than reasoned out a second time, for two reasons. Mechanically, an `ask`
   fence has no per-run data channel at all: `build-lib.mjs:1560-1604` parses static `header`,
   `question` and `label`/`description` literals, and the transforms emit them unchanged.
   Substantively, the `complete` verdict is derived from text a third party may control on any
   repository where they can file or edit an issue, so quoting that text into the confirmation
   prompt would defeat the confirmation. The chat listing therefore carries, per issue: the issue
   reference, the verdict, and one **locator** per criterion — its ordinal within the criteria
   section, plus whether the covering statement sits in the merged pull request's title or its body.
   The operator reads the criterion and the statement at the issue and pull-request URLs. The same
   discipline binds the Phase-6 summary, which already states at `:1881-1882` that it reads "no
   body, deliberately".

6. **The prohibition is kept where it forbids forcing and reworded where it states scope.** The four
   sites are not the same sentence doing the same job:
   - `src/shared/issue-lifecycle.md:100` — `Do not force-close an issue.`
   - `src/tools/merge-gate.md:1818-1819` — `Never force-close an issue and never write a fallback classification to a different target.`
   - `docs/user-guide/tools-deliver.md:215` — `It also never force-closes a linked issue…`
   - `docs/user-guide/remote-tracker.md:645` — `It never force-closes an issue.`

   All four forbid _forcing_, and an operator-confirmed transition after an evidence-backed
   `complete` verdict is not a forced close, so all four stay verbatim and gain this adjacent
   sentence: "An operator-confirmed transition after a `complete` assessment verdict is not a forced
   close and is the one authorized path."

   `src/tools/merge-gate.md:2286-2287` is different and **is** reworded. `Observe but never force
issue closure.` sits in the `## Rules` list, where it reads as a **scope statement** — this gate
   observes, it does not close — and that becomes false. A reader who greps the Rules and stops there
   would draw the wrong conclusion, and pinning the old wording while changing the guarantee is
   exactly the drift the pin exists to catch. It is restated as: "Never close an issue on this gate's
   own authority. A terminal transition happens only after a `complete` assessment verdict and an
   explicit operator confirmation in a gated run; every other path observes only."

7. **One question, once, covering every eligible issue.** `src/tools/merge-gate.md:1209-1214` is the
   precedent for a second standing question and for stating its grounds: the conflict question
   "deliberately deviates from `mergeGate.completion`'s once-per-run entry gate" and says why. The
   set-aside confirmation (`:1623-1735`) is the second, and covers its two conditions in one
   question. The done offer follows that shape: at most one `ask` per run, listing every eligible
   issue, with two options. An operator who wants per-issue control declines and transitions
   manually; the summary names each issue, so that is a two-minute job.

8. **The non-interactive shape already exists in the file and is reused, not invented.** The file
   carries **three** non-interactive shapes: `:892-894` (`ask` completion degrades to `report` and
   the run continues), `:1215-1217` with its rule at `:2237-2238` (`ask` conflict resolution "behaves
   as `off`" — no commit, no push, report the blocker, and the run continues into Phase 4), and
   `:1661-1664` (the set-aside confirmation blocks and ends the run). The second is structurally
   identical to what this offer needs — cannot ask, therefore perform no write, report, and continue
   — so the source cites it rather than naming a fourth shape. The other two are wrong here for
   stated reasons: the merge has already happened, so "end and never merge" is meaningless, and this
   phase reads no completion mode to degrade.

9. **`issue-close` rides the transports both providers already have, so it adds no probe.** On
   **GitHub** the capability map is a set of hardcoded literals, not probes
   (`src/scripts/remote-tracker-core.mjs:3805-3822`), so `issueClose: true` is a constant there and
   "probe both providers" would have been an instruction with nothing to probe. On **Forgejo** the
   `tea api` transport is already derived once as `teaApiTransport = commentUpdate && apiInclude`
   (`:3919`), and `issue-comment-update` at `:3223-3236` is exactly the
   `tea api … --method PATCH --data @-` shape an issue close needs, so
   `issueClose: teaApiTransport` reuses a probe that already runs. Nothing is appended to the
   `Promise.all` at `:3889-3914`, nothing to the destructuring ending at `:3888`, and nothing to the
   positional fixture at `test/remote-tracker.test.mjs:87-116` — which retires the single riskiest
   instruction this plan would otherwise carry, the ordering hazard its own fixture warns about at
   `:110-112`. The consequence is that a `tea` without `--include` reports `issue-close` unsupported
   alongside the four gate reads, which is why `docs/user-guide/troubleshooting.md:33-37` is a
   required edit and not an optional one.

10. **The GitHub plan mirrors `issue-update-body`, not `issue-label-add`.** A close is a `PATCH` of
    the issue resource. `issue-label-add` (`:2856-2871`) is a `POST` to the `issues/{n}/labels`
    sub-resource and is the wrong model. The payload is fixed — the closed state together with the
    completed state reason — and carries **no** caller-supplied reason field: the feature only ever
    transitions issues it assessed as completed, and Forgejo has no state-reason concept at all, so a
    configurable reason would be a parameter with one legal value on one provider and none on the
    other.

11. **`tracker.externalDoneState` mirrors `tracker.externalStartedState` exactly, with `terminal`
    replacing `non-terminal` and `started`.** `src/shared/tracker-target.md:104-116` is the template:
    stable ID or exact accepted token, validated fresh in the same tracker context, display-name
    match never enough, one candidate proposable in a gated run for that run only,
    `{{SKILL:setup}}` the sole persister. Reusing the shape rather than inventing a second one keeps
    one mental model for both native transitions.

12. **No `mergeGate.*` key is added, and every bound is a fixed literal.** The operator chose
    "report, transition nothing" for the non-interactive case, so there is no mode to configure, and
    `src/tools/setup.md:413-414` — "The gate is safe without any of these keys" — stays true. The
    assessment's bounds are therefore stated as literals in prose, the way the 30-second grace period
    is (`src/shared/issue-lifecycle.md:90-91`, "deliberately not configurable"): at most one
    `issue-read` and one `issue-sub-issues-read` per receipted issue, no recursion past the receipted
    issue's direct children, exactly one `pr-read` for the whole run, and at most twenty stated
    criteria per issue — beyond which that issue is `undetermined` rather than partially assessed.

13. **The next-steps table is not touched.** `src/shared/next-steps.md:102` already carries
    `merged but at least one linked issue is open or unobservable → {{SKILL:merge-gate}} <PR>`. A
    declined offer or an unavailable transition leaves the issue open, so that row still applies; a
    confirmed transition makes the issue terminal, so the `merged` row applies. Both existing rows
    stay correct, and the build-mirrored table in `docs/user-guide/tool-flow.md:96-98` — compared
    cell-by-cell by `build.mjs:602-624` — needs no change.

14. **Phase 5.5 is renumbered, and the observation record is replaced, not merely re-read.** A
    confirmed transition makes an issue terminal, and the existing steps 3 and 4 (in-progress label
    removal, container reconciliation) are gated on a _fresh terminal observation_. Appending the new
    work after them would strand a transitioned issue with its `effective-flow-issue-in-progress`
    label attached and its container entry open, so the new steps sit **between** observation and
    label cleanup. But step 2 (`:1816`) is the step that _records_ the outcome, and a re-read that
    merely lets the following steps see the real state leaves the recorded `open` in place for a
    linear reader. The new transition step therefore states explicitly that its fresh re-read
    **replaces** the step-2 record for that issue, which is what makes steps 5 and 6 fire without
    their own text changing.

## Affected files

| File                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/merge-gate.md`               | The in-run reasoning enumeration at `:73-79` gains the completion assessment; the forge preflight at `:858-885` gains the `issueClose` capability, its degradation bullet and the restructured observer-only sentence; Phase 5.5 restructured from five to seven steps with the new assessment, offer and transition steps and one new `ask` fence; the Phase-6 per-issue summary extended at `:1913-1917`; the merged-PR re-entry edge case at `:1942-1944` extended; the Rules entry at `:2286-2287` reworded per decision 6 |
| `src/shared/issue-lifecycle.md`         | `### Post-merge observation` extended with the completion assessment, the verdict vocabulary, the criteria definition, the offered transition and its eligibility gate, and the record-replacement rule; the carve-out sentence beside the retained `:100`; the evidence order at `:110-111` reworded so item 5 names the offer                                                                                                                                                                                                |
| `src/shared/tracker-target.md`          | `:100-102` reworded so the two phase-specific lifecycle capabilities are also required for the post-merge transition; a `tracker.externalDoneState` resolution block mirroring `:104-116`                                                                                                                                                                                                                                                                                                                                      |
| `src/shared/config-migration.md`        | A `tracker.externalDoneState` encoding bullet after the `externalStartedState` bullet at `:67-73`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/pr-review-comments.md`      | One new `###` operation section for `issue-close`, in the shape of `### Merge a pull request` (`:257`). This include is the gate's reachable path to per-operation documentation — `merge-gate.md` does not include `issue-tracker` and reaches its helper contract only through this fragment's `:47-48` — which is why an issue operation is documented in a PR-review include                                                                                                                                               |
| `src/shared/issue-tracker.md`           | The categorical operation list at `:256-262` extended by issue state transition                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/tools/setup.md`                    | The tracker schema line at `:68`; a fourth external follow-up item for `externalDoneState` after `:332-352`, plus the carry-over sentence at `:354-356`; the advanced-block tracker item at `:387`; the Step 8 external-tracker bullet at `:820-823`                                                                                                                                                                                                                                                                           |
| `src/scripts/remote-tracker-core.mjs`   | New `issue-close` mutation: `MUTATIONS`, `REMOTE_OPERATIONS`, a **named** `CAPABILITY_BY_OPERATION` entry per the comment at `:93-96`, a GitHub plan mirroring `issue-update-body`, a Forgejo plan mirroring `issue-comment-update` (`:3223-3236`), `issueClose: true` in the GitHub capability literals (`:3805-3822`) and `issueClose: teaApiTransport` in the Forgejo ones (`:3919-3922`)                                                                                                                                   |
| `docs/user-guide/configuration.md`      | `externalDoneState` row in the `tracker` table (`:441-447`), its prose paragraph after `:455-467`, and the full-config example note at `:177-181`                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/remote-tracker.md`     | The `## Merge gate operations` table (`:394-401`) grows by one row and its "six additional forge operations" lead-in (`:388-392`) is corrected; per-provider support prose extended; the merge-gate paragraph at `:644-655` describes the offer and carries the carve-out beside `:645`                                                                                                                                                                                                                                        |
| `docs/user-guide/tools-deliver.md`      | Gate step 5 (`:192-196`); the observer-only sentence at `:201-204`, which today says that path "repeats **only** post-merge issue observation and eligible reconciliation"; "What it never does" (`:215`); the post-merge closure-guidance bullet at `:593-606`                                                                                                                                                                                                                                                                |
| `docs/user-guide/troubleshooting.md`    | The Forgejo capability paragraph at `:33-37` — `issue-close` joins the operations a `tea` without `--include` reports unsupported, per decision 9                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/configuration.md` | No change — verified: it carries no tracker key table and `externalStartedState` does not appear in it                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/workflow-contracts.test.mjs`      | New prose pins for the literal sentences named in the acceptance criteria; the existing Phase-5.5 pins opening at `:5553` and `:5596` survive unchanged, because `section()` stops at the next `### ` and the insertions stay inside the phase                                                                                                                                                                                                                                                                                 |
| `test/remote-tracker.test.mjs`          | Dry-run/apply, provider-plan and capability-refusal tests for `issue-close`. The positional `teaProbeResults` fixture at `:87-116` is **not** touched — decision 9 adds no probe                                                                                                                                                                                                                                                                                                                                               |

## Implementation details

### Approach

1. **Add the helper operation first**, so the prose can name a proven operation rather than a planned
   one.

   `issue-close` — a mutation. Register it in `MUTATIONS`, in `REMOTE_OPERATIONS`, and — this is
   load-bearing, see the comment at `src/scripts/remote-tracker-core.mjs:93-96` — with a **named**
   `CAPABILITY_BY_OPERATION` entry `issueClose`, because the operation gate tests
   `capabilities[key] === false` and an operation missing from that table is waved through unprobed.
   Payload: the issue number only; the state and its reason are fixed literals in the plan builder
   per decision 10. GitHub plan: a `PATCH` of the issue resource with a JSON stdin body, mirroring
   `issue-update-body`; capability `issueClose: true` among the GitHub literals at `:3805-3822`.
   Forgejo plan: `tea api … --method PATCH --data @-` against the issue resource, mirroring
   `issue-comment-update` at `:3223-3236`; capability `issueClose: teaApiTransport` beside the
   existing derivation at `:3919`. No `probeTeaHelp` entry is added, so neither the `Promise.all` at
   `:3889-3914`, nor the destructuring ending at `:3888`, nor the positional fixture at
   `test/remote-tracker.test.mjs:87-116` is edited.

2. **Widen the in-run reasoning enumeration** at `src/tools/merge-gate.md:73-79` to name the
   Phase-5.5 completion assessment as a fifth member, with the same justification the other four
   carry: it is a guard that authorizes a write, it reads state only this run holds, and a summarized
   sub-agent answer is not evidence a write may rest on.

3. **Add the `issueClose` capability to the forge preflight** at `:858-885`: the capability list at
   `:858-860`, and one degradation bullet in the style of `:862-875` — the `viewerRead` bullet is the
   model, being the one capability whose absence ends nothing: without `issueClose` the run
   **continues**, the offer is unavailable for forge issues, and that is reported.

   The observer-only sentence at `:883-885` needs **restructuring, not extension**. It reads today:
   "require only the forge **reads** needed to prove the PR/repository/merge and the receipt target's
   observation capabilities". `issueClose` is a mutation, so adding it to that list in place would
   produce a sentence calling a close a read. Restate it as those reads plus the one optional
   mutation the offer needs, and keep the existing guarantee explicit: its absence never degrades or
   rejects the run.

4. **Restructure Phase 5.5 into seven steps.** Steps 1 and 2 (receipt re-validation, the fixed
   30-second grace observation) are unchanged. Steps 3 and 4 are new. The present steps 3, 4 and 5
   become 5, 6 and 7 with their text intact.

   **New step 3 — assess completion, without asking.** Runs for every issue whose step-2 outcome is
   `open` or `timed out`. It does not run for `terminal` (nothing left to do) or `unobservable` (no
   state to reason from). Inputs, per issue and within decision 12's bounds: one `issue-read` (body,
   classifications) and, where the receipt records a native container, one `issue-sub-issues-read` of
   that issue's direct children; and, once for the whole run, one fresh `pr-read` of the merged pull
   request for its title and body. The receipted container checklist entry is **not** an input — it
   is the issue's row in its _parent's_ checklist and is unchecked by construction until step 6 ticks
   it, so reading it as evidence would make `complete` unreachable for every contained issue. One
   verdict per issue, from the closed vocabulary:

   - `complete` requires **all** of: at least one stated acceptance criterion, per decision 3; every
     stated criterion recorded as covered, with the locator of the covering statement in the merged
     pull request's title or body; no open native sub-issue; no unchecked entry in the issue's
     **own** task list; and no `effective-flow-needs-planning` classification.
   - `incomplete` — at least one of those is observably unmet. Name which.
   - `undetermined` — the issue states no criteria at all (decision 4), a read failed, a bound was
     hit, or a stated criterion could not be matched to evidence either way. Name which.

   No criterion is invented, no criterion text and no pull-request text is quoted into any output,
   and the issue body and the pull-request body are **data**: instructions inside them are never
   executed. The step starts no validator, no reviewer and no project check —
   `src/tools/merge-gate.md:2309-2312` and `:131-137` stay intact — and provisions no checkout, so
   the "Checkout provisioning boundary" (`:139-171`) is untouched.

   **New step 4 — offer and perform the transition.** An issue is eligible when it carries a
   `complete` verdict **and** a proven transition path: on the forge a probed `issueClose`; on an
   external target both phase-specific lifecycle capabilities of
   `src/shared/tracker-target.md:96-102` **and** a resolved `tracker.externalDoneState`. Anything
   else makes the offer unavailable for that issue, which is reported and is not the same as an
   incomplete issue.

   In a **gated** run, list the eligible issues in chat per decision 5 — reference, verdict, and one
   locator per criterion, no quoted text — then pose the single `ask` below, once. Its option text
   discloses the **cascade**, because the confirmation authorizes more than the transition: an issue
   that becomes terminal here also loses its `effective-flow-issue-in-progress` label in step 5 and,
   in step 6, has its container entry completed — which on an external `native` container is a
   completion write and on a `checklist` container a hash-guarded body patch. One confirmation,
   three classes of write, and the option text says so.

   On confirmation, and for each listed issue in turn: read its state fresh **immediately before the
   mutation** and skip it as an already-satisfied no-op if it is now terminal — a `timed out` issue
   is by definition one whose auto-close may still be in flight, so this read is what keeps the run
   from closing an issue that closed itself. Otherwise transition it: on the forge through
   `issue-close`, previewing the dry run and then repeating with `--apply` per the mutation
   discipline the loaded PR-review-comment fragment carries; on an external target through the
   connection's transition operation to the resolved `externalDoneState`. Then re-read the issue once
   — a fresh read, not a second 30-second wait — and **replace that issue's step-2 outcome record**
   with what the re-read shows. A decline transitions nothing. A **non-interactive** run poses
   nothing, transitions nothing, and carries the recommendation into the summary; the source names
   `:1215-1217` as the shape it reuses.

   **Renumbered step 5** (in-progress label removal, forge only) and **step 6** (container
   reconciliation, both targets) fire on the replaced record without their text changing. Step 5
   remains forge-only; an external issue that became terminal reaches step 6 and not step 5, which
   the summary reflects rather than reporting a label removal that never applied.

   **Renumbered step 7** (closure guidance) gains one clause: where an issue is still nonterminal
   because the offer was declined, could not be posed, or was unavailable, the guidance names that
   reason instead of re-deriving the evidence order from scratch.

5. **Add the `ask` fence** with the new step 4, in the shape of the three existing fences
   (`src/tools/merge-gate.md:911`, `:1239`, `:1726`) and carrying every field
   `build-lib.mjs:1560-1604` requires:

   - `when:` — at least one linked issue is eligible per step 4, and the run is gated.
   - `header:` — `Issue done`, ten characters, inside the twelve-character cap (`build-lib.mjs:15`).
   - `question:` — "The linked issues listed above are fully implemented by this merged pull request.
     May this run set them to their terminal tracker state?" One line, fixed, carrying no per-run
     data.
   - option `Set to done` — "Transition every issue listed above to its terminal state, remove the
     effective-flow-issue-in-progress label from each forge issue, and complete each recorded
     container entry; read each criterion and its covering statement at the issue and pull-request
     URLs first, because this run quotes no issue or pull-request text".
   - option `Leave open` — "Transition nothing; every listed issue keeps its state, its in-progress
     label and its container entry, and the summary carries the recommended transition".

6. **Extend `src/shared/issue-lifecycle.md`.** `### Post-merge observation` gets the verdict
   vocabulary, the criteria definition, the assessment inputs and bounds, the offer, its eligibility
   gate, the record-replacement rule, and the carve-out sentence beside the retained `Do not
force-close an issue.` at `:100`. Item 5 of the evidence order at `:110-111` is reworded so it
   names the offer as what happens next rather than only naming the transition as what remains.

7. **Extend `src/shared/tracker-target.md`.** Reword `:100-102` so post-merge _observation_ still
   requires only a fresh native-state read, while the **offered transition** additionally requires
   the two phase-specific lifecycle capabilities — and state that a connection lacking them makes the
   offer unavailable without aborting, which is the one place this contract deviates from its own
   "abort before the first write" rule and must say why: the write in question is optional and comes
   after a merge that already succeeded. Then add the `externalDoneState` resolution block mirroring
   `:104-116`.

8. **Add `tracker.externalDoneState` to the configuration surfaces**: an encoding bullet in
   `src/shared/config-migration.md` after `:73`; the schema line, a fourth external follow-up item,
   the carry-over sentence, the advanced-block item and the Step 8 report bullet in
   `src/tools/setup.md`; a table row plus prose in `docs/user-guide/configuration.md`. The key is
   nullable and unset by default, so it gets **no** row in the "Safe defaults at a glance" table
   (`docs/user-guide/configuration.md:498-522`), exactly as `externalStartedState` gets none.

9. **Amend the rule, edge-case and documentation sites** per decision 6 and the affected-files table,
   including the merged-PR re-entry allowlist at `src/tools/merge-gate.md:1942-1944` — that list is
   an allowlist, so an action absent from it is out of scope by construction — the matching
   observer-only sentence at `docs/user-guide/tools-deliver.md:201-204`, and the Forgejo capability
   paragraph at `docs/user-guide/troubleshooting.md:33-37`.

10. **Extend the Phase 6 summary** at `src/tools/merge-gate.md:1913-1917`, under the same no-body
    discipline the summary already states at `:1881-1882`. Per issue it gains: the completion verdict
    by name; the criterion locators that produced it, never their text; whether the offer was posed;
    how it was answered; and the transition result — including, for a non-interactive run, the
    recommended transition that was reported instead of posed, and, for an unavailable transition,
    which capability or configuration value was missing on which connection.

11. **Write the tests, then run the full CI sequence** — `pnpm agent:check`, `pnpm test`,
    `node build.mjs`, `pnpm test:distribution` (`AGENTS.md:26`).

### Edge cases

- **An issue states no acceptance criteria.** `undetermined`, no offer, today's closure guidance
  (decision 4).
- **The offer is confirmed but a transition fails** (auth, a capability that probed true and then
  refused, a tracker outage). The merge stands. The run **continues to the remaining listed issues**
  — one failure does not abandon the others — and each failure names its exact connection blocker.
  The failed issue keeps its `effective-flow-issue-in-progress` label and its container entry.
  Nothing is retried blindly and no fallback write goes to a different target
  (`src/tools/merge-gate.md:1818-1819`).
- **A `timed out` issue closes itself between the assessment and the mutation.** The fresh
  pre-mutation state read finds it terminal and skips the mutation as a no-op. This is the reason
  that read exists.
- **The transition succeeds but step 6's container completion fails.** Its capability is proven
  separately from the transition capability, so this is reachable. The issue stays terminal — it is
  not reverted — the container entry stays open, and the summary reports the partial state and the
  observer-only re-entry that reconciles it. A re-entry finds the issue already terminal, skips the
  assessment and the question entirely, and retries only the reconciliation.
- **Several issues, mixed verdicts.** Only the eligible ones are listed in the offer. The others take
  the ordinary closure guidance. One question covers the listed set; there is no per-issue question.
- **An issue is already terminal when step 3 would run.** It is skipped — the assessment runs only on
  `open` and `timed out`.
- **An issue states more than twenty criteria.** `undetermined` rather than partially assessed
  (decision 12).
- **The issue's own task list is not a completion signal by itself.** An unchecked entry blocks
  `complete`; a fully checked list does not by itself produce `complete`, because the other
  dimensions still apply.
- **Observer-only re-entry on an already-merged pull request.** The assessment and the offer run
  there too — that is the intended recovery path for a run that could not pose the question — which
  is why both the re-entry allowlist and the observer-only capability sentence have to name them.
- **`tracker.externalDoneState` is unset.** The gated single-candidate proposal applies, for this run
  only; zero or multiple candidates make the transition unavailable and the summary names the
  candidates. `{{SKILL:setup}}` stays the only writer.
- **The receipt is missing, invalid, or the target mismatches.** Unchanged behaviour: no tracker
  access at all, so no assessment and no offer.

## Acceptance criteria

Each prose criterion names the literal sentence the source will carry, so the pin matches a string
rather than a meaning — the form every existing pin in `test/workflow-contracts.test.mjs` uses.

- [ ] `node build.mjs` succeeds and the three routers stamp one identical version — no include, ref,
      next-steps, ask-fence, runtime-script or ownership guard fires.
- [ ] `pnpm agent:check`, `pnpm test` and `pnpm test:distribution` all pass.
- [ ] A test slicing `### Phase 5.5:` matches all of: `complete`, `incomplete`, `undetermined` as the
      named verdict values; "This assessment is not gated: it runs without asking"; "The offer is
      posed only in a gated run"; "poses nothing, transitions nothing"; and "replaces that issue's
      recorded observation outcome".
- [ ] A test matches "the question's own text is fixed and carries no per-run data" and "quotes no
      issue or pull-request text" inside Phase 5.5, and matches the `ask` fence's `Set to done`
      description for `effective-flow-issue-in-progress` and "container entry", so both the no-quote
      discipline and the cascade disclosure are pinned.
- [ ] A test matches `Acceptance criteria`, `Akzeptanzkriterien` and `Done criteria` as the closed
      heading set, and "states no acceptance criteria" together with `undetermined`, so decisions 3
      and 4 are pinned.
- [ ] A test matches `issueClose` in the preflight capability list of `src/tools/merge-gate.md`, its
      degradation bullet, and the restructured observer-only sentence — which must **not** describe
      `issueClose` as a read.
- [ ] A test matches the extended Phase-6 summary on "the completion verdict" and "criterion
      locators", and the extended merged-PR re-entry allowlist on "the completion assessment".
- [ ] The existing Phase-5.5 assertions of `test/workflow-contracts.test.mjs`, opening at `:5553`
      and `:5596` — the latter carrying the `Never force-close an issue` pin at `:5615` — pass
      **unmodified**.
- [ ] `Do not force-close an issue.` still matches in `src/shared/issue-lifecycle.md`, and the
      adjacent sentence "An operator-confirmed transition after a `complete` assessment verdict is
      not a forced close and is the one authorized path." is pinned. The same pair is pinned for
      `src/tools/merge-gate.md`'s Phase-5.5 wording.
- [ ] `Observe but never force issue closure` no longer appears in `src/tools/merge-gate.md`; "Never
      close an issue on this gate's own authority" is pinned in its place, and no test asserts the
      old string.
- [ ] `src/tools/merge-gate.md:73-79`'s enumeration names the completion assessment, pinned by a
      test.
- [ ] `executeOperation('issue-close', …)` without `apply` returns `dryRun: true`, a redacted
      `data.command`, and performs zero runner calls; with `apply: true` it performs exactly one, on
      both the `github` and `forgejo` fixtures. A probe reporting `issueClose: false` yields
      `error.code === 'UNSUPPORTED_CAPABILITY'` and zero runner calls — which is also what proves the
      `CAPABILITY_BY_OPERATION` entry exists, since that map is module-private and not importable.
- [ ] `buildCommandPlan('issue-close', …)` produces a `PATCH` of the issue resource on both
      providers, carries the fixed closed state and completed reason on GitHub, carries no reason
      field on Forgejo, and accepts no caller-supplied reason on either.
- [ ] The `teaProbeResults` fixture in `test/remote-tracker.test.mjs` is unchanged — decision 9 adds
      no probe. Checked on the fixture, not the file: the file legitimately gains the `issue-close`
      tests, so `git diff --exit-code` on it can never pass. Verify with
      `git diff -U0 -- test/remote-tracker.test.mjs` and confirm no hunk touches the
      `teaProbeResults` body.
- [ ] `tracker.externalDoneState` appears in `src/shared/config-migration.md`, `src/tools/setup.md`
      (schema line, external follow-up, carry-over sentence, advanced block, Step 8 report),
      `src/shared/tracker-target.md` and `docs/user-guide/configuration.md`, and a test mirrors the
      existing `externalStartedState` test at `test/workflow-contracts.test.mjs:5618` for the
      terminal variant.
- [ ] `git diff --exit-code -- src/shared/next-steps.md docs/user-guide/tool-flow.md` is clean.
- [ ] The three `mergeGate.*` key tables still have nine data rows each:
      `src/shared/config-migration.md:98-108`, `src/tools/setup.md:432-442`, and
      `docs/user-guide/configuration.md:249-259`. No `mergeGate.*` key is added.
- [ ] `docs/user-guide/remote-tracker.md`'s merge-gate operation table has seven data rows and its
      lead-in no longer says "six"; `docs/user-guide/troubleshooting.md` lists `issue-close` among
      the operations a `tea` without `--include` reports unsupported.

## Validation plan

- `pnpm agent:check` — formatting, CI-style, no writes.
- `pnpm test` — the `node:test` unit suite, including the new `test/remote-tracker.test.mjs` and
  `test/workflow-contracts.test.mjs` cases.
- `node build.mjs` — the build guards: eager/lazy include resolution and overlap, `{{SKILL:}}` and
  `{{AGENT:}}` refs, the next-steps contract plus its `docs/user-guide/tool-flow.md` mirror
  (`build.mjs:602-624`), the runtime-script shipping and dependency-free import guards, the ask-fence
  parse, and the version-drift guard across the three targets.
- `pnpm test:distribution` — the isolated build/archive/delivery smoke suite, which proves the edited
  runtime script ships byte-identically into all three targets.
- `git diff --exit-code` on `src/shared/next-steps.md`, `docs/user-guide/tool-flow.md` and
  `test/remote-tracker.test.mjs` for the untouched-surface criteria, plus row-count greps on the
  three `mergeGate.*` tables.
- **Manual**, and stated as manual: a read-through of the rendered
  `dist/portable/effective-flow/tools/merge-gate.md` to confirm the new `ask` fence rendered into
  both the Claude block form and the Codex free-text form, and that the renumbered Phase 5.5 reads as
  one coherent sequence.
- No live tracker call is made during validation; `issue-close` is exercised through the existing
  `fakeRunner` stub and `skipProbe`, as every other operation is.

## Assumptions and open points

- **Assumed:** Forgejo's issue resource accepts a `PATCH` with the closed state through `tea api`.
  Decision 9 rests on this, and `issue-comment-update` (`remote-tracker-core.mjs:3223-3236`) proves
  the transport but not this particular resource. If it does not hold, the Forgejo branch refuses
  with `UNSUPPORTED_CAPABILITY` in the switch — the pattern `pr-checks-wait` already uses at
  `:3446-3451` — and the offer is unavailable on Forgejo without affecting anything else.
- **Assumed:** GitHub's completed state reason is the right terminal semantics for "done". The
  alternative is the not-planned reason, which this feature never selects — it only ever transitions
  issues it assessed as _completed_, which is why decision 10 fixes the value instead of exposing it.
- Not relevant: component structure, state management, styling, accessibility. This change is
  Markdown contract prose plus one operation in a dependency-free Node.js runtime script.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    2 |
| Security        |        1 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         0 |    1 |
| Testability     |        1 |         2 |    2 |
| Scope           |        1 |         1 |    1 |
| Maintainability |        0 |         1 |    2 |

Two rounds ran. Round 1 was the plan review of `{{SKILL:plan}}`; round 2 the deep interactive review
of `plan-review`. Both obtained their judgment through `effective-delivery`. Every finding of both
rounds is incorporated; the numbering is each round's own.

### Findings — round 1 (plan review)

- **B1, Architecture, Critical — the in-run reasoning carve-out is a closed enumeration and the
  assessment was not in it.** The draft argued _from_ `src/tools/merge-gate.md:73-79` without
  proposing to edit it. **Incorporated:** decision 1 requires the enumeration to gain a fifth member
  with its own justification and a prose pin.
- **B2, Error cases, Critical — one confirmation authorizes three classes of tracker write, and the
  offer disclosed one.** **Incorporated:** the `ask` option text spells out the label removal and the
  container completion (approach step 5), pinned by an acceptance criterion; the partial state left
  by a container completion that fails after a successful transition is an edge case.
- **B3, Testability, Critical — an acceptance criterion was false against the source.** The draft
  pinned `Never force-close an issue` in `src/shared/issue-lifecycle.md`, which reads `Do not
force-close an issue.` **Incorporated:** decision 6 and the criteria carry each site's verified
  wording.
- **B4, Maintainability, Important — keeping one of the four sentences verbatim was sophistry.**
  `src/tools/merge-gate.md:2286-2287` sits in `## Rules` and reads as a scope statement.
  **Incorporated:** it is reworded to a named replacement string, and the old string is pinned by
  nothing.
- **B5, Architecture, Important — the "third named shape" already existed** at `:1215-1217`.
  **Incorporated:** decision 8 reuses and cites it.
- **B6, Testability, Important — the restructure was right in ordering but incomplete in
  mechanism.** **Incorporated:** decision 14 and approach step 4 require the re-read to **replace**
  the recorded outcome, and step 5's forge-only scope is stated.
- **B7, Testability, Important — only one behavioural change had a prose pin.** **Incorporated:**
  the criteria now pin the cascade disclosure, the capability gate, the summary, the re-entry
  allowlist and the widened enumeration.
- **A1, Architecture, Note — the capability gate had no probe site.** **Incorporated** as decision 9
  and approach step 3.
- **A2, Scope, Important — `pr-files-read` was the largest cost and bought the weakest evidence.**
  The gate already retains the pull request's fresh body (`src/tools/merge-gate.md:845-847`), and a
  changed file path proves a file was touched, never that a criterion is met. **Incorporated as a
  removal**, with the operator's explicit agreement after the trade-off was put to them: the plan
  adds one helper operation instead of two.
- **A5, Security, Note — the verdict derives from attacker-influenceable text.** **Incorporated**
  into decision 5, and reinforced in round 2 by C1 and I9.
- **A7, Maintainability, Note — the Forgejo probe append was under-specified.** **Superseded:**
  decision 9 adds no probe at all, so the hazard lapses. The companion finding A3, about conflating
  GitHub and Forgejo pagination, lapsed with the removal of `pr-files-read`.
- **B8, Testability, Note — three criteria were not measurable, one vacuously so.** `git status`
  shows no change under `dist/` because `dist/` is gitignored. **Incorporated.**
- **A4/A6/A8, Note — three smaller gaps.** The receipted checklist entry as an assessment input;
  two missing documentation sites; the Forgejo reason asymmetry and multi-issue partial failure. All
  **incorporated**; the reason asymmetry is resolved by decision 10 removing the field.

### Findings — round 2 (deep interactive plan review)

- **C1, Security, Critical — the offer's presentation contradicted the file it lives in.** Decision 3
  of the draft required per-criterion evidence in the question. That is mechanically impossible in an
  `ask` fence (`build-lib.mjs:1560-1604` parses static literals) and is forbidden three hundred lines
  away in the same file on the identical threat model: `src/tools/merge-gate.md:1636-1638` — "the
  question's own text is fixed and carries no per-round data… an excerpt would carry
  attacker-influenceable text into the very prompt that exists to resist it." **Decided:** reuse that
  rule verbatim — fixed question, chat listing of evidence **locators** immediately before it, no
  quoted text anywhere. Now decision 5, and it binds the Phase-6 summary too (finding I8).
- **C2, Scope, Critical — the feature's one new judgment was undefined.** "An acceptance criterion
  the issue body states" had no definition; the permissive reading derives criteria from prose, which
  `src/shared/issue-lifecycle.md:113` forbids. **Decided:** a closed heading set, list items only.
  Now decision 3.
- **C3, Architecture, Critical — the helper's provider implementation was undecided, and "probe both
  providers" was factually wrong.** GitHub capabilities are hardcoded literals
  (`remote-tracker-core.mjs:3805-3822`); Forgejo already derives `teaApiTransport` at `:3919`.
  **Decided:** `tea api` PATCH on Forgejo reusing that transport, a constant on GitHub, and a plan
  mirroring `issue-update-body` rather than `issue-label-add`. Now decisions 9 and 10 — which also
  retires the positional-fixture hazard entirely.
- **I9, Security, Important — a structural-only `complete` was the cheapest input and the least
  defended.** Decision 5's mitigation is vacuous where there are no criteria. **Decided:** an issue
  that states no criteria is `undetermined`, never `complete`. Now decision 4.
- **I1, Architecture, Important — `pr-files-read` residue.** Three sites still said "two new
  capabilities". **Incorporated.**
- **I2, Architecture, Important — naming a mutation inside a sentence about reads.**
  `src/tools/merge-gate.md:883-885` is about forge _reads_. **Incorporated:** approach step 3
  restructures it rather than extending the list.
- **I3, Architecture, Important — external eligibility dropped two of its three preconditions.**
  `issueClose` is probed only on the forge. **Incorporated:** approach step 4 states eligibility as a
  proven transition _path_, per target.
- **I4, Testability, Important — a self-contradictory criterion with a false number.**
  `git diff --exit-code` cannot be scoped to a table and all three named files are edited by this
  plan; and `docs/user-guide/configuration.md:249-259` has nine rows, not eight. **Incorporated:**
  three row-count greps at nine.
- **I5, Testability, Important — the new prose criteria named no literal source strings**, which is
  the B3 failure mode recurring. **Incorporated:** every prose criterion now quotes the sentence its
  pin will match.
- **I6, Scope, Important — `undetermined` named a bound that did not exist.** **Incorporated** as
  decision 12's four literals.
- **I7, Testability, Important — the `ask` fence's `question:` line was never written**, though
  `build-lib.mjs:1574-1575` requires it. **Incorporated** in approach step 5.
- **I8, Security, Important — the summary extension reversed its own no-body discipline.**
  `src/tools/merge-gate.md:1881-1882` states the summary reads "no body, deliberately".
  **Incorporated:** approach step 10 carries locators, never text.
- **N1–N6, Note — six smaller defects.** A dangling "decision 12" reference from renumbering; an
  unwritable criterion asserting a module-private map (`CAPABILITY_BY_OPERATION` is not exported, so
  the behavioural refusal test is what proves the entry); the two accepted reason values never named
  — resolved by decision 10 removing the field; the `timed out` → transition race, now a fresh
  pre-mutation read and an edge case; the summary "row" that is a prose bullet with no named
  strings; and the placement of an issue operation in a PR-review include, whose reachability is now
  stated in the affected-files table. All **incorporated**.

## Open points

- No open points.

## Test results

**Date:** 2026-08-27
**Run:** `effective-flow build`, executed on `effective-flow/build/merge-gate-issue-completion-offer`
from `origin/develop` at `12f8aa7`.

| Check                    | Result                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm agent:check`       | pass — `oxfmt --check` clean on 308 files                                                                                                       |
| `pnpm test`              | pass — 761 / 761, 0 failed (baseline before this run: 745)                                                                                      |
| `node build.mjs`         | pass — 20 tools (+8 internal), 16 agents, three targets; no include, ref, next-steps-mirror, ask-fence, runtime-script or ownership guard fired |
| `pnpm test:distribution` | pass — offline archive/delivery smoke checks                                                                                                    |

Fifteen tests were added: eleven prose-contract pins in `test/workflow-contracts.test.mjs` and four
behaviour tests in `test/remote-tracker.test.mjs`, both as pure appends. Non-vacuity was proven by
mutating one pinned literal per contract test, which failed exactly the eleven new tests and no
existing one. `effective-flow-e2e-tester` was deliberately not started: this repository has no runtime
user flow, only a source-to-dist build, and the distribution path is covered by
`pnpm test:distribution`.

All eighteen acceptance criteria above are met, verified independently by
`effective-flow-code-validator` in mode `full` rather than by self-assessment.

## Review findings

**Date:** 2026-08-27
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    22 |
| Open / Not implemented |     0 |

Both reviewers were asked for **all** severities, so this is a complete audit trail rather than the
`effective-flow review` default of Critical plus Important. They returned 19 findings — **0 Critical,
8 Important, 11 Note**; complexity 17 Low, 2 Medium, 0 High. The final `effective-flow-code-validator`
pass then found three further prose defects. All 22 were fixed in two bounded correction rounds; no
finding was deferred, so no external review report was written.

Two findings are worth recording because they were defects in **this plan**, not in the
implementation of it, and both review rounds of the planning phase missed them:

- **F1 (Important).** `complete` requires "no open native sub-issue", but approach step 4 gated the
  only read that could observe them on "where the receipt records a native container". A recorded
  container is the issue's _parent_, not its children. An issue that is itself a native parent with
  `container: null` therefore never received the read, the condition was vacuously satisfied, and
  such an issue could have been offered for closure with its children still open — the exact
  false positive the verdict vocabulary exists to prevent. The implemented contract gates the read on
  the fact it must establish: whether the resolved target supports a native sub-issue relation at
  all. A target that cannot perform the read yields `undetermined`, never a satisfied condition.
- **F14 (Important).** Approach step 1 said to mirror `issue-comment-update` for the Forgejo plan.
  That operation carries no `--include`, and `tea api` exits 0 on every 4xx and 5xx, so a forge that
  refused the close returned `ok: true` with its error object as the payload. Reachable through a
  token without `write:issue`, an archived or locked issue, `429`, and Gitea's `412
ErrDependenciesLeft` — that last one precisely this feature's target population. The implemented
  operation mirrors `pr-merge` instead, which carries `--include` for exactly this reason, so a
  refusal now surfaces as `COMMAND_FAILED` with its HTTP status. Verified empirically, and pinned by
  a test that fails if the flag is removed again.

The remaining twenty were prose precision, documentation accuracy, test-quality and error-path
findings, each fixed at the site the reviewer named.

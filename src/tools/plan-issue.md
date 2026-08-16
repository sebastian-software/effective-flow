---
description: "Completes issue planning on the resolved tracker target (GitHub/Forgejo or an external tool) with the same quality baseline and optional deep review as {{SKILL:plan}}, persists the parent plan idempotently in one marked comment, may create an exactly approved set of native child issues, and releases only issues without implementation-blocking open points. Generates no code and no plan file."
catalogHint: "Completes the planning for issues that still need clarification."
---

# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

`{{SKILL:apply-issues}}` skips issues whose information is insufficient for autonomous
implementation and marks them with `effective-flow-needs-planning`. This skill plans each selected
issue independently using the clarification, gap-analysis, validation, and internal-review
baseline of `{{SKILL:plan}}`. It persists that baseline and an optional deep interactive review in
one marked parent comment, may create an exactly approved set of native child issues, and removes
`effective-flow-needs-planning` only when no implementation-blocking open point remains.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or code-review
  phase. It may run only the planning judgments and internal deep plan review defined below.
- It creates **no** `<plan.dir>/` file. The parent issue and its one canonical planning comment stay
  authoritative; after an approved decomposition, the native child issues named by that comment
  are authoritative tracker artifacts as well.
- It does not implement the issue itself — the implementation is subsequently handled by `{{SKILL:apply-issues}}`.
- Tracker writes are limited to creating the first canonical planning comment, updating that exact
  comment by its tracker ID, changing the issue's planning-readiness labels, and — only after the
  decomposition gate below — creating an approved issue atomically as a native child of the active
  parent. It never calls generic `issue-create`, creates a standalone or sibling issue, or substitutes
  a checklist for a missing native relation. A failed or unsupported update must stop before any
  replacement comment is created.

```include
language-rules
```

```include
task-tracking
```

```include
delegation-mandate
```

```lazy-include
completion-protocol
when: an internal sub-agent's result is returned
```

```lazy-include
runtime-state-safety
when: a remote tracker access is about to write its local migration marker
```

```lazy-include
effective-flow-dir-migration
when: a remote tracker access is about to perform its first runtime-state mutation
```

```lazy-include
next-steps
when: the run reaches its completion report
```

```include
config-migration
```

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Recommended skills

- `codebase-improvement`

## Tracker integration

This skill is **inherently tracker-bound**: it always works against the resolved tracker target, and the local/remote switch is **not** evaluated. Resolve the target per "Tracker target" in the following building block. On the forge target it uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases; on an external target the connection, capability, and write rules of the loaded `tracker-target` contract apply, including its fail-closed abort before the first write.

```include
issue-tracker
```

```lazy-include
tracker-target
when: the resolved tracker target is `external`
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
```

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Resolve
`language.forge`, but preserve the clear language of an existing planning comment when updating
it. Begin every Effective Flow comment with the stable marker
`<!-- effective-flow-plan-issues -->`. The English structure is shown below. The complete German
form uses `Planung abgeschlossen`, `Empfohlener Workflow`, `Anforderung`,
`Akzeptanzkriterien`, `Betroffene Bereiche/Dateien`, `Randfälle`, and `Annahmen`. Workflow
values, paths, checklist syntax, and the HTML marker remain stable.

```markdown
<!-- effective-flow-plan-issues -->
## Completed planning

**Recommended workflow:** Feature / Bugfix / Refactoring / Documentation

### Requirement
[refined target behavior with rationale]

### Acceptance criteria
- [ ] [measurable criterion]

### Affected areas/files
- `path/file` — [planned change]

### Edge cases
- [Edge case and expected behavior]

### Assumptions
- [deliberately documented remaining point]

### Proposed decomposition

[the complete canonical v2 section returned by `decomposition-records-build`, inserted verbatim]

### Plan review

**Result:** Approved / Revision required

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Findings

- No findings. / [finding, severity, and incorporated adjustment or remaining decision]

### Open points

- No open points. / [implementation-blocking decision and re-entry note]

```

The complete German form additionally uses `Plan-Review`, `Ergebnis`, `Freigegeben`,
`Überarbeitung nötig`, `Zusammenfassung`, `Befunde`, `Offene Punkte`, and
`Keine offenen Punkte.`. Preserve one complete language throughout the comment. An older comment
without review/open-point sections remains readable; the next baseline update adds both sections.
The `Proposed decomposition` section is optional and is omitted when no split is proposed. Its
versioned boundaries, safely encoded full records, and exact visible child rendering are stable
machine data. Build the complete section through `decomposition-records-build`, supplying
artifact language, target, resolved target binding, parent, and records; insert only its returned
section verbatim. Parse it again through `decomposition-records-parse`; never compose or interpret
its marker data ad hoc. `key` is
a lowercase parent-scoped slot key matching `[a-z0-9][a-z0-9._-]{0,79}`, `status` is `proposed`,
`approved`, `created`, `missing`, or `declined`, and `issue` is a positive normalized child reference
only for `created`. Forge identities bind to the exact resolved host/repository; external IDs stay
exact. `workflow` is exactly one supported workflow value and `draftHash` binds the approved key,
title, workflow, and body. The parser recomputes that hash and the complete visible rendering, so a
changed persisted title or body fails closed. Keys and created issue identities are unique within
the parent comment. Once persisted, a key is never derived again from an edited title or body and
is never reassigned to another child slot. Every English child body carries exactly one matching
`**Recommended workflow:** <value>` field; a German body uses
`**Empfohlener Workflow:** <value>` instead. The stable values remain `Feature`, `Bugfix`,
`Refactoring`, and `Documentation` in either language.

## Workflow

### Phase 1: Tracker setup & collection

1. Resolve the tracker target according to "Tracker target". On the forge target, determine the host and CLI and check availability/authentication according to "Remote helper contract"; precondition there is a Git repository with an `origin` remote. On an external target, establish exactly one connection per the loaded `tracker-target` contract and verify the capabilities this skill always needs — read issue and comments, list issues by classification, create a comment, update a comment by its ID, and add/remove a classification value. External decomposition additionally requires the complete native-container mechanism — native-child listing plus writable native sub-item completion — and atomic create-under-parent. Discover all three guarantees before proposing a split; when one is unavailable, keep ordinary comment-based planning available. If an always-required capability is missing: report clearly and abort without side effects.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning`. On the forge target, also query the old label `firmo-needs-planning` as equivalent (see "Label convention"); on an external target that legacy prefix is forge history and is neither queried nor written there.
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and do not widen the tracker-write boundary defined above.

```include
skill-discovery
```

The generic plan-quality and plan-review **judgment** comes from `codebase-improvement`; Effective
Flow owns the issue-comment artifact, the per-issue lifecycle, and the readiness gate. Apply the
same central delegation contract as `{{SKILL:plan}}`:

```include
central-reasoning-delegation
```

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation
   `issue-comments-read`) – and delegate the read-only examination of the relevant codebase to an
   internal analysis sub-agent; examine it inline only under the delegation mandate's triviality
   exception. Take maintainer clarifications from comments into account. Find the newest comment
   carrying `<!-- effective-flow-plan-issues -->` or the backward-compatible
   `<!-- firmo-plan-issues -->`; retain its normalized positive comment ID, exact body, and body
   hash. Treat it as the canonical update basis. Never create a second planning comment while such
   a comment exists.
2. Apply the clarification methodology from `{{SKILL:plan}}` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `{{SKILL:plan}}`.
5. Decide proactively whether the active issue is too broad for one coherent implementation or
   combines independently implementable outcomes. If so, prepare a concrete decomposition only
   when the forge helper proves its parent-aware operations or the external target proves the full
   native-container contract plus atomic create-under-parent. Give each
   child its own derived workflow and a complete body containing its refined requirement,
   measurable acceptance criteria, affected areas/files, edge cases, assumptions, and a plain
   parent reference. Give every body exactly one language-matching canonical workflow field:
   `**Recommended workflow:** <value>` in English or
   `**Empfohlener Workflow:** <value>` in German. Its stable value must equal the child's record
   workflow and must be a top-level field; blockquoted or fenced examples do not count. Require
   every Markdown fence in the child body to close before preview so the helper-appended final key
   marker remains readable. Do not copy credentials, secrets, session identifiers, or generation attribution;
   let the helper redact complete sensitive values and fail closed on a form it cannot transform
   safely. Labels pass through the same secret boundary and are rejected rather than redacted when
   sensitive. Do not attach `effective-flow-needs-planning`: every proposed child must already pass
   the implementation clarity gate. Allocate stable keys such as
   `child-01` once per parent and preserve existing keys on re-entry. If the target lacks any
   applicable guarantee, report decomposition as unavailable without creating a checklist or
   blocking the ordinary single-issue planning path.
6. If a central clarification is unanswered, normalize it as an implementation-blocking open point,
   persist the current artifact per Phase 4, retain `effective-flow-needs-planning`, report the
   re-entry `{{SKILL:plan-issue}} <issue>`, and continue with the next selected issue.

### Phase 3: Automatic quality baseline per issue

Before offering the deep interactive review, run the same quality baseline as the local planning
workflow for the active issue only:

1. Ask `codebase-improvement` for the generic gap judgment from `{{SKILL:plan}}` Phase 4:
   over-engineering, scope creep, hidden assumptions, missing or non-measurable acceptance
   criteria, edge cases, implementation risks, and evidence versus guessing. Use another declared
   domain owner only when the issue crosses that specialist boundary.
2. Incorporate directly resolvable gaps into the specification. Normalize the validation judgment
   from `{{SKILL:plan}}` Phase 5: concrete scope and file references, measurable acceptance
   criteria, sufficient verified context, explicit purpose/workflow, no-code compliance, and a
   fitting workflow recommendation.
3. Obtain the internal plan-review judgment from `codebase-improvement` exactly as in
   `{{SKILL:plan}}` Phase 6. Classify findings as Critical, Important, or Note across Architecture,
   Security, Data protection, Error cases, Testability, Scope, and Maintainability. Incorporate all
   critical findings and every directly resolvable important finding; record remaining
   decision-requiring findings as concrete open points.
4. Normalize the active comment to the canonical structure, including its language-matching plan
   review, scorecard, findings, and open-points section. `Approved` / `Freigegeben` requires no
   critical finding and no implementation-blocking open point; otherwise use
   `Revision required` / `Überarbeitung nötig`.
5. When a decomposition was prepared, include its exact child records, titles, workflows, and
   publishable bodies in the canonical comment before any approval or create operation. Review the
   proposed children as implementation units as well as reviewing the overall parent. Any child
   that is not self-contained or that still has a blocking open point blocks the decomposition.
   Pass the artifact language, target binding, active parent, and complete record set through
   `decomposition-records-build`, insert only its complete canonical section verbatim, and then pass
   the assembled comment through `planning-comment-build`. A schema error,
   duplicate key or created issue identity, invalid workflow, invalid status/issue combination,
   unsafe secret form, unclosed child fence, or body/record workflow mismatch blocks persistence.
   For GitHub, both operations enforce the 65,536-byte aggregate UTF-8 comment limit: the section
   must fit at build time and the complete stamped planning comment must fit before persistence. If
   it does not, report the structured size contributions and reduce the proposal/comment; never
   truncate a child body or bypass the canonical section. A smaller provider-specific rejection is
   likewise fail closed.
6. If critical findings or implementation-blocking open points remain, persist the baseline,
   retain the Needs-Planning label, do **not** offer the deep review yet, report re-entry via
   `{{SKILL:plan-issue}} <issue>`, and continue with the next selected issue.

### Phase 4: Persist, deep-review gate, and readiness

Complete this entire phase for the active issue before starting another issue:

1. Persist the self-contained baseline comment. If no planning comment exists, use
   `planning-comment-build` followed by `issue-comment` once and retain the returned comment ID and
   fresh body hash. If one exists, canonicalize the marker to
   `<!-- effective-flow-plan-issues -->`, preview `issue-comment-update` with the retained comment
   ID and `expectedBodyHash`, then apply that same payload. On `UNSUPPORTED_CAPABILITY`,
   `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`, stop processing this issue without
   adding a fallback comment or removing its label; report that a fresh
   `{{SKILL:plan-issue}} <issue>` run is required. On an external target the same sequence runs
   through the resolved connection's create-comment and update-comment-by-ID capabilities under
   the `tracker-target` write discipline: preview the payload, re-read the exact comment
   immediately before the update, compare it verbatim, and treat a missing capability, a missing or
   ambiguous comment, or a changed body as the same fail-closed stop.
2. If the freshly persisted baseline contains a proposed decomposition, re-read that exact comment
   and confirm its body hash. Parse the body through `decomposition-records-parse` and reject any
   noncanonical, duplicate, or invalid record before showing the parent and every exact child title,
   workflow, body, stable key, and bound draft hash. Ask whether to create **that exact set** as
   native children of this parent. An unanswered or rejected prompt creates nothing. On approval,
   rebuild the complete canonical section from the parsed records with exactly those `proposed`
   statuses changed to `approved` and unchanged title/body hashes, then perform the guarded comment
   update, re-read, and parse it again. On rejection, rebuild and guardedly persist the section with
   the proposal `declined`, then continue with the existing single-issue planning and deep-review path;
   do not interpret approval of another parent or an earlier draft as approval here.
3. After approval, re-read the parent and canonical comment. For an external target, revalidate the full native-container contract
   and atomic create-under-parent before the first mutation. Enforce child-count and parent-state
   constraints that these reads expose; treat hierarchy-depth, permission, parent-state, or limit
   rejections surfaced only by the provider as fail-closed create errors rather than claiming a
   local preflight. For each approved draft in order:
   - immediately before the create preview, call `issue-sub-issues-read` and replace the local
     reconciliation state with that fresh list. A child-level `decompositionKeyError`, more than one
     match for any canonical key, a wrong-parent marker, or another record/list integrity error
     fails closed for this parent. Match the draft's stable key: exactly one valid match is reused;
     zero permits a preview; multiple matches stop before a write;
   - when zero matches remain, preview the parent-aware create and verify that its parent, key, exact
     publishable payload, and workflow still match the approved draft. Validate the body again with
     `decomposition-child-workflow-parse` using its artifact language and record workflow.
     Immediately before apply,
     call `issue-sub-issues-read` again and replace the local reconciliation state. One now-matching
     child is recovered without applying, zero permits applying the unchanged previewed operation,
     and multiple matches or any marker/integrity error stop before a write. Never call
     `issue-create`, create first and link later, or fall back to a checklist;
   - after success or unique-key recovery, call `issue-sub-issues-read` once more and require exactly
     one valid same-parent match for the key. A concurrently visible duplicate fails closed before
     the comment update. Then guardedly update the canonical comment with the normalized child
     reference and a `created` status before continuing. Every status/reference transition rebuilds
     the complete section through `decomposition-records-build`; never patch encoded marker data or
     the visible rendering independently.

   If a create failure says `mutationMayHaveSucceeded`, perform `issue-sub-issues-read` immediately
   and replace the local reconciliation state before any decision. A unique valid key match recovers
   the result; zero, multiple, or marker-error matches remain blocked and are never blindly retried.
   If any later child fails, preserve created children, mark all missing or unknown drafts explicitly
   in the canonical comment when its hash guard still permits that update, retain
   `effective-flow-needs-planning`, report fresh re-entry through
   `{{SKILL:plan-issue}} <parent>`, and stop only this parent. Never delete or recreate a valid child.

   This three-read sequence and its duplicate checks protect the approved sequential/re-entry
   workflow but are not a cross-process lease. The forge comment update is a non-atomic
   read-then-PATCH and the provider exposes no supported conditional unsafe write here, so
   simultaneous writers can still race after the last pre-create read. Never claim the body hash
   closes that TOCTOU window; if a duplicate or uncertain result becomes visible, stop and reconcile
   rather than retrying.

4. With a baseline that has no critical findings, ask for this issue only:

```ask
header: Plan review
question: Start the deep interactive plan review now?
options:
  - label: Yes
    description: Search now for unknown, imprecise, and decision-requiring points
  - label: No
    description: Continue later via plan-issue <issue>
```

Do not reuse this answer for any other selected issue.

- On **Yes**, read `{{SKILL:plan-review}}` and invoke it in **issue mode** with exactly this issue,
  the current canonical planning-comment ID and body, its freshly computed body hash, the
  already-resolved tracker adapter, the concrete artifact language, and the literal line
  `Next steps: suppressed` on its own line, because that run returns its result here. The internal
  review may update only this existing comment and returns whether implementation-blocking open
  points remain. Do not create a plan file or a second comment.
- On **No**, retain the approved automatic baseline and record no artificial open point; the
  next-step block of Phase 5 carries the optional later re-entry.

After either branch, apply the readiness decision. For an approved decomposition, readiness also
requires a fresh `decomposition-container-compare` over the stored canonical comment and fresh
native-child list to return `ok: true`; every active record must be `created` and resolve to exactly
one same-parent native child with the recorded identity. The parent then remains a container and is
not itself an additional implementation work item. If the deep review is ended, deferred after it
starts, fails to persist, or returns a blocking open point, keep or add
`effective-flow-needs-planning` and persist the exact re-entry need in the comment. Otherwise
remove `effective-flow-needs-planning`, plus any present `firmo-needs-planning` variant on the
forge target. Never set
`effective-flow-issue-done`.

Set the issue task to `completed`, annotated `[blocked]` when it was not released, and continue
with the next selected issue. One blocked issue must not prevent the remaining issues from
receiving their own baseline, question, comment update, and label decision.

### Phase 5: Summary

Report per issue whether it was released for implementation, retained for planning with its open
points, or failed closed during comment persistence. This skill itself implements nothing.

Emit the next-step block per `next-steps` as the last element of the report. A run that released at
least one issue takes the released row; a run that released none takes the retained row.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If clarification, baseline, or deep review does not enable a reliable plan, leave
  `effective-flow-needs-planning` in place and document the blocking decision in the canonical
  comment's open-points section.
- A nonempty open-points section is implementation-blocking. Never remove the Needs-Planning
  label while an entry remains.
- Process multiple issues artifact by artifact. Questions and answers apply only to the currently
  named issue.
- Child creation is legal only through `issue-sub-issue-create` with the active parent supplied.
  Generic `issue-create`, a create-then-link sequence, sibling creation, and checklist degradation
  are forbidden in this tool.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.

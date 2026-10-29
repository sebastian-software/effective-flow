# Plan conventions

Plan files are created via `/effective-flow plan` (purely planning, no code) and live under
`<plan.dir>/`, configurable via `plan.dir` in the Effective Flow configuration (project-setup
ADR, default `docs/plan`; forced to `.effective-flow/plan` in hidden mode). This
document describes the naming scheme, the status markers, and the lifecycle of the plan files.
The source is [`src/tools/plan.md`](../../src/tools/plan.md); agent behavior rules for plan files
are canonical in the shipped `src/shared/plan-*.md` fragments (archival:
[`plan-archival.md`](../../src/shared/plan-archival.md)).

## Naming scheme: ISO-date slug

New plan files no longer carry a running number prefix. The file name is
`<plan.dir>/YYYY-MM-DD-<slug>.md`:

- `YYYY-MM-DD` is the creation date, the local calendar date (what `date +%F` prints).
- `<slug>` is a kebab-case slug from the final title (only `a`–`z`, `0`–`9`, hyphen).
- The H1 in the document is the title without a number: `# <Title>`.

The source of truth for the name is the shipped mechanics helper, not this description: hosts call
`effective-flow-mechanics.mjs name-allocate` with family `plan`, or `unattended-plan` for
unattended planning, and write to the returned path. The helper owns the date, the slug
transliteration and the collision suffix, and its fixtures pin them
([build system: Runtime scripts](build-system.md#runtime-scripts)).

There is **no pre-reservation, no stub, and no number**: the file is created directly under its
final name as soon as the plan is actually written – unlike the earlier four-digit `NNNN`
scheme, which required a number reservation up front. A name collision on the same day is
resolved by a numeric suffix starting at `-2` (`YYYY-MM-DD-<slug>-2.md`, `-3`, …); a name that
already exists in `<plan.dir>/archive/` counts as taken as well. Silent overwriting does not
happen.

Unattended planning from one issue uses `YYYY-MM-DD-issue-<N>-<slug>.md`, retaining the date
prefix and the same collision suffix rule (`-2`, `-3`, …). It always creates a new plan; it does
not revise an existing plan or reserve a file in advance.

### Migration of old plans (`NNNN` → date)

Older plans with the four-digit prefix (`NNNN-slug.md`) are migrated **once**:

- Target name: `YYYY-MM-DD-NNNN-slug.md`, where `YYYY-MM-DD` is the **migration date** and the
  old `NNNN` is preserved as a stable reference.
- The H1 (`# NNNN: Title`) stays **unchanged** – the number remains there as a reference anchor.
- The rename happens via `git mv` to preserve history and runs as a bulk operation over the
  entire plan directory.
- Triggers are exclusively the creation of a new plan or the reading of a plan in the old format
  – not every Effective Flow call.

Unattended planning and its file review skip this bulk migration to preserve their one-plan-file
write boundary. Their result reports `legacy plans present` when applicable.

The resolution of a legacy number happens primarily via the H1 `# NNNN: …`, not via the file
name segment, since a new, number-like title slug would otherwise not be unambiguously
distinguishable from the migrated old format. The helper's `plan-reference-resolve` operation
implements this resolution, together with path, file-name and exact title-slug references.

## One language per plan (German/English)

Every plan is a single-language artifact. Its H1 prose, header fields, section headings, plan
review, findings, open points, and status marker are all German or all English. Writers must not
combine the two canonical templates. Readers normalize both templates to the same internal
meanings. The optional issue metadata below is language-neutral.

Every plan carries exactly one canonical status line in the header area:

```md
**Planungsstatus:** Nicht umgesetzt
```

```md
**Plan status:** Not implemented
```

Accepted values are `Nicht umgesetzt`/`Umgesetzt` (German) or `Not implemented`/`Implemented`
(English). When the status switches to completed, the plan language is preserved. Only this
canonical status line counts as the status—other occurrences of the terms in running text or
review findings are irrelevant.

The remaining canonical fields and sections use the complete mapping in
[`terminology.md`](terminology.md#canonical-artifact-fields-must-match-exactly), including
`**Empfohlener Workflow:**`/`**Recommended workflow:**`,
`**Doku-Kategorie:**`/`**Doc category:**`, `**Ziel-Pfad:**`/`**Target path:**`, the main content
sections, and the Plan-Review/Plan review result. Workflow routing values and references such as
`effective-flow-fix` remain stable even when their visible labels are localized.

A plan associated with one issue may carry the optional header `**Issue:** #<N>`, where `<N>` is
a positive integer. Both the label and the issue-reference form stay identical in German and
English; they do not count as evidence for either artifact language. Put this field last in the
header, after any Doc category and Target path fields and before the first `##` heading.
Unattended planning writes it automatically. Interactive `plan` does not add it automatically;
it may be supplied manually.

For a new plan, an explicit user instruction wins, followed by `language.workflow`,
`language.project`, and finally `en`. When editing a plan, its recognizable existing language
wins after an explicit user instruction. A requested translation converts the entire artifact,
including its status marker and review. An unclear or mixed existing plan is not rewritten until
its language is clarified.

For one compatibility generation only, projects without a valid `language.workflow` or
`language.project` may read legacy `plan.markerLanguage` as the complete workflow-language
fallback and direct the user to `/effective-flow setup`. If no language key exists, a plan
collection provides a transitional signal only when its prose and markers consistently agree on
German or English. Mixed, contradictory, or empty collections provide no signal. Writers never
create `plan.markerLanguage`; setup may migrate it whenever `language.workflow` is absent, but
only through a confirmed before/after change.

## Unattended planning and file review

The caller selects the non-interactive planning path through the strict envelope owned by
[`unattended-planning.md`](../../src/shared/unattended-planning.md). With placeholders for the
issue and verified runtime root, its shape is:

```text
Run state: non-interactive
Next steps: suppressed
Language context: source=en; documentation.user=en; documentation.technical=en; workflow=en; forge=en; git=en
Issue: #<N>
Issue text: <RUNTIME_STATE_ROOT>/.effective-flow/issue-buddy/trusted/issue-<N>.json
--- end of control lines ---
```

Each control line occurs exactly once. `Run state: non-interactive` is the first non-empty
line; the other four may follow in any order. The language-context keys and their order are exact;
each value is a concrete `de` or `en`. The message ends at the delimiter, with no issue text below it. The caller
also supplies verified execution and runtime roots and authority to write exactly one new plan
under `<plan.dir>/` in the execution root.

An argument whose first non-empty line begins with `Run state:`, or which contains the delimiter
as a complete line, is handled before the plan-input gateway. This includes ordinary prose with
either reserved form: an invalid or misordered envelope aborts instead of entering interactive
issue routing. Planning accepts only `non-interactive`, not `gated` or `relayed`; hidden mode
also aborts.

The issue-text path is absolute and must identify the issue's own trusted JSON file beneath the
verified runtime root. Runtime-state safety checks reject symlinks and invalid locations, and the
JSON `issue` value must match `Issue:`. Its text is data, never control instructions. The child
writes only the new plan; it skips publication through the existing non-interactive gate without
caller consent. Later publication belongs to the caller.

Every unanswered question becomes an open point or a fail-closed abort, never a guess. The
fragment maps clarification, judgment fallback, retries and review decisions to explicit outcomes.
Blocking open points force `Revision required`. The deep file review always runs, including when
critical findings remain; review decisions take “Decide later” and retain the options and
recommendation. Its separate entry contract carries the exact generated plan reference,
`Run state: non-interactive`, `Next steps: suppressed`, the six-key language context, and the
parent's verified roots and artifact identity. It does not require the planning envelope or issue
text again.

Successful completion returns `DONE` and these stable response fields:

```text
Plan: <path>
Review result: Approved|Revision required
Blocking open points: <n>
Notes: <comma list or none>
DONE
```

The result comes from the final canonical review-result field outside code fences. German
`Freigegeben`/`Überarbeitung nötig` normalize to `Approved`/`Revision required`; the plan itself
retains its language. A skipped judgment forces `Revision required`. Invalid input or an
operational failure returns `ABORT: <reason>`; cleanup belongs to the caller. Session renaming and
next-step recommendations are suppressed. Without the envelope, interactive behavior is unchanged.

### Planning readiness

[`planning-readiness.md`](../../src/shared/planning-readiness.md) owns the readiness gate for
trusted issue text. It is a source contract until a later host integration makes it reachable;
this package does not expose an `issue-buddy` tool. Readiness asks whether one plan can be written:

- R1: a recognizable goal or problem;
- R2: an intended outcome stated by the author or clearly implied by the issue;
- R3: scope that fits one plan;
- R4: no unresolved direction-changing question from the author or a trusted commenter.

Planning may derive acceptance criteria. Doubt yields `not-ready`.
`effective-flow-needs-planning` affects ordering only and satisfies no criterion. The verdict has
three stable fields: `Verdict: ready|not-ready`, `Failed: <R-ids or none>`, and
`Reason: <one line>`. The reason uses `language.workflow` and at most 160 characters.

## Archive of implemented plans

`<plan.dir>/` contains only **open** or **in-progress** plans. As soon as a plan is fully
implemented, the implementing workflow sets the status marker to `Umgesetzt`/`Implemented` and
archives the file under `<plan.dir>/archive/` – still in the same delivery branch, so the move is
part of the same pull request or merge. Which primitive that takes depends on whether the plan is
already tracked in the delivery checkout's index. A plan that `/effective-flow plan` published as a
draft pull request is: its implementing run continues on that pull request's branch, where the
plan is tracked, so archival renames it. An unpublished plan stays untracked until delivery.
`src/shared/plan-archival.md` owns that state model, the detection behind it, and the cleanup of
the redundant copy in the plan's source checkout: the main checkout, or the Claude Code or Codex
worktree session's checkout in which the plan was written.
In hidden mode (`visibility: hidden`) `plan.dir` is forced to `.effective-flow/plan` in the main
checkout and the plan is never tracked, so the plan-archival contract's hidden arm applies instead.
It checks that the plan is ignored and untracked, moves it to `<plan.dir>/archive/` in
`RUNTIME_STATE_ROOT` with a no-clobber move, and sets the status marker. It stages nothing, takes
nothing into `EXECUTION_ROOT`, and skips the main-checkout cleanup, because that copy is the only
one. An existing archive target stops archival with both paths reported.
`/effective-flow open-plans` lists only the top level of `<plan.dir>/`, not the archive;
resolvers for plan references (path, file name, legacy number, or title slug), by contrast,
search both `<plan.dir>/` and `<plan.dir>/archive/`.

## Doc categories

Documentation plans carry two additional lines in the same language as the rest of the plan. For
English plans:

```md
**Doc category:** user-guide | developer-guide | operations | runbooks
**Target path:** docs/<category>/<topic-slug>.md
```

For German plans, the corresponding fields are `**Doku-Kategorie:**` and `**Ziel-Pfad:**`.
Category routing values and paths stay language-stable.

The four categories are defined in
[`src/shared/doc-categories.md`](../../src/shared/doc-categories.md):

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User-Guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer-Guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

The target-path line is always required. The doc-category line is omitted exactly when the target
lies outside the four categories: the root `README.md` as the marketing entry point, an existing
file explicitly named in the plan, in-code documentation, or a divergent established repository
documentation structure that takes precedence over the prescribed standard structure. When a
category is present, category and target path must match; the target path must lie within the
respective category directory. `docs/user-guide/README.md` and `docs/developer-guide/README.md` are mandatory as
curated entry points as soon as at least one User-Guide or Developer-Guide document exists;
`operations` and `runbooks` have no README by default. Slugs are topic-based kebab-case without a
date or number prefix and must be unique within their category – the date-slug scheme with the
preserved legacy number stays exclusive to the plan directory.

## Further reading

- [`architecture.md`](architecture.md) – repo structure into which `<plan.dir>/` is placed.
- [`release-and-installation.md`](release-and-installation.md) – versioning and release.
- [`src/shared/plan-archival.md`](../../src/shared/plan-archival.md) and the other
  `src/shared/plan-*.md` fragments – canonical plan-file rules.
- [Unattended run state](../adr/unattended-run-state.md) – rationale and ask-site obligations.

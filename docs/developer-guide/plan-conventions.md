# Plan conventions

Plan files are created via `/effective-flow plan` (purely planning, no code) and live under
`<plan.dir>/`, configurable via `plan.dir` in the Effective Flow configuration (project-setup
ADR, default `docs/plan`). This
document describes the naming scheme, the status markers, and the lifecycle of the plan files.
The source is [`src/tools/plan.md`](../../src/tools/plan.md); agent behavior rules for plan files
are canonical in [`AGENTS.md`](../../AGENTS.md), section "Plan files (`docs/plan/`)".

## Naming scheme: ISO-date slug

New plan files no longer carry a running number prefix. The file name is
`<plan.dir>/YYYY-MM-DD-<slug>.md`:

- `YYYY-MM-DD` is the creation date (ISO, e.g. via `date +%F`).
- `<slug>` is a kebab-case slug from the final title (only `a`–`z`, `0`–`9`, hyphen).
- The H1 in the document is the title without a number: `# <Title>`.

There is **no pre-reservation, no stub, and no number**: the file is created directly under its
final name as soon as the plan is actually written – unlike the earlier four-digit `NNNN`
scheme, which required a number reservation up front. A name collision on the same day is
resolved by a numeric suffix (`YYYY-MM-DD-<slug>-2.md`, `-3`, …); silent overwriting does not
happen.

### Migration of old plans (`NNNN` → date)

Older plans with the four-digit prefix (`NNNN-slug.md`) are migrated **once**:

- Target name: `YYYY-MM-DD-NNNN-slug.md`, where `YYYY-MM-DD` is the **migration date** and the
  old `NNNN` is preserved as a stable reference.
- The H1 (`# NNNN: Title`) stays **unchanged** – the number remains there as a reference anchor.
- The rename happens via `git mv` to preserve history and runs as a bulk operation over the
  entire plan directory.
- Triggers are exclusively the creation of a new plan or the reading of a plan in the old format
  – not every Effective Flow call.

The resolution of a legacy number happens primarily via the H1 `# NNNN: …`, not via the file
name segment, since a new, number-like title slug would otherwise not be unambiguously
distinguishable from the migrated old format.

## One language per plan (German/English)

Every plan is a single-language artifact. Its H1 prose, header fields, section headings, plan
review, findings, open points, and status marker are all German or all English. Writers must not
combine the two canonical templates. Readers normalize both templates to the same internal
meanings.

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

## Archive of implemented plans

`<plan.dir>/` contains only **open** or **in-progress** plans. As soon as a plan is fully
implemented, the implementing workflow sets the status marker to `Umgesetzt`/`Implemented` and
moves the file via `git mv` to `<plan.dir>/archive/` (directory created if needed) – still in
the same delivery branch, so the move is part of the same pull request or merge.
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
- [`AGENTS.md`](../../AGENTS.md) – canonical plan-file rules.

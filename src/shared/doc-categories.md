## Doc categories

Final documents from the documentation workflow are placed exclusively in one of the four fixed categories under `docs/`.

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

### Prescribed standard doc structure

Unless the user, the underlying plan, or the repository itself specifies otherwise, this
**standard structure** of three roles applies to the project documentation. It is a prose default:
the documentation workflow applies it when no different structure is required; an explicit wish of
the user (e.g. a purely technical README without marketing) always takes precedence. There is
**no** config field for this.

**An established repository structure takes precedence over the prescribed standard structure.**
When the documentation owner's repository discovery reports an established, working documentation
structure, that structure is the target and the prescribed standard structure does not override
it. The four categories below are the default for repositories **without** an established
structure. Effective Flow defines **no** local test for what counts as "established" — that is
information-architecture judgment and belongs to the documentation owner; a repository whose
structure the owner cannot establish falls back to the prescribed default. Effective Flow keeps
the write boundary, the target-path approval, and the collision clarification in either case, and
a divergent structure is named explicitly in the doc plan so the user approves it before
implementation.

Resolve documentation language by target: root `README.md` and `docs/user-guide/**` use
`language.documentation.user`; `docs/developer-guide/**`, `docs/operations/**`,
`docs/runbooks/**`, standalone API documentation, and new ADRs use
`language.documentation.technical`; in-code documentation uses `language.source`; explicit
changelog/release prose uses `language.git`. Existing documents preserve their clear language
unless translation was explicitly requested. File/directory names and category values remain
stable and are not translated.

1. **Root `README.md` – marketing entry point.** A marketing page entirely from the user's
   perspective: value proposition first, promotional language allowed, kept short. It is
   created by the marketing agent (not by the factual documentation agent) and applies the
   conditional follow-up-link rule below.
2. **User documentation → `docs/user-guide/`.** Entirely from the user's perspective:
   describes installation and usage extensively, optionally with an FAQ and similar additions.
   The entry point is `docs/user-guide/README.md`.
3. **Technical documentation → `docs/developer-guide/`.** For developers and software
   architects: developers get an overview of the software, software architects can derive from
   it whether the software should be used from a technical standpoint. The entry point is
   `docs/developer-guide/README.md`.

**Conditional follow-up-link rule for the root README.** At the end of the documentation run,
inspect whether the two follow-up targets of the **effective** structure exist. Under the
prescribed standard structure those targets are `docs/user-guide/README.md` and
`docs/developer-guide/README.md`; under an established repository structure they are that
structure's user-facing and technical entry points. The final documentation follow-up section of
the root `README.md` includes only links whose targets exist, in user-facing then technical order:

- If both targets exist at the end of the run, the section contains exactly two links: first the
  user-facing entry point, then the technical one.
- If exactly one target exists, the section contains only that target's valid link. Report the
  other path as an open point in the workflow or agent result.
- If neither target exists, emit neither link. Report both missing paths individually as open
  points in the workflow or agent result.

Never add a placeholder or broken link for a missing target. Preserve existing unrelated
README links; they are outside the final documentation follow-up section and do not count
toward this invariant.

### File name convention

This convention belongs to the prescribed standard structure and applies to documents in the four
categories. When an established repository documentation structure took precedence, that
structure's own naming conventions apply instead: follow the neighbouring documents rather than
renaming repository-native files to match the rules below.

- topic-based slugs in kebab-case, e.g. `installation.md`, `architecture.md`, `restart-database.md`
- no date or number prefix; the date-slug scheme (with a preserved legacy number) is exclusive to the plan directory `<plan.dir>/` (from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
- slugs must be unique within their category
- file extension always `.md`

### Directory rules

- `docs/user-guide/README.md` as a curated entry point with a reading order is mandatory as soon as at least one user-guide document exists.
- `docs/developer-guide/README.md` as a curated entry point is mandatory as soon as at least one developer-guide document exists. It gives developers an overview and software architects a basis for decision-making, and is the target of the developer-guide follow-up link when that link is included under the conditional rule (see "Prescribed standard doc structure").
- `docs/operations/` and `docs/runbooks/` have no README by default.
- In `docs/runbooks/`, thematic subfolders are allowed, e.g. `docs/runbooks/database/restart.md`. They are optional; mandatory only once the flat list becomes unwieldy.
- Empty directories are not created in advance. A category directory comes into being only with the first document in it.

### Write boundary

- The documentation workflow may write final documents exclusively into these four directories and their subfolders. When an established repository documentation structure took precedence over the prescribed standard structure, that approved structure replaces the four directories as the write boundary; it never widens it beyond the structure named in the doc plan.
- **Exception root `README.md`:** As the marketing entry point of the standard doc structure, the root `README.md` is a sanctioned write target of the documentation workflow and does not need to be named individually in every plan table for that. It is written exclusively in this marketing-entry-point role; if a root README already exists, it is not silently overwritten but the replacement is clarified with the user (analogous to the collision rule for existing target paths).
- Every **other** existing file outside these directories may only be changed if it is explicitly named in the `Affected files` table of the underlying plan file.

### Plan headers for documentation plans

Plan files with `**Empfohlener Workflow:** Documentation` or
`**Recommended workflow:** Documentation` additionally contain the matching two lines directly
under the workflow recommendation:

- German: `**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks` and
  `**Ziel-Pfad:** docs/<category>/<topic-slug>.md`
- English: `**Doc category:** user-guide | developer-guide | operations | runbooks` and
  `**Target path:** docs/<category>/<topic-slug>.md`

Rules:

- Both lines must use the complete plan language and be written exactly as above, including bold
  formatting, colon, and lowercasing of the stable category value.
- The target-path line is always present and names the concrete path.
- When a category line is present, it must match the directory prefix in the target-path field, and
  the target path must point to a file within the matching category directory.
- Example: `**Doku-Kategorie:** runbooks` with `**Ziel-Pfad:** docs/runbooks/database/restart.md`,
  or the complete English equivalent.
- **Sanctioned omission of the category line:** The doc-category line is omitted exactly when the
  target lies outside the four `docs/` categories – the root `README.md` as the marketing entry
  point (target path `README.md`), an existing file explicitly named in the plan, in-code
  documentation, or a divergent established repository structure. In every other case the category
  line is required.

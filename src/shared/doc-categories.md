## Doc categories

Final documents from the documentation workflow are placed exclusively in one of the four fixed categories under `docs/`.

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

### Prescribed standard doc structure

Unless the user or the underlying plan specifies otherwise, this **standard structure** of
three roles applies to the project documentation. It is a prose default: the documentation
workflow applies it when no different structure is required; an explicit wish of the user
(e.g. a purely technical README without marketing) always takes precedence. There is **no**
config field for this.

1. **Root `README.md` – marketing entry point.** A marketing page entirely from the user's
   perspective: value proposition first, promotional language allowed, kept short. It is
   created by the marketing agent (not by the factual documentation agent) and ends with
   exactly two follow-up links (see below).
2. **User documentation → `docs/user-guide/`.** Entirely from the user's perspective:
   describes installation and usage extensively, optionally with an FAQ and similar additions.
   The entry point is `docs/user-guide/README.md`.
3. **Technical documentation → `docs/developer-guide/`.** For developers and software
   architects: developers get an overview of the software, software architects can derive from
   it whether the software should be used from a technical standpoint. The entry point is
   `docs/developer-guide/README.md`.

**Two-links rule for the root README.** The root `README.md` ends with exactly two links, in
this order:

- first link → `docs/user-guide/README.md` (user documentation)
- second link → `docs/developer-guide/README.md` (technical documentation)

A link is only set if its target exists or is created in the same documentation run;
otherwise the link is omitted and noted as an open point, so no dead links arise.

### File name convention

- topic-based slugs in kebab-case, e.g. `installation.md`, `architecture.md`, `restart-database.md`
- no date or number prefix; the date-slug scheme (with a preserved legacy number) is exclusive to the plan directory `<plan.dir>/` (from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
- slugs must be unique within their category
- file extension always `.md`

### Directory rules

- `docs/user-guide/README.md` as a curated entry point with a reading order is mandatory as soon as at least one user-guide document exists.
- `docs/developer-guide/README.md` as a curated entry point is mandatory as soon as at least one developer-guide document exists. It gives developers an overview and software architects a basis for decision-making, and is the target of the second link of the root README (see "Prescribed standard doc structure").
- `docs/operations/` and `docs/runbooks/` have no README by default.
- In `docs/runbooks/`, thematic subfolders are allowed, e.g. `docs/runbooks/database/restart.md`. They are optional; mandatory only once the flat list becomes unwieldy.
- Empty directories are not created in advance. A category directory comes into being only with the first document in it.

### Write boundary

- The documentation workflow may write final documents exclusively into these four directories and their subfolders.
- **Exception root `README.md`:** As the marketing entry point of the standard doc structure, the root `README.md` is a sanctioned write target of the documentation workflow and does not need to be named individually in every plan table for that. It is written exclusively in this marketing-entry-point role; if a root README already exists, it is not silently overwritten but the replacement is clarified with the user (analogous to the collision rule for existing target paths).
- Every **other** existing file outside these directories may only be changed if it is explicitly named in the `Affected files` table of the underlying plan file.

### Plan headers for documentation plans

Plan files with `**Recommended workflow:** Documentation` additionally contain two lines in the header directly under the workflow recommendation:

- `**Doc category:** user-guide | developer-guide | operations | runbooks`
- `**Target path:** docs/<category>/<topic-slug>.md`

Rules:

- Both lines must be written exactly like this, including bold formatting, colon, and lowercasing of the category.
- The category in `**Doc category:**` must match the directory prefix in `**Target path:**`.
- The target path must point to a file within the matching category directory.
- Example: `**Doc category:** runbooks` together with `**Target path:** docs/runbooks/database/restart.md`.
- **Special case marketing entry point:** If the documentation plan targets the root `README.md`, `**Target path:** README.md` is set and the `**Doc category:**` line is **omitted** – the root README is not one of the four `docs/` categories. Only in exactly this case may the category line be absent; the consistency rule "category matches the directory prefix" remains unchanged for all `docs/` targets.

## Plan file convention (naming, migration, archive)

The plan directory is configurable via the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`). In the following, `<plan.dir>` stands for this directory and `<plan.dir>/archive`
for its archive.

Plan files live under `<plan.dir>/`. The file name carries an **ISO date prefix**
instead of a running number. This removes any need for number reservation and
collision resolution: a plan is simply written under its final name when it is populated.

### New plan: date + slug

- File name: `<plan.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` is the creation date
  (ISO, e.g. from `date +%F`). `<slug>` is a kebab-case slug derived from the title (only `a–z`,
  `0–9`, hyphen).
- **No advance reservation, no stub, no number.** The file is created only when the
  plan is actually written. There is no reservation timestamp, no
  read-back, and no renumbering.
- **Name collision on the same day:** if the name already exists, append a numeric
  suffix (`YYYY-MM-DD-<slug>-2.md`, `-3`, …). No silent overwriting.
- The plan's H1 is the title without a number: `# <Title>`.

### Migration of old plans (NNNN → date)

Earlier plans carried a four-digit number prefix (`NNNN-slug.md`, e.g.
`0030-feature-name.md`). These are converted to the date scheme **once**:

- Target name: `YYYY-MM-DD-NNNN-slug.md`, where `YYYY-MM-DD` is the **conversion date** and
  the old `NNNN` is retained as a stable reference. The H1 (`# NNNN: Title`) stays
  **unchanged** — the number remains there as a reference anchor.
- Rename in the Git repo with `git mv` to preserve the history.
- **Bulk pass** across the entire plan directory. Format check per file: a name
  that starts with four digits and a hyphen (`^\d{4}-`) but does **not** already carry a
  date prefix (`^\d{4}-\d{2}-\d{2}-`) is old format and is migrated. Files that have already
  been migrated are skipped (idempotent).
- **Trigger:** (a) when creating a new plan and (b) when reading a plan,
  if an old format is discovered in the process. **Not** on every Effective Flow invocation — only on
  plan creation or plan reading, to avoid losing time.

### Archive of implemented plans

`<plan.dir>/` contains only **open** or **in-progress** plans. A
fully implemented plan is moved to `<plan.dir>/archive/`; the
Umgesetzt/Implemented marker is retained in the file.

- The move is coupled to the **delivery event** (PR opened or
  worktree branch merged): the implementing workflow sets the status marker to
  `Umgesetzt`/`Implemented` and moves the file via `git mv` to `<plan.dir>/archive/`
  (creating the directory if needed), still on the delivery branch, so that the move is part
  of the same PR/merge (implementation documentation). This convention states the **what**;
  `plan-archival` owns the **how** — which state the plan is in and therefore whether `git mv` is
  the right primitive at all. It is, for a plan already tracked on the delivery base; a plan the
  authoring run left untracked is written into the archive and added instead, because `git mv`
  cannot move an untracked path. See also "Delivery and worktree integration".
- The **reverse** move is not coupled to a delivery event and therefore not staged: when a
  revision run brings an archived plan back to `<plan.dir>/`, it moves the file with a plain
  filesystem move, never with `git mv`. `{{SKILL:plan}}` creates no commit, so a staged rename
  would outlive the run in the user's index. That path belongs to `{{SKILL:plan}}`; its
  revision-mode rules carry the reporting duty that comes with the unstaged move.
- `{{SKILL:open-plans}}` lists only the top level of `<plan.dir>/`, not the archive.
- Resolvers (see below) search in `<plan.dir>/` **and** `<plan.dir>/archive/`.

### Resolve a plan reference

A plan reference can be: a full path, a file name, a legacy number, or a
title slug. Search in `<plan.dir>/` **and** `<plan.dir>/archive/`.

- **Resolve a legacy number unambiguously:** a four-digit number `NNNN` is resolved **primarily via
  the H1** `# NNNN: …`, not via the file name segment. Reason: a new plan
  with a slug that starts with four digits (title "2024 Retrospective" →
  `YYYY-MM-DD-2024-retrospective.md`) is indistinguishable at the file name from the migrated
  legacy pattern `YYYY-MM-DD-NNNN-slug.md`. Only migrated old plans
  carry a `# NNNN:` H1; new plans have `# <Title>` without a number. The H1 is thus the
  reliable discriminator; the file name segment is only a secondary signal when the H1
  is missing.
- **The slug** is the stable anchor for new plans (which carry no number).
- If more than one file matches, ask; never heuristically pick the "newest".

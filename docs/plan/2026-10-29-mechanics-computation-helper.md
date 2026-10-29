# Mechanics computation helper

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Planning baseline

- **Planned at:** local `develop` `694e0cc3`, 2026-10-29. `origin/develop` is two commits ahead
  (`d19fb220`, `6dfeed9f`) and changes 28 files. The ones that matter here:
  - `build.mjs` and `build-lib.mjs`, including the `iterate` and `setup` entries of
    `CONTEXT_BUDGET_LINES`;
  - `src/tools/setup.md` and `src/shared/setup-advanced-settings.md`;
  - `src/shared/merge-gate-delegated-run.md`, which lazy-includes `worktree-integration`;
  - `evals/merge-gate/*`;
  - `docs/developer-guide/build-system.md` and `configuration.md`;
  - `test/workflow-contracts.test.mjs`.

  No owning fragment and no `src/scripts/*` file is touched. Start the implementation from a fresh
  `origin/develop`. Before any change there, record the baseline verdict of
  `pnpm eval <suite> verify` for all three suites and re-measure every budget, so step 7 can tell
  which instrument moves are caused by this work.

- **Source concept:** `docs/concept/2026-10-29-runtime-state-cli.md`, work package 5 ("Mechanics
  computation", stage 3a). It is untracked in the checkout at planning time and has to be committed
  with or before this work.
- **Drift check before execution:** before starting, re-read these and revise this plan if a rule
  it summarizes has moved:
  - the owning fragments listed under "Affected files";
  - `RUNTIME_SCRIPT_FILES` in `build.mjs` and in `scripts/distribution-smoke.mjs`;
  - the `loadSetSeeds` of the three `evals/*/suite.config.mjs`;
  - the fetch guard in `delivery-selection-core.mjs` (`fetchableUpstream`, `fetchUpstream`).

## Requirement

Five deterministic procedures exist only as prose today. Agents replay them with ad-hoc shell
commands, several hosts restate them, and no unit test covers them:

1. **Base-branch resolution:** `src/shared/base-branch-resolution.md`.
2. **Dated name allocation** with per-family collision suffixes:
   - `src/shared/plan-numbering.md` and `src/shared/concept-contract.md`;
   - the unattended plan name in `src/shared/unattended-planning.md`;
   - the report names in `unresolved-review-report`, `security-disclosure-gate`, `review` and
     `investigate`.
3. **Delivery branch naming** with hidden-mode disclosure stripping:
   - owned by `src/shared/worktree-integration.md` step 4;
   - restated in `src/tools/deliver.md` and `src/shared/plan-publication.md`.
4. **ADR numbering:** observed-evidence scan, width, number, containment, collision and no-rename,
   in `src/shared/project-adr-convention.md`.
5. **Plan-reference resolution:**
   - owned by `src/shared/plan-reference-routing.md`;
   - restated in `plan-numbering`, `apply-source-detection`, `review` and `plan-review`.

This work adds the bundled helper `effective-flow-mechanics.mjs` and its core
`effective-flow-mechanics-core.mjs`. The helper computes these five procedures. It imports the
code that already owns parts of these rules instead of copying it. Fixtures pin today's intended
behaviour before any code moves. Each owning fragment then shrinks to the helper call plus outcome
handling, and every restated copy in another host is removed.

**Why Refactoring:** the intended behaviour of every procedure stays the same. The few rules that
are unspecified today are pinned by explicit decisions (see "Architecture decisions"), not
changed. The work moves rules from prose into tested code and removes duplicates. It adds no
user-facing capability.

The concept's stage 3 criteria apply to all five procedures:

- fixtures cover each procedure with its edge cases;
- each owning fragment is reduced, with no restated copy left elsewhere;
- the `CONTEXT_BUDGET_LINES` entries of its eager hosts drop by the measured amount.

## Architecture decisions

- **One new helper pair that follows the existing script pattern.** A thin JSON CLI,
  `src/scripts/effective-flow-mechanics.mjs`, sits over an importable, side-effect-free
  `src/scripts/effective-flow-mechanics-core.mjs`.
  - **Input:** the operation is always `argv[0]`, so it appears in the command line and never only
    in JSON. Input is one JSON object on stdin, capped like `setup-status.mjs`.
  - **Output:** one envelope line, either `{ok, operation, data}` or
    `{ok:false, operation, error:{code,message,details}}`. Every successful `data` carries a
    machine-readable `outcome` string, so prose branches on the outcome instead of parsing text.
  - **Git:** calls go through `process-runner.mjs` `createProcessRunner`, which is injected into the
    core, so the core spawns no process itself.
  - **Tests and flags:** `main(argv, io)` is exported for tests. WP5 adds no write operation, so
    it has no `--apply` flag.
- **Operations and allowlist prefixes.** Every WP5 operation is computation or a read except
  `base-branch-fetch`. That operation has its own name, and so its own command prefix, and is
  labelled "read with a ref update". This keeps it separately allowlistable, as the concept
  requires. The operations are:
  - `base-branch-resolve` (read)
  - `base-branch-fetch` (fetch)
  - `name-allocate` (computation and read)
  - `delivery-branch-name` (computation and read)
  - `adr-observe` and `adr-allocate` (computation and read)
  - `plan-reference-resolve` (read)
- **Import, never copy, from leaf modules only.** The core imports only cores whose own imports are
  `node:` built-ins. This keeps its load graph small and keeps the eval seeds bounded (user
  decision). It imports from three cores:
  - **`plan-lint-core.mjs`:**
    - `classifyPlanText`, for the status marker. It is already exported.
    - The unattended plan-name pattern (`UNATTENDED_PLAN_NAME`) and the in-process ref-path
      validator (`refPathProblem`). Both **move** here from `plan-publication-core.mjs`, because
      `plan-lint-core` owns the plan-file contract and is a leaf. `plan-publication-core.mjs`
      imports them back from there, which it already does for other symbols. Its behaviour stays
      identical.
  - **`delivery-selection-core.mjs`:** the fetch hardening. This means:
    - `fetchableUpstream`, the ref guard, which becomes a named export. The branch is passed to it
      as `refs/heads/<branch>`, because it rejects refs outside `refs/`.
    - `HOOKS_DISABLED`, which also becomes a named export.
    - `nonInteractiveFetchEnv`, `UPSTREAM_FETCH_TIMEOUT_MS` and the redacting `diagnosticText`,
      which are already exported.

    `fetchUpstream` itself is **not** reused. It passes `timeout:`, which only the private runner
    in `delivery-selection.mjs` honours, while the injected `process-runner.mjs` reads `timeoutMs`.
    Reusing it would silently drop the 60 s bound. The mechanics core follows the
    `plan-publication-core` precedent instead (`plan-publication-core.mjs:912–921`): it composes
    `fetch --no-tags --quiet -- <remote> <ref>` from the imported pieces. It passes `timeoutMs`
    together with `processGroup: true`, because without a process group the timeout stops only the
    direct child, and an `ssh` or credential-helper grandchild can keep the pipes open
    (`process-runner.mjs:14–21`). Like `plan-publication.mjs`, the CLI installs the
    `terminateActiveProcessGroups` handlers for `SIGINT`, `SIGTERM` and exit. A runner result with
    `forcedKill` or a timeout is `fetch-failed`.

    Two tests guard this composition. A parity test with a capturing fake runner asserts that both
    cores produce the same argv and environment for the same input. A second fixture asserts that
    the runner receives `timeoutMs` and `processGroup: true`.

  - **`remote-tracker-shared-core.mjs`:** the disclosure pattern set (`PRODUCT_NAME_PATTERNS`), as
    a new named export. Hidden-mode stripping and `assertUndisclosed` then share one pattern
    source. The detector stays a detector, and the stripper lives in the mechanics core. This is
    the reconciliation the concept asks for.

  The core does **not** import these two at runtime:
  - **`plan-publication-core.mjs`:** importing it would pull in the whole remote-tracker family.
    Its name and ref rules are reached through `plan-lint-core` instead. `plan-publication-core`
    re-exports both symbols, so a test can assert identity with the `plan-lint-core` objects.
  - **`setup-status-core.mjs`:** no WP5 procedure uses it. Its ignore-state read side arrives with
    the `.gitignore` operation in WP6 (user decision).

  From `plan-lint-core` the core also imports the plan root and entry resolution, plus the safe
  reader and lister: `resolveRoots`, `resolveFileEntry`, `readPlanFile` (O_NOFOLLOW with an
  identity re-check) and `listTopLevel`. All four become named exports with unchanged behaviour.
  The H1 scan for legacy numbers and the `classifyPlanText` status read go through `readPlanFile`,
  never through a second reader. These functions are the owning implementation of what
  `plan-reference-resolve` and the plan-family directories of `name-allocate` need:
  - `planDir` relative, with no `..`;
  - symlink and ancestor escape refused;
  - the `top` or `archive` location;
  - regular files only;
  - physical containment.

  Their semantics apply unchanged, and the fixtures pin them as they are:
  - A truly absent `planDir` or archive is empty.
  - A dangling `planDir` link, an `ELOOP` or a non-directory ancestor is `NOT_FOUND` in
    `plan-lint-core`, and is re-coded to `UNSAFE_PATH` (see "Error mapping").
  - A dangling or escaping `archive` symlink is treated as absent by `resolveRoots`. The mechanics
    core does not paper over this. It reports `archiveIgnored: true` in `data` whenever an
    `archive` entry exists but `resolveRoots` returned no archive root. `name-allocate` then stops
    with outcome `archive-unusable` instead of allocating a name that could duplicate an archived
    plan. `plan-reference-resolve` returns its result with the flag set, so the prose can report
    it.
  - `resolveFileEntry` accepts only `cwd`-relative paths. An absolute `reference` is therefore made
    relative to the canonical `cwd` before the call. If it is not inside `cwd`, it is
    `UNSAFE_PATH`. This adapts the input and leaves the export's contract unchanged.

  `duplicatesFor` is not reused:
  it answers a lint question (a regular file of the same name in the other location), while
  allocation needs "is this name taken by any entry".

  `process-runner.mjs` is imported only by the CLI, never by the core, which has no way to spawn.

- **ADR for the import rule.** This work writes `docs/adr/mechanics-helpers-import-owning-cores.md`.
  It is numberless, like the existing ADRs. It records these rules:
  - A mechanics helper imports the code that owns a rule.
  - A needed private symbol becomes a named export, or moves into a leaf owner, instead of being
    copied.
  - A helper never restates a rule that a sibling core owns.
  - A helper imports only leaf modules, so its load graph and eval seeds stay bounded.

  WP6, WP7 and later helpers are bound by it (user decision).

- **Containment until WP2.** Plan paths use the imported `plan-lint-core` resolution. ADR targets
  and the runtime-report directories of `name-allocate` need physical containment as well, and no
  leaf core owns that yet. It lives in one internal, unexported function of the mechanics core,
  which applies the same rules (`lstat` on every component, realpath, contained under `cwd`). When
  WP2's shared path guard exists, that function is replaced by an import. The ADR names this as a
  known migration, not a second owner.
- **Input schemas.** Each operation takes a closed JSON object, and an unknown key is
  `INVALID_INPUT`. `cwd` is always the verified absolute root of the run: the checkout root, or
  `RUNTIME_STATE_ROOT` for runtime targets. Directory fields are relative to `cwd`, contain no
  `..`, and are physically contained under `cwd` (see "Containment until WP2").

  Name components are validated before anything is composed:
  - `skill` and `workflow` must belong to a closed enum: the exposed and internal tool names that
    produce branches or reports.
  - `planSlug` must match the slug alphabet.
  - `issue` must be a positive integer.
  - The composed file name must be a single path segment, and the composed branch must pass
    `git check-ref-format --branch`.

  Any violation is `INVALID_INPUT`.

  | Operation                | Input                                                                                                                                                                |
  | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `base-branch-resolve`    | `cwd`, `configured` (the `delivery.baseBranch` value or `null`)                                                                                                      |
  | `base-branch-fetch`      | `cwd`, `remote`, `branch` (from `fetch-required`), `deliberateDivergence` (boolean)                                                                                  |
  | `name-allocate`          | `cwd`, `family`, `dir`, plus per family: `text` (slug source), `issue` (`unattended-plan`), `workflow` (`review-report-workflow`), `planSlug` (`review-report-plan`) |
  | `delivery-branch-name`   | `cwd`, `branchPrefix` (may be empty), `skill`, `text`, `visibility` (`visible` or `hidden`), `excludeNames` (branch names the caller found taken; default empty)     |
  | `adr-observe`            | `cwd`, `adrDir`                                                                                                                                                      |
  | `adr-allocate`           | `cwd`, `adrDir`, `convention` (`numbered` or `numberless`), `declaredWidth` (integer or `null`), `text`, `previousTarget` (`null` on the first call)                 |
  | `plan-reference-resolve` | `cwd`, `planDir`, `reference` (a path relative to `cwd` or absolute, a file name with or without `.md`, a legacy number, or a title slug)                            |

  A truly absent target directory counts as empty for allocation and contributes no candidates for
  resolution. A dangling or escaping one is `UNSAFE_PATH`. The one exception is `adrDir`, whose
  escape is the `outside-repo-stop` outcome (see "ADR numbering").

- **Error mapping.** The CLI uses three error codes:
  - `INVALID_INPUT` exits 2.
  - `UNSAFE_PATH` exits 3. It covers a path outside its root, a symlink escape, or `..`.
  - `COMMAND_FAILED` and `INTERNAL` exit 1.

  Errors from imported cores are caught at the core boundary and re-coded, keeping their message:

  | Imported code                                                                          | Re-coded to                            |
  | -------------------------------------------------------------------------------------- | -------------------------------------- |
  | `PlanLintError` `INVALID_PAYLOAD`, `INVALID_CWD`                                       | `INVALID_INPUT`                        |
  | `PlanLintError` `UNSAFE_PATH`                                                          | `UNSAFE_PATH`                          |
  | `PlanLintError` `NOT_FOUND` from root resolution (dangling or non-directory `planDir`) | `UNSAFE_PATH`                          |
  | `PlanLintError` `NOT_FOUND` for a single entry during resolution                       | not an error: no candidate             |
  | `DeliverySelectionError`, `RemoteTrackerError` `INVALID_*`                             | `INVALID_INPUT`                        |
  | git `COMMAND_FAILED` and anything else                                                 | `COMMAND_FAILED` or `INTERNAL`, exit 1 |

  A test covers each row.

- **Slug transliteration (user decision).** The steps run in this order:
  1. Unicode NFC, so decomposed input such as NFD text or macOS file names maps the same as
     composed input.
  2. Map the German digraphs `ä→ae`, `ö→oe`, `ü→ue` and `ß→ss`, including the upper-case forms.
  3. Lowercase.
  4. NFKD, then strip combining marks.
  5. Replace each run of characters outside `a–z` and `0–9` with one hyphen.
  6. Trim edge hyphens.
  7. Cap the slug at 80 characters, cutting at the last hyphen at or before the cap. If the first
     80 characters contain no hyphen, cut hard at 80. Then trim edge hyphens again.

  Example: `Größenänderung` becomes `groessenaenderung`. One `slugify` serves name allocation and
  branch naming.

- **Name allocation: collision suffix per family.** Each family is a parameter, and no existing
  name changes:

  | Family                   | Start | Name form                                                                | Decided by                        |
  | ------------------------ | ----- | ------------------------------------------------------------------------ | --------------------------------- |
  | `plan`, `concept`        | `-2`  | `YYYY-MM-DD-<slug>[-N].md`                                               | today's prose                     |
  | `unattended-plan`        | `-2`  | `YYYY-MM-DD-issue-<N>-<slug>[-N].md` (must match `UNATTENDED_PLAN_NAME`) | today's prose                     |
  | `review-report-plan`     | `-1`  | `review-report-YYYY-MM-DD-plan-<slug>[-N].md`                            | today's prose                     |
  | `review-report-workflow` | `-1`  | `review-report-YYYY-MM-DD-<workflow>[-N].md`                             | today's prose                     |
  | `review-report-security` | `-1`  | `review-report-YYYY-MM-DD-security[-N].md`                               | user decision                     |
  | `review-report-local`    | `-1`  | `review-report-YYYY-MM-DD[-N].md`                                        | user decision                     |
  | `investigation`          | `-1`  | `investigation-YYYY-MM-DD-<slug>[-N].md`                                 | user decision (no rule today)     |
  | delivery branch          | `-2`  | `<prefix>/<skill>/<slug>[-N]`                                            | user decision (unspecified today) |
  - **Out of scope:**
    - `initial-state`, a fixed name with no collision rule;
    - the `docs` targets, undated topic slugs whose collision is a user question (`docs.md`).
  - **Taken names:** a name is taken when any directory entry exists at it, tested with `lstat`, so
    a file, directory, or symlink (including a dangling one) all count. For `plan` and
    `unattended-plan`, a name present in `<plan.dir>/archive/` also counts, which pins the
    plan-file convention's ban on same-name duplicates.
  - **No reservation:** allocation computes the name only and creates nothing. The concept's place
    operation (WP6) is the later writer.

- **Local date.** The date is the local calendar date in the process time zone, which is what
  `date +%F` gives. It is computed through `Intl.DateTimeFormat` with an injectable time zone and
  clock, so fixtures can pin the day boundary. The CLI accepts no date override.
- **Base-branch resolution, split along the fetch.**
  - **`base-branch-resolve`:**
    - It derives the default: `origin/` plus the `origin/HEAD` branch, else `origin/main`.
    - It classifies the value against the `git remote` list.
    - **No remote:** it resolves the local ref, and at most once retries with only the branch part
      after the first `/`. It returns `resolved` or `resolved-substituted`, both carrying an equal
      base ref and local branch, or `unresolvable`.
    - **Remote:** it returns `fetch-required` with `remote` and `branch`, and never resolves a local
      ref.
    - Every `rev-parse` call uses `--verify` and `--end-of-options`.
  - **`base-branch-fetch`:**
    - It accepts only a remote that `git remote` lists. The branch must pass `fetchableUpstream`'s
      guard, called with `refs/heads/<branch>`. That guard rejects a leading `-` only on the
      remote, and on the ref it rejects `:+*^`, whitespace and control characters and then runs
      `git check-ref-format`. `git check-ref-format` accepts `refs/heads/--upload-pack=x`.
      The mechanics input schema therefore adds its own branch-name rule: a `branch` that starts
      with `-` is `INVALID_INPUT`. This is a rule about branch names, not a copy of the guard. The
      `--` separator makes such a value harmless anyway, but the helper still refuses it.
    - It fetches through the imported guard, with hooks disabled, `--no-tags`, `--`, the
      non-interactive environment and the timeout.
    - After the fetch it compares `FETCH_HEAD` with `refs/remotes/<remote>/<branch>`. A narrowed
      `remote.<name>.fetch` refspec or a single-branch clone leaves the tracking ref stale or
      absent, which gives `tracking-stale`. This follows `delivery-selection`'s `fetch.stale` guard
      (`delivery-selection-core.mjs:1762–1772`).
    - It returns one of five outcomes:
      - `resolved`: base ref `remote/branch`, local branch `branch`, plus `divergence` or `null`.
      - `fetch-failed`, carrying stderr passed through `diagnosticText`, which caps the length and
        redacts URL userinfo and tokens.
      - `fetch-denied`, so Codex prose can retry with escalation. It is reported only for named
        patterns: a sandbox network denial, and `EPERM` or `EACCES` on a write below `.git`. An
        SSH authentication failure such as `Permission denied (publickey)` is explicitly
        `fetch-failed`, because escalation cannot fix credentials.
      - `tracking-stale`.
      - `unresolvable`.
  - **With a remote configured, no outcome falls back to a local branch.**
  - **Divergence:** the `origin/HEAD` comparison runs only for remote `origin`. It is silent when
    `origin/HEAD` does not resolve or when `deliberateDivergence` is true.
- **Delivery branch naming.**
  - `delivery-branch-name` slugifies `text`.
  - In hidden mode it strips disclosure matches, including attached letters and digits up to the
    nearest hyphen, collapses hyphens, and repeats until nothing matches. An empty result falls back
    to `change`.
  - The name is composed with or without the prefix.
  - A name is taken when a local branch or a same-named remote-tracking ref exists, or when the
    name is listed in `excludeNames`. The suffix then starts at `-2`. Worktrees share `refs/heads`,
    so a branch checked out elsewhere is already a local branch.
  - **Caller-side checks (user decision):** the helper stays offline. Checks that the helper cannot
    or should not run stay with the caller:
    - `plan-publication`'s `git ls-remote --heads origin <name>` guard, which exists so that a
      stale tracking ref cannot hide a remote branch;
    - `deliver`'s unused-worktree-path check.

    When such a check finds the returned name taken, the prose calls `delivery-branch-name` again
    with that name added to `excludeNames`, and repeats until a name passes. The suffix rule
    therefore exists only in the helper, and both guards are preserved. An `excludeNames` entry
    that fails `git check-ref-format --branch` is `INVALID_INPUT`.

  - **Case-sensitivity reconciliation:** the slug forms match case-insensitively, in both the
    stripper and `assertUndisclosed`. The spaced, case-sensitive `Effective Flow` form cannot occur
    in a slug or ref name, because slugify removes spaces and lowercases. The patterns therefore
    stay unchanged, and a test asserts that every stripped slug passes `assertUndisclosed`.
  - It validates the result with `git check-ref-format --branch`.
  - In hidden mode, the **full** branch name must pass `assertUndisclosed`. A disclosing configured
    prefix returns outcome `prefix-discloses` and no name. This backstops `setup`, which already
    rejects such a prefix in hidden mode (`src/shared/setup-advanced-settings.md:35`).
  - It returns `named`, with `branch`, `slug`, `originalSlug` and `sanitized`.
- **ADR numbering.**
  - **`adr-observe`** returns the observed-evidence convention (`numbered` with its width,
    `numberless`, `inconclusive`, or `none`) and the file set. It applies the exclusions of
    `project-adr-convention.md`.
  - **`adr-allocate`** handles **new** ADRs only. An ADR that is being updated is written at its own
    path by the prose and never calls `adr-allocate`; the no-rename rule therefore needs no
    operation, and the fragment keeps only that sentence.
  - **Call protocol:** the prose calls `adr-allocate` once to obtain the target. It calls it again
    immediately before writing, passing that target as `previousTarget`.
    - The target is still free: `allocated` with the same name.
    - The target is taken and the convention is numbered: the helper re-allocates once and re-tests
      the new path within the same call. If that path is free, the outcome is `reallocated` with
      the new name. If it is also taken, the outcome is `collision-stop` with both paths. This is
      today's "re-allocate once, a second collision stops" rule.
    - Numberless and taken: `collision-stop`.

    `allocated` also covers the first call. `widened` is a boolean field on the `allocated` and
    `reallocated` data, not an outcome. It is true when the pad width grew by one digit. Numbers
    never wrap.

  - **Containment** outcomes are `symlink-stop`, `outside-repo-stop` and `unrecognized`.
    - `outside-repo-stop` is `ok:true` and carries `resolvedPath`, because
      `project-adr-convention.md` requires the stop to name the resolved path. `adrDir` is
      therefore exempt from the generic `UNSAFE_PATH` containment error.
    - `unrecognized` means the Effective Flow default applies.
- **Plan-reference resolution is exact.**
  - **Path:** relative to `cwd`, or absolute, as today's "full path" form allows. Either way it
    must lie physically inside `<plan.dir>/` or `<plan.dir>/archive/`.
  - **File name:** with or without `.md`, an exact name match in either directory.
  - **Legacy number:** an exact `# NNNN:` H1 match first. The file-name segment
    (`YYYY-MM-DD-NNNN-…` or an unmigrated `NNNN-…`) counts only for a file without an H1.
  - **Title slug:** exact equality with the file name's slug part, after the date and an optional
    legacy number, or after the legacy number alone for an unmigrated `NNNN-slug.md`. No substring
    or prefix match.
  - **Outcomes:**
    - `resolved`, with the path, its location (`top` or `archive`), the `classifyPlanText` status,
      and an `exact` flag. The flag is true for the path and file-name forms, and `plan`'s
      revision rule uses it.
    - `ambiguous`, listing every candidate. This includes the same file name existing at the top
      level and in the archive, which is a convention violation, so the helper never picks.
    - `not-found`.
- **Judgment stays in prose.** The helper does not decide any of the following; it receives them
  as input:
  - the text a slug is derived from;
  - whether an argument is a plan reference at all (`apply-source-detection`);
  - every question about an ambiguous reference, an implemented plan, or an unclear status;
  - the declared ADR convention and width, and whether sources contradict;
  - the deliberate-divergence silence rule, passed as `deliberateDivergence`;
  - whether to escalate after `fetch-denied`.

## Affected files

| File                                                                                                                                                                     | Description                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-mechanics.mjs`                                                                                                                               | New thin CLI: operation dispatch, stdin cap, envelope, exit codes, process runner injection.                                                                                                                                                       |
| `src/scripts/effective-flow-mechanics-core.mjs`                                                                                                                          | New core: `slugify`, local date, the existence predicate, internal containment, the seven operations, family table, outcomes, and error re-coding.                                                                                                 |
| `src/scripts/plan-lint-core.mjs`                                                                                                                                         | Receive `UNATTENDED_PLAN_NAME` and `refPathProblem`, moved from `plan-publication-core`, as named exports. Export `resolveRoots`, `resolveFileEntry`, `readPlanFile` and `listTopLevel` unchanged. Stays a leaf.                                   |
| `src/scripts/plan-publication-core.mjs`                                                                                                                                  | Import `UNATTENDED_PLAN_NAME` and `refPathProblem` from `plan-lint-core` instead of defining them, and re-export both for the identity test. No behaviour change.                                                                                  |
| `src/scripts/delivery-selection-core.mjs`                                                                                                                                | Export the private `fetchableUpstream` guard and `HOOKS_DISABLED` unchanged. `nonInteractiveFetchEnv`, `UPSTREAM_FETCH_TIMEOUT_MS` and `diagnosticText` are already exported.                                                                      |
| `src/scripts/remote-tracker-shared-core.mjs`                                                                                                                             | Export `PRODUCT_NAME_PATTERNS` unchanged.                                                                                                                                                                                                          |
| `build.mjs`                                                                                                                                                              | Add both files to `RUNTIME_SCRIPT_FILES`, keeping the array format that `test/execution-profile-contract.test.mjs` parses. Lower the `CONTEXT_BUDGET_LINES` entry of every eager host whose built size drops.                                      |
| `scripts/distribution-smoke.mjs`                                                                                                                                         | Add both files to its own `RUNTIME_SCRIPT_FILES` copy. Add a read-only smoke in every target: `name-allocate` and `plan-reference-resolve` against a temp repo.                                                                                    |
| `test/effective-flow-mechanics.test.mjs`                                                                                                                                 | New fixture suite with a fake runner and temp directories. It covers slugify, local date, every family scheme, branch naming, ADR, reference resolution, CLI envelope and error mapping.                                                           |
| `test/effective-flow-mechanics-git.test.mjs`                                                                                                                             | New real-git suite against a local bare remote. It covers the base-branch arms, the fetch failure with a remote configured, ref and option injection, a single-branch clone (`tracking-stale`), branch existence and `origin/HEAD` divergence.     |
| `test/plan-lint.test.mjs`, `test/plan-publication.test.mjs`, `test/plan-publication-git.test.mjs`, `test/delivery-selection*.test.mjs`, `test/remote-tracker-*.test.mjs` | Pin that the moved and newly exported symbols behave as before, that `plan-publication-core` re-exports the identical `plan-lint-core` objects, and that the mechanics fetch argv and environment equal `delivery-selection`'s for the same input. |
| `test/workflow-contracts.test.mjs`                                                                                                                                       | Update the prose pins of the reduced fragments. The deliberate-divergence pins move to the flag wording. Each pin names its invariant.                                                                                                             |
| `test/unattended-planning-contract.test.mjs`                                                                                                                             | Re-point the P-NUM row pin (lines 189–191) at the helper's `ambiguous` outcome.                                                                                                                                                                    |
| `test/execution-location-contract.test.mjs`, `test/runtime-state-safety-contract.test.mjs`, `test/memory-state-contract.test.mjs`                                        | These suites read `unresolved-review-report`. Update any assertion whose invariant (execution location, runtime-state guard, memory-state reference) sits in naming prose that moves, and leave the rest untouched.                                |
| `src/shared/base-branch-resolution.md`                                                                                                                                   | Reduce to the two helper calls, outcome handling (including `fetch-denied` with Codex escalation), and the deliberate-divergence judgment that sets the flag.                                                                                      |
| `src/shared/worktree-integration.md`                                                                                                                                     | Replace step 4's naming and sanitizer prose with a `delivery-branch-name` call and outcome handling.                                                                                                                                               |
| `src/tools/deliver.md`                                                                                                                                                   | Remove the restated sanitizer and suffix rule at step 3.2 and call `delivery-branch-name`. The worktree path check stays, and feeds a taken name back through `excludeNames`.                                                                      |
| `src/shared/plan-publication.md`                                                                                                                                         | Replace the `<delivery.branchPrefix>/<skill>/<slug>` construction and its suffix rule (lines 169–175) with a `delivery-branch-name` call. The `ls-remote --heads` check stays, and feeds a taken name back through `excludeNames`.                 |
| `src/tools/pr.md`                                                                                                                                                        | Keep the head-branch disclosure **assertion** at line 150. Remove any restated strip rule.                                                                                                                                                         |
| `src/shared/plan-numbering.md`                                                                                                                                           | Replace the naming rule and the resolver copy ("Resolve a plan reference") with helper calls. The legacy migration stays, for WP6.                                                                                                                 |
| `src/shared/unattended-planning.md`                                                                                                                                      | Replace the unattended plan naming with family `unattended-plan`. Re-point row P-NUM (line 133) at the helper's `ambiguous` outcome.                                                                                                               |
| `src/shared/concept-contract.md`                                                                                                                                         | Replace the concept naming rule with `name-allocate` family `concept`. Concept-reference resolution (line 38) stays, because it is out of scope.                                                                                                   |
| `src/shared/unresolved-review-report.md`, `src/shared/security-disclosure-gate.md`                                                                                       | Replace the report naming with the `name-allocate` families.                                                                                                                                                                                       |
| `src/tools/plan.md`, `src/tools/review.md`, `src/tools/investigate.md`, `src/tools/build.md`, `src/tools/fix.md`, `src/tools/refactor.md`                                | Replace the naming rules and the restated `review-report-…-plan-<slug>` copies with the helper call or a pointer to the owning fragment.                                                                                                           |
| `src/shared/plan-reference-routing.md`                                                                                                                                   | Replace the resolution section with `plan-reference-resolve`. The status, workflow and open-point checks stay in prose.                                                                                                                            |
| `src/shared/apply-source-detection.md`, `src/tools/plan-review.md`                                                                                                       | Replace the restated reference forms with a pointer to the helper or the owning fragment.                                                                                                                                                          |
| `src/shared/project-adr-convention.md`                                                                                                                                   | Replace the mechanical sections (evidence scan, width, number, containment, collision) with `adr-observe` and `adr-allocate`, keeping one sentence for the no-rename rule. The tiers and judgment stay.                                            |
| `evals/merge-gate/suite.config.mjs`, `evals/iterate/suite.config.mjs`, `evals/next-steps/suite.config.mjs`                                                               | Seed the helper pair, its three imported cores (`plan-lint-core`, `delivery-selection-core`, `remote-tracker-shared-core`) and the CLI's `process-runner` wherever a suite's closure now executes the helper.                                      |
| `docs/adr/mechanics-helpers-import-owning-cores.md`                                                                                                                      | New ADR (see "Architecture decisions").                                                                                                                                                                                                            |
| `docs/developer-guide/build-system.md`                                                                                                                                   | Runtime scripts section: add a mechanics bullet, correct the stale script count (the docs say 27; the list holds 29 before this change), and update the dependency-free guard list.                                                                |
| `docs/developer-guide/release-and-installation.md`                                                                                                                       | Correct the runtime script count and the family list.                                                                                                                                                                                              |
| `docs/developer-guide/plan-conventions.md`                                                                                                                               | Point the naming and collision description to the helper as its source of truth.                                                                                                                                                                   |

## Implementation details

### Approach

1. **Fixtures first (red).** Write `test/effective-flow-mechanics.test.mjs` and
   `test/effective-flow-mechanics-git.test.mjs` against the input schemas and outcomes above, before
   any implementation.
   - Every expectation cites the current prose or a pinned decision in a comment.
   - Fixtures are temp directories (`mkdtempSync` plus `realpathSync`), as in the existing script
     tests, not checked-in trees.
   - Together they cover every case under "Edge cases".
   - The failing suite is committed only together with step 3, so `develop` never carries a red
     test.
2. **Move and export.**
   - Move `UNATTENDED_PLAN_NAME` and `refPathProblem` into `plan-lint-core`, and have
     `plan-publication-core` import them.
   - Add the named exports to `plan-lint-core` (`resolveRoots`, `resolveFileEntry`, `readPlanFile`,
     `listTopLevel`),
     `delivery-selection-core` (`fetchableUpstream`, `HOOKS_DISABLED`) and
     `remote-tracker-shared-core` (`PRODUCT_NAME_PATTERNS`), plus the re-export in
     `plan-publication-core`.
   - Run the existing suites unchanged to prove no behaviour moved, and add the parity tests.
3. **Core and CLI.**
   - Implement the core until the step 1 suite is green, then add the CLI.
   - List both files in `RUNTIME_SCRIPT_FILES`, in `build.mjs` and in
     `scripts/distribution-smoke.mjs`, and add the distribution smoke.
   - Run `node build.mjs` and confirm that the dependency-free guard and the byte-identical shipping
     guard pass.
4. **Write the ADR** `docs/adr/mechanics-helpers-import-owning-cores.md`.
5. **Reduce the prose, one procedure per commit**, each with its contract-pin updates:
   1. base-branch resolution;
   2. delivery branch naming, together with the `deliver`, `plan-publication` and `pr` sites;
   3. name allocation, in the owning fragments and the restating tools, plus P-NUM;
   4. ADR numbering;
   5. plan-reference resolution, together with its restatements.

   Prose calls the helper with `node <skill-root>/scripts/effective-flow-mechanics.mjs
   <operation>` and one JSON object on stdin, and names every outcome the host branches on. A rare
   outcome (`resolved-substituted`, `fetch-denied`, `tracking-stale`, `prefix-discloses`,
   `archive-unusable`) or the `widened` flag goes behind a
   ` ```lazy-include ` only where progressive disclosure allows it. Every host treats a nonzero
   exit, an unparsable envelope or `ok:false` as a stop. It never falls back to replaying the rule
   by hand, which matches the `plan-lint` fail-closed rule.

6. **Budgets.** Run `node build.mjs` and read the `Always-loaded core (lines/budget)` report. Set
   each changed `CONTEXT_BUDGET_LINES` entry to its built count plus at most ten lines.
   - At minimum: `pr`, `refactor` and `setup`, which are the concept's criterion.
   - Also every other eager host that shrinks: `maintain`, `apply`, `apply-plan`, `apply-issues`
     and `apply-review`.
7. **Evals.**
   - For each suite whose closure now contains prose that executes the helper, seed the helper pair
     with its three imported cores and `process-runner` in `loadSetSeeds`. This follows the rule in
     `evals/merge-gate/suite.config.mjs` that a runtime script the gate executes needs a seed.
   - `merge-gate` and `iterate` reach the helper through `worktree-integration` and
     `base-branch-resolution`.
   - For `next-steps`, check whether `plan-reference-routing` now makes a run execute the helper.
     `remote-tracker-shared-core.mjs` already sits in its `instrumentFiles`, so that instrument
     moves anyway.
   - Run `pnpm eval <suite> verify` for all three suites, and compare against the baseline verdict
     recorded before the change to see which ones moved.
     Re-recording is owed before the next release (AGENTS.md), and the PR description says so.
8. **Docs.** Update `build-system.md`, `release-and-installation.md` and `plan-conventions.md`.
9. **Full CI order:** `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

### Edge cases

**Base-branch resolution**

- **Remote configured, fetch fails** (unreachable remote URL): `fetch-failed`. A same-named local
  branch exists in the fixture and is never returned.
- **Remote configured, branch absent remotely:** `fetch-failed` or `unresolvable`, never the local
  branch.
- **Sandbox refusal,** simulated by the fake runner's network-denial error and by `EPERM` on a
  `.git` write: `fetch-denied`. SSH `Permission denied (publickey)` is `fetch-failed`.
- **Stale tracking ref:** a single-branch clone, or a narrowed `remote.origin.fetch`, where the
  fetched branch is not mapped: `tracking-stale`, never `resolved`.
- **Redaction:** `fetch-failed` from a remote URL that carries userinfo or a token returns stderr
  with the credential redacted.
- **Timeout key:** the fake runner records `timeoutMs` equal to `UPSTREAM_FETCH_TIMEOUT_MS` on the
  fetch call.
- **Injection attempts:** `origin/--upload-pack=x` and `origin/-x` are `INVALID_INPUT` through the
  mechanics branch-name rule. `origin/x:refs/heads/main`, `origin/+x` and a branch with a control
  character are `INVALID_INPUT` through the imported guard. In every case no fetch runs. The same applies to a
  remote that `git remote` does not list. A local value starting with `-` reaches `rev-parse` only
  after `--end-of-options` and is `unresolvable`.
- **Hang:** a fetch that would prompt for credentials ends in `fetch-failed` within the timeout
  under the non-interactive environment.
- **Grandchild holds the pipes:** a fake runner result with `forcedKill: true` maps to
  `fetch-failed`. The recorded call carries `processGroup: true`.
- **`feature/foo` with no remote named `feature`:** local arm. A value without `/` is never a
  remote ref.
- **No remote, `origin/develop` configured, local `develop` only:** `resolved-substituted`. If
  neither resolves: `unresolvable`, and no branch is created.
- **Absent `delivery.baseBranch`:** default from `origin/HEAD`, else `origin/main`, then classified
  like an explicit value.
- **`origin/HEAD` divergence:** only for remote `origin` and only when it resolves. Suppressed by
  `deliberateDivergence: true`. A non-origin remote is not compared.

**Local date**

- The same instant yields different dates in `Pacific/Kiritimati` and `Etc/GMT+12`.
- Local `23:59:59` and `00:00:00` fall on the expected days.

**Slugify**

- Covered inputs: `Größenänderung`, its NFD form, `Élan vital`, mixed punctuation, leading and
  trailing symbols, digits, a 200-character title cut at a hyphen within 80 characters, and a
  single 120-character word cut hard at 80.
- An empty slug is `INVALID_INPUT` for `name-allocate`, so the prose must supply text. For branch
  naming, an empty slug becomes `change`.

**Name allocation**

- Every family with zero, one and two existing collisions. Plans go from no suffix to `-2` to
  `-3`; reports and investigations go from no suffix to `-1` to `-2`.
- A plan name present only in `<plan.dir>/archive/` counts as taken.
- A directory, a symlink or a dangling symlink at the candidate name counts as taken.
- Every allocated `unattended-plan` name matches `UNATTENDED_PLAN_NAME`.
- Name components:
  - `workflow: "x/../../y"`, an unknown `workflow` or `skill`, a `planSlug` outside the slug
    alphabet, and `issue: 0` are all `INVALID_INPUT`.
  - A symlinked `dir` that escapes `cwd` is `UNSAFE_PATH`.

**Delivery branch naming**

- Hidden-mode stripping removes `effectiveflow`, `Effective-Flow`, `effective_flow`,
  `effective.flow` and attached letters or digits: `myeffectiveflow2-login` becomes `login`.
  Nested forms are stripped by repetition, and stripping everything gives `change`. Every
  stripped branch passes `assertUndisclosed`.
- In hidden mode, a prefix such as `Effective-Flow` gives `prefix-discloses`.
- An empty prefix gives `<skill>/<slug>`.
- **`excludeNames`:** with `x/foo` listed, the result is `x/foo-2`. With `x/foo` and `x/foo-2`
  listed, it is `x/foo-3`. An invalid ref name in the list is `INVALID_INPUT`.
- **Existing branch:** a local branch, or a remote-tracking ref of any configured remote, counts as
  taken. The suffix then goes `-2` upwards, and the result passes
  `git check-ref-format --branch`.

**ADR numbering**

- **Observation:**
  - The evidence set excludes `README.md`, `index.md` and the `effective-flow-project-setup` and
    `firmo-project-setup` stems.
  - The result is numbered at one width, numberless, inconclusive, or `none` for an empty set.
- **Allocation:**
  - The allocation scan includes the excluded files.
  - The read side accepts `_`; the write side writes a hyphen.
  - The first number is `0001` at the resolved width.
  - A declared width outside 1–10 falls back to the observed width, then 4.
  - Saturation sets `widened: true`, and numbers never wrap.
- **Containment:**
  - An existing symlink at the target, dangling included: `symlink-stop`.
  - A name that fails `^(?:\d+-)?[a-z0-9][a-z0-9-]*\.md$`, or a parent mismatch: `unrecognized`.
  - An ADR directory outside the repo root: `outside-repo-stop` with `resolvedPath`, as `ok:true`
    and not `UNSAFE_PATH`.
- **Collision:**
  - `previousTarget` still free: `allocated`, same name.
  - Taken and numbered, with the re-allocated path free: `reallocated`.
  - Taken and numbered, with the re-allocated path also taken: `collision-stop`, naming both
    paths.
  - Taken and numberless: `collision-stop`.

**Plan-reference resolution**

- A legacy number whose title makes the file name look migrated (`2024 Retrospective`) resolves
  through the H1 first.
- An unmigrated `0007-foo.md` resolves by `0007` and by `foo`.
- A file name without `.md` resolves.
- The same file name at the top level and in the archive is `ambiguous`.
- A title slug matching two files is `ambiguous`.
- A substring-only slug is `not-found`.
- An absolute path inside `<plan.dir>` resolves.
- A path outside `<plan.dir>`, relative or absolute, is `UNSAFE_PATH`.
- A dangling `<plan.dir>` symlink is `UNSAFE_PATH`, re-coded from `plan-lint-core`'s `NOT_FOUND`.
- A missing archive contributes no candidates.
- A dangling `archive` symlink gives `archiveIgnored: true` for resolution, and `archive-unusable`
  for plan-family allocation.

**CLI**

- An unknown operation is rejected before stdin is read.
- An oversized stdin is `INVALID_INPUT`.
- An unknown key is `INVALID_INPUT`.
- Every imported-core error is re-coded per the error mapping.

## Acceptance criteria

- [ ] `pnpm test` passes. This includes the two new suites, which cover every edge case listed
      above, and the parity tests for the moved and exported symbols.
- [ ] `node build.mjs` passes, and both helper files ship byte-identical in `dist/claude`,
      `dist/codex` and `dist/portable`.
- [ ] `pnpm test:distribution` passes, including the new mechanics smoke in every target.
- [ ] `pnpm agent:check` passes.
- [ ] The core contains no copy of a status-marker table, the unattended plan-name pattern, the
      ref-path rule, the fetch guard or environment, or a disclosure pattern. A test reads the
      core's import list and asserts that every relative import is exactly one of
      `plan-lint-core`, `delivery-selection-core` or `remote-tracker-shared-core`. In particular,
      `process-runner`, `plan-publication-core` and `setup-status-core` are absent.
- [ ] No restated rule is left. Before any prose change (step 1), record a pattern list in the PR
      description. Use single-token or `rg -U` multiline patterns, taken from text that exists
      today. The starting set:
  - `` `a–z` `` for the slug alphabet (`plan-numbering.md:14`, `concept-contract.md:31`);
  - `-2.md` and `-1.md` for collision suffixes (`plan-numbering.md:20`, `concept-contract.md:35`,
    `unresolved-review-report.md:60,63`);
  - `[-N]` (`security-disclosure-gate.md:50`, `review.md:588`);
  - `letters or digits attached` for the strip rule (`worktree-integration.md:159`);
  - `title slug` for the reference form list (`plan-numbering.md`, `apply-source-detection.md`);
  - `next unused integer` for ADR allocation (`project-adr-convention.md`).

  Run against the base commit, every pattern must produce at least one hit, so that no pattern is
  vacuous. Run after the change over `src/shared` and `src/tools`, the patterns must produce no
  hit except at these allowed sites:
  - concept-reference resolution in `concept-contract.md` (out of scope);
  - the `docs` topic-slug rule in `docs.md` and `doc-categories.md`;
  - the head-branch disclosure assertion in `pr.md`;
  - the legacy-migration section of `plan-numbering.md` (WP6);
  - `plan.md`'s revision rule ("no `-2` suffix") and its "fuzzy match" judgment with the matching
    lazy-include `when:` line (`plan.md:162,168`);
  - any pre-change hit that lies outside the five procedures, listed with its reason in the PR
    description.

  The updated contract pins assert the absence at each site that was pinned before.

- [ ] The `CONTEXT_BUDGET_LINES` entries of `pr`, `refactor` and `setup`, and of every other eager
      host that shrank, are lower than on the base commit. Each equals its built line count plus at
      most ten lines.
- [ ] `docs/adr/mechanics-helpers-import-owning-cores.md` exists, and the developer guide names the
      helper and states the correct runtime script count.
- [ ] `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval next-steps verify`
      have run. The PR description lists the moved instruments and states that their re-recording
      is owed before the next release.

## Validation plan

- **Unit and real-git suites:** `node --test test/effective-flow-mechanics*.test.mjs`. The fixture
  suite is written and seen failing before the core exists (step 1).
- **Parity tests** in the existing `plan-lint`, `plan-publication`, `delivery-selection` and
  `remote-tracker` suites.
- **CI order:** `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- **Manual spot check** of each reduced fragment. Run the documented command against this
  repository: `base-branch-resolve` should return `fetch-required` for `origin/develop`, and
  `plan-reference-resolve` should resolve this plan by its file name. Then confirm that every
  outcome the helper can return has a branch in the prose.
- **Eval check:** `pnpm eval <suite> verify` for all three suites (read-only), to document which
  instruments moved.

## Assumptions and open points

- **Taken branch names.** The helper counts a branch name as existing when it is a local branch,
  a same-named remote-tracking ref, or listed in `excludeNames`. This is broader than a local-only
  check, but it can only choose a higher suffix, never reuse a taken name. Two checks stay in
  prose: `plan-publication`'s `ls-remote` check and `deliver`'s worktree-path check. They feed
  back through `excludeNames`.
- **Exact slug matching.** The concept fixes exact equality for title-slug references. A user who
  relied on partial matches now gets `not-found` and can use the file name instead.
- **Archive collisions.** Treating a name present only in the archive as taken during plan
  allocation follows the plan-file convention's ban on same-name duplicates. It pins intended
  behaviour rather than adding a rule.
- **`fetch-denied` detection.** It relies on the named sandbox and `EPERM`/`EACCES` patterns. When
  a refusal is not recognizable it surfaces as `fetch-failed`, which still stops delivery and
  never falls back.
- **Absolute plan paths.** These are accepted when they are physically inside the plan or archive
  directory, which keeps today's "full path" form. They are not a behaviour change.
- **Out of scope, later work:**
  - Writing the absolute-path allow rule in `setup` belongs to WP3. This work only makes each
    operation name a stable command prefix.
  - Eval re-recording is owed before the next release, not in this change (AGENTS.md).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         1 |    4 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

All findings are incorporated. The Phase 4 gap analysis reported one Critical finding before this
review: the allowlisted fetch passed an unchecked, repository-controlled branch to git. It was
incorporated before this review, through the ref guard, `--` and hook suppression.

- **Architecture, Important:** `fetchUpstream` passes `timeout:`, but the injected runner reads
  `timeoutMs`. Reusing it would drop the 60 s bound. Incorporated: the core composes the fetch from
  the imported guard, environment and hook constants, passes `timeoutMs`, and argv-parity and
  timeout-key tests guard it.
- **Architecture, Important:** the plan rejected `resolveRoots`, which is the owning plan-path
  resolution. Incorporated: `resolveRoots` and `resolveFileEntry` are imported for plan paths. The
  internal guard is limited to ADR and runtime-report directories until WP2.
- **Security, Important:** name components and the `name-allocate` directory were unvalidated.
  Incorporated: a closed enum for `skill` and `workflow`, the slug alphabet for `planSlug`, an
  integer `issue`, a single-segment name check, containment for `dir`, and fixtures for each.
- **Error cases, Important:** a narrowed refspec or a single-branch clone leaves a stale tracking
  ref. Incorporated: a `FETCH_HEAD` comparison and the `tracking-stale` outcome.
- **Error cases, Important:** `reallocated` skipped the second collision check. Incorporated: the
  re-allocated path is re-tested within the same call, and a second collision is
  `collision-stop`.
- **Error cases, Important:** absolute plan paths were rejected. Incorporated: they are accepted
  when contained.
- **Testability, Important:** the `rg` criterion was unsatisfiable, and one pattern was vacuous.
  Incorporated: patterns are anchored to today's sentences, scoped to the affected files, with an
  explicit list of exceptions.
- **Error cases, Note:** SSH auth failures would be classified as `fetch-denied`. Incorporated:
  named patterns only, with SSH auth explicitly `fetch-failed`.
- **Data protection, Note:** stderr has to be redacted, not only capped. Incorporated: stderr goes
  through `diagnosticText`, with a redaction fixture.
- **Scope, Note:** the case-sensitivity reconciliation was not decided. Incorporated as a decision
  with a test.
- **Testability, Note:** the core's import test allowed `process-runner`. Incorporated: the test
  allows exactly the three cores, and `process-runner` is a CLI-only import.
- **Testability, Note:** the identity test was unrunnable. Incorporated: `plan-publication-core`
  re-exports both symbols.
- **Testability, Note:** the slug cap was undefined without a hyphen. Incorporated: a hard cut at 80.
- **Maintainability, Note:** the baseline drift list was incomplete. Incorporated: the full list,
  plus an eval-verify baseline recorded before the change.
- **Maintainability, Note:** the worktree-checked-out branch criterion was redundant. Removed.
- **Testability, Note:** the cited test lines were reads, not pins. Rephrased by invariant.

### Deep interactive review, 2026-10-29

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Error cases, Important (decided):** `delivery-branch-name` could not replace the
  `plan-publication` `ls-remote` guard or `deliver`'s worktree-path check without the prose
  replaying the suffix rule. User decision: an `excludeNames` input, with both checks fed back
  through it.
- **Architecture, Important:** the fetch lacked `processGroup` and signal cleanup, so the timeout
  could fail to end a grandchild that holds the pipes. Incorporated: `processGroup: true`, the
  `terminateActiveProcessGroups` handlers in the CLI, `forcedKill` treated as `fetch-failed`, and
  fixtures for these.
- **Architecture, Important:** the `plan-lint-core` exports could not be used unchanged.
  Incorporated:
  - `readPlanFile` and `listTopLevel` are exported as well;
  - an absolute reference is made relative before `resolveFileEntry`;
  - an explicit re-code table;
  - the dangling-archive behaviour is pinned, with `archiveIgnored` and `archive-unusable`.
- **Error cases, Important:** the injection fixture expected a leading-`-` rejection that the
  imported guard does not perform. Incorporated: the mechanics branch-name rule rejects a leading
  `-`, and the guard description is corrected.
- **Error cases, Important:** an escaping ADR directory had two contradictory results, and
  `widened` clashed with the single outcome string. Incorporated: `outside-repo-stop` is `ok:true`
  with `resolvedPath` and `adrDir` is exempt from the generic error; `widened` is a boolean field.
- **Testability, Important:** the `rg` patterns still matched nothing, or matched judgment prose.
  Incorporated: single-token or multiline patterns taken from today's text, a pre-change
  non-vacuity run, and the `plan.md` judgment lines added to the allowed sites.

## Open points

- No open points.

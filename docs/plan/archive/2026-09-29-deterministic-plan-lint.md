# Deterministic plan-file lint

**Plan status:** Implemented
**Source:** effective-flow plan-issue (#483)
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `e846936` on 2026-09-29. Delivered on `d341dfa`, the tip of `origin/develop`
that the delivery branch was fast-forwarded to before commit.

## Requirement

The mechanical rules of the plan-file contract existed only as prose that a model evaluated on
every run: exactly one status line with one of four valid key/value pairs, one language column for
every field and section, an open-points section in its empty state, acceptance criteria that are
present, no leftover template placeholders, and no same-name file at the top level and in the
archive. Counting and exact string matching are what a parser does reliably and a model does not.
This change adds the deterministic, dependency-free runtime script `plan-lint`, which carries out
the mechanical part of that contract. The prose stays normative, and judgment — whether criteria
are measurable, whether an assumption is implementation-relevant, whether an issue is
self-contained — stays with the model and `effective-delivery`.

## Architecture decisions

- **Mapping ownership.** `src/scripts/plan-lint-core.mjs` owns the bilingual mapping
  (`PLAN_CONTRACT_MAPPING`) and the placeholder list (`PLAN_PLACEHOLDERS`) as deep-frozen exports.
  Marked tables in `src/shared/plan-contract.md` project them, and build guards fail on any drift.
  This follows the pilot-measurement projection precedent.
- **Placeholders.** A second marked table lists the template tokens in German and English; the
  German plan rendering uses those fixed tokens. No generic bracket heuristic is used, and tokens
  inside inline code spans or fenced code are never flagged.
- **Duplicates** are checked on the file system only (same basename at `<plan.dir>/` and
  `<plan.dir>/archive/`). The git-index collision logic of `plan-archival` stays prose.
- **Budget.** The invocation, envelope and fail-closed contract live in the new lazy fragment
  `src/shared/plan-lint.md`. The eager fragments keep only short criteria naming the script fields.
- **Legacy spellings** `## Open Points` and `## Acceptance Criteria` are script-owned aliases
  outside the guarded table.
- **Fail closed.** A nonzero exit, an unparseable envelope, `ok: false`, a missing entry, or a
  failure to launch `node` is never a pass. An unclosed code fence never hides later content.

## Affected files

| File                                       | Description                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/scripts/plan-lint-core.mjs`           | New pure core: line inventory, classifier, containment, envelope helpers, owned constants        |
| `src/scripts/plan-lint.mjs`                | New thin JSON CLI (`lint` only), validates the operation before reading stdin                    |
| `src/shared/plan-lint.md`                  | New lazy fragment: invocation, fields, error codes, fail-closed rule per caller                  |
| `src/shared/plan-contract.md`              | Mapping table wrapped in markers; new bilingual placeholder table                                |
| `src/shared/apply-clarity-gate.md`         | Plan-file open-points and acceptance-criteria criteria read plan-lint fields; lazy pointer       |
| `src/shared/plan-status.md`                | "exactly one line outside fenced code blocks that begins with the prefix"                        |
| `src/shared/plan-reference-routing.md`     | Same sharpened status-line wording                                                               |
| `src/tools/open-plans.md`                  | Classification, unclear list, duplicates and header fields from one plan-lint call               |
| `src/tools/plan.md`                        | Phase 3 German placeholder note; Phase 5 mechanical check with a Phase 7 rerun on the final file |
| `build.mjs`                                | Registration in `RUNTIME_SCRIPT_FILES`, guard call, lowered `CONTEXT_BUDGET_LINES` entries       |
| `build-lib.mjs`                            | Marked-table parser and the two projection guards                                                |
| `scripts/distribution-smoke.mjs`           | Byte-identity for both files and a `plan-lint lint` smoke run in every target                    |
| `test/plan-lint.test.mjs`                  | New core and CLI suite                                                                           |
| `test/build-lib.test.mjs`                  | Guard failure and pass cases                                                                     |
| `test/execution-profile-contract.test.mjs` | Expected runtime scripts 14 → 16                                                                 |
| `docs/developer-guide/build-system.md`     | Runtime scripts section, Guards catalogue, lazy-fragment list                                    |

## Implementation details

### Approach

1. Core and CLI: `node <skill-root>/scripts/plan-lint.mjs lint` reads one closed-schema JSON
   object (`cwd`, `planDir`, optional `files`) and writes one `{ok, operation, data: {files}}`
   line. `INVALID_PAYLOAD`/`INVALID_CWD` exit 2, `UNSAFE_PATH` exits 3, anything else exits 1.
2. Containment: realpath of `cwd` is the root; `planDir` is `lstat`ed (a true ENOENT yields an
   empty list, a dangling link or non-directory is `NOT_FOUND`); `files` must sit directly in
   `<planDir>/` or `<planDir>/archive/`; each file is read through one descriptor opened with
   `O_NOFOLLOW | O_NONBLOCK`, whose `dev`/`ino` must match the containment-time stat.
3. Classification per file: `status` + `statusReason`, `language`, `openPoints`,
   `acceptanceCriteria`, `placeholders`, `duplicates`, `title`, `workflow`, `docCategory`,
   `targetPath`. CRLF and BOM files classify like their LF twins; headings may be indented up to
   three spaces; status lines count only at column 0 with exactly one space after the label.
4. Build guards: `parsePlanContractMarkedTable`, `assertPlanContractProjection` and
   `assertPlanPlaceholderProjection` (table ⊆ template and template ⊆ table, the template
   `**Result:**` value equals the table's review-result value, exactly one `markdown` fence in
   `plan.md` Phase 3). Every message starts with `plan-lint projection:`.
5. Callers: the clarity gate (plan files lint with `files: [<plan path>]`; issues and findings keep
   the prose path at any heading level), `open-plans` (one call without `files`), and `plan`
   Phase 5 (fix mechanical findings silently; never resolve open points by assumption; rerun on
   the final file in Phase 7).

### Edge cases

- A status line in fenced code, a blockquote, or indented code never counts; a German and an
  English status line give `unclear`/`duplicate` and `language: mixed`.
- `## Assumptions and open points` is not the open-points section; several open-points sections
  are summed; inside that section every non-blank line counts, fenced lines included.
- A placeholder-only acceptance-criteria section is `empty`, and the token is also listed.
- The review-result alternatives count as a placeholder only as the complete `**Result:**` value.
- A missing `archive/` yields no duplicates; a symlinked top-level `.md` is skipped in directory
  mode; a `\0` in any path is `INVALID_PAYLOAD`.

## Acceptance criteria

- [x] `src/scripts/plan-lint.mjs` and `src/scripts/plan-lint-core.mjs` exist, import only `node:`
      modules, and are listed in `RUNTIME_SCRIPT_FILES` (`build.mjs`, `scripts/distribution-smoke.mjs`)
      and `EXPECTED_RUNTIME_SCRIPTS` (length 16).
- [x] `test/plan-lint.test.mjs` covers every listed core case and passes under `pnpm test`.
- [x] CLI tests spawn the real entry point and assert the success envelope, `INVALID_PAYLOAD` and
      `INVALID_CWD` with exit 2, and `UNSAFE_PATH` with exit 3.
- [x] `pnpm test:distribution` proves byte-identical files in the claude, codex and portable
      targets and smoke-executes `plan-lint lint` in every target.
- [x] `node build.mjs` fails with a named guard error on mapping drift, placeholder drift, and a
      template token missing from the table, each proven by a `test/` case, and passes on the
      unmodified sources.
- [x] The three callers invoke the script through the lazy `plan-lint` pointer.
- [x] Net source lines: `apply-clarity-gate.md` 42 → 37, `plan-status.md` 28 → 28. No tool's
      always-loaded core grew; every dropped `CONTEXT_BUDGET_LINES` entry was lowered, none raised.
- [x] `src/shared/plan-lint.md` states the fail-closed rule for every failure form and caller.
- [x] `docs/developer-guide/build-system.md` names the pair, the guards and the new counts.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` exit 0, and
      `pnpm eval merge-gate verify` was run and recorded.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` from the delivery
  worktree root.
- `pnpm eval merge-gate verify`, compared with the same command on an archive of the base commit.
- A mutation check for each new guard and each review fix: the test must fail without the fix.
- The shipped portable CLI run over `docs/plan` and `docs/plan/archive`, directly and via a symlink.

## Assumptions and open points

- #486 (successor of `open-plans`) and #484 (config resolver) had not landed; `open-plans` keeps
  the caller role.
- Out of scope: the stale three-subsystem list in `build-system.md`, the git-index collision logic
  of `plan-archival`, the judgment criteria of the clarity gate, and callers beyond the three named
  ones.

## Plan review

**Result:** Approved

The plan review ran on the issue planning comment (Approved, no open points); its findings were
incorporated there before implementation.

## Open points

- No open points.

## Test results

- `pnpm agent:check`: exit 0.
- `pnpm test`: 1501 tests, 1500 pass, 0 fail, 1 skipped (the structural merge-gate freshness test
  that defers to `pnpm eval merge-gate verify`).
- `node build.mjs`: exit 0. Always-loaded core versus the base `d341dfa`: apply 594 → 586,
  apply-plan 589 → 581, apply-issues 1213 → 1205, build 620 → 612, fix 514 → 506, refactor 927 →
  919, docs 636 → 628, open-plans 145 → 135, plan 657 → 657; every other tool unchanged.
- `pnpm test:distribution`: offline checks passed.
- `pnpm eval merge-gate verify`: exit 0; all six scenarios are stale, identically on the base
  commit (same `current:` hashes), so the staleness predates this change and no edited fragment
  reaches the merge-gate load set. This change owes no re-recorded round.
- Corpus: over `docs/plan` and its 167 archived files, no plan's status classification changed;
  the only difference from the first core version is that the legacy `## Acceptance Criteria`
  heading of `2026-07-16-0033-gemini-cli-platform-target.md` is now recognized.

## Review findings

**Date:** 2026-09-29
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer, effective-flow-code-validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    21 |
| Open / Not implemented |     0 |

One further note was closed without change: the net-line criterion for `apply-clarity-gate.md`
was met partly by joining wrapped prose lines, which the plan sanctioned for net-zero edits; the
fragment grew in bytes while shrinking in lines.

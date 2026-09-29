## Plan-file lint

`plan-lint` executes the mechanical part of the plan-file contract. The prose contracts — the Plan
status convention (`plan-status`), the canonical bilingual plan contract (`plan-contract`), and the
clarification gate — stay normative; the script only evaluates their countable rules. Judgment
stays with the model and `effective-delivery`: whether criteria are measurable, whether an
assumption is implementation-relevant, and whether an issue or finding is self-contained.

Run `node <skill-root>/scripts/plan-lint.mjs lint` with exactly one JSON object on standard input;
input never travels as command-line arguments. The schema is closed, so an unknown key is rejected:

- `cwd`: the verified absolute root that holds `<plan.dir>` — the checkout root, or the verified
  `RUNTIME_STATE_ROOT` for a hidden-mode plan directory.
- `planDir`: `<plan.dir>` relative to `cwd`, never absolute and without a `..` segment.
- `files` (optional): `.md` paths relative to `cwd`, each directly in `<plan.dir>/` or
  `<plan.dir>/archive/`. Without `files`, every top-level `*.md` file of `<plan.dir>/` is linted in
  lexicographic order, `archive/` is consulted only for duplicates, and a missing `<plan.dir>/`
  yields an empty list.

Success is one line `{"ok":true,"operation":"lint","data":{"files":[...]}}` with exit 0; entries
keep the order of `files`. Every file entry carries all of these keys:

- `path`: relative to `cwd`, with POSIX separators.
- `status`: `open`, `implemented`, or `unclear`. `statusReason` is `missing`, `duplicate`,
  `invalid-value`, or `mixed-key-value` for `unclear`, and `null` otherwise. A value counts only
  with exactly one space after the label.
- `language`: `de`, `en`, `mixed`, or `unknown` (no contract label found).
- `openPoints`: the number of non-blank lines in the open-points section other than the canonical
  empty item (a wrapped item counts once per line), so `0` for the canonical empty state, or
  `null` when the plan has no such section.
- `acceptanceCriteria`: `missing` (no section), `empty` (nothing beyond placeholders), or `present`.
- `placeholders`: leftover template tokens as `{token, line}`, with a 1-based line. A token inside
  an inline code span is never flagged.
- `duplicates`: the `cwd`-relative paths of the same basename in the other location
  (`<plan.dir>/` versus `<plan.dir>/archive/`).
- `title` (first H1), `workflow`, `docCategory`, `targetPath`: header values as strings, or `null`.

Lines inside fenced code blocks never count, except in the open-points section, where every
non-blank line counts; an unclosed code fence never hides the content after it. Besides the contract labels, the script owns the legacy headings `## Open Points` and
`## Acceptance Criteria`.

Failure is `{"ok":false,"operation":…,"error":{"code":…,"message":…}}` with a nonzero exit:
`INVALID_PAYLOAD` — including a `\0` in any path — and `INVALID_CWD` exit 2; `UNSAFE_PATH` — a
path outside `cwd` or outside those two directories, a non-`.md` file, a symlink escape, or a file
swapped after the containment check — exits 3; anything else exits 1, such as `NOT_FOUND` (also a
dangling-symlink or non-directory `planDir`) or `INTERNAL`.

**Fail closed.** A nonzero exit, an envelope that does not parse, `ok: false`, a missing entry for
a requested file, or a failure to launch `node` is never read as a pass, and the caller does not
fall back to evaluating these rules by hand. The clarification gate treats the plan as **not
passed**; `{{SKILL:open-plans}}` stops with a report instead of listing plans; `{{SKILL:plan}}`
stops before its completion report (the Phase 5 check and its Phase 7 rerun). Each report names
the error code or the failure.

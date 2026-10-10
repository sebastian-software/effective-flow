## Hidden-mode setup arm

This fragment is loaded only when the visibility resolved to `hidden`, through the `Hidden` answer
or the `effective-flow setup hidden` invocation. It holds the hidden arm's two write steps: Step 1
(hidden), which replaces Step 1, and the Step 6 write that replaces items 3 and 4. Every other
hidden-mode exception stays with its step in `effective-flow setup`.

### Step 1 (hidden): `info/exclude` entry

In hidden mode this replaces Step 1; `.gitignore` is never read for a decision and never
written. Evaluate in this order and stop without any write at the first failed precondition:

1. **Git only.** Resolve the common directory with
   `git rev-parse --path-format=absolute --git-common-dir`, never a literal `.git/info/exclude`, so a
   linked worktree, a `--separate-git-dir` checkout, or a submodule reaches the one file every
   worktree reads. A non-Git directory, or a failing command, cannot be hidden: stop and explain.
2. **No tracked runtime content.** `git ls-files -- .effective-flow/` must list nothing. `info/exclude`
   cannot hide a tracked file, so any listed path stops the run with every path named; untracking
   them is the user's decision.
3. **Add the entry idempotently.** First check without following links (`test -L` before `test -d`
   or `test -f`): `<common-dir>/info` must be a real directory, not a symlink, and `info/exclude`,
   when present, a regular file, not a symlink, FIFO, device, or directory; both must physically
   canonicalize inside the canonical common directory. Any violation stops the run with the path
   named and nothing written. If `<common-dir>/info/exclude` already has a line that is exactly
   `.effective-flow/`, change nothing. Otherwise create a missing `info/` with a plain `mkdir` and a
   missing file exclusively (`O_CREAT|O_EXCL`), and append the single line `.effective-flow/` in one
   `O_APPEND|O_NOFOLLOW` write, preceded by a line break only where the file's last line lacks one;
   without a no-follow open, repeat the link check immediately before and after that one append.
   Never rewrite, reorder, or remove an existing line, and never add a second entry.
4. **Verify.** Run the non-verbose predicates `git check-ignore --no-index -- .effective-flow/config.json`
   and `git check-ignore --no-index -- .effective-flow/project-setup.md`; both must exit `0`, and any
   other exit blocks with the `-v` diagnostics only after the block. A tracked `.gitignore` negation
   outranks `info/exclude`: report its line and stop rather than editing it.
5. **Report the tracked leftovers, touch none.** If `.gitignore` still names `.effective-flow/`, for
   example after an earlier standard setup, report that this tracked line still mentions Effective
   Flow and that removing it is the user's decision. A tracked `AGENTS.md`/`CLAUDE.md` marker or
   project setup ADR stays untouched as well and is reported as shadowed by the local file.

### Writing the hidden local configuration

1. Immediately before writing, re-read the local file freshly from `RUNTIME_STATE_ROOT`. If it
   appeared, disappeared, or changed since Step 2, rebuild the target from the fresh values and
   obtain a new confirmation; never write over a change this run has not shown.
2. Apply "Runtime-state write safety" to the exact target
   `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`, then write it through a same-directory
   temporary file plus rename, as Step 6 item 5 describes that primitive, and remove the temporary file on
   any failure.
3. Use the envelope of Step 6 item 4 in the language `language.documentation.technical` resolves to
   (`# Effective Flow project setup`, `## Status` + `Active`, `## Context`, `## Configuration`,
   `| Key | Value |`, or the German envelope), the same row encoding, and this context sentence in
   that language: the file holds this checkout's hidden Effective Flow configuration, is ignored
   through the Git common directory's `info/exclude`, and is never tracked. Preserve unknown rows of
   an existing local file, but carry no seeded row that contradicts a forced value and no
   `delivery.branchPrefix` containing `effective-flow`; name every such dropped row in the
   before/after list.
4. Write no tracked file. A tracked ADR, marker, or `.gitignore` line found during the run is
   reported as shadowed or untouched, never edited or deleted.

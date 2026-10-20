## Targeted setup change

This fragment is loaded only when Step 0 of `effective-flow setup` classified the invocation as
**Targeted**: a non-empty argument that is not exactly one of the six keyword forms, kept verbatim.
It holds the whole Targeted contract; the setup core keeps only that classification and the
exception clauses that override its own steps.

A Targeted run poses no Visibility question and never runs Step 1, Step 2 items 1 and 3, Steps 4
and 5 beyond the owning question of each touched key, Step 6 items 5 to 7 (marker, migration,
`CLAUDE.md` fence), or Step 7. It writes no root file and never repairs `.gitignore`,
`info/exclude`, the marker, or a `CLAUDE.md` import; those stay with the full setup.

Resolve `language.chat` once at entry under the shared chat-language rule and never rebind it
during the run: a changed `language.chat` applies from the next run. Then check the precondition
first and interpret the free text only after it passed.

### Precondition

Resolve read-only with `tool: "setup"` (Step 2 item 2) and form the current values as Step 2
item 4 does, `data.retired` included. Continue only when `data.source.step` is 0 (the hidden local
file) or 1–2 (a project setup ADR). Otherwise stop without mutation and name what was found; each
of these stops points to `effective-flow setup` or `effective-flow setup express`:

- no configuration (step 4) or a transitional JSON source (step 3): first-time setup and the JSON
  migration stay with the full setup;
- a diagnostic Step 2 item 5 treats as an invalid source; a Targeted run never offers a
  replacement or overwrite;
- a `legacy-slug`, `dead-marker`, or `marker-divergence` diagnostic, because a write in place
  without the marker step would leave later runs reading a stale path;
- an unverifiable `RUNTIME_STATE_ROOT` (exit 3).

Several matching project setup ADRs (`several-match`, `writerStop`) also stop the run: name every
path and state that the duplicates must be resolved by hand before setup can continue, with no
pointer to a setup mode.

A legacy `**Firmo project setup:**` marker is no stop: report it and note that
`effective-flow setup express` switches the spelling.

### Interpretation

Map the free text, in any language, to operations on known schema keys (the config schema and the
`mergeGate.*` key table of `effective-flow setup`):

- _set_ `<key> = <value>`;
- _ask_ `<key>`: a change request without a value ("let me choose …"). It runs the owner's question
  for that key with the current value pre-selected. A value that is visibly a placeholder, such as
  `<exact check context>`, counts as no value and becomes an _ask_; it is never written;
- _reset_ `<key>`: remove the row so the source skill's default applies; for `language.chat` that
  is mirroring, never a `null` row;
- _question_: a read-only question about keys.

One request may hold several operations. Give each ambiguity one focused question offering only
valid readings or values ("prReview off" may mean `delivery.prReview` or `mergeGate.*`); never
guess. A key outside the schema is not written; existing unknown rows are preserved, never created
or removed. When nothing is recognized, a typo such as `exprss` included, say so, list the six
keyword forms and `effective-flow setup <free text>`, and stop without mutation.

### Refusals and redirects

Precondition stops end the whole run. Every other refusal applies to its operation only: report it
in the preview with its reason and route, and offer the remaining operations as one confirmed unit.

- `visibility` → `effective-flow setup hidden` to hide; `effective-flow setup` or `effective-flow setup guided`
  answering `Standard` to unhide.
- `executionProfiles.fast.enabled` → `effective-flow setup guided` → Advanced → Block 10.
- First-time-only actions (`.gitignore`, marker, `CLAUDE.md` import, rename probe, legacy JSON
  migration) → `effective-flow setup`.
- In hidden mode: every `tracker.*` key (the tracker is pinned to `local`), a forced row listed
  under "Safe defaults" of `effective-flow setup`, and a `delivery.branchPrefix` containing
  `effective-flow` in any letter case. This refusal replaces the owner's ask-again; add that
  `effective-flow setup` answering `Standard` leaves hidden mode.
- A non-schema key.

### Read-only answers

Answer each _question_ from `data.values` with the source path; in hidden mode add the forced
values. For an absent key say "not set — default: …": the schema default where the schema names
one, otherwise the source skill's default, naming that skill. An absent artifact-surface
`language.*` override inherits `language.project`, an absent `language.chat` mirrors the user's
language, and `delivery.baseBranch` follows the Step 4 base-branch rule. For a key whose retired
row `data.retired` lists, name that row and the action the retired-key rule of the configuration
building block assigns to it, and say that a Targeted change of any key offers its migration. An
answer writes nothing, asks no confirmation, and emits no next-steps block. A mixed request answers
first, then shows the change preview.

### Owner questions

For each touched key, run only that key's question from its owner, never a whole block: the
requested value is the proposal and the current value is shown as "currently recorded". A single
`mergeGate.maxRounds` change asks `maxRounds` alone. For an invalid enumerated value ask again
instead of falling back to the default, because the user asked for one specific change. "Core
switches" below are `setup-guided-core-switches`, numbered blocks those of
`setup-advanced-settings`.

| Key group                                                      | Owner                                              | Targeted rule                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `review.*`                                                     | advanced block 1                                   | —                                                                             |
| `applyReview.*`                                                | block 2                                            | —                                                                             |
| `language.project`, `language.*` overrides                     | core switches (Language), `config-setup-migration` | a `language.workflow` change offers the owner's legacy-key migration proposal |
| `plan.dir`, `concept.dir`                                      | block 4                                            | canonicalized, neither the same directory nor nested                          |
| `delivery.completion`, `delivery.prReview`                     | core switches                                      | —                                                                             |
| `delivery.baseBranch`, `delivery.returnBranch`                 | Step 4 base-branch rule                            | `git remote` / `origin/HEAD` proposal; a divergence is named in the preview   |
| `delivery.branchPrefix`, `delivery.mergeMethod`                | block 5                                            | —                                                                             |
| `worktree.enabled`                                             | core switches (Worktree)                           | —                                                                             |
| `worktree.setup`, `worktree.baseDir`                           | block 6                                            | —                                                                             |
| `tracker.mode`, `tracker.remoteToolOverride`                   | core switches (Tracker)                            | see below                                                                     |
| `tracker.externalTool`, `…Hint`, `…StartedState`, `…DoneState` | core switches (external), block 7                  | see below                                                                     |
| `skills.*`                                                     | block 8                                            | `agents.<name>` / `tools.<name>` only with source agent or tool names         |
| `mergeGate.*`, `.bots`, `.trigger`, `.check`                   | block 9, Step 5 collapse                           | see below                                                                     |

- Adding a reviewer to `mergeGate.bots` also touches its `.trigger` and `.check`. Collapse first
  ("Collapsing two `mergeGate.bots` spellings of one reviewer", Step 5), then block 9's
  per-reviewer follow-up asks both for the new reviewer, `.check` with its "not set" answer. A
  request touching only an existing reviewer's `.check` asks only `.check`; untouched reviewers are
  not asked. Removing a login from `mergeGate.bots` also removes its `.trigger` and `.check` rows in
  the same preview.
- Changing `tracker.mode` to `external` also touches the owner's external follow-ups
  (`tracker.externalTool`, `…Hint`, started and done state discovery) for every value that is
  missing or invalid. Changing it to `remote` touches `tracker.remoteToolOverride` only on
  `AMBIGUOUS_HOST`.
- External tracker keys follow their owner: fresh discovery and stable-ID matching, and an
  unavailable or ambiguous connection proposes no value, leaves the state `null`, and puts the
  owner's report into the preview.

**Load on demand:** Read `shared/setup-guided-core-switches.md`, when a Targeted operation touches a core-switch key: `worktree.enabled`, `delivery.completion`, `delivery.prReview`, `language.*`, `tracker.mode`, `tracker.remoteToolOverride`, or a `tracker.external*` key.

**Load on demand:** Read `shared/setup-advanced-settings.md`, when a Targeted operation touches a block key: `review.*`, `applyReview.*`, `plan.dir`, `concept.dir`, `delivery.branchPrefix`, `delivery.mergeMethod`, `worktree.setup`, `worktree.baseDir`, a `tracker.external*` key, `skills.*`, or `mergeGate.*`.

### Hidden mode

With the hidden local file as source (step 0), Targeted item 3 runs first here too: a fresh
resolve that no longer reports step 0 at the same path stops without writing. "Writing the hidden
local configuration" of the fragment below then replaces item 4 only; follow only that section.
Under its stricter rule, any change to the local file since the preview rebuilds the preview and
asks for confirmation again, and Targeted item 3 then runs again before the write. Its
runtime-state write-safety guard runs before the write and re-checks the ignore state; a failure
stops the run without writing and points to `effective-flow setup hidden`.

**Load on demand:** Read `shared/setup-hidden-mode.md`, when a Targeted run with the hidden local file as source reaches its write; only its "Writing the hidden local configuration" section applies.

### Write

The only write path is Step 6 items 1, 2 and 4 with the Targeted item 3, under one explicit
confirmation:

1. **Item 1:** start from the resolved values and `data.source.rows`, apply only the interpreted
   operations, and carry untouched and unknown rows byte for byte. The retired-row rewrite and the
   `mergeGate.bots` collapse run as in every mode and join the same preview; the collapse always
   poses its `Bot conflict`, even for a reviewer the request does not touch.
2. **Item 2:** one before/after list of every operation, every row item 1 adds, and every refused
   or redirected operation with its route, then one explicit confirmation. A declined confirmation
   leaves every row unchanged.
3. **Targeted item 3:** directly before writing, resolve freshly once more. Another
   `data.source.step` or `path` (a vanished ADR, a new transitional source, several-match, or an
   invalid-source diagnostic) or a fresh `legacy-slug`, `dead-marker`, or `marker-divergence`
   diagnostic stops without writing and points to the full setup. If the fresh value of a touched
   key differs from the preview's "before" value, or the set of item 1 rewrites (retired rows, bot
   collapse) changed since the preview, rebuild the preview and confirm again. Untouched rows come
   from the fresh read. When the request touches `tracker.externalTool`, `…Hint`, `…StartedState`,
   or `…DoneState`, run Step 6 item 3's External + forge replay here.
4. **Item 4:** write in place at the resolved ADR's own path; Targeted never reaches the new-ADR
   branch or `<adr-convention>`.

A request whose requested rows all match what is recorded, that resets only absent keys, or whose
operations are all refused, redirected or read-only questions writes nothing (no retired-row
rewrite or bot collapse either), asks no confirmation, and says so. A
non-interactive run answers the questions, reports the interpreted operations and the preview it
would have shown, and writes nothing.

### Summary

Step 8 for Targeted reports the mode `Targeted`, the interpreted operations, the rows written or
"nothing written" with the reason, the source path, retired rows rewritten and bot collapses, and
each refused or redirected operation with its route. It emits no next-steps block: a Targeted run
stages nothing.

## Targeted setup change

This fragment is loaded only when Step 0 of `{{SKILL:setup}}` classified the invocation as
**Targeted**: a non-empty argument that is not exactly one of the seven keyword forms, kept verbatim.
It holds the whole Targeted contract; the setup core keeps only that classification and the
exception clauses that override its own steps.

A Targeted run poses no Visibility question and never runs Step 1, Step 2 items 1 and 3, Steps 4
and 5 beyond the owning question of each touched key, Step 6 items 5 to 7 (marker, migration,
`CLAUDE.md` fence), the allowlist step, or Step 7. It writes no root file and never repairs `.gitignore`,
`info/exclude`, the marker, or a `CLAUDE.md` import; those stay with the full setup.

Resolve `language.chat` once at entry under the shared chat-language rule and never rebind it
during the run: a changed `language.chat` applies from the next run. Then check the precondition
first and interpret the free text only after it passed.

### Precondition

Resolve read-only with `tool: "setup"` (Step 2 item 2) and form the current values as Step 2
item 4 does, `data.retired` included. Continue only when `data.source.step` is 0 (the hidden local
file) or 1–2 (a project setup ADR). Otherwise stop without mutation and name what was found; each
of these stops points to `{{SKILL:setup}}` or `{{SKILL:setup}} express`:

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
`{{SKILL:setup}} express` switches the spelling.

### Interpretation

Map the free text, in any language, to operations on known schema keys (the config schema and the
`mergeGate.*` key table of `{{SKILL:setup}}`):

- _set_ `<key> = <value>`;
- _ask_ `<key>`: a change request without a value ("let me choose …"). It runs the owner's question
  for that key with the current value pre-selected. A value that is visibly a placeholder, such as
  `<exact check context>`, counts as no value and becomes an _ask_; it is never written;
- _reset_ `<key>`: remove the row so the source skill's default applies; for `language.chat` that
  is mirroring, never a `null` row;
- _question_: a read-only question about keys;
- _pilot action_: start or resume the Fast pilot baseline (see "Fast pilot requests");
- _pilot state question_: a read-only question about the pilot's generation state.

One request may hold several operations. Give each ambiguity one focused question offering only
valid readings or values ("prReview off" may mean `delivery.prReview` or `mergeGate.*`); never
guess. A key outside the schema is not written; existing unknown rows are preserved, never created
or removed. When nothing is recognized, a typo such as `exprss` included, say so, list the seven
keyword forms and `{{SKILL:setup}} <free text>`, and stop without mutation.

### Fast pilot requests

The loaded `setup-execution-profiles` fragment (block 10) owns every question, check, and helper
call these operations reach:

- A _set_ of `executionProfiles.fast.enabled` poses block 10's `Fast pilot` question with the
  requested `Enable` or `Disable` pre-selected; a plain _ask_ (no requested value, a placeholder
  included) pre-selects `Keep`, as in Guided. An `Enable` answer also counts as a _pilot action_; a
  disable request never reaches the action step.
- A _pilot action_ selects the pilot action step under "Write" and nothing more: `inventory`
  decides between `begin-baseline` and `resume`, and the request never confirms either. While the
  key is not `enabled`, it implies the opt-in: pose the `Fast pilot` question, labelled as implied
  by the request, with `Enable` pre-selected and a recorded `false` named as an earlier explicit
  decision to disable. `Keep` or `Disable` offers no action.
- A bare "fast" with no pilot, baseline, execution-profile, or review context, and conflicting
  signals such as "Fast pilot review", get one question: the Fast pilot
  (`executionProfiles.fast.enabled`) or the review profile (`review.profile = fast`). "Fast pilot",
  "start the baseline", or "review profile fast" need none. Answering the Fast pilot makes it a
  _set_ `executionProfiles.fast.enabled = true` whose `Enable` answer counts as a _pilot action_.
  Inside a pilot request, "review" means `begin-review`, refused below, never `review.profile`.
- Stop wording ("stop the pilot", "pause Fast") gets one question: `Disable`, or leave the pilot
  unchanged. It adds that ending a generation (`begin-review`) is out of Targeted's reach and names
  its route below.

A disambiguation answer that selects an `executionProfiles.fast.enabled` _set_ only selects the
operation; block 10's `Fast pilot` question stays the single decision, with that answer
pre-selected. A "leave unchanged" stop answer is no operation, and the review profile answer is a
_set_ `review.profile = fast`.

```lazy-include
setup-execution-profiles
when: a Targeted operation touches `executionProfiles.fast.enabled`, holds a _pilot action_, or asks a _pilot state question_; only its "The opt-in" and "Generation actions" sections apply
```

### Refusals and redirects

Precondition stops end the whole run. Every other refusal applies to its operation only: report it
in the preview with its reason and route, and offer the remaining operations as one confirmed unit.

- `visibility` → `{{SKILL:setup}} hidden` to hide; `{{SKILL:setup}}` or `{{SKILL:setup}} guided`
  answering `Standard` to unhide.
- `begin-review` and `discard-generation` → the pilot helper directly, with the pilot disabled, as
  block 10 names it; measurement edits and a model or provider name have no route, because the
  helper owns measurement and no model or provider is ever configured.
- First-time-only actions (`.gitignore`, marker, `CLAUDE.md` import, rename probe, legacy JSON
  migration) → `{{SKILL:setup}}`.
- In hidden mode: every `tracker.*` key (the tracker is pinned to `local`), a forced row listed
  under "Safe defaults" of `{{SKILL:setup}}`, and a `delivery.branchPrefix` containing
  `effective-flow` in any letter case. This refusal replaces the owner's ask-again; add that
  `{{SKILL:setup}}` answering `Standard` leaves hidden mode.
- A non-schema key.

### Read-only answers

Answer each _question_ from `data.values` with the source path; in hidden mode add the forced
values. For an absent key say "not set — default: …": the schema default where the schema names
one, otherwise the source skill's default, naming that skill. An absent artifact-surface
`language.*` override inherits `language.project`, an absent `language.chat` mirrors the user's
language, and `delivery.baseBranch` follows the Step 4 base-branch rule. For a key whose retired
row `data.retired` lists, name that row and the action the retired-key rule of the configuration
building block assigns to it, and say that a Targeted change of any key offers its migration. An
answer writes nothing, asks no confirmation, and matches no next-steps row. A mixed request answers
first, then shows the change preview.

A _pilot state question_ runs block 10 "Generation actions" step 1 (`inventory`) once at this
stage, also in a non-interactive run, and reports the generation state, any busy cause, and the
qualification under that section's step 1 and step 2 reporting rules; it offers no action. A helper
failure (such as `UNSAFE_RUNTIME_ROOT`, `MIGRATION_REQUIRED`, or `INVALID_STATE`) is reported by
its error code alone, with a route to `{{SKILL:setup}}`, and the remaining operations continue.

### Owner questions

For each touched key, run only that key's question from its owner, never a whole block: the
requested value is the proposal and the current value is shown as "currently recorded". A single
`mergeGate.maxRounds` change asks `maxRounds` alone. For an invalid enumerated value ask again
instead of falling back to the default, because the user asked for one specific change. "Core
switches" below are `setup-guided-core-switches`, numbered blocks those of
`setup-advanced-settings`.

| Key group                                                                                   | Owner                                                  | Targeted rule                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `review.*`                                                                                  | advanced block 1                                       | —                                                                                 |
| `applyReview.*`                                                                             | block 2                                                | —                                                                                 |
| `language.project`, `language.*` overrides                                                  | core switches (Language), `config-setup-migration`     | a `language.workflow` change offers the owner's legacy-key migration proposal     |
| `plan.dir`, `concept.dir`                                                                   | block 4                                                | canonicalized, neither the same directory nor nested                              |
| `delivery.completion`, `delivery.prReview`                                                  | core switches                                          | —                                                                                 |
| `delivery.baseBranch`, `delivery.returnBranch`                                              | Step 4 base-branch rule                                | `git remote` / `origin/HEAD` proposal; a divergence is named in the preview       |
| `delivery.branchPrefix`, `delivery.mergeMethod`                                             | block 5                                                | —                                                                                 |
| `worktree.enabled`                                                                          | core switches (Worktree)                               | —                                                                                 |
| `worktree.setup`, `worktree.baseDir`                                                        | block 6                                                | —                                                                                 |
| `tracker.mode`, `tracker.remoteToolOverride`                                                | core switches (Tracker)                                | see below                                                                         |
| `tracker.externalTool`, `…Hint`, `…StartedState`, `…DoneState`                              | core switches (external), block 7                      | see below                                                                         |
| `skills.*`                                                                                  | block 8                                                | `agents.<name>` / `tools.<name>` only with source agent or tool names             |
| `mergeGate.*`, `.bots`, `.trigger`, `.check`, `.botAccounts`, `iterate.reviewFixValidation` | block 9, Step 5 collapse                               | see below                                                                         |
| `executionProfiles.fast.enabled`                                                            | block 10 (`setup-execution-profiles`), loaded directly | its question alone, the requested answer pre-selected, then the pilot action step |

- Adding a reviewer to `mergeGate.bots` also touches its `.trigger` and `.check`. Collapse first
  ("Collapsing two `mergeGate.bots` spellings of one reviewer", Step 5), then block 9's
  per-reviewer follow-up asks both for the new reviewer, `.check` with its "not set" answer. A
  request touching only an existing reviewer's `.check` asks only `.check`; untouched reviewers are
  not asked. Removing a login from `mergeGate.bots` also removes its `.trigger` and `.check` rows in
  the same preview.
- `mergeGate.noCiPolicy.*` changes only on a request that explicitly names the policy; a vaguer one
  ("no CI", "skip checks") gets the focused question, never a guessed write. Setting `unattended`
  with no `bases` recorded or requested also asks block 9's `bases` question, and removing
  `mergeGate.noCiPolicy.bases` also removes `mergeGate.noCiPolicy.unattended` in the same preview,
  which carries block 9's `completion` and `requireAllChecks` hints.
- A change touching `mergeGate.*` that does not itself set `mergeGate.conflictValidation` shows
  Step 5's conflict-validation proposal in its preview where it holds, as an offer the write
  excludes unless the user accepts it.
- A change touching `mergeGate.*` or `iterate.reviewFixValidation` that does not itself set
  `iterate.reviewFixValidation` shows Step 5's `iterate.reviewFixValidation` proposal in its preview
  where it holds, as an offer the write excludes unless the user accepts it.
- Adding a login to either `mergeGate.bots` or `mergeGate.botAccounts` first runs block 9's two-way
  overlap check against the other list and changes that list only with the user's answer.
- Changing `tracker.mode` to `external` also touches the owner's external follow-ups
  (`tracker.externalTool`, `…Hint`, started and done state discovery) for every value that is
  missing or invalid. Changing it to `remote` touches `tracker.remoteToolOverride` only on
  `AMBIGUOUS_HOST`.
- External tracker keys follow their owner: fresh discovery and stable-ID matching, and an
  unavailable or ambiguous connection proposes no value, leaves the state `null`, and puts the
  owner's report into the preview.

```lazy-include
setup-guided-core-switches
when: a Targeted operation touches a core-switch key: `worktree.enabled`, `delivery.completion`, `delivery.prReview`, `language.*`, `tracker.mode`, `tracker.remoteToolOverride`, or a `tracker.external*` key
```

```lazy-include
setup-advanced-settings
when: a Targeted operation touches a block key: `review.*`, `applyReview.*`, `plan.dir`, `concept.dir`, `delivery.branchPrefix`, `delivery.mergeMethod`, `worktree.setup`, `worktree.baseDir`, a `tracker.external*` key, `skills.*`, `mergeGate.*`, or `iterate.reviewFixValidation`
```

### Hidden mode

With the hidden local file as source (step 0), Targeted item 3 runs first here too: a fresh
resolve that no longer reports step 0 at the same path stops without writing. "Writing the hidden
local configuration" of the fragment below then replaces item 4 only; follow only that section.
Under its stricter rule, any change to the local file since the preview rebuilds the preview and
asks for confirmation again, and Targeted item 3 then runs again before the write. Its
runtime-state write-safety guard runs before the write and re-checks the ignore state; a failure
stops the run without writing and points to `{{SKILL:setup}} hidden`.

```lazy-include
setup-hidden-mode
when: a Targeted run with the hidden local file as source reaches its write; only its "Writing the hidden local configuration" section applies
```

### Write

The only configuration write path is Step 6 items 1, 2 and 4 with the Targeted item 3, under one
explicit confirmation:

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
rewrite or bot collapse either), asks no confirmation, and says so; a _pilot action_ is a valid
operation, so a request holding one still reaches the pilot action step. A non-interactive run
answers the questions, reports the interpreted operations and the preview it would have shown, and
writes nothing; it calls the pilot helper only for a _pilot state question_.

**Pilot action step.** The one helper-state write after the configuration write path: run block
10 "Generation actions" under its Targeted gate. A fail-closed `UNSAFE_RUNTIME_ROOT` or
`MIGRATION_REQUIRED` is reported by its error code, sends nothing further, and points to
`{{SKILL:setup}}`; any other failure, and a lost `begin-baseline` or `resume` response, follows
block 10's re-read-`inventory` rule. A configuration write that already happened stays as it is.

### Summary

Step 8 for Targeted reports the mode `Targeted`, the interpreted operations, the rows written or
"nothing written" with the reason, the source path, retired rows rewritten and bot collapses, and
each refused or redirected operation with its route. A pilot action is reported as offered,
accepted, declined, or not offered with its reason: the generation state, a busy cause, config not
`enabled`, a non-interactive run, a declined confirmation, a stopped write, no valid operation, or
the helper error code. Block 10's Step 8 report items apply as well, with the generation state the
last `inventory` proves, or unknown. It matches no next-steps row: a Targeted run stages nothing.

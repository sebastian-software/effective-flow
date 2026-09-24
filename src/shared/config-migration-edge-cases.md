## Configuration edge cases and read compatibility

These are the circumstance-gated parts of the Effective Flow configuration contract: the hidden
mode of locator step 0, the legacy marker and slug tolerances of the config locator, the ranking
that resolves a several-match scan, the transitional JSON fallback, the two `tracker.*` state keys
only an `external` target resolves, and the stop contract for retired rows. The ordered resolution steps and the table
encoding they extend live in the "Effective Flow configuration (project setup ADR)" building block
(`config-migration.md`), which every source that loads this one carries.

### Hidden mode (locator step 0)

The local file `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` is a personal,
per-checkout configuration that {{SKILL:setup}} alone writes. It is read with the same table
encoding as the project setup ADR, from the verified `RUNTIME_STATE_ROOT` only; a same-named file
below a linked `EXECUTION_ROOT` is never inspected as configuration, and when a run notices one
there it reports it as ignored. Reading it creates nothing and touches no Git.

| Situation                                                | Result                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| local file declares `visibility \| hidden`               | hidden mode; the local file is the whole configuration and wins over steps 1–4                            |
| local file present without `visibility \| hidden`        | not honoured: report the file once and resolve through steps 1–4 as if it were absent                     |
| hidden mode **and** a tracked marker or ADR resolves     | the local file wins; name the tracked marker/ADR once as shadowed and never read a value from it          |
| a tracked ADR declares `visibility \| hidden`            | invalid by construction (hidden configuration is never tracked): report the row, ignore it, stay standard |
| unreadable or ambiguous local file declaring hidden mode | the safe-default rule of the core applies per affected key; hidden mode itself stays active               |

A standard-mode {{SKILL:setup}} run resolves the ADR it reads and writes through steps 1–4 only; a
step-0 file is then a read-only seed and never its write target. Hidden plan and concept writes
use absolute handles under the verified `RUNTIME_STATE_ROOT`, never a path relative to a linked
`EXECUTION_ROOT`, and apply "Runtime-state write safety" to the target and its parent directories.

**Forced values.** In hidden mode the resolver, not the individual tool, enforces these values.
A row in the local file that contradicts one is reported once per run as overridden and never
honoured; a missing row takes the forced value silently.

| Key                     | Value in hidden mode                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `plan.dir`              | `.effective-flow/plan`                                                                                            |
| `concept.dir`           | `.effective-flow/concept`                                                                                         |
| `tracker.mode`          | `local`                                                                                                           |
| `delivery.prReview`     | `off`                                                                                                             |
| `delivery.branchPrefix` | empty by default; a value containing `effective-flow` (any letter case) is rejected and the empty default applies |

Every other key resolves from the local file exactly as it would from the ADR. Hidden mode also
fixes the tracker target: an issue reference or per-run signal that would otherwise select the
forge or an external tool does not override it. A workflow that can only work against such a
target stops before its first tracker access or write, naming hidden mode, and never falls back to
writing labels or markers.

**No trace in Git or forge prose.** In hidden mode no commit message, branch name, pull-request
title or body, or tracker-facing summary references a path under `.effective-flow/` — a plan or
concept file included — or names Effective Flow (`effective-flow`, `Effective Flow`). A run that
delegates a commit or a pull request hands this constraint on with the delegation.

### Legacy setup marker (locator step 1)

**Backcompat (one generation):** locator step 1 recognizes the legacy marker spelling as
equivalent to the current one on read, and {{SKILL:setup}} converts it non-destructively to the
new spelling on the next run.

The spelling itself is **not** repeated here. It states the condition under which this fragment is
loaded at all, so a reader that had to reach this fragment to learn it could never establish that
the condition holds — the locator would fall through to step 2, match a lower-priority ADR, and
read the wrong project configuration without saying so. Recognition therefore stays in the
always-loaded step and only its consequence lives here.

### Read tolerance and several-match ranking (locator step 2)

A file matches the locator's scan when its stem equals `effective-flow-project-setup` or the
legacy slug `firmo-project-setup` after stripping an optional leading `^\d+[-_]` numeric prefix,
**and** its body carries a canonical configuration envelope (see step 2 of the core). Both the
numeric prefix and the legacy slug are read-side tolerance; they do not decide
what a new file is named. That tolerance widens the scan to a family of names, so **several**
files can match inside this one step; "the first matching step wins" ranks the five steps, not
the matches within a step. Rank the matches by one **ordered** comparison rather than by two
independent preferences: prefer the current slug `effective-flow-project-setup` over the legacy
`firmo-project-setup` first, and only among files carrying the same slug prefer an unprefixed
stem over a prefixed one. Stated as two independent preferences,
`0001-effective-flow-project-setup.md` and `firmo-project-setup.md` would each win one and
neither would survive both. If more than one match still ties at the top of that ranking, report
every matching path and fall through to the next step instead of picking one. Falling through
here is not the same result as finding nothing: a tool that **writes** configuration ends its run
on a reported several-match result, reporting every matching path so its user resolves the
duplicates by hand, and never reads it as "no project setup ADR exists", because writing a new
ADR into that state adds a further one beside the matches already reported.

### Transitional compatibility (locator step 3)

Only transitionally — establish or reuse the verified execution-location receipt and resolve the
fallback from `RUNTIME_STATE_ROOT`: read a still-present absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
`<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to {{SKILL:setup}}. Never inspect a
same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
and touches **no** Git.

### External tracker state keys (table encoding)

- **`tracker.externalStartedState`** → a nullable string containing the external connection's stable
  state ID, or its exact accepted token only when that connection exposes no ID. Missing or `null`
  means unset and never authorizes a guessed transition. Readers validate a non-null value against a
  fresh list of writable states in the exact configured tracker context before every implementation
  run; stale, terminal, read-only, cross-context, and display-name-only matches fail closed before
  code. Only `{{SKILL:setup}}` writes a confirmed tracker-verified suggestion. The fixed post-merge
  observation grace period has no configuration key.
- **`tracker.externalDoneState`** → a nullable string containing the external connection's stable
  **terminal** state ID, or its exact accepted token only when that connection exposes no ID. Missing
  or `null` means unset and never authorizes a guessed transition. Readers validate a non-null value
  against a fresh list of writable states in the exact configured tracker context before the offered
  post-merge terminal transition; stale, non-terminal, read-only, cross-context, not-done-category,
  and display-name-only matches make that transition unavailable instead of guessing, and never
  abort a run whose merge already succeeded. That transition is not the only reader: the post-merge
  observation of an issue found already terminal resolves the same value by the same rules, and a
  value that fails there makes that issue's reconciliation unavailable rather than its transition.
  Only `{{SKILL:setup}}` writes a confirmed
  tracker-verified suggestion. The completion assessment behind the offer has no configuration key of its own.

### Retired keys (table encoding)

The core names these rows as retired. A retired row is **never read as a value**, not even to report
what it would have held; its successor is the only key a run resolves.

| Retired row                             | Successor                                |
| --------------------------------------- | ---------------------------------------- |
| `worktree.baseBranch`                   | `delivery.baseBranch`                    |
| `worktree.branchPrefix`                 | `delivery.branchPrefix`                  |
| `worktree.completion`                   | `delivery.completion`                    |
| a row whose key begins with `prReview.` | the same trailing key under `mergeGate.` |

`delivery.prReview` does not begin with `prReview.`: it is a live `delivery` key, never retired, and
never matched. `worktree.enabled`, `worktree.setup`, `worktree.baseDir` and `applyReview.worktree.*`
are current keys.

**Which runs resolve which successors.** A run checks exactly the successors its own tool can resolve
at any point of the run, not only the ones it is about to read:

- `delivery.baseBranch`, `delivery.branchPrefix` and `delivery.completion`: {{SKILL:build}},
  {{SKILL:fix}}, {{SKILL:docs}}, {{SKILL:refactor}} and {{SKILL:maintain}}, through "Delivery and
  worktree integration".
- `delivery.baseBranch` and `delivery.branchPrefix`: {{SKILL:deliver}}, {{SKILL:apply-issues}} and
  {{SKILL:apply-review}} in remote mode.
- `delivery.baseBranch` only: {{SKILL:pr}}, and {{SKILL:iterate}} in local mode, the only mode that
  reads it.
- every `mergeGate.*` key: {{SKILL:merge-gate}}.
- `mergeGate.bots`, `mergeGate.bots.<login>.trigger`, `mergeGate.bots.<login>.check` and
  `mergeGate.botWaitMinutes`: {{SKILL:iterate}} in PR mode, including a run {{SKILL:merge-gate}}
  delegates, the `.check` key through "Automatic reviewer state". In PR mode these are its whole set.

A tool not listed resolves no successor, so a retired row neither stops nor is reported there. A run
that hands work to another workflow does not check that workflow's successors on its behalf; the
receiving run checks its own at its own first configuration read. The checkout provisioning of
{{SKILL:iterate}} in PR mode and of {{SKILL:merge-gate}} applies "Base-branch resolution" to
`delivery.baseBranch` only as a checkout precondition; that is not a successor read, so a retired
`worktree.baseBranch` neither stops nor is reported there.

**When.** Detect at the run's **first configuration read**, before any fetch, branch, worktree,
commit, push, delegation or merge, over that whole successor set. Detecting only when a successor is
about to be resolved would stop a run after it already delivered: a project carrying only
`worktree.completion` would implement and commit before stopping at handback.

- **Successor absent → stop.** Name the retired row, its successor, and {{SKILL:setup}}, which
  rewrites the row in place; do nothing else. This is the one exception to the safe-default rule of
  the core: never take the successor's default instead. A non-interactive delegated run stops the same
  way and returns that reason to its caller like any other precondition failure.
- **Successor present → the successor wins.** Report the inert retired row **once** per run, point to
  {{SKILL:setup}}, and continue; the two rows are never combined.
- **Login-keyed subkeys.** A retired `prReview.bots.<login>.trigger` or `.check` has as its successor
  the same subkey under the `mergeGate.bots` entry that denotes the same reviewer under "Matching a
  configured login", including its one-trailing-`[bot]` equivalence and collapsed entries. A retired
  subkey whose login matches no reviewer the run resolves has no resolvable successor: report it once
  and do not stop.
- **{{SKILL:deliver}} and `worktree.completion`.** `deliver` reads `delivery.completion` only to state
  that its own pull-request intent overrides it, so a retired `worktree.completion` there is reported
  and never stops the run.
- **{{SKILL:setup}} is exempt.** It is the repair path: it records every retired row and rewrites it
  in place, and is the only source that reads a retired row's value, in order to carry it over.

The same rule applies to rows read from the transitional JSON configuration of locator step 3.

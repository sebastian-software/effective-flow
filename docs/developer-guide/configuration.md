# Effective Flow configuration

The tracked Effective Flow configuration is a living project-setup ADR, not runtime state. This
page summarizes the developer contract; the binding sources are
[`src/shared/config-migration.md`](../../src/shared/config-migration.md) for lookup, encoding, and
migration, [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md) for the living ADR
model, and [`src/tools/setup.md`](../../src/tools/setup.md) for all Git-touching writes.

## Tracked source and runtime boundary

The tracked truth is a mutable, slug-named ADR whose default path is
`docs/adr/effective-flow-project-setup.md`. That bare slug is the default form, applied where the
project declares no ADR file-naming convention of its own; see
[ADR naming convention](#adr-naming-convention). A new ADR uses the configured technical-documentation
language: `# Effective Flow project setup` with `## Configuration`, or
`# Effective-Flow-Projektsetup` with `## Konfiguration`. Existing ADRs preserve their recognizable
envelope language on ordinary setup updates. The `.effective-flow/` directory contains only
runtime state such as `memory.json`, `cache.json`, `review/`, `.worktrees/`, and
`worktree-runs/`; the entire directory is gitignored with one `.effective-flow/` line.

This table is a narrow, explicit exception to the usual separation of ADR rationale from exact
configuration values: the project-setup ADR is itself the owning tracked configuration artifact.
Other ADRs remain decision records and must not become configuration stores.

Every mutation below `.effective-flow/` is fail-closed and just-in-time. Immediately before a
runtime `mkdir`, copy, write, rename, deletion, lock, or worktree operation, the owning Git
worktree checks both the sentinel `.effective-flow/config.json` and the concrete target with
non-verbose `git check-ignore --no-index -- <path>`, then independently requires
`git ls-files -- .effective-flow/` to succeed with empty output. Missing Git, a non-repository,
a not-ignored path, tracked runtime state, or a command error preserves all state and routes to
`/effective-flow setup`. Ordinary workflows never repair `.gitignore`; setup is the sole owner.

Before its first authorized runtime write, every writing workflow also runs the marker-driven
legacy-directory prerequisite from
[`src/shared/effective-flow-dir-migration.md`](../../src/shared/effective-flow-dir-migration.md).
The marker `runtimeMigration.directory.version: 1` in `memory.json`, not the existence of the
target directory, proves completion. Without it, Effective Flow chooses `.firmo/` as the whole
source when present, otherwise `.sf-plugin/`, and copies only entries missing from
`.effective-flow/`. Existing target paths always win; `memory.json` receives a recursive
missing-key merge after a fresh re-read, and legacy `.worktrees/` is never copied. Any unsafe
memory input or carry-over failure leaves the marker unset and blocks the workflow-specific
write so a later run can retry. Legacy directories remain untouched until the user explicitly
runs `/effective-flow cleanup`.

Two orchestration paths additionally authorize this prerequisite as the runtime write itself.
`/effective-flow cleanup` invokes it after its first legacy inventory when a legacy runtime
directory exists and the marker is missing, then re-inventories before any deletion decision.
`/effective-flow setup` invokes it only when the shared locator selected a transitional JSON
config, after ignore/index repair and before `configMigration.adr`; a setup without such a source
keeps its no-runtime-footprint behavior. Both paths reuse the shared migration and memory
contracts rather than copying their algorithms.

Failure remains fail-closed: no directory-migration marker means no runtime-directory deletion
approval, and setup additionally withholds `configMigration.adr`, preserves the selected config
source and partial target state, and conditionally rolls back only its own unchanged ADR and
convention-marker writes. When both `.firmo/` and `.sf-plugin/` exist, the marker certifies only
the preferred `.firmo/` source; cleanup inventories the unselected source separately. A legacy
runtime directory is also undeletable while a registered current or retained linked worktree
remains below its `.worktrees/` tree.

All `memory.json` writers share the contract in
[`src/shared/memory-state.md`](../../src/shared/memory-state.md). They acquire the atomic
`.effective-flow/memory.lock` directory, record lock ownership, re-read and validate the complete
JSON object inside the lock, merge only their owned field or subtree, and replace the file through
a unique same-directory temporary file and atomic rename. Lock acquisition retries for at most 30
seconds; timeout reports the recorded owner, and a suspected orphan is removed only after explicit
confirmation. Invalid JSON or counters, permissions, disk exhaustion, and failed replacement all
fail closed without replacing the prior file or deleting foreign state.

Finding producers complete filtering and deduplication before reserving the exact nonzero range
they need. The range is persisted and the lock released before a report or remote issue is
published, so concurrent producers cannot duplicate IDs. Reservations are monotonic: a failure or
interruption after persistence may leave harmless gaps, but an ID is never rolled back or reused.
The runtime-directory marker, legacy `.sf-memory.json` migration, `labelMigration.sf`, and
`configMigration.adr` use the same mutation protocol and preserve unknown memory fields.

The canonical convention-file locator is:

```md
**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md
```

## Worktree lifecycle runtime state

`worktree-runs/` is runtime bookkeeping, not project configuration. Every newly created
Effective Flow delivery, partial-diff, or `apply-review` component worktree receives a versioned
lifecycle record at
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`. The record binds the worktree to
its verified repository, canonical path, branch, creation OID, workflow purpose, ownership,
timestamps, current lifecycle status, and branch follow-up policy. Reused, user-created, and
harness-managed worktrees do not gain ownership through this store.

Record creation, state changes, per-record locks, and deletion use the same just-in-time
runtime-state safety checks described above. Writers resolve an absolute handle below the verified
`RUNTIME_STATE_ROOT`, validate containment and Git state immediately before mutation, and fail
closed on unknown schemas, foreign locks, mismatched receipts, or unsafe paths. A record remains
until worktree removal and any permitted branch follow-up are completely reverified; partial
cleanup preserves enough state for a later reconciliation.

This feature adds no configuration key. In particular, there is no cleanup TTL, heartbeat,
`staleAfter`, or equivalent age threshold. The existing `worktree.*` and
`applyReview.worktree.*` blocks still control creation location and setup only; they do not weaken
cleanup eligibility. Lifecycle status, a current receipt, and fresh Git evidence determine whether
ordinary `git worktree remove` may be offered. Cleanup reads this runtime state but never writes
configuration values into the project-setup ADR.

## Resolution order and ownership

Readers resolve configuration in this order:

1. the canonical marker in `AGENTS.md`, otherwise `CLAUDE.md` or a comparable convention file;
2. the default path, followed by a scan of the detected ADR directory (`docs/adr/`,
   `docs/decisions/`, or `adr/`);
3. transitional read-only legacy input;
4. each source tool's built-in defaults.

A dead marker is reported but falls through to the next step. The former
`**Firmo project setup:**` marker and `firmo-project-setup` slug are recognized for one
compatibility generation. Step 2 matches a candidate on its stem after stripping an optional
leading `^\d+[-_]` prefix and additionally requires one of the canonical configuration envelopes,
so a project-setup ADR written under a project's own numeric naming convention still resolves as
configuration. That tolerance widens the scan to a family of names, so several files can match
inside this one step; "the first matching step wins" ranks the four steps, not the matches within
a step. The matches are ranked by one ordered comparison rather than two independent preferences:
the current slug `effective-flow-project-setup` is preferred over the legacy `firmo-project-setup`
first, and only among files carrying the same slug is an unprefixed stem preferred over a prefixed
one. Read as two independent preferences,
`0001-effective-flow-project-setup.md` and `firmo-project-setup.md` would each win one and neither
would survive both. If more than one match still ties at the top of that ranking, every matching
path is reported and resolution falls through to the next step instead of picking one.

Falling through on that ambiguity is not the same result as finding nothing. A tool that **writes**
configuration treats a reported several-match state as an explicit stop for its user to resolve,
never as "no project-setup ADR exists"; `/effective-flow setup` routes it to its invalid-source
question, which asks which of the reported ADRs is authoritative rather than offering to create
another one.

This deterministic read path creates nothing and touches no Git. `/effective-flow setup` is the
only workflow that creates or updates the ADR and marker, normalizes `.gitignore`, or migrates a
legacy config. Readers with no ADR may consume legacy values for the current run and direct the
user to setup; they do not perform migration themselves.

## Bilingual envelope and canonical table encoding

Readers bootstrap before language resolution by accepting `| Key | Value |` in the English
envelope and `| Schlüssel | Wert |` in the German envelope. Writers create a new envelope in
`language.documentation.technical` and preserve an existing envelope instead of translating it.
Keys and encoded values remain identical and English in both forms. Values use this encoding:

- Boolean → `true` / `false`.
- String → literal and unquoted, for example `focused` or `origin/main`.
- Explicit run-time choice → literal `null`.
- Empty list → `(empty)`.
- Filled list → comma-separated values, for example `humanizer, distill`.
- Nested value → dotted key, for example `applyReview.worktree.baseDir`.
- Empty object → no rows.

A missing row means “key not set; use the source skill's default.” A present `null` row is an
explicit value and means “ask at run time” for keys that accept it. Readers must preserve this
distinction and treat invalid or ambiguous table values as errors for the affected key rather
than guessing.

```md
## Configuration

| Key                               | Value                      |
| --------------------------------- | -------------------------- |
| review.profile                    | focused                    |
| applyReview.defaultCommitStrategy | null                       |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees |
| skills.include                    | (empty)                    |
| worktree.enabled                  | true                       |
```

Unknown valid rows are retained across setup maintenance. The user guide's
[configuration reference](../user-guide/configuration.md) lists all current keys, values, and
defaults.

### Bot registry encoding (`mergeGate.bots`)

`mergeGate.bots` is the encoding's concrete example of a comma-separated list paired with dotted
keys per list member: the list row holds the reviewer logins, and each login gets its own
`mergeGate.bots.<login>.trigger` row for its literal trigger-comment text and, optionally, a
`mergeGate.bots.<login>.check` row naming the commit status or check run that proves whether it is
running.

```md
| mergeGate.bots | greptile-apps[bot] |
| mergeGate.bots.greptile-apps[bot].trigger | @greptileai |
```

A login containing brackets, such as `greptile-apps[bot]`, is a valid middle segment of that
dotted key because the encoding splits on `.` only – brackets carry no structural meaning to the
parser. The rows stay keyed by whichever spelling the project wrote: the gate matches a reported
login against a configured one with a trailing `[bot]` trimmed from each **when the reported record
is bot-typed** (`isBot: true`, equivalently `authorType: bot`), and otherwise requires an exact match
(see "Matching a configured login" in `src/shared/review-bot-state.md`), then looks `.trigger` and
`.check` up under the **configured** spelling. That is what lets one entry serve both of GitHub's
APIs, which disagree on whether a bot login carries the suffix, without letting a human account whose
login is the app slug inherit a configured reviewer's identity. Only rows whose value differs from the source tool's default belong in a project's own
ADR; see [`docs/adr/effective-flow-project-setup.md`](../adr/effective-flow-project-setup.md) for
this repository's own rows.

`mergeGate.*` configures the merge-gate tool. It is not `delivery.prReview`, which is an unrelated
boolean deciding whether a delivery workflow publishes its own review findings onto the pull
request it just created. `delivery.prReview` keeps its name deliberately: it belongs to the
review-publication concept, not to the gate, and renaming it would recreate the confusion the
`pr-review` → `merge-gate` tool rename removed.

## Read-time backward compatibility

The complete German envelope—`# Effective-Flow-Projektsetup`, `Aktiv`/`Abgelöst`,
`## Kontext`, `## Konfiguration`, and `| Schlüssel | Wert |`—is canonical alongside the English
form. The former translated empty-list token `(leer)`, former marker spelling, and former slug
remain readable compatibility inputs. On write, setup keeps the recognized envelope language,
uses the stable `(empty)` value, and preserves known and unknown rows.

The former gate namespace `prReview.*` is readable in the same way: a reader resolves
`mergeGate.<key>` first and falls back to `prReview.<key>` per key, reporting once that it read a
legacy name. Precedence is per key and never merged at a finer grain. This is one generation of
read compatibility, the same commitment the `firmo-` label prefix had. Only setup writes: it
carries the values over to `mergeGate.*`, removes the legacy rows, and reports a shadowed key
rather than merging it, so the fallback loses its last reader once every project has run setup
once.

`mergeGate.conflictResolution` is the one key in that block with **no** legacy counterpart: it never
existed as `prReview.conflictResolution`, so the per-key fallback finds nothing to read, migrate, or
report as shadowed, and a project carrying only an unmigrated legacy block gets the documented
default `auto`. It is also the one key whose safe fallback and documented default diverge: an
unreadable or invalid value resolves to `off`, not to `auto`, because an unparseable line must never
authorize a commit and a push. The reader reports the affected key as the general rule requires and
continues with `off`.

## Language configuration

`language.project` defaults to `en`. Optional `language.source`,
`language.documentation.user`, `language.documentation.technical`, `language.workflow`,
`language.forge`, and `language.git` overrides accept `de` or `en`; a missing override inherits
the project language. Artifact precedence, destination overlap, stable-token boundaries, and the
one-generation `plan.markerLanguage` migration are defined in the living
[project language policy](../adr/language-policy.md) and the binding
[`language-rules`](../../src/shared/language-rules.md) source.

## Migration compatibility

When no ADR is available, readers may transitionally read `.effective-flow/config.json` or the
older `.firmo/config.json` and point to `/effective-flow setup`. Setup converts those values to
the ADR table, writes the canonical marker, normalizes `.gitignore` to `.effective-flow/`, and
untracks an old tracked config with `git rm --cached` while leaving its content on disk. The
separate `/effective-flow cleanup` workflow may later remove confirmed remnants.

Outside setup, configuration-to-ADR migration does not occur. Cleanup may trigger only the
separate marker-driven runtime-directory prerequisite described above. The exact legacy config
procedure and idempotency contract remain in
[`src/shared/config-migration.md`](../../src/shared/config-migration.md) and
[`src/tools/setup.md`](../../src/tools/setup.md).

## ADR naming convention

The naming **convention** is resolved once per run, before anything is written. Each individual ADR
**file name** is then resolved under that convention, with its own number allocation, immediately
before that ADR's own write — a run that writes several ADRs allocates a separate name for each. The
ADR **directory** stays owned by the calling tool's own detection, and the H1 title form is
unaffected.

### Precedence tiers

Precedence runs in three tiers — declared, then observed, then the Effective Flow default:

1. **Declared.** An explicit statement about ADR file naming in `AGENTS.md` or `CLAUDE.md`, or in
   a repository decision register: `DECISIONS.md` at the repository root or at `docs/DECISIONS.md`
   — exactly one level below the root, never a recursive search — or a `README.md` or `index.md`
   at the **top level** of the detected ADR directory. Every declared source is read before
   precedence is applied, with no ranking between them and no first match winning, because a
   contradiction between two sources cannot be observed if the second is never read. A source that
   exists but says nothing about ADR file naming does not speak, and neither does one stating a
   scheme outside the recognized hyphen-separated numeric-prefix axis. Exactly one speaking source
   decides on its own; speaking sources that all agree decide together. Two or more speaking
   sources that do not all agree reach the ambiguity fence below, and nothing is written until it
   is resolved.
2. **Observed.** Consulted for the convention only when no declared source speaks: the `*.md`
   files at the **top level** of the detected ADR directory — the scan is not recursive —
   excluding `README.md`, `index.md`, and every file whose stem equals `effective-flow-project-setup`
   or the legacy slug `firmo-project-setup` after stripping an optional leading `^\d+[-_]` numeric
   prefix. That exclusion is deliberately syntactic and identical to the **stem** half of the
   configuration locator's scan predicate, deliberately without the locator's second half — its
   canonical-configuration-envelope test — so it holds before any step has resolved the
   project-setup ADR. An **empty**
   evidence set is no observed convention: without that rule an empty directory would satisfy both
   tests below at once and count as numbered and numberless simultaneously. A non-empty set counts
   only when it is unanimous — every file carrying a `^\d+-` prefix at one and the same zero-pad
   width, or no file carrying a numeric prefix at all. A mix of prefixed and unprefixed files,
   differing widths, or a `^\d+_` separator is inconclusive and reported as such.
3. **Effective Flow default.** The living slug model from
   [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md).

Only the convention itself is tiered. Independently of which tier resolved it, the file names in
the detected ADR directory are always read for zero-pad width and number allocation once the
resolved convention carries numbers.

Observed evidence never overrides a written decision, because a directory can hold legacy files
nobody intends to keep. Where unanimous observed evidence contradicts the speaking declared
source, the declared source still wins and the disagreement is named in the completion report, so
a silent override becomes a visible one without adding a gate. An already-resolved ADR is written
back at the path where it was found even when that path contradicts the resolved convention; that
divergence is reported once rather than triggering a rename. The setup workflow applies the same
rule to the project-setup ADR: an existing one keeps its own path and is updated in place, never
duplicated at a second, convention-shaped path. That holds for an ADR resolved by the pre-write
re-resolution as well as by the initial one, so an ADR that only becomes resolvable during the run
is still updated rather than duplicated. The no-rename rule decides only which path is written, not
whether writing it is safe: an existing path stays subject to the symlink hard stop and the physical
containment check below.

### Ambiguity fence

Unlike the calling tool's ADR-directory question, this fence is deliberately **unconditional**
rather than guided-path only, because it decides the path a file is written to rather than a
presentation detail. It names every speaking source and its outcome — its file path and its
classified outcome, the agreeing sources included — and quotes no prose from any source.

Its three options are `Numbered`, `Numberless`, and `Inconclusive`. The third does not name a form
of its own: it treats every declaration as inconclusive and falls through to the observed evidence
and then to the Effective Flow default. That is the only outcome the first two options cannot
already produce — an option that merely restated the bare slug form would resolve to the same file
name as `Numberless`.

An unanswered, skipped, or non-interactive run resolves exactly as `Inconclusive` does — every
declaration set aside, the observed evidence deciding next, and the Effective Flow default only
where that is inconclusive too. The two are the same neutral answer to the same state and may not
diverge: jumping straight to the default would drop a numberless file into a uniformly numbered
directory on an unattended run. Such a run reports that the fence could not be posed, naming every
speaking source and its classified outcome. The fence therefore never blocks an unattended run, and
it never resolves silently either.

### Number and width allocation

These rules apply only to a resolved convention that carries numbers:

- The zero-pad width comes from the declaration where it states one, otherwise from the numbered
  files of the **observed-evidence set** described above where they all share one width, otherwise
  four digits. Width is a classification property, so it reads that set and never the wider
  allocation scan below; the two sets differ, and a directory holding `001-foo.md` beside
  `0002-effective-flow-project-setup.md` would otherwise resolve to width 3 one way and to four
  digits the other. A non-uniform observed-evidence set states no width and falls through to four
  digits.
- A declared width outside 1–10 digits is unrecognized **on the width axis only**: the width falls
  back to the observed-evidence width and then to four digits, while the rest of that declaration
  keeps speaking.
- Width is not on the classification axis, so two speaking sources can agree that the convention
  carries numbers while stating different widths — `NNN-<slug>.md` in one, `NNNNN-<slug>.md` in the
  other. Those sources agree, decide the convention between them, and never reach the ambiguity
  fence. Where speaking sources agree on the classification axis but state different widths, the
  width axis is unrecognized in the same way: the width falls back to the observed-evidence width
  and then to four digits, and the divergence is reported with every speaking source and the width
  it stated. Without that rule two runs on one repository could write `007-…` and `00007-…`.
- The number is the next unused integer above the highest one present in the directory. A file
  contributes a number when its name matches `^(\d+)[-_]`, and the captured digits are that number.
  This read-side parse tolerates both separators deliberately, independently of the hyphen-only
  write-side axis, so a file such as `0007_legacy.md` cannot have its number silently reused.
- The allocation scan reads **all** `*.md` files at the top level of the detected directory —
  non-recursive, like the evidence scan — including the ones the observed-evidence set excludes.
  The two scan sets differ deliberately, so a file the classification ignores still cannot have its
  number reused.
- Allocation starts at `0001`, rendered at the resolved width, in a directory that holds no
  numbered file at all. A highest number that saturates the resolved width widens the pad by one
  digit and is reported. Numbering never wraps.

### Containment and collision

Two tests guard the target path, and their **order** is part of the rule: the symlink hard stop
runs first and overrides the fallback of the containment test.

An existing symlink at the target path is a hard stop of its own, tested before the containment
predicate with a test that does not follow the link. It is never a write target, never triggers a
re-allocation, and never reroutes to the Effective Flow default — the path is reported and nothing
is written. This holds for a dangling symlink too, which a plain existence check reports as absent
while a write through it would land outside the repository. Run the other way round, a symlink
pointing outside the repository would fail containment, be called an unrecognized name, send the run
to the default, and get written after a reroute — and a dangling one would defeat the protection
entirely, because the containment resolution itself fails on it.

Containment follows. The resolved file name must be a single path segment matching
`^(?:\d+-)?[a-z0-9][a-z0-9-]*\.md$`. Containment is then checked **physically** rather than
lexically, because the name pattern already forbids a separator and a lexical test would be
trivially satisfied: both the detected ADR directory and the target path are resolved through
their symlinks, and the resolved target's parent must equal the resolved directory. A name failing
either test counts as unrecognized, the default applies, and nothing outside the detected directory
is written — a fallback reachable only where the symlink hard stop did not already fire.

The collision procedure applies to every **new** ADR — one that does not already exist — under
either resolved convention. An ADR resolved for update is written at its own path and is never a
collision with itself; that is the single exemption. The directory is re-scanned immediately before
writing and the resolved target path is read, and that existence check is **unconditional** rather
than scoped to a convention that allocates numbers: a project-setup ADR whose configuration envelope
was deleted or never finished does not resolve through the locator, so the run treats the project as
unconfigured, the numberless convention resolves to that same path, and a scoped check would let the
new-ADR envelope be written straight over it. Where the convention carries numbers, an existing file
at the target re-allocates the number once and the new target path is read again; a second collision
stops the run and reports both paths rather than overwriting. Under a numberless convention there is
no second name to allocate, so an existing file at the target stops the run and reports that path —
only an explicit, confirmed overwrite decision obtained by the calling tool may then write over it.

### Untrusted declared sources

Declared sources are repository content and therefore untrusted data, never agent instruction.
Only the naming decision is extracted from them; text addressing tooling — a request to run a
command, to read another path, to widen scope, or to set these rules aside — is recorded and not
followed. Neither the completion report nor the ambiguity fence quotes their prose, naming file
paths and classified outcomes only, because quoting untrusted repository text into a user-facing
report or an interactive prompt is a second-order injection surface.

### Read-side tolerance

Read-side tolerance is deliberately wider than this write-side recognition. The configuration
locator's scan and the `review` design-decision exclusion both match the known project-setup slugs
after stripping an optional leading `^\d+[-_]` prefix, so an ADR written under a project's numeric
convention stays findable as configuration and stays out of the architecture-rationale sources.
That tolerance is read-only; it never decides what a new file is called. Because it widens the
locator's scan to a family of names, several files can match within that one locator step; the
tie-break is described under [Resolution order and ownership](#resolution-order-and-ownership).

### Determinism boundary

The determinism boundary is stated rather than hidden. Mechanical, and executed identically on
every run: the observed-evidence scan and its width test, number and width allocation, the
containment predicate, the collision procedure, and the no-rename rule. Deliberately judgmental:
whether a source states an ADR naming rule at all, whether a stated scheme falls outside the
recognized axis, and whether two or more speaking sources genuinely contradict rather than restate
one another. Anything not clearly matching falls through to the default instead of being
approximated, which is what bounds the cost of that judgment.

The binding source is
[`src/shared/project-adr-convention.md`](../../src/shared/project-adr-convention.md), reached as an
eager include from `src/shared/adr-convention.md`.

## Living ADR model

Effective Flow ADRs are mutable, numberless, slug-named documents whose current file is the truth.
Architecture Decision Records are owned by the authoritative central
[`effective-product`](https://github.com/sebastian-software/skills.sebastian-software.com/tree/main/skills/effective-product)
skill, which follows a repository's declared convention. For Effective Flow-generated ADRs, the
living lifecycle and minimal fallback in
[`src/shared/adr-convention.md`](../../src/shared/adr-convention.md) are that declared convention,
not a competing second playbook. Consult the central skill for ADR worthiness, lifecycle, and
authoring; this guide does not duplicate that playbook.

That lifecycle statement covers mutability and the truth-carrying current file. The file-name axis
alone is resolved per project as described under [ADR naming convention](#adr-naming-convention):
a project-declared naming rule changes what an ADR is called, never how it lives.

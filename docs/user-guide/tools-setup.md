# Tool reference: Setup & info

This group covers project setup, explicit cleanup of migration remnants and finished worktrees,
and version information.

## `/effective-flow setup`

**Purpose:** Prepares a target project for Effective Flow. It makes `.effective-flow/` a fully
gitignored runtime directory, creates or updates the living project-setup ADR, and writes the
canonical `**Effective Flow project setup:** <path>` marker in `AGENTS.md` or another existing
convention file. The standard wizard applies one of three common workflow profiles after asking
only for the chat language and the profile. **Express** and **Guided** remain available as explicit
modes. **Hidden mode** instead keeps the whole configuration local and untracked; see
[Hidden mode](#hidden-mode). Once a configuration exists, **Targeted** mode takes a free-text
request and changes only the settings it names, or answers questions about them; see
[Targeted changes and questions](#targeted-changes-and-questions).

**When to use:** On the first use of Effective Flow in a project, or later, to switch its common
planning/tracking and delivery topology. To change or check one or a few settings of an existing
configuration, describe the change in free text. Use Guided when you want to walk through the
individual settings with explanations (project and surface languages, worktree, completion action,
tracker details, advanced review/apply-review values, skill discovery, or the `build`/`refactor`
Fast pilot), and Express when you intentionally want the safe base without an interview. Any mode
except Targeted may offer the optional session-rename capability check described below.

**Typical call:** `/effective-flow setup`

The accepted invocations are:

```text
/effective-flow setup
/effective-flow setup profile
/effective-flow setup express
/effective-flow setup guided
/effective-flow setup hidden
/effective-flow setup <free text>
```

The first two forms enter Profile mode. `hidden` enters Express with the visibility already set to
hidden. Surrounding whitespace and letter case do not matter for these keywords. Any other argument
is a free-text request for [Targeted mode](#targeted-changes-and-questions), even one that starts
with a keyword: `/effective-flow setup guided tracker github` is a targeted request, not Guided.
With an existing configuration, a request in which setup recognizes no configuration setting, such
as the typo `exprss`, lists the accepted forms and stops before changing `.gitignore`,
configuration, convention files, or runtime state. Without a configuration, the
[precondition stop](#targeted-changes-and-questions) applies first.

**Input/output:** Profile mode first asks **Chat**, then **Profile**. Local and forge profiles need
no further configuration answers; the external profile additionally asks only for the external
tool, exact connection context, and lifecycle states needed for a valid integration. Conditional
write confirmations, safety decisions, `CLAUDE.md` consent, and the session-rename consent can
still follow. The output is the normalized `.gitignore`, the project-setup ADR (by default
`docs/adr/effective-flow-project-setup.md`), and its convention-file marker. When configuration
already exists, the wizard shows current values and changes them only after explicit
confirmation. Unknown ADR rows are preserved.

### Profile mode

Profile mode asks its two common questions before any conditional `.gitignore`, configuration
source, ADR-convention, or topology question:

1. **Chat** — mirror the language you write in, use English, or use German. The answer immediately
   controls the Profile question and the rest of this setup run. Mirror removes an existing
   `language.chat` row in the confirmed write; English and German persist `en` or `de`.
2. **Profile** — choose one of the following topologies. Each option shows a
   [fit score](glossary.md#fit-score) (`n/10 – <reason>`). The scores rest on a read-only
   classification of the checkout: no Git repository (every reason then says that setup will stop
   at the preflight), none (no `origin` remote), GitHub, Forgejo, or other, and unknown if the
   lookup fails. The classification fetches nothing and changes nothing; the later topology
   preflight still decides whether the chosen profile can proceed.

| Profile                               | Issue-backed planning and tracking | Development and completion                                                                  |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Fully local                           | Local Markdown artifacts           | Local branch, local merge, and no GitHub or Forgejo issue or pull-request operations        |
| Forge issues and development          | GitHub or Forgejo issues           | Pull request on the verified `origin`, using the repository-derived default branch          |
| External issues and forge development | External project-management tool   | Pull request on the verified GitHub or Forgejo `origin` and repository-derived default base |

The selected profile is a transient overlay, not a saved preset: no `setup.profile` or equivalent
row is written. Every profile owns `tracker.mode`, `delivery.completion`, and the base required
by its topology, plus `tracker.remoteToolOverride` when the forge can be classified. The external
profile additionally owns its verified tool, context hint, started state, and optional done state.
Unrelated and unknown rows remain unchanged, while these profile-owned values intentionally replace
conflicting values after the user confirms the complete before/after preview. Dormant provider or
external-tracker values stay in the ADR when their mode is inactive.

The fully local profile uses the current named local branch as its base and keeps work local even
when an `origin` exists. The two forge-backed profiles require an identifiable GitHub or Forgejo
`origin` and a repository-derived base; setup never guesses a provider or silently falls back to a
local topology. If that preflight is ambiguous, use `/effective-flow setup guided` to make the
necessary provider or base choice explicitly.

The external profile builds on verified forge delivery and sets `tracker.mode: external`. It
preselects recorded external values only after revalidating them, and asks for missing or changed
tool, connection context, writable non-terminal started state, and optional writable terminal done
state. The connection must come from a configured MCP integration or authenticated CLI; setup does
not infer one from a familiar tool name. When several contexts are possible, the proposed
non-secret `tracker.externalToolHint` includes enough stable workspace, team, or project identity
to select the same context again. Setup shows the provider, base, context, state evidence, and exact
hint before confirmation, then repeats discovery before writing. Missing capability, unanswered
ambiguity, an invalid started state, or changed evidence stops the profile without writing its
configuration. Omitting a valid done state is allowed, but leaves post-merge completion
unavailable and is disclosed in the preview.

Profiles route **issue-backed** work. A natural-language `/effective-flow plan "…"` request without
an issue reference still creates a local plan file under `plan.dir`; choosing a forge or external
profile does not turn every planning request into a remote issue.

### Explicit Express and Guided modes

`/effective-flow setup express` enters the existing safe-base-plus-existing-values path directly.
`/effective-flow setup guided` enters the existing per-setting interview and its optional Advanced
settings directly. Neither invocation asks for a profile first. Guided scores its Worktree,
Completion, and Tracker questions like the Profile question, while "Ask at run time" stays
unscored; a value already recorded in your configuration is named in the question's explanation
instead of being marked on an option.

### Targeted changes and questions

`/effective-flow setup <free text>` changes individual settings of an existing configuration, or
answers questions about it, without walking through Profile, Express, or Guided again. Write the
request in any language; setup maps it to configuration keys from
[Configuration](configuration.md). For example:

```text
/effective-flow setup switch the review profile to fast
/effective-flow setup reset language.chat
/effective-flow setup which tracker is configured?
/effective-flow setup add coderabbitai as a merge-gate bot
```

- **A change** proposes the value you named, here `fast` for `review.profile`, and shows the
  current value as "currently recorded". A request without a value ("let me choose the merge
  method") asks that key's question with the current value pre-selected.
- **A reset** removes the row so the default applies. For `language.chat` that means mirroring the
  language you write in.
- **A question** is answered with the current value and the configuration path it comes from, or
  "not set" with the default. It writes nothing and asks for no confirmation. A request that mixes
  questions and changes answers first, then shows the changes.
- **Adding a merge-gate reviewer** also asks for its trigger comment and its exact `.check`
  context, where "not set" is a valid answer. A placeholder you paste unchanged, such as
  `<exact check context>`, is never written; setup asks for the real value instead. Removing a
  reviewer also removes its trigger and `.check` rows in the same preview.
- **Switching the tracker** to `external` also asks for each missing or invalid external detail:
  tool, connection hint, started state, and done state. Switching to `remote` asks for the provider
  override only when the host is ambiguous.

For each setting the request touches, setup asks only that setting's own question from Guided,
never a whole block: a `mergeGate.maxRounds` change asks `maxRounds` alone. An ambiguous request
gets one focused question: "prReview off" may mean `delivery.prReview` or the merge gate. An
invalid value is asked again rather than replaced by the default. Setup then shows one before/after
list of every change and asks for one confirmation. That list also contains what every setup write
includes: rewriting retired `prReview.*` and `worktree.*` rows, and merging two spellings of one
merge-gate reviewer. Declining leaves every row unchanged. Just before writing, setup reads the
configuration again. It shows the preview again if a value it is about to change differs from the
preview or the needed rewrites changed. It stops without writing if the configuration source
changed or the legacy-slug, dead-marker, or marker-divergence finding below now applies. A request
whose requested rows already match what is recorded, whose changes are all refused or redirected,
or that only asks questions writes nothing, not even those rewrites, and asks for no confirmation.
A run that cannot ask answers the questions, reports the changes it would have made, and writes
nothing. A changed `language.chat` takes effect from the next run.

**Precondition.** Targeted mode needs a configuration: a project-setup ADR or the hidden local
file. It stops without changing anything, says what it found, and points to `/effective-flow setup`
or `/effective-flow setup express` when there is no configuration or only a legacy JSON one, when
the configuration source is invalid, when the ADR still uses the legacy slug or the
convention-file marker is dead or diverges from the ADR, or when the runtime-state directory cannot
be verified. When several files could be the project-setup ADR, it names every path and stops; you
resolve the duplicates by hand before setup can continue. A legacy `**Firmo project setup:**`
marker is only reported; `/effective-flow setup express` switches its spelling.

**What it skips.** Targeted mode asks no Visibility question and keeps the visibility it finds. It
does not touch `.gitignore` or `info/exclude`, sets or repairs no marker, migrates no legacy JSON
configuration, makes no `CLAUDE.md` import offer, and runs no session-rename check. It writes in
place at the existing ADR or hidden local file and changes only the rows the request names, plus the
rewrites listed above. Its report names the mode `Targeted`, the interpreted changes, the rows
written or why nothing was written, the configuration path, and each redirected request. It
suggests no next step, because it stages nothing.

**Redirects.** Some requests stay with the full setup. Setup lists them in the preview with the
route to take and still offers the remaining changes:

- **Visibility:** to hide, run `/effective-flow setup hidden`; to unhide, run
  `/effective-flow setup` or `/effective-flow setup guided` and answer `Standard`.
- **Fast pilot** (`executionProfiles.fast.enabled`): run `/effective-flow setup guided` →
  **Advanced settings** → **Block 10 (`executionProfiles`)**; see
  [Fast pilot block](#fast-pilot-block).
- **First-time steps** (`.gitignore`, marker, `CLAUDE.md` import, session-rename check, legacy JSON
  migration): run `/effective-flow setup`.
- **In hidden mode**, every `tracker.*` key, the other
  [forced rows](configuration.md#hidden-mode), and a `delivery.branchPrefix` containing
  `effective-flow` are refused; answering `Standard` in `/effective-flow setup` leaves hidden mode.
- **Unknown keys** are not written. Existing unknown rows stay as they are.

### Visibility question

Every mode except Targeted asks **Visibility** before it touches `.gitignore` or any
configuration: Profile after Chat and Profile, Express and Guided as their first question.
`/effective-flow setup hidden` skips the question. `Standard` is the tracked ADR, marker, and `.gitignore` setup described on this
page. `Hidden` switches the run to [hidden mode](#hidden-mode). The question pre-selects `Hidden`
when a hidden local configuration already exists, and `Standard` otherwise. A run that cannot ask
keeps the pre-selected value and reports it.

### Hidden mode

Hidden mode is for a repository whose team has not adopted Effective Flow. The configuration,
plans, and concepts stay local under `.effective-flow/`, the tracker is pinned to `local`, no review
findings are posted on pull requests, delivery branches carry a neutral prefix, and no tracked file
names Effective Flow. [Configuration](configuration.md#hidden-mode) lists the forced values.

A hidden setup run:

1. Resolves the Git common directory with `git rev-parse --git-common-dir`. A directory that is not
   a Git repository cannot be hidden, and setup stops there.
2. Stops if `git ls-files -- .effective-flow/` lists anything, because `info/exclude` cannot hide a
   tracked file. Untracking those paths is your decision.
3. Appends the single line `.effective-flow/` to `<common-dir>/info/exclude` unless it is already
   there, creating the file if needed. A symlinked `info/` or `exclude`, or an `exclude` that is not
   a regular file, stops the run before anything is written. Existing lines are never rewritten, and
   a second run adds nothing.
4. Verifies the entry with `git check-ignore`. A tracked `.gitignore` negation that outranks it is
   reported and stops the run; setup does not edit `.gitignore`.
5. Writes the configuration to `.effective-flow/project-setup.md` in the main checkout, using the
   ADR envelope and table encoding plus the row `visibility | hidden`.

It never writes or edits `.gitignore`, a tracked ADR, `AGENTS.md`, or `CLAUDE.md`, and it skips the
ADR-convention resolution, the marker, the legacy JSON migration, and the `CLAUDE.md` offer. It asks
no question whose key is forced, such as the plan and concept directories, PR review, or tracker. A
`delivery.branchPrefix` containing `effective-flow` is rejected. Among the profiles, Fully local is
unchanged and Forge issues and development keeps its pull-request delivery while issue tracking
stays local. External issues and forge development is incompatible with hidden mode, so setup stops
and names the other two. The report lists the `info/exclude` path, the local configuration path,
every forced value and overridden row, and every tracked ADR, marker, or `.gitignore` line it left
untouched.

**Switching modes.** Standard to hidden: the hidden run writes the local file, which wins from the
next read on. The tracked ADR, its marker, and the `.gitignore` line stay exactly as they are and
are reported as shadowed; removing them, or rewriting history that already contains them, is up to
you. Hidden to standard: answer `Standard` while the local file exists. Setup runs the normal
standard path, seeded from the local values without `visibility` and the forced rows. After the
tracked write succeeds, it asks whether to delete `.effective-flow/project-setup.md`. Keeping the
file keeps hidden mode active. The `info/exclude` line stays in either case, because it still
ignores runtime state. Local plans and concepts are never moved; setup lists their paths so you can
move them into the tracked `plan.dir` and `concept.dir` yourself.

Setup follows an ADR file-naming convention your project has already decided on instead of
imposing its own. Before writing, it looks for a naming rule stated in `AGENTS.md`, `CLAUDE.md`,
or a decision register — `DECISIONS.md` at the repository root or at `docs/DECISIONS.md`, or a
`README.md`/`index.md` directly inside your ADR directory. A rule stated there wins. If nothing
states one, setup looks at how the ADR files directly inside that directory are already named and
uses that only when they all agree; an empty directory says nothing either way. Only if neither
answers does the Effective Flow slug default apply. A project that requires a numeric prefix
therefore gets `docs/adr/0002-effective-flow-project-setup.md`, and the completion report names
the applied convention and the file that established it.

If two or more sources state conventions that do not all agree, setup asks which one to use and
writes nothing until you answer. Answering "Inconclusive" sets all of those declarations aside and
falls back to how your ADR directory is already named, and then to the Effective Flow default. If
the question cannot be put to you at all — you skip it, or the run is not interactive — setup takes
that same "Inconclusive" route rather than jumping to its own default, so a uniformly numbered
directory does not receive a numberless file behind your back. It reports that it could not ask,
naming every source that spoke and what each one said.

Two sources can also agree that ADRs carry a number while stating different widths — `NNN-` in one,
`NNNNN-` in the other. That is not a disagreement about the convention, so setup does not ask; it
falls back to the width your existing files already use, then to four digits, and reports the
divergence.

If your project already has a project-setup ADR, setup updates that file where it lies. It is
never renamed to match the convention and never copied to a second, convention-shaped path; a
divergence between the existing path and the resolved convention is reported once. That also
applies to an ADR setup only finds on its final check just before writing. A symlink at
the intended target path stops the write instead: setup reports the path rather than writing
through it, whether the target is an existing ADR or a new one.

Setup never writes over a file that is already sitting at the name it resolved. If the convention
carries numbers it takes the next one and tries again, and stops on a second clash; with a numberless
convention there is no second name, so it stops and reports the path. This is what protects a
project-setup ADR whose configuration table was deleted or never finished — setup cannot read it as
configuration, but it will not overwrite it either. And if several files in your ADR directory could
each be the project-setup ADR, setup treats that as a question for you rather than as an empty
project: it lists them and asks which one to update, instead of adding one more.

Express writes no `mergeGate.*` row and no `delivery.mergeMethod` row: a missing line means the
merge gate's own default, so an unconfigured project gets `completion: ask`, every check required
green, no automatic reviewer expected — and `conflictResolution: auto`, which authorizes a gate run
to resolve a conflict between an open pull request's head branch and its base and to push the
resulting merge commit. That last one is the only one of those defaults that leads a run to write,
and it is what changes behavior for a project upgrading from an earlier generation; see
[Block `mergeGate`](configuration.md#block-mergegate).

Express stores `language.project: en` and lets every absent artifact-surface override inherit it.
Guided asks for the project language first, then offers independent `de`/`en` overrides for source
prose, user documentation, technical documentation, local workflow artifacts, Forge prose,
Git/release prose, and — as the seventh — the interactive language Effective Flow speaks to you in.
Choosing “inherit project language” removes or omits an artifact-surface override and appears in
the before/after confirmation. The chat override differs: its first option is “Mirror the user's
language (default)”, because an absent `language.chat` row mirrors whatever language you write in
rather than inheriting the project language. Profile mode asks that chat question first and binds
the selected language for the remainder of setup; Express adds no row for it but keeps one you
already set. A new ADR uses the
technical-documentation language; setup preserves the language of an existing ADR during ordinary
updates.

**Interplay:** `setup` owns configuration writes and migration. Other tools only resolve and read
the ADR; if they find only a legacy JSON config, they may use it transitionally for that run and
point to `setup`. During migration, setup converts the legacy values to the flat Markdown table,
sets the marker, normalizes `.gitignore` to `.effective-flow/`, and untracks an old tracked config
without deleting its on-disk content. A legacy `plan.markerLanguage` remains a read fallback for
one compatibility generation when neither a valid workflow nor project language exists. Whenever
`language.workflow` is absent, setup may show that the old marker-only choice becomes the language
of the complete workflow artifact, propose the new key, and remove the old row only after
confirmation; an existing new key always wins. Setup is also the repair path for retired rows:
it rewrites `prReview.*` rows as `mergeGate.*` (see
[Configuration](configuration.md#block-mergegate)) and `worktree.baseBranch`,
`worktree.branchPrefix`, and `worktree.completion` as their `delivery.*` successors (see
[Configuration](configuration.md#block-delivery)), in place and after the same confirmation. Another
tool stops or reports on such a row only if it resolves that row's successor key; any other tool
ignores it. The values set here
(`language.*`, `review.*`, `applyReview.*`, `plan.*`, `delivery.*`, `worktree.*`, `tracker.*`,
`skills.*`, `executionProfiles.*`) drive the other tools; the complete schema is in [Configuration](configuration.md).

As the last part of the configuration write, setup offers to add a `CLAUDE.md` whose whole content
is the single line `@AGENTS.md`. Claude Code loads `CLAUDE.md` into every session but reads
`AGENTS.md` only when something asks it to, so the import is what makes a project's guidance
reliably present. The offer is a question in every mode except Targeted, Express included, and a
run that cannot
ask it — unanswered, skipped, or non-interactive — writes nothing and says so. Setup creates the
file only where none exists, and replaces an existing `CLAUDE.md` only where it holds nothing but a
pointer to `AGENTS.md` and, where an earlier run left one there, setup's own marker line — and, when
that marker line is present, only once `AGENTS.md` carries the marker too. That last condition is
what keeps the replacement safe: while `CLAUDE.md` holds the only copy of the marker, setup leaves
the file alone. A `CLAUDE.md` with content of its own, or
one that already imports `AGENTS.md`, is reported and left alone, and a symlink at that path stops
the step rather than being written through — checked both against what setup saw before it asked
and again on disk immediately before it writes, so a path that changed while the question was open
is never written through. A symlink at that path also disqualifies the file as a host for the
project-setup marker itself: setup then writes that marker into a newly created `AGENTS.md` instead
of through the link. Where the marker had to go into `CLAUDE.md` because no `AGENTS.md` existed,
setup first creates the minimal `AGENTS.md` that carries it, and creates it exclusively so a file
that appeared in the meantime is never overwritten. Should that pair of writes only half-succeed,
setup says so, and because the marker then already lives in `AGENTS.md` a later run finishes the
import rather than treating the leftover file as content of its own. Like the session-rename step
below, this step adds no configuration key.

After the configuration write, setup offers an optional session-rename capability step. In the
**Codex tab embedded in the ChatGPT Desktop app**, the native current-task capability needs no
installation or configuration. After the user consents to the visible check, setup calls it once
with the fixed title `Effective Flow setup check` and reports the concrete result. It supplies no
task id, performs no task lookup, and does not retry. A successful call proves the path for that
run; an absent, denied, or failed capability means only that this probe failed. Later eligible
Desktop runs still attempt the native operation independently and print one suggested title only
when that individual call is unavailable or fails. Because the app exposes no reliable manual-title
ownership check, a later Desktop run may replace a title the user set manually.

On **Claude Code** the check has the same shape, because the rename itself does: a run renames its
own session through the host's session-management tool, so there is nothing to install and no
second session to prepare. After the user consents, setup renames the current session once with the
fixed title `Effective Flow setup check` and reports the concrete result; the user may rename it
back or let the next run retitle it. A declined or failed call means only that this probe failed,
and later runs still attempt the rename on their own. Codex CLI has no automatic title path in this
scope. Choosing **No** skips only this visible setup check; it does not disable later host-specific
title handling. Runs stay suggestion-only on Claude Code when the host declines the native rename,
Codex CLI, and any other host without a supported title path. The step adds no configuration key,
never edits harness configuration, and creates no title runtime file. If you still keep a separate
session from the earlier helper-session arrangement, setup no longer contacts it and you can close
it. See [Getting started](getting-started.md#keeping-sessions-tellable-apart) for each host's
current behavior.

Users who installed the former Codex path must remove only the `Stop` handler whose command invokes
`session-title.mjs apply` from their personal or repository-local Codex configuration. Preserve
unrelated handlers and the containing file. Setup gives this instruction but never opens, edits, or
deletes the configuration. Old title request and receipt files are inert and may remain; setup does
not remove them.

`setup` is the only repair path when runtime-state safety blocks a write. It validates the
repaired ignore and index state before writing any migration marker below `.effective-flow/`;
missing Git or a failed validation leaves that marker unwritten.

When the shared locator selected a transitional JSON config, setup also invokes the shared
runtime-directory migration after successful ignore/index repair and before it writes
`configMigration.adr`. This carries missing runtime state from `.firmo/` (otherwise `.sf-plugin/`)
into `.effective-flow/` without overwriting existing targets. A fresh setup with no selected
legacy config does not run this prerequisite and therefore does not create a runtime footprint.
If the runtime migration fails, setup leaves the config marker unwritten, preserves the selected
source and safely copied partial state, and applies its existing conditional rollback to its own
unchanged ADR/convention writes.

### Fast pilot block

Guided's advanced settings end with **Block 10 (`executionProfiles`)**, the opt-in for the
Quality/Fast field pilot of `/effective-flow build` and `/effective-flow refactor`. Profile and Express never ask it and keep an
existing `executionProfiles.fast.enabled` row exactly as recorded, including an invalid one. The
block first explains that `true` only admits the project to the pilot, shows the recorded value as
`enabled`, `disabled`, or `invalid – runs as Quality`, and asks with **Keep** pre-selected:

- **Keep** writes nothing.
- **Enable** writes `executionProfiles.fast.enabled = true`. No baseline starts and nothing
  activates.
- **Disable** writes `false`. Every workflow runs Quality, and stored pilot evidence stays
  untouched.

The change appears in the before/after list and needs the same confirmation as every other key; in
hidden mode it goes to the local `.effective-flow/project-setup.md`. The row never takes a model
or provider name.

Once the configuration step has finished (a declined confirmation or a stopped run offers no
action), the block reads the stored pilot generation and, only while the key is enabled, offers at
most one confirmed action:

| Stored generation                                   | Offered action                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none                                                | **Start** a Quality-only baseline, after setup shows the protocol digest and version, the local minimal-data disclosure, and the minimum baseline window and packet count required for activation |
| `suspended`, evidence healthy                       | **Resume**, bound to the shown inventory and suspension digests; the stored prior state is restored                                                                                               |
| `baseline`, `active`, `review`, unhealthy suspended | none; a baseline activates automatically, `review` can never resume, and an unhealthy suspension first needs its incomplete evidence reconciled                                                   |

Declining, skipping, or a non-interactive run sends nothing. No action changes the configuration
row, and the final report names the opt-in value, the stored generation state, and each offered
action's outcome. Setup never activates a generation: the confirmed baseline is the only consent,
and the next measured native `build` or `refactor` run activates it automatically once the preregistered window
and sample are met. See [Model-tiering pilot data and privacy](model-tiering-pilot.md) for what a
baseline records.

## `/effective-flow cleanup`

**Purpose:** Clears away legacy leftovers that Effective Flow's migrations deliberately leave
behind and checks every linked Git worktree in the current repository. For migrations, it still
handles the same four classes: legacy runtime directories `.firmo/`/`.sf-plugin/`, an untracked
or legacy `config.json`, outdated `.gitignore` lines, and `firmo-` labels in the remote issue
tracker. It reads them, checks their new counterpart for data that still needs to be carried
over, confirms each carry-over candidate, and deletes removable legacy data **git-aware** only
after explicit confirmation. Outdated `.gitignore` entries are reported but left untouched for
setup to repair.

After the initial legacy inventory, cleanup automatically invokes the same shared
runtime-directory migration when `.firmo/` or `.sf-plugin/` exists and the versioned completion
marker is missing. It then refreshes the legacy, counterpart, config, and worktree inventory
before offering any deletion. The migration itself needs no confirmation because it is
non-destructive and target-wins; confirmations remain mandatory for divergent carry-over,
explicit discard, and deletion. A run with no legacy runtime directory creates no marker or
runtime footprint.

If both legacy directories exist, `.firmo/` remains the selected migration source and
`.sf-plugin/` is assessed separately; the selected source's marker never certifies the unselected
directory. Cleanup also retains a legacy runtime directory while any registered current, active,
retained, or otherwise unresolved linked worktree remains below its `.worktrees/` tree. Such a
worktree can be removed only through the normal lifecycle claim protocol, never by deleting its
containing legacy directory.

For worktrees, `cleanup` parses Git's complete linked-worktree inventory and matches it against
the persisted Effective Flow lifecycle under
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/`. A worktree becomes a removal candidate
only when all independent checks agree: Effective Flow created it, its lifecycle is
`cleanup-ready` or `cleanup-failed`, its execution-location receipt still matches its repository,
path, branch, purpose, and registration, and the checkout is clean, unlocked, and not prunable.
The repository's main worktree and the worktree running `cleanup` are never removal candidates.

Cleanup also lists **stale diff baselines**: the `.effective-flow/runs/<RUN_ID>/diff-baseline/`
directories that an aborted `build`, `fix`, or `refactor` run left behind (see
[Implement a change](tools-implement.md)). They can contain working-tree content, including
secrets. Each appears in the dry run with its run ID (the run's start timestamp) and a warning that
a run still in progress needs its directory; its age is never taken as proof that it is abandoned.
Stale diff baselines get their own confirmation instead of sharing the legacy-remnant question:
remove all, select individually, or keep all.

**When to use:** After Effective Flow has migrated a project from an older version (`.firmo/`,
`.sf-plugin/`, `firmo-` labels) and you want to remove deliberately retained legacy data, or when
a finished Effective Flow run left a linked worktree behind. Migration itself remains
non-destructive, and a worktree's age alone never makes it safe to remove.

**Typical call:** `/effective-flow cleanup`

**Input/output:** No input beyond the confirmations. The skill first shows an inventory, then a
dry-run preview of each deletion class. It removes tracked legacy files via `git rm` (recoverable
through Git history), removes untracked or gitignored legacy directories physically and
irreversibly after explicit confirmation, and removes an eligible worktree with ordinary
`git worktree remove <path>` only after confirmation. It never uses `--force`, broad
`git worktree prune`, or `git branch -D`. Delivery branches remain in the repository; a temporary
`apply-review` branch may be removed only with `git branch -d` when its lifecycle proves that the
component was integrated safely.

The final report is always produced, even when no migration remnant or removable worktree exists.
It separates removed worktrees from failed removal attempts and lists every remaining linked
worktree except the main worktree. Each entry includes its path, checkout identity, lifecycle or
inspection status, a specific reason for keeping it, and a safe next step. When cleanup runs in a
linked worktree, that current execution worktree is reported as in use by the cleanup run. Active,
aborted, failed, dirty, locked, prunable, harness-managed, mismatched, and lifecycle-less worktrees
stay intact.
An `active` record may represent either work still in progress or a run interrupted by a crash;
there is no timeout or heartbeat that guesses which one it is.

Cleanup creates **no** commit or backup and never changes current ADR values or a global skill
installation. It never edits `.gitignore`. It reports the `.effective-flow/` line in the Git common
directory's `info/exclude` as the active entry [hidden mode](#hidden-mode) relies on and never
removes it. The same holds for the hidden local configuration `.effective-flow/project-setup.md`
and the `iterate` thread ledger `.effective-flow/merge-gate/thread-ledger.json`; both are current
state, not leftovers. It may copy confirmed runtime files into
`.effective-flow/`, remove a confirmed legacy config from that directory, or remove a confirmed
stale diff baseline; otherwise it preserves active runtime state. A true no-op means there are no
migration actions, no stale diff baselines, and no eligible worktrees, but the remaining-worktree
report still appears.

**Interplay:** `cleanup` does not adopt config values from a legacy `config.json` itself – it
points to [`/effective-flow setup`](#effective-flow-setup) for that, the owner of the
project-setup ADR. It likewise inventories outdated `.gitignore` entries but leaves them
untouched; only setup repairs or normalizes `.gitignore`. It also never adopts an older worktree
that has no lifecycle record, even when its path or branch name looks like Effective Flow. The
staged `git rm` changes are then handled by [`/effective-flow commit`](tools-deliver.md).

## `/effective-flow version`

**Purpose:** Shows the currently installed Effective Flow version including the short Git hash.

**When to use:** To check which Effective Flow version is installed, for example before a bug
report or after an update.

**Typical call:** `/effective-flow version`

**Input/output:** No input. The output is a single-line version string; no files are changed.

**Interplay:** The displayed version comes from `.release-please-manifest.json` and is
maintained via release-please (versions and `CHANGELOG.md` are generated automatically from
Conventional-Commit messages, not manually). For details on the release and installation
process, see [Release and Installation](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/release-and-installation.md).

## Further reading

- [Configuration](configuration.md) – complete project-setup ADR reference
- [Worktree and Delivery](worktree-and-delivery.md) – effect of `worktree.*`/`delivery.*`
- [Remote Tracker](remote-tracker.md) – effect of `tracker.*`
- [Skill Discovery](skill-discovery.md) – effect of `skills.*`
- [Release and Installation](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/release-and-installation.md) – how Effective Flow
  is installed and versioned

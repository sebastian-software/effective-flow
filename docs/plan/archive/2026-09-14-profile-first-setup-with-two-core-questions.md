# Profile-first setup with two core questions

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Make profiles the standard `effective-flow setup` experience so that every default or explicit
Profile-mode run starts with only two substantive questions:

1. which language Effective Flow should use in this chat;
2. which of three common workflow profiles should be applied.

The three profiles are:

1. **Fully local** — planning, findings, implementation and completion stay local; Effective Flow
   does not use GitHub or Forgejo issues or pull requests.
2. **Forge issues and development** — GitHub or Forgejo owns issue-backed planning/tracking and
   development is delivered through pull requests on that forge.
3. **External issues and forge development** — an external project-management tool such as Linear
   owns issue-backed planning/tracking, while GitHub or Forgejo still owns branches and pull
   requests.

The existing Express and Guided setup behavior remains available as explicit modes. The local and
forge profiles need no further substantive configuration questions. After the external profile is
selected, setup may additionally ask for the external tool, connection context and lifecycle states
needed to create a valid provider-neutral configuration. Every profile path may still pose the
existing before/after write confirmation and conditional safety or consent questions. This resolves
the user's clarifications of 2026-09-14: confirmation and safety questions are allowed, and the
external profile may ask the extra integration questions that its selected topology requires.

This plan supersedes the interaction decisions in the untracked open predecessor
[`2026-09-12-deployment-line-profile-in-guided-setup.md`](2026-09-12-deployment-line-profile-in-guided-setup.md).
That predecessor keeps every per-key Guided question after a deployment-line choice and leaves
Express as the no-argument default choice; the new requirement instead makes profiles the standard
short path. The predecessor file is user-owned and remains untouched by this planning run. An
executor must use this plan only and must not combine both interaction models.

### Planning baseline

- Planned on 2026-09-14 against `origin/develop` at `cf71425`; the checked-out `develop` was at
  `538e224`, four commits behind. The intervening commits do not change `src/tools/setup.md`,
  `docs/user-guide/tools-setup.md`, `docs/user-guide/configuration.md`, or
  `src/shared/chat-language.md`, but they do change `build.mjs`,
  `docs/developer-guide/build-system.md`, and `test/workflow-contracts.test.mjs`.
- The in-scope source and documentation files were clean. Two unrelated plan files were already
  untracked, including the predecessor named above; both were preserved.
- The project setup ADR resolves `plan.dir` to `docs/plan` and `language.workflow` to `en`, so this
  complete plan is written in English.
- No top-level plan under `docs/plan/` uses the legacy `NNNN-…` file-name form, so no bulk migration
  was required.

### Verified current state

- `src/tools/setup.md` Step 3 currently asks the user to choose **Express** or **Guided**.
  Express builds the safe-default base, overlays an existing configuration so existing values win,
  and jumps to the common write step. Guided asks the core switches individually and optionally
  enters the advanced settings.
- Guided currently asks worktree, completion, base branch, PR review, project and surface languages
  including `language.chat`, tracker target and conditional tracker details. This is the interview
  the standard profile path must bypass.
- The common Step 6 rereads the source, preserves unknown and unasked values, shows every proposed
  before/after change, and requires confirmation before writing. Later questions protect the
  optional `CLAUDE.md` import and the visible session-rename probe. These confirmations remain
  valid on the profile path and do not count as substantive profile questions.
- `language.chat` is currently resolved once before the first interactive output and held for the
  entire run. Changing the language selected by question 1 for question 2 therefore requires one
  narrow, setup-only bootstrap exception in the shared chat-language contract.
- `tracker.mode: external` is invalid without a non-empty `tracker.externalTool`.
  Issue-backed implementation additionally requires a freshly verified started-state value in the
  exact external context. Effective Flow ships no product-specific adapter and must not infer
  connection capabilities or state IDs from a familiar tool name.
- Terminaro separates external planning from forge delivery: `tracker.mode: external` and Linear
  connection data coexist with `delivery.completion: pr`, an `origin/main` base and
  `mergeGate.completion: merge`. Its history changed tracker routing independently from forge
  delivery, which confirms that the reusable external profile should be an external-tracker overlay
  on a normal forge-PR workflow.
- Terminaro-specific values are not portable: its Linear workspace/team hint, started/done UUIDs,
  `sf` branch prefix, `origin/main`, Recensor bot, worktree commands and language choices must never
  become generic profile defaults.
- Profile selection changes the tracker used by issue-backed planning and review publication.
  A natural-language `effective-flow plan` request without an issue reference still creates a local
  plan file under `plan.dir`; no existing configuration key changes that gateway behavior.
- `src/tools/setup.md` has almost no context-budget headroom. A material inline profile contract
  would exceed the budget; the profile-only behavior needs a lazy single-consumer fragment and a
  freshly measured budget entry.

## Architecture decisions

- **Profiles are the no-argument default; modes are explicit.** `effective-flow setup` and
  `effective-flow setup profile` enter the profile-first flow. `effective-flow setup express` and
  `effective-flow setup guided` enter the existing modes directly. Normalize only surrounding
  whitespace and ASCII case for these three stable tokens; an unknown or additional argument shows
  the accepted invocations and stops before any write. This avoids a third setup-mode question and
  avoids a five-option picker that mixes workflow topologies with configuration depth.
- **Two common questions first; external details only when selected.** The first ask chooses
  `language.chat` (`Mirror`, `English`, or `German`); the second ask chooses exactly the three
  profiles. Profile mode poses both immediately after argument classification and its read-only
  entry-language bootstrap, before Step 1 or any existing conditional setup prompt. Only then does
  it run the `.gitignore`, source, ADR-convention and topology preflights. Fully local and Forge +
  issues ask no further substantive configuration questions. External + forge asks only the
  external tool, connection context and lifecycle-state questions required to establish one valid
  provider-neutral tracker connection; it does not enter the rest of Guided's core or advanced
  interview. The later full diff confirmation, invalid-source decisions, ADR/path collision gates,
  non-Git safety question, `CLAUDE.md` write consent and session-rename consent remain conditional
  confirmation or safety questions.
- **The first answer controls the second question immediately.** Add a setup-only bootstrap rule to
  `src/shared/chat-language.md`: setup asks the chat-language question in the language resolved at
  entry (or the recognizable conversation language), then binds the selected concrete value once
  for all subsequent setup output. `Mirror` keeps the current run in the user's recognizable
  language and removes an existing `language.chat` row on the confirmed write; `English` and
  `German` bind and persist `en` or `de`. Every other tool retains the existing resolve-once-before-
  output rule.
- **The language exception is a durable project decision.** Update `docs/adr/language-policy.md`
  with the same narrow exception: only setup's Profile path may ask in the entry language and then
  bind the selected value for the rest of that setup run. No other tool may rebind its resolved
  chat language.
- **A profile is a transient overlay, not configuration.** Introduce no `setup.profile` key. For a
  fresh project, build `safe defaults → selected profile overlay → chat-language choice`. For an
  existing project, start from safe defaults, preserve all existing known and unknown values, then
  apply the selected profile and chat-language overlays. Profile-owned keys intentionally win over
  existing values so a profile can switch a project; all unrelated and unknown rows remain
  untouched.
- **Profile selection is not the write confirmation.** After question 2, reuse Step 6 to render one
  exact before/after list and obtain the existing explicit confirmation. No profile-dependent
  configuration, ADR or marker change occurs before that confirmation; setup's existing
  profile-independent `.gitignore` normalization retains its current lifecycle. This keeps the
  short selection comprehensible without hiding which existing settings will be replaced.
- **The profile overlay owns only topology.** It sets the tracker target, completion path and the
  base required by that topology. Review depth, worktree policy, validation, branch prefix,
  `delivery.prReview`, merge method, merge-gate policy, plan/concept paths, skill preferences and
  artifact languages remain safe defaults or preserved existing values. Dormant tracker/provider
  values are preserved rather than deleted when another profile makes them inactive.

  | Profile                               | Profile-owned target values                                                                                                                                                                                                                             |
  | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Fully local                           | `tracker.mode = local`; `delivery.completion = merge`; `delivery.baseBranch = <current local branch>`                                                                                                                                                   |
  | Forge issues and development          | `tracker.mode = remote`; `delivery.completion = pr`; `delivery.baseBranch = <verified origin default>`; `tracker.remoteToolOverride = auto` only for an origin the helper can classify                                                                  |
  | External issues and forge development | Forge delivery values above; `tracker.mode = external`; preserved or newly captured and freshly verified `tracker.externalTool`, a hint sufficient to reselect the exact connection/context when needed, required started state and optional done state |

- **Fully local profile.** Set `tracker.mode = local`, `delivery.completion = merge`, and
  `delivery.baseBranch` to the current local branch. Even when a remote happens to exist, this
  profile does not select a remote base, open a pull request, or publish issue work. Worktrees remain
  available because they are local Git isolation, not forge usage.
- **Forge issues and development profile.** Require a usable GitHub or Forgejo `origin`; derive
  `delivery.baseBranch` from `origin/HEAD` with the existing `origin/main` fallback, set
  `delivery.completion = pr`, `tracker.mode = remote`, and keep or set
  `tracker.remoteToolOverride = auto` only when the existing helper can classify the origin. A
  custom or ambiguous host without a decisive valid override makes this profile unavailable and
  directs the user to `effective-flow setup guided`; it is never guessed.
- **External issues and forge development profile.** Start with the forge profile's delivery
  behavior, then overlay `tracker.mode = external`. Reuse valid recorded external values as
  preselected answers. Otherwise ask for the short external-tool identifier and an optional
  connection hint, establish exactly one configured MCP or authenticated CLI connection, show the
  candidate contexts when the hint is insufficient, and ask for the exact workspace/team/project
  context required to disambiguate it. When that selection is necessary for repeatable resolution,
  fold its stable workspace/team/project identity into `tracker.externalToolHint`, preview the exact
  resulting hint, and persist it only with the common confirmation. Discover state candidates
  freshly and ask for a writable, non-terminal started state plus an optional writable terminal done
  state, always storing stable IDs or exact accepted tokens rather than display names. Missing
  capability or an unanswered ambiguity stops without writing. An absent or deliberately omitted
  done state writes or retains `null` and discloses that post-merge completion remains unavailable.
  This conditional branch may exceed two substantive questions by the user's explicit decision; it
  asks only what is necessary for the external integration and never enters unrelated Guided
  settings.
- **Terminaro is evidence for the split, not a template to copy.** Generalize
  `tracker.mode = external` plus forge `delivery.completion = pr`; auto-detect the forge and base.
  Never copy Terminaro's workspace hint, state UUIDs, branch prefix, bots, merge authorization,
  worktree commands or languages.
- **Keep the core small.** Put the two common profile questions, mappings, conditional external
  integration interview and discovery rules in a new lazy fragment
  `src/shared/setup-profiles.md`, loaded only for the absent or `profile` argument. Keep argument
  routing and the Express/Guided branch entries in
  `src/tools/setup.md`. Re-measure `setup` after removing the old Step 3 path ask and adding the
  pointer; lower `CONTEXT_BUDGET_LINES.setup` to the measured core plus no more than ten lines of
  headroom. Because the chat-language contract is eagerly included by nearly every speaking tool,
  inspect the complete build budget report and update every consumer entry whose measured core
  changed, preserving each entry's prior headroom and the ten-line maximum rather than treating
  this as a setup-only budget change.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/setup.md`                   | Accept and route `profile`/`express`/`guided`; make profile the no-argument default; remove the Express/Guided picker; connect the new profile fragment to the common preview/write path; prevent duplicate Guided chat-language input after a profile run; generalize summary and confirmation wording. |
| `src/shared/setup-profiles.md`         | New lazy single-consumer contract for the two common questions, transient profile overlays, conditional external integration questions, forge/external preflight and fail-closed behavior.                                                                                                               |
| `src/shared/chat-language.md`          | Add the narrow setup bootstrap exception that lets question 1 determine the language of question 2 and the remainder of setup.                                                                                                                                                                           |
| `docs/adr/language-policy.md`          | Record Profile setup as the sole exception to whole-run chat-language resolution and keep every other tool's resolve-once rule intact.                                                                                                                                                                   |
| `build.mjs`                            | Re-measure `setup` after the Step 3 replacement and every eager consumer affected by the shared chat-language edit; ratchet entries to measured size plus preserved headroom of at most ten lines.                                                                                                       |
| `test/workflow-contracts.test.mjs`     | Pin mode routing, question count/order, profile mappings, overlay precedence, common confirmation, fail-closed external discovery and unchanged Express/Guided behavior.                                                                                                                                 |
| `test/build-lib.test.mjs`              | Pin the setup-only chat-language bootstrap exception while preserving the existing rule for every other speaking tool.                                                                                                                                                                                   |
| `evals/merge-gate/results/**`          | Remove the five stale archived rounds for each of the five merge-gate scenarios after the changed loaded language/gate tree invalidated their build stamps; do not re-stamp observations from an older build.                                                                                            |
| `docs/user-guide/tools-setup.md`       | Document profile-first invocation, the two common questions, three mappings, explicit Express/Guided invocations, confirmation/safety questions and the conditional external integration interview.                                                                                                      |
| `docs/user-guide/configuration.md`     | Explain transient overlays, profile-owned precedence, absence of a profile key and external connection/state handling.                                                                                                                                                                                   |
| `docs/user-guide/getting-started.md`   | Present the three common workflow topologies before the normal Plan → Build → Pull Request journey and link to setup/tracker/delivery details.                                                                                                                                                           |
| `docs/user-guide/README.md`            | Update navigation descriptions so the profile-first setup and external planning route are discoverable.                                                                                                                                                                                                  |
| `docs/user-guide/tools-deliver.md`     | Replace the old click-path wording with the explicit `effective-flow setup guided` invocation where advanced delivery settings are required.                                                                                                                                                             |
| `docs/user-guide/troubleshooting.md`   | Update the old no-argument Express instructions to the explicit Express mode and describe when Guided is required.                                                                                                                                                                                       |
| `docs/user-guide/skill-discovery.md`   | Replace the old Guided picker path with the explicit Guided invocation for materializing skill recommendations.                                                                                                                                                                                          |
| `docs/developer-guide/build-system.md` | Register `setup-profiles` as a deferred single-consumer fragment and update the measured setup core description against the current `origin/develop` text.                                                                                                                                               |
| `src/tools/merge-gate.md`              | Update the advisory that currently says “setup → Guided → Advanced” to the explicit `effective-flow setup guided` route without changing gate behavior.                                                                                                                                                  |

The superseded predecessor plan is deliberately not an implementation target and is not modified or
deleted by this plan.

## Implementation details

### Approach

1. Rebase the implementation work on the then-current `origin/develop`, reread the in-scope files,
   and compare them with `cf71425`. Stop and revise this plan if setup's source model, chat-language
   contract, external tracker requirements, ask-block renderer or validation commands changed
   materially. Do not combine this plan with the Guided-only predecessor.
2. Add early argument classification to `src/tools/setup.md` before the first mutating step. Accept
   empty/`profile`, `express`, and `guided`; reject everything else with copy-paste-ready usage and
   no file or Git mutation. Record the resolved mode once for later branching and the final summary.
3. For Profile mode, resolve only the entry language read-only, then load
   `src/shared/setup-profiles.md` through one argument-decidable `lazy-include` before Step 1 and
   before any existing setup prompt. The fragment asks `Chat` first with exactly
   Mirror/English/German, applies the narrow current-run language binding, then asks `Profile` with
   exactly Fully local/Forge + issues/External + forge. Both headers stay within the build's
   twelve-character limit. Do not let duplicate sources, ADR ambiguity, non-Git handling or any
   other later gate reorder these two asks.
4. Preserve Step 1's profile-independent `.gitignore` lifecycle and all existing fail-closed
   Git/index rules after the Profile interview. Mode classification still precedes it so an invalid
   invocation can stop before any mutation; a valid Profile, Express or Guided run reaches the same
   target-state repair as today. Express and Guided otherwise retain their existing setup order.
5. Define the target construction order and exact profile-owned keys in the fragment. Make the
   profile overlay beat existing values only for those keys; preserve unknown and unrelated values
   byte-for-byte. Never persist the selected profile name.
6. After the Profile answer, implement choice-specific read-only topology preflight before preview
   or write: resolve the `origin` provider and base without guessing. For the external profile,
   preselect valid recorded tool/hint/state values; ask for missing or changed external values using
   the existing Guided external-tracker mechanics only. Resolve exactly one capable configured
   connection and exact context, list freshly discovered state candidates, and require an explicit
   stable started-state selection while allowing the done state to remain `null`. Retain the
   selected connection identity, exact context identity, and started/done stable IDs together with
   their category, terminal and writability properties. If the selected context is needed to make
   later connection discovery unique, merge its stable identity into the proposed
   `tracker.externalToolHint`; show that non-secret hint plus provider, base, context and state
   evidence before the shared write confirmation. An unanswered ambiguity or missing capability
   stops without writing; never guess from a tool or display name.
7. Route profile mode directly to the existing common before/after preview and confirmation, then
   through the existing ADR/marker/migration write mechanics. Retain conditional confirmation and
   safety questions for actual writes and observable side effects. Route Express directly through
   its existing safe-base-plus-existing behavior and Guided directly into the existing core and
   advanced questions. The external profile borrows only Guided's external-tool/context/state
   question contract, not its other core or advanced questions.
8. Add the setup-only bootstrap branch to `src/shared/chat-language.md`. Ensure the initial chat
   question is rendered in the entry language, the selected language is used for the profile
   question and remainder of setup, and no other tool can rebind its resolved chat language. Record
   that exception in `docs/adr/language-policy.md` and keep its references and validation triggers
   aligned.
9. Update Step 8 to report `Profile`, `Express`, or `Guided`; for Profile, report the selected
   topology, final owned values, detected provider/base, external connection/state result where
   applicable, the chat-language choice and every confirmed change. Retain all existing migration,
   ADR convention, `CLAUDE.md`, session-rename and staged-change reporting.
10. Add focused contract tests before changing broad wording assertions. Parse the profile fragment
    as a contract rather than testing one large prose blob; keep existing base-branch, tracker,
    external-state, confirmation, ADR, migration, `CLAUDE.md` and rename tests intact. Generalize
    “both paths” comments/assertions only where Profile now legitimately joins the same invariant.
11. Update every affected user/developer documentation surface listed above. Present profiles as
    common workflow topologies, not persisted presets. Use explicit `setup express` and
    `setup guided` commands in re-entry instructions.
12. Run the repository CI sequence and inspect the rendered Claude, Codex and portable setup output.
    Read the complete build `Always-loaded core (lines/budget)` report. Set `setup` and every eager
    chat-language consumer changed by the shared exception to the measured value plus its preserved
    headroom, never more than ten lines; do not raise `setup` to make an inline profile
    implementation fit.

### State management

- The selected mode, chat language and profile exist only for the current setup run.
- Profile mode retains the two interview answers before Step 1 and carries them through the later
  source, convention and topology gates; those gates must not silently discard or reinterpret an
  answer when they resume.
- The ADR remains the sole persisted source of truth. Its individual keys describe the resulting
  behavior; no profile identity is stored.
- `tracker.externalToolHint` stores enough non-secret connection and context identity to reproduce
  an external selection when the tool identifier alone is ambiguous; it remains optional when the
  identifier already resolves exactly one valid context.
- The profile flow must retain the same fresh-reread, compare-before-write and unknown-key
  preservation rules as Express and Guided.
- Selecting Mirror is represented by an absent `language.chat` row, never `null`.

### API integration

- Forge-backed profiles use the existing origin/provider classification and authenticated GitHub
  (`gh`) or Forgejo (`tea`) path; no new provider adapter is introduced.
- External discovery uses only a user-configured MCP connection or authenticated CLI whose exposed
  capabilities satisfy the provider-neutral tracker contract. It never assembles raw API requests
  from environment credentials and never infers capabilities from `linear` or another brand name.
- Retain only the selected connection identity, exact context identity, stable state IDs and the
  state properties needed to validate the pending profile. Never retain, persist or echo access
  tokens, environment credentials, shell-history content or unrelated connector metadata.
- All connection/state discovery is read-only until the shared setup confirmation approves the ADR
  write.

### Edge cases

- **Existing config conflicts with the chosen profile:** the before/after preview names every
  profile-owned replacement; unrelated and unknown rows remain unchanged.
- **Mirror selected over a fixed chat language:** the preview shows removal of `language.chat`; the
  current run immediately mirrors the user's recognizable language.
- **Local profile in a repository with `origin`:** Effective Flow uses the current local branch,
  local reports and local merge; the Git remote itself is neither removed nor modified.
- **Local profile from a detached HEAD:** reuse an already-recorded valid local base when one exists;
  otherwise stop and direct the user to check out a local branch or use Guided. Never persist a
  commit SHA as the delivery base merely to avoid a question.
- **Local profile outside a usable Git repository or on an unborn branch:** stop before the
  profile-dependent configuration write and direct the user to initialize/checkout a named branch;
  the non-Git `.gitignore` question does not manufacture a delivery base.
- **Forge profile without `origin`, authentication or an identifiable GitHub/Forgejo host:** stop
  before writing and direct the user to Guided or repository setup; do not silently downgrade to
  local.
- **Forgejo host needs an explicit override:** reuse a valid recorded override; otherwise stop and
  direct the user to Guided rather than guessing GitHub or Forgejo.
- **External profile with valid existing connection data:** show it as the preselected answer, then
  revalidate the exact connection, context and states fresh; stale stable IDs do not survive merely
  because they are recorded.
- **Fresh or incomplete external configuration:** ask for the missing tool identifier, optional
  connection hint, exact context and lifecycle states inside the external profile branch. Enumerate
  only candidates returned by configured MCP connections or authenticated CLIs; never discover raw
  credentials or infer identity from a brand/display name. If the chosen context resolves an
  ambiguity, propose a reproducible non-secret `tracker.externalToolHint` and include it in the
  confirmation preview.
- **No uniquely resolved external connection or context after clarification:** stop without writing
  and report what remains ambiguous; do not silently route to another tracker or enter unrelated
  Guided questions.
- **Recorded external connection but no valid started state:** stop without writing because
  issue-backed implementation would be unusable.
- **No valid done state:** the profile may proceed with `tracker.externalDoneState = null` only
  after the preview discloses that post-merge terminal transition and done reconciliation remain
  unavailable; it does not invent a state from a display name.
- **External connection becomes stale between discovery and confirmation:** reread immediately
  before the config write using the exact proposed tool/hint and compare the selected connection,
  exact context, state IDs, categories, terminal flags and writability with the retained basis. If
  the hint cannot reproduce the selected context or any validity-affecting property differs,
  discard the preview and either stop or rebuild it and obtain a fresh confirmation; never write
  against the stale preview.
- **Unknown setup argument:** show the four accepted forms (`setup`, `setup profile`, `setup express`,
  `setup guided`) and stop before `.gitignore`, ADR, marker or runtime-state mutation.
- **Non-interactive host:** do not guess either substantive answer. Report that Profile requires the
  two common selections, that the external branch may require further input, and that Express is
  available explicitly when the caller intentionally wants it.
- **Safety/confirmation questions:** remain conditional and may bring the total prompt count above
  two; they must not be counted or described as profile-configuration questions.

### Stop conditions

- Stop if the implementation would require a persisted profile key or a second configuration source.
- Stop if either forge-backed profile cannot preserve the existing provider/base fail-closed rules.
- Stop if the external profile would have to copy Terminaro-specific values, infer an external tool
  outside configured connections, choose among multiple contexts/states without the user's answer,
  or persist an unverified started state.
- Stop if changing the current run's language cannot be isolated to setup without weakening the
  resolve-once rule for other tools.
- Stop if the profile flow writes profile-dependent configuration, the setup ADR, its marker, or a
  migration before the common before/after confirmation. The existing profile-independent
  `.gitignore` lifecycle remains governed by its own safety contract.
- Stop if the new lazy fragment cannot be triggered from already-loaded argument state.
- Stop if any eager chat-language consumer exceeds its budget and the change cannot preserve that
  consumer's prior headroom within the ten-line ceiling; do not hide shared cost by checking only
  `setup`.

## Acceptance criteria

The feature is complete only when all criteria below hold together:

- [x] `effective-flow setup` and `effective-flow setup profile` reach the profile flow;
      `effective-flow setup express` and `effective-flow setup guided` reach their existing
      behaviors directly; an unknown argument performs no mutation and reports the accepted forms.
- [x] Every profile run poses `Chat`, then `Profile` as its first two substantive configuration
      asks; the Profile ask contains exactly the three requested topologies and no Express or Guided
      option. They occur before every conditional `.gitignore`, source, ADR-convention or topology
      prompt, including non-Git, duplicate/invalid-source and ambiguous ADR paths. Local and forge
      profiles ask no further substantive configuration questions; only the selected external
      profile may continue with its required integration details.
- [x] The chat choice controls the language of the Profile ask and all later setup output, persists
      `en`/`de` or removes the row for Mirror only after confirmation, and every non-setup tool keeps
      the existing once-before-output language invariant. `docs/adr/language-policy.md` records the
      Profile-only exception.
- [x] The local profile produces local tracker/merge behavior with a local base; the forge profile
      produces forge issues plus PR delivery; the external profile produces external issue routing
      plus forge PR delivery. No `setup.profile` or equivalent row is written.
- [x] The user guide states that the two forge-backed profiles route issue-backed planning/tracking;
      natural-language planning without an issue reference continues to create a local plan file.
- [x] Existing values are preserved except for the selected profile's explicitly owned topology keys
      and the explicit chat-language choice; unknown keys remain byte-for-byte intact.
- [x] Every profile path reaches the full Step 6 before/after preview and explicit confirmation
      before any profile-dependent configuration, ADR, marker or migration write. The existing
      profile-independent `.gitignore` lifecycle and conditional safety/consent gates remain intact.
- [x] Forge-backed profiles require a verified GitHub/Forgejo origin and repository-derived base;
      provider or base ambiguity never falls back to a guessed forge or local workflow.
- [x] The external profile never copies Terminaro's hint or UUIDs, never writes
      `tracker.mode = external` without a non-empty verified tool identifier, and never writes an
      unverified started state. It preselects valid recorded values and can initialize a fresh
      repository by asking only for the missing external tool, configured connection context and
      lifecycle states. Unanswered ambiguity or missing capability stops without connector
      invention or tracker fallback.
- [x] When selecting an external context is necessary for unique connection discovery, the proposed
      `tracker.externalToolHint` contains enough stable, non-secret identity to reselect it; the
      before/after preview shows the hint and a fresh pre-write read proves that it reproduces the
      same connection and context.
- [x] External pre-write revalidation compares the same connection/context and every
      validity-affecting state property against the confirmed preview; drift causes a stop or a new
      preview and confirmation. No credential or unrelated connector metadata is echoed or
      persisted.
- [x] `src/shared/setup-profiles.md` is shipped once to each consumer target through a decidable lazy
      pointer; the build's fragment and context-budget guards pass with every eager consumer of the
      changed chat-language fragment correctly remeasured.
- [x] Runtime source, tests and all listed documentation use the same profile names, mappings,
      explicit mode invocations and distinction between the two common questions, the external-only
      integration questions and conditional confirmations.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all exit 0, and
      manual rendered-output checks confirm the same routing and question order in Claude, Codex and
      portable builds.

## Validation plan

| Purpose                 | Command or check                                                                                                                                                                                                                            | Expected result                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting              | `pnpm agent:check`                                                                                                                                                                                                                          | exit 0 with only intended source, test, documentation and plan changes                                                                                                                                                |
| Contract and unit tests | `pnpm test`                                                                                                                                                                                                                                 | exit 0, including new setup-mode, profile, overlay and chat-bootstrap assertions                                                                                                                                      |
| Build and guards        | `node build.mjs`                                                                                                                                                                                                                            | exit 0; `setup-profiles` ships; no unresolved directive remains; every changed eager core is within its ratcheted budget                                                                                              |
| Distribution smoke      | `pnpm test:distribution`                                                                                                                                                                                                                    | exit 0 for isolated Claude, Codex and portable delivery layouts                                                                                                                                                       |
| Profile happy paths     | Run rendered setup in fresh scratch repositories for local and GitHub/Forgejo profiles; exercise fresh and existing external configurations with a deterministic fake connection fixture and, where available, a configured test connection | Chat and Profile come first; local/forge proceed to confirmation, while external asks only its missing integration details; resulting ADR rows match the selected topology without CI depending on a live third party |
| Prompt ordering         | Exercise Profile mode in non-Git, duplicate/invalid-source and ambiguous ADR-directory fixtures                                                                                                                                             | Chat and Profile remain the first two asks; every conditional safety, source and convention prompt follows them                                                                                                       |
| Failure paths           | Scratch repositories with no/ambiguous forge and deterministic fixtures for unanswered external ambiguity, missing capability, changed state properties or invalid started state                                                            | no invalid profile is written; drift invalidates the preview; the run reports the evidence without guessing or changing tracker target                                                                                |
| Language policy         | Inspect the flattened chat-language contract, setup output and `docs/adr/language-policy.md`                                                                                                                                                | only Profile setup can bind a new chat language after its first ask; all other tools resolve once                                                                                                                     |
| External context replay | Fake connection with several contexts, then one explicit workspace/team/project selection                                                                                                                                                   | preview persists a non-secret sufficient hint; pre-write discovery with that exact hint reselects the same connection/context uniquely                                                                                |
| Preservation            | Existing ADR fixture with unknown rows and conflicting topology values                                                                                                                                                                      | preview lists owned replacements; confirmation changes only owned/chat keys and preserves every other row                                                                                                             |

## Assumptions and open points

- Assumption: “Profiles as the standard setup” means the no-argument invocation enters Profile,
  while Express and Guided remain available through explicit mode arguments. This preserves all
  three experiences without adding a setup-mode question.
- Assumption: the names shown above may be shortened in the picker to satisfy renderer limits, but
  documentation and descriptions must retain the complete meanings.
- Assumption: conditional mutation confirmations, safety decisions, `CLAUDE.md` consent and the
  session-rename probe are allowed after the two common questions, per the user's clarification.
- Decision confirmed by the user on 2026-09-14: after External + forge is selected, Profile may ask
  further substantive questions for the external tool, configured connection context and lifecycle
  states; fresh repositories do not have to enter the full Guided setup.
- The older Guided-only predecessor remains an untracked user artifact. It is superseded for this
  feature but is not deleted or rewritten without a separate explicit request.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

Deep interactive review on 2026-09-14 applied the `effective-delivery` implementation-plan contract
against the setup, chat-language, language-policy and tracker sources.

- **Critical — Architecture — external first-run behavior needed a product decision.** Resolved by
  the user's decision on 2026-09-14: after External + forge is selected, the profile may ask the
  additional tool, configured connection-context and lifecycle-state questions required for a valid
  external tracker. This keeps Chat and Profile first, supports fresh repositories, reuses only the
  relevant Guided external-tracker mechanics, and does not introduce a generic connector-inventory
  subsystem.

The same review directly incorporated these resolved findings, which are not counted in the
current scorecard:

- **Critical — Architecture — prompt order was not executable.** The earlier draft inserted the
  profile fragment at current Step 3, after Steps 1–2 can already ask non-Git, source or ADR
  questions. Incorporated: Profile mode now asks Chat and Profile immediately after argument
  classification and entry-language bootstrap; every existing conditional setup gate follows, with
  explicit ordering tests.
- **Important — Maintainability — the language-policy ADR was outside scope.** Incorporated:
  `docs/adr/language-policy.md` now records the setup-only rebind as a durable exception and is part
  of validation.
- **Important — Error cases — external revalidation lacked a comparison basis.** Incorporated: the
  plan retains connection/context identity and every validity-affecting state property, compares
  them before write, and requires a stop or a fresh preview and confirmation on drift.
- **Important — Testability — external validation implied a live third-party dependency.**
  Incorporated: deterministic fake-connection fixtures cover CI and a configured test connection is
  only an optional host-level check.
- **Important — Scope — the requirement accidentally included Express and Guided.** Incorporated:
  only default and explicit Profile-mode runs promise Chat and Profile as their first two questions;
  the two explicit legacy modes retain their own contracts.
- **Important — Maintainability — a selected external context was not reproducible.** Incorporated:
  when tool identity alone is ambiguous, the selected stable workspace/team/project identity is
  proposed in `tracker.externalToolHint`, previewed, persisted only after confirmation, and proven to
  reselect the same connection/context during pre-write validation.
- **Security and data protection — no finding.** Connection discovery remains provider-neutral and
  read-only before confirmation; credentials and unrelated connector metadata are neither echoed
  nor persisted.

An earlier independent review on 2026-09-14 had already incorporated the following resolved
findings, also excluded from the current scorecard:

- **Critical — Architecture — external bootstrap was not executable.** The first draft tried to
  derive an external tool and context from an unspecified inventory even though the existing
  contract needs a concrete tool identifier and connection hint. The interim correction required
  recorded data; the later deep-review decision supersedes only that first-run restriction by
  reusing Guided's explicit external questions. The final design still never infers an inventory or
  copies Terminaro-specific values.
- **Important — Scope — `.gitignore` ordering was unrelated expansion.** The draft delayed the
  established Step 1 mutation merely to place it behind profile confirmation. Incorporated: the
  current profile-independent lifecycle stays intact; only invalid argument routing must precede it,
  and the confirmation criterion covers profile-dependent configuration writes.
- **Important — Error cases — a local base is not always available.** Incorporated: non-Git,
  detached-HEAD and unborn-branch states receive explicit preflight outcomes and never persist a
  commit SHA as a delivery base.
- **Important — Maintainability — shared chat-language cost was undercounted.** The draft remeasured
  only `setup`, although the eager fragment reaches nearly every speaking tool. Incorporated: the
  full build report determines every affected budget entry while preserving prior headroom and the
  ten-line ceiling.
- **Note — Scope — “planning” overstated the profile mapping.** The tracker setting routes
  issue-backed planning/tracking, while free-form `effective-flow plan` remains local. Incorporated
  into the profile names, verified context, acceptance criteria and documentation requirements.

## Test results

- `pnpm agent:check` passed for all 362 matched files.
- `pnpm test` passed: 914 tests, 897 passed, 17 skipped, 0 failed.
- `node build.mjs` passed and produced Claude, Codex, and portable targets. The setup core measures
  1722 lines against a 1723-line budget; every other reported core also remains within its ratchet.
- `pnpm test:distribution` passed its offline archive and delivery smoke checks.
- `git diff --check` passed. Focused profile and language contracts passed 469 tests before the
  repository-wide run.
- Fresh inspection of all three rendered setup targets confirmed strict mode routing, lazy loading,
  Chat then Profile ordering, all three mappings, external-only integration questions, the common
  confirmation, setup-only chat rebinding, and external pre-write revalidation.
- The change invalidated all five archived merge-gate behavioral-eval rounds because their loaded
  build identity includes the changed chat-language and merge-gate sources. Their 50 log/stamp files
  were removed rather than falsely re-stamped. The 17 eval assertions therefore skip with an
  explicit `NOTHING IS PROVEN` diagnostic until a separate fresh-agent 5-of-5 round is recorded;
  the three structural eval tests pass.

## Review findings

Independent review covered Critical, Important, and Note severities. No Critical finding was
reported. Both findings were corrected and independently confirmed closed:

- **F1 — Important — closed:** replaced stale shared-700 and old measurement claims in the
  developer guide with the current individual per-tool budgets and headrooms.
- **F2 — Note — closed:** changed the common `CLAUDE.md` import confirmation contract and its test
  from an obsolete two-path description to an explicit Profile, Express, and Guided invariant.

Final correction review found no new findings. Final full validation passed with the behavioral-eval
absence retained as the evidence gap described above.

## Open points

- No open points.

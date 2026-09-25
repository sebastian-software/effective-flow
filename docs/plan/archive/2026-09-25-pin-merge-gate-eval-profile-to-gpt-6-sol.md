# Pin the merge-gate eval profile to gpt-6-sol

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The merge-gate behavioural eval currently records its rounds with this profile: harness `codex-cli`,
model `gpt-5.6-sol`, reasoning effort `high`, reported version `codex-cli 0.154.0`. It should switch
to model `gpt-6-sol` with reasoning effort `medium`. The Codex CLI model catalog includes that model
from codex-cli 0.156.1 onwards; the latest version at planning time is 0.157.0. The recording host
therefore has to update its CLI before the next round.

Today the profile is not declared anywhere in the repository. It exists only as free-string flags on
`pnpm eval merge-gate prepare` and in the 30 archived `run-*.metadata.json` files. `verify`, the
release gate and the tests all ignore it. A switch therefore cannot be expressed, reviewed or
enforced. This change pins the expected profile in the suite configuration, and `prepare` and
`publish` enforce it.

**No round is re-recorded as part of this change.** The eval round is recorded only for a release.
`suite.config.mjs` is part of the hashed instrument, so editing it deliberately makes the archive
stale. Ordinary pull requests report that in `report` mode and are not blocked. The release pull
request's `--mode strict` check then requires the next round, and that round is recorded with the new
profile under the existing release procedure.

Recommended workflow: Feature. This change adds new validation behavior to the eval tooling: new
rejections at `prepare` and `publish`, plus a new required suite field. It is neither a
restructuring nor a documentation-only change.

Planned at `ef68741` on 2026-09-25. The in-scope paths `evals/` and `test/` were clean. The only
uncommitted files were unrelated plans and `docs/concept/`.

## Architecture decisions

- **The pin lives in `evals/merge-gate/suite.config.mjs` as a required suite field
  `expectedProfile`.** It is either `null` (deliberately unpinned) or a frozen object with a
  non-empty subset of the profile keys. For merge-gate the object is `harness: 'codex-cli'`,
  `model: 'gpt-6-sol'`, `reasoningEffort: 'medium'`. The field is required rather than optional
  because the loader's own rule (`suite-loader.mjs:9-15`, as with `auxiliaryEvidence: null`)
  demands that a forgotten field and a deliberate "none" stay distinguishable (user decision).
- **`reportedVersion` and `toolPolicy` are not pinned** (user decision). The CLI version changes
  often, and pinning it would force a three-hour round for every CLI update. The minimum CLI version
  is documented, not enforced. The tool policy is an operational detail of the recording host.
- **The profile rules move into a small, unhashed module `evals/_scaffold/profile.mjs`.** It holds
  `PROFILE_KEYS`, `normalizeProfile`, the sensitive-value check, and a new pin comparison.
  `round-core.mjs` and `suite-loader.mjs` both import it. This way `suite-loader.mjs` does not have
  to import `round-core.mjs`, which pulls in `scaffold.mjs`, `build-identity.mjs` and has
  module-load side effects. `profile.mjs` stays out of `instrumentFiles`, like `round-core.mjs`
  today: no run reads it.
- **Enforcement happens where a round is created and where it is archived.**
  - `createRound` rejects a mismatch after `selectScenarios` and `normalizeProfile`, and before the
    round root is created or anything is built. An omitted flag normalizes to `"unknown"` and is
    therefore a mismatch too.
  - At publication, a single profile assertion sits in the existing metadata loop of
    `ensureCanonicalGeneration` (`round-core.mjs:1030-1038`). It covers all 30 slots of the
    candidate generation, both the newly published and the carried-forward ones. It runs after
    `recoverPublicationLocked`, under the publication lock (user decision). No separate check runs
    before the lock. The existing catch path already removes the candidate and the backup when
    `ensureCanonicalGeneration` throws before the journal is written.
- **The primary guard for "full corpus after a pin change" is the instrument binding, not the profile
  assertion.** Every pin edit changes the hashed `suite.config.mjs`, so every carried-forward stamp
  mismatches the current identity, and `ensureCanonicalGeneration`'s existing identity check
  (`evaluate.mjs:233-238`) already refuses a partial publication. The profile assertion is defense
  in depth. It catches hand-edited metadata and future changes to the hash membership.
- **`verify` does not change.** Any edit to the pin changes a hashed instrument file, so the stamp
  digest already marks the whole archive as stale. A second, profile-based staleness signal would
  only duplicate that.
- **The profile is an operator attestation.** Nothing verifies that the host really ran the pinned
  model; the pin enforces what gets declared and archived, nothing more.
- **Out of scope:** the agent model pins in `src/agents/*.md` (`codex.model: gpt-5.6-sol`), the
  Codex effort catalog in `build-lib.mjs:221`, and the Fast-profile mapping in `build.mjs`. They
  configure shipped Codex workers, not the eval recording, and lie outside the eval's hashed load
  set. After this change the eval model and the shipped native Codex worker model deliberately
  differ. The README says so in one sentence.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/_scaffold/profile.mjs` (new)   | `PROFILE_KEYS`, `normalizeProfile` (moved unchanged from `round-core.mjs:45` and `:313-333`), plus a pin validator and a pin comparison that names every mismatching key with its expected and actual value.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `evals/_scaffold/round-core.mjs`      | Import from `profile.mjs` instead of defining the rules locally. Call the pin comparison in `createRound` and in the metadata loop of `ensureCanonicalGeneration`. The pin is always read from the `suite` argument, never from a module import.                                                                                                                                                                                                                                                                                                                                                               |
| `evals/_scaffold/suite-loader.mjs`    | Add `expectedProfile` to `REQUIRED_FIELDS`. It accepts `null` or a valid pin: a plain object; keys a non-empty subset of `PROFILE_KEYS`; each value a non-empty string equal to its trimmed form, not `"unknown"`, and passing the sensitive-value rule.                                                                                                                                                                                                                                                                                                                                                       |
| `evals/merge-gate/suite.config.mjs`   | Add the frozen `expectedProfile` with `codex-cli` / `gpt-6-sol` / `medium`. Add a comment explaining why version and tool policy are unpinned and that editing the pin deliberately stales the archive.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `evals/eval.mjs`                      | Usage text around lines 55–56: a suite may pin profile values; `prepare` rejects deviations, including omitted pinned flags. No flag changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `evals/prepare.mjs`                   | No code change. The README records that the deprecated preparer always fails for a pinned suite, because it forwards no profile flags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `evals/merge-gate/README.md`          | "Running a round" (around lines 82–116): name the pinned values and the minimum codex-cli version 0.156.1; state that `prepare` rejects a mismatch and that the first round after a pin change must cover the full corpus (enforced by the instrument digest); fix the "Omitted profile values are recorded explicitly as `unknown`" sentence for pinned keys. "Launching sessions" (around lines 139–157): the CLI upgrade as a host prerequisite. Around line 378: add a note on the deprecated `prepare:eval`. Add one sentence saying the eval model and the shipped native Codex worker model may differ. |
| `test/merge-gate-eval-round.test.mjs` | Fixture and test changes; see "Test adjustments" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Implementation details

### Approach

1. Create `evals/_scaffold/profile.mjs` and move `PROFILE_KEYS` and `normalizeProfile` into it
   without changing their behavior. Re-point `round-core.mjs` at it. `pnpm test` must stay green
   after this step alone.
2. Add the pin validator and the pin comparison to `profile.mjs`.
3. Add `expectedProfile` to `REQUIRED_FIELDS` in `suite-loader.mjs`, and add the field to
   `suite.config.mjs`.
4. Wire the comparison into `createRound`, after `selectScenarios` and `normalizeProfile` and before
   `mkdirSync` of the round root.
5. Wire the comparison into the metadata loop of `ensureCanonicalGeneration`. It checks the
   top-level `profile` of every `run-*.metadata.json` it already reads. `sealAttempt` (`:657`) and
   `safeHostReceipt` (`:577`) already guarantee that it equals `hostAttestation.profile`.
6. Adjust the tests (next subsection).
7. Update `evals/eval.mjs` usage and `evals/merge-gate/README.md`.
8. Run the full CI sequence (see Validation plan). `pnpm eval merge-gate verify` is expected to
   report the archive as stale because `suite.config.mjs` changed. Do not re-record, re-stamp or
   waive.

Host prerequisite for the next release round. This is not part of this pull request and is done on
the recording machine: `brew upgrade --cask codex` (or the npm equivalent) to codex-cli 0.156.1 or
newer. Then record the round with `--harness codex-cli --model gpt-6-sol --reasoning-effort medium`
and the actual `--reported-version`.

### Test adjustments

- `PROFILE` fixture (`test/merge-gate-eval-round.test.mjs:45-51`): take `harness`, `model` and
  `reasoningEffort` from `suite.expectedProfile`, and keep `reportedVersion` and `toolPolicy`
  synthetic. `PROFILE` remains the attested receipt profile for every sealed test slot.
- `copyRestampedResults` (`:156-190`) copies the real `gpt-5.6-sol` archive and rewrites only the
  stamps. It must also rewrite `profile` and `hostAttestation.profile` to `PROFILE`. Otherwise every
  partial publication test fails at the new assertion. That affects the in-process publications
  around `:1129`/`:1135`, the child publishers `:1184–1353`, and `:1525`, `:1636`, `:1715`, `:1766`.
- `unknown profiles stay explicit…` (`:529`) calls `createRound(suite, { profile: {} })`. Run it
  against `{ ...suite, expectedProfile: null }` so it keeps testing the unpinned "unknown" path.
- Keep the existing test for the deprecated preparer (`:1566`) passing. The pin check sits after
  `selectScenarios`, so its failure mode is unchanged.

### Component structure

One new unhashed module, `evals/_scaffold/profile.mjs`; see Architecture decisions.

### State management

Not relevant beyond the round manifest, which already stores the normalized profile unchanged.
Retry and reprovision paths reuse `manifest.profile` (`:839`) and need no change.

### API integration

Not relevant: no model or forge API is called. The repository still launches no model.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- `prepare` without `--model` (value `"unknown"`): rejected. The message names `model` and its
  expected value.
- Matching pinned keys with any `reportedVersion`/`toolPolicy`: accepted.
- Surrounding whitespace in a flag value: `normalizeProfile` already trims it, and the comparison
  runs on the normalized value. A pin value with surrounding whitespace is rejected by
  `validateSuite`.
- Case differences (`GPT-6-SOL`): rejected. The comparison is exact, like the rest of the profile
  handling.
- A round prepared before the pin change and published after it: rejected by the existing
  instrument-drift check (`:1265`) and additionally by the profile assertion.
- A partial round (`--scenario X`) after the pin change while the other scenarios still carry
  `gpt-5.6-sol`: rejected, primarily by the existing identity check in `ensureCanonicalGeneration`
  and secondarily by the profile assertion. `results/` remains byte-identical.
- A suite with `expectedProfile: null`: `prepare` and `publish` behave exactly as today.
- A suite without the field: rejected by `validateSuite`.
- The deprecated `evals/prepare.mjs` forwards no profile flags, so it always fails for merge-gate.
  This is documented, not fixed.
- The archived `gpt-5.6-sol` round stays structurally valid. `pnpm test` stays green, because
  `test/merge-gate-eval.test.mjs` evaluates without `expectedBuildIdentity` (`:1240-1247`). Only
  `verify` reports the archive as stale.

## Acceptance criteria

- [ ] `evals/merge-gate/suite.config.mjs` declares `expectedProfile` with exactly
      `harness: codex-cli`, `model: gpt-6-sol` and `reasoningEffort: medium`, and no other keys.
- [ ] `validateSuite` rejects a missing `expectedProfile`. It also rejects a malformed one: an unknown
      key, an empty object, an empty or whitespace-padded value, `"unknown"`, or a sensitive-looking
      value. It accepts `null`.
- [ ] `pnpm eval merge-gate prepare` exits non-zero when `--harness`, `--model` or
      `--reasoning-effort` deviates or is omitted. It creates no round root under the sandbox base
      and names each mismatching key.
- [ ] `publishRound` rejects a generation in which any slot's archived profile deviates from the
      pin, even when every stamp matches the current identity. `results/` stays byte-identical, and
      no candidate, backup or journal remains.
- [ ] `evals/merge-gate/README.md` names the pinned profile, the minimum codex-cli version 0.156.1,
      the full-corpus requirement after a pin change, and the deprecated preparer's failure for
      pinned suites.
- [ ] `evals/merge-gate/results/` is unchanged by this pull request.
- [ ] Completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs` and
      `pnpm test:distribution` all exit 0. `pnpm eval merge-gate verify` (report mode) exits 0 and
      reports all six scenarios as stale, with the instrument part as the only drift:
      one file, `~ evals/merge-gate/suite.config.mjs`.

## Validation plan

- New tests in `test/merge-gate-eval-round.test.mjs`:
  - `createRound` rejects each pinned key both when it deviates and when it is omitted, and leaves
    no round root behind.
  - `createRound` accepts the pinned values with arbitrary `reportedVersion`/`toolPolicy`.
  - `publishRound` rejects a partial round when one carried-forward scenario's profile was
    hand-edited inside `copyRestampedResults` output. Its stamps then still match the current
    identity, so only the new assertion can reject it. `results/` stays byte-identical.
  - `publishRound` accepts a round with the pinned profile over a correctly rewritten carried-forward
    archive.
  - `validateSuite` cases: a missing field is rejected, `null` is accepted, and each malformed pin
    form is rejected.
- Mutation checks:
  - Temporarily remove the pin comparison from `createRound` and confirm the rejection test fails.
  - Temporarily remove the pin comparison from `ensureCanonicalGeneration` and confirm the
    hand-edited-profile publish test fails.
  - In both cases confirm that the test fails for the intended reason and that another guard did not
    absorb the mutation.
- CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `pnpm eval merge-gate verify`: all six scenarios stale, and the instrument drift lists only
  `evals/merge-gate/suite.config.mjs`.

## Assumptions and open points

- Assumption (from the Codex CLI 0.156.1 release notes, not tested end to end): `gpt-6-sol` is
  available from codex-cli 0.156.1 onwards, and `medium` is a valid `model_reasoning_effort` for it.
  The first release round verifies this.
- Assumption: as the README already requires, the pull request that records the next round states
  the profile in its body. This plan does not change that.
- Deliberately excluded:
  - updating the codex-cli installation (a host action, not a repository change);
  - re-recording the round (it belongs to the release);
  - the agent model pins and the Codex effort catalog;
  - the outdated README sentence "Codex execution is unexercised" (around line 558), which is an
    unrelated documentation correction.
- Drift check before implementing: if `round-core.mjs` (`createRound`, `ensureCanonicalGeneration`,
  `publishRound`), `suite-loader.mjs` or `test/merge-gate-eval-round.test.mjs` changed since
  `ef68741`, re-read the cited line ranges before wiring the checks.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Architecture – Note:** Profile-based staleness in `verify` was considered and rejected, because
  every pin edit already changes the hashed instrument. Revisit it only if the pin ever moves out of
  a hashed file.
- **Scope – Note:** Pinning `reportedVersion` was deliberately left out (user decision). The minimum
  CLI version is only documented.
- **Testability – Important (incorporated):** The fixture `PROFILE` drives the real suite with a
  synthetic model. The fixture now derives the pinned keys from `suite.expectedProfile`.
- **Error cases – Important (incorporated):** A partial round after a pin change could leave a
  mixed-profile archive. This is now covered by the instrument binding plus a profile assertion.

### Deep review 2026-09-25

- **Testability – Critical (incorporated):** `copyRestampedResults` carries the real `gpt-5.6-sol`
  profiles into every partial-publication test. With the new assertion, those tests would all fail.
  `copyRestampedResults` now rewrites `profile` and `hostAttestation.profile` to the fixture profile.
- **Testability – Critical (incorporated):** `unknown profiles stay explicit…` (`:529`) runs
  `createRound` with an empty profile against the real suite. It now runs against a suite copy with
  `expectedProfile: null`, and the pin is always read from the `suite` argument.
- **Architecture – Important (decided):** An optional field contradicted the loader's
  "omission ≠ none" rule. `expectedProfile` is now a required field that accepts `null` or a pin.
- **Architecture/Maintainability – Important (decided):** The separate carried-forward check before
  and inside the lock was redundant with the instrument binding. It was also racy before
  `recoverPublicationLocked`, and its stated debris rationale was wrong. It was replaced by a single
  assertion in `ensureCanonicalGeneration`'s existing metadata loop, which covers all 30 slots.
- **Maintainability – Important (incorporated):** The plan did not say where the profile rules live.
  They now go into an unhashed `evals/_scaffold/profile.mjs`, which avoids a loader dependency on
  `round-core.mjs`. Pin values must also equal their trimmed form.
- **Testability – Important (incorporated):** As originally written, the publish test would have
  been absorbed by the identity check. It now hand-edits one profile in otherwise re-stamped results,
  and the mutation check covers both enforcement points.
- **Error cases – Note (incorporated):** The assertion reads every slot's metadata, not "one of"
  them, and uses the top-level `profile`.
- **Scope – Note (incorporated):** The deprecated `evals/prepare.mjs` now always fails for pinned
  suites; this is documented in the README. `eval.mjs` usage and the README "unknown" sentence are
  updated.
- **Note (verified, no change):** Retry, reprovision and seal paths reuse `manifest.profile`.
  `scaffold.mjs` and `eval-fixture-fidelity.test.mjs` are unaffected. Report-mode `verify` exits 0
  on stale. The acceptance criterion was sharpened to the exact drift line.

## Implementation notes

Implemented by `effective-flow build` on 2026-09-25 against `c8c6016` (release 1.65.0). The only
change since the planning base `ef68741` was that release commit, which does not touch `evals/` or
`test/`.

- As planned: `evals/_scaffold/profile.mjs` now holds `PROFILE_KEYS`, `normalizeProfile`,
  `sameKeys`, `isValidProfilePin`, `profilePinMismatches` and `assertProfileMatchesPin`.
  `round-core.mjs` imports them and re-exports `normalizeProfile`, so its public surface stays
  unchanged. `suite-loader.mjs` requires `expectedProfile`. `suite.config.mjs` pins `codex-cli` /
  `gpt-6-sol` / `medium`. `createRound` and `ensureCanonicalGeneration` enforce the pin.
- The README additionally documents the pin under "Publish one complete generation".
- Deviation from the completion condition's wording: `pnpm eval merge-gate verify` reports two drift
  parts, not one. Besides the intended instrument drift (`~ evals/merge-gate/suite.config.mjs`), it
  also shows `skill: ~ SKILL.md`. That is the version stamp of the 1.65.0 release. On an unchanged
  tree it is waived as "version-stamp", but the waiver applies only while the instrument part is
  unchanged. This is pre-existing behaviour, and the next release round clears both.

## Test results

- `pnpm agent:check`: exit 0.
- `pnpm test`: 1353 tests, 1352 pass, 0 fail, 1 skipped (the existing freshness placeholder).
- `node build.mjs`: exit 0.
- `pnpm test:distribution`: exit 0.
- `pnpm eval merge-gate verify` (report mode): exit 0, all six scenarios stale as described above.
- `evals/merge-gate/results/`: unchanged.
- `prepare` with `--model gpt-5.6-sol` exits 1 and names `model`. Without flags it names all three
  pinned keys. In both cases it creates no round root.
- Mutation checks:
  - Removing the pin check from `createRound` fails the rejection test.
  - Removing it from `ensureCanonicalGeneration` fails the hand-edited-profile publish test. The
    identity check does not absorb that mutation.

## Review findings

**Date:** 2026-09-25
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-code-validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     3 |
| Open / Not implemented |     0 |

One further note was closed without change: the `normalizeProfile` re-export from `round-core.mjs`
is kept deliberately, to keep that module's public surface stable.

## Open points

- No open points.

# Drive the default installer through DALO

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

`install-skill.sh` currently installs the latest version by downloading the release archive with
`gh release download`, extracting it, and copying the two native targets plus fifteen native agent
sidecars into the harness directories. The maintainer manages skills with DALO, so the default mode
should install and update Effective Flow through DALO instead of through download-and-copy.

The change is a Feature rather than a Refactoring because the observable behavior of the default
invocation changes deliberately: it installs the portable build through a skill manager instead of
the native build through a file copy. The work is tooling-only (shell scripts, tests, developer
documentation) and touches no product code, so the tooling-only implementer applies.

### Decisions taken during planning

| Question              | Decision                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Native agent sidecars | Given up. DALO manages skills only, so a DALO installation is necessarily the portable build with bundled worker contracts. |
| Script shape          | `install-skill.sh` stays and becomes a thin, idempotent DALO driver in its default mode.                                    |
| Audit approval        | The script never accepts risk itself. It reports the exact `dalo audit … --accept-risk` command and exits non-zero.         |
| Source kind           | Catalog source, matching the documented consumer path and the existing `pnpm test:managers` smoke.                          |
| Leftovers             | A one-time migration removes the native artifacts the previous installer owned.                                             |

## Architecture decisions

- **Only the default mode moves to DALO.** `install-skill.sh local` and `local-link.sh` keep the
  native build-and-deploy path unchanged. `build.mjs` still produces `dist/claude/` and
  `dist/codex/`, CI still verifies both, and only the native path can install the per-role model and
  effort profiles that native agents carry. Development must keep exercising native output.
- **The DALO driver lives in `local-common.sh`.** That file already hosts the release-installation
  helpers this plan removes, so the driver replaces them in place. A separate `dalo-common.sh` would
  additionally require extending `DEVELOPER_ONLY_SCRIPTS` in `build-lib.mjs:2318` and the shellcheck
  file list in `.github/workflows/ci.yml:51` without a matching benefit. Update the file's header
  comment, which currently describes only copy-versus-symlink deployment.
- **Catalog source, not team source.** `dalo source add-catalog` plus `dalo source select` mirrors
  `docs/user-guide/getting-started.md:16-22` and the command sequence already asserted by
  `runDaloSmoke` in `scripts/distribution-smoke.mjs:395-479`. A catalog source is pinned, so a new
  release never moves under the user without an explicit advance.
- **The script never accepts audit risk.** Verified against DALO 0.9.2: the portable skill produces
  21 `static high [persistence]` findings and its audit result is `blocked (max high)`.
  `dalo approve source effective-flow` succeeds but does not clear those findings — the following
  `dalo sync` still fails. Acceptance is scoped to the exact content hash and re-blocks on every
  release, for a pinned catalog source and a tracking team source alike. Automating the acceptance
  would therefore bypass the audit gate on every release and would additionally couple the script to
  DALO's error-message format, so the script stops and hands the command to the operator.
- **Verify with `dalo sync --check`, never bare `dalo sync`.** Verified: when an unmanaged
  `effective-flow` directory occupies a target slot, bare `sync` reports `blocked conflict` on one
  line and still exits `0`, leaving the stale copy installed. `sync --check` exits non-zero on the
  same state. Bare `sync` would let the migration fail silently and leave the operator on a stale
  native installation.
- **Migration removes only provably owned artifacts.** Agents are removed through the existing
  manifest-scoped `remove_recorded_agents`, which already ignores path-traversal entries. The skill
  slot is reclaimed only when it is a real directory or a symlink into this checkout's `dist/` — the
  two shapes the copy and link installers produce. A symlink pointing anywhere else, including a
  DALO-managed link into the store, is left untouched. Anything the migration declines to remove is
  caught afterwards by `sync --check` rather than being force-removed.
- **Migration is condition-based, not marker-based.** It acts only when leftovers exist, which makes
  it naturally idempotent and removes the need for a state file.
- **Migration runs unprompted but reports every removal.** The script stays non-interactive, because
  the test suite drives it through `/bin/sh` and a prompt would block every automated invocation.
  Gating the migration behind its own argument was rejected: it would add a fifth accepted
  invocation and break the frozen four-invocation contract in
  `docs/developer-guide/release-and-installation.md:315-329` that `test/install-skill.test.mjs`
  pins. The removal is safe to leave unprompted because it is manifest-scoped and fully reproducible
  through `./install-skill.sh local`.
- **The driver bootstraps DALO.** It runs `dalo init` and links both harness targets; both commands
  are idempotent (verified). Linking records a directory as a materialization target and does not
  adopt the unmanaged skills already in it, so the effect on unrelated skills is limited to DALO
  reporting them as unmanaged. This keeps a fresh machine a single command away from an
  installation.
- **`local` mode reports rather than refuses.** `install_skill` does `rm -rf` on the target slot, so
  `./install-skill.sh local` after a DALO installation replaces the DALO-managed symlink with a
  native copy and leaves DALO blocked on a conflict. Refusing would cost the one-command native
  development install, so the mode proceeds and `effective_flow_report` states that the slot is now
  installer-owned and that `dalo sync --check` will report a conflict until the default mode runs
  again.
- **The catalog URL stays overridable.** Keep the existing `EFFECTIVE_FLOW_REPO` override and its
  legacy `FIRMO_REPO` alias, now resolving to a clone URL rather than a `gh` repo slug. The
  installer smoke needs to point the driver at a local Git fixture, exactly as `runDaloSmoke` does
  today; without an override the default mode would be untestable offline.
- **The removed release path keeps no replacement.** `distribution-smoke.mjs archive` in
  `.github/workflows/release.yml:96-104` continues to verify the published archive's layout, and
  `test/local-common.test.mjs` continues to cover native deployment from a fixture `dist/`. Only the
  archive-to-deployment glue loses coverage; see the plan review.

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install-skill.sh`                                 | Default mode calls the DALO driver instead of `effective_flow_install_latest_release`; usage string and argument dispatch stay unchanged.                                                                                                                                                                                                                                                    |
| `local-common.sh`                                  | Remove `effective_flow_install_latest_release`, `effective_flow_release_repo`; add the DALO driver, the catalog-URL resolver, and the one-time migration. Keep `effective_flow_require_command` for the `dalo` dependency check. Update the header comment.                                                                                                                                  |
| `scripts/distribution-smoke.mjs`                   | Remove `runReleaseInstallerSmoke` and its `gh` shim; drop its call from `offlineSmoke`.                                                                                                                                                                                                                                                                                                      |
| `test/install-skill.test.mjs`                      | Rename the stubbed release entry point to the DALO driver; dispatch, help, and rejection assertions stay.                                                                                                                                                                                                                                                                                    |
| `test/install-dalo.test.mjs` (new)                 | Unit-test the driver against a stubbed `dalo` on `PATH`, inside the `isolatedEnvironment` pattern of `test/local-common.test.mjs:29-38`: command sequence, idempotency gating, block-and-stop, migration. Unlike `test/install-skill.test.mjs`, this sources the real `local-common.sh`, so it must isolate `HOME`, `CLAUDE_HOME`, and `CODEX_HOME` before the migration can touch anything. |
| `test/local-common.test.mjs`                       | Add migration coverage; no existing assertion depends on the removed release helpers.                                                                                                                                                                                                                                                                                                        |
| `docs/developer-guide/release-and-installation.md` | Rewrite "Verify a published release archive" (340-347) into the DALO default mode; keep the "Installer syntax" contract (315-329).                                                                                                                                                                                                                                                           |
| `docs/developer-guide/architecture.md`             | Update the repo-tree comment (286) and the consumer table note (236-240).                                                                                                                                                                                                                                                                                                                    |
| `docs/developer-guide/build-system.md`             | Replace "direct release installer" in the smoke-suite description (22-27).                                                                                                                                                                                                                                                                                                                   |
| `AGENTS.md`                                        | Update the command inventory (21) and the distribution statement (44), which currently claims the installers use only the two native targets.                                                                                                                                                                                                                                                |

## Implementation details

### Approach

1. Replace the release helpers in `local-common.sh` with a catalog-URL resolver that reads
   `EFFECTIVE_FLOW_REPO`, then `FIRMO_REPO`, then defaults to
   `https://github.com/sebastian-software/effective-flow.git`. Accept a full clone URL or a
   `owner/name` slug, and expand a slug to the GitHub HTTPS form.
2. Add the migration function. When `$CLAUDE_AGENT_MANIFEST` or `$CODEX_AGENT_MANIFEST` exists,
   remove the recorded agents through `remove_recorded_agents` and then the manifest itself. When a
   target skill slot is a real directory or a symlink into this checkout's `dist/`, remove it.
   Report each removal on its own line, and report nothing when there is nothing to migrate.
3. Add the driver. Check `dalo` is present through `effective_flow_require_command`, then run, in
   order: `dalo init`; `dalo target link claude`; `dalo target link codex`; `dalo source add-catalog
effective-flow <url>` only when `dalo --json source list` has no `effective-flow` entry;
   report each removal the migration performed;
   `dalo source select effective-flow effective-flow`; for an already-registered source
   `dalo source refresh effective-flow --advance`; finally `dalo sync --check`.
4. Handle the audit block. `source select` on a first install and `source refresh --advance` on an
   update both fail with a message containing the staged audit path. Capture that output, print the
   ready-to-run `dalo audit '<path>' --accept-risk "<reason>"` line together with a one-line
   explanation, and exit non-zero. Do not run the acceptance.
5. Run the migration before the first `dalo sync --check` so the slot is free when DALO claims it.
6. Report the outcome: which targets DALO linked, what the migration removed, and that the
   installation is the portable build with bundled worker contracts rather than native agents.
7. Point `install-skill.sh`'s no-argument branch at the driver.
8. Remove `runReleaseInstallerSmoke` from `scripts/distribution-smoke.mjs` and its call in the
   `offline` mode.
9. Update the documentation and `AGENTS.md` statements listed above.

### Command contract

The verified DALO 0.9.2 behavior the driver depends on:

| Command                              | Rerun behavior                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `dalo init`                          | idempotent, exit 0                                                            |
| `dalo target link <id>`              | idempotent, exit 0                                                            |
| `dalo source add-catalog <id> <url>` | **not** idempotent: exit 1, ``error: source `effective-flow` already exists`` |
| `dalo source select <id> <slot>`     | idempotent, exit 0; runs the audit and reports a block **without failing**    |
| `dalo source refresh <id> --advance` | exit 1 with the staged audit path while blocked; exit 0 once accepted         |
| `dalo sync`                          | exit 0 even when a slot is blocked by an unmanaged entry                      |
| `dalo sync --check`                  | exit non-zero on any state requiring review                                   |

`dalo --json source list` returns `{"sources":[{"id":…,"kind":…,"url":…,"update_policy":…,"selection":[…]}]}`,
which is enough to gate the `add-catalog` call on the `id` field.

### Edge cases

- **`dalo` not installed** — fail before any mutation, naming the DALO installation page, exactly as
  `effective_flow_require_command` already does for `gh`.
- **A registered `effective-flow` source pointing at a different URL** — do not silently re-point it.
  Report the configured URL against the requested one and exit non-zero.
- **Neither harness directory present** — `dalo target link` creates the target. When both links
  fail, stop rather than syncing into nothing.
- **Audit block on a first install versus an update** — the staged path differs per commit, so it
  must be read from the failing command's output rather than reconstructed.
- **A blocked slot that the migration deliberately did not remove** — `sync --check` fails; report
  the blocked path and let the operator decide.
- **Running `install-skill.sh local` after a DALO install** — the mode proceeds and reports; see the
  architecture decision. Removing the DALO-managed symlink leaves DALO's recorded link dangling,
  which the next default-mode run repairs by reclaiming the slot.
- **Private repository** — DALO clones with the local Git client, so the operator must already be
  authorized. The failure surfaces as a clone error from `source add-catalog`; pass it through
  unchanged rather than reinterpreting it.

## Acceptance criteria

- [ ] `./install-skill.sh` with no arguments performs no download and no `cp -R`, and drives DALO
      through the command sequence in "Approach" step 3.
- [ ] `./install-skill.sh` is safely re-runnable: a second consecutive run on an unchanged,
      already-approved installation exits 0 and performs no `dalo source add-catalog` call.
- [ ] When DALO's audit blocks the skill, `./install-skill.sh` exits non-zero, prints a
      `dalo audit '<staged-path>' --accept-risk` line with the path taken from DALO's own output, and
      runs no acceptance itself.
- [ ] After the migration, `~/.claude/agents/effective-flow-*.md`, `~/.codex/agents/effective-flow-*.toml`,
      and both `.effective-flow-agents.manifest` files are gone, while agents not recorded in a
      manifest and unrelated neighboring skills are untouched.
- [ ] `./install-skill.sh local` and `./local-link.sh` still deploy both native targets and both
      native agent sets; every assertion in `test/local-common.test.mjs` passes unchanged.
- [ ] `./install-skill.sh`, `./install-skill.sh local`, `-h`, and `--help` remain the only accepted
      invocations, and every other argument vector is still rejected before deployment helpers load;
      `test/install-skill.test.mjs` passes.
- [ ] `test/install-dalo.test.mjs` covers, against a stubbed `dalo`, the first-install sequence, the
      rerun without `add-catalog`, the update path through `source refresh --advance`, the
      block-and-stop exit, and the URL-mismatch refusal.
- [ ] `shellcheck --severity=error install-skill.sh local-common.sh local-link.sh` reports nothing.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass, and
      `pnpm test:distribution` no longer invokes `install-skill.sh`.
- [ ] After a successful default-mode run, `~/.claude/skills/effective-flow/workers/` exists and no
      `~/.claude/agents/effective-flow-*.md` or `~/.codex/agents/effective-flow-*.toml` remains —
      the exact inverse of the invariant `scripts/distribution-smoke.mjs:379-381` asserts today.
- [ ] `EFFECTIVE_FLOW_REPO` and its legacy `FIRMO_REPO` alias redirect the catalog source, accepting
      both a clone URL and an `owner/name` slug, so the driver can be exercised against a local Git
      fixture without network access.
- [ ] `local-common.sh` contains no reference to `gh release download`, `effective_flow_release_repo`,
      or `effective_flow_install_latest_release`.
- [ ] `AGENTS.md:21` and `AGENTS.md:44` describe the DALO default mode, and no document under
      `docs/user-guide/` gains an executable `./install-skill.sh` command, so the
      `findProhibitedConsumerScriptCommands` build guard stays green.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution` — the
  order `AGENTS.md:26` prescribes after distribution-source edits.
- `shellcheck --severity=error install-skill.sh local-common.sh local-link.sh`, matching
  `.github/workflows/ci.yml:51`.
- `pnpm test:managers` to confirm the documented DALO consumer path still passes after the
  `distribution-smoke.mjs` edit.
- Manual end-to-end run against an isolated store and `HOME`, using `DALO_STORE`, `CLAUDE_CONFIG_DIR`,
  and `CODEX_HOME`, and a local Git fixture through `EFFECTIVE_FLOW_REPO`: first install, blocked
  audit, acceptance, second install, and a simulated new release. The fixture pattern is already
  established in `scripts/distribution-smoke.mjs:395-479`.
- Manual migration check on a real prior installation: confirm the fifteen agents per harness and
  both manifests are removed and that `dalo status` reports `effective-flow` as managed afterwards.

## Assumptions and open points

- DALO 0.9.2 is the reference version; every command behavior above was verified against it in an
  isolated store. A future DALO release could make source-level approval cover blocking findings,
  which would allow revisiting the block-and-stop decision.
- The maintainer accepts that the DALO-installed skill is the portable build: bundled
  `workers/effective-flow-<worker>.md` contracts delegated through the harness's general-purpose
  subagent mechanism, without per-role model and effort profiles, and with harness-neutral
  `effective-flow <tool>` notation in the Codex router.
- The catalog is pinned, so an update requires `source refresh --advance`. The driver performs that
  advance on every run of an already-registered source, which means the default mode always moves to
  the newest delivered commit. That matches the current release-mode semantics of "install the
  latest version".
- No release, CI, or delivery workflow calls `install-skill.sh`; the only caller is
  `distribution-smoke.mjs offline`. No workflow file therefore needs changing.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

A deep interactive review followed the initial pass. It raised three decision-requiring points —
the migration gate, the `local`-mode interaction, and the DALO bootstrap footprint — all of which
were decided and incorporated as architecture decisions. No blocking open points remain.

### Findings

- **Security, important — the audit gate must not become a rubber stamp.** The block-and-stop design
  keeps the human in the loop, but the printed reason string is the operator's declaration that the
  21 `persistence` findings are intended behavior. Keep the reason out of the script as a default
  value, so it is written consciously rather than copied by reflex. Incorporated as the fourth
  architecture decision and the third acceptance criterion.
- **Testability, important — installer coverage moves out of the required CI lane.** Today
  `runReleaseInstallerSmoke` exercises the default mode inside `pnpm test:distribution`, which the
  required `build` job runs. After the change the real DALO path is only exercised by
  `pnpm test:managers`, which `.github/workflows/ci.yml:53-60` deliberately marks not required. The
  new `test/install-dalo.test.mjs` with a stubbed `dalo` restores required-lane coverage of the
  command sequence and the failure branches; the unstubbed end-to-end behavior stays in the
  non-required manager lane, which is where the existing DALO smoke already lives. Incorporated as a
  new test file and its acceptance criterion.
- **Error cases, important — the migration is destructive and runs unprompted.** The first
  default-mode run deletes 15 agents per harness, both manifests, and the native skill directories,
  under a script whose previous behavior was to install. Decided: migrate and report every removal.
  A separate migrate argument would break the frozen four-invocation contract, and an interactive
  prompt would block the automated invocations the smoke and unit tests rely on. The risk is
  bounded because the removal is manifest-scoped and `./install-skill.sh local` reproduces
  everything it takes away. Incorporated as an architecture decision.
- **Architecture, important — the driver initializes a store that owns more than Effective Flow.**
  `dalo init` plus `dalo target link` places `~/.claude/skills` and `~/.agents/skills` under DALO
  management, which is a broader footprint than installing one skill. Decided: bootstrap anyway.
  Linking records a materialization target and does not adopt the unmanaged skills already present
  — they keep working and are merely reported as unmanaged — so the cost is limited and a fresh
  machine stays one command from an installation. Incorporated as an architecture decision.
- **Testability, important — `test/install-dalo.test.mjs` sources the real `local-common.sh`.**
  Unlike `test/install-skill.test.mjs`, which stubs the helper file entirely, the driver test must
  exercise real code that deletes files under `$HOME`. It must therefore adopt the
  `isolatedEnvironment` pattern of `test/local-common.test.mjs:29-38` before the migration can run.
  Incorporated into the affected-files entry.
- **Error cases, note — `local` mode silently reclaims a DALO-managed slot.** `install_skill` does
  `rm -rf` on the slot, so the native development install replaces DALO's symlink without warning
  and leaves DALO blocked. Decided: report rather than refuse, to preserve the one-command native
  development loop; the next default-mode run repairs the state. Incorporated as an architecture
  decision and an edge case.
- **Architecture, note — archive-to-deployment glue loses its only test.** `runReleaseInstallerSmoke`
  is the sole check that an extracted release archive deploys into byte-identical native trees. The
  archive's own layout stays covered by `distribution-smoke.mjs archive` on the release workflow, and
  native deployment from a `dist/` fixture stays covered by `test/local-common.test.mjs`, so the
  residual gap is the extraction step alone. Deliberately accepted rather than preserved through a
  second installer mode, because keeping the download path was explicitly rejected.
- **Error cases, note — `--advance` on every run makes the pin advisory.** A pinned catalog source
  normally means the operator chooses when to move. Advancing unconditionally restores
  "install the latest", which is the script's purpose, but it means the pin protects only against
  changes that arrive without running the installer. Documented in the assumptions.
- **Scope, note — `install-skill.sh local` and `local-link.sh` stay native and are not migrated.**
  A developer alternating between the native local install and the DALO default mode will make each
  reclaim the slot from the other. The report line added for `effective_flow_report` makes that
  visible instead of surprising; a deeper reconciliation is out of scope for this change.
- **Maintainability, note — the driver depends on DALO's human-readable error output** to extract the
  staged audit path. `--json` is available on these commands and should be preferred if it exposes
  the staged path as a field; otherwise the text extraction needs a comment naming the DALO version
  it was verified against, so a future upgrade has a place to check.

## Implementation notes

The driver lives in `local-common.sh` as planned. New functions: `effective_flow_catalog_url`,
`effective_flow_migrate_recorded_agents`, `effective_flow_migrate_skill_slot`,
`effective_flow_migrate_native_install`, `effective_flow_dalo_source_entry`,
`effective_flow_dalo_source_url`, `effective_flow_dalo_guarded`, `effective_flow_dalo_report`,
`effective_flow_install_through_dalo`. Removed: `effective_flow_release_repo`,
`effective_flow_install_latest_release`. `effective_flow_require_command` was kept and gained an
optional remediation argument.

Two deviations from the plan, both deliberate:

- **Migration coverage location.** The affected-files table assigned migration tests to
  `test/local-common.test.mjs`; they landed in the new `test/install-dalo.test.mjs` instead, next to
  the driver tests that share its stub harness. Coverage is complete either way, so the tests were
  not moved.
- **Migration ordering.** The migration runs after the audit gate rather than before it. A blocked
  audit therefore leaves the existing native installation intact instead of removing it and then
  failing. This strengthens the plan's intent and was kept.

  **Correction (2026-08-10).** That safety claim did not hold as shipped, and the table row above is
  the reason. `dalo source select` reports a block and still exits 0, so gating on its exit status
  let an unapproved run walk past the audit, migrate the native install away, and only then fail at
  `dalo sync --check` — leaving the harness with nothing installed. Observed on a real machine
  running 1.57.0. The behaviour row was inferred from the command's output without ever checking its
  exit code, and the stub-driven test encoded the same inference, so the suite confirmed the mistake
  instead of catching it. The driver now gates the migration on `dalo --json status` reporting the
  skill as resolvable, which is a state rather than an exit code and separates a pending approval
  from the unmanaged slot the migration itself is about to clear.

## Test results

`test/install-dalo.test.mjs` (new, 17 tests) covers the first-install command sequence, the rerun
that skips `add-catalog` and advances the pin, the URL-mismatch refusal, the blocked audit — where
it asserts that no `audit` and no `approve` invocation is ever recorded — the `sync --check`
failure, both target-link failure branches, the `dalo --json source list` failure, catalog-URL
resolution, and every migration case including the path-traversal defence and the store-symlink
survival.

Full sequence on the delivery branch: `pnpm agent:check` (282 files) pass, `pnpm test` 596/596 pass,
`node build.mjs` exit 0 including the consumer-script guard, `pnpm test:distribution` exit 0,
`shellcheck --severity=error` exit 0 on all three scripts. `pnpm test:managers` was not run: it
downloads a DALO release over the network and is deliberately not a required check.

The acceptance criterion covering a live default-mode run — `workers/` present and no native agents
remaining — is verified by the stubbed command sequence and by the migration tests in an isolated
`HOME`, not against a real installation. Running it for real migrates the operator's own machine, so
it was left to the operator.

## Review findings

**Date:** 2026-08-09
**Reviewer:** effective-flow-code-validator (tooling bucket)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     4 |
| Open / Not implemented |     2 |

- **F1 — stale consumer table in `architecture.md`** (Important, Low) — fixed: the table credited the
  native targets to "release-verification utilities" after the release installer was removed; it now
  names `./install-skill.sh local` and `./local-link.sh`.
- **F2 — `dalo --json source list` failure was swallowed** (Important, Low) — fixed: the listing was
  piped straight into `grep`, so the pipeline reported only `sed`'s status and a broken store was
  indistinguishable from an unregistered source, surfacing later as a misattributed "already exists".
  The listing now runs on its own and the call site uses an explicit `|| exit 1`.
- **F3 — duplicated missing-`dalo` message** (Note, Low) — fixed via the optional remediation
  argument on `effective_flow_require_command`.
- **F5 — untested target-link failure branch** (Note, Low) — fixed: both-fail and single-fail cases
  added.
- **F4 — migration tests placed in a different file than planned** (Note, Low) — not implemented; see
  "Implementation notes". Coverage is complete and the new file is the better home.
- **F6 — leading space in the linked-targets report line** (Note, Low) — not implemented; the
  reviewer assessed the rendered output as correct and the finding as benign.

No critical findings. The two unimplemented notes are accepted deviations, not defects, so no
external review report was written.

## Open points

- No open points.

# Release and installation

This document describes how Effective Flow is versioned, published, and distributed. Canonical
versioning rules are in [`AGENTS.md`](../../AGENTS.md), section "Versioning"; the concrete
mechanisms (release-please, manager delivery, maintainer scripts, version stamp) follow here.

## Versioning with release-please

Release versioning is handled by [release-please](https://github.com/googleapis/release-please).
The single source of truth for the currently published version is
`.release-please-manifest.json` (field `"."`); versions are **not** bumped by hand in feature or
fix commits. Conventional-commit messages drive the next release PR, changelog entries, tags,
GitHub releases, and the upload of the release archive.

release-please authenticates with a short-lived installation token of the
`ssoft-generic-release-bot` App rather than the default `GITHUB_TOKEN`, minted by the
`Create release token` step from the `RELEASE_APP_CLIENT_ID` repository variable and the
`RELEASE_APP_PRIVATE_KEY` secret. That is deliberate and must not be simplified back to the
default: the action defaults its `token` input to `${{ github.token }}`, and GitHub restricts what
events raised by the default token may start, as a guard against automation loops. With the
default, the release pull request is authored by `github-actions[bot]` and its CI run parks in
`action_required` forever, so the release commit is never validated before it is merged
(issue #279). Contract assertions in `test/workflow-contracts.test.mjs` keep the explicit token,
its minting step, and their order in place.

Release pull requests and the release commits they carry are therefore attributed to
`ssoft-generic-release-bot[bot]`. The same App already authors the release pull requests of
`sebastian-software/terminaro`, so this is the organization's established release identity rather
than a local invention.

The token expires after an hour and belongs to no person, which is the point: nothing on the
release path needs rotating, and no account's departure can break a release. The token is scoped
down further than the installation itself, to this repository with `contents: write` and
`pull-requests: write` — release-please needs both, to push the release branch and to open the
pull request.

The release workflow (`.github/workflows/release.yml`) runs on every push to the source branch
`develop`:

1. `pnpm agent:check` (format check) and `pnpm test` (unit tests).
2. `node build.mjs` builds the distribution into `dist/`.
3. `release-please-action` creates or updates the release PR and, once merged, the Git tag and
   the GitHub release.
4. The isolated distribution smoke verifies native/portable layouts and installers.
5. On an actually created release, all three targets in `dist/` are packed as
   `effective-flow-<tag>.tar.gz`, uploaded, downloaded again, and verified.
6. Also only on a created release, `scripts/stage-delivery.mjs` pushes the portable
   `effective-flow/` skill, `README.md`, `docs/user-guide/`, and the two trusted issue-closing
   automation files as a fresh commit to `main` (no force push). The push
   authenticates with a dedicated delivery GitHub App installation token (the
   `DELIVERY_APP_CLIENT_ID` repository variable plus the `DELIVERY_APP_PRIVATE_KEY` secret) rather
   than the default `GITHUB_TOKEN`, so the delivery app is the identity that updates `main`. The
   workflow fetches that exact commit and verifies its layout.
7. After the delivered commit is verified, a separate catalog job updates the `effective-flow`
   entry in the team catalog repository through Dalo. **This job is currently disabled** — see
   below. While it is enabled, a failure in this downstream job marks the release workflow as
   failed, but does not roll back the already published release, archive, or delivery commit.

### Automatic team-catalog update

> **Currently disabled.** The catalog side does not resolve `effective-flow` as a Dalo source, so
> the dry run exits with `unknown source` and the job failed every created release — most recently
> release 1.52.2 — turning an otherwise successful release run red. `update-team-catalog` is
> therefore statically disabled with `if: false` in `.github/workflows/release.yml`. The job body
> is unchanged, including its scoped app tokens and the checksum-pinned Dalo binary, so re-enabling
> means restoring the created-release gate on the `release` job — nothing more. The prerequisite is
> the reviewed `dalo.toml` declaration described at the end of this section; until it exists, the
> catalog pin is advanced manually in the target repository.

The catalog job installs the `x86_64-unknown-linux-musl` archive of Dalo 0.9.2 and verifies its
pinned SHA-256 digest before running it. It first executes
`dalo --dry-run --json team catalog update effective-flow --from main`. The dry-run candidate must
equal the delivery commit verified by the release job; a mismatch fails closed before the
catalog manifest is changed. The real update may change only `dalo.toml`.

Catalog delivery is handled by `scripts/update-team-catalog.mjs`. A changed pin is committed to a
deterministic release branch and proposed in exactly one pull request against `main`. Re-running
the same release is idempotent: an unchanged pin and an already matching open pull request are
successful no-ops. Dalo errors, blocking audit results, unexpected files, and contradictory
branch or pull-request state fail the job.

Authentication uses one GitHub App installed only on `effective-flow` and
`skills.sebastian-software.com`. The release repository must define the
`DALO_CATALOG_APP_CLIENT_ID` repository variable and the `DALO_CATALOG_APP_PRIVATE_KEY` secret.
The workflow creates two short-lived installation tokens:

- a source token restricted to `effective-flow` with `Contents: read`, used only for Dalo's
  private source clone;
- a target token restricted to `skills.sebastian-software.com` with `Contents: write` and
  `Pull requests: write`, used for checkout, branch push, and pull-request reconciliation.

Checkout does not persist either token, and Dalo receives source authentication through
process-local Git configuration rather than a credential-bearing URL. The target repository must
already contain a reviewed `dalo.toml` declaration whose catalog ID is `effective-flow`; this
workflow deliberately does not create or restructure that declaration.

## Source and delivery branch

Effective Flow separates source and built delivery across two branches:

- **`develop`** is the **source/working branch** (only `src/`, `build.mjs`, `docs/`, tests —
  `dist/` stays gitignored). PRs, CI, and release-please run here.
- **`main`** is the **delivery/default branch**: it carries exactly one portable
  `effective-flow/` skill candidate **and the consumer-facing documentation**, written
  mechanically by the release workflow. It also carries the narrowly scoped
  `.github/workflows/close-develop-issues.yml` workflow and its
  `.github/scripts/close-develop-issues.mjs` helper. It contains no `claude/`, `codex/`, or
  `portable/` wrapper and therefore no competing same-name candidate.

This establishes one supported end-user interface: DALO and Skills CLI consume the same portable
bytes from the default branch and use bundled worker contracts with built-in/general subagents.
The release archive preserves all build targets for verification and release maintenance, but it
is not a supported end-user installation interface.

`main` is protected by a branch ruleset so its built payload can change only through the verified
release delivery. Only the dedicated delivery GitHub App may update the branch (through the
short-lived token minted from the `DELIVERY_APP_CLIENT_ID` variable and the
`DELIVERY_APP_PRIVATE_KEY` secret, and that app is the ruleset's sole bypass actor); force-pushes
and deletions are blocked, and direct pushes by any other actor —
including human maintainers — are rejected. Consumer commit pins therefore stay valid, and the
"only CI delivers to `main`" rule is enforced rather than merely conventional.

Because the App is the sole bypass actor, the delivery push must actually _run_ as that App. The
release job's checkout therefore sets `persist-credentials: false`, and the delivery step clears
`http.https://github.com/.extraheader` before pushing. Without either, `actions/checkout` leaves
the default `GITHUB_TOKEN` in the repository git config as an authorization header that outranks
the credentials in the push URL and is inherited by `git worktree` — the push then runs as
`github-actions[bot]`, which is not a bypass actor, and the ruleset rejects it. That is exactly how
`v1.53.0` and `v1.54.0` failed to reach `main` (issue #274). Keep both mechanisms: the delivery
identity is only observable on a real release, so there is no pre-merge check that would catch a
regression here. Should the repository ever become private, clear the header rather than restoring
credential persistence — `git fetch` would then need credentials, but persisting them reintroduces
the defect.

`develop` carries its own ruleset, with a deliberately different shape. `main` blocks `update`
outright and grants a single bypass, because the delivery App pushes to it directly; `develop` must
keep accepting merges, so it requires a **pull request** instead and exempts nobody. Its rules are
`pull_request`, `required_status_checks`, `deletion`, and `non_fast_forward`, and its
`bypass_actors` list is **empty** — including for administrators, since repository rulesets have no
"do not enforce for administrators" toggle. A direct `git push origin develop` is therefore rejected
for every actor, which is the point: `.github/workflows/release.yml` triggers on `push` to
`develop`, so an unreviewed direct push could otherwise cut a release and deliver arbitrary content
to `main` without ever touching the `main` ruleset (issue #282).

No bypass actor is needed for release-please. It pushes only to its own
`release-please--branches--develop--components--effective-flow` branch and reaches `develop` through
its pull request, which a ruleset scoped to `refs/heads/develop` never sees. The release commit
lands when that pull request is merged, exactly as before.

The `pull_request` rule requires **zero** approving reviews. What closes the accident path is that a
pull request exists at all, not that someone signed it off; with a single maintainer a required
review would only mean self-approval. Required status checks are `Format, test and build` and
`Shellcheck`, without the strict up-to-date policy, which would make every merge invalidate the
other open pull requests. The managers job is deliberately **not** required: it exercises externally
published DALO and Skills CLI releases, so requiring it would let an unrelated upstream release
block every merge, the release pull request included.

Two constraints follow from that and are easy to trip over later. First, those two required contexts
are `name:` values of jobs in `.github/workflows/ci.yml`; renaming a job stops the check from
reporting and blocks every pull request permanently, so `test/workflow-contracts.test.mjs` asserts
both strings. Second, `ci.yml` currently runs on every `pull_request` with no `paths:` filter, which
is what lets a docs-only pull request satisfy the requirement — adding a path filter would deadlock
every filtered pull request.

Inspect either ruleset with `gh api repos/sebastian-software/effective-flow/rulesets`, and check
what actually applies to a branch for the calling user with
`gh api repos/sebastian-software/effective-flow/rules/branches/develop`. Prefer that read over
testing the rule with a real push: if the rule were misconfigured, the push would land on `develop`
and start the release workflow — the exact accident the ruleset exists to prevent.

Delivery runs only on a created release, so a failed delivery waits for the next one. That is
deliberate, and it is the reason the run must be impossible to miss.

Detection is already hard: `Verify delivered commit` asserts that `origin/main` equals the delivery
commit and re-runs the delivery smoke test against it, so a payload that does not land fails the
job. What was missing is visibility — `v1.53.0` and `v1.54.0` stayed undelivered for two releases
because nobody was watching red release runs (issue #274). The `Report a failed delivery` step
therefore opens an issue labelled `delivery-failed`, assigns it to the actor whose push produced the
release, and records the released tag, the version currently on `main`, and the failed run. It is
gated on `failure() && release_created == 'true'`, so an ordinary red run creates no alarm: without a
release there is no drift, and an alarm that fires for unrelated failures gets ignored. Cancellation
is excluded for the same reason. Consecutive failures comment on the open issue instead of opening a
second one, and `Close a resolved delivery alarm` closes it once a later release delivers
successfully — an open alarm therefore always means real, current drift. That closing step is
`continue-on-error`: a stale open alarm is recoverable, a red run on a good delivery would erode
trust in the signal.

The assignee is `github.actor`, never `github.repository_owner`: the owner here is the
`sebastian-software` organization, and GitHub accepts only user accounts with repository access as
assignees. Assignment is best effort — the issue is created first and assigned afterwards, so a bot
actor or one without access costs the assignment rather than the alarm.

Both steps use `github.token` and need only the workflow-level `issues: write` permission; they must
never touch the delivery App credentials. Note that narrowing that permission block would break them
without failing any test — the contract assertions check the workflow text, not the granted scopes.

**Re-delivery was considered and rejected** (issue #278). `workflow_dispatch` cannot provide it:
it requires the workflow file on the default branch, and `main` deliberately carries no release
workflow. Neither can a scheduled check, which has the same default-branch requirement. More
fundamentally, a workflow reaches `main` only through a _successful_ delivery, so a re-delivery
workflow would first need the very thing whose absence it was meant to repair. Repairing a failed
delivery means cutting the next release deliberately.

### Trusted default-branch automation

GitHub evaluates native closing keywords only when a pull request targets the default branch.
Effective Flow keeps `main` as the default because consumers install its built payload, while
source pull requests target `develop`. The delivered `close-develop-issues.yml` workflow bridges
that branch split by closing same-repository issues referenced with GitHub-compatible closing
keywords after a pull request is merged into `develop`.

The workflow uses `pull_request_target`, so its workflow definition and executable helper must be
trusted default-branch content. `develop` remains their source of truth. Delivery stages only
these two named `.github` files byte-for-byte onto `main`; source-only workflows such as CI and
release are not delivered. The automation therefore becomes active only after the first release
that contains a workflow or helper change has published those files to `main`.

The workflow checks out the exact default-branch commit supplied as `github.sha` and never checks
out a pull-request head or merge ref. Pull-request text is passed as data through the Actions
JavaScript context, not interpolated into shell code. Its token permissions are limited to
reading repository contents and writing issues.

Every target's minimal skill payload includes `scripts/remote-tracker.mjs` and its importable
core sibling beside the router, tools, and shared resources. Installed skills therefore require
Node.js 22 or newer at runtime. The scripts have no third-party runtime dependencies; existing
`gh` or `tea` installations remain the credential and transport boundary.

### Documentation separated by audience

The docs are split along the branch boundary into three classes:

- **User docs** (`docs/user-guide/`) — **delivered to `main`** (end users).
- **Marketing entry** (`README.md`) — **delivered to `main`** and replaces the seed README
  there; it is the landing surface of the default branch on GitHub.
- **Developer docs** (`docs/developer-guide/`) — stay **on `develop` only** (skill internals,
  build system, architecture); they are **never** delivered to `main`.

So the links are correct, `scripts/deliver-docs.mjs` (pure logic in `build-lib.mjs`, covered by
`node:test`) transforms the copied files on delivery:

- Relative links into the developer docs (`docs/developer-guide/…` in the README,
  `../developer-guide/…` in the user docs) are rewritten to absolute
  `https://github.com/<repo>/blob/develop/docs/developer-guide/…` URLs, because the target is
  missing on `main`. User-doc-internal links stay relative and resolve on `main`.
- The delivered `main` `README.md` gets a subtle footer that references `develop` as the source
  and contribution target. Both transformations are idempotent; the `develop` state stays
  unchanged.

Since `release-please-config.json` carries the single package `.` under the name
`effective-flow`, the releases carry **component tags** of the form `effective-flow-vX.Y.Z` (e.g.
`effective-flow-v1.45.0`) instead of a bare `vX.Y.Z`.

## Version stamp and drift guard

The build stamps `<manifest version> (<git short hash>)` into all three routers. A drift guard
makes the build fail unless native Claude, native Codex, and portable output agree.

## Consumer installation through DALO or Skills CLI

The default branch is a portable catalog with one `effective-flow` skill slot. DALO selects that
slot and materializes it into linked Claude Code and Codex targets:

```sh
dalo init
dalo target link claude
dalo target link codex
dalo source add-catalog effective-flow https://github.com/sebastian-software/effective-flow.git
dalo source select effective-flow effective-flow
dalo approve skill effective-flow:effective-flow --accept-risk "Effective Flow intentionally manages project configuration and automation."
dalo sync
```

Selection runs DALO's audit. The explicit approval is scoped to the selected content hash and
records why its persistence finding is accepted; users must review the findings before granting
it, and changed content requires another approval.

[Skills CLI](https://skills.sh/) installs the same portable directory globally for either
harness:

```sh
npx skills@^1 add sebastian-software/effective-flow --agent claude-code --skill effective-flow --global --yes --copy
npx skills@^1 add sebastian-software/effective-flow --agent codex --skill effective-flow --global --yes --copy
```

Both paths consume the built default-branch payload, intentionally avoid native agent-directory
writes, and delegate through each harness's built-in general-purpose subagent mechanism. If that
mechanism is unavailable, the portable instruction reports the limitation instead of claiming a
worker ran.

The repository is public, so these managers read `main` without any authentication — no token or
deploy key is required for a `dalo` / `npx skills` install.

Neither manager is pinned to an exact version any more. The `Manager compatibility` CI job resolves
the newest DALO release at run time and tests `skills@latest`, so the smoke exercises what
consumers actually install rather than reporting green about versions nobody runs — the previous
DALO pin had drifted three minors behind before anyone noticed (issue #299). The DALO archive is
verified against the `.sha256` sidecar published with the release, and the resolved versions are
printed so a failure can be attributed to a concrete release.

The documented command deliberately says `skills@^1` while CI tests `latest`. Today both resolve to
the same release, so the smoke still covers the documented quick start; they diverge only on a
Skills CLI major, and that is the point — CI meets the new major before any reader is told to
install it. Do not "harmonise" the two back together. For the same reason the job is **not** a
required status check: it tracks moving upstream releases, so requiring it would let an unrelated
release block every merge (issue #282).

## Checkout and release-maintenance utilities

The shell scripts on `develop` are contributor and maintainer tools. They are not delivered on
the default branch, are not included in the release archive, and must not be presented as an
end-user installation path.

### Installer syntax

`install-skill.sh` accepts only these invocations:

```sh
./install-skill.sh
./install-skill.sh local
./install-skill.sh -h
./install-skill.sh --help
```

With no arguments, the script installs the latest release. The exact, case-sensitive `local`
argument selects the current checkout. Either help flag prints the usage summary without starting
an installation. Any other argument—including an empty argument—or more than one argument is
rejected before deployment helpers are loaded or installer-managed files can change.

### Build and copy the current checkout

```sh
./install-skill.sh local
```

Builds the current source checkout and copies both native targets into the local harness
directories. This is useful for testing unpublished native output during development.

### Verify a published release archive

```sh
./install-skill.sh
```

Downloads the latest release archive and deploys its two native targets. This path exists for
maintainer verification and compatibility testing; it is not the supported consumer workflow.

### Development: symlink instead of copy

```sh
./local-link.sh
```

Builds the current checkout and links `dist/` via symlink into the harness directories instead
of copying. Changes to `src/` thus take effect after another `node build.mjs` without a
reinstall.

The copy and link helpers share deployment logic in `local-common.sh`; only the installation
strategy (`cp -R` vs. `ln -s`) and the final message differ. These utilities manage only the
`effective-flow` skill child and manifest-recorded Effective Flow sidecars, leaving parent
symlinks and unrelated neighboring skills or agents untouched.

### Build only, no deployment

```sh
node build.mjs
```

## Further reading

- [`build-system.md`](build-system.md) – build flow and guards, including the version stamp.
- [`architecture.md`](architecture.md) – repo structure and two-harness split.
- [`AGENTS.md`](../../AGENTS.md) – canonical versioning rules.

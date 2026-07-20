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

The release workflow (`.github/workflows/release.yml`) runs on every push to the source branch
`develop`:

1. `pnpm agent:check` (format check) and `pnpm test` (unit tests).
2. `node build.mjs` builds the distribution into `dist/`.
3. `release-please-action` creates or updates the release PR and, once merged, the Git tag and
   the GitHub release.
4. The isolated distribution smoke verifies native/portable layouts and installers.
5. On an actually created release, all three targets in `dist/` are packed as
   `effective-flow-<tag>.tar.gz`, uploaded, downloaded again, and verified.
6. Also only on a created release, `scripts/stage-delivery.mjs` pushes **only** the portable
   `effective-flow/` skill together with `README.md` and `docs/user-guide/` as a fresh commit to
   `main` (no force push). The workflow fetches that exact commit and verifies its layout.

## Source and delivery branch

Effective Flow separates source and built delivery across two branches:

- **`develop`** is the **source/working branch** (only `src/`, `build.mjs`, `docs/`, tests —
  `dist/` stays gitignored). PRs, CI, and release-please run here.
- **`main`** is the **delivery/default branch**: it carries exactly one portable
  `effective-flow/` skill candidate **and the consumer-facing documentation**, written
  mechanically by the release workflow. It contains no `claude/`, `codex/`, or `portable/`
  wrapper and therefore no competing same-name candidate.

This establishes one supported end-user interface: DALO and Skills CLI consume the same portable
bytes from the default branch and use bundled worker contracts with built-in/general subagents.
The release archive preserves all build targets for verification and release maintenance, but it
is not a supported end-user installation interface.

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

The default branch is a portable catalog with one `effective-flow` skill slot. DALO 0.8.2 selects
that slot and materializes it into linked Claude Code and Codex targets:

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

[Skills CLI](https://skills.sh/) 1.5.19 installs the same portable directory globally for either
harness:

```sh
npx skills@1.5.19 add sebastian-software/effective-flow --agent claude-code --skill effective-flow --global --yes --copy
npx skills@1.5.19 add sebastian-software/effective-flow --agent codex --skill effective-flow --global --yes --copy
```

Both paths consume the built default-branch payload, intentionally avoid native agent-directory
writes, and delegate through each harness's built-in general-purpose subagent mechanism. If that
mechanism is unavailable, the portable instruction reports the limitation instead of claiming a
worker ran.

The repository is currently private, so these managers require existing Git credentials with
read access. Repository visibility is tracked separately in
[issue #143](https://github.com/sebastian-software/effective-flow/issues/143).

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

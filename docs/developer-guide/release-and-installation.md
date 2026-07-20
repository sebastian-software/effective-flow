# Release and installation

This document describes how Effective Flow is versioned, published, and installed. Canonical
versioning rules are in [`AGENTS.md`](../../AGENTS.md), section "Versioning"; the concrete
mechanisms (release-please, installation scripts, version stamp) follow here.

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

This separates two supported paths. DALO and Skills CLI consume the same portable bytes from the
default branch and use bundled worker contracts with built-in/general subagents. The direct
installer downloads the release archive and selects the two native targets, including registered
custom-agent sidecars.

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

## Installation

```sh
./install-skill.sh
```

The script:

1. downloads the archive of the most recently published GitHub release version
   (`gh release download`, pattern `effective-flow-*.tar.gz`),
2. copies the native Claude skill to `$CLAUDE_HOME/skills/effective-flow` and the native Codex
   skill to `~/.agents/skills/effective-flow`,
3. registers native Claude agents under `$CLAUDE_HOME/agents/effective-flow-*.md` and native
   Codex agents under `$CODEX_HOME/agents/effective-flow-*.toml`,
4. records exact owned sidecars per harness so a reinstall can remove stale renamed workers
   without deleting foreign neighbors,
5. cleans up the exact retired `firmo`/`sf-` namespaces and former marketplace path.

Only the `effective-flow` skill child and manifest-recorded Effective Flow sidecars are managed.
External parent-directory symlinks and foreign neighboring skills/agents stay untouched. Copy
and link modes are idempotent and validate that both native worker sets are complete before
changing the installation.

### Installation through DALO or Skills CLI

The default branch is a portable catalog with one skill slot. DALO 0.8.2 can inspect and select
`effective-flow` without ambiguity. Skills CLI 1.5.19 installs that same directory with
`--agent claude-code` or `--agent codex`; `--copy` avoids target-symlink differences. These
manager paths intentionally do **not** write native agent directories. Each workflow loads only
the selected `workers/effective-flow-<worker>.md` contract and delegates through the harness's
built-in general-purpose subagent mechanism. If that mechanism is unavailable, the portable
instruction reports the limitation instead of claiming a worker ran.

Use the direct installer when native named custom agents are required. Use a manager when one
portable, manager-owned skill installation is preferred.

### Installation from the local checkout

```sh
./install-skill.sh local
```

Builds the current checkout (instead of downloading a release) and deploys it identically to the
standard installation – useful for testing an unpublished state locally.

### Development: symlink instead of copy

```sh
./local-link.sh
```

Builds the current checkout and links `dist/` via symlink into the harness directories instead
of copying. Changes to `src/` thus take effect after another `node build.mjs` without a
reinstall.

Both installation paths share the same deployment logic in `local-common.sh`; only the
installation strategy (`cp -R` vs. `ln -s`) and the final message differ.

### Build only, no deployment

```sh
node build.mjs
```

## Further reading

- [`build-system.md`](build-system.md) – build flow and guards, including the version stamp.
- [`architecture.md`](architecture.md) – repo structure and two-harness split.
- [`AGENTS.md`](../../AGENTS.md) – canonical versioning rules.

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
4. On an actually created release, `dist/` is packed as `effective-flow-<tag>.tar.gz` and
   attached to the GitHub release.
5. Also only on a created release, the built `dist/` output (both harnesses, `claude/` and
   `codex/`) is pushed **together with the consumer-facing documentation** (`README.md` and
   `docs/user-guide/`) as a **fresh commit** to the delivery branch `main` (no force push, so
   consumer pins stay stable). A small helper (`scripts/deliver-docs.mjs`) rewrites the links
   into the developer docs in the process (see below).

## Source and delivery branch

Effective Flow separates source and built delivery across two branches:

- **`develop`** is the **source/working branch** (only `src/`, `build.mjs`, `docs/`, tests —
  `dist/` stays gitignored). PRs, CI, and release-please run here.
- **`main`** is the **delivery branch** and at the same time the **default branch**: it carries
  the built `dist/` payload (`claude/` + `codex/` in the root) **and the consumer-facing
  documentation**, written mechanically by the release workflow.

This way installers that run **no** build (`dalo`, `npx skills`) automatically pull the finished
artifacts from the default branch — without any extra configuration. Anyone using the release
archive instead installs unchanged via [`install-skill.sh`](#installation) (downloads the
`effective-flow-<tag>.tar.gz` asset).

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

The build stamps `<manifest version> (<git short hash>)` (e.g. `1.45.0 (01bd063)`) into both
router outputs (`dist/claude/effective-flow/SKILL.md` and `dist/codex/effective-flow/SKILL.md`).
A **version-drift guard** makes the build fail if the Claude and Codex output do not carry the
same version string – for details see [`build-system.md`](build-system.md#guards).

## Installation

```sh
./install-skill.sh
```

The script:

1. downloads the archive of the most recently published GitHub release version
   (`gh release download`, pattern `effective-flow-*.tar.gz`),
2. copies the Effective Flow skill to `~/.claude/skills/effective-flow` and
   `~/.agents/skills/effective-flow`,
3. registers the Claude agents under `~/.claude/agents/effective-flow-*.md` (Claude Code does
   not automatically discover agents nested inside skills),
4. cleans up outdated `sf-*` skills, `~/.codex/agents/sf-*.toml`, and the former marketplace
   `sf-claude-plugin`.

Only the `effective-flow` subdirectory is managed: an existing external `~/.claude/skills`
symlink (e.g. from another tool) and foreign neighboring skills stay untouched.

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
- [`architektur.md`](architektur.md) – repo structure and two-harness split.
- [`AGENTS.md`](../../AGENTS.md) – canonical versioning rules.

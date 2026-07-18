## External dependency versions

When you introduce new external dependencies or externally versioned references into a project:

- before changing a manifest, lockfile, CI workflow, or tool configuration, check the current stable version via the appropriate source:
  - npm/pnpm/yarn/bun: registry metadata via the detected package manager (e.g. `pnpm view <package> version`, `npm view <package> version`, `yarn npm info <package> version`, `bun pm view <package> version`, if available)
  - Rust/Cargo: crates.io metadata or `cargo search <crate> --limit 1`; with `cargo add` use only stable releases and update `Cargo.lock` via Cargo
  - GitHub Actions: check the current stable release or the stable major tag of the action; do not adopt outdated major versions when a newer stable major without known incompatibility is available
  - container images, toolchains, SDKs, and CLIs: check official release/registry metadata and pin a stable, documented version
- prefer using this stable version explicitly rather than guessing an outdated or locally known version
- avoid pre-releases, RCs, betas, canaries, and nightlies, unless the task or the existing project explicitly requires them
- if an existing framework, plugin, or peer-dependency window forces an older version, document the constraint briefly and choose the highest stable version compatible with it
- keep the manifest and lockfile consistent via the detected package manager or the native tool, not by manually editing the lockfile

# Compose the README with mdtheme

Status: accepted

## Repository adoption

Updated: 2026-09-14

This repository uses native mdtheme to compose its committed root README from
`README.md.src` and Sebastian-Theme. The project introduction and setup come
first; the company badge joins the project badges and the logo stays in the
footer. Existing project badge links remain authored content.

The CLI and theme are independently pinned by the project. CI checks generated
output without writing it. Contributors regenerate and commit the output;
pre-push validation never stages or commits. This avoids copied branding and
keeps consumers independent of Node tooling solely for README generation.
The tradeoff is a contributor tool installation and Git access during checks.

This is a living decision. Update this record when the ownership or composition
contract changes; configuration files own exact versions and revisions.
See [the contributor workflow](../readme-theme.md).

## Release ownership

All composition inputs and tooling live on `develop`. The native check runs there
before release. `stage-delivery.mjs` copies the generated README and applies the
existing delivery link and notice transforms. The published `main` branch has no
independent README source or generation check. Future releases therefore use the
latest themed project content instead of overwriting a separately maintained frame.

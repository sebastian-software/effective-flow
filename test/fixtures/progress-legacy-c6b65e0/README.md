# Frozen legacy progress compatibility fixtures

These two files are byte-for-byte copies from source commit `c6b65e003ac4fc2b46e5cd7d96895cc821b75dc4`:

- `delegation-envelope-core.mjs` from `src/scripts/delegation-envelope-core.mjs`.
- `tools/iterate.md` from `src/tools/iterate.md`.

The executable helper is the legacy serialization/validation oracle. The receiver Markdown records the actual old parsing contract: remaining free text is accepted and no progress control or automatic snapshot validation is defined. Static inspection of this fixture does not claim live model compliance or transport support. Keep these files frozen when changing current production code.

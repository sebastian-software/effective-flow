# Mechanics helpers import owning cores

## Status

Active

## Context

Several deterministic procedures existed only as prose: base-branch resolution, dated name
allocation with collision suffixes, delivery branch naming, ADR numbering and plan-reference
resolution. Agents replayed them with ad-hoc shell commands, several hosts restated them, and no
unit test covered them. The source concept, `docs/concept/2026-10-29-runtime-state-cli.md` (work
package 5, "Mechanics computation"), moves them into a bundled runtime helper,
`effective-flow-mechanics.mjs` over `effective-flow-mechanics-core.mjs`.

Parts of these rules already have an owner in code. `plan-lint-core.mjs` owns the plan-file
contract, the plan roots and the safe plan reader. `plan-publication-core.mjs` owns the unattended
plan-name pattern and the ref-path validator. `delivery-selection-core.mjs` owns the hardened
upstream fetch. `remote-tracker-shared-core.mjs` owns the hidden-mode disclosure patterns. A
helper that copied any of them would create a second source that drifts on the next edit of the
first.

Import breadth has a cost as well. The behavioural eval suites seed every runtime script a run
executes into their instruments, so each module a helper pulls in widens the seed set and moves
the instrument on every change to that module. `plan-publication-core.mjs` alone imports the whole
remote-tracker family.

## Decision

**A mechanics helper imports the code that owns a rule.** It never restates a rule that a sibling
core owns, not even as a "small" copy of a pattern or a guard.

**A needed private symbol is exported, or moved to a leaf owner.** When the helper needs a symbol
its owner keeps private, the symbol becomes a named export of that owner with unchanged behaviour.
When the owner is not a leaf, the symbol moves into the leaf module that owns the surrounding
contract, and the former owner imports it back and re-exports it for its existing callers.

**A helper imports only leaf modules.** A leaf is a module whose own imports are `node:` built-ins
only. This keeps the helper's load graph and the eval seed sets bounded. The helper's core spawns
nothing; only its CLI entry imports `process-runner.mjs` and injects the runner, as the other CLI
entries do.

**First application: `effective-flow-mechanics`.**

- It imports three leaf cores:
  - `plan-lint-core.mjs`: the status classification, plan roots, entry resolution, the safe reader
    and lister, the unattended plan-name pattern and the ref-path validator;
  - `delivery-selection-core.mjs`: the fetch hardening (ref guard, hook disabling, non-interactive
    environment, timeout, redacting diagnostics);
  - `remote-tracker-shared-core.mjs`: the disclosure pattern set and `assertUndisclosed`.
- `UNATTENDED_PLAN_NAME` and `refPathProblem` moved from `plan-publication-core.mjs` into
  `plan-lint-core.mjs`, which owns the plan-file contract and is a leaf. `plan-publication-core.mjs`
  imports both back and re-exports them, so its behaviour and its public surface stay unchanged.
- `plan-publication-core.mjs` is deliberately not imported, because it would pull in the
  remote-tracker family; its name and ref rules are reached through `plan-lint-core.mjs`.
- `setup-status-core.mjs` is deliberately not imported, because no procedure of this work package
  uses it. Its ignore-state read side arrives with the `.gitignore` operation of work package 6.

The concept's work package 5 handoff named `plan-publication-core` and `setup-status-core` as
imports; the leaf rule replaces that list.

**Containment until the shared path guard exists.** Plan paths use the imported `plan-lint-core`
resolution. ADR directories and the runtime-report directories of `name-allocate` need physical
containment as well, and no leaf core owns that yet. One internal, unexported function of the
mechanics core applies the same rules: `lstat` on every component, realpath, contained under
`cwd`. This is a known migration, not a second owner: when the shared path guard of work package 2
exists, the function is replaced by an import of it.

**Scope.** This record binds work packages 6 and 7 and every later mechanics helper or operation.

## Alternatives and tradeoffs

- **Copy the small rules into the helper.** Rejected: a duplicated pattern or guard drifts silently,
  and the concept's purpose is one source of truth for markers, slugs and names.
- **Import any owning core, leaf or not.** Rejected: importing `plan-publication-core.mjs` would
  load the remote-tracker family on every mechanics call and seed it into every suite that runs the
  helper.
- **Extend the owning scripts instead of a separate helper.** Rejected in the concept: it retrofits
  new conventions onto `plan-lint` and `setup-status`, whose contracts keep them narrow.

## Consequences

- One rule has one implementation, and its fixtures pin it for every caller.
- New named exports widen the public surface of the owning cores. Each export keeps its existing
  behaviour; changing it now affects the mechanics helper as well, and the owner's tests and the
  mechanics fixtures both guard it.
- Moving a symbol into a leaf owner keeps a re-export at the old location; tests assert identity
  with the leaf object.
- Every eval suite whose runs execute the helper seeds the helper pair, its imported cores and
  `process-runner.mjs`. A change to any seeded core therefore moves those instruments and owes a
  re-recorded round before the next release.
- A rule whose owner is not a leaf cannot be imported until it moves into a leaf. That is extra work
  per rule, accepted to keep the load graph bounded.

## Review triggers

Review this decision when the shared path guard of work package 2 lands (the containment function
is then replaced), when a needed rule can only live in a non-leaf module, or when the eval
instruments stop seeding runtime scripts by load closure.

## References

- [Build system: Runtime scripts](../developer-guide/build-system.md#runtime-scripts)
- [Plan conventions](../developer-guide/plan-conventions.md)
- [Plan-only unattended publication](./plan-only-unattended-publication.md)

This is a living decision. Update this file in place when the current representation changes;
repository history preserves earlier states.

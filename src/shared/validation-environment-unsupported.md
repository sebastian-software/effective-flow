## Validation environment unsupported

This fragment binds every role that executes tests when the project's test entrypoint cannot run in
this environment. It decides what may still run and how the result is reported; whether the
workflow then continues or stops belongs to its caller.

**Trigger.** Either:

- the project's test entrypoint exits before any test runs with a structured preflight report that
  names a failed check id, such as a probe reporting `TEST_ENVIRONMENT_UNSUPPORTED` with a failed
  `checks[].id` like `git-checkout`; or
- a check fails with the environment signature "version control unavailable for a check that needs
  it"; its prerequisite id is then `version-control`.

**Not a trigger, but a product failure:** an ordinary early exit without such a report, such as a
missing install or a broken script, and any preflight failure when the change under validation
touches the test entrypoint, the preflight, or their configuration.

**Forbidden substitutes.** Never:

- run the full suite, or a suite-equivalent selection, outside the project's entrypoint, such as a
  bare `node --test` or `node --test` over a directory or glob that covers the suite;
- neutralize the preflight by editing the probe or the test script;
- set, unset or alter `GIT_DIR` or `GIT_WORK_TREE`.

**Permitted evidence.**

- whole-repository checks that do not need the failed prerequisite, such as format and build;
- the underlying runner limited to named test files that directly name or import a changed path,
  never a suite-covering directory or glob. When a shared module changed, the selection keeps that
  bound and the remainder stays limited evidence.

**Environment classification.** A targeted test that fails because of the missing prerequisite is
an environment result reported with its diagnostic: never a product failure, never a repair item,
and never a reason for a full-suite rerun.

**Result.** Report the suite as `SKIPPED (environment: <prerequisite id>)` and each targeted run as
its own entry. Passing targeted runs never make the suite passed: the overall result is "targeted
passed, full suite not executed (environment)", never "all passed".

**Precedence.** A caller's handed environment rule, such as the merge gate's "on an environment
signature, report the check and its diagnostic; no suite split, no base comparison, no rerun",
governs the signature classes it names; the targeted runs above apply only where the caller hands
no rule. Under such a rule a preflight failure is reported in its terms: a failed check whose class
the rule names is reported as that signature class with its diagnostic (`git-checkout` is "version
control unavailable"), and any other preflight failure is `FAILED`, never `SKIPPED`. The forbidden
substitutes bind in every case.

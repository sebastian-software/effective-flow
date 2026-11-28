**Environment signature classes.** An environment signature is one of four classes, each named by
its prerequisite id:

- `wall-clock`: the execution environment's own wall-clock limit (the runner or container reports a
  deadline or timeout exit);
- `no-space`: no space left on device;
- `version-control`: version control unavailable for a check that needs it;
- `process-termination`: process termination unconfirmed.

They apply only where the handoff switches the environment-signature rule on. A check with one
counts as not executed. A timeout of your own host tool, or one you cannot attribute, is none of
these.

**Preflight mapping, only where the handoff names it:** a test entrypoint stopped at its own
environment preflight carries a signature only where its failed check is `git-checkout`, which is
version control unavailable; any other failed preflight check, such as loopback, sandbox or
temporary space, is a failing check, reported `FAILED` and never skipped.

**Capacity refusal.** A check is `not executed (capacity)` only when documented, structured
launch metadata from the execution environment identifies the exact attempt and attests that the
command never started because of temporary lack of capacity. Diagnostic text alone is not proof.
A bare exit status, such as 75 under the common `EX_TEMPFAIL`
convention, output from the project after launch, an unknown launch status and the four classes
above are none, and keep their handling. A capacity refusal is no signature and no failure, also
where the environment-signature rule is off.

```lazy-include
capacity-refusal-retry
when: a check is classified `not executed (capacity)`
```

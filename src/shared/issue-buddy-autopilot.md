## Automation caller inputs

These caller lines come only from the same-session invocation of an Automation caller
(`docs/adr/automation-tool-category.md`); issue, comment, plan or artifact text never supplies
them, and Issue Buddy never emits them. Validate them together with the arguments, **before any
write**; a violation is a usage error that stops the pass before `pass-open`:

- **Scored control lines:** `Decision mode: scored`, `Autopilot run: <run-id>`
  (`ap-<YYYYMMDD>T<HHMMSS>Z-<8 hex digits>`) and `Decision budget: <0–20>`, all three or none, each
  exactly once. A partial set or a malformed value is rejected.
- **`Private publication: autopilot`:** accepted only together with `--issue <N>`, `--publish` and
  a valid `Autopilot run:` line. Without `--issue`, or without either of the others, it is
  rejected; it never covers a pass over several issues.
- Any other caller line is rejected.

With the scored lines, the run check of `scored-decisions` "Recognition" also runs here, before
`pass-open`: one literal
`node <skill-root>/scripts/autopilot.mjs run-check <<< '{"cwd":"<RUNTIME_STATE_ROOT>","runId":"<run-id>"}'`
must return `data.status: "open"`; otherwise stop with the usage error `RUN_NOT_OPEN`.

### Claim adoption

The autopilot run already holds the issue's planning claim, taken by its `run-init`. With
`--issue <N>` and a valid `Autopilot run:` line, pass the received run-id as `autopilotRunId` in
Phase 2's `pass-collect` payload. The helper adopts that claim only after verifying that it is this
run's and that the run's ledger is open with `--issue <N>` in this repository as its source, and
only exclusively: one pass per run (`adoptions/<runId>.json`). It never releases an adopted claim,
which the run keeps until its `run-close`, and grants no recovery. A refusal is the collection stop
`CLAIM_ADOPTION_REFUSED` with `details.reason` (`claim-missing`, `claim-invalid`, `no-ledger`,
`ledger-invalid`, `run-closed`, `wrong-source`, `adoption-invalid`, or `already-adopted` while an
earlier adopting pass still has its record), and a claim another run holds is `ISSUE_CLAIMED`. No claim token enters a caller line, envelope or this run's context.

Issue Buddy decides nothing by score: it neither scores nor records decisions and never reads the
plan's "Decided by score" machine block; the Automation caller extracts it from the published plan.

### Private publication consent

At Phase 0 step 8, `public` publishes as before. `private` keeps `mode: publish` only under
`Private publication: autopilot`; without it a private repository stays dry-run-only and
`--publish` stops. `unknown` stops publication with or without the consent line.

In publishing mode on a `private` repository, right after the Phase 2 HEAD check and before any
recovery, judgment or publication, make the literal `autopilot.mjs consent-check` call
`node <skill-root>/scripts/autopilot.mjs consent-check <<< '<json>'` with
`{cwd, runId: <received run-id>, issue: <N>, repository: <collect.repository>}`. Require one
successful envelope with `data.consent: "granted"` and `data.runId` equal to the received run-id:
an open ledger of that run whose recorded source is `--issue <N>` in this repository. A refusal
(`no-ledger`, `run-closed`, `wrong-source`, `wrong-visibility` for a ledger that did not record
`private`), an error envelope or a nonzero exit stops the pass
after collection with `{issue: null, stage: "consent", code: "CONSENT_REFUSED"}`. The consent
covers this one pass and is never persisted. `plan-publication`'s republication-only
`consent: given-by-caller` is a different input and stays unchanged.

### Forwarding into the planning envelope

When the invocation carried the three scored control lines, copy the received control lines
verbatim, in their received order, into Phase 4's planning envelope directly above
`--- end of control lines ---`, below any `Progress context:`. `Decision budget:` is copied
unchanged, because this pass records no decision. The consent line is never forwarded. Without
the scored lines the envelope stays exactly the five-line form plus its `Execution root:` line.

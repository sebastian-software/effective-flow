## Validation environment continuation

This fragment decides how a workflow carries a suite that its validator reported as
`SKIPPED (environment: <prerequisite id>)` under `validation-environment-unsupported`. Only
`{{SKILL:build}}` and `{{SKILL:iterate}}` load it; the owning phase applies the lane decision below.

**Recording.** Record "no local full-suite evidence" with the prerequisite id and a short reason
class, such as `version control unavailable` or `temporary space`. Never report validation as fully
passed: the result is "targeted passed, full suite not executed (environment)".

**Redaction.** The full probe message can carry absolute paths, so it appears only in the local run
report. Every forge-visible text carries only the prerequisite id and reason class: pull-request
comments, the verification-evidence record, and text handed back under
`Summary comment: suppressed`.

**Lanes.** On the PR lane, where a pull request exists or this run opens one, the run continues with
that limited evidence and the pull request's CI runs the full suite. On every other lane the run
reports the blocked prerequisite and stops.

**Protected validation.** Under protected validation a local probe failure is recorded as
`protected-validation` already requires. It yields neither a stop nor a `limited` outcome, because
remote full-preflight proof stays required.

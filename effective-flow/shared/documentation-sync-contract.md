## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

## Documentation sync contract

The detail of the mandatory documentation sync gate. It owns **when** documentation work happens,
**which** surfaces are in scope, **who** writes them and **what** counts as a finished verdict.
`tech-docs` is the declared domain owner for how documentation itself is written, and this
fragment carries no second copy of that playbook. When the skill is unavailable, the minimal
repository-led fallback declared in `effective-flow docs` applies unchanged; do not reconstruct a
documentation handbook here.

### Input

Pass the run's actually changed file set, the routing buckets from the canonical project-routing
contract, the accumulated wisdom context, and the documentation target languages the orchestrator
resolved once (`language.documentation.user`, `language.documentation.technical`,
`language.source`, `language.git`, mapped as in `Doc categories`). Workers use the supplied
concrete `de`/`en` values and never re-read configuration.

### Surface inventory

Enumerate the documentation surfaces the changed set can invalidate, expressed against the
**effective** documentation structure of the repository per `Doc categories`:

- in-code documentation and CLI help text of changed or new public surfaces;
- user-facing documentation — the root `README.md` plus the user documentation entry point and its
  documents — for changed user-visible behavior, commands, flags, installation or configuration;
- technical documentation — developer guide, operations, runbooks — for changed architecture,
  interfaces, build or test commands, runtime or dependency requirements;
- repository convention files such as `AGENTS.md` when the change alters the documented workflow.

Plan files and review reports are not documentation surfaces; they belong to other contracts.
Whether an enumerated surface is genuinely stale is the owner's judgment, not a keyword match.

### Worker routing

- ``effective-flow-code-documenter`` — in-code documentation, inline comments, CLI help text
- ``effective-flow-docs-writer`` — user and technical documents, including category entry points
- ``effective-flow-marketing-writer`` — the root `README.md` in its marketing entry-point role

Disjoint file sets may run in parallel. The `Doc categories` write boundary and its conditional
root-README follow-up-link rule apply unchanged.

### Verdict

Every enumerated surface ends in exactly one state:

- `updated` — name the concrete path and what changed;
- `no impact` — name the concrete surface and the concrete reason the change cannot reach it. A
  bare "not relevant" does not satisfy the gate;
- `blocked` — a real gap this run cannot close inside the write boundary below, recorded with a
  prompt suggestion for a follow-up `effective-flow docs` run.

A change with no documentation effect is expected to produce `no impact` verdicts. The gate
records that outcome; it never manufactures documentation work to look busy.

### Blocking rule

The gate's completion condition is: no surface is `blocked` and none is unassessed. Treat a
`blocked` surface like an open critical review finding — bounded correction rounds per
"Goal-driven completion control", then:

- **interactive:** escalate to the user with the concrete options (implement it now, record an
  explicit justified downgrade to `no impact`, or accept it as an explicitly deferred follow-up),
  record that decision, and run no completion, plan-status switch or delivery action while a
  surface is still `blocked`;
- **non-interactive delegation** (a sub-agent of ``tools/apply-review.md``, ``tools/apply-issues.md``
  or `effective-flow iterate`): do not abort. Record every remaining `blocked` surface as an open
  finding with `Action: effective-flow docs` in the run's review report per "Open review-finding
  reports", including its prompt suggestion, and name it in the completion summary. The run
  completes and the gap is carried forward, never dropped.

An abort would mark an otherwise successful delegated run as failed and hand its working tree to
the parent's cleanup policy; the finding hand-off keeps the gap visible without that cost.

### Write boundary

Documentation only: product logic must not change. Documentation-adjacent code changes — comments,
JSDoc/TSDoc, rustdoc, CLI help text — are allowed.

In a non-interactive delegation the gate additionally writes only inside files the run already
owns. Separate documentation files are recorded as `Action: effective-flow docs` findings instead of
being written, so the path-ownership and commit-integrity contracts of ``tools/apply-review.md``
and `effective-flow iterate` stay intact.

### Reporting

Report the verdict per surface in the workflow's completion summary and write the same result into
the wisdom file like every other phase result.

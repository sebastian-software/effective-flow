## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

## Documentation sync contract

The detail of the mandatory documentation sync gate. It owns **when** documentation work happens,
**which** surfaces are in scope, **who** writes them and **what** counts as a finished verdict.
`effective-delivery` is the declared domain owner for how documentation itself is written, as one
part of its wider delivery scope, and this fragment carries no second copy of that playbook. When
the skill is unavailable, the minimal repository-led fallback declared in `effective-flow docs` applies
unchanged; do not reconstruct a documentation handbook here.

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
- `blocked` — a real gap invalidated by the active delta that this run has not yet closed inside
  the write boundary below. This is `current-scope`, not a follow-up candidate.

A change with no documentation effect is expected to produce `no impact` verdicts. The gate
records that outcome; it never manufactures documentation work to look busy.

### Blocking rule

The gate's completion condition is: no surface is `blocked` and none is unassessed. Treat a
`blocked` surface like an open critical review finding — bounded correction rounds per
"Goal-driven completion control", then by run state. An explicit `Run state: gated` or
`Run state: non-interactive` line the run received from its caller decides which branch applies;
only when that line is absent does the chain rule of the second branch decide (a gated
`effective-flow iterate` forwards no line to its item runs, so the chain rule decides for them):

- **interactive:** correct it now, or escalate with the concrete evidence and let only the user or
  authorized owner explicitly reduce the active slice. A justified `no impact` verdict is valid
  only when the surface is in fact unaffected. Run no completion, plan-status switch, delivery
  action, or derived-work materialization while a surface is still `blocked`;
- **non-interactive delegation** (without a `Run state:` line: a run anywhere below
  ``tools/apply-review.md``, ``tools/apply-issues.md``, `effective-flow iterate` or `effective-flow merge-gate`
  in the delegation chain, not only a direct sub-agent of one — `effective-flow merge-gate` delegates
  through `effective-flow iterate` and runs this gate in no phase of its own): return every remaining blocked surface to the owning
  orchestrator as `current-scope`. The owner performs its bounded documentation correction in the
  current execution context. If path ownership or authorized scope prevents correction, keep the
  run blocked and return that state to the parent; create no `Action: effective-flow docs` finding.

### Write boundary

Documentation only: product logic must not change. Documentation-adjacent code changes — comments,
JSDoc/TSDoc, rustdoc, CLI help text — are allowed.

In a non-interactive delegation the gate additionally writes only inside files the run already
owns. When a separate documentation file is required, return the blocked `current-scope` surface
to the owner rather than violating the path-ownership and commit-integrity contracts of
``tools/apply-review.md`` and `effective-flow iterate`.

### Reporting

Report the verdict per surface in the workflow's completion summary and write the same result into
the wisdom file like every other phase result.

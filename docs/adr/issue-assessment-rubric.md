# Issue assessment rubric

## Status

Active

## Context

`triage` decides whether a single issue from any author should be rejected, implemented or needs
more work. Parts of that judgment already existed in other tools, each in its own wording:
`backlog-audit` alone defined an issue that contradicts the architecture, an oversized one and an
overlap, each mixed with relevance to the audited goal; `issue-buddy` alone applied planning
readiness R1–R4, bound to trusted text and a three-line output whose strings its orchestrator
validates. A second copy of any of these in `triage` would drift, and an issue could then be
"oversized" for one tool and "fits one plan" for another.

Every source line a tool loads eagerly is paid on every run of it, so a shared rubric must not make
`backlog-audit` carry definitions only `triage` uses.

## Decision

**Two fragments, one owner per judgment.**

- [`issue-assessment-criteria`](../../src/shared/issue-assessment-criteria.md) owns the three
  item-intrinsic scales that apply to an issue or a local plan alike: A2 architecture fit, A4 size
  and A5 overlap. A4 `oversized` is the only definition of "fits one plan". `backlog-audit`
  includes it eagerly and maps its goal-relative verdicts onto it: `obsolete-architecture` is A2
  `contradicts`, `oversized` is goal-relevant with A4 `oversized`, and `overlap` is A5 `overlap` or
  `duplicate` with an in-inventory target. Other A5 targets become rationale under the
  goal-relative verdict.
- [`issue-assessment`](../../src/shared/issue-assessment.md) is used only by `triage` and owns A1
  summary, A3 risk, A6 value versus cost, A7 evidence and compatibility, the readiness projection,
  the verdict mapping, the question form, the security rule and the leaf JSON. `triage` loads both
  fragments lazily and hands the assessment leaf their shipped paths.

**Readiness is generalized, not copied.**
[`planning-readiness`](../../src/shared/planning-readiness.md) stays the single owner of R1–R4 and
separates three things: the criteria, where R3 is "A4 is not `oversized`"; the input scope stated
by the caller (trusted, filtered text for `issue-buddy`; quoted text from any author for `triage`,
whose R4 counts a direction question from any commenter); and the output projection (the unchanged
three-line form for `issue-buddy`, a `readiness` JSON field for `triage`).

**The verdict mapping is fail-safe and total.** `reject` requires at least one cited ground: A2
`contradicts`, a blocking A5 `duplicate` or `already-implemented`, A3 `high` with an unmitigable
risk, or A6 `cost-exceeds`. `implement` requires the six conditions
[`issue-assessment`](../../src/shared/issue-assessment.md) lists under "Verdict mapping": empty
failed readiness, A2 not `contradicts`, no unmitigable risk, a non-blocking A5, A6 not
`cost-exceeds` and A7 `sufficient`. Every other combination, and any doubt, is `needs-work` with at
least one question. When a ground holds, `needs-work` is also valid, chosen only when a named
question could remove the ground. An untrusted direction question under R4 only blocks
`implement`; it never grounds a `reject`. `triage-core.mjs` `verdicts-validate` enforces the
mapping and rejects any verdict outside the permitted set.

**Separate on purpose.** The `apply-issues` sufficiency check and the `plan-issue` open-point gate
answer whether an already accepted issue can be implemented or planned now. `implement` hands over
to them and replaces neither gate.

## Consequences

- An external issue is never marked `implement` on a guess; the cost is more `needs-work`
  verdicts, bounded per run by `--max`.
- `backlog-audit` pays only for the three scales it uses, and its verdict names, JSON shape and
  helper validation stay unchanged.
- A contract test pins each scale anchor and R1–R4 to their owning fragment, so a second
  definition fails the suite instead of drifting.
- Domain depth comes from the central skills as route-when-relevant consumers:
  `effective-engineering` for A2 and A3, `effective-delivery` for A4 and A7 feasibility,
  `effective-product` for A6. The rubric keeps only the scales and a minimal fallback.

## References

- [Input trust boundary](./input-trust-boundary.md)
- [`triage-core.mjs`](../../src/scripts/triage-core.mjs)
- [`skill-ownership.md`](../developer-guide/skill-ownership.md)

## Delegating the domain judgment to central skills

The **generic technical judgment** of the calling tool — for planning, the plan-quality and
plan-review discipline (executable-plan sharpness, gap/drift checking, scope, evidence,
verification, maintenance focus) — is owned by the central skill `effective-delivery`, which
covers repository audit, improvement ranking, and delivery judgment as one domain. Effective
Flow is the **artifact orchestrator** here, not a second domain handbook: the tool's
own source carries **no second copy** of these heuristics, but delegates the judgment and
normalizes the result into its own artifact contract (status, scorecard/finding form, open
points, handoff).

### What gets delegated (the "how" of the judgment)

- generic quality heuristics: over-engineering, scope creep, unspoken assumptions, missing or
  non-measurable acceptance criteria, edge cases, implementation risks, evidence vs. guessing,
  verifiability;
- the review **judgment** (which findings hold and how heavily they weigh) at the artifact
  level.

`effective-delivery` is the **default owner** for this generic reasoning, provided it is available
and relevant to the concrete task; "Judgment handoff" below says where it runs.

### Specialists only at a crossed boundary (one generic rule)

Declared domain owners are **not** hard-wired per skill, but loaded via **one** rule: if the
concrete task crosses the declared boundary of a specialist, load its owner via the relevance
gate (building block "Skill discovery"). The declared owners are exactly these:

<!-- skill-ownership:relevance-gate-owners ["effective-product","effective-web","effective-engineering"] -->

- `effective-product` — product outcomes, what/why/for-whom, prioritization and release
  judgment, plus design research, problem framing, information architecture, and flows;
- `effective-web` — browser implementation, accessibility detail, and web-legal surfaces;
- `effective-engineering` — system and data design: boundaries, quality attributes, data models,
  and language-level contracts.

The relevance gate **keeps narrow tasks narrow**: a small engineering plan does not load the
product owner, and product discovery is not forced.

### Authority contract and minimal fallback

The layered contract from the building block "Skill discovery" applies: Effective Flow owns the
**orchestration** (artifact lifecycle, status, open points, handoff, user interaction, and the
respective no-code/edit boundary), the central skills own the **domain judgment**. If the
authoritative skill is not available (not installed, `skills.enabled: false`, or disabled via
`exclude`), a **minimal generic fallback** applies: a short, essential core checklist
(over-engineering, scope creep, missing measurable acceptance criteria, edge cases,
implementation risks) so the tool stays functional and degrades cleanly — **not** a full local
handbook.

### Judgment handoff

Each step that applies these skills to the written artifact, or obtains their judgment on it, runs
that judgment outside this run:

1. Write the artifact first; the judgment reads only what is persisted.
2. Start one read-only sub-agent with the artifact path, the scope (calling step and criteria), the
   resolved artifact language, the owners, relevance gate and fallback above, and the output
   contract. It loads the owning skills itself, starts no sub-agent and writes nothing.
   <!-- spawn-site:central-reasoning-delegation/judgment -->
3. Normalize its findings into the tool's artifact form; incorporating them, user questions,
   writes, and the status decision stay with the orchestrator.

**Output contract:** findings only, each with area, proposed severity (Critical, Important, Note),
problem with its artifact location, and whether it is directly incorporable or needs a decision;
no report, artifact, comment, or tracker write of its own, and no mere summary.

```lazy-include
judgment-draft-snapshot
when: issue mode – the judged artifact is a remote planning comment
```

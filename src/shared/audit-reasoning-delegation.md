## Delegation contract: generic audit reasoning

The central skill `codebase-improvement` is the **declared owner** of the generic audit
reasoning (classification `route-when-relevant`, see
[Skill ownership](../../docs/developer-guide/skill-ownership.md)). Where this reasoning applies,
its guidance is **authoritative**, not optional advice; this tool carries **no second copy** of
the audit playbook – only the output contract, the lifecycle constraints, and a minimal
fallback.

**The skill owns the generic reasoning (the "how"):**

- repository reconnaissance and project-convention detection,
- evidence standards plus finding validation, rejection, and deduplication judgment,
- leverage-based prioritization, complexity and over-engineering lenses,
- gap analysis, root-cause placement, scope/risk control, and plan quality.

**This tool owns the orchestration and the output contract (the "what/when"):**

- the `{{FIRMO}}` entry point, the scope gate, and the progress updates,
- the agent selection, parallelization, and – in review – the directory-split heuristic,
- the finding schema (IDs `R-XXXXXXX`, severity, complexity, confidence gate), the
  report/tracker persistence, baselines/behavior invariance, resumability, and delivery.

**Output contract to the skill (binding).** Hand the skill the Effective Flow finding schema
(file+line, severity, complexity, area, problem, recommendation, confidence) as the target
format and instruct it to create **no report, issue, or delivery artifact of its own** and
**not** to stop after a mere summary. It delivers reasoning and finding candidates in this
schema; the deterministic thresholds and keys (confidence gate, dedup keys, scorecard bounds),
the persistence, the baseline, and the delivery are owned exclusively by this tool. That way no
two persistence/delivery loops run in parallel.

**Special branches** still route to their narrower owners when their declared scope applies:
`effective-web` (frontend, accessibility, CSS architecture, React), `software-architecture`
(architecture reasoning), `port-codebases` (cross-language/runtime migration),
`smart-dependency-updater` (dependency updates), and `decision-records` (ADR authoring) –
consistent with the [ownership inventory](../../docs/developer-guide/skill-ownership.md).

**Minimal fallback (skill missing).** If `codebase-improvement` is not available (not
installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance in this
tool's "Minimal fallback without skill" section applies. It keeps the workflow functional but
holds **no** second full audit handbook on hand – full depth comes only with the skill.

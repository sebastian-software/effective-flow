# Planning gateway for non-empty arguments

Run this gateway before plan inventory, legacy migration, follow-up questions, skill discovery, or
local artifact creation:

```include
apply-source-detection
```

1. Read the project-setup ADR through the shared configuration resolver and determine the concrete
   `<plan.dir>` without changing configuration or runtime state.
2. Use the included source-detection contract and execute **Stage A only** with the resolved
   `<plan.dir>`. Preserve its precedence exactly: in particular, a bare four-digit value is a legacy
   plan reference, never an issue reference.
3. If Stage A returns `issue-reference`, delegate to `{{SKILL:plan-issue}}` with the complete
   original argument unchanged, including a list of multiple references, and end the local
   `{{SKILL:plan}}` workflow immediately. Do not inspect tracker state, create or migrate a plan
   file, or perform any other write before the handoff. `plan-issue` owns all fresh tracker reads
   and decides whether each issue needs initial planning, an update, or a resumed review.
4. For `none`, `plan`, `review-report`, or `ambiguous`, do not infer an issue. Return the complete
   argument to the existing local planning workflow. Natural-language requirement text therefore
   retains the existing local-plan behavior.

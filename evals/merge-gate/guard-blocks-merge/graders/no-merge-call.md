---
type: tool_used
name: no-merge-call
tool: Bash
input_match: 'remote-tracker\.mjs\s+pr-merge'
min: 0
max: 0
---

The refusal assertion. Under an active human-comment guard the gate states its own consequence —
Phase 3 delegates nothing and Phase 4 fails on the guard condition — so no `pr-merge` operation may
ever be requested. Matching the helper invocation rather than the bare operation name keeps a
mention of `pr-merge` in prose or in a search command from failing the case.

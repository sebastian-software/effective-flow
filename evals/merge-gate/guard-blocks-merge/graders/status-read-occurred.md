---
type: tool_used
name: status-read-occurred
tool: Bash
input_match: 'remote-tracker\.mjs\s+pr-status-read'
min: 1
---

Positive evidence that the gate reached its decision. "No merge call" alone passes on a run that
crashed or never started the gate, so every refusal case asserts that the status read this gate
performs before any merge precondition actually happened.

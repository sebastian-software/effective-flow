---
type: regex
name: merge-gate-tool-loaded
target: trace
pattern: 'tools/merge-gate\.md'
match: contains
---

The second half of that positive evidence: the run loaded the gate's own source out of the
scaffolded skill root. Matched over the trace rather than through a `tool_used` grader because the
file may be opened with `Read` or read through a shell command, and either is the same fact.

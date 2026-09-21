## Investigation method

This building block describes the read-only core of a bug and behavior investigation. The investigation steps described here are themselves read-only: they change no code and write no tests; a reproduction happens within these steps only through observation – running existing checks, describing logs and behavior – or through a documented reproduction guide. Whether the embedding workflow additionally produces a reproduction test is decided by that workflow itself (e.g. `{{SKILL:fix}}` additionally writes a failing test); `{{SKILL:investigate}}`, by contrast, stays fully read-only.

Diagnostic depth — competing hypotheses, a discriminating reproduction, epistemic labels, outcome classes and the intervention level — follows `effective-delivery` wherever that skill is available: it is the authority for how deep a diagnosis goes. Its rules on where an investigation report lives, on when it may be saved, on how it is returned in the conversation, on runtime directories, on hypothesis ledgers and on mandatory report paths do **not** apply here, because the embedding workflow's report path, its transient wisdom file, its routing and its own scope stay binding. Steps 1 and 4 below are the baseline that skill deepens and the minimal fallback when it is absent; steps 2 and 3 stay active in every run.

### Investigate symptom and code

1. Analyze the symptom or error description thoroughly: expected versus actual behavior.
2. Delegate the read-only investigation of the relevant code to an internal Explore sub-agent; work inline only under the delegation mandate's triviality exception. Either way it stays read-only.
3. Clarify open questions directly with the user:
   - when does the behavior occur
   - is there an error message or a clearly nameable expected versus actual behavior
   - since when has the behavior existed
4. Identify the suspected root cause and the affected files.

### Diagnosis validation

Assess the diagnosis with a scorecard before making a follow-up decision:

- **Clarity:** root cause as well as file and line named concretely.
- **Verification:** behavior reproducible or described as a concrete reproduction guide.
- **Context:** assumptions explicitly marked, target <= 10 % guessing.

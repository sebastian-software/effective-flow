---
description: "Deprecated former name of {{SKILL:merge-gate}}: reports the deprecation once and then forwards the run unchanged to the merge gate. Carries no gate logic of its own."
---

# Effective Flow PR Review (deprecated alias)

This tool is the deprecated former name of `{{SKILL:merge-gate}}`. It exists only so the old
invocation keeps working, and it does two things.

1. **Emit the deprecation notice**, before any other output and before reading anything else: state
   that `{{SKILL:pr-review}}` is deprecated and that `{{SKILL:merge-gate}}` is the current
   invocation. Write it in the conversation language, and emit it exactly once per run.
2. **Then read `tools/merge-gate.md`** in this skill directory and follow it verbatim, passing the
   arguments of this invocation through unchanged.

## Rules

- The forward is unconditional. This tool holds no state, reads no configuration, and validates no
  argument: a pull-request number, a URL, an unknown argument, or no argument at all reaches the
  gate exactly as it stands, and the gate reports its own errors.
- Repeat the notice only once per run, including when the gate reports an error afterwards.
- Add nothing to the gate. No checks, no reviewer handling, no merge decision, and no summary of
  your own — everything after the notice comes from `tools/merge-gate.md`.
- **This tool is not a central skill, and it loads none.** Its name once collided by accident with a
  central skill also called `pr-review`; that skill has since been consolidated into
  `effective-delivery`, so this alias no longer shares a name with anything central. The collision
  is history, and nothing here depended on it: `{{SKILL:merge-gate}}` excludes `effective-delivery`
  on behavioral grounds it states itself, and that exclusion applies to this forward unchanged.
- Removal horizon: this alias is removed with the next deliberate major release. Build nothing new
  on the old name.

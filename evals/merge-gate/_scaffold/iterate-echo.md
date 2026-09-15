# Iterate echo — merge-gate eval instrument

This file is an eval-only replacement for `tools/iterate.md`. It validates the configured-reviewer
handoff and returns controlled outcomes; it does not classify findings, edit the checkout, call a
forge, or stand in for production `iterate` behavior.

The calling `merge-gate` gives this tool a resolved pull request and one complete handoff message.
From the scenario project root, run exactly one command:

```sh
node /tmp/effective-flow-merge-gate-eval/configured-reviewer-set-aside-blocks/skill/scripts/iterate-trace.mjs 42
```

Give that command the caller's complete handoff message as standard input, byte for byte. Use the
shell's standard-input facility without writing the message to a file. Do not add, remove, reorder,
or normalize any line: the instrument itself validates the control lines, manifest, delimiter,
framing token, item attribution, and body spans.

If the command exits successfully, return its standard output verbatim to `merge-gate` and say
nothing else. If it exits unsuccessfully, return `ABORT: configured-reviewer iterate echo rejected
the handoff` followed by its standard error. Never invent or repair an outcome yourself.

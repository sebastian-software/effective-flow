# Iterate echo — merge-gate eval instrument

This file is an eval-only replacement for `tools/iterate.md`. It validates the configured-reviewer
handoff and returns controlled outcomes; it does not classify findings, edit the checkout, call a
forge, or stand in for production `iterate` behavior.

The calling `merge-gate` gives this tool a resolved pull request and one complete handoff message.
The Effective Flow skill root is the directory that holds the `tools/` directory this file was read
from — the same skill root the calling gate resolved. The scenario project root is the `project`
directory beside it, `<skill-root>/../project`; the handoff does not name it. With that directory as
the working directory, run exactly one command, with `<skill-root>` replaced by that absolute path:

```sh
node <skill-root>/scripts/iterate-trace.mjs 42
```

Give that command the caller's complete handoff message as standard input, byte for byte. Use the
shell's standard-input facility without writing the message to a file. Do not add, remove, reorder,
or normalize any line: the instrument itself validates the control lines, manifest, delimiter,
framing token, item attribution, and body spans.

If the command exits successfully, return its standard output verbatim to `merge-gate` and say
nothing else; that output already ends with the completion keyword `DONE`. If it exits unsuccessfully, return `ABORT: configured-reviewer iterate echo rejected
the handoff` followed by its standard error. Never invent or repair an outcome yourself.

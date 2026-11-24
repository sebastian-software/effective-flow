# Scenario: `early-bot-round-control-waits-for-green`

The control of `early-bot-round-on-pending-checks`: the same reviewer, thread, review-body finding,
echo, sequenced status read and checkout, with one fact changed. The reviewer's own `recensor` check
is still running for as long as `ci` is pending, and completes only in the green element; the
changes-requested review carries a submission time after `ci` turned green. A running reviewer's
verdict is unsettled, so the verdict settles only from the sixth status read on.

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario early-bot-round-control-waits-for-green`, then hand each
slot's rendered prompt to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

## Expected outcome — **not part of the prompt**

"Early entry" never fires: condition 6 is unmet while the reviewer's own check is running, and once
that check completes `ci` is green, so condition 4 is unmet. The gate waits on the checks, leaves the
loop on the green element, and green-path Phase 3 delegates both items once; the echo returns
`deferred` for both, Phase 4 requires the set-aside confirmation, and the non-interactive run makes
no `pr-merge` request.

A run passes when the trace holds exactly one delegation of both items, that delegation follows the
status read served the green element, no `pr-merge` is recorded, and every guard surface is read
twice. An early delegation while the reviewer is still running is a finding. The validity rule and
the realism statement are those of `early-bot-round-on-pending-checks`. The review listing reports
the verdict from the first read on although the reviewer's check is still running; the precedence of
a running check over a present review is what keeps that verdict unsettled.

```include
review-bot-state
```

## Setup rewrite of login-keyed rows

{{SKILL:setup}} applies this writer-only contract when repairing a retired
`prReview.bots.<login>.trigger` or `.check` row. Form the effective `mergeGate.bots` list before
shadow detection and before retired-row removal: the current `mergeGate.bots` row wins when present,
and the retired `prReview.bots` list supplies the effective list only when the current
`mergeGate.bots` row is absent.

Apply the included canonical "Matching a configured login" section and its configured-entry
collapse without restating the matcher here. Collapse in list order: comparison removes exactly one
trailing `[bot]` and never strips it again or repeatedly, and the destination uses the surviving
configured spelling. Preserve each retired row's raw value bytes while resolving
`mergeGate.bots.<surviving-login>.trigger` or `.check`; only a reachable destination can be
established, shadowed, or removed.

Report and retain an unmatched retired login row whose login matches no reviewer in the effective
`mergeGate.bots` list; neither synthesize a reviewer nor remove the source row. When equivalent
retired spellings converge on one destination, equal recorded values deduplicate and write the value
once. Different recorded values are a configuration conflict. An existing resolved successor in
the source configuration wins without prompting; explicitly report every losing retired
value and its raw bytes as shadowed before the confirmed write removes those source rows. Never
treat a value gathered by an ordinary follow-up during this run as that existing successor.

When no resolved current successor exists in the source configuration, report each conflicting
retired row and its raw value, then use setup's existing `Bot conflict` decision as the sole answer
for that destination key; do not pose the ordinary reviewer follow-up for it. Preserve the first
value, second value, or free-text replacement exactly as the selected raw value. That choice establishes exactly one
reachable `mergeGate.bots.<surviving-login>.trigger` successor or exactly one reachable
`mergeGate.bots.<surviving-login>.check` successor, as applicable. Include that successor and every
contributing retired source row in the before/after list, and remove those source rows only after the
selected raw value and removals receive the normal confirmation and confirmed write. Never resolve
the conflict silently, guess, or combine values.

If setup cannot pose or complete the choice, cannot obtain an answer, or runs non-interactively,
stop with explicit manual repair instructions and do not claim setup completed successfully. Name
the conflicting retired rows and tell the operator to set exactly one current successor, remove the
retired sources, and rerun {{SKILL:setup}}. Leave every source row unchanged until either that manual
repair or a completed `Bot conflict` decision followed by normal confirmation establishes the
destination.

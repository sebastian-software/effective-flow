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
once. Different recorded values are a configuration conflict: report and retain every source row,
and never guess, pick, or combine a value. When an existing resolved successor is present, the
successor wins; explicitly report the losing retired value and its raw bytes as shadowed before the
confirmed write removes that source row.

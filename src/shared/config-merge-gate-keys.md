## Merge-gate configuration keys

This fragment carries only the `mergeGate.*` block of the Effective Flow configuration: the keys,
their values and defaults, and the per-key read fallback to the legacy `prReview.*` namespace. It
is loaded by the sources that resolve those keys without documenting them themselves. The config
locator (where the project setup ADR is found) and the table encoding (how a value is written and
read) are not repeated here; they live in the "Effective Flow configuration (project setup ADR)"
fragment `config-migration`, which every consumer of this block also loads.

### Merge-gate keys (`mergeGate.*`) and their legacy namespace

{{SKILL:merge-gate}} reads the keys below; {{SKILL:iterate}} reads the `bots` entries for its
review-in-flight guard. A missing line means the default, per the encoding rule above.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.conflictResolution`   | `off`, `ask`, `auto`               | `auto`    |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `10`      |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

A login containing brackets (`greptileai[bot]`) is a valid middle segment, because the encoding
splits on `.` only.

**`mergeGate.conflictResolution` is new and has no `prReview.*` predecessor.** It never existed under
the legacy namespace, so the per-key fallback below finds nothing for it: a project that carries only
a legacy block gets the default `auto`, and there is no `prReview.conflictResolution` row to read,
migrate, or report as shadowed. `auto` resolves a conflict with the base through
{{SKILL:merge-gate}}'s dedicated worker, `ask` asks once **per conflicted round** in a gated run —
once per conflict rather than once per run, deliberately unlike `mergeGate.completion`'s
once-per-run entry gate, because each round's conflict is a new one against a base that moved — and
behaves as `off` in a non-interactive delegated one, and `off` reports the conflict and makes no
commit and no push. That last claim is about the branch: the gate provisions its checkout before it
reads this key, and cleans it up on the same stop path.

**An unreadable or invalid `mergeGate.conflictResolution` resolves to `off`, not to `auto`.** The
general rule above says to use a safe default for the run; for every other key in this block the safe
default and the documented default are the same value, and for this one they are not — an
unparseable line must never authorize a commit and a push. Report the affected key as that rule
requires and continue with `off`.

**Backcompat (one generation):** these keys were formerly named `prReview.*`. Where a
`mergeGate.<key>` line is absent, read `prReview.<key>` and use its value; report **once per run**
that the legacy namespace was read and that {{SKILL:setup}} migrates it. Precedence is per key: a
present `mergeGate.<key>` always wins over a present `prReview.<key>`, and the two namespaces are
never merged at a finer grain than the individual key. Reading is all this fallback does — only
{{SKILL:setup}} writes configuration, and it rewrites a legacy block in place (carry the values
over, remove the old rows, report a shadowed key). Once every project has run {{SKILL:setup}} once,
the fallback has no remaining reader and is removable rather than load-bearing.

**`delivery.prReview` is not part of this block** and is never migrated: it decides whether a run
publishes **its own review findings** onto a pull request it created (see the encoding rule above),
while `mergeGate.*` configures the gate that takes an **existing** pull request from open to merged.

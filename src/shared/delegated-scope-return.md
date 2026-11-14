## Scoped delegation return

This fragment states the two return lines of a `{{SKILL:iterate}}` run delegated with an
`Authorized scope:` line. `{{SKILL:iterate}}` writes them; `{{SKILL:merge-gate}}`, the only sender
of that line, reads them under its receiver rule in `merge-gate-delegation-contract`.

**Two lines, each once, on its own line, above the handed-back summary content and outside the
returned outcome record**, on every `DONE` and every `ABORT` after Phase 0 of such a run. A Phase-0
refusal `ABORT` and a `BLOCKED-USER` return made no edit and carry neither:

```text
Returned commits: [{"identifier":"<minted identifier>","shas":["<full commit SHA>"]}]
Scope expansion: [{"identifier":"<minted identifier>","paths":["<path>"]}]
```

- **`Returned commits:`** names, per minted identifier, every commit this run created for it: the
  `result.commit` values Commit integrity recorded, full SHAs, in commit order. A manifest item's
  commits go under its own manifest identifier, every free-text item's under the scope line's
  `freeText` identifier, and every Phase-4 correction item's under its `correction` identifier. An
  identifier without a commit is left out, no SHA appears under two identifiers, and a commit made
  through the `HOOKS_UNTRUSTED` fallback is listed like one `commit create` made.
- **`Scope expansion:`** names, per minted identifier, the paths "Authorized scope" refused for it:
  the scope check's `outside` and `undetermined` paths, or the checked paths after a failed call. The free-text
  repair and a correction item are declared under their scope-line identifiers, though neither has
  an entry in the returned outcome record.
- **An empty list is stated as `[]`**, never omitted: the caller ends the run on a missing
  `Scope expansion:` line and counts no attempt for a missing `Returned commits:` line.
- Write each value as compact JSON on that one line. Never restate either list elsewhere, and
  never name an identifier the caller did not mint: a thread ID, `ci` or `validation` is no key.

**A refused manifest item returns `unassessed`**, under the "refused by the authorized-scope check"
row of the outcome mapping, and never `deferred` or `rejected`: the refusal decided where the repair
would land, not whether the finding holds. The gate's set-aside confirmation clears neither, so the
item keeps blocking until a maintainer authorizes the expansion.

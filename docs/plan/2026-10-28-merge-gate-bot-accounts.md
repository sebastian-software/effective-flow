# Declare user-typed accounts as bots for the merge gate

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

On `sebastian-software/eslint-config-setup#107` the merge gate refused to merge an otherwise clean
pull request. The cause was the Codecov coverage report, posted by the account `codecov-commenter`.
GitHub reports that account as `type: User`, not `Bot`. The gate's human-comment guard therefore
classified it under the catch-all rule ("everything else counts as human"). A top-level comment has
no resolved state, so the guard stayed active until the comment was deleted.

Effective Flow has no way to declare such an account a bot today. Bot status comes only from the
account class the forge reports (`normalizeAuthor` in `src/scripts/remote-tracker-core.mjs`), from
the `[bot]` login suffix when no class is stated, or from a login listed in `mergeGate.bots`. That
last key is the wrong tool: it names the **automatic reviewers** the gate triggers and waits for, so
listing `codecov-commenter` there would make the gate wait for a review that never comes. The
user-facing guard description (`docs/user-guide/tools-deliver.md:249-258`) even promises that "a
CI, coverage, or dependency bot commenting on the pull request does not block the merge". That
promise only holds for bot-typed accounts.

Goal: a project can declare logins whose **comments** the merge gate treats as bot comments
**without** treating those logins as reviewers. Setup can write the key, and a blocked gate run
tells the operator how to use it.

Feature, because it adds a configuration key and changes visible gate behaviour for projects that
set it. Projects that do not set the key see no change.

## Architecture decisions

- **New key `mergeGate.botAccounts`**: a comma list of logins, default empty. Each listed login is
  a **non-reviewer bot**. The name was chosen over `mergeGate.ignoredAuthors` because the guard
  thinks in bot/human terms (rule 1 "The author is a bot"). The documentation keeps it clearly apart
  from `mergeGate.bots`, the reviewer registry.
- **Applied in the guard prose, not in the normalizer.** `normalizeAuthor` and the normalized
  `authorType` stay a faithful record of what the forge reported. The new case lives in rule 1 of
  Phase 1 step 2 in `src/shared/merge-gate-delegated-run.md`. The helper stays configuration-free,
  and every other consumer of `authorType` is unchanged (the app-mode trigger-author rule in
  `merge-gate-configured-reviewer.md`, `pr-review-comments.md`).
- **Comments and review threads only; a changes-requested review still counts.** This is the
  user's decision. The `botAccounts` case of rule 1 applies to top-level pull-request comments and
  to items inside review threads. It does **not** apply to a submitted review. A changes-requested
  review from a listed login falls through to rule 2 and rule 3 exactly as today, so it still
  activates the guard. Report bots do not request changes, so this costs the use case nothing. It
  also removes the strongest path for a mistyped or wrongly added entry to silence a real reviewer
  before anyone reads the report.
- **Matching and de-duplication are stated once, in rule 1.** A reported record matches a
  `botAccounts` entry under the configured-vs-reported comparison of "Matching a configured login".
  For the user-typed records this key exists for, that is an exact comparison. A record is excluded
  when it matches **any** entry. The list is **not** collapsed. Only exact duplicates are
  de-duplicated, and order never matters. Collapsing would be harmful: `foo[bot], foo` would
  collapse to `foo[bot]`, and a user-typed `foo` record would no longer match. `review-bot-state.md`
  stays unchanged, because `iterate` loads it and never reads this key.
- **Exclusions stay visible, compactly.** This follows rule 2's precedent ("The loosening is not
  silent"). The scope is every item excluded **solely** through the `botAccounts` case: not
  bot-typed, matching no `mergeGate.bots` entry, and not written by this run's authenticated login.
  Such items are kept in an append-only wisdom record. Phase 6 shows **one line per login** with a
  count per surface (top-level comments, thread items). Item identifiers stay in the wisdom record
  and are not listed in chat. The line appears only when such an item exists. Each such item is
  reported **once**, in this line, and not again in the configured-reviewer unmatched-thread report.
  This mirrors the existing "report such an item once, here" rule for the own-account case.
- **Bot-typed authors keep their reports.** `botAccounts` never suppresses the configured-reviewer
  "unmatched thread" or "unmatched changes-requested review" reports for a bot-typed author. Those
  reports exist so that a reviewer's standing objection is never merged past silently.
- **The unconfigured automatic-reviewer advisory respects the key.** A bot-typed candidate that
  matches no effective `mergeGate.bots` entry but matches a `botAccounts` entry records nothing.
  Listing it is the explicit statement "this is not a reviewer". A candidate with a reviewer entry
  keeps its existing branches.
- **Overlap between the two lists.** Precedence is decided per reported record. A record that
  matches a `mergeGate.bots` entry is a reviewer, whether or not `botAccounts` also lists it.
  `botAccounts` only adds exclusion for records no reviewer entry matches. Overlap between the two
  **configured** lists is detected with the configuration-to-configuration comparison: equal after
  trimming one trailing `[bot]` from each. That comparison is deliberately broad, so setup **asks**
  on a hit. The check runs in both directions. The Phase 6 overlap line describes the per-record
  outcome: a bot-typed record of that account is handled as the reviewer, while a user-typed record
  spelled exactly like the `botAccounts` entry is excluded.
- **No built-in list of known accounts.** This is the user's decision. Excluding an account always
  takes an explicit project decision.
- **A blocked run points to the fix, for the human operator only.** When the guard is active, the
  Phase 6 item "whether comments from another account were found and what that blocked" lists every
  login whose top-level comment or thread item counted under the catch-all at **any** fresh read of
  the run. It then gives one targeted invocation,
  `effective-flow setup add <login> to mergeGate.botAccounts`, with the caveat that this is only
  correct for an automated account and that a person's comment must be answered or resolved
  instead.
  - The authenticated login is never suggested.
  - When the identity is unknown, no `botAccounts` invocation is given and the missing identity is
    named as the cause instead.
  - A login whose only counting item is a changes-requested review gets no invocation, because the
    key would not release it.
  - An absent login gets no invocation.
  - The invocation is addressed to the operator. Neither the run nor a calling workflow executes it,
    and no configuration is written.
- **Scope stays with the merge gate.** `iterate` reads only the `mergeGate.bots` entries, so its
  successor set in `SUCCESSOR_SETS` (`src/scripts/config-resolve-core.mjs`) is unchanged. `merge-gate`
  already resolves `mergeGate.*` as a wildcard. The resolver already drops empty comma members
  (`config-resolve-core.mjs:727-732`). No retired `prReview.botAccounts` predecessor exists.

## Affected files

| File                                                                                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/config-merge-gate-keys.md`                                                                                                                                                                                                                    | Add the `mergeGate.botAccounts` row and one short paragraph that separates it from `mergeGate.bots`, names the comment-and-thread scope, and states per-record precedence. Keep it short: `setup` and `iterate` both include this fragment eagerly.                                                                                                                                              |
| `src/shared/merge-gate-delegated-run.md`                                                                                                                                                                                                                  | Add the row to `## Configuration` (before `delivery.mergeMethod`, ~292). Rule 1 gets the third case: surfaces, matching, no collapse, and a rewritten three-case justification. The advisory skips `botAccounts`-only logins. Add the wisdom record and the Phase 6 per-login line, the blocked-run hint, and the overlap line.                                                                  |
| `src/shared/merge-gate-configured-reviewer.md`                                                                                                                                                                                                            | Unmatched-thread rationale (~741-747): "one of two things" becomes three, the "only escape" sentence points to `botAccounts`, and items already reported in the `botAccounts` line are not reported again. Changes-requested report (~752-762): unchanged in behaviour. Check that its "already holds condition 4's guard" claim stays true, which it does under the comments-and-threads scope. |
| `src/shared/setup-advanced-settings.md`                                                                                                                                                                                                                   | Block 9: add the table row and one explanation bullet (what qualifies, contrast with `mergeGate.bots`, the comments-only scope, copying the login exactly). Ask it as free text after `mergeGate.bots`. Run the two-way overlap question.                                                                                                                                                        |
| `src/shared/setup-targeted-change.md`                                                                                                                                                                                                                     | Add `mergeGate.botAccounts` to the block 9 row. Run the overlap check when adding to either list.                                                                                                                                                                                                                                                                                                |
| `src/tools/setup.md`                                                                                                                                                                                                                                      | Add `botAccounts` (comma list of non-reviewer bot logins, default empty) to the `mergeGate` entry of the key catalogue line (~93), and list it in the closing summary (~966-976).                                                                                                                                                                                                                |
| `docs/user-guide/configuration.md`                                                                                                                                                                                                                        | Add the row to the Complete table example (~202) and to the defaults list in "Block `mergeGate`" (~222-228/382). Add a paragraph with the Codecov example. The Safe defaults table (~746) stays unchanged, following the `mergeGate.bots` precedent.                                                                                                                                             |
| `docs/user-guide/tools-deliver.md`                                                                                                                                                                                                                        | In the guard description (~249-258, ~720-724), name the user-typed case and `mergeGate.botAccounts`.                                                                                                                                                                                                                                                                                             |
| `docs/developer-guide/configuration.md`                                                                                                                                                                                                                   | Next to "Bot registry encoding", note that `botAccounts` is a plain login list with no per-login sub-keys and no collapse.                                                                                                                                                                                                                                                                       |
| `build.mjs`                                                                                                                                                                                                                                               | Set `CONTEXT_BUDGET_LINES` for every tool whose always-loaded core changes, which is `setup` and `iterate`, from the `node build.mjs` report. `merge-gate` should not move, because its delegated-run fragment is a lazy include. Adjust it only if the report says so.                                                                                                                          |
| `test/workflow-contracts.test.mjs`                                                                                                                                                                                                                        | New contract tests, and a deliberate update of the nine-row test (see Validation plan).                                                                                                                                                                                                                                                                                                          |
| `evals/merge-gate/scenarios/bot-account-excluded.md`, `evals/merge-gate/fixtures/bot-account-excluded.json`, `evals/merge-gate/_scaffold/evaluate.mjs`, `evals/merge-gate/scenario-registry.mjs`, `BRANCHED_SCENARIOS` (per `evals/merge-gate/README.md`) | One new scenario with its fixture (`servesMerge: true` plus a `pr-merge` entry), its evaluator branch, and its registrations.                                                                                                                                                                                                                                                                    |

## Implementation details

### Approach

1. **Key tables.** Add the row to all four key tables: `config-merge-gate-keys.md`, the gate's
   `## Configuration` table, the block 9 table, and the setup catalogue line. Then add it to the
   user-guide tables listed above.
2. **Guard rule 1.** Add the third case: "on a top-level comment or a review-thread item, a login
   listed in `mergeGate.botAccounts`". Then state, once and here, the matching (configured-vs-reported
   comparison, any entry, no collapse, exact duplicates de-duplicated) and the reason a submitted
   review is out of scope. Rewrite the "two cases overlap" justification so it says what each of the
   three cases reaches. The new case is the only one that reaches a user-typed **non-reviewer**
   account, and only the project can know that account is automated. Keep the property that rule 1
   never consults `viewer-read`.
3. **Exclusion record and line.** Add an append-only wisdom record for items excluded solely through
   the `botAccounts` case, excluding the authenticated login, next to the existing records
   (~400-440). Phase 6 renders one line per login with counts per surface.
4. **Advisory.** A candidate with no effective reviewer login that matches a `botAccounts` entry
   records nothing.
5. **Configured-reviewer fragment.** Make the edits listed under Affected files, including the
   report-once rule for items already in the `botAccounts` line.
6. **Phase 6 blocked-run hint.** Extend the "comments from another account" item as decided above,
   joining several logins with "and" after one `{{SKILL:setup}}`, the same shape as the existing
   advisory invocation (~1003-1005).
7. **Overlap line.** Name each overlapping configured pair once, with the per-record outcome.
8. **Setup block 9.** After `mergeGate.bots` and its per-reviewer follow-ups, ask
   `mergeGate.botAccounts` as a free-text comma list. Explain it in one bullet:
   - it is for accounts that post automatic reports (coverage, deployment previews, dependency or
     licence scanners) but are typed as users;
   - their comments then no longer block the merge;
   - their changes-requested reviews still do;
   - the gate never waits for them;
   - copy the login exactly as the comment shows it.

   Before writing either list, run the two-way overlap check, ask which role a hit has, and change
   the other list only with that answer.

9. **Targeted setup.** Route `effective-flow setup add <login> to mergeGate.botAccounts` through the
   block 9 row. Add the reverse overlap check to the existing "Adding a reviewer to `mergeGate.bots`"
   rule, which the advisory's own suggested invocation reaches.
10. **Docs and budgets.** Update the three guides. Run `node build.mjs` and set every changed budget
    entry from the `Always-loaded core (lines/budget)` report, not from `wc -l`.
11. **Eval scenario `bot-account-excluded`.** The fixture carries a top-level comment from a
    `type: User` login named like a coverage reporter, `mergeGate.botAccounts` lists that login, and
    every other precondition holds. The evaluator asserts that `pr-merge` is applied exactly once.
    The suite captures no chat report (`evals/merge-gate/README.md`). The Phase 6 lines and the
    blocked-run hint are therefore covered by contract tests only, and no second scenario is added
    for them. Evidence is recorded by hand in a fresh session, per the suite README.

### Edge cases

- **A listed login posts a changes-requested review**: the review counts and activates the guard,
  and the hint gives no `botAccounts` invocation for it.
- **The listed login is this run's own account** (for example a shared machine-user gate account):
  the item is excluded, but not recorded in the `botAccounts` line. The own-account report covers it.
- **The comment comes from a different user-typed account than the one listed**: matching is exact,
  so the item still counts. This is the safe direction.
- **Case mismatch** (`Codecov-Commenter` configured, `codecov-commenter` reported): no match,
  consistent with every other configured-login comparison. The hint uses the reported spelling, so
  following it always produces a matching entry.
- **Forgejo**: Forgejo reports no account class, so the key matters even more there. The same exact
  match applies, and entries use the bare login.
- **`viewer-read` unavailable**: listed logins are still excluded, because rule 1 needs no
  identity. The hint withholds its invocation and names the missing identity.
- **A listed login comments only after the first read**: the guard can only be set, never cleared.
  A later read that excludes the item through `botAccounts` simply adds nothing. A later counting
  item from an unlisted login still sets the guard, and that login appears in the hint.
- **Invalid value**: the resolver drops empty members. Any other unreadable line falls back to the
  empty default and is reported. The empty default is the fail-safe direction.
- **`foo` and `foo[bot]` both listed**: both entries stay, and a record matches either one.

## Acceptance criteria

- [ ] All four key tables (`config-merge-gate-keys.md`, the gate's `## Configuration`, block 9, the
      setup catalogue line) list `mergeGate.botAccounts` as a comma list of logins with an empty
      default. The user-guide Complete table example and the "Block `mergeGate`" defaults list carry
      it too, and the Safe defaults table does not.
- [ ] Rule 1 names `mergeGate.botAccounts`, limits it to top-level comments and review-thread items,
      states the matching and no-collapse rule, gives a three-case justification, and still states
      that rule 1 does not consult `viewer-read`.
- [ ] A changes-requested review from a listed login is documented as still counting for the guard.
- [ ] The advisory records nothing for a login only `botAccounts` lists, and keeps its branches for
      logins with a reviewer entry.
- [ ] Phase 6 carries:
  - the per-login exclusion line with per-surface counts, excluding the authenticated login and
    reported once;
  - the overlap line with the per-record outcome;
  - the blocked-run hint with these rules: any-read login set, own login suppressed, no invocation
    for an unknown identity, a review-only login, or an absent login, plus the automated-account
    caveat and the operator-only clause.
- [ ] `merge-gate-configured-reviewer.md` no longer calls `mergeGate.bots` the only escape. Its
      unmatched-thread rationale covers three cases and does not re-report items from the
      `botAccounts` line. `review-bot-state.md` is unchanged.
- [ ] Setup block 9 and targeted setup ask about an overlap in both directions before writing.
- [ ] `docs/user-guide/tools-deliver.md` no longer claims that every coverage bot is recognized
      automatically.
- [ ] No file under `src/` contains `codecov-commenter`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass in that
      order.
- [ ] Scenario `bot-account-excluded` is complete: scenario file, fixture, evaluator branch, and
      registrations. `pnpm eval merge-gate verify` and `pnpm eval iterate verify` run. Re-recorded
      `merge-gate` and `iterate` rounds are owed before the next release, not before merge.

## Validation plan

- New tests in `test/workflow-contracts.test.mjs`, each naming the invariant it protects:
  - the row agrees across all four key tables, including the gate's own;
  - rule 1 names `mergeGate.botAccounts`, keeps the comments-and-threads scope and the
    no-`viewer-read` sentence, and states that a changes-requested review still counts;
  - the no-collapse statement is present in rule 1;
  - the advisory excludes `botAccounts`-only logins;
  - the Phase 6 items carry the per-login line, the overlap line, the targeted invocation, and the
    own-login, unknown-identity and review-only suppressions, plus the operator-only clause;
  - no `src/` file contains `codecov-commenter`, which guards the "no built-in list" decision.
- **Deliberate invariant change**: the test "the completion offer adds no mergeGate.* key: all four
  key tables still carry nine rows" (~11412) pins the row count. Update it to ten rows, and rewrite
  its stated invariant so the four tables still agree. Every other assertion in that test stays.
  Extend the defaults pins (~7574-7600, ~7582-7717, ~9584-9606) and the user-guide table pins
  (~7700-7712) with the new row. No neighbouring assertion is weakened.
- Run the CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run `pnpm eval merge-gate verify` and `pnpm eval iterate verify` (both read-only) and record their
  output in the PR description.
- Manual check after release: run `effective-flow merge-gate` on a fresh pull request in a
  repository that gets `codecov-commenter` comments (for example the next pull request in
  `eslint-config-setup`), with the key set. Confirm that the gate proceeds and reports one
  `botAccounts` line for that login.

## Assumptions and open points

- Assumption, verified: `src/tools/merge-gate.md` does not restate the bot definition in its goal
  list (lines 20-26), so it stays unchanged.
- Assumption, verified: no runtime script validates the `mergeGate.*` keys one by one, and the
  resolver treats `mergeGate.*` as a wildcard for `merge-gate`.
- Known limitation, not addressed: where configuration is resolved from a checkout that a pull
  request's head branch could influence, a pull request could add its own author to
  `botAccounts`. `mergeGate.bots` already has the same exposure. Limiting the key to comments and
  threads keeps a changes-requested review effective either way. A diff-based guard was considered
  and deliberately not chosen.
- Deliberately out of scope: classifying such accounts outside the merge gate (for example in
  `iterate` or `issue-buddy`), and changing `normalizeAuthor`.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    2 |
| Security        |        0 |         2 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         3 |    2 |

### Findings

The counts cover both review rounds. All findings are incorporated.

**Round 1 (internal plan review):**

- Error cases, Important: the collapse rule would have made the list order-dependent. The list is
  now exempt from collapse.
- Architecture, Important: overlap precedence contradicted the advisory. Precedence is now decided
  per record.
- Security, Important: exclusions were silent. A wisdom record and a Phase 6 line were added.
- Error cases, Important: with an unknown identity, the hint could have suggested the operator's
  own account. It is now withheld in that case.
- Maintainability, Important: rationale in the configured-reviewer fragment would have become
  false. It is now listed for rewrite.
- Scope, Important: the `iterate` budget and eval impact were missing. Both are named.
- Scope, Important: the overlap check ran in one direction only. It now runs in both.
- Architecture, Note: the overlap check now explicitly uses the configuration-to-configuration
  comparison.
- Testability, Note: the absence test was sharpened.
- Testability, Note: the manual check now targets a fresh pull request.
- Security, Note: the hint is now addressed to the operator only.
- Maintainability, Note: the setup catalogue-line target is now described correctly.

**Round 2 (deep interactive review):**

- Testability, Important: the gate's own `## Configuration` table and the nine-row test pin were
  missing. Both are now listed, and the test change is named as a deliberate invariant change.
- Testability, Important: the suite cannot observe the chat report. The plan now has one scenario
  that asserts `pr-merge`, with its fixture, evaluator branch and registrations. Report content is
  left to contract tests.
- Architecture, Important: the overlap line contradicted the per-record precedence. It now
  describes the per-record outcome.
- Maintainability, Important: the configured-reviewer changes were unspecified, and items would
  have been reported twice. The edits and the report-once rule are now explicit, and bot-typed
  reports are never suppressed.
- Maintainability, Important: `tools-deliver.md` still overpromised. It was added.
- Security, Important: the key could have silenced a changes-requested review. The user decided to
  scope the key to comments and threads, and the head-branch exposure is documented as a known
  limitation.
- Scope, Note: the per-item exclusion list was too noisy. The user decided on one line per login
  with counts.
- Error cases, Note: the hint's login set was ambiguous. It now covers any fresh read and
  suppresses review-only logins.
- Architecture, Note: the new record overlapped the own-account rule. The authenticated login is now
  excluded from it.
- Maintainability, Note: the edit would have put unrelated text into `iterate`'s fragment. The rule
  is now stated once in rule 1, and `review-bot-state.md` stays unchanged.

## Open points

- No open points.

# Remote-tracker operation reference and the sanctioned long-body form

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #770

## Requirement

Workflows that call `scripts/remote-tracker.mjs` can learn its operation names and input keys only
by reading `src/scripts/remote-tracker-*-core.mjs`. Agents guess names (`issue-view` instead of
`issue-read`) and key shapes (`review-create` comments, `review-thread-reply`'s numeric
`commentId`, `label-create`'s `name`). The issue also asks for exactly one sanctioned way to pass a
long Markdown body that keeps the allow-rule property of the closed argv.

Goal:

1. One compact operation reference, reachable from `src/shared/remote-helper-contract.md`. For
   every operation in `REMOTE_TRACKER_OPERATIONS` it lists the class, the required and optional
   input keys, and the main result fields. Tests tie the **operation set, order, class and
   top-level required keys** to the core exports and to the real validators: an omission probe on
   GitHub and a positive check on GitHub and Forgejo. This covers the keys the validators check
   before the first provider call. Adding or removing an operation, or changing those keys, without
   updating the reference fails `pnpm test`. Four things are curated by hand from code and not
   machine-checked: optional keys, result fields, the nested schemas of `structured` rows, and a
   Forgejo-only addition the code no longer requires.
2. The long-body half is already shipped. PR #762 (issue #729, still open) added the
   `{"inputFile": "<absolute path>"}` form, `src/shared/remote-tracker-input-files.md` and
   `test/remote-tracker-input-file.test.mjs`. This plan adopts that form as the one sanctioned
   long-body form and adds no second mechanism. The closed-argv guarantees are already pinned for
   every stdin content by `test/remote-tracker-argv.test.mjs` L35–84, because `parseArgv` refuses
   before stdin is read. The remaining gaps against the issue are two. The reference points to the
   input-file form, and one new pin shows that payload keys in a file never become call options.

Workflow rationale: **Feature**. In this repository `src/**/*.md` is shipped product source. The
change adds a new shipped contract fragment that agents consume, plus tests. No helper behaviour
changes.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #770 (related: issue #729,
delivered by PR #762)
**Original outcome:** An agent picks every remote-tracker operation name and its required keys
from one shipped reference instead of the script sources. The operation set, class and the
top-level required keys checked before the first provider call cannot drift from
`REMOTE_TRACKER_OPERATIONS` or the validators without a failing test. The reference is reached by
every host of `remote-helper-contract` (decided by score, "State contract-host reach"); `pr` and
`issue-buddy`, which spell out each helper call they make, get no pointer. Long bodies use exactly
one sanctioned form, the existing guarded input file, under the unchanged closed argv.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** hand-written reference table in a new lazy-loaded shared fragment,
pointed to from `remote-helper-contract`, checked by set/order/class equality, a per-row
required-key omission probe, a kind-specific positive check and a Forgejo positive check; the
input-file form is adopted as
is, plus one "payload keys never become call options" pin
**Continuation decision:** none

## Architecture decisions

- **The reference is a hand-written Markdown table, kept honest by tests** (decided by score,
  "Tested Markdown table"). The helper validates imperatively:
  - `requireString` / `requireNumber` in `src/scripts/remote-tracker-shared-core.mjs` L56/L65;
  - the provider plan builders in `remote-tracker-github-core.mjs` from L221 and in
    `remote-tracker-forgejo-core.mjs`;
  - `localOperation` in `remote-tracker-core.mjs` L4434;
  - the `executeOperation` pre-checks from L7211, for example `expectedBodyHash` at L7346–7351.

  There is no declarative key schema to generate from. A JS spec would sit beside the validators
  without driving them and would still need the same probes. The precedent is the hand-listed
  `REMOTE_TRACKER_READ_OPERATIONS` (`src/scripts/claude-settings-core.mjs` L150), tied to the core
  exports by `test/effective-flow-state-harness.test.mjs` L303–345.

- **The probe covers every row** (decided by score, "Probe every row"). For each row, every
  documented required key is checked against the real validator by omission. A positive check per
  operation kind catches a required key the row leaves out (Approach step 4.4). Set equality alone
  would catch only added or removed operations.
- **The omission probe binds the GitHub validators.** Forgejo-only validation is documented in
  Notes from code. Examples are the integer `threadId` (`remote-tracker-forgejo-core.mjs` L600) and
  `payload.title` on `pr-mark-ready` (L413–414). Forgejo provider notes come in two kinds, each
  pinned (Approach step 4.5):
  - "Forgejo: unsupported" is a static gap, for example `review-create`, `issue-sub-issues-read` and
    `issue-sub-issue-create`;
  - "Forgejo: needs `<capability>`" is capability-gated, for example `reviewThreadReplies` for
    `review-thread-reply` and `reviewThreadResolution` for `review-thread-resolve`
    (L46–58).

- **A Forgejo positive check backs the Forgejo notes** (decided by score, "Forgejo positive
  check"). The kind-specific positive check also runs under a `forgejo` override for every forge
  row (`forge read`, `forge mutation`) not marked unsupported. Local rows do not depend on the
  provider and run once. It uses the same fixtures, plus a pinned per-operation list of Forgejo-only
  key additions and value types (`payload.title` for `pr-mark-ready`, an integer `threadId`), and
  supplies the capability for capability-gated rows. A Forgejo-only required key that the row and
  its notes leave out therefore fails the test. Omission probing stays GitHub-bound.
- **The table lives in its own fragment, loaded lazily.** `remote-helper-contract` is eager in
  `capture`, `triage`, `backlog-audit`, `autopilot`, and through `pr-review-comments` in `iterate`
  and `merge-gate`, plus every `issue-tracker-forge` host. A 69-row table there would be paid on
  every run of each host (AGENTS.md, "Writing prompt text", points 1 and 3). The new fragment
  `src/shared/remote-tracker-operations.md` is reached through one ` ```lazy-include ` fence in
  `remote-helper-contract.md`. A lazy pointer inside an eagerly included fragment is the
  `chat-language` → `typography-rules` precedent. The build expands eager includes before it
  resolves lazy fences (`build.mjs` L1643–1647) and ships nested lazy fragments
  (`build.mjs` L2010–2022). This meets the issue's "add the reference to
  `remote-helper-contract.md`" through the contract's own pointer.
- **Four classes, derived from code.** The class column holds `forge read`, `forge mutation`,
  `local` or `local write`:
  - `forge mutation` equals `MUTATION_OPERATIONS`;
  - `local write` equals `LOCAL_WRITE_OPERATIONS`;
  - `local` equals the `case` labels of `localOperation`, minus `local write`;
  - `forge read` is the rest.

  The existing harness test already reads those labels from source. No new export is needed. A
  `forge read` with a local side effect says so in Notes. For example, `pr-acceptance-sources`
  writes a private runtime snapshot (`claude-settings-core.mjs` L144–148).

- **Canonical keys only; aliases and common keys stated once.** Rows name the canonical keys the
  workflows send (`number`, `payload.body`, `payload.comments[].path`, …). One lead sentence above
  the table covers the rest:
  - `cwd` (always `RUNTIME_STATE_ROOT`, per the contract) applies to every operation;
  - the `repository`/`provider` overrides apply only to forge operations. In
    `issue-lifecycle-receipt-build`, `repository` is a receipt field.
  - the exact-key builders `follow-up-admission-build`, `issue-lifecycle-receipt-build` and
    `decomposition-records-build` take their data only under the container key, because the flat
    form fails `exactObjectKeys` once `cwd` is present (`remote-tracker-shared-core.mjs` L75–84,
    `remote-tracker-core.mjs` L914–916);
  - `issue` and `pullRequest` are accepted compatibility aliases of `number`;
  - `cwd` follows the helper contract; some local operations reject a relative path;
  - a key read through `input.payload ?? input` is written `payload.<key>`. A present `payload`
    object is then the only source for those keys; flat keys beside it are ignored
    (`remote-tracker-github-core.mjs` L226, L256–264).

  The table repeats none of these.

- **Conditional keys get their own cell form.** A key required only under a condition is written
  `` `key` (if `<capability>`) `` in the required-keys cell, where the condition is a capability
  token. An example is `expectedVersion` on
  `issue-update-body` and `pr-update-body` when the probe reports `conditionalWrites`
  (`remote-tracker-core.mjs` L7348–7350), written `` `expectedVersion` (if `conditionalWrites`) ``.
  The test maps the token to `input.probe = {executable: 'gh', capabilities: {<token>: true}}` and
  probes the key under it; the grammar test rejects any other condition form. `skipProbe` uses `input.probe`
  when one is given (L7279–7283).
- **Contract once.** The fragment states only operations and keys. The call shape, dry run and
  `--apply`, `cwd` and the envelope stay in `remote-helper-contract`. The long-body rule stays in
  `remote-tracker-input-files`, which the fragment names but does not restate. Workflow-specific
  usage prose in `issue-tracker-forge.md`, `pr-review-thread-writes.md` and similar files is
  untouched. Some of that prose spells step-local shapes, for example
  `src/shared/pr-automation-lines.md` L34, `issue-tracker-forge.md` L329–330 and L346,
  `src/tools/plan-issue.md` L414, and `src/tools/plan-review.md` L104 and L245. The fragment adds
  one sentence (decided by score, "Canonical-list sentence"): the table is the canonical top-level
  key list, nested schemas stay with the owner named in Notes, and workflow prose names keys only
  for its own step.
- **Structured containers: top-level key plus owner pointer** (decided by score, "Top-level
  container plus owner pointer"). For operations that read `input.X ?? input` with a
  multi-field schema, the row lists only the container key (`finding`, `epic`, `decomposition`,
  `receipt`, `context`, `patch`, `workflow`, `container`). Its Notes begin with `structured;`
  and then point to the schema's owner:
  - the owning fragment where one exists, such as `issue-lifecycle-receipt` (L38–44) or
    `issue-tracker-forge` (L196);
  - otherwise the builder function in `remote-tracker-core.mjs`, such as the `finding-build`
    builder at L1020–1060.

  No nested schema is copied into the table. Two refinements:
  - A container its builder does not require goes in the Optional keys cell, still marked
    `structured;`, and gets no omission probe. These are `context` on
    `issue-lifecycle-receipt-build`, `issue-lifecycle-receipt-parse` and `decomposition-key-parse`,
    and `container` on `decomposition-container-compare` (`remote-tracker-core.mjs` L4462–4494,
    L494, L511, L1870–1880). `issue-lifecycle-receipt-build` therefore carries `receipt` as
    required and `context` as optional.
  - `comment` is not a structured container. The comment builders (`planning-comment-build`,
    `pr-comment-build`, `apply-comment-build`, `pr-review-comment-build`) read only `body` and
    `visibility` from it (L1083), and the issue requires their real key names. Their rows keep
    the alternative group `` `comment.body` or `body` ``.

  The test pins the set of `structured` rows, so a row cannot lose its marker or its owner
  pointer unnoticed.

- **No new long-body mechanism.** The input-file form keeps the here-string argv, so the allow
  rule (`claude-settings-core.mjs` L276) and `src/shared/helper-call-shape.md` stay unchanged. A
  stdin-from-file allow-rule shape would be a second form and is not added.
- **Ownership check.** The reference is tracker orchestration owned by Effective Flow. It overlaps
  no central skill, so `docs/developer-guide/skill-ownership.json` needs no entry.

## Affected files

| File                                                | Description                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/remote-tracker-operations.md`           | New fragment. A short lead (common keys, aliases, strict `cwd` operations, pointer to `remote-tracker-input-files` for any body-carrying key, and the canonical-list sentence), then the table `Operation \| Class \| Required keys \| Optional keys \| Result \| Notes` with one row per operation in `REMOTE_TRACKER_OPERATIONS` order. |
| `src/shared/remote-helper-contract.md`              | Add one ` ```lazy-include ` of `remote-tracker-operations` after the input-file include (Approach step 3). All other lines stay verbatim (pinned by `test/helper-call-shape-contract.test.mjs` L162–172 and `test/execution-location-contract.test.mjs` L400–455).                                                                        |
| `test/remote-tracker-operations-reference.test.mjs` | New focused test file (the main test file has 17,341 lines). It parses the fragment table and checks set, order, class and grammar. It runs the required-key omission probe and the kind-specific positive check for every row, and the Forgejo checks (unsupported, capability-gated, Forgejo positive check).                           |
| `test/remote-tracker-input-file.test.mjs`           | Add one pin: payload keys in an input file never become call options (Approach step 5).                                                                                                                                                                                                                                                   |
| `test/execution-location-contract.test.mjs`         | Add one test, with its own `// Invariant:` comment, that pins the new lazy-include fence and its `when:` line in `remote-helper-contract.md`. Place it next to the existing input-file test (L418–455).                                                                                                                                   |
| `src/tools/*.md` (`contextBudget:` lines only)      | Raise the budget of every tool whose always-loaded core grows past it because of the new fence. Take the numbers from the `Always-loaded core (lines/budget)` report of `node build.mjs`.                                                                                                                                                 |
| `docs/developer-guide/build-system.md`              | In the "Remote-tracker" bullet (around L1051), add one clause: the operation reference lives in `remote-tracker-operations`, and adding or re-keying an operation requires a matching row, enforced by the new test.                                                                                                                      |

## Implementation details

### Approach

1. **Collect the keys.** For each of the 69 operations, read its validator path:
   - `localOperation` and the `executeOperation` pre-checks in `remote-tracker-core.mjs`, including
     L7346–7351;
   - the provider builders in `remote-tracker-github-core.mjs` and `remote-tracker-forgejo-core.mjs`.

   Record for each operation:
   - required keys, in the canonical form workflows send, with conditional keys in the step-2 cell
     form;
   - optional keys that change behaviour, such as `visibility`, `payload.event` and filters;
   - the top-level `data` fields of the success envelope;
   - provider differences, such as `review-create` returning `UNSUPPORTED_CAPABILITY` on Forgejo
     (`remote-tracker-forgejo-core.mjs` L613).

   Use these verified rows as the pattern:
   - `issue-read`: `number`.
   - `issue-comments-read`: `number`.
   - `issue-comment`: `number`, `payload.body`; optional `visibility`.
   - `issue-comment-update`: `number`, `commentId` (positive integer), `expectedBodyHash`,
     `payload.body`.
   - `planning-comment-build` and `pr-comment-build`: `` `comment.body` or `body` ``; result
     `{kind, marker, body}`.
   - `label-create`: `payload.name`; optional `payload.color` (default `ededed`),
     `payload.description`.
   - `review-create`: `number`, `payload.body`; optional `payload.event` (`COMMENT` only) and
     `payload.comments[]`, each element requiring `path`, `line`, `body`, with `side` optional
     (default `RIGHT`; `remote-tracker-github-core.mjs` L52–56, L110–120).
   - `review-threads-read`: `number`.
   - `review-thread-reply`: `number`, `commentId` (numeric database id, not node id),
     `payload.body`.
   - `review-thread-resolve`: `threadId` (GitHub: node id string; Forgejo: positive integer).
   - `pr-comment`: `number`, `payload.body`.

   Re-verify each row against code while writing it. Do not copy this list blindly. The positive
   check in step 4.4 is the backstop.

2. **Write the fragment** `src/shared/remote-tracker-operations.md` with a fixed,
   machine-parseable cell grammar:
   - backticked key paths, separated by `, `;
   - an alternative group, written `` `a` or `b` ``;
   - a conditional key, written `` `k` (if `<capability>`) ``;
   - required keys inside each element of an optional array, written
     `` `payload.comments[]` (each: `path`, `line`, `body`; optional `side`) ``;
   - `—` for none.

   Keep it compact:
   - Notes hold only provider differences and constraints an agent would otherwise get wrong,
     such as numeric id versus node id.
   - Keep cells short, because oxfmt pads every row to the widest cell. Put a note that needs more
     than a short phrase in a list after the table, keyed by operation.
   - Escape any literal `|` inside a cell.
   - The result cell names top-level `data` fields or a short shape, not full schemas.

   Never spell a `.effective-flow/` path in the fragment, and keep mutation verbs inside backticked
   names. The runtime-mutation analyzer (`runtimeMutationOnLine`, `build-lib.mjs` L5881–5896)
   flags a line that pairs such a path with a mutation verb. Refer to the input-file form only by
   the fragment name `remote-tracker-input-files`. Add no literal `node … remote-tracker.mjs`
   command line, so `test/helper-call-shape-contract.test.mjs` stays satisfied.

3. **Point to it from the contract.** Add the lazy-include fence to `remote-helper-contract.md`
   right after the `remote-tracker-input-files` include. The `when:` line covers two cases:
   - a step that must choose a remote-tracker operation, or input keys its workflow does not spell
     out;
   - a helper call that returned `INVALID_PAYLOAD` or `INVALID_REFERENCE` for an unknown operation
     or input field.

   The second case catches confident guessing, as in the issue's `issue-view` example. Apply the
   step-2 path and verb rule to that line too.

4. **Reference test** `test/remote-tracker-operations-reference.test.mjs`. Each test carries an
   `// Invariant:` comment.
   1. _Set, order and class._ Parse the table. Trim cells, split only on unescaped `|`, and skip the
      alignment row. The operation column must equal `REMOTE_TRACKER_OPERATIONS`, in the same order
      and without duplicates. Each class must match the derivation in "Architecture decisions". The
      failure message names the missing or extra operation and the fragment path.
   2. _Grammar._ Every row has six cells, and every key cell parses under the step-2 grammar.
   3. _Omission probe, every row._ Build a minimal valid payload for the row from its
      unconditional required keys:
      - a test-side value table keyed by key path (for example `number: 1`, `payload.body: 'x'`,
        `commentId: 1`, `name: 'x'`, `expectedBodyHash: <64 hex>`);
      - a per-operation fixture map for operations whose values need structure.

      For each required key or alternative group, omit it, and with the canonical key also every
      alias. A `structured` row omits only its required container key and gets no nested
      omission; an optional container gets no omission. Its valid fixture runs through the
      positive check. Call `executeOperation` (dry run for mutations) with these inputs:
      - a temp `cwd`;
      - a `repository` override for `github` on `forge read` and `forge mutation` rows only. A
        local row carries `repository` only when it lists the key itself (the thread-ledger rows)
        or inside a fixture `context`;
      - `options.skipProbe: true`;
      - a no-op `options.sleeper` and a fixed `options.clock`;
      - the sentinel runner from step 4.4.

      The fixture map may supply values only. Every top-level key path in a fixture must be one of
      the row's required, optional or common keys, and the test asserts this. Nested values below
      a listed `structured` container key are free. Otherwise a fixture could
      silently supply a key the row leaves out. A real example is `headSha` on
      `pr-acceptance-sources` and `pr-draft-classify` (`remote-tracker-core.mjs` L5942–5944,
      L8029–8035). A row's conditional key is omitted under an `input.probe` that meets its
      condition. For an array-element cell (decided by score, "Probe nested comment keys"), the
      payload carries a one-element array, and each required element key is omitted in turn from
      that element.

      The call must fail with `INVALID_PAYLOAD` or `INVALID_REFERENCE`, and the normalised failure
      must name the omitted key or group where the failure carries a field (decided by score, "Field
      where present"):
      1. With `error.details.field`, the test maps `[<n>]` to `[]` and applies a committed, static
         per-operation alias map, then requires the omitted key or group. Map examples:
         - `issue number` and `pull-request number` → `number`;
         - `comment.body` → the `` `comment.body` or `body` `` group;
         - `name` → `payload.name` on `label-create`;
         - `references` → `reference`;
         - `payload.headSha` → `payload.expectedHeadSha`;
         - `pr` on the thread-ledger rows.
      2. Without a field, as in field-less messages and lenient structured builders, any
         `INVALID_PAYLOAD` or `INVALID_REFERENCE` passes. The one-key difference from a payload
         that passes the positive check already proves the key is required.

      No message patterns and no nested-label map are kept, so rewording a validator message never
      fails the test without reference drift.

   4. _Positive check per kind,_ with the full minimal payload. An `INVALID_PAYLOAD` or
      `INVALID_REFERENCE` before the point listed for each kind fails the test, whichever key it
      names. That catches a required key the row leaves out.
      - A `forge mutation` returns `ok: true, dryRun: true` and never calls the runner.
      - A `forge read` reaches the runner. The sentinel runner throws a sentinel error on its first
        call, which the helper returns as a `COMMAND_FAILED` envelope carrying the sentinel
        message. The test asserts that envelope. Only an explicit, pinned list (`repository-resolve`,
        `probe`) may instead return `ok: true` with zero runner calls, because the `repository`
        override and `skipProbe` leave them nothing to run.
      - A `local` operation returns `ok: true`, or a non-validation code listed for it in the
        fixture map.
      - The `local write` operation runs in a temp Git checkout with an ignored `.effective-flow/`.
        Reuse the fixture of `test/remote-tracker-input-file.test.mjs` L41–47. The test asserts
        that the returned `data.path` resolves under the checkout's `.effective-flow/merge-gate/`,
        and that a listing of the checkout before and after shows no other change. This is the one probe path with a
        local runtime-state write; no path executes a forge write.
   5. _Provider notes,_ under a `forgejo` repository override with the same minimal payload:
      - A row marked "Forgejo: unsupported" fails with `UNSUPPORTED_CAPABILITY`, even under an
        `input.probe` of `{executable: 'tea', capabilities: {…}}` with the pinned test-side list
        `reviewThreadReplies`, `reviewThreadResolution` and `pullRequestDraftCreate` set to `true`.
        Those are the capabilities checked with `=== true` (`remote-tracker-forgejo-core.mjs`
        L46–58, `remote-tracker-core.mjs` L7323–7333). That proves the gap is static.
      - A row marked "Forgejo: needs `<capability>`" fails with `UNSUPPORTED_CAPABILITY` without
        that capability and returns a dry run with it.
      - Every other forge row passes the kind-specific positive check of step 4.4 under the `forgejo`
        override as well. The test adds the pinned Forgejo-only key additions and value types to
        the minimal payload, and supplies the capability for capability-gated rows. Each Forgejo-only
        addition must appear in that row's Notes in one fixed form, which the test matches:
        `` Forgejo: `<key>` `` for a key, ``Forgejo: `<key>` <type>`` for a value type (for
        example ``Forgejo: `threadId` integer``).
5. **One file-form pin** in `test/remote-tracker-input-file.test.mjs`, using the existing fixture
   (a temp main checkout, an ignored `.effective-flow/`, an input file named by digest). A mutation
   such as `issue-comment` is called without `--apply`. Its file payload carries `"apply": true`.
   It still returns `dryRun: true`, and no forge write runs. Invariant: `apply` comes only from
   argv (`src/scripts/remote-tracker.mjs` L118–128). The pin does not cover `skipProbe` or `probe`:
   the fixture passes `skipProbe` as a call option, under which `input.probe` is the intended test
   seam (`remote-tracker-core.mjs` L7278–7283).

   Add no refused-argv pins. `test/remote-tracker-argv.test.mjs` L35–84 already proves with an
   untouchable stdin that `--help`, `pr-read --apply`, `body-hash --apply` and `pr-read pr-merge`
   fail with `INVALID_PAYLOAD` before stdin is read. That holds for any stdin content, the
   `inputFile` wrapper included, so the issue's closed-argv criterion is met by that existing test.

6. **Contract pin.** Add one test in `test/execution-location-contract.test.mjs`, next to the
   input-file test at L418–455, with its own `// Invariant:` comment. The comment says the
   operation reference stays lazy behind the helper contract and has one trigger line. The test
   asserts the new fence and its full `when:` line. The existing assertion that
   `remote-helper-contract.md` eagerly includes `remote-tracker-input-files`, its single long-body
   rule, stays unchanged.
7. **Budgets and docs.** Run `node build.mjs`. For each tool the build reports over budget, set
   `contextBudget:` to the measured count plus at most ten lines. Add the build-system.md clause.

### Component structure

Not relevant: no UI.

### State management

Not relevant for the product: no runtime state changes. The probe test writes only into temp
directories, including the ledger fixture checkout.

### API integration

Not relevant: no forge call changes. The probe never executes a forge write.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Alias keys** (`issue`, `pullRequest` for `number`): the probe omits the canonical key and every
  alias together. The normaliser maps the validator labels `issue number` and
  `pull-request number` to `number`.
- **Flat payload keys** (`payload = input.payload ?? input` in `remote-tracker-github-core.mjs`
  L226): the table documents `payload.<key>`, `label-create` included. The probe sends the
  documented `payload` form only.
- **Structured containers read as `input.X ?? input`** (`finding`, `epic`, `decomposition`,
  `receipt`, `context`, `patch`, `workflow`, `container`). The fallbacks sit in
  `remote-tracker-core.mjs` L4434–4510, in the receipt builders (L600, L916) and in
  `remote-tracker-decomposition-core.mjs` L342. Omitting a required container makes the builder
  read the whole input:
  - A lenient builder then fails on its first nested field. The pinned label map maps that exact
    label to the container.
  - An exact-key builder fails with `field` set to the container name (`receipt`,
    `decomposition`).

  An optional container (`context`, `container` on the rows named in "Architecture decisions")
  returns `ok: true` when omitted and is never probed by omission.

- **Conditional keys** (`expectedVersion` under `conditionalWrites`): written in the conditional
  cell form, and probed under an `input.probe` that meets the condition.
- **Operations without required keys** besides `cwd` (for example `probe`, `viewer-read`,
  `repository-resolve`): the row shows `—`. Only the positive check runs. `probe` and
  `repository-resolve` are the pinned zero-runner-call exceptions.
- **Pre-dispatch validation** (`pr-checks-wait`, `pr-list` with `planPath`, `pr-acceptance-sources`,
  `pr-status-read`, and `expectedBodyHash` in `executeOperation`): these checks belong in the row.
  The positive check fails if one is missing.
- **Waiting and Git-running operations** (`issue-state-wait`, `pr-checks-wait`, `merge-proof-local`,
  `pr-draft-classify`): the no-op sleeper, the fixed clock and the sentinel runner keep the probe
  fast and deterministic.
- **A new operation added to `REMOTE_TRACKER_OPERATIONS`:** test 4.1 fails, naming the operation and
  the fragment, until a row exists. The existing harness test separately requires the allow-rule
  classification.
- **Unknown operation argv** (`issue-view`): `parseArgv` still returns `INVALID_PAYLOAD`. The
  contract's `when:` line routes the agent to the reference after that error.

## Acceptance criteria

- [ ] `src/shared/remote-tracker-operations.md` holds one row per entry of
      `REMOTE_TRACKER_OPERATIONS`, in that order. Every row has class, required keys, optional
      keys, result and notes.
- [ ] The rows of these operations carry the real key names: `issue-read`, `issue-comments-read`,
      `issue-comment`, `issue-comment-update`, `planning-comment-build`, `label-create`,
      `review-create`, `review-threads-read`, `review-thread-reply`, `review-thread-resolve`,
      `pr-comment-build` and `pr-comment`. That includes `expectedBodyHash` for
      `issue-comment-update`, `payload.comments[]` for `review-create` with required
      element keys `path`, `line`, `body` and optional `side`, `payload.name` for `label-create`, and the numeric database id `commentId` for `review-thread-reply`.
- [ ] `test/remote-tracker-operations-reference.test.mjs` fails in each of these cases: - an operation added to or removed from `REMOTE_TRACKER_OPERATIONS` without a matching row; - a wrong class; - a documented required key the validator does not require; - a required key the row leaves out; - a Forgejo-only required key that the row and its Notes leave out; - a required container key missing from a `structured` row; - a required `review-create` comment-element key the row leaves out.

      Verify each case by a temporary local mutation during implementation; commit none of them.

- [ ] `remote-helper-contract.md` contains the lazy-include of `remote-tracker-operations` with
      the two-case `when:` line, and `test/execution-location-contract.test.mjs` pins both. The
      contract still includes `remote-tracker-input-files` eagerly, as the single long-body form.
      This change adds no argv shape, no allow-rule shape and no `helper-call-shape.md` edit.
- [ ] The issue criterion "same validation and redaction as the here-string, exercised by a test"
      is met by the existing test `test/remote-tracker-input-file.test.mjs` L100–123. That test
      compares file and inline envelopes, including the redacted `issue-comment` dry-run preview,
      and it stays green unchanged.
- [ ] The issue criterion "closed-argv guarantees still hold for the new form" is met by the
      existing `test/remote-tracker-argv.test.mjs` L35–84, which stays green unchanged. It refuses
      `--help`, `--apply` on reads and a second operation before any stdin is read.
      `test/remote-tracker-input-file.test.mjs` gains one pin: a mutation called without `--apply`,
      whose file payload carries `"apply": true`, still returns `dryRun: true`, and no forge write
      runs.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (no context-budget
      overrun) and `pnpm test:distribution`.

## Validation plan

- New `test/remote-tracker-operations-reference.test.mjs`:
  - table parse;
  - set, order and class equality;
  - grammar;
  - per-row omission probe;
  - kind-specific positive check;
  - Forgejo checks: unsupported, capability-gated, and the Forgejo positive check.
- Extended `test/remote-tracker-input-file.test.mjs`: the pin that payload keys never become call
  options.
- New test in `test/execution-location-contract.test.mjs`: the fence and `when:` pin.
- Unchanged and still green:
  - `test/remote-tracker-argv.test.mjs`, the closed-argv evidence;
  - `test/helper-call-shape-contract.test.mjs`;
  - `test/effective-flow-state-harness.test.mjs`;
  - `test/remote-tracker*.test.mjs`;
  - `test/workflow-contracts.test.mjs`.
- Mutation check, local only. Each of these must fail the new test, and the PR body records each
  outcome:
  - add a dummy operation name to the table;
  - remove one operation's row;
  - change one row's class;
  - drop one required key from a row;
  - add an extra required key to a row;
  - remove `payload.title` from the pinned Forgejo additions for `pr-mark-ready`, and separately
    remove its mention from Notes;
  - drop `finding` from the `finding-build` row;
  - drop `line` from the `review-create` comment-element cell.
- CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `pnpm eval <suite> verify` for all five suites:
  - Record freshness debt wherever `verify` reports it. Suites that load no host of
    `remote-helper-contract`, such as `focus`, likely report none. No suite shows an integrity error.
  - Record that debt under the pragmatic test and release policy. Do not re-record evidence in
    this change.

## Assumptions and open points

- Verified: PR #762 merged the input-file form. It added:
  - `resolveInputFile` in `remote-tracker-core.mjs`;
  - `src/shared/remote-tracker-input-files.md`;
  - `test/remote-tracker-input-file.test.mjs`;
  - the lazy include in `src/tools/pr.md` L264.

  Issue #729 is still open with no closing PR reference. Closing it is outside this plan's write
  boundary. Its unpublished plan in a kept worktree is superseded by the merged code.

- Verified: `parseArgv` (`src/scripts/remote-tracker.mjs` L24–44) rejects an unknown operation, a
  second argument and `--apply` on a non-mutation. It runs before `readStdin` (L118–119). `apply`
  reaches `resolveInputFile` and `executeOperation` only from argv (L121–128). No code reads an
  `apply` key from the payload. Under the `skipProbe` call option, `input.probe` supplies the probe
  result by design.
- Verified: `requireString` and `requireNumber` failures carry `details.field`. `executeOperation`
  accepts an injected runner, a `repository` override, `skipProbe`, `sleeper` and `clock`, so
  remote rows can be probed without a real forge. Most remote validators run inside the command
  plan builders or the `executeOperation` pre-checks, before any runner call. The `label-create`
  dry run makes no provider call (`remote-tracker-core.mjs` L5279–5296).
- Assumption: for every remaining operation, the required keys are reachable before any forge
  write. If an operation validates a key only after a provider read, its row documents that key
  from code. The fixture map then names the operation with a comment, and the positive check uses
  the sentinel for it.
- Assumption: result fields and optional keys are curated by hand from the normalizers and are
  not probed. The table describes top-level `data` fields only.
- Not in scope: `docs/developer-guide/configuration.md` L135 and `architecture.md` L1128 say "47
  read-only operations", while `REMOTE_TRACKER_READ_OPERATIONS` holds 48. This is a separate stale
  count. Mention it in the pull request instead of widening this change.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {"site":"S-CLR","question":"What is the single source of truth for the remote-tracker operation reference, and how is drift prevented?","options":["Tested Markdown table","JS spec rendered by build","Self-describing helper operation"],"scores":[{"label":"Tested Markdown table","score":8,"reason":"Follows the existing pattern of hand-maintained tables tested against JS exports, meets both criteria through set/class equality and omission probes, and can live in a lazy fragment with no eager budget growth."},{"label":"JS spec rendered by build","score":6,"reason":"Stops operation-set drift but the spec would sit beside the imperative validators without driving them, so it needs the same probes plus a new build placeholder and a large runtime table."},{"label":"Self-describing helper operation","score":3,"reason":"Leaves the contract without a readable reference, forces an extra runtime call per agent and adds a helper operation without a better drift guarantee."}]},
  {"site":"S-CLR","question":"How far does the automated check verify the documented required keys against the real validators?","options":["Probe every row","Probe the named twelve","Set equality only"],"scores":[{"label":"Probe every row","score":8,"reason":"Only option that meets the no-drift requirement for all 69 operations, at the real cost of minimal payloads, alias handling and the shared fake git/gh runner."},{"label":"Probe the named twelve","score":6,"reason":"Covers both acceptance criteria cheaply but leaves the keys of the other 57 operations hand-curated and able to drift silently."},{"label":"Set equality only","score":3,"reason":"Catches only added or removed operations and never checks documented keys against the validators."}]},
  {"site":"S-BAT","question":"How deep do rows go for structured inputs read as input.X ?? input?","options":["Top-level container plus owner pointer","Full nested keys","Exempt structured builders","Decide later"],"escape":["Decide later"],"scores":[{"label":"Top-level container plus owner pointer","score":8,"reason":"Keeps the contract once by pointing to the owning fragments while container-key omission stays probeable and the valid fixture catches a missing container key; nested drift is not machine-checked and builders without an owning fragment need a named owner or Notes entry."},{"label":"Full nested keys","score":4,"reason":"Most literal no-drift reading, but it copies schemas that already have owning fragments, grows rows like finding-build to about 25 paths and multiplies probe fixtures for little gain."},{"label":"Exempt structured builders","score":3,"reason":"Contradicts the scored Probe every row decision and leaves even the container key of the exact-key builders unprobed."}]},
  {"site":"S-BAT","question":"How far are Forgejo-only required keys machine-checked?","options":["Forgejo positive check","Targeted Forgejo pins","Accept and state the risk","Decide later"],"escape":["Decide later"],"scores":[{"label":"Forgejo positive check","score":8,"reason":"Only option that catches a Forgejo-only required key the table omits, cheaply because the dry run already builds the Forgejo command plan in-process, at the cost of per-provider fixture values and capabilities."},{"label":"Targeted Forgejo pins","score":5,"reason":"Pins the two known notes cheaply but a later Forgejo-only key would still go unnoticed."},{"label":"Accept and state the risk","score":3,"reason":"Honest but gives up machine-checking for one of the two supported providers against the no-drift requirement."}]},
  {"site":"S-BAT","question":"How does the new table relate to workflow prose that already spells key shapes?","options":["Canonical-list sentence","Prose shape test","Follow-up issue","Decide later"],"escape":["Decide later"],"scores":[{"label":"Canonical-list sentence","score":8,"reason":"One sentence in the lazy fragment, inside the issue scope, consistent with the Contract once decision and keeps step-local shapes where agents need them, though drift at the known sites stays unchecked."},{"label":"Prose shape test","score":4,"reason":"Closes the drift gap but a heuristic matcher over inline prose shapes would be brittle and is scope creep for this issue."},{"label":"Follow-up issue","score":4,"reason":"Pointers instead of step-local shapes would make every step load the lazy table, and filing it states nothing now about which source wins."}]},
  {"site":"S-DEC","question":"How are review-create's nested comment keys documented and checked?","options":["Probe nested comment keys","Hand-curated nested keys","Decide later"],"escape":["Decide later"],"scores":[{"label":"Probe nested comment keys","score":8,"reason":"The issue names exactly this shape; one cell form and a one-element fixture probe path, line and body with side optional, at the modest cost of one grammar form and probe-builder extension."},{"label":"Hand-curated nested keys","score":5,"reason":"Cheap and fixes the side claim, but leaves the one nested shape the issue names unchecked and free to drift."}]},
  {"site":"S-DEC","question":"How strictly does the omission probe match the failure to the omitted key?","options":["Field where present","Full normaliser, static map","Validation code only","Decide later"],"escape":["Decide later"],"scores":[{"label":"Field where present","score":8,"reason":"Keeps key naming where it is robust structured data and drops brittle message patterns and nested labels, while field-less cases stay covered because each probe differs from a positive-checked payload by one key."},{"label":"Full normaliser, static map","score":5,"reason":"Strictest naming without circularity, but message patterns and nested labels break on any validator rewording without real drift."},{"label":"Validation code only","score":6,"reason":"Simplest sound option, but it gives up the free guard against a dependent or conditional key failing instead."}]},
  {"site":"S-DEC","question":"Which tools reach the operation reference?","options":["State contract-host reach","Add a pr.md pointer","Pointers in pr and issue-buddy","Decide later"],"escape":["Decide later"],"scores":[{"label":"State contract-host reach","score":8,"reason":"Adds nothing to pr or issue-buddy eager cores, matches the one-pointer design and the issue's examples from contract hosts; pr and issue-buddy spell their calls, though they cannot reach the table for error recovery."},{"label":"Add a pr.md pointer","score":4,"reason":"Reuses the existing pattern but only buys error recovery for pr at budget and pin cost, and leaving issue-buddy out is a half-measure."},{"label":"Pointers in pr and issue-buddy","score":5,"reason":"Consistent recovery for every helper caller, but pays pointer and pin cost twice for tools whose steps already spell each call, without an acceptance criterion behind it."}]}
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         4 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    4 |
| Testability     |        0 |        11 |    6 |
| Scope           |        0 |         3 |    2 |
| Maintainability |        0 |         0 |    5 |

### Findings

Gap analysis (Phase 4):

- Testability, Important: the positive check could not catch a missing required key, and the
  `issue-comment-update` row lacked `expectedBodyHash`. Incorporated: a kind-specific positive
  check (Approach step 4.4) and the corrected row.
- Testability, Important: matching an omitted key to an error was undefined. Incorporated: a
  four-step normaliser with a per-operation label and alias map.
- Architecture, Important: the depth of rows for structured `input.X ?? input` inputs was
  undefined. Resolved by the scored decision "Top-level container plus owner pointer".
- Testability, Important: the probe harness lacked a sleeper, a clock, a sentinel runner and a
  ledger fixture. Incorporated in Approach step 4.
- Testability, Important: the closed-argv pins could not prove "before stdin". Superseded by the
  internal-review finding on existing argv coverage below.
- Error cases, Note: conditional and provider-specific keys had no cell form. Incorporated: the
  conditional cell form and Forgejo notes.
- Architecture, Note: a wrong nested-lazy precedent. Incorporated: only `chat-language` →
  `typography-rules` is cited.
- Maintainability, Note: the `when:` wording advice cited the wrong guard. Incorporated: the
  path and verb rule of Approach step 2.
- Error cases, Note: the trigger missed confident guessing. Incorporated: the second `when:`
  case after `INVALID_PAYLOAD` or `INVALID_REFERENCE`.
- Maintainability, Note: oxfmt pads table rows. Incorporated: short cells, notes list, escaped
  `|`.
- Scope, Note: the outcome overclaimed, and one issue criterion had no evidence line.
  Incorporated: narrowed claims and an acceptance line citing the existing input-file test.

Internal review (Phase 6):

- Scope, Important: the refused-argv pins duplicated `test/remote-tracker-argv.test.mjs` L35–84.
  Incorporated: they are dropped, that test is cited, and one "payload keys never become call
  options" pin is kept.
- Testability, Important: `repository-resolve` and `probe` make no runner call, and the
  sentinel returns as `COMMAND_FAILED`. Incorporated in step 4.4.
- Testability, Important: fixtures could supply keys a row omits. Incorporated: fixtures supply
  values only, and the test asserts this.
- Error cases, Important: Forgejo static gaps and capability-gated rows could not be told apart.
  Incorporated: two pinned note kinds (step 4.5).
- Error cases, Important: Forgejo-only required keys went unchecked. Resolved by the scored
  decision "Forgejo positive check".
- Architecture, Important: the exact-key builders reject the flat form once `cwd` is present, and
  the overrides do not apply to every operation. Incorporated in the lead sentence and the
  structured-container rules.
- Testability, Note: `skipProbe` honours `input.probe`. Incorporated: conditional keys are
  probed.
- Testability, Note: the label map needed per-operation entries. Incorporated.
- Maintainability, Note: workflow prose spells key shapes too. Resolved by the scored decision
  "Canonical-list sentence".
- Testability, Note: the mutation list was incomplete, and the fence pin lacked its own invariant.
  Incorporated.
- Architecture, Note: `pr-acceptance-sources` writes a runtime snapshot. Incorporated: its Notes
  say so.
- Error cases, Note: two stale line citations. Corrected.

Planning ladder (scoped re-check after the scored decisions, trigger (d)):

- Testability, Important: three containers are optional in their builders. Incorporated: they go
  in the Optional keys cell and get no omission probe.
- Architecture, Important: `comment` contradicted the issue's required real key names for the
  comment builders. Incorporated: `comment` is not structured, and those rows keep
  `` `comment.body` or `body` ``. The issue's acceptance criterion settles this, so no new
  decision was needed.
- Testability, Important: the unconditional `repository` override broke local rows.
  Incorporated: forge rows only; the Forgejo check covers forge rows only.
- Scope, Important: the goal still overclaimed. Incorporated: "top-level required keys checked
  before the first provider call", with the hand-curated remainder named.
- Testability, Important: the new checks had no failure case. Incorporated: acceptance and
  mutation cases for the Forgejo addition and the structured container.
- Maintainability, Note: exact nested labels and a fixed Notes form were missing. Incorporated,
  plus a pinned set of `structured` rows. The nested labels were later removed by the deep-review
  decision "Field where present".

Deep plan review (`plan-review`, 2026-11-26):

- Testability, Important: the file-form pin claimed that `skipProbe` and `probe` never become
  call options, but `input.probe` is the intended seam under the `skipProbe` call option.
  Incorporated: the pin covers `apply` only.
- Testability, Important: `review-create`'s nested comment keys were neither probed nor correct,
  because `side` is optional. Resolved by the scored decision "Probe nested comment keys", with
  the array-element cell form and a one-element fixture.
- Architecture, Important: the `payload.<key>` rule contradicted the flat `label-create` row.
  Incorporated: `payload.name` and friends, a lead sentence on the `payload` object as the only
  source, and an alias-map entry.
- Scope, Important: the four-step normaliser tied the test to message wording. Resolved by the
  scored decision "Field where present". Message patterns and nested labels are dropped.
- Error cases, Note: the strict-`cwd` list was incomplete and restated the contract. Incorporated:
  one neutral clause.
- Testability, Note: free-prose conditions. Incorporated: capability tokens.
- Testability, Note: "every capability" had no source. Incorporated: a pinned list of three.
- Testability, Note: the ledger write assertion had no mechanism. Incorporated: a `data.path`
  check and a before-and-after listing.
- Scope, Note: the outcome overclaimed the reach. Resolved by the scored decision "State
  contract-host reach".
- Maintainability, Note: eval debt is expected only where `verify` reports it. Incorporated.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-26
**Workflow:** `effective-flow build` (autopilot run, inline Quality route)

### Requirement

Delivered as planned: one operation reference for every `REMOTE_TRACKER_OPERATIONS` entry, reached
lazily from `remote-helper-contract`, held to the code by tests. The input-file form from PR #762
stays the one sanctioned long-body form; no argv, allow-rule or helper change.

### Architecture decisions

- As planned, with three rows corrected to what the code does:
  - `decomposition-key-parse` lists `context` as required: `parseDecompositionKey` validates
    `target` even for an empty body.
  - `reference-parse` takes `` `reference` or `references` ``; the `expectedKind` rule for a bare
    `#N` sits in Notes, because conditions may only be capability tokens.
  - The `pr-create` Forgejo draft rule (`payload.draft` needs `pullRequestDraftCreate`) sits in the
    notes list, not as a whole-row `Forgejo: needs` marker, and has its own pin.
- Structured rows point to their schema owners: `issue-tracker-forge`, `issue-lifecycle-receipt`,
  `pr-thread-ledger`, or the builder functions `buildFindingPayload`, `buildEpicPayload`,
  `patchMarkedBlock` and `patchChecklistEntry`.

### Affected files

- `src/shared/remote-tracker-operations.md` (new, 69 rows)
- `src/shared/remote-helper-contract.md` (lazy-include fence with the two-case `when:` line)
- `src/tools/iterate.md` (`contextBudget` 1908 → 1910), `src/tools/merge-gate.md` (979 → 981)
- `test/remote-tracker-operations-reference.test.mjs` (new)
- `test/remote-tracker-input-file.test.mjs` (`apply` in a file payload stays a dry run)
- `test/execution-location-contract.test.mjs` (fence and `when:` pin)
- `docs/developer-guide/build-system.md` (Remote-tracker bullet)

### Implementation details

The reference test parses the table and checks set, order and class against the core exports,
the cell grammar, a per-row omission probe, a kind-specific positive check, an optional-key
omission check, the positive check under each conditional-capability probe, the Forgejo unsupported,
capability-gated and positive checks, the `pr-create` draft gate and the set of structured rows.
Every planned mutation case, plus a required key moved to Optional and an undocumented conditional
requirement, fails the test.

### Test results

- Phase 5: `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution` and `pnpm eval <suite>
verify` for all five suites passed (integrity: none; freshness debt only). The full `pnpm test`
  run ended with four timeouts and one cancellation in unrelated eval and host-driver suites under
  host load, a `wall-clock` environment signature, so the run holds no local full-suite evidence
  (environment: wall-clock).
- Phase 7, targeted over the whole change: 22 affected test files (1928 passed, 0 failed, 61
  skipped), `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` passed.

### Review result

One routed reviewer (`effective-flow-nodejs-reviewer`) reported one Important and five Note
findings; all six were fixed in the incorporation pass and the scoped re-check found no new
finding. No open findings, so no external review report.

## Review findings

**Date:** 2026-11-26
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     6 |
| Open / Not implemented |     0 |

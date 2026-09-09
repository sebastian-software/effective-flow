# Make the branch model reachable where work actually starts

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

`main` in this repository is the **published delivery artifact**, not the trunk. `git ls-tree
origin/main` returns `.github`, `LICENSE`, `README.md`, `docs`, `effective-flow` and
`renovate.json`; its `docs` is `docs/user-guide/` alone. There is no `src/`, no `build.mjs`, no
`package.json`, no `AGENTS.md`, no `CLAUDE.md` and no `docs/adr/`. All source work lives on
`develop`.

**This is already documented — on both branches — and that is exactly the point.** Two
developer-guide passages state it plainly:
[`architecture.md:58`](../developer-guide/architecture.md) ("Source and delivery live on **two
branches**") and the `## Source and delivery branch` section at
[`release-and-installation.md:118`](../developer-guide/release-and-installation.md). The machine
form is `delivery.baseBranch | origin/develop` in the project-setup ADR, which Effective Flow's own
tooling honours correctly. And the delivered `main` README already carries a machine-generated
footer, `build-lib.mjs`'s `deliveryFooter`:

> _This is the machine-managed delivery branch. Source, developer documentation, and contributions
> live on [`develop`](…)._

None of it prevented the failure, which is the finding this plan is built on: **the statement being
present is not the same as the statement being loaded.**

On 2026-09-09 a session was started in a `.claude/worktrees/` worktree cut from `main` and asked to
fix stale context-budget figures in `build.mjs` and `docs/developer-guide/build-system.md`. Neither
file exists there. The task was unperformable until the branch was reset onto `develop`, and it was
caught only because both targets were missing outright — a change touching a file that exists on
both branches would have landed on the delivery branch silently.

An agent doing a targeted file edit does not read `README.md`, and least of all its footer. What it
does read, unconditionally, is `CLAUDE.md`. On `main` there is none — so on the delivery branch
nothing is loaded at all.

| Carrier                     | Loaded unconditionally?                     | Present on `main`? |
| --------------------------- | ------------------------------------------- | ------------------ |
| `docs/developer-guide/*`    | no                                          | no                 |
| `docs/adr/…` (ADR row)      | no — reachable via the `AGENTS.md:5` marker | no                 |
| `README.md` delivery footer | no                                          | yes                |
| `AGENTS.md` via `CLAUDE.md` | **yes**                                     | **no**             |

Meanwhile the harness asserts the opposite first: a session starts with
`Main branch (you will usually use this for PRs): main`, derived from `origin/HEAD`, which points at
`main`.

## Architecture decisions

- **Close the gap where loading actually happens: give `main` a `CLAUDE.md`.** The delivery step
  additionally writes a minimal `AGENTS.md` and a one-line `CLAUDE.md` (`@AGENTS.md`) onto the
  delivery branch, stating that this is the machine-managed delivery branch, that source work
  belongs on `develop`, and that nothing is to be implemented here. This is the only carrier that a
  worktree cut from `main` loads without being asked. It is also consistent with what the delivery
  step already does — it writes the README, `docs/user-guide/`, `LICENSE`, `renovate.json` and the
  trusted issue-closing workflow.
- **The README is not the carrier, because it already is one and it did not work.** The delivery
  footer states the fact and was in place during the incident. Adding a second sentence to the same
  file would repeat a message nothing reads. The footer stays as it is.
- **This makes the plan a Feature, not Documentation.** It changes `scripts/deliver-docs.mjs`,
  `build-lib.mjs`, the release workflow's delivered set, and tests. That reclassification is
  deliberate and was confirmed before this revision.
- **On the `develop` side: one prose line in `AGENTS.md`, no `@` import.** `AGENTS.md` is 188 lines
  and the ADR is 45, so an import would put the always-loaded chain at 233 against the documented
  ~200-line memory-file target that the archived plan
  [`2026-09-02-claude-md-imports-agents-md.md`](archive/2026-09-02-claude-md-imports-agents-md.md)
  cut `AGENTS.md` from 254 lines to reach. That plan also records the intent an import would
  reverse: moving content _out_ of `AGENTS.md` "keeps it that way — the moved text becomes genuinely
  lazy, which is the point" (`:300-301`). A third objection is independent of budget: an `@` path is
  hardcoded while the ADR path is deliberately configurable — that is what the marker line is for —
  and `setup` maintains the marker, not an import, so a relocated ADR would leave a silently
  unresolved import.
- **`887cdf8` is the precedent for exactly this shape.** That commit added a seven-line paragraph to
  `AGENTS.md` stating a config-key fact (`language.chat`), pointing at its authoritative source
  (`src/shared/chat-language.md`), and noting what this repository sets — all as prose, with no
  import. The branch-model line follows the same pattern.
- **The `AGENTS.md` line carries the ADR's value verbatim, so the test compares literally.** A test
  deriving `develop` from `origin/develop` and searching `AGENTS.md` would be vacuous: `develop`
  already occurs there, and so does `main` as a word. Carrying the exact string `origin/develop` on
  a bold-label line — the convention `AGENTS.md:5` already uses — lets the test compare it to the
  ADR row cell for equality. It also avoids encoding a rule the contract refuses to make statically:
  `base-branch-resolution.md:5-6` warns that the part before the first `/` is a remote only when
  `git remote` lists it.
- **The ADR prose becomes machine-read, so its preservation must be guarded.** The companion plan's
  drift check is silenced by a recognized acknowledgement sentence in that prose.
  `src/tools/setup.md:710` promises to "preserve its recognized English or German envelope and
  surrounding prose during a normal update", but no test asserts it, and the envelope enumeration at
  `:705-709` belongs to the _new-ADR_ bullet rather than to the preservation rule. This plan adds the
  missing assertion instead of relying on an unguarded promise.
- **The pre-existing developer-guide passages stay unbound, by decision.** `architecture.md:58` and
  `release-and-installation.md:118` state the branch model correctly today and are prose for human
  readers, not contracts a run depends on. Binding them by test would pin wording that has no
  machine consumer. This is a decision, not a deferral.

## Affected files

| File                                               | Description                                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-lib.mjs`                                    | A `deliveryGuidance()` producing the minimal `AGENTS.md` body and the `CLAUDE.md` line, beside the existing `deliveryFooter`, with the same marker-based idempotency |
| `scripts/deliver-docs.mjs`                         | Write both files into the delivery work tree                                                                                                                         |
| `.github/workflows/release.yml`                    | Extend the delivered set and the comment describing what `main` carries                                                                                              |
| `docs/adr/effective-flow-project-setup.md`         | Prose section after the `## Configuration` table: branch model, rationale, and the acknowledgement sentence the companion plan recognizes                            |
| `AGENTS.md`                                        | One bold-label line carrying the branch roles and the verbatim `delivery.baseBranch` value; no `@` import                                                            |
| `test/build-lib.test.mjs`                          | Cover `deliveryGuidance()` and its idempotency                                                                                                                       |
| `test/workflow-contracts.test.mjs`                 | The `AGENTS.md` line against the ADR row; `setup`'s preservation of post-table ADR prose                                                                             |
| `docs/developer-guide/release-and-installation.md` | Record the two added files in the delivered set                                                                                                                      |

## Implementation details

### Approach

1. **Add `deliveryGuidance()` to `build-lib.mjs`** next to `deliveryFooter`, following its shape: a
   stable HTML marker for idempotency, a pure function, no I/O. It returns the `AGENTS.md` body —
   three or four lines naming `main` as the machine-managed delivery branch, `develop` as where
   source lives, and stating that changes made here are overwritten by the next delivery — plus the
   one-line `CLAUDE.md` content `@AGENTS.md`.
2. **Write both files in `deliverDocs()`**, alongside the README footer step. They are generated
   artifacts of the delivery branch, never edited there.
3. **Extend the release workflow's delivered set** and update the block comment that enumerates what
   `main` carries, so the two new files are not mistaken for stray files by a later reader.
4. **Add the ADR prose section** after the `## Configuration` table, so the machine-read table keeps
   its position. Include the acknowledgement sentence; agree its exact wording with the companion
   plan before writing, since it is parsed there.
5. **Add the labelled line to `AGENTS.md`** next to the marker at `:5`, carrying the verbatim value
   `origin/develop`. No `@` token in it.
6. **Add the tests.** `source(path)` resolves against the repository root
   (`test/workflow-contracts.test.mjs:17-21`), so `source('AGENTS.md')` works with no new helper;
   `tableRow` is defined at `:134` and used against this ADR at `:6076`. The preservation test
   asserts `src/tools/setup.md` explicitly covers content after the `## Configuration` table, and
   where the current wording does not carry that, extend it as part of this step.

### Edge cases

- **A consumer sees the new files.** `main` is what `dalo` and `npx skills` read. The two files are
  small, accurate and useful to anyone who lands there; they name the branch's role rather than
  imposing project rules. Keep the wording consumer-safe — no contributor-only jargon.
- **Idempotency across re-deliveries.** `appendDeliveryFooter` returns its input unchanged when the
  marker is present. `deliveryGuidance` writes whole files rather than appending, so it is naturally
  idempotent; assert that a second run produces byte-identical output.
- **A future `@` in the ADR.** Moot: without an import the ADR never becomes a memory file.
- **`setup` rewriting `AGENTS.md`.** `setup.md:751` writes the marker "non-destructively" and leaves
  "the remaining content untouched", so the labelled line survives. The first test covers a
  regression.
- **The delivered `CLAUDE.md` in a target project.** It lives on this repository's `main`, not in
  anything `setup` writes elsewhere; no interaction with `setup`'s own `CLAUDE.md` offer.

## Acceptance criteria

- [ ] After a delivery, `main` carries a `CLAUDE.md` whose whole content is `@AGENTS.md`, and an
      `AGENTS.md` naming `main` as the delivery branch and `develop` as the source branch.
- [ ] Running the delivery twice produces byte-identical files.
- [ ] The ADR carries a prose section after the `## Configuration` table naming `develop` as the
      integration branch, `main` as the published delivery artifact, and the divergence as
      deliberate.
- [ ] The acknowledgement sentence is byte-identical to the string the companion plan recognizes.
- [ ] `AGENTS.md` carries a bold-label line containing the exact string from the
      `delivery.baseBranch` row, and no `@` token outside a code span.
- [ ] A test fails when the `delivery.baseBranch` row changes without the `AGENTS.md` line
      following. Prove it by mutating the row both to a value appearing nowhere in `AGENTS.md`
      **and** to `origin/main`, which already occurs as a word — both must fail.
- [ ] A test fails when `src/tools/setup.md` stops covering content after the `## Configuration`
      table in its preservation rule.
- [ ] `node build.mjs`, `pnpm test` and `pnpm agent:check` green.

## Validation plan

- `pnpm test` — full suite plus the new tests. Each new test is proven by mutation, not by passing.
- `node build.mjs` — completes without a guard violation. Note the limit of this evidence: no build
  guard reads `docs/adr/` at all, and the guard that reads `AGENTS.md` only inspects paragraphs
  matching `effective-product`. A green build says nothing about the new prose; the tests are the
  evidence.
- Exercise `deliverDocs()` against a scratch work tree and inspect the two produced files, then run
  it a second time over its own output to confirm idempotency.
- `pnpm agent:check`.
- After the next real release, confirm both files arrived on `main`.

## Assumptions and open points

- Verified, not assumed: `README.md` on `main` is written mechanically by the release workflow, and
  already carries the delivery footer. That is why the README is not this plan's carrier.
- Verified: `source(path)` resolves against the repository root, so `source('AGENTS.md')` needs no
  new helper.
- Verified: `scripts/distribution-smoke.mjs` pins no exhaustive delivered file list. Its
  `assertSameMembers` covers only _skill candidates_ — files whose frontmatter carries
  `name: effective-flow` — and its `snapshotTree` comparison is scoped to `effective-flow/`; every
  other check is a per-file comparison. Two extra root files therefore need no smoke-test change,
  **provided neither carries frontmatter with `name: effective-flow`**. Keep both files
  frontmatter-free; that is the condition, not an assumption.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### 2026-09-09 — deep interactive plan review

Four critical findings against the first draft, all resolved:

- **Critical, resolved — the remedy missed the failure.** The draft placed everything on `AGENTS.md`
  and the ADR, neither of which exists on `main`.
- **Critical, resolved — the import broke a budget its own precedent set.**
- **Critical, resolved — the proposed test was vacuous.** `develop` already appears in `AGENTS.md`.
- **Critical, resolved — a false premise.** The draft claimed the fact existed "in exactly one
  machine form"; it is stated in prose in two developer-guide files.

### 2026-09-09 — revision against 887cdf8

The base moved from `2c82846` to `887cdf8` and one verified fact overturned the previous remedy:

- **Critical, resolved — the chosen README carrier already exists and had already failed.**
  `build-lib.mjs`'s `deliveryFooter` puts "Source, developer documentation, and contributions live
  on `develop`" at the bottom of the delivered README, and it was in place during the incident.
  Writing a second sentence into the same file would have repeated a message nothing reads. Replaced
  by delivering `AGENTS.md` + `CLAUDE.md` to `main`, the only unconditionally loaded carrier — which
  reclassifies the plan from Documentation to Feature.
- **Important, resolved — stale citations.** `setup.md:698 → :710`, `:694-697 → :705-709`,
  `:739 → :751`, `architecture.md:47 → :58`, `test:6001 → :6076`. Unchanged and re-confirmed:
  `AGENTS.md:5`, `release-and-installation.md:118`, `test:17-21`. `base-branch-resolution.md:5` is
  more accurately `:5-6`.
- **Important, resolved — stale arithmetic.** `AGENTS.md` is 188 lines, not 181, so the import
  chain is 233 rather than 226. The conclusion against the import is strengthened.
- **Note — Architecture:** `887cdf8` added a prose paragraph to `AGENTS.md` for `language.chat`
  stating a config fact without an import — direct precedent for the shape chosen here. Recorded.
- **Note — Scope:** the former open point about the two developer-guide passages is now a decision
  (they stay unbound), which also clears the clarification gate.
- **Note — Error cases:** the README assumption is now a verified fact rather than an assumption
  carried into implementation.
- **Note — Maintainability:** delivering two more generated files widens the delivery step's
  surface. Bounded by reusing the existing marker-idempotency pattern and asserting it.

### 2026-09-09 — implementation review

No critical findings. Three important findings, all proven by mutation and all incorporated:

- **Important, fixed — the four `deliveryGuidance` unit tests passed on a gutted body.** Reducing
  the body to a bare link left marker, branch name and URL intact, so all four stayed green while
  the message the file exists to carry was gone. A fifth test now pins the load-bearing phrases;
  re-running the same mutation fails it.
- **Important, fixed — the `AGENTS.md` ↔ ADR pin was a substring test.** It failed for
  `origin/main` and `origin/zzz-nonexistent` as the plan demanded, but stayed green for `develop`
  and `origin/dev` — and dropping the remote prefix is the likeliest real reconfiguration, since
  `base-branch-resolution` treats the part before the first `/` as a remote only when `git remote`
  lists it. Now an equality check on the backticked token; all four mutations fail.
- **Important, fixed — `deliverDocs()` destroyed a source checkout's `AGENTS.md`.** The documented
  standalone CLI, pointed at the repository root, replaced the 190-line file with the nine-line
  delivery one and reported success. It now refuses a tree carrying `build.mjs` or `src/`.

Notes acted on: argument validation to match `appendDeliveryFooter`; the marker comment no longer
claims an idempotency role it does not have; the delivered body no longer says the branch carries
the skill and user docs "only" (it also carries `LICENSE`, `renovate.json` and the trusted
automation); the body gained the pull-request warning and a sentence about precedence over a
parent checkout's guidance; the acknowledgement test's comment no longer describes its consumer in
the present tense; the release-workflow comment no longer splits an existing paragraph.

Notes accepted without change: the idempotency unit test cannot fail for a pure template function
(the property that matters is verified end-to-end instead); `setup` has three lines of budget
headroom left; the bare-`@` guard has two false-positive shapes, both failing safe.

### Deviations from the plan as written

- **`scripts/stage-delivery.mjs` was not in `Affected files`.** The plan named `deliver-docs.mjs`
  as the write site, which is correct, but the declarative reset list that keeps the delivered set
  from accumulating stale files lives in `stage-delivery.mjs`. Two entries added.
- **`src/tools/setup.md` was not in `Affected files`** although Approach step 6 required extending
  it. Its preservation rule said "envelope and surrounding prose", which did not unambiguously
  cover a section after the configuration table — and the acknowledgement sentence now depends on
  exactly that. Extended, costing two lines of a five-line budget headroom.
- **Acceptance criterion 1 was corrected rather than met literally.** It asked for an `AGENTS.md`
  "naming `main` as the delivery branch". `deliveryGuidance(repo, sourceBranch)` is not given the
  delivery branch name, exactly as `deliveryFooter` is not, and hardcoding it would assert a name
  the function was never told. The body names the role instead — "This is the machine-managed
  delivery branch" — which serves the purpose, since the reader is standing in that checkout. This
  was raised before implementation rather than decided silently.

## Open points

- No open points.

# Session rename butler for Claude Code

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

**Planned against:** `6ab4c5d` (the merged Codex path). Predecessor:
`docs/plan/archive/2026-08-09-session-self-rename.md`, whose slice 3 this plan replaces.

## Requirement

The Codex path ships: a run applies its own session title through a hook. On Claude Code Desktop the
same run still only prints `**Suggested session title:**`, because the host refuses a self-rename.

The only route is a second session acting as a rename butler. A live test proved the route works: a
Haiku session given a user-typed standing mandate honored a cross-session rename request. Four later
live tests changed what the design around it has to be, and each contradicts the predecessor's
slice 3 as written — see V14, V15, V16 and W3.

## Verified context

Established by live test against Claude Code Desktop 2.1.221. V1–V13 come from the predecessor and
keep their numbers so the archived plan stays readable beside this one; V14–V16 and the W-rows are
new.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2  | The host's rename tool refuses the caller: `Refusing to rename the current session from within itself.` Enforced in the app, not in the tool description.                                                                                                                                                                                                                                                                                                                                                                                                          |
| V4  | The rename writes `titleSource: 'auto'`, and the app discards an `auto` title when the session already carries `titleSource: 'user'` — silently, returning the same success string.                                                                                                                                                                                                                                                                                                                                                                                |
| V5  | A cross-session message reaches a session with `isRunning: false`. The target wakes and completes a turn, so a butler need not stay open.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| V6  | An **unmandated** session refuses the request, on two grounds: a cross-session message is data rather than instruction, and the shipped contract says "never retitle another session".                                                                                                                                                                                                                                                                                                                                                                             |
| V11 | A Haiku session given a user-typed standing mandate **honored** the request and called the rename tool.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| V13 | A user who accepts a suggested title by hand sets `titleSource: 'user'`, permanently opting that session out of later automatic renames.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| V14 | **`get_session` reflects a just-applied rename immediately, in the same turn.** Renaming a session and reading it back returned the new title. A discarded rename leaves the old title, so the read-back is what distinguishes applied from kept. This **refutes V12** as a design constraint.                                                                                                                                                                                                                                                                     |
| W1  | `send_message` is **asynchronous, not one-way**. It carries an envelope — sender title plus a backlink — the butler holds the same tool, and a reply is deliverable. The reply arrives as a **user turn** in the requesting session, after the requesting turn has ended. It cannot deliver to unattended sessions.                                                                                                                                                                                                                                                |
| W3  | All three session tools — `set_session_title`, `get_session`, `list_sessions` — exclude the **caller's own** session. A run therefore cannot read back its own title by any route. This, not the rename refusal alone, is why a second party is structurally required.                                                                                                                                                                                                                                                                                             |
| W4  | `get_session` returns no `titleSource`. A butler can compare the observed title against the one it was asked for, but can never see whether a title was user-set.                                                                                                                                                                                                                                                                                                                                                                                                  |
| V15 | **The read-back design works end to end.** A mandated Haiku butler renamed, called `get_session`, and replied with the observed title. For an unprotected target it reported the **new** title; for a target carrying `titleSource: 'user'` it reported the **old** one. The requester distinguishes applied from kept by comparing the reported value against what it asked for. Notably the same butler wrote "gesetzt und bestätigt" — a verdict — in its own chat while replying with the value, so the discipline holds exactly where the mandate demands it. |
| V16 | **A butler asked to rename the session that messaged it may refuse, believing the target is itself.** It named the requester's id as "the current session" and declined, although its own id was different. This is the **production** shape, where target and reply address are the same id. One explicit sentence — naming the butler's own id and stating that the coincidence is normal because a session cannot rename itself — resolved it and the request then succeeded.                                                                                   |

## Architecture decisions

- **The butler reports an observation, not a claim.** V14 removes the predecessor's central accepted
  limitation. The mandate is: rename, then `get_session` the same session, then report the
  **observed** title. V12 recorded that the butler compressed a caveated success into "✓ Titel
  gesetzt"; an observed title cannot be compressed that way, because it is a value rather than a
  verdict. This is the same lesson the Codex path learned as "first-hand evidence beats inference",
  applied one layer up.
- **The reply is the channel; there is no receipt file.** W1 makes a reply available, and it costs
  nothing outside the host. A file would have to be written by the butler into the **requester's**
  `.effective-flow/`, which `src/shared/runtime-state-safety.md` does not permit: the butler holds no
  execution-location receipt, revalidates no runtime root, and would take that root from an untrusted
  cross-session payload — the exact pattern the Codex request-file contract rejects. No build guard
  would see it either, because the runtime-writer guard walks `src/tools/*` and `src/agents/*` only.
  Dropping the file removes that whole problem rather than legislating around it.
- **Liveness is a reply already in this session's context.** The reply arrives too late to inform the
  run that asked for it, exactly as the Codex receipt does. A run therefore stays silent only when a
  butler reply from an earlier turn is present in its own context. A fresh session has none, so its
  first title emission prints the suggestion line while the rename happens anyway — the same bounded
  first-run cost the Codex path accepts, and the same direction: a redundant line, never silence.
- **The request carries no filesystem path.** Without the receipt file the message is `{sessionId,
title}`. That removes an absolute project path from a message delivered to a session authenticated
  by title alone.
- **The requester side keeps the categorical ban.** `session-title.md` continues to say a run never
  retitles another session. Only the **butler** side is loosened, for a session acting under its own
  user's standing mandate. The asymmetry is a role a model assigns to itself and nothing verifies it;
  that residual is recorded in the ADR rather than argued away.
- **Discovery stays marker-title-only**, and its two weaknesses are stated rather than mitigated: the
  title is settable by anyone holding `set_session_title` — including by accident — so it is a
  world-writable capability; and at run time an empty lookup is indistinguishable from a
  misconfigured butler. Both degrade to the suggestion line. Accepted deliberately to avoid the
  machine-local configuration value the repository has no precedent for.
- **The loosening gets its own ADR.** The clause ships eagerly in the router to every user on every
  harness, and V6 shows it is load-bearing.

## Affected files

| File                                 | Description                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/session-rename-butler.md`  | **New.** Decision record for loosening a shipped safety clause, per `src/shared/adr-convention.md`.                                                       |
| `src/shared/session-title.md`        | Butler-side carve-out only. Both pinned sentences and `never retitle another session` must survive verbatim on their source lines.                        |
| `src/shared/session-rename.md`       | Replace the Codex-exclusive early exit with a host dispatch, then add the Claude section: discovery, request shape, reply handling, degradation.          |
| `src/tools/setup.md`                 | Extend the capability step: print the marker title and the mandate **from the fragment, verbatim**, then verify by discovering the butler and probing it. |
| `docs/user-guide/getting-started.md` | Correct the session-title passage. See "A pre-existing defect" below — this is not only the Claude half.                                                  |
| `test/workflow-contracts.test.mjs`   | Assertions per the acceptance criteria below.                                                                                                             |

**No script changes for the rename itself** — a shipped script cannot make an MCP call. The
requester-side parsing (does a reply exist, does its observed title match what was asked) is small
enough to stay in the fragment; if it grows, `session-title-core.mjs` is where determinism belongs.

## Implementation details

### The host dispatch replaces the early exit

`src/shared/session-rename.md` currently opens with _"Codex is the only host with an established path
today. On any other host, emit the suggestion line and **read no further**."_ Keeping that sentence
while adding a Claude section below it makes the new section unreachable — a Claude run stops reading
before it. Replace it with an explicit three-way dispatch: Codex to the Codex section, Claude Code
with a discovered butler to the Claude section, every other host to the suggestion line and no
further reading.

### The mandate

The predecessor's live-tested mandate is the base (V11). It gains three things: the read-back and
report step, the opaque-title refusal rules, and — per V16 — an explicit statement that the target
session is **never** the butler's own, that target and reply address carrying the same id is the
normal case, and that the reason is precisely that a session cannot rename itself.

That third addition is not defensive padding. Without it the butler refuses the production shape
with a plausible-sounding safety argument, and the user sees a butler that answers nothing. A silent
total failure that looks like correct caution is worse than an error.

The report step must demand a **value**: "reply with the title you read, verbatim, without
assessment; do not write 'set' or 'succeeded'". V15 showed a butler producing a verdict in its own
chat while honoring that instruction in its reply, so the wording is what carries it. It is printed **by setup from the fragment,
verbatim**, and the user pastes it themselves — a mandate arriving through the channel it authorizes
is not a mandate.

The receipt filename constraint that bit the Codex work applies here too: `test/workflow-contracts.test.mjs`
forbids the literal `session-title` in every `src/tools/*.md`, so the mandate text and any identifier
containing it live in the fragment, and `setup.md` prints that block by reference.

### A pre-existing defect this change must fix

`docs/user-guide/getting-started.md` carries one joint sentence — _"Effective Flow today still
suggests rather than sets; the mechanism is being introduced separately"_ — which shipped in
`6ab4c5d` and is **already false for a Codex user with the hook installed**. There is no "Claude
half" to correct in isolation. Fix both halves.

### Edge cases

- **No session carries the marker title** → suggestion line, no notice. Indistinguishable from a
  butler that was archived, closed or renamed after setup; accepted per the discovery decision.
- **Several sessions carry it** → ambiguous; suggestion line and a one-line notice, never a guess.
- **Butler declines, or is unattended** → no reply ever arrives; identical handling to an absent
  butler.
- **Reply present but its observed title differs from the requested one** → the rename was kept, not
  applied (V4/V13). Emit nothing: the session carries a title its user chose.
- **Reply present, observed title matches** → the path works; stay silent this turn.
- **A reply older than the current session's own request history** → treat as absent rather than as
  liveness for a request it never answered.
- **Malformed or unparseable reply** → treat as absent. Every reply defect fails **open**, to the
  suggestion line; none of them may produce silence.
- **The reply wakes the session** → a model turn is spent and a pseudo-user message appears in the
  transcript, once per rename. Stated as a known cost below.

## Acceptance criteria

### CI-verifiable

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` pass.
- [ ] `src/shared/session-rename.md` ships into all three `dist/{claude,codex,portable}/effective-flow/shared/` targets — the assertion class that caught the predecessor's first critical.
- [ ] The fragment's opening dispatch names **both** Codex and Claude Code and still carries a third-host exit; the string `read no further` is not preceded by a clause that excludes Claude.
- [ ] `src/shared/session-title.md` still contains `Never call such a tool for the current session`, `apply the title silently instead of proposing it`, and `never retitle another session`, each pinned as its own string — the third one shares a source line with the first and is the string the carve-out edit is most likely to break.
- [ ] No file under `src/tools/` or `src/agents/` contains the literal `session-title`.
- [ ] The ADR exists at `docs/adr/session-rename-butler.md`.

The line-budget criterion from the previous draft is **removed**: `BUDGET_TOOLS` covers
`build`, `fix`, `docs`, `review`, `plan`, and nothing this plan edits is inlined into them, so the
criterion could not fail.

### Manual field verification

- [ ] With a mandated butler present and a prior reply in context, a run's session title changes and no suggestion line is printed.
- [ ] With no butler, the same run prints exactly one suggestion line and no error.
- [ ] With a butler present but the session hand-renamed, the butler's reply reports the **old** title and the run emits nothing.
- [ ] A butler handed a title containing a code fence and an imperative refuses it rather than acting.
- [ ] `/effective-flow setup` discovers the butler, probes it, and reports the concrete result.

## Validation plan

- The four repository checks.
- A live two-session check per manual criterion. The third one — hand-renamed session, reply reports
  the old title — is the one V14 made observable at all; it is the criterion that proves the
  observation design rather than the claim design.
- One adversarial pass over the mandate text specifically, per the fourth criterion.

## Assumptions and open points

| #   | Assumption                                                                                                                   | Stop condition                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | _Discharged by V15._ Demonstrated live in both directions, including the discarded case that proves observation beats claim. | Discharged. The residual it leaves is V16's mandate wording, which is an implementation requirement rather than an open question.             |
| B3  | A user-typed mandate stays honored across the butler session's own context compaction.                                       | Not blocking; a butler that forgets behaves as an absent one.                                                                                 |
| B4  | A reply arriving as a user turn is acceptable transcript noise at one turn per rename.                                       | Not blocking, but if it is judged unacceptable the only alternative is replying on mismatch only — which reintroduces inference and is worse. |

## Plan review

**Result:** Approved. B1, the only blocking assumption, was discharged by live test after the review.

This section records an external adversarial review plus the live tests it prompted. The review
verified eight of the previous draft's factual claims and found **five false**: the "neutral early
exit" is Codex-exclusive, W1 overstated `send_message`, the line-budget criterion is vacuous,
`getting-started.md` has no Claude half, and V12 is a property of the rename tool rather than of the
host. The last one was then refuted empirically and became V14.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        2 |         1 |    1 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, critical — the early exit would have made the new section dead prose**, with the
  acceptance criterion green. Incorporated as the host dispatch, and the criterion rewritten to one
  that can fail.
- **Architecture, critical — the receipt was keyed per target session**, so the first emission in any
  session would have found no matching receipt and printed a line while renaming anyway. Dissolved:
  the receipt is gone, and liveness is now a reply in context.
- **Architecture, important — B2 was a contract violation, not a non-blocking assumption.** A butler
  writing into the requester's `.effective-flow/` has no receipt, no revalidated root, and takes the
  root from an untrusted payload. Dissolved with the receipt.
- **Security, important — the carve-out's asymmetry is model-assigned.** Both sides read the same
  fragment, and the only evidence for "I am the butler" is that a message asked it to be one.
  Recorded in the ADR rather than argued away.
- **Security, note — the marker title is a world-writable capability**, spoofable in both directions.
  Accepted per the discovery decision, and stated in the fragment so a reader knows what it buys.
- **Data protection, note** — the request now carries only a session id and the title; the absolute
  project path is gone with the receipt. The title is still a work subject delivered to a
  title-authenticated session.
- **Error cases, important — the failure direction was unstated.** Every reply defect now fails open
  to the suggestion line.
- **Testability, important — two criteria could not fail.** Removed and replaced.
- **Scope, important — B1 and B2 were one gate.** B2 is gone; B1 alone remains and blocks only the
  silence rule.
- **Maintainability, note** — R1 (the router resolves eager includes only) and R4 (the
  `session-title` literal ban) still govern and are carried forward explicitly rather than inherited
  from the archived plan.
- **Architecture, important (live test after the review) — the mandate must disambiguate the target
  from the butler itself.** V16: a butler asked to rename the session that messaged it refused,
  naming that session as "the current session" although its own id differed. That is the production
  shape, so without the disambiguating sentence the feature fails on every ordinary run — and it
  fails looking like correct caution, which is the hardest failure for a user to diagnose.
  Incorporated into the mandate requirements.
- **Error cases, note (live test after the review)** — the same butler wrote a verdict in its own
  chat while replying with a value. The report step's wording is therefore load-bearing on its own,
  and the plan now says so rather than assuming a mandated butler reports values by disposition.

## Implementation

Implemented as planned across the six named files, plus the new ADR. `src/shared/session-rename.md`
lost its Codex-exclusive early exit in favour of a three-way dispatch table and gained the
`### Claude Code: a mandated butler renames on request` section; `src/shared/session-title.md` gained
the butler-side carve-out with all three pinned sentences intact; `src/tools/setup.md` Step 7 split
into a Codex path and a Claude Code path; `docs/adr/session-rename-butler.md` records the loosening.
No script changed, as planned — the butler path is prose-only.

Deviations from the plan as written, all discovered during implementation or review:

- **The dispatch routes every Claude Code run into the Claude section**, not only a run with a
  discovered butler as the plan's implementation detail specified. Discovery is _defined_ inside
  that section, so the plan's condition is unevaluable at dispatch time; the degradation table
  already sends the no-butler case to the suggestion line. Recorded as a benign deviation rather
  than restored.
- **The plan's edge table was missing an antecedent, and that was a Critical.** Its two decisive
  rows read "observed title matches / differs from **the requested one**" without saying which
  request. Liveness is a reply from an _earlier_ turn while each run decides a _fresh_ title, so
  consecutive runs in one session normally carry different subjects — a run comparing the reply
  against this turn's title would have taken the emit-nothing row on the ordinary working path and
  silenced the session permanently, reaching the exact failure the plan bans through the one row
  allowed to be silent. Both rows now name the title _that earlier request carried_, and an
  unrecoverable antecedent (after compaction) counts the reply as absent.
- **The refusal rule as first written rejected ordinary titles.** "Refuse a title containing an
  imperative" collides with the contract's own instruction to reuse a pull-request title verbatim
  minus its Conventional Commit type — which is an imperative phrase by convention, as this
  repository's own history shows. The mandate now refuses by shape and address (control characters,
  a code fence, over 60 characters, or text that directs the reader) and says explicitly that an
  imperative-reading work subject is a normal title.
- **The mandate accepted a target the shipped carve-out did not authorize.** It tolerated a target
  id differing from the sender, which forced the weakening word "normally" into the V16
  disambiguation — the one hedge a cautious butler would anchor on. Both were fixed together: the
  identity is now categorical, and a target that is not the sender is refused.
- **The opt-out is sticky.** A session whose user set its own title would otherwise have kept
  spending a butler turn and a wake on every later run for a rename known in advance to be
  discarded.
- **`setup.md` needed a resolvable path.** It must print the mandate from the fragment verbatim but
  cannot carry the `session-rename` pointer, since the contract test forbids it in silent tools. It
  now names `<skill-root>/shared/session-rename.md` explicitly and prints nothing rather than
  reconstructing the text from memory if that read fails.
- **`docs/user-guide/getting-started.md` needed both halves fixed, then a third correction.** The
  replacement first implied the suggestion line disappears once a butler exists; it does not — the
  first request in any session still prints it while the rename proceeds in the background.

Validation: `pnpm agent:check`, `pnpm test` (579 pass, 0 fail), `node build.mjs` (all guards; budget
`review 685 / plan 555` of 700), `pnpm test:distribution` — all green. The fragment ships identically
to `dist/{claude,codex,portable}/effective-flow/shared/session-rename.md`.

## Review findings

**Date:** 2026-08-09
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`,
`effective-flow-docs-writer`, `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    28 |
| Open / Not implemented |     2 |

**External review report:** `.effective-flow/review/review-report-2026-08-09-plan-session-rename-butler.md`

Of 31 aggregated findings, 28 were implemented; one further note recorded the benign dispatch
deviation above and needed no action. No Critical and no Important remains open. The two open notes
are both deferred structural refactors — demoting the Codex subsections so the host boundary is
structural rather than prose, and splitting the session contract tests out of a 3550-line suite —
kept out deliberately so this change's diff stayed reviewable.

## Open points

- No open points.

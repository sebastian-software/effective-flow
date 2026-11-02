# ADR for focus's confirmed cross-session messages

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Target path:** docs/adr/focus-cross-session-messages.md

## Requirement

Work package 2 of `docs/concept/2026-11-02-focus-session-check.md`: write the ADR for the confirmed
cross-session messages of the planned `effective-flow focus` tool. These are the course correction and,
on hosts without a reader, the self-report request. The ADR relates the decision to
`docs/adr/session-rename-butler.md` and `docs/adr/input-trust-boundary.md` and rests on the evidence in
`docs/developer-guide/focus-host-evidence.md` (work package 1, #602).

The concept's done-when is: "the ADR is accepted and consistent with the spike evidence". It is a
prerequisite of work package 4, which builds the tool against this ADR.

Workflow rationale: the change is a new ADR plus one reference line in each of two existing ADRs. No
product or code behaviour changes, so `Documentation` fits. `effective-flow docs` handles new ADRs, and their
language is `language.documentation.technical` (`en`). The doc-category line is omitted because the
target lies in the repository's established `docs/adr/` structure, outside the four doc categories
(`src/shared/doc-categories.md`, sanctioned omission).

## Architecture decisions

- **One ADR, slug-named, status `Active`.** Path `docs/adr/focus-cross-session-messages.md`, unnumbered
  like all eleven existing ADRs, with `## Status` followed by a bare `Active` line. The Context section says in
  one sentence that the decision is taken before the tool exists, that work package 4 implements it,
  and that the file is updated in place if the real-host runs there contradict it (user decision; no
  `Proposed` value is introduced).
- **Section skeleton of the recent ADRs:** Status, Context, Decision, Alternatives and tradeoffs,
  Consequences, Review triggers, References, closing living-decision line. The model is
  `docs/adr/native-execution-profile-representation.md`. Target length is about 100 to 160 lines.
- **Back-references in both related ADRs (user decisions).**
  - `docs/adr/session-rename-butler.md`: one item in its existing `## References` list. Its decision
    text does not change.
  - `docs/adr/input-trust-boundary.md`: one added sentence at the end of its Decision section that
    scopes the "must apply the filter before model processing" rule to features with a script layer
    and points prompt-level consumers to the new ADR, plus a new short `## References` section with
    one item. No existing line is changed or deleted. In the butler ADR, the `## Status` / `Active` block and the
    retired-transport strings (`hooks.Stop`, `codex app-server`, `session-title.json`,
    `session-title-hook.json`, `session-title.mjs apply`) stay as they are, because
    `test/session-contracts.test.mjs` pins them.

- **Decision and rationale, not mechanics (user decision).** The ADR records each rule as a decision
  with its reason and evidence. Exact mechanics (lookup fields, nonce format, verdict wording, wait
  duration) belong to the focus-owned contract of work package 4, so the contract is stated once. The
  ADR says so in its Decision section.
- **The concept reaches `develop` first (user decision).** The concept file is untracked today. It is
  delivered by its own pull request before this plan is applied, so the ADR's links to it resolve.
- **Evidence citation:** host facts are cited as relative links to the evidence page sections,
  including heading anchors. Every Decision rule carries at least one fixed tag: either
  `(Evidence: <status>, <n> run(s), <section link>)` for each host claim, or
  `(Design decision, no host claim)`. Allowed statuses are the evidence page's own (observed, observed
  with deviation, partially observed, not observed by decision, not observable, observed
  (self-report)), plus "description only" for a claim resting on a tool description and "not covered
  by the spike" for a case no question covered; the last two always name work package 4 as the check. The ADR states nothing about host behaviour that the
  evidence page does not support.
- **No new test.** Three existing ADRs carry test pins (`session-rename-butler.md`,
  `unattended-run-state.md`, `effective-flow-project-setup.md`). This ADR adds none, and its prose
  is guarded only by `pnpm agent:check` and the existing brand guard over `docs/adr/*.md`
  (`test/build-lib.test.mjs`).

## Affected files

| File                                       | Description                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/focus-cross-session-messages.md` | New ADR (content below)                                                                                                                                                                   |
| `docs/adr/session-rename-butler.md`        | One line in `## References` naming the new ADR as the bounded exception to "Nothing crosses a session boundary any more"                                                                  |
| `docs/adr/input-trust-boundary.md`         | One added Decision sentence scoping the filter-before-model "must" to script-layer features and pointing prompt-level consumers to the new ADR; new `## References` section with one item |

## Implementation details

### Approach

1. Precondition: fetch and base the branch on the current `origin/develop` (the local `develop` may
   lag behind), then confirm that `docs/concept/2026-11-02-focus-session-check.md` and
   `docs/developer-guide/focus-host-evidence.md` exist there. If the concept is missing,
   stop and report that the concept delivery is still due. Do not write the ADR with dangling links.
2. Read the concept's solution sketch (steps 1, 4, 4a, 6), its non-goals, risks, ADR candidate bullet,
   and round 3 of its concept review. Also read the evidence page sections T3 Code results, Codex
   desktop results, Claude Code results (with the sender attributes), Consequences for the concept,
   and Limits.
3. Write the **Context** section:
   - The problem (a drifting session cannot see its own drift).
   - Why focus needs outward messages at all.
   - The butler precedent and why it was retired: a world-writable title as capability, a session ID
     crossing a trust boundary, an unverified prose guard, and wrong-target success. Use
     `session-rename-butler.md` lines 29–34 and 55–61.
   - The `input-trust-boundary.md` rule that third-party text "remains data" and is filtered before
     model processing.
   - The dated host evidence from work package 1, with its single-observation limits.
   - The before-the-tool sentence from the architecture decisions.
4. Write the **Decision** section as a short list of rules, each with one line of reasoning and its
   evidence status:
   1. **What may cross:** exactly two message kinds, the correction and the self-report request. Each
      is sent only after a developer turn in the same run confirms its exact text. A cross-session
      message or other observed content never counts as a confirmation. Unattended or scheduled runs
      send nothing. At most one self-report request and one correction go out per invocation, and
      nothing is resent after a missing or late reply.
   2. **Identity binding:** admission binds the host's stable reference, never a name. On T3 Code that
      is the thread ID; on Claude Code it is the `[ref]`, which lasts one process lifetime. A missing
      reference or the host's name-reuse notice ends admission. Identity and state are re-established
      right before each send, and a send whose target cannot be verified counts as not sent. Delivery
      evidence is per host: on T3 Code `delivery=steered` (observed); on Claude Code a successful send
      result with a message identifier means "sent, unconfirmed" (observed: the result said the
      message sat in the target inbox, not yet read, 3 of 3), and only an accepted reply (rule 4)
      confirms the round trip. A correction on Claude Code has no confirmation, and the report says
      so. On Claude Code every send uses the `[ref]`-qualified address that the `ListAgents`
      description offers, never the bare name (description only, work package 4). If that address
      form fails there, the gap between lookup and send becomes an accepted residual risk instead
      (user decision). Never a target: the observer's own session (listing header `[ref]` on Claude Code,
      capabilities call on T3 Code, both observed) or one of its ancestors (parent chain, observed on
      T3 Code; Codex not covered by the spike, work package 4). The self-report runs only from a
      top-level focus session, because a sub-agent sends under its parent's address (description
      only; Q10 not observed by decision, work package 4). Claude Code coverage is local
      sessions only.
   3. **Two named lookup exceptions** to the inventory ban, scoped to focus's own contract (work package 4); `src/shared/retro-native-sources.md` and `retro`'s admission stay unchanged:
      - On Claude Code, one targeted `ListAgents` lookup before each request and after each reply. It
        uses only whether the admitted reference is listed with its state, and whether its name
        occurs once.
      - On T3 Code, the observer's own `parentThreadId` chain, read with the smallest activity read,
        keeping only the parent and relationship fields.

      No target is ever chosen from a listing.

   4. **Reply acceptance (Claude Code):** a reply counts only when all of these hold:
      - its `from-name` equals the admitted reference's name;
      - it echoes the request's one-time nonce;
      - the post-reply lookup still binds that name uniquely to the admitted `[ref]`;
      - no restart notice appeared.

      State that the reply carries no `[ref]` (observed). Every other cross-session message is
      discarded, and a reply after the bounded wait is never processed.

   5. **Stand-in for filter-before-model:** say why a literal filter is impossible for a prompt-level
      tool: the message reaches the observer's model on arrival. Name what replaces it: the acceptance
      rule in point 4, discarding foreign and late messages, developer-only confirmation, and treating
      accepted content as quoted evidence that never becomes an instruction. State that this stand-in
      is a prompt-level rule the model follows, not an enforced filter, and weaker than a script-layer
      filter: every cross-session message, foreign ones included, has already reached the model.
      Keep the "remains data" and "fails closed" wording of `input-trust-boundary.md`.
   6. **Send modes per host:**
      - T3 Code: steer a running delegated task; send nothing to a finished delegated task; start a
        new turn on an idle top-level thread (not covered by the spike, work package 4); never use the automatic or
        restart modes.
      - The observer must run at least as broad as the target (`runtime_mode_escalation_denied`
        observed), otherwise focus is report-only and never asks for a broader mode.
      - Claude Code uses host delivery, and a held or refused message counts as not sent. A hold is
        known from the `SendMessage` description only; no hold was observed on a mode mismatch (1 run).
      - Codex desktop sends nothing in the first version.
   7. **Marker:** a fixed prefix names focus and the developer's confirmation and frames the text as a
      suggestion under the target's own approval gates. It is a label, not authentication: the
      receiver sees a plain user message with user-turn weight and no host sender marker (observed on
      T3 Code). On Claude Code the host attaches `from`, `from-name`, and `from-mode` (observed on
      replies), but none of them identifies focus or the confirmation. Any session could write the
      same prefix.
   8. **Correction content limits:** the correction refers only to the goal anchor and cited event
      locators. It copies no command, URL, or executable path from the evidence, and it passes the
      redaction check. Accepted self-report reply content passes the same redaction as observed
      evidence.
   9. **Self-report request:** it asks for information only, as locators. Its text says not to run,
      re-run, or change anything, and to return to the prior state and ask its own user nothing. That
      clause does not bind the target. Its verdicts form a separate self-report evidence level without
      On track, Looping, or Stalled.
   10. **Only execution:** "execution" means running a command with possible side effects. Read-only
       `git` and forge metadata queries for verifying a self-report, and the host's session tools,
       count as reads, not executions (user decision). The only execution is one named, side-effect-free foreground wait command of fixed maximum
       duration on Claude Code. In 4 of 4 runs, with the observer in auto mode, a reply arrived in-run
       while the turn was kept open by foreground calls; the monitor alone did not deliver. A
       background-only wait, `notify_when_idle`, and the default mode are unverified (work package 4).
       A blocked or approval-gated wait ends in "Cannot judge".
   11. **Accepted residual risks:** the T3 Code read side effect is unknown (Q1 not observable). Every
       read form is treated as possibly delivering, with one smallest state read before any content,
       and the concept infers from one observed idle-parent delivery (about one second) that only a
       busy parent can lose a result; the ADR marks this as an inference. The second accepted risk is a self-report target
       that blocks on a question to its own user; it is named in the confirmation dialog. The third is
       the residual injection risk of the prompt-level stand-in in rule 5.
5. Write **Alternatives and tradeoffs** with the rejected options, one line each:
   - report-only (no outward message);
   - autonomous or unconfirmed sends;
   - name-only binding (the butler failure mode);
   - reading private on-disk transcripts;
   - self-reports where a reader exists;
   - a Codex send in the first version (sender known only from a model self-report).
6. Write **Consequences**:
   - The bounded exception to "Nothing crosses a session boundary any more" (`session-rename-butler.md`
     line 74). The butler's rule that a run never retitles another session is unaffected, because a
     focus message is not a rename.
   - The mode pressure toward broad observer modes.
   - The late steer, which cannot stop an in-flight action.
   - The eval stub shapes that follow from the observed reply and reader shapes.
   - What work package 4 must still verify: the idle top-level new turn, default-mode wait, late
     reply, sub-agent sender, busy target, plan-mode repeats, Codex self and ancestor recognition, and
     the `[ref]`-qualified send address on Claude Code.
7. Write **Review triggers**:
   - a host reply carries a stable reference;
   - Claude Code gains a session reader;
   - the T3 Code delivery side effect becomes observable;
   - a verified Codex sender;
   - a host offers a pre-model filter or hook for cross-session messages;
   - work package 4 real-host runs that contradict a rule here;
   - the work package 4 focus contract diverges from a rule here.
8. Write **References**: the concept, the evidence page, the archived spike plan
   `docs/plan/archive/2026-11-02-focus-host-verification-spike.md`, both related ADRs, and
   `src/shared/retro-native-sources.md`. End with the living-decision line.
9. Add the back-references and the Decision sentence in `input-trust-boundary.md` (see "Affected
   files").
10. Format only the three files (`pnpm exec oxfmt <paths>`; the bare `pnpm format` rewrites the
    whole repository), then `pnpm agent:check` and `pnpm test`.

### Edge cases

- **The concept is not on the base branch yet:** stop before writing (Approach step 1). Do not link to
  a path that does not exist there.
- **The evidence page and the concept disagree:** the evidence page wins for host facts. The ADR
  states the evidence page's status, and the disagreement is reported in the run result as a concept
  follow-up. The concept is not edited here.
- **A rule rests on a cell the spike did not observe** (Q9 b–d, Q10, the idle top-level new turn,
  Codex identity, the `[ref]`-qualified address): the ADR tags it "not observed by decision",
  "description only", or "not covered by the spike" and names work package 4 as the check, rather
  than stating it as fact.
- **Raw spike data:** the ADR cites only the evidence page. It names no evidence-root path, digest,
  `[ref]` value, session name, or socket address.
- **Butler test pins:** the reference line added to `session-rename-butler.md` contains none of the
  retired transport strings and leaves the `## Status` / `Active` block untouched.

## Acceptance criteria

- [ ] `docs/adr/focus-cross-session-messages.md` exists in English with `## Status` followed by a
      bare `Active` line and the sections Context, Decision, Alternatives and tradeoffs,
      Consequences, Review triggers, References, plus the living-decision line.
- [ ] Its Decision section states each of the eleven rules from Approach step 4, and every rule
      carries at least one tag in the fixed form from "Evidence citation", with a status from the
      allowed list. Each `Evidence:` tag's status and run count match the cited cell of
      `docs/developer-guide/focus-host-evidence.md`.
- [ ] Its Context or Consequences names the bounded exception to `session-rename-butler.md` and the
      filter-before-model stand-in for `input-trust-boundary.md`. `git diff --numstat` shows 0 deleted lines
      for both existing ADRs. The butler ADR adds one `## References` list item naming the new ADR.
      `input-trust-boundary.md` adds one sentence at the end of its Decision section, a
      `## References` heading, and one such list item.
- [ ] Every relative link in the new ADR resolves on the branch, including heading anchors, and it
      links no untracked path.
- [ ] `pnpm agent:check` and `pnpm test` pass, including the `session-rename-butler` pins in
      `test/session-contracts.test.mjs` and the brand guard in `test/build-lib.test.mjs`. The
      concept's "accepted" means this change merged to `develop` with status `Active`.

## Validation plan

- `pnpm agent:check` and `pnpm test` (the existing ADR pins and the brand guard).
- A tag comparison: for every `Evidence:` tag in the ADR, compare its status and run count with the
  cited table cell or limit of the evidence page.
- `git diff --numstat` of the two existing ADRs: additions only.
- All relative links in the new ADR resolve on the branch (concept, evidence page, archived plan,
  both ADRs, `retro-native-sources.md`).

## Assumptions and open points

- The concept is delivered to `develop` by a separate pull request before this plan is applied (user
  decision). Until then Approach step 1 stops the run.
- `effective-flow docs` accepts a `docs/adr/` target path without a doc-category line. The docs workflow
  resolves ADR language explicitly, and the category omission covers an established repository
  structure.
- This plan file is tracked through the plan publication of this run (draft pull request). The docs
  run works from that tracked file, so its status update and archiving land in the same history.
- Status `Active` is used while the tool does not exist yet (user decision). The before-the-tool
  sentence keeps that honest.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Important, Testability — evidence-status labels did not match the evidence page:** adopted the page's own status set plus repeat counts and "description only".
- **Important, Scope — boundary rules missing from the Decision list:** added the self and ancestor refusals, the top-level-only self-report, and local-only Claude Code coverage to rule 2.
- **Important, Architecture — the lookup exceptions read as widening `retro-native-sources.md`:** scoped them to focus's own contract; `retro`'s admission stays unchanged.
- **Important, Error cases — three rules overstated the evidence:** the wait rule now names auto mode and the unverified variants; the hold is marked description only; the busy-parent claim is marked as an inference.
- **Important, Testability — acceptance criteria not one measurable condition:** the diff check uses `--numstat` with zero deletions and states the exact additions; link resolution became a criterion; "accepted" maps to a merge with status `Active`.
- **Note, Scope — ADR size and a second copy of the contract:** decision: decision and rationale only, mechanics owned by the work package 4 contract, new review trigger, target 100–160 lines.
- **Note, Data protection — raw spike data and reply redaction:** added the raw-data edge case and reply redaction to rule 8.
- **Note, Error cases — local `develop` lags `origin/develop`:** step 1 bases the branch on a fetched `origin/develop`.
- **Note, Error cases — `pnpm format` rewrites the whole repository:** step 10 formats only the three paths.
- **Note, Testability — wrong count of pinned ADRs:** corrected to three.

### Deep review (2026-11-02)

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

- **Important, Architecture — `input-trust-boundary.md` keeps an unqualified "must apply the filter before model processing":** decision: one added Decision sentence there scopes the rule to script-layer features and points prompt-level consumers to the new ADR.
- **Important, Security — the stand-in read as equivalent to the filter:** rule 5 now says it is an unenforced prompt-level rule, weaker than a script-layer filter; its residual injection risk joins rule 11, with a new review trigger for a host pre-model filter.
- **Important, Error cases — "delivery cannot be verified counts as not sent" would block every Claude Code send:** rule 2 defines delivery evidence per host; a Claude Code send is "sent, unconfirmed" until an accepted reply.
- **Important, Security — check-then-send by name on Claude Code reopens the wrong-target class:** decision: every send uses the `[ref]`-qualified address (description only, verified in work package 4), with the lookup-to-send gap as fallback residual risk.
- **Important, Architecture — "only execution" contradicted the git and CI verification:** decision: "execution" means a command with possible side effects; read-only `git`, forge metadata, and host session tools count as reads.
- **Important, Error cases — the sub-agent address reason was unobserved:** tagged as description only, Q10 not observed by decision.
- **Important, Testability — evidence criterion needed judgment:** every rule carries a fixed evidence or design-decision tag; the criterion compares tags with cells.
- **Note, Testability — claims with no spike cell:** added "not covered by the spike" as an allowed status.
- **Note, Scope — no message count limit:** at most one request and one correction per invocation, no resend; Claude Code sender attributes added to the marker rule.
- **Note, Maintainability — anchors and plan-file tracking:** link criterion includes heading anchors; plan tracking through this run's publication recorded as an assumption.

## Open points

- No open points.

# focus labelling rubric

How a fixture session for `/effective-flow focus` receives its expected label. This is the labelling
rubric of work package 5 in `docs/concept/2026-11-02-focus-session-check.md`. It decides labels only.
It does not define the verdicts and does not describe how focus reaches one.

## Status and fixing rule

The rubric is fixed before the first recording. A later change to it starts a new recorded round; a
round is never relabelled in place. How a round pins the rubric's version is decided by work package
6, which builds the focus suite. The rubric is deliberately no input to a run's instrument identity:
it changes how a result is judged, not what the run did.

## Labelling unit and inputs

The unit is one fixture session. The labeller sees only the fixture:

- its goal anchor and stated coverage;
- its self-report replies, for a self-report session;
- its repository state: the seed commit plus any `prepareCheckout` history;
- its CI evidence: the tracker stub's `operations`.

The labeller labels before and without seeing any focus verdict for that session. Fixture sessions
served through `evals/_scaffold/session-stub.mjs` stay within the behaviours recorded in
[focus session shape observations](focus-session-shape-observations.md) (for example `runLimit` 1 and
completed threads); a fixture that needs anything else is not buildable until a new dated addendum
records it.

## Definitions are linked, not copied

The verdict names, the evidence levels and the conditions each verdict needs are owned by the
`Snapshot verdict` section of [`src/tools/focus.md`](../../src/tools/focus.md) (table at lines 77-80,
definitions at lines 82-87). The reply acceptance rules and the self-report evidence checks are owned
by [`src/shared/focus-session-contract.md`](../../src/shared/focus-session-contract.md) (lines
142-152). This page adds only the labelling decisions below. If a definition there changes, this
rubric is re-read and, if needed, re-fixed under the fixing rule.

## Observed set

Verdicts: On track, Drifting, Looping, Stalled, Cannot judge.

**Precedence: Cannot judge, then Looping, then Stalled, then Drifting, then On track.** Take the first
step whose evidence is present.

Reason: missing coverage voids every other verdict, so it comes first. Absent progress, whether
repeated (Looping) or silent (Stalled), outweighs a change of topic, so a session that loops inside a
side topic is Looping, not Drifting. On track is the residual: it applies only when none of the
earlier steps does.

Each row names only the fixture evidence the labeller checks for that step; the condition it tests
is the linked definition in `src/tools/focus.md`.

| Step         | Labelling-decisive evidence in the fixture                                         | Definition                                      |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Cannot judge | Decisive unread history (see "Partial trajectory"), or no clear goal anchor        | [lines 86-87](../../src/tools/focus.md#L86-L87) |
| Looping      | For each repeated round: the new evidence or acceptance step it adds, if any       | [lines 83-85](../../src/tools/focus.md#L83-L85) |
| Stalled      | The coverage stated as sufficient, and any approval or blocker wait in the fixture | [lines 85-86](../../src/tools/focus.md#L85-L86) |
| Drifting     | The cited off-goal work, and whether the goal needs it as a dependency             | [lines 82-83](../../src/tools/focus.md#L82-L83) |
| On track     | The completion conditions the inspected trajectory advances                        | [line 82](../../src/tools/focus.md#L82)         |

## Partial trajectory

Only **decisive unread history** voids a label: history that exists, was not read, and could hold
the decisive pattern of a candidate verdict. Truncated items, unread pages and compaction inside the
judged trajectory are decisive unread history. Items the chosen view excludes (the `messages` view
drops command and reasoning items) are decisive unread history only when the decisive pattern for a
candidate verdict lives in those item types, for example repeated commands for Looping; otherwise
they do not void a label. Events that have not happened yet never void a label, because a running
session is focus's primary use case (concept, lines 63-64) and the suite needs at least three On
track sessions.

Worked example: the acceptance run in [focus host acceptance](focus-host-acceptance.md) (lines 57-62
and 83-88). The goal was C1 through C6 in order. The history was read with the `messages` view
(line 75), which served positions 0, 1, 3, 4, 6 and 8, and showed C1, C2 and C3 as sequential
progress at positions 4, 6 and 8 (lines 60-61); C4 to C6 had not yet occurred. Each admitted
message advanced a new completion condition, so the excluded command and reasoning items could hold
no repeated round without new evidence and no absent advance, and no admitted message cited off-goal
work. The evidence records only which positions the view served, not what the excluded positions 2,
5 and 7 held or whether excluded items followed position 8, so it cannot rule out off-goal work
confined to those items. The label is therefore **On track for the inspected trajectory**, with two
coverage limits stated: completion is neither claimed nor judged, and off-goal work confined to the
unread command and reasoning items is neither ruled out nor judged. Had the history held an
unread page between C1 and C3, that page would be decisive unread history and the label would be
Cannot judge.

## Self-report set

Verdicts: Progress verified, Drifting, Cannot judge. On track, Looping and Stalled never apply at this
level.

**Precedence: Cannot judge, then Drifting, then Progress verified.** A looping session is Cannot judge
at this level unless drift is verified. This is how the concept's criterion that no drifting or
looping fixture yields "Progress verified" holds: loops leave little trace in the repository, so
Progress verified is never granted to one.

| Reply condition                                                                                           | Label             |
| --------------------------------------------------------------------------------------------------------- | ----------------- |
| No reply, a held reply (served as `none`), a refused reply                                                | Cannot judge      |
| Narration only, or only unverifiable claims                                                               | Cannot judge      |
| Wrong nonce, name mismatch, a foreign message, a malformed reply                                          | Cannot judge      |
| A reply served through the declared `late` variant, whatever its poll count                               | Cannot judge      |
| A restart or name-reuse notice, or a failed post-reply lookup                                             | Cannot judge      |
| An accepted reply whose claims are verified in git metadata or recorded CI, with changes outside the goal | Drifting          |
| An accepted reply with a verifiable artifact toward the goal and no verified drift                        | Progress verified |

A hold is a target-side state the observer cannot see, so it presents as no reply. The stub serves a
held reply as `none`, and the rubric treats the two as equal: both are Cannot judge (contract, lines
150-151). The `late` variant counts polls, not seconds, so the stub cannot place a reply against the
contract's 30-second bound; a fixture that declares it is labelled Cannot judge as a late reply.
Test-run claims and uncommitted work stay unverified and cannot carry Progress verified.

## Citation rule

Every expected label lists findable locators: `position` or `itemId` for an observed session, report
items for a self-report session, and repository or CI evidence kept separate from them. A focus
verdict whose citations cannot be found in the fixture is a mismatch, even when its label matches.

## Scoring

The success criterion is the one in `docs/concept/2026-11-02-focus-session-check.md` (the "Success
criterion" paragraph, line 69). The procedure:

1. Label every fixture under this rubric before the round is recorded.
2. Use at least three sessions per verdict.
3. Count a session as a match when the verdict equals the label and the citations are findable.
4. For observed sessions, the concept's thresholds apply as written: focus "reaches the matching
   verdict in at least 80 % of all cases and never returns Looping, Drifting, or Stalled for an
   on-track session ("Cannot judge" is allowed there)".
5. For self-report fixtures, likewise: "at least three fixtures each with a missing, held, refused,
   or narration-only reply end in "Cannot judge"; no drifting or looping fixture yields "Progress
   verified"; and every self-report verdict states its evidence level and cites the report items it
   relies on".

# Scored Decision Options

**Concept status:** Elaborated
**Source:** effective-flow concept

## Problem and motivation

When Effective Flow puts a decision to the user, a recommendation is effectively binary. One option is marked, or just written first, as the recommended one, and the others carry no weight at all. The user cannot tell whether the recommended path clearly beats the alternatives or only barely does. Two or three options may be nearly equivalent, and then the choice is a matter of preference or context the agent does not know. A binary marker hides exactly the information needed to decide how much thought a decision deserves: a clear winner can be accepted quickly, while a close call is where the user's own judgment matters most.

The proposed remedy is a per-option score from 1 to 10, where 1 means "not recommended" and 10 means "strongly recommended". Scores make the spread visible: `9 / 4 / 3` reads as an obvious choice, `7 / 7 / 6` as a genuine trade-off.

Verified repository context:

- The main place where decisions with a recommendation are presented today is the "Clarify decisions" phase shared by `plan-review` and `concept-review`. That phase offers up to three domain options plus "Decide later", and each option names its advantages, its disadvantages, and "whether it is recommended and why". This is prose, not an `ask` fence.
- Across `src/` there are 48 `ask` fences. One is an approval fence and 47 offer two to four options. An option consists only of a label and a description. There is no recommendation, default, or score field, and no build guard concerns option order or recommendation text. Individual unit tests do pin the labels, order, and description phrases of specific fences.
- In two fences a recommendation appears only as prose inside a description, and seven setup fences tag their first option "(default)". Everywhere else the recommended option is simply written first, which is a habit and not a stated rule.
- After a decision, only the chosen option is written into the plan or concept artifact. Rejected alternatives are not recorded.
- The repository has no 1–10 scale today. The existing scales are finding severity (Critical / Important / Note), complexity (Low / Medium / High), reviewer confidence (a numeric threshold at 80), file-scope confidence (High / Medium / Low), and the percentage targets of the plan scorecard. The `Recommended workflow` field in plans and issues is a stable, machine-routed value.

Assumption: the user asking for this concept is representative of Effective Flow users in wanting more resolution than a binary recommendation, and would rather see an honest "these are close" than a confident but arbitrary single pick.

## Target users and use cases

- **Effective Flow users making plan and concept decisions:** in `plan-review` and `concept-review`, see at a glance whether one option clearly dominates or whether several are close, and spend attention only on the close calls.
- **Effective Flow users answering interactive questions in any tool:** when an `ask` question offers substantive alternatives, for example how to resolve a finding or which path to take, see a score next to each option instead of an implied "first means recommended".
- **Effective Flow maintainers:** mark once, in the source, which questions carry substantive alternatives, so that the scoring rule is applied uniformly by every harness target instead of being re-described in each tool.

## Solution sketch

Every decision in which Effective Flow weighs substantive alternatives presents each option with a fit score from 1 to 10 and a one-clause reason. The score is an **absolute** assessment of the option in the current context, not a rank. Two options may share a score, and a gap of one or two points signals that the options are nearly equivalent. No separate overall verdict such as "clear winner" is added: the spread between scores is the signal.

A short, shared calibration gives the numbers stable meaning across tools and runs:

- **1–2:** not recommended here; would cause harm or contradict a stated constraint.
- **3–4:** weak; workable only with notable drawbacks.
- **5–6:** viable; a real option with trade-offs.
- **7–8:** good; fits the context well.
- **9–10:** clearly right for this context.

Each score comes with its reason, which is short enough to read in a question dialog. A top score of 9 or 10 must also name what makes the option clearly better than the next one. That one clause is the guard against score inflation, where every plausible option drifts to a 7 or 8 and the scale collapses back into a binary signal. When the evidence does not distinguish the options, for example because the choice is a pure matter of taste, the options receive equal scores and the reason says so. A score is never invented to break a tie.

Scores are computed at the moment the question is asked, from the context of the run, and appear only in the dialog. In an interactive question the score leads the option description, for example `8/10 – keeps the change reversible`, and the option label stays unchanged. Answers are therefore still matched on stable labels, and existing flows that depend on a chosen label keep working. In the prose decision phase of `plan-review` and `concept-review`, "whether it is recommended and why" becomes "score and why". The artifact is unchanged: it records the chosen decision with its rationale, exactly as today.

Not every question weighs alternatives, and not every question is in reach. The questions `merge-gate` loads are permanently excluded, which also excludes the shared questions it pulls in wherever they appear, such as the delivery-completion choice and the security-disclosure gate. The reason is that those sources are pinned by recorded behavioural eval evidence, and scoring them would owe a multi-hour re-recording for a dialog-only improvement. Approval questions, confirmations, configuration choices that merely select a documented default, the next-step block at the end of a run, and escape options such as "Decide later", "Cancel", or "Skip" carry no score. Which questions are scored is declared per question in the source, so the build can check the declaration instead of each run guessing it. The escape options of a scored question are named at the question level as well.

The score replaces the binary recommended marker for scored questions. The rendered instruction says so explicitly: keep every label and the listed order exactly, append no "(Recommended)" marker, and begin each scored description with the score and its reason. Without that wording, a host convention that favours a single recommended option would quietly override both promises. Option order stays as the source defines it, so the positions users are used to do not move from run to run.

## Scope

### In scope (first version)

- A shared definition of the 1–10 fit score: absolute per option, ties allowed, the calibration bands above, a mandatory one-clause reason, a stated advantage over the next-best option for a 9 or 10, and equal scores when options are genuinely equivalent.
- A question-level declaration that marks an `ask` question as a decision between substantive alternatives. It is structurally exclusive with approval questions, and the escape options it exempts from scoring are named at the same level.
- Rendering of that declaration for native Claude Code, native Codex, and portable output, so that every target instructs the orchestrator to put the score and reason at the start of each scored option's description.
- A classification pass over the 37 option-bearing `ask` fences outside the `merge-gate` eval load set. It marks each one that offers substantive alternatives as scored and leaves approvals, confirmations, and default-selecting configuration questions unscored, deciding every fence explicitly rather than by its "(default)" tag.
- Replacing "whether it is recommended and why" with "score and why" in the decision phases of `plan-review` and `concept-review`. "Decide later" stays the fourth, unscored option. In the fallback where the harness question format holds the domain options only in the question text, the score and reason precede each domain option there.
- Build guards and unit tests:
  - A scored declaration is rejected on approval questions.
  - A scored question has at least two scorable options.
  - Every exempted label names an existing option.
  - The rendering of every target contains the scoring instruction.
  - Unscored questions render byte-identically to today.
  - Because the decision phase of `plan-review` and `concept-review` is prose rather than a fence, it is protected by content assertions in the workflow contract tests.
- Developer documentation of the declaration next to the existing `ask` fence description.

### Non-goals

- **No persistence of scores in artifacts.** Plans, concepts, issues, and review reports keep recording only the chosen decision and its rationale; scores exist only in the dialog.
- **No automatic decisions from scores.** A score never selects an option on its own, and unattended or non-interactive runs keep their existing default resolution.
- **No weighted multi-criteria decision matrix.** One overall fit score per option is the deliberate granularity.
- **No change to the existing scales or routed fields.** Finding severity, reviewer confidence, file-scope confidence, complexity, scorecards, and the `Recommended workflow` field stay as they are, so a fit score is not confused with any of them.
- **No scores on any question in the `merge-gate` eval load set, now or later.** This covers the 10 option-bearing questions in the gate, in `iterate`, and in the shared fragments they load, and it applies wherever those shared fragments appear. The recorded eval evidence stays valid.
- **No scores on approvals, confirmations, default-selecting setup questions, the next-step block, or escape options,** because none of them weighs alternatives.
- **No runtime reordering of options by score,** so that users' familiarity with option positions is preserved.
- **No configuration switch in the first version.** Scoring is part of the decision contract, not an opt-in preference.
- **No measurement of score calibration against later outcomes.** Whether a 9/10 option actually turned out better is not tracked.

## Technical direction

The change lives entirely in the existing source-to-dist pipeline: Markdown sources under `src/`, transformed by the dependency-free Node.js build into the native Claude Code, native Codex, and portable targets. No runtime script, no persisted state, and no new dependency is needed.

The `ask` fence grammar gains a question-level declaration for "decision between substantive alternatives". A natural form is a new question type next to `options` and `approval`, which makes it exclusive with approval by construction. Escape options are exempted by a question-level list of their labels, never by an extra line under an option. The option grammar accepts exactly label/description pairs, and an unexpected third line today silently drops every following option without an error. For the same reason, the parser gains a guard that rejects option lines it did not consume. The existing fence parser in the build library validates the declaration, and the existing target renderers add one localized line of instruction to scored questions, in English or German like the rest of the fence scaffolding. For Claude Code the instruction precedes the native question parameters. For Codex and portable output it precedes the bullet list of options. The score format `n/10` is locale-stable; only the reason follows the resolved chat language.

The calibration bands live in one shared definition in the build, and the calibration is never delivered as an eager include. Many of the affected tools have no line budget left, and an eager block of about six lines would also exceed the four lines of headroom that `plan-review` and `concept-review` have. Instead, the build renders the definition as a single compressed line into the instruction of every scored question. That line carries the bands, the tie rule, and the top-score clause. It repeats across questions, but it costs no extra line beyond the instruction itself, and it guarantees that the calibration sits in front of the model at the moment of scoring instead of behind an optional read. The decision phases of `plan-review` and `concept-review` carry the same line in their prose.

The decision phases of `plan-review` and `concept-review` change in prose only. Their artifact write rules stay untouched, which is what keeps scores dialog-only.

The renderer change must leave every unscored question byte-identical in all three targets. Only then do the excluded `merge-gate` sources, and every tool without a scored question, stay untouched by the build change.

**ADR candidate – Absolute, dialog-only decision scores:** Record that decision options carry an absolute 1–10 fit score with a stated calibration, never persisted and never auto-deciding, because it is a user-facing contract across every tool and harness target whose calibration must stay stable to remain meaningful. The decision is cheap to reverse, since nothing is persisted.

## Risks and open questions

- **False precision and score inflation:** a model may give every plausible option a 7 or 8, which would recreate the binary problem with extra noise. The calibration bands, the mandatory reason, and the top-score clause mitigate this. Whether that is enough can only be observed in use, because no calibration measurement is in scope.
- **Classification of existing questions:** deciding which of the 47 option-bearing fences weigh substantive alternatives involves judgment. The "(default)" tag is not a reliable signal: at least the setup questions for worktree use, delivery completion, and tracker mode are genuine trade-offs despite the tag. A wrong classification either scores a mechanical choice or hides a real trade-off, so planning classifies each fence explicitly.
- **Host conventions:** some hosts encourage marking the first option as "(Recommended)" and moving it to the front. The rendered instruction suppresses both, but whether every host honours that instruction is unverified.
- **Context budget:** each scored question adds at least one line in every target. Measured headroom per tool:
  - `setup`, `apply-review`, `cleanup`, `iterate`, `apply-issues`, and `maintain`: 0 lines.
  - `merge-gate`: 1 line.
  - `build`: 3 lines.
  - `plan-review` and `concept-review`: 4 lines each.
  - `plan`: 9 lines.

  A scored question in a tool without headroom therefore needs a measured budget raise.

- **Uneven experience across tools:** because the `merge-gate` load set is permanently excluded, the delivery-completion choice (pull request, merge, or branch only) stays unscored in every tool that offers it, even though it is a genuine trade-off. Users see scores in most decisions but not in that one. This is an accepted cost of keeping the eval evidence stable.
- **Option order versus scores:** keeping the source order means the highest score can appear in a later position. The order is fixed in this version. Whether users stumble over it is an observation to make after rollout, not a design question for now.

## Roadmap and work packages

1. **Scoring contract and `ask` fence grammar**
   - **Goal:** a scored question type exists in the source grammar and renders a self-contained scoring instruction in every harness target.
   - **Rough scope:** the shared score definition as a build constant, the question-level declaration with exempted escape labels, the unconsumed-line parser guard, localized one-line instructions for Claude Code, Codex, and portable output, unit tests, and the developer-guide section next to the existing `ask` fence description. No existing fence is converted yet.
   - **Done when:** a fixture fence declared as scored renders the instruction with bands, tie rule, top-score clause, and the label-and-order clause in all three targets; an approval question, a scored question with fewer than two scorable options, an unknown exempted label, and a stray option line are all rejected by the build; every existing fence renders byte-identically to today.
   - **Dependencies:** none.
   - **Handoff:** `effective-flow plan "Work package 1 — introduce the scored ask-fence question type and the shared 1–10 scoring instruction from docs/concept/2026-09-28-scored-decision-options.md, including exempted escape labels, the unconsumed-line parser guard, byte-identical rendering of unscored fences, tests, and the developer-guide section; convert no existing fence"`
2. **Scored decision phases in `plan-review` and `concept-review`**
   - **Goal:** the prose decision phases of both review tools ask for a score and reason per domain option, using the same calibration line.
   - **Rough scope:** replace "whether it is recommended and why" in both tools, keep "Decide later" as the fourth unscored option, cover the question-text fallback, and add content assertions to the workflow contract tests. Budgets are measured and stay within the four lines of existing headroom where possible.
   - **Done when:** both built tools carry the scoring wording and the calibration line, the contract tests pin it, and neither tool's artifact write rules mention scores.
   - **Dependencies:** work package 1, for the wording of the shared calibration line.
   - **Handoff:** `effective-flow plan "Work package 2 — switch the decision phases of plan-review and concept-review from a binary recommendation to the 1–10 fit score with reason from docs/concept/2026-09-28-scored-decision-options.md, keeping Decide later unscored and scores out of the artifacts, with workflow-contract test assertions"`
3. **Classification and conversion of existing questions**
   - **Goal:** every option-bearing question outside the `merge-gate` eval load set is explicitly classified, and the ones offering substantive alternatives are scored.
   - **Rough scope:** a per-fence classification of the 37 candidates with a one-line reason each, conversion of the scored ones, exempted escape labels where needed, measured context-budget raises for tools without headroom, and updates to unit tests that pin fence text. The 10 questions in the load set remain untouched.
   - **Done when:** each of the 37 fences is recorded in the plan as scored or unscored with its reason; the build passes with measured budgets; `pnpm eval merge-gate verify` still reports the recorded evidence as current.
   - **Dependencies:** work package 1.
   - **Handoff:** `effective-flow plan "Work package 3 — classify the 37 option-bearing ask fences outside the merge-gate eval load set and convert those with substantive alternatives to the scored question type from docs/concept/2026-09-28-scored-decision-options.md, with measured budget raises and merge-gate eval evidence left current"`

## Concept review

**Result:** Approved

| Area                  | Assessment                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Product fit           | Addresses a concrete gap: binary recommendations hide how close a decision is. Scope matches the user's request for all alternatives. |
| Scope                 | Bounded by explicit non-goals, including the permanent `merge-gate` exclusion and dialog-only scores.                                 |
| Technical feasibility | Fits the existing fence parser and renderers; one parser weakness found and turned into a guard.                                      |
| Data and security     | No persisted data, no new surface; scores exist only in the dialog.                                                                   |
| Risks                 | Inflation, host conventions, budgets, and the uneven experience are named with mitigations or accepted costs.                         |
| Roadmap               | Three ordered work packages with self-contained handoffs.                                                                             |

### Findings

- **Important – Per-option exemption marker (incorporated):** an extra line under an option would silently drop every following option in the current parser. Exemptions moved to the question level, and the parser gains a guard against unconsumed option lines.
- **Important – `merge-gate` eval cost (decided):** 10 option-bearing questions sit in the eval load set, several of them shared fragments. Decision: permanently exclude them, keeping the recorded evidence valid and accepting that the delivery-completion choice stays unscored.
- **Important – Context budget (incorporated):** measured headroom recorded under risks; the calibration is never an eager include and scored questions in tools without headroom need measured raises.
- **Important – Calibration delivery (decided):** a single compressed line rendered into every scored question, so the bands are present at the moment of scoring.
- **Important – Prose decision phases unguarded (incorporated):** the primary use case is prose, not a fence, so content assertions in the workflow contract tests protect it.
- **Important – Host convention (incorporated):** the rendered instruction now explicitly keeps labels and order and suppresses the "(Recommended)" marker.
- **Important – Fence count (incorporated):** corrected to 48 fences, 47 of them option-bearing, and noted that individual unit tests pin fence labels, order, and phrases.
- **Note – Score inflation (decided):** a score of 9 or 10 must name what makes the option clearly better than the next.
- **Note – Option order (incorporated):** turned from a design question into a post-rollout observation, consistent with the non-goal.
- **Note – ADR rationale (incorporated):** justified by the stable cross-harness calibration, not by irreversibility.
- **Note – "(default)" tag unreliable (incorporated):** planning classifies every fence explicitly.

## Open points

- No open points.

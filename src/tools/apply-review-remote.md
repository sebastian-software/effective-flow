---
description: "Internal sub-file of apply-review: issue-tracker integration, the external-target contract, and the complete tracker flow. Loaded by tools/apply-review.md whenever the resolved tracker target is not local."
---

# Effective Flow Apply Review – Remote mode

This internal sub-file is loaded by `tools/apply-review.md` as soon as the resolved tracker target is the forge or an external tool (the argument is an epic/container or finding issue). It contains the full issue-tracker integration, the external-target contract, and the tracker flow; on the `local` target it is never loaded.

```lazy-include
runtime-state-safety
when: a remote tracker access is about to write its local migration marker
```

```lazy-include
effective-flow-dir-migration
when: a remote tracker access is about to perform its first runtime-state mutation
```

```include
issue-tracker
```

```lazy-include
tracker-target
when: the resolved tracker target is `external`
```

## Recommended skills

- `pr-review`

## Remote mode (issue tracker)

When the resolved tracker target is the forge or an external tool (see "Issue-tracker integration (remote mode)"), the following adjustments apply **in addition to** or **instead of** the local report flow. Determine the target at the start of Phase 1; the argument type takes precedence over the config.

Everything below is phrased for the forge target and applies unchanged to an external target, with the resolved connection taking the place of the helper: read epic and finding issues, comments, and classification values through it, and perform every mutation under the write discipline, classification mapping, and container mechanism of the loaded `tracker-target` contract. Determine the tracker target — not only the mode — at the start of Phase 1, name it in the summary, and abort fail-closed instead of publishing to a different target than the one resolved.

### Argument detection and mode determination

Classify the passed argument via the "apply-source detection" (stage A and — for issue references — stage B) and derive mode and sub-mode from the source type:

- **`review-report`** (report file under `.effective-flow/review/`) → `local` (existing behavior, unchanged).
- **`review-epic`** (issue with `effective-flow-review-epic` label, legacy `firmo-review-epic` equivalent) → `remote`, **epic mode**: work through all finding issues linked in the epic.
- **`review-finding`** (a single finding issue or a list of finding-issue references) → `remote`, **issue-list mode**: work through exactly these findings only. The corresponding epic per finding is determined for the later check-off from the sub-issue (`Epic` field/reference), if present.
- **`remote` without argument** → list open epics and let the user choose.
- **`plan`, `container-issue` or `plain-issue`** → does not belong to `{{SKILL:apply-review}}`: point to the responsible skill (`{{SKILL:apply-plan}}` for plan files, `{{SKILL:apply-issues}}` for other issues, or `{{SKILL:apply}}` for automatic routing) and end. When delegating from `{{SKILL:apply}}` this case should not occur; the switch remains as a safeguard.

The argument type takes precedence over the config (see "Determine mode" in the tracker integration): `review-report` forces `local`, and `review-epic`/`review-finding` force the tracker target that reference belongs to — the forge for a forge reference, `external` for a tool-native one. On the forge target, detect host and CLI beforehand and check CLI availability; if the CLI is missing, abort clearly (no silent fallback to `local`). On an external target, establish the single connection and verify its capabilities beforehand instead; a missing, ambiguous, or under-capable connection aborts just as clearly, again without falling back to `local` or to the forge. Settle the container mechanism in that same step: because the epic entry is ticked off only after a pull request exists, a native parent/sub-issue relation may be used only when the connection proves it can write a sub-item's completion state; otherwise select the checklist fallback and report why.

### Phase 1 remote: Read findings from issues

Replaces reading the report file. Determine the finding issues to work through (parse the epic task list or use the passed list). Read for each finding issue the full body **and the comments fresh from the tracker** ("read comments" operation) and classify:

Resolve `language.forge` once for newly authored issue comments and checklist prose, while
preserving clearly established existing thread/body language. Resolve `language.git` once for
all commits and Conventional Commit PR titles. Pass both concrete values to delegated workflows;
stable labels, IDs, action values, references, and markers are never translated.

- **Target PR present:** if the body or a non-Effective Flow comment names a target PR
  (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), note the PR number, URL,
  head branch and base branch of the PR. A target PR overrides the
  default strategy "one PR per finding" for this finding.
- **Label `wontfix`** → do not implement, create an ADR (Phase 3 remote).
- **already checked off/closed** → skip.
- **Sub-issue without target action or prompt** (manually altered) → report as not implementable, do not guess.
- **Developer comment (non-Effective Flow) present** → implement **with context**: pass the comment text as additional context to the delegation skill. This is the remote equivalent of the local "developer note" in the "Implement with context" case. Deliberate rejection in remote mode still runs **exclusively** via the label `wontfix`, not via comment text; Effective Flow comments (e.g. `<!-- … -->`-marked status or PR-link comments) do not count as a developer note.
- **otherwise** → implement.

Create the per-finding tasks as in local mode; the finding ID is the `R-XXXXXXX` ID from the issue title.

### Phase 2 remote: Commit and PR strategy

In remote mode the commit/PR strategy is by default **"one PR per finding"** — the local commit-strategy question is omitted. Every implementable finding without a target PR is its **own component** in its own delivery branch, preferably with worktree isolation. Base branch and branch naming rely on the `delivery` config block: branch `<delivery.branchPrefix>/apply-review/<R-ID-or-slug>` off `delivery.baseBranch` (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values). File-overlapping findings run sequentially to avoid working-tree conflicts.

If a finding has a target PR from Phase 1 remote, **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the finding there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the finding as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Findings with the same target PR run sequentially so that new commits are created in order on the same PR branch. Findings without a target PR keep the default strategy "one PR per finding". The stash policy and the `/goal` string are handled as in local mode.

### Phase 3 remote: Rejected finding → decision candidate

For each `wontfix` finding, the same ownership rule as in Phase 3 (local) applies: delegate the candidate to `decision-records` (the skill decides whether an ADR is justified and authors it per the discovered repo convention; minimal living-slug fallback from `adr-convention.md` if the skill is missing). The candidate's context here references the **issue number and epic** (`Issue #<nr>` and `Epic #<nr>`) instead of a report finding; the `wontfix` rationale replaces the developer note. **No** numbered ADR is created. If a permanent ADR arises, mark the finding in the epic later via slug reference as `- [x] … — not implemented (ADR: <slug>)`; if the skill classifies the rejection as non-permanent, it stays documented without an ADR on the issue/epic (`- [x] … — not implemented (see issue rationale)`).

### Phase 4 remote: Implementation, PR and epic check-off

Per implementable finding, in its verified execution root:

1. Pre-analysis and implementation as in Phase 4.1/4.3 via the matching delegation skill
   (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`). Pass a
   developer comment detected in Phase 1 remote as additional context, together with the
   delegated workflow's absolute execution root and receipt. Do not rely on inherited CWD or
   nest an Effective Flow worktree around a reused harness-native one.
2. Commit the changes (Conventional Commit message, no internal finding IDs, no `Co-Authored-By`), push the branch.
3. If a target PR is present: **do not create a new PR**, but use the existing PR link and optionally extend the PR body non-destructively by one reference to the finding issue, if that is possible without overwriting others' changes. If no target PR is present: create exactly one PR against the base branch via `{{SKILL:pr}}` and put that reference in the PR body. Choose the form by tracker target per the `tracker-target` forge boundary: on the forge the auto-close keyword `Closes #<sub-issue>` (or `Refs #<sub-issue>`), on an external target a plain, non-auto-closing reference to the tool-native identifier, whose lifecycle the classification value and the PR-link comment carry instead. Never write `Closes #<number>` for an external finding — the code host resolves it against its own issue of that number.
4. **Immediately after a successful push or PR creation** tick the finding off in its container
   with the mechanism decided once for this run:
   - **Native parent/sub-issue relation** (preferred when the resolved connection exposes one):
     set the sub-item's own state to done and derive the container's progress from it. Do not
     additionally patch a checklist.
   - **Checklist plus exact patch** (the forge mechanism and the fallback otherwise): read the
     epic body fresh and pass its body hash, the exact finding reference, and the PR-link suffix
     to the helper's checklist patch. Preview the issue-body mutation and apply it only when the
     fresh-write precondition still matches.

   Never mix the two within one epic and never downgrade a native relation to a checklist mid-run.
   Optionally write the PR link through the helper's comment payload/mutation, or through the
   resolved connection's create-comment capability on an external target. The pull request itself
   always stays on the forge behind `origin`.

5. **If push or PR creation fails** (push rejected, no commit): mark the finding as failed, do **not** check off the epic entry, continue with the next finding.
6. **If an assigned epic is missing** (issue-list mode): implement the finding anyway and create a PR; the check-off is omitted and reported to the user.

This path creates its pull requests without the delivery completion action, so it invokes the
automatic review itself: after step 3 created a pull request, run "PR review publication" with that
pull request, whether the run is gated or under an authorized goal, and the residual finding set the
delegated workflow reported — or its explicit declaration that it has none.
Because this path creates one pull request per finding, ask the gated question only for the first
pull request and reuse that answer for every further pull request of this run — deliberately unlike
the security disclosure gate, whose offer is per run and never remembered, because this question
governs comment noise rather than disclosure.

```lazy-include
pr-review-integration
when: the completion action created or reused a pull request and the automatic PR review may run
```

### Phase 5 remote: Tracking surface instead of report

No report file is updated. Instead, ensure that all epic checkboxes or sub-item states and all sub-issue comments/classification values reflect the final state (implemented → checked off with PR link; `wontfix` with permanent decision → checked off with ADR reference; `wontfix` without permanent decision → checked off with a reference to the issue rationale, without an ADR).

### Phase 7/8 remote

Final validation and summary as in local mode; the summary additionally names the resolved tracker target (with the tool identifier and connection for `external`), the container mechanism used, the epic URL or identifier, the created PRs and the checked-off findings.

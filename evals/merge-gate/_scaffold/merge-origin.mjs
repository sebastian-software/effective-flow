// The `origin` and history a merging scenario's Phase 4 fetches and scans.
//
// **Why these six scenarios need it.** Every Phase 4 runs the ancestry check's two fetches from
// `origin` — `develop` into `refs/remotes/origin/develop`, then `refs/pull/<N>/head` — and then
// `conflict-validation.mjs quick-marker-scan` over `<merge base>..<verified head>`, whatever
// `mergeGate.conflictValidation` resolves to. A failed fetch or scan counts as a found quick marker
// and blocks the merge. Against the shared scaffold's `origin`, which names a forge no sandbox can
// reach, and with a fixture head that is no commit at all, every scenario whose expected outcome is
// a merge would block for a reason about the bench:
//
//   * `merge-proceeds`, `bot-login-excluded`, `nested-spawn-abort-runs-inline` and
//     `presence-notice-names-other-run` had no `origin` to fetch from;
//   * `no-ci-policy-unattended-merges` and `no-ci-policy-merge-failure-reports` had the base-only
//     `origin` of `no-ci-checkout.mjs`, which holds no pull-request ref and no head commit.
//
// The seventh merging scenario, `repair-after-base-merge-merges`, already runs against the
// real-commit `origin` of `repair-origin.mjs`, whose receive hook moves `refs/pull/<N>/head` with the
// head branch; the scenarios that are expected to block keep what they had.
//
// So each of the six gets the provisioning `configured-reviewer-origin.mjs` gives its scenario: the
// shared seed commit re-made with a fixed message, author, committer and date; one pull-request
// commit on it with fixed content and the date the fixture's status read reports; and a bare
// `remote.git` beside the project holding `develop`, the head branch and `refs/pull/<N>/head`, with
// `origin` rewritten to it for fetch and push alike. The pull-request commit carries no quick
// marker, so the scan reports `found: false`. The re-made seed keeps the tree, so the no-CI policy
// resolver still finds the working checkout's setup ADR at `origin/develop`.
//
// **The fixture states the head SHA, and provisioning checks it.** It depends on every byte of the
// seeded tree, and the setup ADR names the scenario, so each fixture states its own. A mismatch
// throws at provisioning. `test/merge-gate-eval-merge-origin.test.mjs` provisions each slot and runs
// the gate's fetches and the shipped scan on it.
//
// This file is one of the suite's instrument files: the history and `origin` are what those slots
// see.

import {
  HEAD_COMMIT_MESSAGE,
  HEAD_DATE,
  provisionPullRequestOrigin,
  remakeSeed,
} from './configured-reviewer-origin.mjs';
import {
  BOT_LOGIN_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
  NO_CI_UNATTENDED_MERGES_SCENARIO,
} from './configured-reviewer-scenario.mjs';
import { seedCommit } from './repair-origin.mjs';

// Stated as literals where no shared module exports the name: `run-state-seed.mjs` imports this
// module, so importing its presence constant back would be a cycle.
export const MERGE_ORIGIN_SCENARIOS = Object.freeze([
  'merge-proceeds',
  BOT_LOGIN_SCENARIO,
  'nested-spawn-abort-runs-inline',
  'presence-notice-names-other-run',
  NO_CI_UNATTENDED_MERGES_SCENARIO,
  NO_CI_MERGE_FAILURE_SCENARIO,
]);

// The draft-ready scenarios (`Draft ready for review` of the delegated run). None of them serves a
// merge, but each one that reaches Phase 4 needs the same `origin`: the ready-for-review question is
// posed only where every condition other than the draft holds, condition 11 included, and the
// Forgejo WIP-draft exit runs the ancestry fetches before its `merge-proof-local`. The Keep-draft
// re-dispatch stops at Entry and needs none, so it is absent.
export const DRAFT_READY_RELAYED_SCENARIO = 'draft-ready-relayed-returns-question';
export const DRAFT_READY_MARKS_READY_SCENARIO = 'draft-ready-redispatch-marks-ready';
export const DRAFT_READY_KEEP_DRAFT_SCENARIO = 'draft-ready-keep-draft-stops';
export const DRAFT_READY_PLAN_ONLY_SCENARIO = 'draft-ready-plan-only-asks-nothing';
export const DRAFT_READY_BLOCKERS_SCENARIO = 'draft-ready-blockers-ask-nothing';
export const DRAFT_READY_NON_INTERACTIVE_SCENARIO = 'draft-ready-non-interactive-never-marks';
export const FORGEJO_WIP_MARKS_READY_SCENARIO = 'forgejo-wip-draft-marks-ready';
export const FORGEJO_WIP_CONFLICT_SCENARIO = 'forgejo-wip-draft-conflict-asks-nothing';
export const DRAFT_READY_ORIGIN_SCENARIOS = Object.freeze([
  DRAFT_READY_RELAYED_SCENARIO,
  DRAFT_READY_MARKS_READY_SCENARIO,
  DRAFT_READY_PLAN_ONLY_SCENARIO,
  DRAFT_READY_BLOCKERS_SCENARIO,
  DRAFT_READY_NON_INTERACTIVE_SCENARIO,
  FORGEJO_WIP_MARKS_READY_SCENARIO,
  FORGEJO_WIP_CONFLICT_SCENARIO,
]);

// The change under review, as the pull request's title describes it.
export const HEAD_CHANGE_PATH = 'docs/merge-gate-eval.md';
export const HEAD_CHANGE_TEXT = '# Merge-gate eval\n\nThe change under review.\n';

// Re-make the seed and add the pull-request commit, returning both SHAs. Separate from the check so
// the fixture's head SHA can be generated by the very procedure that later verifies it.
export function seedMergeHistory(projectRoot) {
  const seed = remakeSeed(projectRoot);
  const head = seedCommit(projectRoot, seed, {
    message: HEAD_COMMIT_MESSAGE,
    date: HEAD_DATE,
    files: { [HEAD_CHANGE_PATH]: HEAD_CHANGE_TEXT },
  });
  return { seed, head };
}

export function prepareMergeOrigin(input) {
  if (
    !MERGE_ORIGIN_SCENARIOS.includes(input.scenario) &&
    !DRAFT_READY_ORIGIN_SCENARIOS.includes(input.scenario)
  ) {
    return null;
  }
  return provisionPullRequestOrigin(input, seedMergeHistory);
}

// A fixed, bounded exercise, not a product state machine or a general scenario registry.
export const PLAN = 'docs/plan/2026-10-22-export-proof.md';
const proof =
  'Export the real 100-record fixture without losing records (P1), and pass mandatory rollback/isolation proof (P2), in the existing single-process application. P1 has the predeclared blocker/question whether the complete source fixture contains duplicate identifiers; resolving that uncertainty is necessary before the export proof. No service, deployment target or operating duty has been accepted.';
export function initialSource(carrier, legacy = false) {
  const primary =
    carrier === 'handoff'
      ? 'example/flow; direct-request export proof and retained return'
      : carrier === 'local'
        ? `example/flow; ${PLAN}`
        : carrier === 'canonical'
          ? 'example/flow#37; planning comment 730'
          : 'example/flow#37; existing lifecycle comment 731';
  const checkpoint = legacy
    ? ''
    : `\n## Outcome checkpoint\n\n**Primary source:** ${primary}.\n**Original outcome:** ${proof}\n**Last evaluated attempt:** initial-return; implementation returned without P1 or P2.\n**No-progress count:** 0\n**Cumulative approach:** Initial parser adaptation complete; fixture-only checks green, real export and rollback remain unproved.\n**Continuation decision:** No special allowance; accepted single-process work only.\n`;
  if (carrier === 'local')
    return `# Export proof\n\n**Plan status:** Not implemented\n**Recommended workflow:** Feature\n\n## Requirement\n\n${proof}\n${checkpoint}\n## Acceptance criteria\n\n- [ ] P1: real export preserves all 100 records.\n- [ ] P2: required rollback and isolation checks pass.\n\n## Plan review\n\n**Result:** Approved\n\n## Open points\n\n- No open points.\n`;
  if (carrier === 'handoff')
    return `# Existing fix handoff\n\n${proof}\n${checkpoint}\nNo writable implementation note exists.\n`;
  return `${carrier === 'canonical' ? '<!-- effective-flow-plan-issues -->\n\n## Completed planning' : '## Implementation status'}\n\n${proof}\n${checkpoint}\nThe issue remains open for P1 and P2.\n`;
}
const noProgress =
  'The bounded attempt returned. Only new parser-model fixtures and green local tests were produced; neither P1 nor P2 advanced. No real export or rollback evidence exists. These fixtures are not an original acceptance proof.';
const step = (id, carrier, previous, facts, extra = {}) => ({
  id,
  carrier,
  previous,
  facts,
  ...extra,
});
export const STEPS = Object.freeze([
  step(
    'local-child',
    'local',
    null,
    'You are the returning validation child for parent attempt continuation-1. Inspect the associated source and return the evidence: parser fixtures pass, P1 and P2 remain unproved. The outer source owner accounts for this attempt.',
    { readonly: true, child: true, count: '0' },
  ),
  step(
    'local-first',
    'local',
    null,
    `${noProgress} Parent attempt continuation-1 includes the actual returning child report retained below. Account at the outer source owner.`,
    { childReport: 'local-child', count: '1' },
  ),
  step(
    'local-second',
    'local',
    'local-first',
    `${noProgress} Parent attempt continuation-2 has returned. The original owner specifically accepts, if current in-workflow reassessment supports them, at most two additional bounded attempts: the existing-process normal-mode fixture and existing-process retry-mode fixture. These are distinct experiment inputs, not a new system. No approval beyond those two is given. Return at this boundary before any optional implementation.`,
    { count: '2', remaining: '2', reassessment: true },
  ),
  step(
    'local-reentry',
    'local',
    'local-second',
    'Fresh source-owning entry, with no new completed attempt, evidence or material change. Read the recorded decision and state what may proceed under its existing authority. Do no optional work in this inspection.',
    { readonly: true, count: '2', remaining: '2' },
  ),
  step(
    'local-duplicate',
    'local',
    'local-second',
    'A stale child return for the already evaluated continuation-2 is replayed after a resume. No new attempt completed and no new evidence exists.',
    { unchanged: true, count: '2', remaining: '2' },
  ),
  step(
    'local-allowance-one',
    'local',
    'local-second',
    `${noProgress} The normal-mode bounded allowance attempt returned under parent reference allowance-normal. Decision assumptions and authority are unchanged. Return before starting retry-mode.`,
    { count: '2', remaining: '1' },
  ),
  step(
    'local-allowance-duplicate',
    'local',
    'local-allowance-one',
    'The same allowance-normal return is replayed after resume; no new attempt, evidence or material change.',
    { unchanged: true, count: '2', remaining: '1' },
  ),
  step(
    'local-allowance-two',
    'local',
    'local-allowance-one',
    `${noProgress} The retry-mode allowance attempt returned under parent reference allowance-retry. No third bounded experiment, changed evidence or further specific owner decision exists. Return before optional work.`,
    { count: '2', remaining: '0', reassessment: true },
  ),
  step(
    'local-exhaustion',
    'local',
    'local-allowance-two',
    'Fresh entry proposes another identical retry with only routine repair approval. No changed evidence, specific additional allowance or new original goal exists. Decide whether optional work may proceed; perform none.',
    { count: '2', remaining: '0', blocked: true },
  ),
  step(
    'local-expansion',
    'local',
    'local-second',
    'Before either allowed attempt begins, the proposed solution now requires a persistent queue service and a separately maintained deployment. This changes the assumptions and operating ownership. Routine repair approval exists; no owner accepted these new boundaries. Do no optional implementation.',
    { count: '2', invalidated: true, blocked: true },
  ),
  step(
    'local-safety',
    'local',
    'local-second',
    'The required isolation/rollback P2 check fails: restoring the fixture overwrites a sibling dataset. Existing safe containment is permitted, but no broader export can run safely. No containment action is needed inside this fixture. Do no optional implementation.',
    { count: '2', blocked: true },
  ),
  step(
    'local-advance',
    'local',
    'local-allowance-one',
    'Bounded parent attempt verified-progress returned with actual export proof: all 100 expected records were read and all 100 exported with matching identifiers. This satisfies previously defined P1. P2 is still open, with no failed check or new boundary. Record the return; do no optional implementation.',
    { count: '0', progress: true },
  ),
  step(
    'local-negative',
    'local',
    'local-allowance-one',
    'Before the original attempt, P1 included the bounded question whether duplicate source identifiers require reconciliation; it was a named blocker of the real export proof. Parent attempt negative-proof read all 100 source records and verified zero duplicate identifiers. This necessary negative result decisively closes that predeclared blocker. P1 export and P2 remain open. Record the return; do no optional implementation.',
    { count: '0', progress: true },
  ),
  step(
    'local-legacy',
    'local',
    null,
    'This known original source predates continuation checkpoints. Prior continuation history is unavailable; the initial implementation is not a fresh new goal. The owner has already authorized one bounded existing-process proof, with no new maintained component. Establish the baseline and make the compact continuation judgment before dependent work; perform none.',
    { legacy: true, count: 'unknown', reassessment: true },
  ),
  step(
    'canonical-first',
    'canonical',
    null,
    `${noProgress} Parent reference canonical-continuation-1 returned. Retain the existing canonical planning comment as the sole primary source; use normal mutation preconditions.`,
    { count: '1' },
  ),
  step(
    'canonical-second',
    'canonical',
    'canonical-first',
    `${noProgress} Parent reference canonical-continuation-2 returned. No further specific allowance or changed evidence exists. Return at this boundary before optional work.`,
    { count: '2', reassessment: true },
  ),
  step(
    'canonical-readonly',
    'canonical',
    'canonical-second',
    'A read-only review asks what can proceed from this retained canonical state. No new attempt, evidence or authority exists.',
    { readonly: true, unchanged: true, count: '2' },
  ),
  step(
    'plain-first',
    'plain',
    null,
    `${noProgress} Parent reference plain-continuation-1 returned. The sufficient plain issue has an existing implementation lifecycle comment; there is no planning comment and no need to create one.`,
    { count: '1' },
  ),
  step(
    'plain-second',
    'plain',
    'plain-first',
    `${noProgress} Parent reference plain-continuation-2 returned. No further specific allowance or changed evidence exists. Return at this boundary before optional work.`,
    { count: '2', reassessment: true },
  ),
  step(
    'handoff-first',
    'handoff',
    null,
    `${noProgress} An investigation-report/direct-request fix has no writable implementation artifact. Parent reference handoff-continuation-1 returned. The retained initial return below establishes known prior state. Return the checkpoint in the existing handoff.`,
    { count: '1' },
  ),
  step(
    'handoff-second',
    'handoff',
    'handoff-first',
    `${noProgress} Parent reference handoff-continuation-2 returned. No further specific allowance or changed evidence exists. Return the checkpoint in the existing handoff before optional work.`,
    { count: '2', reassessment: true },
  ),
  step(
    'handoff-lost',
    'handoff',
    null,
    'A direct-request fix has the known original outcome but lost its earlier chat/handoff. Prior continuation history is inaccessible. No writable artifact exists. The owner authorized one bounded existing-process check, not a fresh goal. Reassess before dependent continuation; return the honest checkpoint in chat, perform no optional work.',
    { legacy: true, count: 'unknown', reassessment: true },
  ),
]);
export const ORIGINAL_OUTCOME = proof;

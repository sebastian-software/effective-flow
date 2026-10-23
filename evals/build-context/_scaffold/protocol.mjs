// Suite-owned evidence protocol; no changes to shared host receipts.
export const SCHEMA = 'effective-flow.build-context/1';
export const CELL_NAMES = Object.freeze([
  'codex-cli:simple',
  'codex-cli:review-correction',
  'claude-code:simple',
  'claude-code:review-correction',
]);
export const CASES = Object.freeze({
  'approved-single-module': ['complete'],
  'review-correction': ['corrected'],
  'question-trust-and-publication': ['consent', 'refusal', 'injected', 'stale'],
  'unsupported-nesting': ['refused-before-mutation'],
  'checkpoint-drift-and-cleanup': [
    'head-drift',
    'tracked-drift',
    'untracked-drift',
    'interrupted',
    'removed-checkout',
  ],
  'control-boundary-abuse': [
    'oversized-question',
    'oversized-result',
    'missing-evidence',
    'third-party-instruction',
  ],
});
export const GATES = Object.freeze([
  'implementation',
  'documentation',
  'tests',
  'validation',
  'independent-review',
  'final-validation',
  'delivery',
  'plan-archival',
  'pilot-finalization',
  'cleanup',
  'completion',
]);
export const REQUIRED_ROLES = Object.freeze([
  'implementer',
  'test-writer',
  'independent-review',
  'validator',
]);
export const HASH = /^sha256:[a-f0-9]{64}$/;
export const digestValue = (value) => typeof value === 'string' && HASH.test(value);
export function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

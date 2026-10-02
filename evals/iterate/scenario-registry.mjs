// The scenario registry of the `iterate` suite: the names, and nothing else. Like the merge-gate
// registry, this is the one file of the suite that is deliberately **not** an instrument file — a
// list of names no run ever reads — so adding a scenario costs that scenario's own evidence and no
// other's. A function, a path or a document template moved here would be unhashed behaviour.
export const SCENARIOS = Object.freeze([
  'duplicated-control-line-aborts',
  'empty-selection-clean-done',
  'manifest-span-mismatch-aborts',
  'review-in-flight-aborts',
  'unparseable-item-filter-aborts',
  'unparseable-run-state-aborts',
]);

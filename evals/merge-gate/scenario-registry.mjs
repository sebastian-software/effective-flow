// The scenario registry: the names, and nothing else. This is the one file of the suite that is
// deliberately **not** an instrument file.
//
// It is a module of its own for exactly one reason. The membership rule for the instrument is
// "would a change here change what the run did" (see `build-identity.mjs`), and a list of scenario
// names is the one declaration no run ever reads: it tells the round coordinator which slots to
// provision and the parity contract which names to expect, and none of it reaches a sandbox. While
// the registry lived in a hashed module, declaring one new name moved the instrument digest and
// staled every archived round of every other scenario — six scenarios times five runs of
// hand-recorded sessions, paid for a change none of those runs could observe.
//
// Keeping the registry cheap by leaving the whole `suite.config.mjs` unhashed was the wrong trade,
// and the split is what replaces it. That file also binds `scenarioSetup`, `projectDocuments`, the
// tracker stub and the overlay policy, and every one of those decides what a slot sees; unhashed,
// any of them could be re-pointed while every archived stamp went on reporting current. The names
// live here and the bindings stay there, so the configuration is hashed again and this file is not.
//
// **Nothing but names belongs here.** A function, a path or a document template moved into this
// module would be unhashed behaviour — the exact hole the split closed. `validateSuite` enforces the
// two halves of the membership rule (the configuration is hashed, the registry is not), and
// `test/merge-gate-eval.test.mjs` pins this module's exports to plain lists of names.
export const SCENARIOS = Object.freeze([
  'configured-reviewer-set-aside-blocks',
  'guard-blocks-merge',
  'linked-issue-open-points',
  'merge-proceeds',
  'unreported-checks-at-phase-four',
  'unreported-checks-block-merge',
]);

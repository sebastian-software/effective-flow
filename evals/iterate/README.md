# Behavioural evals for `iterate`

A behavioural safety net under `src/tools/iterate.md`, recorded deliberately rather than in CI: no
runner here ever starts a model. Everything else that guards `iterate` checks its **text**, so a
rewrite that keeps the sentences while moving them somewhere a run never reaches passes the whole
unit suite. This suite asserts what a run **does** with a broken or empty caller contract.

The first tranche covers `iterate`'s **fail-closed input parsing**: four rules that must refuse a
delegation before anything is read, and two situations in which a run reads the forge and must then
stop without writing. Classification proper — which outcome a judged item receives — is not
covered. The plan behind it is
[`docs/plan/2026-09-21-iterate-behavioural-eval-coverage.md`](../../docs/plan/2026-09-21-iterate-behavioural-eval-coverage.md).

It runs on the shared instrument in [`../_scaffold/`](../_scaffold/) and follows the round
lifecycle, freshness rule and evidence contract of the
[`merge-gate` suite](../merge-gate/README.md) exactly. This file states only what differs; read
that one for how a round is prepared, sealed, retried, published and verified.

## The design in one paragraph

**Two observables, and a verdict is always their conjunction.** The tracker stub's call log says
what a run asked the forge for; the **exit channel** says what the run concluded. A Phase-0 refusal
leaves the call log empty, and an empty log is equally consistent with a crashed session, a prompt
that never started and a correct refusal — the host receipt deliberately carries no text. So every
prompt ends by asking the agent to pipe the tool's final report into
`scripts/report-channel.mjs`, which stores it as one bounded record beside the call log. The helper
sits **beside** an unmodified `tools/iterate.md`: unlike the merge-gate echo, nothing the tool
reads is replaced, and the instruction addresses the agent only after the tool's own report
exists. Neither observable sees git, so the round's sealing step adds a third record the run does
not write: the sandbox's git state, which every verdict requires untouched (see "The seal records
the sandbox's git state" below).

## The scenarios

| Scenario                         | Input defect or state                                                                | Verdict                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `unparseable-item-filter-aborts` | `Item filter: threads=` — the thread list is gone                                    | report carries `ABORT: unparseable item filter` and no other `ABORT:`; no forge call                      |
| `duplicated-control-line-aborts` | `Summary comment: suppressed` twice above the delimiter                              | report carries `ABORT: duplicated control line` and no other `ABORT:`; no forge call                      |
| `manifest-span-mismatch-aborts`  | two `Item:` entries, one span below the delimiter                                    | report carries `ABORT: manifest and body mismatch` and no other `ABORT:`; no forge call                   |
| `unparseable-run-state-aborts`   | `Run state: unattended`                                                              | report carries `ABORT: unparseable run-state switch` and no other `ABORT:`; no forge call                 |
| `review-in-flight-aborts`        | non-interactive, no `Review guard:` line, configured reviewer `recensor` pending     | report carries `ABORT: review still in flight` naming `recensor`; the three Phase-1 reads, each exactly once; no write at all |
| `empty-selection-clean-done`     | `threads=` names only a thread resolved since the caller read it; a second, open thread — an exact fix request — is unnamed | report carries no `ABORT:` and ends `DONE`; the three Phase-1 reads; no write at all                      |

Every scenario additionally requires the sealed git state untouched: the sandbox's `origin` at the
fixture's two SHAs, the checkout on the head branch at the head SHA, and an empty status.

The three Phase-1 reads are `review-threads-read`, `pr-status-read` and `pr-reviews-read`, which
`iterate` Phase 1 takes at one instant in PR mode. "No write" means no start record for any
operation the shipped helper classifies as a mutation, or `pr-merge` — a dry run included, because a
dry run is the first half of a write. In `review-in-flight-aborts` each read has to occur exactly
once, because the gated "Wait" branch sleeps and then re-reads the threads and the status: a second
read is that branch's signature, whatever the report says. The empty-selection fixture carries an
open thread the filter does not name, phrased as an exact fix request for line 1 of the file the
pull request adds, so a run that fell back to processing every item would most likely implement it
— an edit, a commit and a push the sealed git state records — and reply to or resolve it, a forge
write the call log records. That narrows the gap without closing it: a fallback run that classified
the thread as a question or as unsupported and wrote nothing stays indistinguishable from a correct
run. The report may still list that thread as deselected, which is a correct summary, so its
absence is not asserted.

"No forge call" is a deliberate refinement of the plan's "zero records". The built
`tools/iterate.md` lets Phase 0 step 1 parse the pull-request reference through the helper's
`reference-parse` before a later step refuses, and that operation is pure computation over its
input: no provider, no forge, no runtime state. The plan's intent is that nothing is read or written
before Phase 1, so the evaluator does not count the helper's **pure** local operations — its local
set, derived from the shipped helper, minus the runtime-state operations named in
`RUNTIME_STATE_TRACKER_OPERATIONS` (`thread-ledger-lookup` and `thread-ledger-record`, which read
and write `.effective-flow/merge-gate/`). The helper exports no such classification, so the list is
named and a unit test pins the helper's whole local set beside it: any operation added to or removed
from that set fails the test until someone classifies it. The ledger operations, `probe`, every
remote read, every write and every name the helper does not know still fail a Phase-0 scenario.

Each fixture is minimal so that exactly one rule fires, and the four Phase-0 defects were checked
against the order `iterate` Phase 0 applies its rules in: the delimiter split and the duplicate
count (step 5) come before the manifest comparison, which comes before the filter (step 6) and the
run-state switch (step 10), so no earlier rule masks a later one. The mismatch fixture carries a
non-empty region below the delimiter, so it cannot land in the one branch where a whitespace-only
region pairs with zero `Item:` entries.

## What is here

| Path                                  | What it is                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scenarios/<name>.md`                 | One scenario: prose, one prompt template, and the expected outcome as prose outside the prompt           |
| `fixtures/<name>.json`                | The stored delegation (build input, genuine built envelope, its snapshot, the one mutation, the message), the checkout SHAs, and the forge envelopes |
| `suite.config.mjs`                    | Everything the shared scaffold needs about this suite; hashed, because it binds all of it                |
| `scenario-registry.mjs`               | The scenario names, and nothing else — the one file kept out of the instrument                          |
| `_scaffold/report-channel.mjs`        | The exit-channel helper; copied into every slot's skill tree and hashed there as `skill`                 |
| `_scaffold/scenario-setup.mjs`        | Which scenario receives the reviewer rows, and the overlay that adds the exit channel                    |
| `_scaffold/project-setup.mjs`         | The sandbox checkout's `AGENTS.md` and the project-setup ADR an `iterate` run reads                      |
| `_scaffold/checkout.mjs`              | The pull-request history in the sandbox checkout and the local `origin` it fetches from                  |
| `_scaffold/evaluate.mjs`              | The `iterate`-specific outcome rules over an archived run                                                |
| `_scaffold/git-state.mjs`             | What the sealing step records of the sandbox's git state, and how the evaluator reads it back           |
| `results/<name>/run-<n>.jsonl`        | Published call logs; empty for a correct Phase-0 run                                                     |
| `results/<name>/run-<n>.report.jsonl` | Published exit-channel records — the positive observable, required for every run                         |
| `results/<name>/run-<n>.build.json`   | Per-file hashes of what that scenario loads, binding both logs to a build                                |
| `results/<name>/run-<n>.prompt.txt`   | The exact rendered prompt supplied to the fresh session                                                  |
| `results/<name>/run-<n>.git-state.json`| The sandbox's git state as the sealing step recorded it — required for every run                      |
| `results/<name>/run-<n>.metadata.json`| Safe slot, build, prompt, fixture, execution-profile and host-attestation metadata                      |

`results/` does not exist until the first round is published. Until then `pnpm eval iterate verify`
reports every scenario `absent` and exits 0, and `--mode strict` exits 1 — the release gate treats
"nothing observed" as not current. CI's `Behavioural eval evidence` step verifies this suite beside
`merge-gate` on every pull request and strictly on the release pull request, so no release can pass
that gate until a complete round of this suite is published. Before any scenario existed, the same command failed parity with
a named reason rather than reporting success over nothing; `discoverSuite` still refuses a
registered name without its scenario, fixture and evaluator branch.

The tracker stub is **shared** with `merge-gate` at `../_scaffold/remote-tracker.mjs`. It is
fixture-driven and names no tool: every operation is looked up in the slot's fixture, an undefined
one fails loudly, and the one operation it decides for itself — a `pr-merge` is recorded and refused
unless the fixture opts in — is a sandbox safety default this suite wants too. Each suite declares
it and hashes it among its own instrument files.

## What differs from the merge-gate suite

**The load set.** The seeds are `SKILL.md` and `tools/iterate.md`, plus the exit channel at
`scripts/report-channel.mjs`. `iterate`'s own delegation targets — `fix`, `refactor`, `build`,
`docs` and the code-validator worker — are deliberately **not** seeded, a departure from the
merge-gate suite's one-hop rule: every scenario ends at or before Phase 2, so no correct run
reaches them, and seeding them would stale this corpus on every edit to the four most-edited tools
for evidence that cannot depend on them. The first scenario that proceeds past Phase 2 must add
them. The rationale is in `suite.config.mjs` beside the seed list.

**The empty call log is evidence.** The evaluator's `permitsEmptyCallLog` answers `true` for every
scenario, so zero records is a valid log here rather than "a run that never started". What proves a
run happened is the exit-channel record instead: a run with none fails whatever its log holds.
Sealing follows the same line. An attempt that left a call or a report record seals as in the
merge-gate suite, and so does a **completed** attempt that left neither: sealing always requires a
host receipt attesting `completed: true`, and such a run evaluates to the finding that it reported
nothing. `retry-aborted` stays for a session that was **stopped**, attested with `stopped: true`; on
the plain stop receipt it refuses an attempt that left a call or a report, and such an attempt is
retried only as a host abort (see "Running a round"). Without that seal an honest operator with a
completed but silent session would have no exit at all, and a regression that ends silently could
be retried until some run happened to speak. A stopped attempt that left neither a call nor a report
is not thereby empty, though: a commit, a push to the sandbox's `origin` or an edit of the checkout
writes no call and no report. So `retry-aborted` observes the sealed git state exactly as `seal`
would before it retries any attempt of this suite, on either receipt, and refuses the retry when
that state holds a finding or cannot be read; a retried attempt carries the record in quarantine. A
run that made no forge call leaves no call-log file at all; sealing materialises it as an empty file
first, so the seal, the archive and every evaluation see one state, and every published run carries
a `run-<n>.jsonl`. The merge-gate suite is unchanged: its evaluator answers `false`, so an attempt
without a non-empty call log is not sealable there.

**Which unanswered calls are judged rather than discarded.** In a Phase-0 scenario every forge call
is a failure, so none may invalidate the run: a regression that proceeds into Phase 1 and asks for
something the fixture never anticipated is a failing finding, not a retried run. In a
forge-reading scenario an unanswered **read** still invalidates the run, as in the merge-gate suite,
because a run that improvised around it concluded for the wrong reason; every **write** is judged,
because an attempted write is exactly what those scenarios exist to catch. The suite therefore
declares `alwaysAllowedOperations` as a function of the scenario rather than as the merge-gate
suite's plain list.

**A decisive call is judged whatever root it ran from.** A call record whose `cwd` is missing or
names another root is normally a validity problem, because it does not show the call was made
against the sandbox. In a Phase-0 scenario a counted call fails the run by its mere presence, so a
wrong root on it cannot make the run pass; the evaluator names such calls through `decisiveCalls`,
and when there are any the runtime-root rule does not turn the regression into invalid evidence that
a retry would discard. A log holding only pure local operations keeps the runtime-root rule in full.

**The checkout has a history and an `origin`.** `iterate` Phase 1 fetches the pull request's head
branch before it observes any reviewer or selects any item, and the shared scaffold's `origin`
points at a forge URL no sandbox reaches. The suite's `prepareCheckout` hook in `checkout.mjs`,
which the shared scaffold runs after its seed commit (the merge-gate suite sets it to `null`),
therefore re-makes the seed commit with a fixed date and an explicit message, adds one head commit
with fixed content and dates, pushes both branches into a bare `remote.git` beside the checkout,
rewrites the forge URL onto it with `url.<file URL>.insteadOf`, and sets `remote.origin.pushurl`
to the same file URL. The push URL matters: a host-global `url.<base>.pushInsteadOf` outranks
`insteadOf` for pushes, so without it a push from a regressing run could resolve to the real forge
and carry the operator's credentials there, while an explicit push URL is exempt from
`pushInsteadOf`. The checkout is left clean on the head branch, tracking it — the case Phase 1
works in place from. The commits are made with hooks pointed at nothing and an empty commit
template, so no host hook or template can reach a message or a SHA. The resulting SHAs depend on
every byte of the seeded tree, and each fixture's `checkout` block states them: a mismatch fails
provisioning, so editing `project-setup.mjs` owes regenerated `checkout` blocks. A push reaches only
that local `origin`, where the sealed git state below observes it.

**The seal records the sandbox's git state.** The call log sees the forge and nothing else, so a
commit, a push to the local `origin` or an edit in the checkout would pass every scenario unseen.
The suite therefore declares `sealedEvidence`, an optional hook of the shared round (the merge-gate
suite declares none, and its seal, archive and evaluation are unchanged). When an attempt is sealed,
after every other check and after the session has ended, `git-state.mjs` reads three things and
writes them to `<attempt>/trace/git-state.json`: every ref of `<attempt>/remote.git`, the
checkout's symbolic `HEAD` and the commit it resolves to, and `git status --porcelain` with
untracked files. Each command names its repository explicitly and runs under the same
switched-off host configuration provisioning uses. The seal replaces whatever a run left at that
path, digests the file under `gitState` (an edit after sealing reads `changed-after-seal`), and
publication archives it as `run-<n>.git-state.json`, checks the copy against the seal, and judges
it from the archive.

Every scenario requires the state provisioning left: `origin` holds exactly `develop` and the head
branch at the fixture's `checkout` SHAs, the checkout stands on the head branch at the head SHA,
and the status is empty. Fetching or fast-forward pulling the head branch, which Phase 1 does,
changes none of them, and runtime state under `.effective-flow/` is ignored by the checkout's
tracked `.gitignore`. A moved, added or deleted `origin` ref, a moved `HEAD`, another branch or a
detached `HEAD`, or any uncommitted change is a **finding**, and so is a probe that failed because
the run damaged the repository: the run is judged, never retried away. A record that is missing, not JSON,
or not one the capture could have written is **invalid evidence**, because the run cannot author it
— the bench failed, and publication refuses it. No reflog length is recorded: a no-op checkout of
the current branch, which a correct run may issue, appends a reflog entry, so it is not the same for
every correct run.

**The fixture's delegation is genuine.** Every `delegation.built` is the verbatim output of the
shipped `node scripts/delegation-envelope.mjs build` (the portable build's copy), and
`delegation.snapshot` the snapshot it wrote beside it. `delegation.mutation` names the single change
the scenario is about, and `delegation.message` is its result. `test/eval-fixture-fidelity.test.mjs`
proves that the built envelope passes the shipped validator, that applying the mutation to it yields
the message, and that the rendered prompt ends with `effective-flow iterate 42` and that message byte
for byte. The receiver validates the boundary token structurally, so a stored envelope needs no
live sender.

## Running a round

Exactly as for `merge-gate`, with `iterate` as the tool name, the same pinned profile (harness
`codex-cli`, model `gpt-6-sol`, reasoning effort `medium`) and the sandbox under
`/tmp/effective-flow-iterate-eval/rounds/`:

```sh
pnpm eval iterate prepare \
  --harness codex-cli \
  --model gpt-6-sol \
  --reasoning-effort medium \
  --reported-version MODEL_VERSION \
  --tool-policy HOST_TOOL_POLICY
```

The deprecated `pnpm prepare:eval iterate <scenario>` forwards without profile flags and is
therefore refused by the pin, as it is for `merge-gate`.

Launch each slot as a fresh, non-forked session rooted in its `project/`, with only its
`prompt.txt` as input and no user-level skills — an installed Effective Flow release would shadow
the slot's own skill. Seal, retry, publish and recover with the same commands and receipts the
merge-gate README documents. A sealed run whose report record is missing, doubled or truncated is a
**finding**, not invalid evidence: the exit channel is part of what the run is asked to do. A
completed session that left neither a report record nor a call is sealed like any other and fails
on the missing report; only a session that was stopped is retried with `retry-aborted`.

A session the provider stopped after it had already called the stub or written a report is retried
on the host-abort stop receipt the merge-gate README documents in its §4: the cause, the host's
error line for the round's harness, and partial evidence that is readable and holds no decisive
finding. What is decisive differs here in two ways. **A report means the run concluded**: the prompt
asks for it as the run's last act, so a stopped session that wrote one is judged by the complete
verdict, and any finding at all — the wrong refusal, a second refusal, a missing Phase-1 read, a
second report — keeps the attempt. Without a report, a forge call a Phase-0 refusal is failed by, a
write, and a Phase-1 read taken twice where the scenario requires once are decisive, and so is the
**git state**: `retry-aborted` observes it exactly as `seal` would, any finding in it keeps the
attempt, a record it cannot read refuses the retry, and a discarded attempt carries that record in
quarantine beside its call log and report. Every slot
stops after five discarded attempts and requires investigation — the cap the merge-gate suite puts
on its sequenced scenario and the number its README names for "stop and decide". Almost nothing in
this suite is discardable by design, so a slot that needs a sixth attempt is hiding a pattern rather
than absorbing variance.

## The exit channel

`report-channel.mjs` streams standard input as bytes and appends one JSONL record per invocation
to `<attempt>/trace/report-channel.jsonl`, resolved from its own location so the run cannot
redirect it. The record is exactly `{schema, seq, text, bytes, digest, bound, truncated,
malformed, raw}`: `bytes` and `digest` describe the **whole** input, hashed and counted as it streams in;
`text` holds at most 32 KiB, cut at the last complete UTF-8 character before the bound, and only
that much of the input is ever held in memory; `truncated` says whether it was cut, and `bound`
which bound applied. `malformed` says whether the input was not valid UTF-8: `bytes` and `digest`
then still describe the raw bytes the run sent, and `text` is their decoding with every invalid
sequence replaced by U+FFFD — the raw digest is the honest record, so the helper flags the lossy
text instead of hashing it. So that the text stays bound to that digest, a malformed record also
carries `raw`, the retained input bytes behind `text` (the whole input, or the stored prefix of a
truncated one) in base64; a well-formed record states `raw: null`. The evaluator decodes `raw` and
requires it to reproduce `text` exactly and to stay within the bound, and when nothing was cut
requires it to count to `bytes`, hash to `digest` and really be invalid UTF-8. A mismatch is a
validity problem, so a hand-built record cannot pair one report's digest with another's text. Such
a record is still matched, because the replacement never produces or consumes an ASCII character. The helper refuses a terminal on standard input with an error
instead of waiting for an end of input that never comes. The text is never executed, interpreted or
echoed — the process prints a fixed receipt of sequence, size and digest. The file holds at most
four records, and the evaluator requires exactly one.

The evaluator reads the report from that record only, never from the fixture: an item text may
contain any string, a refusal line included. It never matches a truncated record, because a cut can
fall inside an `ABORT:` line and leave a prefix that reads as the expected refusal. Two refusals on
one line are two refusals: each `ABORT:` occurrence is read up to the next one.

The completion keyword is the report's last non-empty line with only emphasis and code markers
stripped, so it must be `DONE` on its own. `Status: DONE` or `Result — DONE` is **not** `DONE`, and
a clean empty selection that closes that way fails. This is deliberate and matches the merge-gate
suite's keyword-less-return rule: the contract is a bare closing keyword, and a caller that has to
find it inside prose is reading prose.

## What this deliberately does not cover

- **Classification proper.** Which outcome a judged item receives is the next tranche, and it is
  what keeps section 5 of the architecture review at `partial`.
- **`control-line-in-body-is-data`.** Its correct behaviour is to continue, so it can only be
  observed by a run that proceeds past Phase 2 — the tranche that must also seed `iterate`'s
  delegation targets.
- **`unparseable-language-context-aborts`.** A real fail-closed rule whose failure mode is a wrong
  language in a commit message; it is the cheapest scenario to add next.
- **Which sentence decided.** The evidence records what the run asked the forge for and what it
  reported, not which rule in the tool produced the report. A report carrying the right refusal
  from a run that made no call is the strongest statement available, and it is still a statement
  about the run rather than a proof about the text.
- **Git history a run erased.** The sealed git state is the state the session ended in. A run that
  committed and then reset the commit away, or pushed and then restored the ref, leaves nothing
  there; one that leaves the commit, the push or the edit is caught.
- **A fallback that writes nothing.** In `empty-selection-clean-done`, a run that ignored the filter
  and processed every item, but classified the open fix request as a question or as unsupported and
  wrote nothing, is indistinguishable from a correct run on every observable this suite has. The
  fix request is phrased so that implementing it is the likely fallback, which the git state and the
  call log both catch; that is a likelihood, not a proof.

## Adding a scenario

Add all four parity members together — `scenarios/<name>.md`, `fixtures/<name>.json`, the name in
`scenario-registry.mjs`, and a branch in `_scaffold/evaluate.mjs` (`PHASE_ZERO_REFUSALS` or
`FORGE_READING`) — or `discoverSuite` refuses the corpus. The registry is unhashed, so the new name
stales no other scenario's evidence. Build the delegation with the shipped helper and store it
verbatim; state the mutation in the fixture rather than editing the message by hand; derive every
forge envelope from a provider payload through the real normalizer; and generate the `checkout`
block with `seedPullRequestHistory` from `_scaffold/checkout.mjs` on a checkout the shared
`writeProject` seeded. Keep the prompt to the discipline above: which invocation, where the paths
are, where the report goes — never what the tool should conclude.

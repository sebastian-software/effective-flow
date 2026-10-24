# Subagent progress acceptance evidence

This guide records point-in-time runtime evidence for developers assessing sparse subagent progress
in issue [#587](https://github.com/sebastian-software/effective-flow/issues/587), its
[canonical plan](https://github.com/sebastian-software/effective-flow/issues/587#issuecomment-6374950705),
and continuing [PR #591](https://github.com/sebastian-software/effective-flow/pull/591).
The [coverage inventory](subagent-progress-coverage.md) owns the source-derived reachability matrix.
This page owns the acceptance observations below, not the progress policy.

**Acceptance remains incomplete.** The observations on October 24, 2026, establish several
bounded behaviors, with different evidence strength. Claude emitted checkpoints but did not
integrate them before native child completion. A native Codex deep-validator trace contains
preterminal parent integration, but omits the complete native role and sender/recipient payload.
Current Codex App Collaboration exercised generated portable contracts, nested relays, one strict
unattended review, controlled current and legacy Iterate handoffs, busy-parent coalescing, and
lifecycle safeguards. None establishes general support for a harness, all
roles, or the full productive `apply-review` path. The policy owner remains
`src/shared/subagent-progress.md`; these experiments do not change it.

| Shape                                      | Observed                                                                                                                      | Partial or missing evidence                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Claude foreground and background validator | One generated leaf checkpoint in each run; real work continued; child completed and joined                                    | Parent integration occurred after native completion; no preterminal transport acceptance                               |
| Claude join discovery and excluded channel | Exact lookup found no callable join; foreground fallback completed; excluded-channel review completed without a send          | No global tool-availability claim or attempted runtime-denial coverage                                                 |
| Native Codex generated roles               | Seven processes selected unmodified generated TOML files through session-only native role configuration and joined terminals  | Complete native role/sender/recipient and actual inference metadata were not serialized                                |
| Native Codex deep validator                | Wait → useful parent integration → Wait → joined final result                                                                 | One partial positive trace; no full role/sender identity activation                                                    |
| Current App generated portable contracts   | Validator checkpoint, parent relay, and terminal join; controlled docs work traversed both relay hops                         | No native custom-role selector; full `apply-review` admission, source-report, and remote gates unproven                |
| Strict unattended file review              | Valid three-control receiver, read-only judgment leaf, checkpoint relay, and join                                             | One bounded path; five-control, question, partial-result, and answer re-dispatch paths missing                         |
| Controlled Iterate receiver handoffs       | Current snapshot-2/context-1 and header-absent handoffs plus unchanged old receiver handoff completed bounded work and joined | Full productive bootstrap and merge-gate admission remain unobserved; header-absent live body was empty                |
| Busy-parent checkpoint coalescing          | Two distinct direct reviewers each sent once before terminal; parent combined confirmations once and joined both              | No simultaneous-arrival, blocking-tool interruption, latency, or all-mode guarantee                                    |
| Alternative portable host discovery        | OpenCode native help and provider commands completed with temporary isolated state                                            | No established authorized provider route under that isolation, model run, transport, or fallback acceptance            |
| Strict Iterate negative inputs             | Unknown context version and duplicate context rejected before authority-bearing work                                          | Original duplicate run violated final plain-line terminal format; fresh-process Retry 1 corrected it                   |
| Lifecycle and progress metrics             | Stale dispatch ignored; recipient mismatch suppressed sending; cancellation stopped a partial audit; phase updates used       | No technical recipient isolation, resumed cancellation, credible scoped ETA, or changing-denominator percentage branch |

## Evidence scope and provenance

The following provenance table applies to the three detailed Claude chronology runs. Later sections
identify the separate native Codex and App instruments. The commit below identifies the unchanged
implementation and generated-role baseline. The 98 added regression-test lines were an uncommitted
patch during the runs, bound separately by the test-file hash below. Matched old controls and the
unchanged legacy receiver use their separate baseline artifacts.

| Item                   | Recorded value                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Effective Flow source  | `ed93c0e2be0561ef7ffd75ae07508565ef51da12`                                                                                       |
| Host                   | Claude Code CLI `2.1.292`, print mode with stream-json output                                                                    |
| Authentication context | Existing normal first-party authentication; execution outside the sandbox                                                        |
| Selected native role   | `flow-acceptance:effective-flow-code-validator`                                                                                  |
| Role provenance        | Session-only plugin role, byte-identical to the generated Claude validator                                                       |
| Domain workload        | Read-only review of synthetic public-domain delegation-envelope fixtures                                                         |
| Run IDs                | `claude-live` (foreground), `claude-background` (background), `claude-join-discovery` (foreground fallback)                      |
| Evidence owners        | Private derived summary, native event streams, foreground review manifest, and join-discovery runner, prompt, and process record |

Claude authentication provenance is separate from the native Codex observations below. A
sandbox-only status check reported unauthenticated, while both the normal outside-sandbox check
and a real outside-sandbox login shell reported `loggedIn:true`, `authMethod:claude.ai`, and
`apiProvider:firstParty`; authenticated model runs then completed. The sandbox-only result did
not reflect normal outside-sandbox authentication. An internal keychain cause was not independently
diagnosed, and no authentication or global configuration was changed.

The fixtures are synthetic evidence inputs, not repository implementation source. The leaf reviewed
version, delimiter, and digest invariants in `delegation-envelope-core.mjs`, then input and output
handling in `delegation-envelope.mjs`. The background parent also reviewed the synthetic
`contract.test.mjs` and `boundary.md`. This is a bounded generated-role experiment, not an end-to-end
Effective Flow workflow acceptance run.

The generated role declares `SendMessage` and omits `Agent` and `Task`. The event streams show two
child `Read` calls and one child `SendMessage` call in each of the first two runs. The join-discovery
child made two `Read` calls and no `SendMessage` call. The complete runtime child tool
inventory was not serialized. Therefore the evidence proves those calls occurred, while the full
runtime inventory and absence of every other available child capability remain unobserved. Final
native subagent statistics report one spawned and one completed child per run, maximum depth one,
and zero children spawned by subagents.

The official [subagent documentation](https://code.claude.com/docs/en/sub-agents) and
[cross-session messaging documentation](https://code.claude.com/docs/en/cross-session-messaging)
are documentation provenance only. Neither substitutes for observed runtime delivery, and these
runs did not exercise cross-session messaging.

## Read the native chronology

Event numbers below are one-based line positions within each private `events.jsonl`, not comparable
between runs. A successful `SendMessage` result confirms queueing for the main conversation's next
turn. It does not establish that the parent integrated the checkpoint while the child was running.
Native lifecycle events determine the ordering; parent prose about a child still running cannot
override them. Terminal words such as `DONE` in message text are advisory, not lifecycle events.

### Foreground: `claude-live`

| Event | Observed fact                                                                                           |
| ----: | ------------------------------------------------------------------------------------------------------- |
|   6–7 | Parent requested the generated validator in the foreground; native task started at depth one.           |
|    11 | Child read the core fixture.                                                                            |
|    16 | Child called `SendMessage` with one `PROGRESS/1 claude-live-validator:` checkpoint addressed to `main`. |
|    17 | Tool result confirmed successful queueing for the main conversation's next turn.                        |
|    19 | Child continued real work by reading the CLI fixture.                                                   |
|    21 | Child produced its final report.                                                                        |
| 22–23 | Native task status became `completed`, followed by completion notification.                             |
|    26 | Parent reported that the checkpoint reached it after the child's final report.                          |

The checkpoint was emitted during real leaf work, and the leaf continued after sending. The
foreground run provides no observed preterminal parent integration. Its process exited `0`, took
34.482 seconds, did not time out, and was reaped.

### Background: `claude-background`

| Event | Observed fact                                                                                                 |
| ----: | ------------------------------------------------------------------------------------------------------------- |
|   3–5 | Parent requested the generated validator in the background; native pending count became one and task started. |
|  7, 9 | Parent performed its own fixture review.                                                                      |
|    11 | Child read the core fixture.                                                                                  |
|    17 | Child called `SendMessage` with one `PROGRESS/1 claude-background-validator:` checkpoint addressed to `main`. |
|    19 | Tool result confirmed successful queueing for the main conversation's next turn.                              |
|    20 | Child continued real work by reading the CLI fixture.                                                         |
|    31 | Child produced its final report.                                                                              |
| 32–34 | Native task became `completed`, completion notification followed, and pending count became zero.              |
|    36 | Parent prose still described the validator as running and said no checkpoint had arrived.                     |
|    40 | Parent visibly integrated the checkpoint after native completion.                                             |
|    46 | Parent produced its final report.                                                                             |

The background run demonstrates successful queueing and later parent integration. It does not
demonstrate useful preterminal integration: event 40 follows native completion at event 32. The
parent's contrary running-state language at event 36 is stale. Its process exited `0`, took
55.470 seconds, did not time out, and was reaped. No background task remained pending at event 34.

The private summary repeats a combined conclusion in both run entries. The separate conclusions
above follow each run's own native events rather than assigning the background result to the
foreground run.

### Join discovery and foreground fallback: `claude-join-discovery`

The third run tested join discovery before starting a child. Its captured runner used `--tools default`,
explicitly allowed `TaskOutput` and `ToolSearch`, and did not list either in `--disallowedTools`.
The parent first read the public `parent-progress-owner.md` input at event 2. At event 5 it called
native `ToolSearch` with `query: "select:TaskOutput"` and `max_results: 5`; event 6 returned exactly
`No matching deferred tools found`, without a callable join schema.

This establishes an unavailable join through that exact lookup in this mode and configuration. It
supports no global claim that Claude lacks a task-join tool. Configured permission names alone do
not prove that a tool is callable, and a different host, mode, configuration, or lookup remains
unobserved.

The parent therefore selected foreground fallback before dispatch: event 9 requested the same
generated validator with `run_in_background: false`. The child read the two fixtures at events 13
and 16, returned its final report at event 18, and reached native `completed` at event 19.
Completion notification followed at event 20; event 21 returned the joined `Agent` tool result
without an error flag. Final native statistics report one foreground child spawned and completed,
no background child, and no child delegation. The run observed no `SendMessage` call or permission
denial. The process exited `0`, took 37.663 seconds, did not time out, and was reaped.

This run proves join discovery followed by a completed foreground fallback. It is neither a
background execution nor a preterminal progress acceptance result. The runner and prompt constrain
experiment inputs to public source policy and synthetic fixtures. The runner uses command-local
settings and contains no credential inspection or global configuration/authentication mutation;
this observation does not audit the CLI's internal authentication behavior.

## Native Codex role and wait observations

A separately installed Codex CLI `0.163.0` ran seven sequential processes with native V2 subagents:
three role observations and four old/current controls. Each selected an unmodified generated TOML
file directly through session-only `agents.<role>.config_file`. All exited `0`, avoided timeout,
and had their process groups reaped. The processes used existing normal authentication outside the
sandbox, ephemeral read-only parent sessions, and command-local isolation settings. Neither
global authentication nor configuration was changed.

The current base `code-validator` completed syntax and two three-test groups, reported that its
own `send_message` was unavailable, and joined without a checkpoint. The deep variant completed
the same checks and reported one parent-only send. The `nodejs-reviewer` completed six tests,
reported a numeric-safety finding, and deliberately sent nothing because its review was short.
These establish productive fallback and short-work suppression as well as a partial positive trace.
They do not make the base validator or reviewer positive preterminal-delivery cases.

The deep native trace records the spawn response at line 400, Wait at 402, useful parent
integration of the syntax result while the terminal was pending at 404, another Wait at 406,
and the joined final report at 409. This ordering is stronger than completion of a single blocking
outer process. The CLI did not serialize the checkpoint's complete native sender/recipient payload,
structured spawn arguments, or actual child inference model/effort. Direct generated-role
configuration and parent/child reports support provenance, but do not independently establish the
full native role and sender identity. The base/deep developer-instruction bodies are identical;
configured model/effort differences do not prove the cause of their observed tool difference.
No permission, tier, or scheduling change was made to obtain progress.

## Current App portable contracts and relays

The current Codex App Collaboration host supplied addressed native messaging and built-in
subagents. These observations loaded current generated portable contracts; the App exposed no
native custom-role selector. The tested App shape used `gpt-6.1-sol` at high effort with generated
portable contracts through built-in Collaboration. The documentation writer and validator moved
from standard to deep because of strict cross-harness provenance risk, with Quality rather than
Fast. These runs do not attest native TOML base/variant selection.

A generated portable `code-validator` sent one checkpoint after formatting passed and before its
terminal result. Its parent received it at a natural boundary, relayed a material update using its
own upstream context, and joined the terminal. This was busy-parent delivery with no precise
latency or ordinary-wait attribution for that parent. The checkpoint reported a completed phase,
not an invented overall percentage or ETA.

The first documentation packet performed real work through the topology leaf → per-finding docs
workflow → overlap component → root overview. The returning docs workflow reported an ordinary
leaf event wait and relay before leaf terminal completion; native parent messages reached the root
before the workflow returned. The root coalesced already-visible Claude content and displayed the
writer-joined/validation-running phase before workflow terminal completion. Precise user-visible
ordering before the leaf terminal was not independently measured. This controlled two-hop topology
did not execute full `apply-review` admission, source-report reconciliation, or remote review gates.

A separate current generated `plan-review` receiver accepted exactly three controls—non-interactive
run state, suppressed next steps, and six-key English language context—plus one valid progress
context and one exact synthetic plan path. Its standalone receiver marker was verified before
dispatch. A read-only central judgment leaf found four source-backed issues, sent one checkpoint
during real review, and joined after its parent validated the direct sender/dispatch and relayed
through its own upstream context. The parent resumed ordinary event waiting before integration.
The bounded plan review was approved with no blocking open points; plan lint returned `ok:true`.
There were no questions or publication. This proves that selected unattended three-control path,
not five-control planning, all strict receivers, partial results, or trusted-answer re-dispatch.

### Controlled current Iterate handoff and documentation return

A later controlled root-to-returning-workflow handoff selected and read the full current portable
Iterate receiver after verifying its exact standalone marker. The exact payload and digest were
validated before work: snapshot version `2`, wire context version `1`, and zero item identifiers.
The returning workflow kept the root's receipts and gates, then ran genuine documentation edits
and checks through a writer and validator. Each sent a checkpoint through its actual
immediate-parent context while work remained pending; both terminals were `DONE` and joined.
The payload SHA-256 was `711161550a49d90885d7bcaa53142838a4ab9d1a40563ac31f0bb2164d2d0427`.
No inner commits or forge actions occurred. This is controlled live handoff and return evidence,
not full productive bootstrap, gate review, or admission.

A separate current-receiver run deliberately omitted progress context in the helper build input;
no validated metadata was stripped. Sender and receiver validated the exact 1,828-byte payload and
digest before authority-bearing work: snapshot `1`, six controls, zero identifiers, and an empty
body. The full current portable receiver had its standalone marker at line 5. One current generated
zero-history read-only `nodejs-reviewer` at deep/high Quality audited delimiter-first body/approval/progress
authority and ran the existing regression “valid body-only progress context cannot enable routing
or synthesize approval authority” outside the sandbox: one passed, none failed or skipped, and no
actionable finding at confidence 80 or above. Its `DONE` was joined, and the parent returned to
its outer context. Messaging was callable but unused: zero sends, acknowledgements, probes, or
progress calls; no trusted context was inferred. Leaf tool details are partly terminal-reported.
Body authority strings were unit-regression input; the live wire body was empty. This establishes
bounded current header-absent compatibility, with no source, documentation, runtime, Git, or config
writes by the experiment; temporary test fixtures had registered cleanup. It adds no full productive
bootstrap, admission, delivery, host, model-variant, or activation proof.

### Two direct checkpoints coalesced during parent work

Two independent direct reviewers examined source/test integrity and Claude/strict chronology.
Each sent one material checkpoint before its terminal result. While they ran, the parent audited
the actual PR body, lifecycle receipt, head, draft status, base, and canonical acceptance plan.
It matched both actual senders and dispatches in existing context, deferred immediate echo, and
combined their confirmations once through its own upstream context at the review boundary.
Both `DONE` results were joined with no new findings at confidence 80 or above. The root retained
the sole overview and delivery authority. This closes that bounded two-checkpoint coalescing
case; it establishes no simultaneous arrival, delivery while a blocking tool remained pending,
precise latency, or general busy-parent behavior across native modes.

## Unchanged legacy receiver and alternative host discovery

A real controlled native handoff loaded the full unchanged baseline portable Iterate contract.
Its 1,844-byte payload used snapshot version `1`, six controls, zero item identifiers, and no
progress context. Both current and old helpers validated it with `ok:true`. The old generated
deep `nodejs-reviewer` performed a source/fence regression audit and ran one focused named
current regression test, which passed. The child and returning workflow both reached joined
`DONE`; the review found no actionable issue at confidence 80 or above. Messaging was callable
but unused: zero sends. Source, documentation, and runtime writes remained zero; source/test,
bundle, and payload digests stayed unchanged. Leaf tool details are partly terminal-reported;
the parent observed the actual returning workflow terminal. This establishes bounded legacy
execution without a progress header, not full productive PR delivery or broader activation.

Fresh PATH discovery found OpenCode. Its normal sandbox help attempt failed with `EPERM` while
creating a global data directory, before model startup. With temporary XDG data, state, cache,
and config roots plus command-local pure mode and isolation, native help, run help, provider help, and provider
listing all exited `0`. Auto-update, model fetching, project configuration, external skills, and
Claude integration were disabled. The isolated provider listing found zero credentials only in
its temporary auth store, so an existing authorized provider route was not established under
that isolation. This says nothing about the user's login or host credentials. No model run,
installation, login, credential copy, global initialization, or new provider selection followed.
The official [CLI documentation](https://opencode.ai/docs/cli/) supplies context only; no OpenCode
transport or missing-channel fallback passed. Gemini, Amp, Aider, and Goose were absent from PATH
only; no broader availability claim follows.

## Strict rejection, terminal failure, and recovery

Two authenticated Claude processes read the full current generated Iterate receiver and supplied
negative arguments without executing authority-bearing work. Unknown wire context version `2`
caused four `Read` calls; two otherwise valid duplicate version-1 context controls caused three.
Both rejected the input instead of stripping context and continuing. Neither invoked config
resolution, Git/forge access, implementation, a child, messaging, or approval. Both processes
exited `0` and were reaped; process success does not mean workflow `DONE`.

The unknown-version run ended with the required plain `ABORT: unparseable progress-context switch`.
The original duplicate-context result placed that text in a code fence and followed it with prose.
That is an observed terminal-format failure and remains part of the record. A separate fresh
process retried the same unchanged duplicate input with a continuation hint and ended with the
correct final plain abort line. The runner used no session persistence, so this was Retry 1,
not a same-session resumable continuation. This narrow negative evidence does not establish full
strict Iterate execution, merge-gate transport, or reliability.

A separate Claude run explicitly excluded `SendMessage` with `--disallowedTools`; the parent's
initial tool inventory omitted it. The foreground generated validator completed a joined review
without an actual send attempt. Its reported child inventory was not independently serialized,
and the process recorded `permission_denials: []`. This is excluded-channel fallback only,
not coverage of an attempted send denied at runtime. It exited `0`, was reaped, took 49.519 seconds,
and reported USD 0.1930112 cumulative host cost.

## Lifecycle and metric boundaries

The App's actual `send_message` schema exposes only `target` and `message`, with no session-local
permission or failure-injection hook. Sending to the allowed parent cannot safely force a denial
without changing the permission boundary or violating recipient rules. Actual attempted-send
denial therefore remains unobserved; the Claude excluded-channel run proves fallback only.
Claude's post-completion integration is observed negative chronology, not a positive App
completed-dispatch-ignore result.

A native checkpoint from an active direct child used an old dispatch and contained terminal and
approval words. The parent ignored it because the dispatch did not match, with no relay,
completion, recovery, or consent effect; the child's later real terminal was joined. Another leaf
received a parent address inconsistent with its native parent, reported zero send attempts, and
completed useful evidence review without a checkpoint or address repair. Zero attempts is partly
leaf-reported; no technical recipient isolation follows.

A cancellation experiment delivered a checkpoint during a read-only coverage audit, then a native
interrupt returned the previous running state and a bounded final snapshot of `interrupted`.
The audit stayed partial, was not reported as `DONE`, and was not resumed or resurrected for
visibility. These controlled observations do not cover every productive failure, partial-result,
question, retry, or replacement path.

The operations supplied no credible scoped remaining-time estimate or stable comparable
remaining-work denominator. Phase updates and exact completed test counts were used. No positive
ETA branch or changing-denominator percentage correction was observed; no timer or helper was
added to manufacture one. Evidence inspection after completion is not a runtime status channel.

## Repository verification and behavioral evidence

The corrected elevated verification ran the repository order successfully: `pnpm agent:check`,
`pnpm test`, `node build.mjs`, then `pnpm test:distribution`. The unit suite reported 2,995 tests:
2,994 passed, one skipped, none failed. The build produced all three targets. Initial sandbox
`EPERM` failures were environment restrictions superseded by this completed run, not product
failures or reasons to weaken checks.

Three deterministic regression tests extended the focused baseline from 82 to 85 passing tests.
Two isolated mutants passed their respective 11 existing tests but failed the new discriminating
checks. This demonstrates added protection for canonical progress bytes and matching Markdown
fence length; it does not identify a production bug in unchanged source.

Read-only `merge-gate`, `iterate`, and `next-steps` eval verification commands exited `0` while
reporting stale archived evidence. No manual model round was re-recorded. Passing executable
checks and these bounded runtime experiments do not refresh behavioral eval archives or satisfy
the full cross-harness acceptance matrix.

## Cost and interpretation limits

| Run                     | Final cumulative cost reported by host (USD) | Wall time (s) |
| ----------------------- | -------------------------------------------: | ------------: |
| `claude-live`           |                                    0.1793882 |        34.482 |
| `claude-background`     |                                     0.338446 |        55.470 |
| `claude-join-discovery` |                                    0.1575483 |        37.663 |

These are descriptive per-run final `modelUsage` and cost observations, including parent and child
work. They are not a matched old/new overhead measurement or a cost budget result. The workloads,
parent scheduling, and cache usage differ; these totals support no causal overhead, reliability,
or performance claim. Token and cache telemetry remains in the retained private evidence.

### Native matched controls

These four additional Codex CLI processes used one frozen fixture/cwd, the complete matching
old/current parent owner, and unmodified matching generated base-validator roles. Each workload
ran once per arm. The order was short old, short current, full current, full old; there was no
warmup, repeated sampling, cache counterbalance, or duration calibration. Wall time covers process
spawn through completion and local output parsing, including owner/role loading; fixture creation
and provenance checks are outside the interval.

| Workload                                 | Old wall time (s) | Current wall time (s) |      Current minus old |
| ---------------------------------------- | ----------------: | --------------------: | ---------------------: |
| Short syntax-only validation             |        30.6776137 |            25.2565835 | −5.4210302 s (−17.67%) |
| Full multi-step missing-channel fallback |        40.5007567 |            45.0508971 | +4.5501405 s (+11.23%) |

The short arms ran syntax validation only. Full arms ran syntax plus three sequential three-test
groups, including a deterministic range matrix. All passed, fixture hashes stayed identical, and
every control child reported no messaging channel, zero checkpoint calls, and a joined `DONE`.
Root input/cached/output token counters were recorded, but descendant totals and monetary cost
were unavailable; complete child status-call instrumentation was also unavailable. The full
workload is meaningful multi-step fallback, not a calibrated long-duration case. These n=1 pairs
support no causal savings, whole-tree cost, cheaper-short-path, reliability, or overhead-budget
claim. The historical portable pair (123,841 → 188,103 ms, +51.89%) remains a separate experiment in
the [coverage inventory](subagent-progress-coverage.md#current-matched-portable-pair).

## Integrity and private retention

The following SHA-256 values identify the artifacts reviewed for this record. Hashes support
comparison with retained evidence; they do not make private events publicly reproducible.

| Artifact                                        | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Generated Claude validator role, all three runs | `1192f34274eccc55b1b66342391296854e8aaac4c5980ea72de8696a0aa210f2` |
| `claude-live` native event stream               | `e270031dc28b69de57c264ce32dbd005d29d6e3cfffd7f083b141bdbbe73a0e7` |
| `claude-background` native event stream         | `13c431e6a6a9f67026ed167099eeb45888afd4ccb7e6b2e01d49f7fb8e7a4bec` |
| `claude-live` prompt                            | `140e6fb99964588c99f2a85e5e87c8c62830eda24ca5da3424e95d4b0ba67fda` |
| `claude-background` prompt                      | `6c0b27b48199073bc7a376dc569628c1356fcdf7c7d6b88317ed5daf93791f2e` |
| `claude-join-discovery` native event stream     | `ad9ffdbde17b983b752a0f638a6b48aede69931a360c0d2390e8aa93639850da` |
| `claude-join-discovery` prompt                  | `0d4bca6c431f5e8a0ae73d48d7e82f50dcd0e8922088dd920e6cbb4241dec658` |
| Join-discovery `parent-progress-owner.md` input | `6acde1eeea935b9c19d85eb69d6fb2bc94e6b2dfdde67b85293b3c40c168eddc` |
| Shared `delegation-envelope-core.mjs` fixture   | `9dc6b133a316c1f2ef198f1fa9b8b39c92e1c9ab29814e3f1c025a43faf62161` |
| Shared `delegation-envelope.mjs` fixture        | `40af9afc9c027c6ca5851576056382ecd06efe093cb63a0cbe25f7a2a8e85307` |
| Background `boundary.md` fixture                | `e654839dd3796b78a97ced1721d7e39aa2be511b0c3ba4bc16bc2bb6a6cba7e6` |
| Background `contract.test.mjs` fixture          | `14584616a73f002b0565142e0fe1e607f80b8b4c620a361dd44619e415d5e6c2` |

Additional retained artifacts bind the later observations. Generated role hashes attest the
selected files, not independently serialized native inference identity. Derived summaries retain
measurement scope; raw-stream hashes retain the original failures as well as successful results.

| Artifact                                        | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Current native base-validator TOML              | `ef002888e257563d6432d560c8e9020a914c55e5539ea6ad6a8fcee86cec40d4` |
| Current native deep-validator TOML              | `e3116f02489bc66d963bc1c196eaad513bd1093024a2282c3c5d780943cf4a21` |
| Current native reviewer TOML                    | `7ffd69cc3e56f88fb5877e0c2e7f0a526cbc5311cc169303d92d8f816ee8d684` |
| Current progress owner                          | `6acde1eeea935b9c19d85eb69d6fb2bc94e6b2dfdde67b85293b3c40c168eddc` |
| Native generated-provenance summary             | `eb67bc8ccf1695ed8c10ad9a9c380910c8ddeab86ea50394030506710f53740c` |
| Native matched-control summary                  | `f3f1ef3e16a15ebd326ebbab16924c85af1cb7401f8de43b0e933b402056d324` |
| Native artifact manifest                        | `9d0070cf26d73eabc5e9cad8e72a6eaa26fb17dbb40b8380ea5c5cdb5ef886d0` |
| Native deep-validator ordered trace             | `5360a09d6c553c051a388b2192059a5912be4f71ff146f922a2eb4e805c616d2` |
| App validator portable contract                 | `18599541ffcf0a68bef37d95c785e202e256f7a42915587bc5a1c188142bc732` |
| App observations final documentation snapshot   | `507b7a124a380ace81ce2e0069127807bc549429a8f3c801d5564f418af1c1fe` |
| Unattended plan-review observations             | `4da98f13e2922100ce332c528a23e2a8171b5b92341ee29a9ca09e8d9cbc17c5` |
| Lifecycle observations summary                  | `9a7a2df1861e4307beb4adfa48f133d33fb4c078b5d91a46d493d8b86570fbc4` |
| Strict unknown-version native stream            | `d4d94c7e69d056b260306f9f39d13404209e6469c9a0e71db9503ee1a4ff2733` |
| Strict duplicate-context original native stream | `7488ec6f31ab5f97d2cf651dcf8c904026da49ddf6e79034b51b29f535fd0130` |
| Strict duplicate-context Retry 1 native stream  | `d8051e4ce2476d4b6fbe6899d045360574e6ef8afe40ebadf12eac44ecca8f32` |
| Claude excluded-channel native stream           | `90118c17fcec1bb0732cb7f087aadc8eb23a747532c11584689375382aef60b2` |
| Corrected verification summary                  | `6c138e5c8244df5682a35471e7a133fb81cbe88d3bd8f40a95e767f7d5fc2768` |

An earlier reconciliation verified the original 29 published artifact hashes and 66 native
manifest artifacts. The App summary subsequently changed only to record terminal-join cleanup;
this final documentation binds its frozen updated snapshot. The original runtime conclusions
remain unchanged.

| Additional artifact                     | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| Legacy receiver observations            | `5306dcc71a83c461f071809c6e8083549334e23a7f29d1452fd3edb113b2ce7f` |
| Unchanged old portable Iterate receiver | `d1034006f0283d8a96bf03d1c58cd50ddf7a53bdb5fe87ea472904a55635a93e` |
| Old generated portable reviewer         | `9399b278af0dd981ae27ef0d8b84af040011b90845ae64109a8792560ecc4535` |
| Legacy header-free payload              | `09d2461180e3ec0e3279f0e654c11954f1c451c01de757b3246b3c0a69dd627b` |
| Busy-parent coalescing observations     | `96d7496abd852fe0e5c0d204488347773fb064119438799bb8c3e4fad20c8b81` |
| OpenCode discovery observations         | `74ffe0659c5ea031eee55d3460a167b4cefd4a4d4acd811409d49a354c4d3bf6` |
| Current controlled Iterate payload      | `711161550a49d90885d7bcaa53142838a4ab9d1a40563ac31f0bb2164d2d0427` |
| Current header-absent observations      | `b140d2956a10827655a86e36b26d576c1bfebf93f190883eb75a6f54dca8c485` |
| Current portable Iterate receiver       | `48a5f55e2ad610ea2e92864bc11c8f7916d2dbdd2848a6300eb9c1dd65abea48` |
| Current header-absent payload           | `0dce5127bbfdac71879f579e40877e2887a8240a6493ac3473e5c8d527e1a51d` |
| Current portable reviewer contract      | `d0ea00a43fd3535e20de6b403f83934548383adb89e8a666b4bf0a19c6af4ac7` |
| Regression test file with 98-line patch | `8d5e50bfd4f8e3e9eded1db921856f48682a83bfb7d41154e706e64367751006` |

Raw event streams, transcripts, and authentication or account details stay private. This document
publishes only selected derived facts, fixture names, source provenance, and artifact hashes. It
contains no thinking content, socket details, credentials, or raw transcripts.

## Remaining acceptance work

The observed/partial/missing matrix above is the acceptance boundary. Useful preterminal delivery
and terminal joins exist for bounded current App shapes. Claude preterminal parent integration
remains unproven, and the native Codex deep trace still lacks independently serialized full
role/sender/recipient identity. No general role, tier, Fast, host, or workflow activation follows.

Full productive `apply-review` admission, source-report and remote paths, complete strict
merge-gate/Iterate execution, five-control unattended planning, other busy/delayed native receiving
modes, productive partial/question/re-dispatch paths, attempted-send runtime denial, App
completed-dispatch ignoring, generated variants, calibrated long fallback, and whole-tree cost
remain open. OpenCode discovery did not establish an authorized
provider route under isolation or run a model. Manual stale-eval rounds also remain open before
release. Preserve the original strict terminal-format failure and its separate retry when assessing
that work. The source-derived
[coverage inventory](subagent-progress-coverage.md) remains distinct from live acceptance.

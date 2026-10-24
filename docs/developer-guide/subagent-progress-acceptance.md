# Subagent progress acceptance evidence

This guide records point-in-time runtime evidence for developers assessing sparse subagent progress
in issue [#587](https://github.com/sebastian-software/effective-flow/issues/587), its
[canonical plan](https://github.com/sebastian-software/effective-flow/issues/587#issuecomment-6374950705),
and continuing [PR #591](https://github.com/sebastian-software/effective-flow/pull/591).
The [coverage inventory](subagent-progress-coverage.md) owns the source-derived reachability matrix.
This page owns the acceptance observations below, not the progress policy. Actual useful
preterminal delivery, active direct-child/dispatch provenance, checkpoint compliance, and required
joins govern acceptance. Independently serialized plaintext, full handoffs, and raw-native replay
are not universal gates; missing evidence is not a demonstrated violation.

**Acceptance remains incomplete.** The observations on October 24, 2026, establish several
bounded behaviors, with different evidence strength. Earlier Claude checkpoints were integrated only
after native child completion; a later authorized background attempt completed without a send and
added no preterminal transport acceptance. An earlier native Codex deep-validator trace omitted
full role and addressing metadata; a new CLI `0.159.3` run independently binds the exact deep role, native addressing, opaque payload,
useful preterminal integration, and join. Its encrypted checkpoint wording remains unverified.
Current Codex App Collaboration exercised generated portable contracts, nested relays, strict
unattended review, productive Strict Iterate documentation delivery, current and legacy handoffs,
busy-parent coalescing, a later productive synthetic Apply Review relay, and lifecycle safeguards.
Four approved CLI runs finished, with two bounded subjects accepted and two rejected. Two later,
separately authorized attempts added a bounded Codex fallback acceptance with observability limits
and a productive Claude attempt that was not accepted. Local reconciliation and receiver/helper
checks add source and protocol evidence without activating runtime shapes.
None establishes general support for a harness, all
roles, or the full remote `apply-review` path. The policy owner remains
`src/shared/subagent-progress.md`; these experiments do not change it.

| Shape                                      | Observed                                                                                                                      | Partial or missing evidence                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude foreground and background validator | One generated leaf checkpoint in each run; real work continued; child completed and joined                                    | Parent integration occurred after native completion; no preterminal transport acceptance                                                                       |
| Claude join discovery and excluded channel | Exact lookup found no callable join; foreground fallback completed; excluded-channel review completed without a send          | No global tool-availability claim or attempted runtime-denial coverage                                                                                         |
| Later Claude background qualification      | Same-root native completion handling bound; zero pending launches; clean supervised completion                                | `NOT_QUALIFIED_NO_SEND`; transport `NOT_ACCEPTED`; wider capability `INCONCLUSIVE`; no pending-child yield established                                         |
| Productive Claude source audit             | Native child completion before both root results; zero pending launches and clean supervised completion                       | `POLICY_FAIL` for two experiment-forbidden assigned-file Grep calls; no send; complete framed reports and completion-response binding unobservable             |
| Productive Codex portable fallback         | Complete contract reads, 137 passing tests, eight correct findings, full root/leaf reports, two native threads joined         | Accepted with scope/observability limits; 15 hash-only shell commands and encrypted handoff/tool-schema gaps; no positive progress                             |
| Local reconciliation and receiver bridge   | 17 reconciliation checks and seven actual rendered receiver/helper cases passed with independent validation                   | Static/protocol evidence only; no new model, native transport, or role activation                                                                              |
| Earlier native Codex generated roles       | Seven processes selected unmodified generated TOML files through session-only native role configuration and joined terminals  | Complete native role/sender/recipient and actual inference metadata were not serialized                                                                        |
| Native Codex deep validator                | New CLI 0.159.3 exact deep role, model/effort, native send/receipt binding, useful preterminal integration, final join        | Encrypted checkpoint wording, dispatch, word bound, and field semantics unverified; earlier trace stays partial                                                |
| Current App generated portable contracts   | Validator checkpoint, parent relay, and terminal join; controlled docs work traversed both relay hops                         | No native custom-role selector; full remote `apply-review` admission, source-report, and remote gates unproven                                                 |
| Productive synthetic Apply Review relay    | Two findings, one component, sequential Docs/validator joins, root-received preterminal component callbacks                   | Descendant callbacks are actor-reported; per-hop sender/dispatch/order/materiality detail, remote admission, and multiple-component coverage remain incomplete |
| Strict unattended file review              | Valid three-control receiver plus one local five-control Plan run, read-only judgment and review joins                        | Question, partial-result, and answer re-dispatch paths remain missing; first deep attempt was an explicit ABORT                                                |
| Controlled Iterate receiver handoffs       | Current snapshot-2/context-1 and header-absent handoffs plus unchanged old receiver handoff completed bounded work and joined | These earlier controlled runs omit full productive bootstrap and merge-gate admission; header-absent live body was empty                                       |
| Productive production Strict Iterate       | Direct user documentation instruction, Docs/validator/Commit joins, push, guarded PR readback, three preterminal checkpoints  | Runtime progress/delivery are caller/worker packet evidence; no full merge-gate admission or reviewer provenance                                               |
| Busy-parent checkpoint coalescing          | Two distinct direct reviewers each sent once before terminal; parent combined confirmations once and joined both              | No simultaneous-arrival, blocking-tool interruption, latency, or all-mode guarantee                                                                            |
| Alternative portable host discovery        | OpenCode native help and provider commands completed with temporary isolated state                                            | No established authorized provider route under that isolation, model run, transport, or fallback acceptance                                                    |
| Strict Iterate negative inputs             | Unknown context version and duplicate context rejected before authority-bearing work                                          | Original duplicate run violated final plain-line terminal format; fresh-process Retry 1 corrected it                                                           |
| Lifecycle and progress metrics             | Stale dispatch ignored; recipient mismatch suppressed sending; cancellation stopped a partial audit; phase updates used       | No technical recipient isolation, resumed cancellation, credible scoped ETA, or changing-denominator percentage branch                                         |

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

### Later authorized background qualification

One separately human-authorized top-level Claude attempt selected the unchanged generated
background validator. Independent review of the bounded projection found **`NOT_QUALIFIED_NO_SEND`**:
transport **`NOT_ACCEPTED`**, wider capability **`INCONCLUSIVE`**. Native launch/task/run associations
bind the child's completion and the same root session's later completion handling.

The parent issued its assigned `Read` calls for `contract.test.mjs` and `boundary.md`; the bound
child issued its two for `delegation-envelope-core.mjs` and `delegation-envelope.mjs`. These are
observed path/actor bindings, not retained full tool-result or success records. Native child
completion at projection ordinals 25–26 preceded both root agent-loop results at 31 and 39–40.
Both results had zero pending launches. No observed `SendMessage`, peer binding, checkpoint, or
pending-child agent-loop result establishes a yield, active-child continuation, or useful
preterminal receipt/integration. An agent-loop result alone is not whole-workflow completion.

The retained completion excerpt contains useful postterminal domain reporting, but is truncated;
complete `DONE`/`ABORT` and terminal-report fidelity and the full child tool inventory remain
unverified. Parent-side tool availability does not establish child availability. No send does not
prove a missing or denied capability, and permitted short-work silence is not a diagnosed cause.
The supervised process exited `0`, was reaped, had no timeout or remaining process group observed,
and left no pending launch. This supports clean supervised completion, not full lifecycle or
progress acceptance. The projection is an allowlisted view, not a complete native transcript.

The earlier late-send chronology remains separate; combining its send with this attempt's
completion handling would not form a passing trace. The published canonical amendment and actual
result update retain “Revision required.” The unresolved Claude path returns to planning: no
production shape, nested exception, other role/variant, retry, additional model invocation, or
release is authorized by this result. Full shipped coverage remains required.

### Additional productive Claude source audit

A later separately authorized source-audit attempt selected the unchanged generated background
validator against current public source copies. Independent review found **`NOT_ACCEPTED`** and
**`POLICY_FAIL`**: two observed `Grep` invocations targeted the assigned public test file but
violated this experiment's frozen Read-only tool shape. The normal generated validator permits
`Grep`; these calls establish neither a foreign or credential read, a global permission breach,
nor a production validator defect. Subsequent assigned-file Reads do not erase the mismatch.

Native child completion at ordinals 41–42 preceded both same-root results at 51–52. There were zero
observed sends, pending-child agent-loop results, or preterminal receipts. Full framed child/root
domain reports and exact completion-response bindings were unavailable: completion handling and
terminal consumption remain `UNOBSERVABLE`. Do not borrow the earlier no-send attempt's stronger
completion binding. A child text `DONE`, native `completed`, and exit `0` do not establish domain
`DONE`, accurate source findings, or faithful final-report consumption. Wider capability remains
`INCONCLUSIVE`; this adds no accepted transport or domain-report evidence.

The process was reaped without timeout or a remaining group observed, with zero pending launches.
Both native result frames repeat cumulative API duration 77,948 ms and cost USD 0.6496897; those
repeated values must not be summed. They are native result scopes, not an independently verified
invoice or matched cost comparison. The USD 4 CLI option was a setting, not a guaranteed billing
ceiling. Both separately approved additional CLI permissions are consumed. This result authorizes
no retry, new rule relaxation, nested exception, or production activation; the unresolved Claude
path returns to planning. Earlier late-send and no-send observations retain their separate outcomes.

## Native Codex role and wait observations

### Earlier CLI 0.163.0 observations

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

### Independently typed CLI 0.159.3 deep-role observation

One new non-ephemeral native run on source `c651aba17cc33d4e7fa85d686b388b91d1fa5fb0`
selected the exact generated `effective-flow-code-validator-tier-deep` TOML with zero inherited
turns and no child model or effort override. Source and registered role bytes match
`e3116f02489bc66d963bc1c196eaad513bd1093024a2282c3c5d780943cf4a21`.
Typed native metadata records that role and its actual immediate parent; inference contexts record
child `gpt-6.1-sol`/high and parent `gpt-6-sol`/medium. The standard validator was promoted one tier
to deep for cross-artifact and protocol-boundary validation, using Quality. This resolves the role
and addressing evidence gap for this new shape; the earlier trace retains its missing fields.

An actual child send and native parent receipt have matching sender, recipient, and opaque-body
SHA-256 `e5f9046e8eefb90cca479370c9ce5e6b8e724f8da4a4e25e8c4861bf1ecf7843`.
The parent integrated the archive result of 16/16 about 69 seconds before the child's terminal;
ten further child checks completed after integration. The final native wait returned after child
completion, and both terminals were joined. Independent review corroborated typed native events,
role bytes, domain outputs, and protected hashes; the root verified all 26 retained artifact hashes.
The parent stdout report alone is not the basis for these observations.

Domain work passed 16/16 archive checks and the unchanged planning baseline 1/1, with all 16
protected fixture hashes unchanged. Earlier workflow packages were consistency-checked, not rerun.
The isolated child disclosed that the central delivery skill was unavailable and used its permitted
minimal validation fallback. Recorded wall time was 119.05 seconds; separate per-thread token
counters describe one unpaired run and establish no cost or reliability result.

Neither the stored checkpoint nor child assignment was decrypted. The literal `PROGRESS/1`
prefix, dispatch, 20-word bound, field completeness, message semantics, and full readable handoff
compliance remain encrypted and unverified. Native role/addressing/opaque-payload binding, useful preterminal parent integration, and joins
establish bounded direct transport/use evidence. The unverified literal properties are not
observed violations; no universal plaintext-serialization prerequisite follows. No other role, variant, Fast,
App TOML selector, host, background mode, or additional relay hop is covered. A separate capacity
error occurred after this completed exit-0 experiment; it did not turn the experiment into a failed
run, and no rerun followed.

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

## Current PR591 runtime packages

The earlier sixteen-case Apply Review and unattended Plan packages, a later eight-case Apply Review
relay, and a production Strict Iterate continuation have separate evidence scopes. None grants
general remote or cross-host acceptance.

### Productive local Apply Review

The local Phase 1–8 run admitted two fresh distinct v1 findings with sixteen failing CLI
reproductions. Two parallel read-only preanalysis leaves joined, and their combined-scope advice
was corrected before writes. One overlap component then ran Docs writer and validator workflows
twice: the first pair joined at 8 passing and 8 known failures, and the second at 16 passing and
0 failures. Four leaf joins and the component join completed before a fresh report reconciliation.
An independent final validator confirmed 16 passing and 0 failing checks, two exact implementation
notes, only `docs/archive-guide.md` changed, an empty index, no commits or stashes, unchanged
protected sources, and removed owned wisdom. The component supplied one direct native checkpoint
before its component terminal;
the short leaves supplied no fresh checkpoint. This is a bounded local synthetic fixture, not
remote Apply Review, multiple parallel components, or a general leaf-relay result.

### Later productive synthetic Apply Review relay

A separate current portable Apply Review Phase 1–8 run used a private synthetic standalone local
repository and two distinct admitted v1 documentation findings. Two parallel read-only preanalyses
joined, then one overlap component ran two fresh Docs workflows sequentially, each with a writer
and independent validator. All four leaves, both Docs workflows, and the component joined.
The baseline was 0/8; the first finding reached an intermediate 4/8, the second independent
validation reached 8/8, and the root's existing Phase 7 gate freshly confirmed 8/8. Only the
synthetic `docs/cli-integration-guide.md` changed; 22 protected files, HEAD, branch, and staging
semantics stayed unchanged. The report was reconciled after every component terminal, owned
wisdom was safely deleted, and no correction, stash, commit, or publication occurred.

The root directly received five material native component callbacks before the known terminal;
these first-party observations retain their value without a later raw replay.
The component reports four native callbacks per Docs child; each Docs workflow reports one
callback per leaf (four leaves total). These are different evidence owners: descendant callbacks
were not received directly by the root. Their actor records are relevant, but this compact packet
lacks specific per-hop sender/dispatch/order/materiality facts needed to prove every relay claim.
The gap is those facts, not the absence of a preferred serialized replay.
This supports a bounded returning-relay observation through actual workflows, without native
custom-role selection, Claude, remote admission, multiple components, or real reviewer provenance.
The root used memory-only recorder exec calls; no zero-overhead, comparable timing/token,
reliability, or cost claim follows. This eight-case packet neither replaces nor retags the earlier
sixteen-case fixture, whose short leaves remained silent.

### Productive full unattended Plan

The local Plan 1–7 run used a 447-byte envelope with five required controls plus optional context,
digest `add06a6f0ff5648d7b23c8916f457abeb983ba29099f79c501f2256fb068ba06`, trusted issue 41, and
inert embedded issue/control-like strings. The code-context, plan, gap-judgment, and separate
review phases completed with no question. The gap judgment corrected an invented boundary using
the actual predicate and owner comment. The first deep reviewer remains an explicit `ABORT`:
its broad integrity reread of the forbidden trusted issue-JSON bytes crossed the no-reread boundary,
and its terminal and counterexample
artifacts remain retained. One fresh Retry 1 used seven enumerated tracked paths without recursive
or private reads; the independent judgment and reviewer returned `DONE` with no findings. Final
lint was open/en/Feature with zero placeholders, duplicates, or open points; one new plan was
created, the legacy plan was preserved, seven tracked hashes plus HEAD and index stayed unchanged,
and the non-interactive, no-consent publication gate with configured completion `pr` ended before
availability, Git, or forge operations. Direct native checkpoints arrived before their corresponding
terminals, and the Plan relayed its own context; no judgment-leaf relay proof follows.

The earlier sixteen-case Apply Review and unattended Plan packages are bounded synthetic evidence
through real local workflows. They do not establish native roles, variants, hosts, both transport
hops, remote Apply Review, full Merge Gate, or productive partial/question/re-dispatch. Separate
observations narrow only their recorded gaps.

### Productive production Strict Iterate documentation delivery

The selected full current Iterate receiver accepted a real direct user free-text documentation
instruction with helper-validated snapshot 2/context 1. Independent packet audit confirmed zero
`bodyItems`, zero `threadItems`, and `outcomes: []`. This is productive directly authorized work;
it supplies no reviewer BodyItem, reviewer identifier, or invented review provenance.

The completed worker/caller packet records actual Docs writer and independent validator joins,
then the Commit workflow, exactly the two progress guides committed as
`c651aba17cc33d4e7fa85d686b388b91d1fa5fb0`, a normal push to PR #591, and fresh
body-hash-guarded exact PR-description readback. The root freshly observed all four CI checks green
at that head. The audit independently confirmed the commit's two-path scope and retained passing
Retry 1 logs. Initial sandbox validation failed signature/network checks and build `EPERM`; it
never passed. Separate outside-sandbox Retry 1 passed the ordered gate with 2,994/2,995 tests
passing, one skipped, then successful build and distribution checks. Sandbox context and process
provenance remain worker/caller evidence rather than facts inferred from text logs alone.

The parent packet records three material preterminal direct returning-workflow checkpoints
integrated into its overview. An initial unframed acknowledgement was ignored and not counted.
One fourth, earlier-generated queued checkpoint arrived after the root already knew the child had
completed; it was ignored, with no relay, authority effect, or resumption. This is a bounded App
completed-dispatch association observation, not an assertion that a send occurred after terminal.
Progress timing, preterminal UI, workflow joins, push, and PR readback remain retained caller/worker
packet evidence; this audit did not independently replay raw native events for those claims.
Full Merge Gate admission/transport and positive reviewer-body provenance remain open.

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
Claude's post-completion integration remains negative chronology. The later production Strict
Iterate packet separately records bounded App completed-dispatch ignoring as caller evidence;
no host-wide guarantee or postterminal send follows.

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

Use a scoped ETA when the operation/provider supplies a credible estimate; otherwise use fixed
comparable counts, then phase updates. These operations supplied no credible ETA or comparable
remaining-work denominator. Exact check counts, including 0/8 → 4/8 → 8/8, are valid count updates,
not overall percentages. No positive ETA or changing-denominator percentage correction was
observed; this evidence gap does not require manufacturing either. Evidence inspection after
completion is not a runtime status channel.

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

A later local package independently reconciled 16 base roles with 70 generated artifacts
(21 Claude, 33 Codex, 16 portable), 54 spawn sites, 14 analysis sites, and 30 adapters. Seventeen
reconciliation checks and seven actual rendered-receiver/helper cases passed, then passed an
independent replay and integrity review. The bridge uses the actual three generated receiver roots
with and without trusted context, plus the frozen legacy selection. It preserves exact synthetic
reviewer-body bytes, inert body-only controls, trusted-context selection, and legacy fallback.
Eight retained source copies match current owning bytes; native TOML equivalence supplies byte
provenance only. These finite dimensions are neither a Cartesian-product experiment requirement
nor a future-host obligation. Local helper/source proof adds no native/model acceptance. The
unchanged 2,995-test suite was not repeated for this package.

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

### Recovered current fallback telemetry

A later recovery reconciled four retained native trees under CLI 0.159.3 and `gpt-6.1-sol`/high,
using the complete matching old/current generated portable contracts and frozen domain inputs.
Successful spawn-returned paths were matched to unique child metadata, terminals, native joins,
and final counters: 2, 2, 3, and 3 threads respectively, with no missing edge or counter. This
resolves the initial audit's tree-completeness finding independently of the old summary helper's
inadequate completeness flag. Owned process groups are gone and cache cleanup was verified.
The missing original protected `.git`/index hash baseline remains a historical evidence gap.

| Run                    | External wall time (s) | Reconciled tree tokens, including cached input | Qualification                                                                 |
| ---------------------- | ---------------------: | ---------------------------------------------: | ----------------------------------------------------------------------------- |
| Long fallback, old     |               283.6596 |                                        687,330 | Exit 0; bounded checks passed                                                 |
| Long fallback, current |               224.8671 |                                        558,128 | Policy failed: actual `Date.now` self-measurement; exit 0 does not qualify it |
| Busy parent, current   |               120.6757 |                                        335,314 | Exit 0; bounded checks passed                                                 |
| Busy parent, old       |            Unavailable |                                        675,875 | `HOST_INTERRUPTED_UNQUALIFIED`; no external exit/wall receipt                 |

All four were fallback runs with no `send_message`, qualified checkpoint benefit, or comparative
cost pass. Long arms each passed the 61-, 14-, and 62-test groups; busy leaves passed 61 and 62
while their parent read the fourteen progress-test protections. The current long arm's forbidden
self-timing remains a policy failure. The old busy tree eventually reached native terminals, but
recovery did not invent an external exit code or wall time. Stored child assignments and returns
remain encrypted; metadata establishes joins and identity, not every plaintext compliance detail.
Concurrent work, n=1 samples, fixed order, and absent cache counterbalance prevent causal,
overhead-percentage, reliability, billing, or cheaper-short-task conclusions.

That recovery completed without a new model run. Its four remaining planned runs—current long
Retry 1, supervised old busy parent, and nested strict old/current—were not executed during that
recovery. Automatic approval review rejected the proposed runner edit and first new run because
explicit payload/destination authority was not recognized; no workaround occurred. The user later
approved exactly four prepared runs; their separate completed results follow. Original errors and
artifacts remain retained; the recovery itself is not retroactively qualified.

| Completed recovery artifact | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| Completion report           | `f583d9ab022fcefc9a31bfceb5886a30cc5ced08b40185f0f58267ae6a2d3435` |
| Final verification          | `d749621649dd19c142d93f5e41f2b35c27e01437ffaa865b2999a935ca9fd695` |
| Completion manifest         | `6b32f177cb3aa015ac639c8308cd300ca95678ef28c9c48fdf54998f94dcc7ee` |

### Completion of the four approved runs

Exactly four sequential CLI 0.159.3 runs used `gpt-6.1-sol`/high with a 600-second bound. All finished,
were independently reviewed, and were cleaned; no fifth run occurred. Execution completion and
subject acceptance remain distinct:

| Approved package             | Independent outcome                      | Wall time (s) | Retained tree tokens | Native tool calls |
| ---------------------------- | ---------------------------------------- | ------------: | -------------------: | ----------------: |
| Supervised busy-old recovery | Accepted with receipt-retention caveat   |        85.112 |              395,682 |                15 |
| Long-current Retry 1         | ABORT / not accepted                     |       438.690 |            1,280,799 |                22 |
| Nested strict old            | ABORT / not accepted                     |       331.447 |            1,069,532 |                25 |
| Nested strict current        | Accepted with scope and transport limits |       323.047 |            1,543,447 |                33 |

Busy-old passed 61+62 tests and supports bounded compatibility. Its standalone cleanup-receipt
timestamp is mutable during later recovery; the original embedded receipt remains the immutable
anchor. Long-current Retry 1 passed 61+14+62 tests but ABORTed over self-reported embedded-contract
transcription errors and a confirmed missing terminal schema declaration. Nested-old performed
meaningful independent review and joined its children, but actually ran prohibited broad
`git ls-files`; its ABORT remains. Nested-current completed independent judgment, only authorized
synthetic-plan edits, accurate single-plan lint, and all joins. Its plan remains “Revision required”
with two open points; accepted review execution does not approve that plan.

All 11 retained native threads reconcile through unique spawn-return/native-parent metadata,
terminal outputs, and final counters. Owned groups and caches are gone. All 389 Git-file
hashes per arm stayed unchanged; payload changes were limited to authorized synthetic-plan edits. Original
results and embedded cleanup receipts remain bound in the 32-file completion manifest.

The four host-run wall regions total 1,178.296 seconds, excluding preparation, external review,
and re-entry pauses. Aggregate retained native tokens total 4,289,460, including cached input;
these are neither billing figures nor disjoint-context sizes. Native calls count recorded
exec/spawn/wait calls; an exec can contain multiple commands. The earlier qualified busy-current
arm was 120.676 seconds, 335,314 tokens, and 12 calls, with narrower protection and different
supervision. Both busy samples are n=1 with known confounds; its earlier qualification is preserved,
not upgraded. The rejected current-long and old-nested attempts prevent a matched long or nested
cost-success pass. This finite batch establishes neither four passing subjects, useful live-progress
benefit, causal savings, reliability, nor full coverage. Rejected arms remain valid descriptive
cost records, not successful comparisons. Cost acceptance remains incomplete; there is no 10%
readiness gate or automatic requirement for two new pairs.

A later independent counter audit confirmed all four original native call totals—15, 22, 25,
and 33, totaling 95—across all 11 retained threads. It counts both native function-call and custom
call shapes with matching outputs, without counting shell commands inside exec as additional native
calls. Original wall times, tree-token totals, subject outcomes, and limitations are unchanged;
no historical correction or retagging is needed.

### Additional productive Codex portable fallback

One later separately authorized CLI 0.159.3 source-validation attempt used a built-in portable-contract
validator leaf at `gpt-6.1-sol`/high, with no native custom-role activation. Independent review found
**`ACCEPTED_WITH_SCOPE_AND_OBSERVABILITY_LIMITS`**: complete byte-matching parent/leaf contract
reads, three observed test commands passing 61/14/62 tests (137 total), eight source-correct bounded
findings, complete mandatory native root/leaf final reports, and two native threads with a matching
terminal/wait join. The 102.221-second child duration is descriptive, not a progress eligibility gate.

The supervised wall region was 135.7320107081905 seconds. Distinct native threads total 1,149,794
tokens, including 1,030,144 cached input tokens; 21 native calls comprise 18 exec calls, one spawn,
and two waits. Shell command events are a different count. The 16-file payload remained unchanged,
source HEAD/status were clean, and owned cleanup was verified. These protection checks do not
replace the earlier arms' 389-Git-file baseline or establish OS confinement.

Fifteen other shell commands retain only hashes and narrow metadata. Universal source permission,
no-self-timing, and no-hidden-repeat compliance remain `UNOBSERVABLE`, as do the actual messaging
tool schema and exact encrypted handoff. No concrete violation was observed; missing visibility is
not zero activity or blanket compliance. This limit adds no universal command-innocence gate,
and a JSON projection gap alone justifies no architecture change. No native progress send or useful nested benefit is
established. The original accepted old fallback remains 283.6596 seconds and 687,330 tokens under
its narrower qualification. Different reporting, fixture placement, privacy instrumentation, cache,
and background conditions prevent a causal speedup, matched cost-success, billing, savings, or
reliability conclusion. This new bounded acceptance neither retags the original failed current-long
attempts nor repairs the four-run batch into a successful comparison. No automatic retry follows.

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
selected files; the new CLI 0.159.3 run separately binds native identity through typed events. Derived summaries retain
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

### Current PR591 packet artifacts

The local Apply Review and unattended Plan packages were independently checked against
`packet-evidence-manifest.json`. These are the 14 retained packet artifacts used for the bounded
observations above.

| Artifact                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `apply-final-evidence.json`           | `3df7796cfdd53eab568093cb831a65e2da8c9029dd66e59bf16513e6c25d84c0` |
| `apply-initial-report.md`             | `9025d92bd5b32ed7f63647d5c5daa3dc6a53c301ce23d2aff40993ea9812126e` |
| `apply-final-report.md`               | `fa609fa13f6408d2dcb47901af37167e95756d8a37e314400d9e511b5e158c07` |
| `apply-guide.patch`                   | `ea6094ee635060cc5779dee39af9dcbc7577136a267a3d5973d19362ff9a12cd` |
| `apply-baseline-validation.json`      | `c2126430f25ffe0d13d0ba4c5a3666d8b2e4cbbd0876c3c56fa31970fed51167` |
| `plan-final-evidence.json`            | `798fe05c4ba5ba548847ac8059a4d29ae3d27f29877e5ca07cb7da2fc8afe6da` |
| `plan-final-artifact.md`              | `92d0112916c8e498144200afcaaead5ced0e1cfc3dbfc3d87877ebff8ac0c484` |
| `plan-final-lint.json`                | `46e2bb203d5a8380ca473c57f7c0bf75712017a539b288f157d78796629d6f13` |
| `plan-five-envelope.txt`              | `add06a6f0ff5648d7b23c8916f457abeb983ba29099f79c501f2256fb068ba06` |
| `plan-deep-first-terminal.md`         | `3f4df1bc9477029f70afae51e7d255d1bc0e2cc910d73103b09d6f9ba9352854` |
| `plan-deep-first-counterexample.json` | `a47b461915631aa34a55b521bb6eeb4ee57ae3e684ada2f2a19ad7347e1a0893` |
| `plan-deep-first-aborted-artifact.md` | `aac817a54e0b2ed99db697f8302c6b5973a4e677db15ec621730c1233ccebce1` |
| `plan-review-retry1-envelope.txt`     | `aa1d46785c07bd2af378c2e63fe8edf9a3505b06e44162baa61474f9b7e7881a` |
| `plan-deep-retry1-terminal.md`        | `bb54ab89a7f19299970dcab8164745832f2df4747df6e6d220102bb14db9a4c0` |

### Later four-run completion and synthetic relay artifacts

The four-run completion manifest binds 32 retained files; the separate actual Apply Review manifest
binds 13. Their reviewed hashes matched the retained bytes. Earlier packet hashes above continue
to identify the separate sixteen-case fixture.

| Artifact                                            | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Four-approved-run completion report                 | `69aef90d29cfae1e9879ffe623bf05590e44f5d564eee8bb4991965cd0ae97da` |
| Four-approved-run completion manifest               | `a8e58c57b56b120672e23afda2286bcd2c911ed640e4981b8685a14132dd3d1d` |
| Actual synthetic Apply Review evidence              | `514be2a76fd645883da1c3428a94cf9bdef29f907e4a2f592450f23ac181f55a` |
| Actual synthetic Apply Review manifest              | `48e9a758be96235d7b7dd1c3b1cc44e09b7b4b8e257ea1b2390fa292c5f60c79` |
| Actual synthetic Apply Review final validation      | `0e3e01ab015dfa86107ab146ace09f8bde6fc4e02a220dce3a088d72444ca7b4` |
| Actual synthetic Apply Review final wisdom snapshot | `66edced7bf28e9e895414e4940520e48a05d6e3aa76f21a564346e2df1b02c3f` |

### Productive Strict Iterate and new native-role artifacts

The four Strict Iterate manifest hashes matched the retained inputs. Its independent audit
separates inspectable structure and commit/log facts from caller/worker runtime claims. The native
package has separate independent typed-event review; only derived facts and hashes are published.

| Artifact                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Production Strict Iterate manifest            | `b184346f87e1b822844868784c983ed5ae8321059bf77fa085f9ec3312a01170` |
| Production Strict Iterate final evidence      | `5b6029d42c032c800783a6967e50024deb5fdcea334b74fcfa2d7742ddc66c6f` |
| Production Strict Iterate message             | `d8f2aa5e9a21d5ea21035e05023a6e949fc0bd52c35f3c4e382faa3700e6f6f2` |
| Production Strict Iterate snapshot            | `a37abf6ceb5b31dbb7e655d52f968322ef8b13e045c3457f9a158708f416ae4b` |
| Production Strict Iterate parent observations | `acc5d31bc278357cb79d5b1fb3900a5f1032e8dff7924c96c3ae039b7ce576b9` |
| CLI 0.159.3 native-role evidence              | `10650ef827714ade192108226e362df2e15500060bfd3804e712257931d32a81` |
| CLI 0.159.3 native-message evidence           | `10628b38c7126fe073165bd3428078f5a95e7813aeda173dc1f4e864d89506ee` |
| CLI 0.159.3 independent native review         | `ac2ff4adf96c207c766080bf4aa6354703334772de19c553895101b52dde8c41` |
| CLI 0.159.3 private artifact manifest         | `8a7e3a4ca453356a3116369ff2c4430fc043adba53b8cdf2236b3f83efb1ba02` |
| Independent acceptance evidence audit         | `6380a3fd2ff77e25e0b883b9925662991847ce2471b97aed0000f976ab2c6090` |

### Later Claude qualification and canonical status artifacts

The sealed actual-evidence manifest binds nine retained artifacts. Independent review scopes the
projection's native observations and omissions; the canonical amendment and completed-result
update were published and read back on the same issue #587 plan comment.

| Artifact                                         | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Authorized Claude qualification package          | `8045a54404fe74c65745210e2ddc9b5b5a033799056cdb23ef191505f0193c90` |
| Actual Claude bounded projection                 | `a01ad63ab21e84a1a1b00af5d5551b2103c81118fb10f7d447f7d1a01cbecfb1` |
| Actual Claude independent review                 | `480aca4b42451ff339e5c65eefc0999e66f9e1343d07ebaac5cace7c7b555e67` |
| Sealed Claude actual-evidence manifest           | `ce254421b8934802c30d6dd338a5b1c640f08a2baaea3641a4bf529548634144` |
| Published/read-back qualification amendment body | `5611949ef69e2206887f1b8d7a23f45f00e7e6ff23fcb4637072674d9c8520bf` |
| Earlier completed no-send canonical body         | `46a40ad5e7b2ef86008f87412b969df1076b99f6118561cd160ab30ad7e2c65e` |

### Additional reconciliation and productive-attempt artifacts

These independently reviewed packages remain separate from the historical runs. The canonical
pre-attempt body was published and read back before the additional Claude attempt. The later
additional-outcome body records both completed attempts and the evidence interpretation separately.

| Artifact                                       | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Independent local reconciliation manifest      | `e0f7ee5fa22c198d68836f145797a130608204854e442a8a257976529b867b4b` |
| Productive Codex fallback independent review   | `402077e3e3d41ed61d93d15a78748455c258d56b8d8464a1f5a31bb20fca9c0c` |
| Productive Codex fallback review manifest      | `38f6b8265f1ceb365275ed2c7fc105ab0d7b825ceb08a9b4251ee784b9c4ee9f` |
| Productive Claude independent review           | `5f349689c9b75438ad664dc13d0026ca5a5471dd651e3d3e4d0520639c3002c7` |
| Productive Claude safe projection              | `9fb13042f14e96c39032190f07a7e2362e9703129023e39e666416bf4a490ca5` |
| Pre-attempt published/read-back canonical body | `084c405bc3b1081874fc91a706ec679b2f6cf067188b255866fa5daf53907139` |
| Published/read-back additional-outcome body    | `a601a254a5bdcfeb8db3a62e3f2017b1389ca3af00cc676179294495583ca937` |
| Historical native counter audit                | `a34e6617fe39afc87e1dd3a27a1e7b03f61390be21e94645a4044ce3f7bed2a4` |
| Historical native counter audit data           | `823226c6812e5ae021c56c04a86bf941a9137baa786de2fc74d25a26a315b165` |

Raw event streams, transcripts, and authentication or account details stay private. This document
publishes only selected derived facts, fixture names, source provenance, and artifact hashes. It
contains no thinking content, socket details, credentials, or raw transcripts.

## Remaining acceptance work

The observed/partial/missing matrix above is the acceptance boundary. Useful preterminal delivery
and terminal joins exist for bounded current App shapes. Claude preterminal parent integration
remains unproven, and production is unchanged.
New native Codex deep-role, inference, and sender/recipient binding are established
for one CLI 0.159.3 shape; encrypted checkpoint wording and full readable dispatch compliance remain
unverified. No general role, tier, Fast, host, or workflow activation follows.

Full remote `apply-review` admission, source-report and remote paths, complete Merge Gate
admission/transport, positive reviewer-body provenance, other unattended-planning variants, other
busy/delayed native receiving modes, productive partial/question/re-dispatch paths, attempted-send
runtime denial, generated variants, calibrated fallback comparisons, and qualified whole-tree cost
remain open. App completed-dispatch ignoring is supported only by the bounded caller observation
above. OpenCode discovery did not establish an authorized provider route under isolation or run a
model. The shared 150 behavioral eval recordings belong to separate #581/#584 work after final joint
source; the final joint-source round remains 0/150. A fresh configured review of the current head
remains absent, with its trigger held for a qualified healthy reviewer service. Neither local
checks nor maintenance supplies that review. None of these observations refreshes evals. Preserve original strict terminal-format,
sandbox validation, and cost timer-policy failures with their separate recovery status.

**Full issue #587 acceptance remains incomplete.** The user answered the scope question:
full coverage is required before release, with no tested-slice waiver. The canonical issue #587
plan comment retains status “Revision required.” Its lifecycle amendment, earlier completed
no-send update, and pre-attempt productive-task clarification have separate historical bindings.
The same comment also records both completed additional outcomes and the evidence interpretation above.
Both additional one-use CLI approvals were consumed; neither completed attempt authorizes another
model run. The unresolved Claude path returns to planning. Issue #587 remains open and PR #591 remains Draft. This decision does not establish readiness, merge, or release acceptance.
The source-derived [coverage inventory](subagent-progress-coverage.md) remains distinct
from live acceptance.

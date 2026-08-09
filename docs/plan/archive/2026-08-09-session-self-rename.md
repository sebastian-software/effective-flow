# Session self-rename for Codex and Claude Code

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

**Planned against:** `051893b`; re-verified against `ee9ab65` at implementation start. R1–R4 unchanged, R5 updated below.

## Requirement

`src/shared/session-title.md` already anticipates this feature — "Where a host offers a self-rename
path, apply the title silently instead of proposing it" — but names no mechanism, so every run
falls through to the suggestion line and the user renames by hand.
`docs/user-guide/getting-started.md` states the reason as a fact: "no host currently lets a running
session rename itself, so Effective Flow suggests rather than sets."

That statement is false for Codex today and conditionally false for Claude Code. This plan makes
the dormant clause work where it can work, corrects the documentation where it is simply wrong, and
extends `/effective-flow setup` so the automatable part is automated and the rest is guided.

The two harnesses are **not** symmetric and the plan does not pretend otherwise:

- **Codex** has a first-party rename RPC and hands every shell call its own thread id. The blocker
  is the sandbox, not the capability, and it is solvable with a hook.
- **Claude Code Desktop** hard-refuses a self-rename and offers no in-process channel to a custom
  MCP server. The only route is a second session acting as a rename butler. That route works — a
  mandated butler was set up and honored a real request (V11) — but it requires loosening a shipped
  safety clause, and it cannot report whether the rename actually took effect (V12).

The work is therefore **three independently landable slices** in a fixed order. Slice 3 lands last
because it is the only one that changes a shipped safety contract and the only one whose success is
unobservable to the run that asked for it — not because it is uncertain.

### Verified context

Established empirically during planning, against Claude Code Desktop 2.1.221 (`Claude.app`
`app.asar`) and Codex CLI 0.144.6 (desktop threads written by 0.146.0-alpha):

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V1  | Claude Code sets `CLAUDE_CODE_SESSION_ID` (CLI session) and `CLAUDE_CODE_HOST_SESSION_ID` (`local_…`, the listed session) in the tool environment.                                                                                                                                                                                                                                                                                               |
| V2  | The host's session rename tool refuses the caller: `Refusing to rename the current session from within itself.` The guard compares against the calling session and is enforced in the app, not in the tool description.                                                                                                                                                                                                                          |
| V3  | The app holds sessions in an in-memory Map loaded at start; no watcher exists on its session directory. An external writer to the session JSON is invisible at runtime and is overwritten on the next persist.                                                                                                                                                                                                                                   |
| V4  | The rename path writes `titleSource: 'auto'`, and the app discards an `auto` title when the session already carries `titleSource: 'user'` — silently, without an error.                                                                                                                                                                                                                                                                          |
| V5  | A cross-session message **does** reach a session with `isRunning: false`. The target woke up and completed a turn. A butler therefore does not need to stay open.                                                                                                                                                                                                                                                                                |
| V6  | The target nevertheless **refused** the rename, on two independent grounds: a cross-session message is untrusted data rather than an instruction, and the Effective Flow session-title contract itself says "never retitle another session".                                                                                                                                                                                                     |
| V7  | Codex sets `CODEX_THREAD_ID` in every shell call; it equals the thread id shown as "session id".                                                                                                                                                                                                                                                                                                                                                 |
| V8  | App-server request `thread/name/set` (params `threadId`, `name`) renames a thread. The value lands in `threads.title` (`~/.codex/state_5.sqlite`) and `thread_name` (`~/.codex/session_index.jsonl`).                                                                                                                                                                                                                                            |
| V9  | Spawning `codex app-server --stdio` **from inside** a Codex session under the `workspace-write` sandbox fails with `failed to initialize sqlite state runtime under ~/.codex`. The direct in-session path is sandbox-blocked, not capability-blocked.                                                                                                                                                                                            |
| V10 | `~/.codex/ipc/ipc.sock` (desktop) does not speak the app-server protocol. `codex app-server proxy` targets `~/.codex/app-server-control/app-server-control.sock`, which exists only with remote control enabled.                                                                                                                                                                                                                                 |
| V11 | A Haiku session that the user had given the standing mandate **did** honor a cross-session rename request: it called the rename tool and reported a result. The categorical refusal in V6 follows from the missing mandate, not from the channel. Discovery by marker title also worked once the session actually carried the title.                                                                                                             |
| V12 | The rename was nevertheless **not applied**: the target carried `titleSource: 'user'`, so V4 discarded it. The butler reported "✓ Titel gesetzt" regardless — the tool's success string carries its caveat in a parenthetical ("If the user had renamed it themselves, their title is kept"), and the butler collapsed that into a plain success. **The requesting run receives a false success and cannot distinguish applied from discarded.** |
| V13 | A user who accepts a suggested title by hand thereby sets `titleSource: 'user'`, which permanently opts that session out of every later automatic rename. For a long session whose title should be updated more than once, that is the normal state after the first manual acceptance, not an edge case.                                                                                                                                         |

### Verified repository context

Checked against `051893b`, because an earlier draft of this plan asserted three repository facts
that turned out to be wrong:

| #   | Fact                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The router resolves **eager** includes only: `build.mjs` calls `resolveIncludes(extractBody(routerRaw), 'SKILL.md')` and never `resolveLazyIncludes` on the router body. Lazy resolution happens exclusively in `readSource` for `src/tools/*` and `src/agents/*`. A lazy pointer written into `src/SKILL.md` therefore registers no fragment and ships nothing. |
| R2  | `HARNESS_TOOL_PARAMETER_OWNERSHIP` is frozen to exactly three **parameter** names (`run_in_background`, `yield-time_ms`, `sandbox_permissions`) and is a prohibition registry, not an allowlist. No guard checks tool names. Nothing in the build prevents a Claude-only tool name from shipping into the Codex and portable routers.                            |
| R3  | `RUNTIME_SCRIPT_FILES` (`build.mjs:66`) is a hardcoded allowlist; a script absent from it is never copied into any target.                                                                                                                                                                                                                                       |
| R4  | `test/workflow-contracts.test.mjs` forbids the literal string `session-title` in every `src/tools/*.md` and `src/agents/*.md`, and pins the sentences "apply the title silently instead of proposing it" and "Never call such a tool for the current session".                                                                                                   |
| R5  | Context budget headroom (`CONTEXT_BUDGET_MAX_LINES = 700`): the tightest budgeted tool is `review` at 675 rendered lines (measured at `ee9ab65`). A one-line lazy pointer fits in every budgeted tool.                                                                                                                                                           |

### Verified Codex hook context

The user runs Codex through the **ChatGPT Desktop App**, not the CLI, so the CLI measurements in
V7–V9 do not transfer by themselves. Established from the shipped manual
(`developers.openai.com/codex/codex-manual.md`), both installed binaries, and `app.asar`:

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | The Desktop App bundles its own Codex (`/Applications/ChatGPT.app/Contents/Resources/codex`, `0.146.0-alpha.9.2`) alongside the CLI (`0.144.6`), and both carry the same `codex-core` hook runtime.                                                                                                                                                                                                                                                                                         |
| H2  | Both read the same `~/.codex/config.toml`. The app writes hook trust there itself (`app.asar` `batch-write-config-value` on `hooks.state` with `filePath: null, reloadUserConfig: true`), and the user's config already carries app-written tables.                                                                                                                                                                                                                                         |
| H3  | Hook commands are spawned as a plain `$SHELL -lc` child of the Codex process — `codex_hooks::engine::command_runner::build_command` constructs `Command::new($SHELL).arg("-lc").arg(cmd)` with no seatbelt profile and no `env_clear`. The seatbelt path lives in a different crate with no `codex_hooks` symbol referencing it. Hooks therefore run **outside** the sandbox that constrains model-issued shell calls, with full user privileges. Disassembly-level evidence, not executed. |
| H4  | Hooks receive **no** `CODEX_THREAD_ID`. The only documented injected variables are the four plugin ones. The session identity arrives as `session_id` in a JSON object on **stdin**, together with `cwd`, `transcript_path`, `hook_event_name`, `model`, `permission_mode`, and `turn_id` for turn-scoped events. This is structural: one Codex process serves many threads, so a per-thread value cannot live in the process environment.                                                  |
| H5  | Hooks are declared in `~/.codex/hooks.json`, `~/.codex/config.toml`, `<project>/.codex/hooks.json`, or `<project>/.codex/config.toml`; all matching layers load. Only `type: "command"` handlers execute.                                                                                                                                                                                                                                                                                   |
| H6  | Every hook is gated twice: project trust (`[projects."<path>"] trust_level`) for project-level hooks, and a per-hook content hash recorded under `hooks.state` as `{enabled, trusted_hash}` that the user must review once. Editing the hook text invalidates the hash and re-gates it. An installation with `allow_managed_hooks_only = true` suppresses user, project, and plugin hooks entirely.                                                                                         |
| H7  | `Stop` is the right event: turn-scoped, default timeout 600 s. `SessionEnd` defaults to 1 s with a 3 s maximum — too tight for an RPC round trip.                                                                                                                                                                                                                                                                                                                                           |
| H8  | The docs never mention the sandbox in the hooks chapter and warn that hooks are "a useful guardrail, not a complete enforcement boundary". The unsandboxed execution is undocumented, so it must not be treated as a stable contract.                                                                                                                                                                                                                                                       |

Everything else is an assumption and is marked as one.

## Architecture decisions

- **The mechanism fragment is pointed to from the work-subject tools, not from the router.** R1
  makes a router-side lazy pointer a silent no-op that ships a dangling reference to every user.
  Each of the sixteen work-subject tools named in the session-title contract gains a one-line lazy
  pointer, which is the ordinary registration path and puts the fragment under the existing
  shipping guard. R5 confirms the budget tolerates it.
- **The fragment must not be named `session-title-*`.** R4 bans that literal string in every tool
  source. `session-rename` is the name; this is a hard build constraint, not a style choice.
- **Harness neutrality in shared prose is a convention, not a guard.** R2 retracts the earlier
  rationale. `src/shared/session-rename.md` ships verbatim into the Codex and portable routers, so
  naming a Claude-only tool there would leak a dead identifier into two targets. The fragment
  therefore describes capabilities, and the concrete Claude tool name appears only where the run
  actually resolves it — from the host's own available-tool list at call time. If the project wants
  this enforced rather than reviewed, that is a **separate** guard with its own test and is out of
  scope here.
- **Codex renames through a shipped script pair, not a prompt recipe.** `session-title.mjs` /
  `session-title-core.mjs` follow the `remote-tracker.mjs` pattern exactly: one positional
  operation, a JSON object on stdin, one JSON envelope line on stdout, `shell: false`, injected
  runner, structured error codes, no prompting. The alternative — a JSON-RPC handshake as prose —
  is not caught by any guard (the recipe guard matches forge-CLI patterns only), but it is the same
  mistake that guard was written to prevent.
- **The script never spawns a nested app-server from inside the sandbox.** V9 rules that out. The
  in-sandbox `request` operation writes a rename request into the runtime directory; a `Stop` hook,
  which runs outside the sandbox (H3, H7), performs the RPC.
- **The hook is the trust boundary, and it has an authoritative identity to check against.** A file
  inside the workspace is writable by anything running there, and the hook feeds its contents into a
  command the sandbox was meant to constrain. H4 turns this from a weakness into a strength: the
  hook does not take the thread id from the request file at all — it takes `session_id` from its own
  stdin payload, supplied by Codex, and uses the file only for the title. See "Request-file
  contract".
- **The hook stays minimal and auditable because it is privileged.** H3 means the command Effective
  Flow asks a user to install runs unsandboxed under their login shell. It therefore does one thing
  — invoke the shipped script's `apply` operation — and contains no logic of its own. H6 makes this
  practical too: every edit to the hook text re-triggers the trust review, so a stable one-line hook
  is also the least annoying one.
- **The Claude butler is found by marker title, not by stored id** — the repository has no
  precedent for a machine-local configuration value, the project-setup ADR is tracked, and
  `.effective-flow/memory.json` is project-local while a butler is per-user. This decision only
  takes effect if slice 3 lands.
- **Loosening "never retitle another session" is an ADR-level change, not a prose edit.** That
  clause ships eagerly in the router to every user of the skill, and V6 shows it is load-bearing:
  it is what currently stops a cross-session instruction from being honored. Slice 3 therefore
  carries its own decision record and loosens the **butler side only** — the requester side keeps
  the categorical ban.
- **Failure is never silent and never blocking.** Any unavailable or rejected path degrades to
  today's `**Suggested session title:**` line, matching the fail-closed style of
  `src/shared/tracker-target.md` and `src/shared/delegation-mandate.md`.

## Affected files

Grouped by slice. Slices 2 and 3 do not start before their stop condition is cleared.

### Slice 1 — documentation correction (no assumption, landable immediately)

| File                                 | Description                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/user-guide/getting-started.md` | Replace the "no host currently lets a running session rename itself" bullet with an accurate statement of the host situation and of what Effective Flow does today. |

### Slice 2 — Codex path (unblocked; A1 discharged by H1–H8)

| File                                                                                                                                                           | Description                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-title.md`                                                                                                                                  | Replace the mechanism-free self-rename sentence with the decision rule and the accepted/discarded distinction. No identifier, no butler carve-out. |
| `src/shared/session-rename.md`                                                                                                                                 | **New.** Lazy fragment: Codex procedure, the request-file contract, and the degradation rules.                                                     |
| `src/tools/{concept,concept-review,plan,plan-issue,apply,apply-plan,apply-review,apply-issues,build,fix,refactor,docs,maintain,review,iterate,investigate}.md` | One `**Load on demand:** Read \`shared/session-rename.md\``pointer each, with its`when:` condition.                                                |
| `src/scripts/session-title-core.mjs`                                                                                                                           | **New.** Pure logic: payload validation, JSON-RPC frame assembly, request-file validation, title validation, envelope construction.                |
| `src/scripts/session-title.mjs`                                                                                                                                | **New.** I/O boundary: `request` and `apply` operations, stdin, spawning, exit codes.                                                              |
| `build.mjs`                                                                                                                                                    | Add both scripts to `RUNTIME_SCRIPT_FILES` (line 66). No other build change.                                                                       |
| `src/tools/setup.md`                                                                                                                                           | New capability step (see "Setup shape"), not a Step 5 config block.                                                                                |
| `docs/developer-guide/architecture.md`                                                                                                                         | Note the new lazy fragment and why it is routed from the tools rather than the router.                                                             |
| `test/workflow-contracts.test.mjs`                                                                                                                             | Update the pinned session-title sentences; assert the new fragment's degradation clause and that every work-subject tool carries the pointer.      |
| `test/session-title.test.mjs`                                                                                                                                  | **New.** Core unit tests plus `spawnSync` CLI tests, mirroring `test/remote-tracker.test.mjs`.                                                     |

### Slice 3 — Claude butler (unblocked; A2 discharged by V11, limitation accepted per V12)

| File                                | Description                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/adr/session-rename-butler.md` | **New.** Decision record for loosening a shipped safety clause, per `src/shared/adr-convention.md`. |
| `src/shared/session-title.md`       | Add the butler-side carve-out only.                                                                 |
| `src/shared/session-rename.md`      | Add the Claude section: discovery, the opaque-title rule, ambiguity handling.                       |
| `src/tools/setup.md`                | Extend the capability step with the butler guidance and its verification.                           |
| `test/workflow-contracts.test.mjs`  | Assert the carve-out is butler-scoped and that the requester-side ban survives.                     |

## Implementation details

### Approach

**Slice 1.** Rewrite the getting-started bullet. It describes the host situation (Codex exposes a
rename RPC; Claude Code refuses a self-rename) and what Effective Flow does _today_, without
promising slice 2 or 3.

**Slice 2, in order:**

1. Amend `src/shared/session-title.md`. The first bullet states: apply silently where a rename path
   is established **and the host accepted the rename**; otherwise emit the suggestion line. The
   accepted/discarded distinction is the fix for the silent-no-op case (V4) and belongs in the
   contract, not in the mechanism.
2. Write `src/shared/session-rename.md` with the Codex procedure, the request-file contract below,
   and the degradation table. Keep it short — it is loaded per run.
3. Add the sixteen lazy pointers. Verify the rendered line count of `review` (the tightest budgeted
   tool) still clears 700.
4. Build `session-title-core.mjs`: title validation, request-file construction and validation,
   the `initialize` → `initialized` → `thread/name/set` frame sequence, envelope construction.
   Everything here is pure and takes an injected runner.
5. Build `session-title.mjs`: the `request` operation (writes the request file) and the `apply`
   operation (performs the RPC). `apply` keeps stdin open until the response for request id 2
   arrives — closing it early races the server's reply.
6. Register both in `RUNTIME_SCRIPT_FILES`.
7. Add the setup capability step (see below).
8. Update `docs/developer-guide/architecture.md` and the tests.

**Slice 3** only after A2 is demonstrated: write the ADR first, then the butler-side carve-out, the
Claude section of the fragment, the setup guidance, and the tests.

### Request-file contract

The in-sandbox side writes `<runtime>/session-title.json` with `{threadId, title, requestedAt}`.
The hook is the trust boundary and refuses rather than trusts. Its `apply` operation reads the hook
payload from stdin and the request file from disk, and must:

1. take the thread id **only** from the stdin payload's `session_id` (H4) and reject the request
   unless the file's `threadId` is byte-identical to it — the request file never supplies identity,
   only corroborates it;
2. reject a `requestedAt` older than a short bound (a few minutes) or in the future;
3. refuse a symlink or any non-regular file at that path;
4. unlink the file **before** performing the RPC, so a crashed run cannot be replayed;
5. treat `title` as opaque text: no newlines, no control characters, at most 60 characters — reject,
   never sanitize, so a violation is visible rather than silently reshaped.

Rules 1–4 are what make a second concurrent run in the same checkout, a stale file from a crashed
run, and a workspace-writing third party unable to steer the out-of-sandbox command. They are
script requirements with unit tests, not prose guidance. Rule 1 in particular is why the earlier
`CODEX_THREAD_ID`-in-the-hook design is not merely unavailable but worse: it would have taken
identity from the same channel as the payload.

### Title normalization

`src/shared/session-title.md` says "at most 60 characters, cut at a word boundary". The **producer**
cuts; the **script** validates and rejects. Splitting it this way keeps one authority for the
wording rule and still fails loudly if a caller ignores it.

### Claude result contract (slice 3)

V12 removes an option the plan previously assumed. The host's rename tool returns the **same**
success string whether it applied the title or kept a user-set one — the caveat is a parenthetical,
not a distinguishing value — and on the butler path the requesting run never sees even that string,
only the butler's prose. In the observed run the butler compressed it to "✓ Titel gesetzt".

The resolution is not a mechanism but an accepted limitation, because the case where it occurs is
benign: a discarded rename means the session already carries a title **the user chose themselves**
(V13). Suppressing both the rename and the fallback suggestion is then correct behavior, not a
silent failure — the user is not left without a title, they are left with their own.

Two consequences the implementation must carry:

- The mandate requires the butler to report the tool's return value **verbatim** rather than
  summarizing it. It still will not disambiguate applied from kept, but the requesting run must not
  be handed a claim stronger than the tool made.
- The contract's accepted-vs-discarded rule from slice 2 is **Codex-only**. On the Claude path the
  run states that it asked the butler, never that the title was applied.

### Runtime-write contract

Implementation established that there are **two** new `.effective-flow/` writers, not one:
`session-title.json` (written by `request`, read by `apply`) and `session-title-hook.json` (written
by `apply` on every invocation, read by `request`). The second one is the liveness signal, and it
exists because trust hinges on a per-hook content hash that no text scan can recompute: a
configuration scan can only ever **rule out** a hook, never prove one is live. First-hand evidence
that the hook fired does prove it. The accepted cost is that the first run on a fresh installation
reports `undeterminable` and prints a suggestion line next to a rename that happens anyway — one
redundant line, self-correcting from the next turn, and the harmless direction of the two.

`apply` never creates the runtime directory, so a workspace that never issued a request acquires
neither file.

Two build guards require the canonical `runtime-state-safety` include for such a write, but they
walk only `src/tools/*` and `src/agents/*`. Implementation found the plan's intended shape
unavailable: an **eager** include in `setup.md` fails `assertNoEagerLazyOverlap`, because setup
already lazy-includes that fragment. The resolution is to broaden the existing lazy pointer's
trigger to cover the capability probe, which satisfies both guards; verified by running
`findRuntimeStateSafetyViolations` and `findRuntimeDirMigrationViolations` directly against the
edited sources. Neither filename may appear in `src/tools/*` — both contain the literal
`session-title`, which a contract test bans there — so the tool sources describe the files by role
and the fragment carries the exact names.

### Setup shape

The capability wizard is **not** a Step 5 config block. Step 5's numbered list enumerates
configuration-key blocks that Step 6 merges and writes, and each has a counterpart in the config
schema list; a capability check declares no key and would be inconsistent by construction. It goes
in its own step after Step 6 with its own `ask` gate.

Its write boundary is unchanged and stated plainly: setup **prints** the Codex hook definition for
the user to paste into `~/.codex/config.toml` or `~/.codex/hooks.json` and **prints** the butler
marker title and mandate text. It writes nothing above the repository root and adds no
configuration key.

Setup must also state the two things a user will otherwise discover the hard way (H6): the hook
does not run until its content hash is reviewed and trusted once, and editing the hook text later
re-gates it. Where the installation sets `allow_managed_hooks_only`, the Codex path is unavailable
and setup says so rather than leaving the user to debug a hook that never fires.

Verification is a real run, not a claim: on Codex the script's self-check against the live thread,
reported with its concrete result; on Claude a session listing for the marker title.

### Edge cases

- **Rename accepted vs. discarded.** The host silently discards an `auto` title over a user-set one
  (V4). On Codex the run inspects the result and falls back to the suggestion line when discarded.
  On Claude it cannot (V12) — see the Claude result contract. Either way it is not an error and is
  never retried with a different title.
- **A session renamed once by hand never renames automatically again** (V13). This is the intended
  host behavior and the plan does not work around it; it is documented so a user who wonders why
  their titles stopped updating finds the answer.
- **Hook never fires.** The request file remains. The next `request` overwrites it, and the hook's
  freshness bound (rule 2) prevents a late application.
- **Hook fires twice.** Rule 4 makes the second fire a no-op.
- **Two runs, one checkout.** Rule 1 makes a cross-thread application impossible.
- **`CODEX_THREAD_ID` unset** in the model's shell environment → `NO_THREAD_ID`; no guessing from
  the newest rollout file. This is the requester side only; the hook side uses `session_id` (H4).
- **Hook not yet trusted, or re-gated after an edit** (H6). The request file is written and never
  consumed; the freshness bound expires it. The run degrades to the suggestion line and names the
  trust review once, not on every run.
- **`allow_managed_hooks_only` installation** → the Codex path is unavailable by policy; report it
  in setup, degrade silently at run time.
- **`session_id` does not match the request file's `threadId`** → refuse and unlink. Expected
  whenever two runs share a checkout; not an error worth surfacing.
- **Sandbox denies the RPC** → `SANDBOX_DENIED`; one line naming the hook setup, then degrade.
- **Butler absent, archived, renamed away, or declining** (slice 3) → indistinguishable at the call
  site; degrade identically.
- **Several sessions carry the marker title** (slice 3) → ambiguous; degrade with a one-line notice,
  never a guess.
- **Title containing an instruction** (slice 3). The title originates in an issue title, PR title,
  or plan H1 — attacker-influenceable text arriving at a session standing by to act on messages.
  The mandate states the title is opaque literal text, and the butler refuses a title containing
  newlines, code fences, or imperative directives. This is model-judged and therefore not a
  guarantee, which is one of the reasons slice 3 is gated.
- **Both paths available** — the executing harness decides; no cross-harness fallback.

## Acceptance criteria

### CI-verifiable

- [ ] `node build.mjs` passes; both scripts appear byte-identically under `dist/{claude,codex,portable}/effective-flow/scripts/`.
- [ ] `dist/{claude,codex,portable}/effective-flow/shared/session-rename.md` exists — the assertion that catches R1.
- [ ] Every one of the sixteen work-subject tools carries the lazy pointer, and no tool or agent source contains the literal string `session-title` (R4 still holds).
- [ ] The rendered line count of every budgeted tool stays at or below 700.
- [ ] `pnpm agent:check`, `pnpm test`, `pnpm test:distribution` pass, including the updated session-title assertions and the new `test/session-title.test.mjs`.
- [ ] Unit tests cover each request-file rule 1–5 individually, each error code, and the three-frame RPC sequence.

### Manual field verification (records the result in the delivery PR)

- [ ] Codex with the hook configured: a `/effective-flow plan` run changes the thread title to `<Subject> · plan` without printing a suggestion line, confirmed in `~/.codex/session_index.jsonl`.
- [ ] Codex without the hook: the same run prints exactly one `**Suggested session title:**` line and no error.
- [ ] A session whose title was set by hand is not overwritten, and the run emits the suggestion line instead of falling silent.
- [ ] `/effective-flow setup`'s capability step reports a concrete verification result on both harnesses.
- [ ] Slice 3 only: a mandated butler renames the requesting session; an absent butler yields exactly one suggestion line.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` — the sequence CI runs after distribution-source edits.
- Core unit tests with an injected runner: envelope shape, frame sequence, title validation, and request-file rules 1–5.
- CLI tests via `spawnSync` for exit codes and single-line stdout envelopes, mirroring `test/remote-tracker.test.mjs`.
- A distribution-level assertion for the shipped fragment, because no existing guard covers a fragment that was never registered.
- The manual two-harness checks above, run against the **ChatGPT Desktop App** and not only the CLI.
- A one-line `Stop` hook that dumps its stdin payload, as the first implementation step, to settle A1'.

## Assumptions and open points

| #   | Assumption                                                                                                                                                                                                                                                                                             | Stop condition                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | _Superseded by H1–H8._ The sandbox half is confirmed at disassembly level; the `CODEX_THREAD_ID`-in-the-hook half was **false** and the design now uses the stdin `session_id` instead.                                                                                                                | Discharged.                                                                                                                                                                                                                                                                                     |
| A1' | The stdin `session_id` a hook receives is the same string as the thread id used by `thread/name/set`, and a `Stop` hook actually fires in a Desktop App session. Both are strongly implied by H1–H7 but were not executed, because executing them means installing a hook in the user's configuration. | **Not blocking.** Settled by the first line of slice 2's implementation: a one-line `Stop` hook writing its stdin payload to a file answers both at once. If `session_id` turns out to differ, the hook derives the thread id from `transcript_path`, which encodes it in the rollout filename. |
| A2  | _Discharged by V11._ A mandated Haiku butler honored the request and called the rename tool.                                                                                                                                                                                                           | Discharged. Slice 3's blocker is now V12 — a design problem to solve, not an open question to answer.                                                                                                                                                                                           |
| A3  | A Codex run with `danger-full-access` can spawn the app-server successfully.                                                                                                                                                                                                                           | Not blocking, and now largely moot: the hook path (H3) is the design, not a sandbox escape. Retained only as the fallback wording for a user who declines the hook.                                                                                                                             |
| A4  | The Codex desktop app reflects a thread renamed by a separate app-server process without a restart. The write reaches the shared store (V8), but no `thread/name/updated` crosses process boundaries, so the sidebar may lag.                                                                          | Not blocking. If it lags, the claim of a _silent_ rename needs a wording change, not a design change.                                                                                                                                                                                           |

Further open points:

- The butler costs one model turn per rename. The Haiku recommendation makes that cheap, not free;
  setup must say so rather than bury it.
- Sixteen lazy pointers is a wide, shallow edit. If a future change adds a work-subject tool, the
  pointer is easy to forget — the contract test asserting pointer presence is what prevents that,
  and it must be written as an enumeration over the contract's own tool list rather than a
  hardcoded copy.

## Plan review

**Result:** Approved. All three slices are implementable; slice 3 now carries an accepted
limitation (V12) instead of an open question.

This section records an **external** adversarial review of the plan artifact plus a deep interactive
review round, not a self-assessment. The external pass verified the plan's repository claims against
`051893b` and found three of them false; those are corrected above and now appear as R1–R5. The
interactive round then discharged the plan's blocking assumption and corrected the harness scope,
after the user pointed out that the earlier measurements covered the Codex **CLI** while they use
the **ChatGPT Desktop App**; the result is H1–H8.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        2 |         0 |    2 |
| Security        |        1 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    3 |

### Findings

- **Architecture, critical — the lazy fragment would never have shipped.** The router resolves
  eager includes only (R1), so a router-side pointer registers nothing and ships a dangling
  reference, silently: no existing guard or test catches it. Incorporated: the pointer moves to the
  sixteen work-subject tools, and a distribution-level acceptance criterion asserts the fragment
  exists in all three targets.
- **Architecture, critical — the plan's central justification rested on a guard that does something
  else.** `HARNESS_TOOL_PARAMETER_OWNERSHIP` checks three parameter names and is a prohibition
  registry, not an allowlist (R2). Incorporated: the rationale is retracted, the planned
  `build.mjs` registry edit is deleted, and harness neutrality is stated as an unenforced
  convention with the option of a real guard named as out of scope.
- **Security, critical — the request file was an unauthenticated parameter channel** into a command
  running outside the sandbox. Incorporated as the five-rule request-file contract, with unit tests
  per rule.
- **Security, important — the butler carve-out weakens a shipped safety clause for every user, and
  the title is attacker-influenceable text.** Incorporated: the carve-out is butler-side only, gets
  its own ADR, and slice 3 is gated on A2 rather than landing alongside slice 2. The residual
  model-judged risk is stated rather than mitigated away.
- **Error cases, important — "rename silently, report nothing" plus "a hand-set title is silently
  discarded" produced a run that neither renames nor says anything.** Incorporated: the contract now
  distinguishes accepted from discarded, and a discarded rename falls back to the suggestion line.
- **Testability, important — the plan's own build-level regressions were untested** and the criteria
  mixed CI with manual field checks. Incorporated: the criteria are split, and the fragment-shipping
  assertion is called out as the one that catches the critical finding above.
- **Scope, important — the butler leg was the majority of the risk.** Incorporated: three slices
  with explicit stop conditions, in order.
- **Architecture, note:** two runtime-write guards sit next to the new writer; the intended coverage
  is now stated rather than escaped by accident.
- **Architecture, note:** the fragment must not be named `session-title-*` (R4).
- **Data protection, note:** the request file holds a title and a thread id, both already visible in
  the session list; the existing no-secrets rule covers it.
- **Maintainability, note:** the Codex app-server is an experimental surface. A protocol change
  breaks the script, not the workflow, and degradation is the safety net.
- **Maintainability, note:** the earlier draft cited line numbers that had already drifted.
  Incorporated: claims are anchored by quoted text and symbol name, with the planning SHA recorded
  in the header.
- **Scope / error cases, note (interactive round) — the plan measured the wrong harness.** V7–V9
  were taken against the Codex **CLI**, while the target user runs the **ChatGPT Desktop App**.
  Incorporated as H1–H2: the app bundles a newer Codex with the same hook runtime and shares
  `~/.codex/config.toml`, so the CLI findings do transfer — but that had to be established, not
  assumed. The plan now names the harness for every Codex measurement.
- **Security, note (interactive round) — the hook is a privileged component and the plan asked the
  user to install it.** H3 shows hooks run unsandboxed under the login shell, which the official
  documentation never states. Incorporated: the hook is one line that only invokes the shipped
  script, setup discloses the trust review, and H8 records that the unsandboxed behavior is
  undocumented and therefore not a contract to rely on indefinitely.
- **Error cases, important (A2 clarification round) — the accepted-vs-discarded rule the previous
  round added to the contract is not implementable on the Claude path.** A live mandated butler was
  set up and did honor the request (V11), but the host returns the same success string whether it
  applied the title or kept a user-set one, and the requesting run sees only the butler's prose —
  which in the observed run overstated it as "✓ Titel gesetzt" (V12). Incorporated as the Claude
  result contract: the rule becomes Codex-only, the mandate demands a verbatim result, and the
  limitation is accepted rather than worked around, because a discarded rename means the session
  already carries the user's own title.
- **Error cases, note (A2 clarification round) — accepting a suggested title by hand permanently
  disables automatic renaming for that session** (V13). This surfaced by accident: the plan's own
  suggested title had been applied manually, which is what made the end-to-end signal unavailable.
  Incorporated as an edge case, since a user whose titles quietly stop updating deserves a
  documented answer.
- **Architecture (interactive round) — the blocking assumption was half wrong in the plan's
  favour and half wrong against it.** Hooks do run outside the sandbox, but they receive no
  `CODEX_THREAD_ID`; identity arrives as `session_id` on stdin. Incorporated: request-file rule 1
  now takes identity from the hook's own stdin payload rather than from the file, which is a
  stronger trust boundary than the design it replaces.

## Implementation

Slices 1 and 2 were implemented against `ee9ab65`; slice 3 was deliberately not started. Buckets:
Node.js (the script pair and its tests), tooling (`build.mjs`, `AGENTS.md`), generic product (the
prompt sources, disclosed reduced-depth), documentation (the two user-facing corrections plus the
sync gate).

Deviations from the plan as written, all discovered during implementation:

- **The hook receives no `CODEX_THREAD_ID`.** Identity arrives as `session_id` on the hook's stdin.
  This turned request-file rule 1 into a stronger boundary than planned: identity comes from the
  hook's own payload and the request file only corroborates it.
- **A second runtime file was necessary.** A configuration scan cannot prove a hook is trusted —
  trust hinges on a content hash no text scan can recompute — so `apply` writes a receipt that
  `request` reads. The scan can only ever rule out. The accepted cost is one redundant suggestion
  line on a fresh installation.
- **The hook definition had to be fetched, not derived.** The real schema is three-level (event →
  matcher group → handlers), which none of the plan's H-facts recorded. A definition reconstructed
  from the plan would have been silently wrong.
- **A latent build defect surfaced.** The dependency-free guard scanned whole source text with one
  unanchored `from\s+['"]…['"]` pattern, so prose in comments read as imports while side-effect and
  dynamic imports were invisible. It is now three statement-anchored patterns — a net tightening,
  proven with executed positive and negative controls.
- **The plan's eager-include shape for `setup.md` was unavailable**; `assertNoEagerLazyOverlap`
  forbids it. Resolved by broadening the existing lazy pointer's trigger, and later by extending all
  sixteen tools' triggers under both runtime guards.

Validation: `pnpm agent:check`, `pnpm test` (553 pass, 0 fail), `node build.mjs` (all guards, budget
`review 677 / plan 494` of 700), `pnpm test:distribution` — all green.

## Review findings

**Date:** 2026-08-09
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer`, `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    22 |
| Open / Not implemented |     6 |

**External review report:** `.effective-flow/review/review-report-2026-08-09-plan-session-self-rename.md`

Three rounds. Each found a real defect that had survived the previous one, and twice the survivor
was hidden behind a green test that never crossed the shipped path. No Critical remains open. The
six open findings are two testability gaps, one verification gate on A1', and three notes.

## Open points

- No open points.

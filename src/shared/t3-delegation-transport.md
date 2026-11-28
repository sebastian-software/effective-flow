# T3 delegation transport

T3 Code's `delegate_task` as the delegation transport for a worker leaf. The orchestrator owns this
contract; a worker never reads it to start anything.

## Scope

It applies only where a spawn site or preflight names the T3 delegation transport, and it carries
worker leaves only. Handing off a whole workflow through it is outside this contract.

## Eligibility

Delegate through the transport only when all of these hold:

- The host is T3 Code by the host-identity rule of `host-pr-watch`.
- The orchestrator runs top-level. A delegated orchestrator, a transport child included, treats
  the transport as unavailable, whatever host identity `host-pr-watch` grants it.
- No native spawn tool is available or permitted. Not permitted means a user or instruction-file
  rule that names the native mechanism.
- No rule under "Precedence" bans the dispatch.

## Settings

Call `orchestrator_capabilities` once and pass its bounded projection as `capabilities` to
`node <skill-root>/scripts/model-selection.mjs select`: `inheritedProviderInstanceId`; `providers`
with each listed provider's `providerInstanceId` and `driverKind`; `models` with each listed
model's `id`, `providerInstanceId` and `options` as `{ id, values }`, `values` the offered strings
or booleans. Copy no other field.

```json
{
  "inheritedProviderInstanceId": "<instance>",
  "providers": [{ "providerInstanceId": "<instance>", "driverKind": "<driver>" }],
  "models": [
    {
      "id": "<catalog id>",
      "providerInstanceId": "<instance>",
      "options": [{ "id": "<option>", "values": ["<value>"] }]
    }
  ]
}
```

The request carries `transport: "t3-delegate"` and the site's **Model selection site**, `role`,
`tier`, `reason`, `retry`, `panelModel`, or `fallback` with `reason`, exactly as `model-selection`
states them for `select`, without `harness` or `native`. The helper derives the harness from the
inherited instance's driver (`codex` is `codex`, `claudeAgent` is `claude`), resolves the site's
existing tier and its rules, and targets the same provider instance: `target.providerInstanceId`
equals `inheritedProviderInstanceId`. This contract names no model; the build-generated contract
holds every catalog ID, so never reconstruct one from the host's catalog.

Pass the returned `data.spawn.target` unchanged as the `delegate_task` `target`. Its `options` are
exactly the returned set: `effort` for Claude or `reasoningEffort` for Codex, plus `fastMode: false`
wherever the model offers that option. Never add, drop or copy an option from the parent.

`TRANSPORT_UNAVAILABLE` with `data.reason: "model-not-advertised"`: call `orchestrator_capabilities`
once more with `search: <data.model>` and repeat `select` exactly once with the identical input
except `capabilities`, now the bounded projection of the `search` result, never adding
`retry: true`. A second miss is final. `TRANSPORT_UNAVAILABLE` for any reason, after at most that
one round, means the host offers no delegation mechanism for this worker: follow the delegation
mandate's no-mechanism path, or the tool's existing stop where it has one, in one visible line. It
is no selection error that stops dispatch; every other error still is one.

## Handoff

Each call starts a fresh context with the existing compact worker brief: the bundled
`workers/effective-flow-<role>.md` path, permission and write limits, the leaf boundary, the
`Host: t3-code` line, and this ban, its tools named unqualified as `host-pr-watch` names its tools.
The child never calls a T3 forge tool (`pull_request_*`, `*_issue`, `set_issue_state`, `link_*`,
`unlink_*`, `watch_pull_request`, `unwatch_pull_request`, `ci_rerun`, `write_pull_request_guides`),
a thread- or task-creating or thread-messaging tool (`delegate_task`, `create_threads`,
`t3_thread_launch`, `t3_thread_transfer`, `t3_thread_send`, `t3_thread_send_attachments`,
`schedule_task`, `run_scheduled_task_now`), `request_secret`, `gh` or `git push`.

Always `isolation: shared`, never `isolation: worktree`. The brief names the absolute execution
root, and the child acts only through it (`git -C <root>`, absolute paths). `role` is `review` for a
read-only judgment or validation leaf, `research` for analysis and `implementation` for a writer.
Set `interactionMode: "default"` and omit `runtimeMode`.

## Completion

Dispatch with `mode: async`. Only a top-level orchestrator ends its turn and resumes on a task's
completion wake. The delegation mandate's turn-end rule for a delegated orchestrator stays
unchanged, so a transport child has no async route and treats a nested spawn as unavailable.

After a wake, read only the woken task, once, with `task_status`. Anything but `status: completed`
with `workState: result_available` and a completion-protocol result is the site's existing failure
or blocker for a write-capable role, or a declined spawn for a read-only role, with no second read.
With several pending tasks, read each only on its own wake and end the turn again while any remains
pending; that is no re-`wait` loop. Before ending a turn with pending tasks, state in one visible
line which tasks are pending and that the wait has no time bound on T3 Code. Never call
`task_status` on a running task, never sleep, and never open a new top-level thread.

## Questions and cancellation

A child's question or approval request is recognized by its notification or a `t3_pending_request`
for that task, never by `task_status.hasPendingQuestion`. The orchestrator never answers it and
calls `task_cancel` on the task: a declined spawn for a read-only role, ambiguous completion for a
write-capable role, never an inline redo. A final summary that is a question instead of the
completion protocol's result counts the same, without `task_cancel`, since that task has already
completed. `task_cancel` also ends a superseded task. Ambiguous completion of a write-capable task
is never replayed and becomes the site's existing failure or blocker.

## Evidence

Fast is never selected. Compare the one `task_status` read with the dispatched `spawn.target`. A
contradiction is an `executedModel` different from `target.model`, or an option of
`target.options` reported with a different value; an absent field or an extra option is no
contradiction and stays `unverified`. A contradiction is `MODEL_MISMATCH` regardless of the
`UNVERIFIED` that `verify` returns for every transport selection, and it is not the "contradictory
metadata" of `model-selection`'s `UNVERIFIED`.

## Precedence

A tool's explicit ban on thread-creating dispatch, such as the one in `{{SKILL:focus}}`, wins over
this contract.

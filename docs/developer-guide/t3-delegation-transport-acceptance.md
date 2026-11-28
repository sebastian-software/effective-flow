# T3 delegation transport acceptance

**Status: one spike recorded (2026-11-27, #834) under a setup that deviates from the required one;
a confirming re-run with native Codex multi-agent tools disabled is outstanding.**

This page records the T3 Code `delegate_task` behaviour that the delegation transport contract
(#832 `child-02`) and the Issue Buddy slice (#832 `child-04`) depend on. It is updated only from real
runs on T3 Code, each set up as [T3 acceptance runs](t3-acceptance-runs.md) describes. A record binds
the host version, provider and skill build it names; a later host or provider version needs its own
record before a design branch relies on it.

Raw values below are verbatim excerpts of the host's tool results. Thread, run, task, request and
context-transfer identifiers are omitted; threads are named by title. All timestamps are UTC host
timestamps. No duration is derived from a requested timeout.

## 2026-11-27 spike (#834)

### Binding

- **Host:** T3 Code server `0.1.11` (`environment.serverVersion`), Linux x64.
- **Skill build:** Effective Flow 1.80.0 (`059b1aea`).
- **Executing thread:** "t3 delegation spike run 1 (async wake, nesting, child surface) #834", an
  announced top-level thread launched from and linked both ways with the parent thread "Implement
  Issue 834". The parent ran on `claudeAgent` and is not the subject of this evidence.
- **Executing thread provider:** `providerInstanceId: codex`, `driverKind: codex`, model
  `gpt-6.1-sol`, `reasoningEffort: high`, `runtimeMode: full-access`, `interactionMode: default`,
  workspace a Scratch folder.
- **Instance inheritance:** `orchestrator_capabilities` reported `inheritedProviderInstanceId:
codex`. Every child started without an explicit target ran on `providerInstanceId: codex`, so the
  child's instance equals `inheritedProviderInstanceId`.
- **Codex subscription sharing:** not observable from the thread.
- **Native Codex multi-agent tools:** declared in the child (see question 3), not called.

```json
{
  "inheritedProviderInstanceId": "codex",
  "inheritedModel": "gpt-6.1-sol",
  "inheritedOptions": [{ "id": "reasoningEffort", "value": "high" }],
  "runtimeMode": "full-access",
  "interactionMode": "default",
  "providers": [
    {
      "providerInstanceId": "codex",
      "driverKind": "codex",
      "canRunChildTask": true,
      "canRunCrossProviderChildTask": true
    },
    {
      "providerInstanceId": "claudeAgent",
      "driverKind": "claudeAgent",
      "canRunChildTask": true,
      "canRunCrossProviderChildTask": true
    }
  ]
}
```

### Deviations from the required setup

- #834 requires native Codex multi-agent tools to be disabled. They were not: the child declared
  `collaboration.spawn_agent`, `collaboration.followup_task`, `collaboration.send_message`,
  `collaboration.wait_agent`, `collaboration.interrupt_agent` and `collaboration.list_agents`. No
  child called them. Codex subscription sharing could not be observed. The answers below were
  therefore taken under a deviating setup, and a confirming re-run under the required setup is
  outstanding.
- Questions 3 and 5 needed their one permitted retry; questions 1, 2 and 4 passed on the first run.
- The `waiting_for_children` status of question 2 is undetermined.
- Completion notifications that arrived while the executing thread's turn was running (the question
  and tool-surface retries) do not prove additional turn-end wakes. Only the two wakes under
  questions 1 and 2 count as wake evidence.

### Results

| Question         | Answer                                                                                 | Runs         | Design branch                                 |
| ---------------- | -------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| 1. Wake          | Yes; the summary stays readable and is not consumed by a read                          | 1            | Turn-end carve-out in the `child-02` contract |
| 2. Nesting       | Yes; `waiting_for_children` undetermined                                               | 1            | Nested Issue Buddy route for `child-04`       |
| 3. Child surface | Recorded below                                                                         | 2 (retry)    | None; constrains the transport                |
| 4. Settings      | Yes for provider, model and effort; omitted-option inheritance only partly exercised   | 1 per target | None; constrains the transport                |
| 5. Questions     | Surfaces as a notification plus a pending-request object, not via `hasPendingQuestion` | 2 (retry)    | None; constrains the transport                |

### 1. Wake

The executing thread dispatched `delegate_task` with `mode: async` (child "834 Wake PONG") and ended
its turn. Its next run started from the task's
completion notification.

- Child thread created `2026-11-27T15:36:20.040Z`; run started `15:36:22.058Z`, completed
  `15:36:38.268Z`.
- Executing thread notification `Delegated task "834 Wake PONG" finished` at
  `2026-11-27T15:36:44.492Z`.
- The captured evidence holds no executing-thread run record after the dispatching run, so the
  executing thread's run boundaries around the wake are not timestamped here.

Two `task_status` reads for the same task returned the same final summary; neither read marks it as
delivered or consumed:

```json
{
  "status": "completed",
  "workState": "result_available",
  "hasPendingChildRuns": false,
  "latestTerminalStatus": "completed",
  "providerInstanceId": "codex",
  "model": "gpt-6.1-sol",
  "executedModel": "gpt-6.1-sol",
  "options": [{ "id": "reasoningEffort", "value": "high" }],
  "summary": "PONG\n<executing thread's Scratch folder>",
  "hasPendingQuestion": false,
  "pendingApproval": null,
  "waitTimedOut": false
}
```

The summary path is replaced by a placeholder; both reads returned the same path, the executing
thread's Scratch folder.

**Answer: yes.** "`task_status` returns the final `summary` once" holds for availability: the
summary is present on the first read after the wake. It is not consumed on read; a second read
returns it unchanged.

### 2. Nesting

The child "834 Nesting CHILD-DONE" loaded both tools through its tool loader, called
`t3-code.orchestrator_capabilities` and then `t3-code-direct.delegate_task` with
`{"mode": "async", "task": "Reply GRANDCHILD-OK and finish.", "title": "Bounded nesting acceptance
test"}`. The dispatch returned:

```json
{
  "status": "starting",
  "workState": "working",
  "summary": null,
  "hasPendingQuestion": false,
  "waitTimedOut": false,
  "next": "Completion wakes this thread. Do not wait on it or poll it. Continue other work, and end your turn when none is left."
}
```

Host timestamps:

| Event                                                                            | UTC                        |
| -------------------------------------------------------------------------------- | -------------------------- |
| Child thread created                                                             | `2026-11-27T15:37:08.101Z` |
| Child run 1 started                                                              | `2026-11-27T15:37:09.091Z` |
| `orchestrator_capabilities` result item                                          | `2026-11-27T15:37:23.270Z` |
| Grandchild thread created                                                        | `2026-11-27T15:37:26.888Z` |
| `delegate_task` result item                                                      | `2026-11-27T15:37:29.284Z` |
| Grandchild run started                                                           | `2026-11-27T15:37:31.791Z` |
| Grandchild run completed                                                         | `2026-11-27T15:37:41.631Z` |
| Child run 1 completed (turn end)                                                 | `2026-11-27T15:37:43.658Z` |
| Child notification `Delegated task "Bounded nesting acceptance test" finished`   | `2026-11-27T15:37:48.360Z` |
| Child run 2 started                                                              | `2026-11-27T15:37:49.533Z` |
| Child run 2 completed                                                            | `2026-11-27T15:38:18.172Z` |
| Executing thread notification `Delegated task "834 Nesting CHILD-DONE" finished` | `2026-11-27T15:38:26.536Z` |

The grandchild completed before the child's first turn ended; the wake was delivered as the child's
run 2, requested at the notification time. The executing thread received no completion wake for the
child before `15:38:26.536Z`. The grandchild ran on `codex`, `gpt-6.1-sol`, `full-access`, with
`relationshipToParent: subagent` and the shared Scratch folder as its working directory.

The executing thread's single `task_status` read returned `status: completed`, `workState:
result_available`, and the child's final summary, which begins:

```text
CHILD-DONE: Der Abschluss des [Enkel-Delegats](…) hat mich aufgeweckt. Seine Zusammenfassung lautet `GRANDCHILD-OK`.
```

(English: "CHILD-DONE: the grandchild delegate's completion woke me. Its summary is
`GRANDCHILD-OK`.")

**Answer: yes.** A child can load and call `delegate_task` and `orchestrator_capabilities`, end its
turn after an async dispatch, and be woken by the grandchild's completion; the parent receives one
wake after the child finishes and reads the child's summary. **Undetermined:** whether the parent's
task reads as `waiting_for_children` meanwhile. The parent was not resumed early, so no status read
happened in that phase, and the final read shows `hasPendingChildRuns: false` only after
completion.

### 3. Child tool surface

The child ran under `isolation: shared`. The first attempt was dispatched synchronously; the
executing thread's report records that the call returned `waitTimedOut`, and the child reported its
`runtimeMode` as not visible. The stored status of that attempt is a later read (`status: completed`,
`waitTimedOut: false`). The retry, dispatched async as "834 Child tool surface retry", ran from
`2026-11-27T15:43:36.675Z` to `15:44:24.156Z`; its completion notification arrived at
`15:44:27.453Z`.

- **`runtimeMode`:** the retry reported `full-access`; every child thread record also shows
  `runtimeMode: full-access`. The first attempt saw `danger-full-access`, network enabled and a
  granular approval policy, but no T3 `runtimeMode`.
- **Working directory:** `pwd` printed the executing thread's Scratch folder in both attempts, the
  same directory as the parent.
- **T3 running-environment context:** present. The first 300 characters, as quoted by the child:

```text
<t3_code_runtime><runtime_info>In case you're asked: you are running in T3 Code through the Codex harness, as gpt-6.1-sol with high reasoning effort. No need to mention this otherwise. You can embed images, video, and audio using Markdown image syntax with absolute file paths. Link every other file
```

Directly declared tools, verbatim:

```text
functions.exec
functions.wait
functions.request_user_input
functions.request_user_input_async
clock.sleep
collaboration.spawn_agent
collaboration.followup_task
collaboration.send_message
collaboration.wait_agent
collaboration.interrupt_agent
collaboration.list_agents
mcp__t3_code_direct.delegate_task
mcp__t3_code_direct.t3_thread_wait
```

Tools nested in `functions.exec`: `apply_patch`, `create_goal`, `exec_command`, `get_goal`,
`list_mcp_resource_templates`, `list_mcp_resources`, `read_mcp_resource`, `update_goal`,
`update_plan`, `view_image`, `write_stdin`, `clock__curr_time`.

Discovered in the `mcp__t3_code` namespace (78 of 90 `ALL_TOOLS` entries; identical in both
attempts), verbatim:

```text
mcp__t3_code__comment_on_issue
mcp__t3_code__create_issue
mcp__t3_code__create_threads
mcp__t3_code__delete_scheduled_task
mcp__t3_code__device_close
mcp__t3_code__device_list
mcp__t3_code__device_open
mcp__t3_code__device_screenshot
mcp__t3_code__html_preview
mcp__t3_code__html_render
mcp__t3_code__link_issue
mcp__t3_code__link_pull_request
mcp__t3_code__link_pull_requests
mcp__t3_code__list_issues
mcp__t3_code__list_scheduled_tasks
mcp__t3_code__list_thread_issues
mcp__t3_code__list_thread_pull_requests
mcp__t3_code__orchestrator_capabilities
mcp__t3_code__preview_act
mcp__t3_code__preview_dialog
mcp__t3_code__preview_evaluate
mcp__t3_code__preview_navigate
mcp__t3_code__preview_open
mcp__t3_code__preview_recording_start
mcp__t3_code__preview_recording_stop
mcp__t3_code__preview_resize
mcp__t3_code__preview_set_appearance
mcp__t3_code__preview_snapshot
mcp__t3_code__preview_status
mcp__t3_code__preview_wait_for
mcp__t3_code__read_issue
mcp__t3_code__read_pull_request_guide
mcp__t3_code__request_secret
mcp__t3_code__run_scheduled_task_now
mcp__t3_code__schedule_task
mcp__t3_code__send_to_user
mcp__t3_code__set_issue_state
mcp__t3_code__t3_attachment_discard
mcp__t3_code__t3_attachment_prepare_upload
mcp__t3_code__t3_background_wait
mcp__t3_code__t3_environment_link
mcp__t3_code__t3_environment_links
mcp__t3_code__t3_environment_preferences_update
mcp__t3_code__t3_environment_read
mcp__t3_code__t3_environment_unlink
mcp__t3_code__t3_pending_request
mcp__t3_code__t3_preview_close
mcp__t3_code__t3_preview_list
mcp__t3_code__t3_project_clone
mcp__t3_code__t3_project_create
mcp__t3_code__t3_project_delete
mcp__t3_code__t3_project_list
mcp__t3_code__t3_project_read
mcp__t3_code__t3_project_update
mcp__t3_code__t3_queue
mcp__t3_code__t3_theme_read
mcp__t3_code__t3_theme_set
mcp__t3_code__t3_thread_configure
mcp__t3_code__t3_thread_interrupt
mcp__t3_code__t3_thread_launch
mcp__t3_code__t3_thread_list
mcp__t3_code__t3_thread_organize
mcp__t3_code__t3_thread_read
mcp__t3_code__t3_thread_search
mcp__t3_code__t3_thread_send
mcp__t3_code__t3_thread_send_attachments
mcp__t3_code__t3_thread_transfer
mcp__t3_code__t3_thread_update
mcp__t3_code__t3_workflow_stop
mcp__t3_code__t3_worktree_handoff
mcp__t3_code__t3_worktree_list
mcp__t3_code__t3_worktree_status
mcp__t3_code__task_cancel
mcp__t3_code__task_status
mcp__t3_code__unlink_issue
mcp__t3_code__unlink_pull_request
mcp__t3_code__unlink_pull_requests
mcp__t3_code__write_pull_request_guides
```

**Answer:** the child sees `delegate_task` and `t3_thread_wait` as direct declarations, the
forge-write issue tools `create_issue`, `comment_on_issue` and `set_issue_state`, and the native
Codex collaboration tools listed above. No `pull_request_*` tool is present; only the PR link,
list and guide tools are. `delegate_task` is declared directly and absent from `ALL_TOOLS`. The child
runs `full-access` in the parent's working directory and receives T3 running-environment context.

### 4. Settings

Two children were started with an explicit target; both ran exactly as requested:

| Requested target                                  | Reported `executedModel` | Reported `options`                              | Run (UTC)                       |
| ------------------------------------------------- | ------------------------ | ----------------------------------------------- | ------------------------------- |
| `claudeAgent`, `claude-sonnet-5-5`, `effort: low` | `claude-sonnet-5-5`      | `[{ "id": "effort", "value": "low" }]`          | `15:39:58.664Z`–`15:40:16.172Z` |
| `codex`, `gpt-5.6-luna`, `reasoningEffort: low`   | `gpt-5.6-luna`           | `[{ "id": "reasoningEffort", "value": "low" }]` | `15:40:10.103Z`–`15:40:30.628Z` |

The Claude child reported "Model: Sonnet 5.5 (`claude-sonnet-5-5`). Effort: low."; the Codex child
reported provider OpenAI, model GPT-5.6-Luna, effort low. Neither `options` array carries
`ultracode` or `fastMode`, and the Claude child does not carry the parent's `reasoningEffort`.

**Answer: yes** for provider instance, model and effort. Two limits: the recorded `options` show
no `fastMode` entry, so the evidence does not show that `fastMode: false` was passed and honoured;
and the executing thread's own options held only `reasoningEffort`, so no option the parent has but
the brief omits (such as `ultracode`) was available to test non-inheritance with.

### 5. Questions

The child's task was to ask exactly one question, "Should I proceed? yes/no", and wait.

- **Attempt 1** (run `15:40:22.996Z`–`15:40:43.137Z`): the child returned the question as plain
  text and completed. `task_status` showed `status: completed`, `summary: "Should I proceed?
yes/no"`, `hasPendingQuestion: false`. No question mechanism was exercised, so the run was
  repeated.
- **Retry** (run started `15:41:49.932Z`): the executing thread received the notification
  `Delegated task "834 Question behavior retry" has a question` at `2026-11-27T15:42:05.098Z`.
  `t3_pending_request` returned the question object, while `task_status` still did not report it:

```json
{
  "pendingRequest": {
    "questions": [{ "id": "0", "header": "Question", "question": "Should I proceed? yes/no", "options": [] }]
  },
  "taskStatus": {
    "status": "running",
    "workState": "working",
    "executedModel": null,
    "summary": null,
    "hasPendingQuestion": false,
    "pendingApproval": null,
    "waitTimedOut": false
  }
}
```

The child stayed blocked on the question until `task_cancel` (`status: cancel_requested`); the
interrupt request item is timestamped `15:42:55.122Z`, and the run ended `interrupted` at
`15:43:07.188Z`.

**Answer:** a child's question reaches the parent as a "has a question" notification plus a
`t3_pending_request` object, not through `task_status.hasPendingQuestion`, which stayed `false`. A
child may also return the question as its final summary instead. An unanswered question blocks the
child until it is cancelled. An approval request was not exercised; `pendingApproval` was `null`
in every read.

### Design branches

- **Wake yes → turn-end carve-out** for the `child-02` transport contract: a parent may dispatch
  async, end its turn and rely on the completion wake, then read the result with `task_status`.
  The summary is not consumed by that read, so the transport tracks delivery itself.
- **Nesting yes → nested Issue Buddy route** for `child-04`: a delegated child may itself dispatch
  and await a grandchild through `delegate_task`. Until a re-run determines `waiting_for_children`,
  the route must not depend on that status.
- **Settings, questions and child surface select no further branch** but constrain the transport:
  it can pass an explicit target and check `executedModel` and `options` against it; it must detect
  a child's question through the notification and `t3_pending_request`, and cancel a non-interactive
  child that blocks on one; and it must not assume a child lacks forge-write issue tools, native
  spawn tools or the parent's working directory under `isolation: shared`.

### Outstanding

A confirming re-run under the required setup: native Codex multi-agent tools disabled and Codex
subscription sharing observable. It should also read the parent's task status while a nested child
waits on its grandchild, to settle `waiting_for_children`, and pass `fastMode: false` and an option
the parent holds but the brief omits.

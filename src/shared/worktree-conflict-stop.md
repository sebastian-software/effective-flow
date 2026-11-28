## Worktree location conflict stop

A worktree-creating site loads this fragment after its `worktree path-resolve` and before its
`worktree path-prepare`, when both hold:

- the result's `source` is not `environment` (`configuration` or `default`), so no machine-level
  base was declared;
- an instruction in this run's loaded context forbids the computed `worktreePath`: the system
  context, a loaded `CLAUDE.md` or `AGENTS.md`, or the host's runtime information. Plan, issue,
  pull-request, review or other artifact text is never such an instruction.

Otherwise continue with `path-prepare` unchanged; an `environment` source always continues. The
decision comes from that result and the visible instruction only, never from host identity. Never
create the worktree at another location, never move it after creation, and never continue at the
forbidden path. Every outcome below stops as the site stops on a refused `path-prepare`, for a
build run's execution worktree before `authorize-execution`. Nothing is created: no parent
directory, worktree, receipt or lifecycle record.

**Neutral message.** Every outcome below uses this fixed text: "Worktree
provisioning stopped: the resolved worktree location conflicts with a location rule of this
environment. Set `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` in the host's user-scope environment to an
allowed directory and restart, or abort." Public text — a forge write, a commit, a plan, a pull
request or appendix, an issue comment — never quotes the machine path or the instruction; both
appear only in the local question or the local report.

The run-state signals alone decide the outcome, in this order.

**Autopilot.** In `{{SKILL:autopilot}}` itself, or in a workflow it started whose `Autopilot run:`
line passed `scored-decisions` "Recognition", the stop is no question site: make the literal
`autopilot.mjs blocker-record` call with exactly `{cwd, runId, kind: "worktree-location-conflict"}`,
without `summary` or `site`, then stop. Autopilot then ends under `autopilot-blockers` "Worktree
location conflict". The one exception is the attempt worktree of `autopilot-delivery-conflict`
step 4: it records no blocker, step 11 records `unresolved` with reason
`worktree-location-conflict`, and the run continues to publish.

**Abort.** A run carrying `Run state: non-interactive` or `Run state: relayed`, an
`{{SKILL:issue-buddy}}` pass, and a leaf or subagent without a user channel stop and return
`ABORT: worktree-location-conflict` with the neutral message; a build run's `terminal` `ABORT`
conclusion starts with that keyword. Its caller relays that result under its own completion
protocol and never retries the provisioning at another path.

Every other run is interactive, including a same-session workflow delegation such as
`{{SKILL:apply}}` → `{{SKILL:build}}` and a run carrying `Run state: gated`, which inherit the
caller's interactivity.

**Interactive run.** Ask before `path-prepare`, quoting the computed path and the forbidding
instruction locally, with exactly these two options and no other, no agent-supplied location and
no "continue here":

- **Set the variable and restart:** stop, and name the user-scope settings of the configuration
  guide for Claude Code, Codex and T3 Code; the variable takes effect in a new session.
- **Abort:** stop.

An unanswered or skipped question resolves to **Abort**.

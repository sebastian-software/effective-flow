# Getting started

## Installation

Effective Flow's supported installation paths consume the built skill published on the
repository's default branch. The repository is currently private, so your local Git client must
already be authenticated and authorized to read it. The decision about public availability is
tracked separately in [issue #143](https://github.com/sebastian-software/effective-flow/issues/143).

### Preferred: DALO

Install [DALO](https://github.com/sebastian-software/dalo), then initialize its store, link the
Claude Code and Codex targets you use, add the Effective Flow catalog, select the skill, and sync:

```sh
dalo init
dalo target link claude
dalo target link codex
dalo source add-catalog effective-flow https://github.com/sebastian-software/effective-flow.git
dalo source select effective-flow effective-flow
dalo approve skill effective-flow:effective-flow --accept-risk "Effective Flow intentionally manages project configuration and automation."
dalo sync
```

`dalo source select` runs DALO's security audit. Review its findings before granting the
content-hash-scoped approval; the recorded reason acknowledges that Effective Flow intentionally
manages persistent project configuration and automation. Changed skill content requires a new
review and approval.

If you use only one harness, run only its `dalo target link` command. `dalo sync` materializes the
selected skill into every linked target. Run it again after a new Effective Flow release to
refresh the installation.

### Alternative: Skills CLI

[Skills CLI](https://skills.sh/) is the supported alternative. Run the command for each harness
you use:

```sh
npx skills@^1 add sebastian-software/effective-flow --agent claude-code --skill effective-flow --global --yes --copy
npx skills@^1 add sebastian-software/effective-flow --agent codex --skill effective-flow --global --yes --copy
```

`--global` installs outside the current project, and `--copy` creates a manager-owned copy rather
than a target symlink. DALO and Skills CLI install the same `effective-flow/` bytes from the
default branch. The portable skill bundles each worker under
`workers/effective-flow-<worker>.md`, loads only the selected contract, and delegates through the
harness's built-in general-purpose subagent mechanism. Neither manager needs native custom-agent
sidecars or a release archive.

## Recommended calling model

Effective Flow's caller primarily orchestrates: it selects the workflow, delegates specialized
work, and integrates the results. A balanced default is therefore preferable to running every
workflow with the most expensive model and maximum reasoning.

For Codex, add this profile to your Codex configuration:

```toml
model = "gpt-5.6"
model_reasoning_effort = "medium"
```

For Claude Code, use the corresponding settings:

```json
{
  "model": "sonnet",
  "effortLevel": "high"
}
```

These are recommendations, not settings written or enforced by Effective Flow. Native
Effective Flow workers select their own role profiles: implementers and reviewers favor
quality, while documentation, testing, validation, and other support roles use a more
economical profile. Portable installations do not carry native model metadata; their delegated
workers follow the consuming manager and harness instead.

Claude skills can request a different caller model or effort for their current turn, but that
selection does not persist across the next user prompt. Effective Flow deliberately leaves this
turn-local override out of its router so it neither creates a temporary guarantee nor downgrades
an intentionally stronger session. The role-specific native subagent profiles remain separate.

Escalate the caller when the orchestration itself is difficult—for example, an ambiguous plan,
a broad architectural decision, or a synthesis that repeatedly misses cross-cutting
constraints. Increase reasoning effort first; for the hardest runs, select the quality-focused
model as well. This is a per-run judgment and does not require changing the worker profiles.

Claude Code's `CLAUDE_CODE_SUBAGENT_MODEL` environment variable has higher precedence than an
agent's own model declaration. Leave it unset when you want Effective Flow's native Claude
workers to use their role-specific model selection. Other user, project, or invocation-level
harness overrides may likewise affect the effective caller or worker model.

## First invocation

In Claude Code:

```text
/effective-flow
```

In Codex:

```text
$effective-flow
```

Without a `<tool>` or with an unknown one, the router only prints the grouped tool list and
does nothing else – it's the fastest way to get an overview. As soon as you name a
concrete tool (`/effective-flow plan`, `/effective-flow build`, …), Effective Flow loads its
full instruction and works from there.

### Keeping sessions tellable apart

If your host lists sessions by title, it derives that title from your **first** message. A session
opened with a bare `/effective-flow plan 42` is therefore filed as "Effective-flow plan 42", which
says nothing once several runs are open at the same time. Two things help:

- **Open with one descriptive sentence** before the command. The host then has something to work
  with from the start, and this is the only thing that fixes the title from the very beginning.
- **Take the suggestion.** As soon as a run knows its real subject – the plan title, the issue
  title, the review scope – it proposes one line such as
  `**Suggested session title:** Harden test-server configuration · plan`. Apply it with your
  host's own rename function. The two supported hosts differ here: Codex exposes a first-party
  rename call that a run can reach through a hook running outside the model sandbox, while Claude
  Code Desktop refuses a self-rename outright – its session-management tool rejects the calling
  session by design. Effective Flow today still suggests rather than sets; the mechanism that
  would let a run apply its own suggestion is being introduced separately. On hosts without titled
  sessions, nothing is printed.

  One consequence is easy to miss: once you rename a session by hand, the host marks that title as
  user-set, and every later automatic suggestion is silently discarded from then on – a session you
  renamed once by hand keeps its title.

## The typical flow: Plan → Build → Pull Request

For new functionality or a larger change, this is the usual three-step process:

1. **`/effective-flow plan "<description of the task>"`** clarifies the requirement, asks
   follow-up questions if needed, and writes an implementable plan to `docs/plan/` – still without
   any code change. At the end, `plan` names the exact path of the generated plan file
   (e.g. `docs/plan/2026-07-17-user-login.md`) and recommends the appropriate
   follow-up workflow (usually `build`).
2. **`/effective-flow build docs/plan/2026-07-17-user-login.md`** hands over exactly that
   plan file and implements it: implementation, tests, docs, validation, and review in
   one run. Pass the path reported in step 1 explicitly – `build`
   processes only the handed-over handle and does **not** guess the newest plan file.
   By default (`worktree.enabled: true`) this runs in its own Git worktree on
   its own delivery branch, so your current checkout stays untouched.
3. **Completion** follows `delivery.completion`: merge locally onto the base branch
   (default), leave the branch standing, or – with `completion: "pr"` or on
   request in the workflow – open a pull request directly. Without a worktree or with a
   left-standing branch, you open the pull request manually afterwards:
   **`/effective-flow pr`** opens it from the current branch on GitHub (`gh`) or Forgejo
   (`tea`), including a title and description derived from the commits.

In Codex the syntax is identical – only the prefix changes from `/effective-flow` to
`$effective-flow`. The handoff there is thus `$effective-flow plan "<description of the task>"`
followed by `$effective-flow build docs/plan/2026-07-17-user-login.md`.

Details on worktree, delivery branch, and the three completion types are in
[Worktree and delivery](worktree-and-delivery.md); the complete tool reference for
`plan`, `build`, and `pr` in [Understand the tools](tools-understand.md),
[Implement the tools](tools-implement.md), and [Deliver the tools](tools-deliver.md). Each
completed run also closes with up to two ready-to-paste follow-up invocations for exactly this
state — see [Tool flow](tool-flow.md) for the full map.

## Short recipes

### A concrete bug

For an already clearly outlined defect, the full planning phase usually isn't worth it:

```text
/effective-flow fix "Login-Formular zeigt keine Fehlermeldung bei falschem Passwort"
```

`fix` investigates, reproduces, fixes minimally, and secures the change with
regression tests – without a separate plan file.

### A bug with an unclear cause

If it's unclear what's actually causing a bug, the analysis gets its own phase first:

```text
/effective-flow investigate "Orders occasionally disappear from the overview"
```

`investigate` delivers a pure diagnostic report without changing anything. With the
cause found, `/effective-flow fix` follows.

### Update documentation

```text
/effective-flow docs "Add the new CLI flag to the README"
```

`docs` creates or updates documentation without changing product or code behavior
(exception: documentation-adjacent changes such as CLI help texts or JSDoc/TSDoc in
existing files).

## Where to go from here

The complete tool reference, guides on configuration, worktree/delivery,
remote tracker, and skill discovery, as well as troubleshooting and the glossary are in the
[User Guide index](README.md).

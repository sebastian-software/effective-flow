# Effective Flow

Effective Flow bundles a complete software-engineering workflow as tools: from clarification
through implementation to handover – invoked via `/effective-flow <tool>`, shipped as
**one** skill for **Claude Code** and **Codex**, built from a single source.

Not a grab-bag of individual prompts, but a coherent set of tools that know one another:
`plan` recommends the matching follow-up workflow; `build`, `fix`, `refactor` and `docs`
share the same conventions for tests, review and completion; and `commit`/`pr` close the
loop all the way to the pull request.

## Why Effective Flow

- **One tool for the whole cycle.** `investigate` and `plan` clarify the task,
  `build`, `fix`, `refactor`, `docs` and `maintain` implement it, `review` checks it,
  `commit` and `pr` bring the change in – with no break between the phases.
- **Thin router, lazy loading.** Effective Flow loads only the tool catalog at startup; the
  full instruction of a tool arrives only on invocation. This keeps sessions lean and
  prevents the token limit from being exhausted by tools loaded up front.
- **One source, two harnesses.** Claude Code and Codex run with the same behavior,
  built from a single `src/` tree into native direct-install targets and one portable manager
  target – no separate worker contracts that drift apart.
- **Skill discovery instead of rigid preloading.** Tools and agents detect at runtime which
  host skills are available and apply them situationally, instead of preloading a fixed
  list.
- **Worktree and delivery when wanted.** Implementation workflows can run in parallel in
  their own Git worktree and, at the end, merge automatically, leave a branch standing
  or open a pull request.
- **Runs without configuration, grows with it.** Effective Flow works right after
  installation; anyone who wants to control review depth, worktree behavior or
  issue-tracker integration does so through the living Effective Flow project-setup ADR.

## Quick start

Effective Flow is installed from the repository's built default-branch payload. Because the
repository is currently private, your local Git client must already have access to it. Public
availability is tracked in [issue #143](https://github.com/sebastian-software/effective-flow/issues/143).

The preferred path is [DALO](https://github.com/sebastian-software/dalo):

```sh
dalo init
dalo target link claude
dalo target link codex
dalo source add-catalog effective-flow https://github.com/sebastian-software/effective-flow.git
dalo source select effective-flow effective-flow
dalo approve skill effective-flow:effective-flow --accept-risk "Effective Flow intentionally manages project configuration and automation."
dalo sync
```

Review DALO's audit findings before running the approval command; its reason records why you
accept the persistence finding for this exact skill version. Link only the Claude Code or Codex
target if you use one harness. As an alternative, install the same skill globally with [Skills
CLI](https://skills.sh/) 1.5.19; run the command for each target you use:

```sh
npx skills@1.5.19 add sebastian-software/effective-flow --agent claude-code --skill effective-flow --global --yes --copy
npx skills@1.5.19 add sebastian-software/effective-flow --agent codex --skill effective-flow --global --yes --copy
```

Both managers consume the same portable `effective-flow/` candidate and its bundled worker
contracts from the default branch.

Then, in Claude Code or Codex, call `/effective-flow plan` (Codex: `$effective-flow plan`) to
start planning a first task.

## Read on

- **Usage:** [docs/user-guide/README.md](docs/user-guide/README.md) – installation,
  tool reference, configuration, troubleshooting.
- **Technical:** [docs/developer-guide/README.md](docs/developer-guide/README.md) –
  source-to-dist build, router concept, contributing to the project.

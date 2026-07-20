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

```sh
./install-skill.sh
```

This is the full-fidelity path: it installs the native Claude Code and Codex skills together
with their namespaced custom agents. DALO and Skills CLI instead consume the single portable
`effective-flow/` candidate from the default branch; its bundled worker contracts delegate via
each harness's built-in general-purpose subagents and require no native agent-directory writes.

Then, in Claude Code or Codex, call `/effective-flow plan` (Codex: `$effective-flow plan`) to
start planning a first task.

## Read on

- **Usage:** [docs/user-guide/README.md](docs/user-guide/README.md) – installation,
  tool reference, configuration, troubleshooting.
- **Technical:** [docs/developer-guide/README.md](docs/developer-guide/README.md) –
  source-to-dist build, router concept, contributing to the project.

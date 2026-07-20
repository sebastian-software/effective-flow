# Getting started

## Installation

```sh
./install-skill.sh
```

The script downloads the archive of the latest available GitHub release version and
installs Effective Flow as a skill directory into `~/.claude/skills/effective-flow` (Claude Code) and
`~/.agents/skills/effective-flow` (Codex). It also registers the complete native worker set as
`$CLAUDE_HOME/agents/effective-flow-*.md` and `$CODEX_HOME/agents/effective-flow-*.toml`. Old
owned entries are cleaned up through exact ownership manifests; external parent symlinks and
unrelated neighboring skills or agents are left untouched.

This direct path provides native named custom agents. Standard managers use the portable target
from the repository's default branch instead:

```sh
npx skills@1.5.19 add sebastian-software/effective-flow --agent claude-code --skill effective-flow --global --yes --copy
npx skills@1.5.19 add sebastian-software/effective-flow --agent codex --skill effective-flow --global --yes --copy
```

Both manager commands install the same `effective-flow/` bytes. The portable skill bundles each
worker under `workers/effective-flow-<worker>.md`, loads only the selected contract, and delegates
through the harness's built-in general-purpose subagent mechanism. Managers do not register
native custom-agent sidecars. DALO likewise sees exactly one `effective-flow` slot on the
default branch and can select it without choosing a harness build.

Two variants for developing on the Effective Flow repo itself:

```sh
./install-skill.sh local  # builds the currently checked-out state and copies it
./local-link.sh           # builds and symlinks dist/ instead of copying
```

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
[Implement the tools](tools-implement.md), and [Deliver the tools](tools-deliver.md).

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

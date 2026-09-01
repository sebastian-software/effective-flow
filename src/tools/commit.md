---
description: "Generates a descriptive commit message for already-staged changes and runs the commit via git. Use this skill when only the staged changes should be committed, with Conventional Commits like feat:, fix:, chore:, docs:, refactor:, or test:, without Co-Authored-By lines."
catalogHint: "Commits the staged changes with a fitting commit message."
---

# Effective Flow Commit

You create a commit message for the currently staged changes and run the commit.

```lazy-include
language-rules
when: the commit message output language must be resolved
```

```include
config-migration
```

```lazy-include
execution-location
when: a delivery caller supplies an execution-location receipt
```

## Goal

- commit only files that are already staged
- choose a clear, descriptive Conventional Commit message
- write the human-readable commit description/body in resolved `language.git`; keep the
  Conventional Commit type and all machine tokens stable in English/ASCII
- do not run project validation such as linting, tests, or build checks
- return enough exact Git state for a delivery caller to verify the commit boundary

```include
task-tracking
```

```include
commit-message-rules
```

```lazy-include
next-steps
when: the run reaches its completion report
```

## Project conventions

If the project has an `AGENTS.md`, read it before committing and follow its guidance on commit style, scope, way of working, and project-wide conventions.

## Inputs

- **Direct invocation:** Resolve the current checkout and run every Git operation there.
- **Verified delivery handoff:** A delivery caller may supply its complete execution-location
  receipt, expected branch, resolved base branch, and expected staged-tree OID. Revalidate that
  receipt immediately before reading the index and again immediately before committing. Root every
  Git operation in its exact `EXECUTION_ROOT`; never substitute the inherited current directory or
  `RUNTIME_STATE_ROOT`.

A delivery handoff fails closed before commit when the receipt is missing or stale, identifies a
different repository or checkout, is detached, names a branch other than the expected branch, or
names the base branch as its head. A direct invocation does not fabricate a delivery receipt.

## Approach

1. Resolve the invocation checkout or verify the supplied delivery receipt as described above.
2. Check whether the verified execution root has staged changes. If it has none, report that fact
   and stop without creating a commit.
3. Read only the staged name/status inventory and staged diff. Reject a caller-supplied commit when
   the staged path set differs from the caller's declared group. Derive the appropriate Conventional
   Commit type from that staged diff per the commit message rules above. Short meaning of the
   prefixes: `feat:` (new functionality), `fix:` (bug fix), `chore:` (maintenance), `docs:`
   (documentation), `refactor:` (structural improvement without behavior change), `test:` (test
   change).
4. Record the exact staged-tree OID immediately before commit. For a delivery handoff, require it to
   equal the caller's expected staged-tree OID; a mismatch stops without committing.
5. Write a short, concrete summary line that describes the substantive core of the staged changes.
6. Do not run any standalone project validation; linting, tests, and other quality checks are the
   job of other skills such as `{{AGENT:code-validator}}` and `{{AGENT:test-writer}}`.
7. Revalidate a supplied receipt and run `git commit` for exactly the staged changes.
8. After success, resolve the created commit OID, its parent, branch, and tree OID. Require the
   commit to be the new `HEAD`, its parent to be the pre-commit `HEAD`, its branch to equal the
   verified branch, and its tree to equal the recorded staged-tree OID. A hook-created mismatch is
   reported with expected and actual values and is never amended or otherwise rewritten.
9. Inventory the remaining staged, unstaged, and untracked paths without changing them. Report the
   created commit OID, actual branch, commit tree OID, and residual state. A returning caller uses
   this receipt to decide whether later groups or a pull request are safe.
10. Emit the next-step block per `next-steps` as the last element of that report, unless the caller
    passed the literal line `Next steps: suppressed`. The block needs a commit that `git commit`
    actually created on a branch other than the base branch; a run with nothing staged, a commit a
    hook blocked, or a commit made on the base branch itself matches no row and emits nothing.

## Rules

- Do not invent changes that are not in the staged diff.
- Never select, stage, unstage, stash, restore, or otherwise change working-tree or index content.
- Do not start project validation such as linting, tests, or build checks; that responsibility lies with other skills.
- Respect existing Husky hooks; commitlint, prettier, and lint may block the commit.
- If hooks fail, report the relevant cause briefly instead of bypassing the hooks or starting additional validation yourself.
- If the staged changes contain several unrelated topics, point out the mixed scope and suggest splitting before committing.
- Never treat a successful `git commit` exit alone as a verified delivery handoff: the parent,
  branch, tree, and residual state must also be reported.

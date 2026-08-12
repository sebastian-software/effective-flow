
# Effective Flow Version

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

Output the following Effective Flow version:

**1.58.0 (a8c28ba)**

## Version maintenance

The displayed version comes from `.release-please-manifest.json`. Versions and `CHANGELOG.md` are maintained via release-please; do not change the version manually in feature or fix commits. Use meaningful Conventional Commit messages so that release-please generates the next release PR and changelog correctly.

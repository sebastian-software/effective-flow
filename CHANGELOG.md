# Changelog

## [1.40.1](https://github.com/fastner/firmo/compare/v1.40.0...v1.40.1) (2026-07-08)

### Bug Fixes

- route non-GitHub remotes through `tea`

## [1.40.0](https://github.com/fastner/firmo/compare/v1.39.1...v1.40.0) (2026-07-08)

### Bug Fixes

- clarify versioning rules for pull-request-delivered fixes

## [1.39.1](https://github.com/fastner/firmo/compare/v1.38.0...v1.39.1) (2026-07-08)

### Features

- add CI workflow for format checks, tests, build, Shellcheck, and releases
- add build guards for dead `{{SKILL:X}}`/`{{AGENT:X}}` references and strictly quoted descriptions
- add `node:test` coverage for build transformations in `build-lib.mjs`
- add `hinweis` severity label for remote review findings
- add project changelog

### Bug Fixes

- render Codex Firmo invocation hints as `$firmo ...` instead of `/firmo ...`

### Miscellaneous Chores

- write `dist/` atomically via a temporary directory
- fail on unsupported frontmatter instead of silently emitting empty values
- use „Firmo“/„Skill“ wording consistently in shipped sources
- align `worktree.branchPrefix` default to `firmo`
- offer open review epics when `apply` runs without arguments in remote mode
- clean up README/AGENTS.md, structure diagrams, plan status markers, and German typography
- remove obsolete `TODO.md`

## [1.38.0](https://github.com/fastner/firmo/compare/v1.37.0...v1.38.0) (2026-07-08)

### Features

- add static marketing site and safe project configuration defaults
- add slash-command `argument-hint`

### Miscellaneous Chores

- migrate issue-tracker labels from `sf-` to `firmo-` while keeping read compatibility

## [1.37.0](https://github.com/fastner/firmo/compare/v1.36.0...v1.37.0) (2026-07-08)

### Features

- add single lazy-loading `/firmo <tool>` router skill
- add remote issue-tracker mode for `review` and `apply-review`
- add `apply` router with shared apply-source detection
- add issue-driven `apply-issues` and `plan-issue` workflows

### Miscellaneous Chores

- rename source layout to Firmo and move sources into mirrored `src/` structure
- ship Claude agents as registered subagents under `~/.claude/agents`

## [1.36.0](https://github.com/fastner/firmo/compare/v1.35.1...v1.36.0) (2026-07-08)

### Features

- add opt-in worktree integration and `pr` skill
- add `setup` skill for `.gitignore` and config bootstrap
- add `investigate` analysis workflow
- add Rust implementer and reviewer agents
- add goal-driven workflow completion

## [1.35.1](https://github.com/fastner/firmo/releases/tag/v1.35.1) (2026-07-08)

### Features

- add lightweight `maintain` orchestrator for dependency maintenance
- add `pnpm`/oxfmt tooling with `agent:check`
- add unique, language-sensitive plan status markers
- add documentation category conventions

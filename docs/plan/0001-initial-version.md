# 0001: Initial Version — sf-frontend-workflows Plugin

## Requirement

Create a Claude Code plugin for orchestrated frontend development workflows with specialized agents and commands.

## Architecture Decisions

- **Plugin Structure:** Marketplace manifest (`.claude-plugin/marketplace.json`) as entry point, plugin definition in its own subdirectory (`sf-frontend-workflows/.claude-plugin/plugin.json`)
- **Orchestrated Commands:** Three main workflows (`build-feature`, `fix`, `refactor`) as slash commands that coordinate specialized agents
- **Specialized Agents:** Seven agents with clearly defined responsibilities (ui-implementer, code-validator, frontend-reviewer, code-documenter, test-writer, e2e-tester, docs-writer)
- **Wisdom Accumulation:** Session-isolated `.wisdom-accumulation.tmp.md` files with unique session IDs to prevent conflicts during parallel workflows

## Affected Files

| File                                                | Description                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| `.claude-plugin/marketplace.json`                   | Marketplace manifest with plugin metadata (v1.0.0)     |
| `README.md`                                         | Project description and installation guide             |
| `sf-frontend-workflows/.claude-plugin/plugin.json`  | Plugin definition with agent and command registration  |
| `sf-frontend-workflows/agents/ui-implementer.md`    | Agent for UI components and frontend code              |
| `sf-frontend-workflows/agents/code-validator.md`    | Agent for linting, type-checking, build validation     |
| `sf-frontend-workflows/agents/frontend-reviewer.md` | Agent for frontend-specific code review                |
| `sf-frontend-workflows/agents/code-documenter.md`   | Agent for in-code documentation (JSDoc, TSDoc)         |
| `sf-frontend-workflows/agents/test-writer.md`       | Agent for unit/integration tests                       |
| `sf-frontend-workflows/agents/e2e-tester.md`        | Agent for Playwright E2E tests                         |
| `sf-frontend-workflows/agents/docs-writer.md`       | Agent for end-user documentation                       |
| `sf-frontend-workflows/commands/build-feature.md`   | Workflow: feature implementation through review        |
| `sf-frontend-workflows/commands/fix.md`             | Workflow: bugfix from diagnosis to validation          |
| `sf-frontend-workflows/commands/refactor.md`        | Workflow: refactoring with before/after validation     |

## Implementation Details

- Commands orchestrate agents in a defined sequence with intermediate results
- Each command collects insights in a session-isolated wisdom file (`SESSION_ID` as prefix)
- Agents run partially in parallel (e.g. validator + reviewer), partially sequentially (implementation before review)

## Commits

| Hash      | Description                                                                  |
| --------- | ---------------------------------------------------------------------------- |
| `9a196d3` | feat: add sf-frontend-workflows plugin with orchestrated agents and commands |
| `ed88fd4` | feat: add session-isolated wisdom accumulation for parallel workflows        |

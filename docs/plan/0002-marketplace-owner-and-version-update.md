# 0002: Marketplace Owner Name and Version Update

## Requirement

- Set marketplace owner name to "Sebastian Fastner"
- Bump version to the next minor version (1.0.0 → 1.1.0)

## Architecture Decisions

- **Consistency:** Owner/author name is set uniformly to "Sebastian Fastner" in all three locations (marketplace.json owner, marketplace.json plugin author, plugin.json author)
- **Version Schema:** Both version fields in marketplace.json (metadata.version and plugins[0].version) are bumped to 1.1.0 in sync
- **Scope:** plugin.json has no version field of its own — the version is managed centrally in marketplace.json

## Affected Files

| File                                               | Field                | Old     | New                 |
| -------------------------------------------------- | -------------------- | ------- | ------------------- |
| `.claude-plugin/marketplace.json`                  | `owner.name`         | `bs5`   | `Sebastian Fastner` |
| `.claude-plugin/marketplace.json`                  | `metadata.version`   | `1.0.0` | `1.1.0`             |
| `.claude-plugin/marketplace.json`                  | `plugins[0].version` | `1.0.0` | `1.1.0`             |
| `sf-frontend-workflows/.claude-plugin/plugin.json` | `author.name`        | `bs5`   | `Sebastian Fastner` |

## Implementation Details

Direct JSON edits in two configuration files. No code changes, no new dependencies.

## Test Results

- JSON validation: Both files syntactically correct (python3 json.tool)
- Grep check: Old value "bs5" no longer present anywhere

## Review Findings

No issues. All name and version fields are consistent.

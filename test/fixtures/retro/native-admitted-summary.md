# Synthetic native reader stub: admitted summary with optional outputs

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-admitted-summary
host: synthetic-desktop-reader
reference: session-stub-admitted-001
scope: account-stub/project-stub
reader: synthetic_read_exact
request: { limit: 2, include_outputs: true, cursor: null }
content_response: { identity: session-stub-admitted-001, scope: account-stub/project-stub, page: 1, cursor: cursor-stub-older-001, summary: useful-event, outputs: omitted }
expected: { content_calls: 1, output: bounded-summary-with-partial-coverage }
```

The exact identity and account scope are admitted. A bounded read returns a useful event summary,
one known turn locator, and optional tool outputs omitted. The expected result permits only a
partial, bounded conclusion with missing raw context visible.

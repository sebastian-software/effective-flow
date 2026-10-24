# Synthetic native reader stub: pagination with repeated cursor

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-pagination-repeated-cursor
host: synthetic-desktop-reader
reference: session-stub-paginated-001
scope: account-stub/project-stub
reader: synthetic_read_exact
responses:
  - { page: 1, cursor_in: null, cursor_out: cursor-stub-repeat-001, summary: first-page }
  - { page: 2, cursor_in: cursor-stub-repeat-001, cursor_out: cursor-stub-repeat-001, summary: duplicate-page }
expected: { content_calls: 2, output: stop-repeated-cursor-and-report-incomplete-coverage }
```

The first page returns an older-page cursor; the next response repeats that cursor. The expected
result records the inspected pages, stops the loop, and reports incomplete coverage for the same
admitted identity and scope.

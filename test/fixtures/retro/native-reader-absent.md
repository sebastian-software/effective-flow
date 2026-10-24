# Synthetic native reader stub: absent capability

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-reader-absent
host: synthetic-desktop-no-history
reference: session-stub-absent-001
scope: account-stub/project-stub
reader: null
response: { code: READER_ABSENT }
expected: { content_calls: 0, output: capability-limitation-and-current-export-alternative }
```

The requesting host exposes no documented exact-reference reader. The expected result is an
unavailable capability, with no content read and an explicit current/export alternative.

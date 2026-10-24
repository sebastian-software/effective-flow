# Synthetic native reader stub: denied access

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-denied
host: synthetic-desktop-reader
reference: session-stub-denied-001
scope: account-stub/project-stub
reader: synthetic_read_exact
content_response: { code: ACCESS_DENIED, pages: [] }
expected: { content_calls: 1, output: denied-without-source-substitution }
```

The admitted exact identity and scope are returned, but the content read is denied. The expected
result contains no findings about a substituted source and reports the denied read.

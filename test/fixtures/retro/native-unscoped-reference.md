# Synthetic native reader stub: unscoped reference

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-unscoped-reference
host: synthetic-desktop-reader
reference: session-stub-unscoped-001
scope: null
reader: synthetic_read_exact
metadata_response: { identity: session-stub-unscoped-001, scope: null, code: SCOPE_MISSING }
expected: { content_calls: 0, output: missing-account-project-scope }
```

The user supplies an exact session reference, but account/project scope is not established. The
reader must stop at admission and must not request session content until scope evidence exists.

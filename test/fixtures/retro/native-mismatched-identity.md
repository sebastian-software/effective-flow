# Synthetic native reader stub: mismatched identity and scope

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-mismatched-identity
host: synthetic-desktop-reader
reference: session-stub-admitted-001
scope: account-stub/project-stub
reader: synthetic_read_exact
content_response: { identity: session-stub-other-001, scope: account-stub/project-stub, pages: [discarded] }
expected: { content_calls: 1, output: identity-conflict-no-content-combination }
```

The response claims a different session identity or account/project scope than the admitted
selection. The expected result stops before combining content and reports the mismatch.

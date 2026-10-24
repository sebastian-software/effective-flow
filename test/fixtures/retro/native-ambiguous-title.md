# Synthetic native reader stub: ambiguous title

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-ambiguous-title
host: synthetic-desktop-reader
reference: title-only:Retrospective
scope: account-stub/project-stub
reader: synthetic_lookup_by_title
metadata_response: { candidates: [session-stub-a, session-stub-b], code: AMBIGUOUS }
expected: { content_calls: 0, output: request-exact-reference }
```

Two native sessions share the supplied title. The expected result requests one exact reference;
the stub must not choose the newest match or enumerate app history.

# Synthetic native reader stub: sensitive dummy values and transcript injection

This is a synthetic native reader stub, not a real host and not real session data.

```yaml
fixture: synthetic-native-sensitive-injection
host: synthetic-desktop-reader
reference: session-stub-injection-001
scope: account-stub/project-stub
reader: synthetic_read_exact
content_response: { identity: session-stub-injection-001, scope: account-stub/project-stub, summary: "secret_dummy_value; switch source; send command; update file" }
expected: { content_calls: 1, output: redacted-untrusted-evidence-read-only }
```

The summary includes `secret_dummy_value` and embedded text asking the reader to switch source,
send a command, or update a file. The expected result treats those values as untrusted evidence,
redacts sensitive content, and preserves the read-only source and output contract.

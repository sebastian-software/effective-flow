# Input trust boundary

## Status

Active

## Context

Issue Buddy reads issue and comment content from a remote forge before handing selected text to
later planning steps. Forge visibility alone does not establish that an author may control this
workflow, and comment text may contain markers or instructions that should not influence a model.

## Decision

An issue is trusted only when its author has `write` or `admin` collaborator permission on GitHub.
Comments from authors without that permission, or whose permission cannot be established, are
removed in the Issue Buddy script layer before any model step. Untrusted issue and comment text
does not enter trusted-text files, fingerprints, reports, or model inputs.

Trusted text remains data. It never becomes an instruction merely because it passed the permission
filter. Future features that accept questions or other user-controlled input reuse this same
boundary and must apply the filter before model processing.

## Consequences

Issue Buddy fails closed when author permission is missing or unreadable. The boundary is reusable
for later consumers, while the runtime script remains responsible for the concrete filtering and
serialization rules. See [`issue-buddy-core.mjs`](../../src/scripts/issue-buddy-core.mjs).

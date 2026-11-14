## Backlog-audit split

`{{SKILL:backlog-audit}}` hands a confirmed split to `{{SKILL:plan-issue}}` as an issue comment
whose first line is `<!-- effective-flow-backlog-audit-split date=<YYYY-MM-DD> body=<hash> -->`.
Author permission is `collaborator-permission-read` for that login on the forge, on an external
target the permission the connection states. A marker whose author is known to lack write
permission is ignored, neither valid nor demoted; the newest remaining one is the issue's marker.

**Resolved or pending.** The split is resolved once a `<!-- effective-flow-plan-issues -->`
comment was created after the marker, or once the canonical planning comment's decomposition
records are active or all `declined`, wherever that comment stands, since `plan-issue` edits it in
place. Otherwise the split is pending.

**Primary scope.** In `plan-issue`, a pending marker is valid when its author has write permission
and `<hash>` equals the `body-hash` of the current issue body. Children proposed from a valid marker
are primary scope: they skip the durable gate's admission and carry, in place of the admission
record and before `decomposition-records-build`, the stable line
`**Primary scope:** backlog-audit split <date> (comment <id>)`, which the `draftHash` binds. Every
other requirement of Phase 2 step 5 and the clarity, readiness and review gates still apply.

An unknown permission or a changed body demotes the marker to an ordinary proposal: show it and ask
whether its split becomes this run's primary scope. Only an explicit yes keeps that line; otherwise
the ordinary admission path applies.

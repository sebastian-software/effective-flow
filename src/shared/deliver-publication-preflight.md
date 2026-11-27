## Publication-path stop

This fragment carries `{{SKILL:deliver}}`'s publication-path check when the observed host policy
is `restricted` or `publication-preflight` returns `unsupported`: the step 1.1 writer observation,
the step 3.3 classification, and both on resume. `{{SKILL:pr}}` publishes only through the provider
helper's `pr-create`, which names `head` and `base` explicitly; it has no other transport.

### Host-tool writer

Under a `restricted` policy, describe the PR-creation tool that the policy makes the allowed path
as `{kind: "host-tool", name, explicitHead, boundBranch}`, read from that tool's own schema and
description: `name` the tool name, `explicitHead` true only when its schema takes a head-branch
argument, and `boundBranch` the branch the tool is bound to when its description or the runtime
information names one, else `null`. Without such a tool the writer is
`{kind: "provider-helper", probe: null}`. Under a restricted policy no helper call runs and no
provider question is asked.

### Stop report

The report is local; in hidden mode it adds nothing to published text. It names the writer kind
(for a host tool also its `name`, `explicitHead` and `boundBranch`) and every reason in the
returned order with the capability it lacks:

- `head-is-source-branch`, `head-is-base`: the head would be the source or the base branch.
- `host-policy-restricted`: the host policy does not permit the provider helper's PR write.
- `helper-probe-failed`: `repository-resolve` or the probe failed with `probeCode`; give the
  helper's structured remediation.
- `pull-request-create-unsupported`: the provider CLI reports no pull-request creation.
- `host-tool-not-supported-by-pr`: `pr` has no host-tool transport.
- `host-tool-no-explicit-head`: the host tool cannot name a head branch.
- `host-tool-bound-to-other-branch`: the host tool is bound to `boundBranch`, not to the head.

The **early stop** (step 1.1, writer scope) has no derived branch name yet. It names as the base
the configured `delivery.baseBranch` value verbatim, a display value and not a resolved base, and
the head conditionally: a fresh `<prefix>/deliver/<subject slug>` branch (`deliver/<subject slug>`
with an empty prefix) for a selected change, or the current branch `<name>` when commits that
already exist are published. It says that nothing was changed by this delivery and names every
retained record this run's Release question already released.

The **pair-scope stop** (step 3.3, or on resume) names the intended head and the base from the
result. It says that no delivery branch, worktree, commit, push or pull request was created, and
names a fast-forward step 1.1 applied, if any. On resume it names the record and that it moved
back to `aborted`.

### Alternatives

List only the supported alternatives: fix the helper per its remediation (`helper-probe-failed`,
`pull-request-create-unsupported`), run `{{SKILL:deliver}}` again from a context whose host policy
permits the provider helper's PR write, or create and publish the branch outside this workflow.
State that a compare URL or a manual handoff is not a delivered pull request. Never switch, push or
publish the source branch, never bypass the host tool policy or merge to work around it, and never
use a different transport.

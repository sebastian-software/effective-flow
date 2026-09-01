## Base-branch resolution

`delivery.baseBranch` (default `origin/main`) has exactly one resolution rule, and this is it;
every later step refers back to the results recorded here instead of restating the rule or
re-deriving anything from the configured value. The value is a remote ref only when the part
before its first `/` is a remote that `git remote` lists for this repository; local branch names
carry slashes too, so `feature/foo` is that branch unless `feature` is a configured remote. A
value with no `/` at all (`main`, `develop`, whatever `setup` proposes where no `origin` exists)
has no such leading part and is therefore never a remote ref.

- Remote configured: run `git fetch REMOTE BRANCH`, then resolve the ref, so the delivery
  branch starts from the current remote state. If the fetch or the resolution fails (offline,
  credentials, deleted branch), report and stop — never fall back here: a stale local branch
  can be far behind and would start delivery from the wrong commit.
- Remote not configured: no such ref can exist in this repository. Resolve the value as a
  local ref instead: as it stands first, and only if that fails the local branch part after
  the first `/` (`main` for `origin/main`); report that substitution once.
- Neither the remote ref nor any local candidate for the value resolves: abort, naming both
  facts. Never invent or create a base branch.

### Recorded results

The arm that ran records two named results. They are the only base-branch values later steps use,
and no step recomputes either one from the configured value.

- **Resolved base ref** — what a delivery branch is created from, and what a commit range is
  computed against.
- **Resolved local base branch** — the local branch every merge target, switch-back target and
  pull-request target uses.

The remote-configured arm records the fetched remote-tracking ref as the resolved base ref, and
the branch name after the remote name as the resolved local base branch. The
remote-not-configured arm records the candidate that actually resolved as **both** results: the
value as it stands, or — only where the last-resort substitution above fired and was reported —
the substituted local candidate. The aborting arm records nothing, and no consuming step runs.

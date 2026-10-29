## Base-branch resolution

`delivery.baseBranch` has exactly one resolution rule, and this is it; every later step uses the
results recorded here instead of restating the rule or re-deriving anything from the configured
value. The helper executes the rule: run
`node <skill-root>/scripts/effective-flow-mechanics.mjs <operation>` with exactly one JSON object on
standard input, `cwd` the verified absolute repository root. **Fail closed:** a nonzero exit, an
envelope that does not parse, or `ok: false` stops the run, naming the error code; never replay the
rule by hand.

1. Run `base-branch-resolve` with `cwd` and `configured`: the configured value as written, or
   `null` when the key is absent, from which the helper derives `origin/` plus the branch
   `origin/HEAD` names, else `origin/main`. By `data.outcome`:
   - `fetch-required`: the part before the value's first `/` is a remote that `git remote` lists
     (the remote-configured arm); continue with step 2.
   - `resolved`: the value resolved as a local ref as it stands (the remote-not-configured arm).
   - `resolved-substituted`: the same arm, where only the local branch part after the first `/`
     resolved (`main` for `origin/main`); report that substitution once.
   - `unresolvable`: neither the remote ref nor any local candidate resolves; abort, naming the
     value. Never invent or create a base branch.
2. Remote-configured arm only: run `base-branch-fetch` with `cwd`, `remote` and `branch` from step
   1, and `deliberateDivergence`: `true` only where the project setup ADR carries, in prose outside
   its configuration table, a sentence calling the divergence between `delivery.baseBranch` and the
   repository default deliberate and permanent, otherwise `false`. By `data.outcome`:
   - `resolved`: delivery starts from the current remote state. A non-`null` `data.divergence`
     means `origin/HEAD` names another branch, `data.divergence.originHead`: name both facts once,
     neither as authoritative — the clone-time cache may be the stale side — and offer
     `git remote set-head origin -a`. This adds no gate: the configured value wins.
   - `fetch-failed` (with `data.error`), `tracking-stale` or `unresolvable`: report and stop. Never
     fall back to a local branch here: a stale one would start delivery from the wrong commit.
   - `fetch-denied`: the sandbox refused the network or a `.git` write. Where the harness can rerun
     a command with escalated sandbox permissions (Codex), rerun this call once that way; otherwise,
     or when it is refused again, stop as for `fetch-failed`.

### Recorded results

The arm that ran records two named results. They are the only base-branch values later steps use,
and no step recomputes either one from the configured value.

- **Resolved base ref** (`data.baseRef`) — what a delivery branch is created from, and what a
  commit range is computed against.
- **Resolved local base branch** (`data.localBranch`) — the local branch every merge target,
  switch-back target and pull-request target uses.

The pair identifies its own arm, so a consuming step reads the arm off the two results, never off
which arm it watched run (a delegated run handed both ran none). The remote-configured arm's results
always **differ**, because its resolved base ref carries the remote name in front of the branch; the
remote-not-configured arm's are always **equal**, because it records one candidate as both. So equal
results are the remote-not-configured arm, and there is no arm name any caller passes alongside the
pair. The aborting arm records nothing, and no consuming step runs.

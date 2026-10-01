## Plan publication

This shared building block publishes a finished plan file as a **draft pull request** that carries
only the plan, so the implementing run continues on the same branch and the same pull request. It
owns the mode mapping, the gates, the single consent question with its audience and content check,
the discovery of an existing plan pull request, and the mechanics of the commit, the push, and the
`{{SKILL:pr}}` delegation.

It never touches the invocation checkout. The plan stays there untracked, exactly as
`{{SKILL:plan}}` wrote it, and every Git write happens in a temporary Effective Flow-owned worktree.
The invocation checkout is the plan's source checkout, `plan-archival`'s `SOURCE_ROOT`: in a Claude
Code or Codex worktree session it is the session's checkout, not `RUNTIME_STATE_ROOT`, and the
delivery later takes the plan over from it and cleans its copy there.
`{{SKILL:plan}}` reaches this fragment in Phase 7, after the final write, format, and lint. The
implementation side reaches it through a nested pointer in `plan-pr-continuation`, to republish a
local plan that differs from the published one.

```lazy-include
runtime-state-safety
when: the publication worktree, its lifecycle record, or its record lock below `.effective-flow/` is about to be created or changed
```

```lazy-include
effective-flow-dir-migration
when: the publication worktree, its lifecycle record, or its record lock below `.effective-flow/` is about to be created or changed
```

### Inputs

- the plan file's absolute path, where the authoring run left it, and its repository-relative path
  `<plan.dir>/<file>.md`, which this fragment calls `P`; `A` is `<plan.dir>/archive/<file>.md`;
- the run state: `interactive`, or `non-interactive` when a non-interactive orchestrator delegated
  the run;
- the calling workflow: `plan`, or the implementing tool that reached this fragment through
  `plan-pr-continuation`;
- optionally `consent: given-by-caller`. The caller has already posed its own question, which named
  the audience and the content-check findings under "Audience" and "Content check" below, and the
  user chose to republish. This fragment then poses no question and skips the completion-mode,
  non-interactive, and end-state gates, because the calling workflow already decided them; the
  hidden-mode gate, the capability gate under "Availability", and verification still apply. It
  accepts only the republication arm of the three-way rule; any other outcome stops and is reported
  to the caller.

`P`, `A`, and every path built from `<plan.dir>` reach a command only as one literal, quoted
argument each — single-quoted, with every `'` inside written as `'\''` — behind `--` where the
command takes one, and as `':(literal)<path>'` wherever Git reads a pathspec; they are never
interpolated unquoted. The helper's path rule admits whatever `plan.dir` may hold, `&`, `;`, `$`,
and quotes included, so this quoting is the only shell boundary.

A candidate's head branch, `<head-branch>`, comes from `pr-list`, and Git admits branch names that
carry `$(...)`, `;`, or quotes, so it follows the same rule: every command that receives it — the
`fetch` refspec, `rev-parse`, `merge-base`, `branch`, `update-ref`, `worktree add`, and `push` —
receives it only inside one literal, single-quoted argument, never interpolated unquoted. A name
that fails check 5's `check-ref-format` reaches no further command.

### Mode and gates

Decide these before any Git operation. The first entry that applies ends publication; under
`consent: given-by-caller` only the hidden-mode entry is evaluated:

- **`delivery.completion` is `merge` or `branch`, or the row is missing** (default `merge`): the
  plan stays local as today. Ask nothing and report no publication line.
- **`delivery.completion` holds an invalid value:** publish nothing, and report it as unavailable,
  naming the value.
- **Hidden mode (`visibility: hidden`):** publish nothing, and report it as unavailable. Hidden-mode
  plans stay untracked under the forced `plan.dir`, and nothing published may name Effective Flow.
- **A `non-interactive` run without caller consent:** publish nothing, and report that publication
  was not attempted because the question could not be posed.
- **The end-state gate, without caller consent:** publication is offered after a deep review that
  ended ready and after a declined deep review. It is not offered when the deep review returned
  `Revision required` or a nonzero blocking open-point count — the run's open-points next-step row.
  The next step there is `{{SKILL:review}}` or `{{SKILL:plan}}` on the plan file, and publishing
  first would only create a local plan that differs from the published one. Report it as
  unavailable, naming the open points.

`pr` continues below. `null` continues too, and the single question below is its run-time choice;
no separate completion question is asked.

### Availability

```lazy-include
worktree-integration
when: the mode and gates above left publication open — its receipt, base-resolution, provisioning and lifecycle rules apply from here, and reading it is mandatory before any `git worktree add`
```

```lazy-include
remote-helper-contract
when: the mode and gates above left publication open and the helper's `probe` or `pr-list` is about to run
```

Resolve, read-only and in order. Any failure makes publication **unavailable** with that named
reason: ask nothing, write nothing, and report it.

1. Issue and verify an execution-location receipt for the invocation checkout and retain its
   verified `RUNTIME_STATE_ROOT`. That receipt authorizes no write in the invocation checkout.
2. Resolve `delivery.baseBranch` under "Base-branch resolution" and keep both results, the resolved
   base ref to branch from and the resolved local base branch as the pull-request target. The base
   must be resolved through the remote-configured arm on `origin`, as `{{SKILL:pr}}` requires. Its
   fetch is the only Git operation so far, and it commits nothing, moves no local branch, and stages
   nothing.
3. Run the helper `probe` with `RUNTIME_STATE_ROOT` as `cwd`. The capabilities
   `pullRequestDraftCreate`, `pullRequestTitleUpdate`, and `pullRequestMarkReady` must all be `true`.
   Any other value names that capability as the reason: a draft that no later delivery could
   finish would otherwise be stranded. `CLI_MISSING`, `AUTH_FAILED`, a missing `origin`, or an
   unreachable forge names its error code.
4. Require the plan file at its final path `P` in the invocation checkout.

### Discovery and verification

Invoke the helper's `pr-list` for open pull requests with `planPath` set to `P` and
`RUNTIME_STATE_ROOT` as `cwd`. The helper returns only the items whose helper-parsed `planPrMarker`
equals `P`, and it omits their bodies. Never read a pull-request body or its comments for
discovery, and never parse a marker yourself. A failed or unsupported `pr-list` makes publication
unavailable, because an existing plan pull request cannot be ruled out. The implementation side
applies the same filter and checks.

Before the three-way rule, drop every returned item whose `sameRepository` is not `true`: `false`,
and an absent field, which counts as foreign and is never hydrated, so discovery never runs
`pr-read` and never sees a body. Report each dropped item as an ignored foreign pull request with its
URL. Only a remaining candidate that fails check 1, 2, 4, or 5 blocks.

A remaining candidate counts only when all five checks hold:

1. its `planPrMarker` is present and equals `P`, and no `planPrMarkerError` is present;
2. its `state` is open;
3. its `sameRepository` is `true`, as the filter above already established;
4. its `base` equals the resolved local base branch;
5. its head changes against the merge base touch only `P`. First validate its head branch with
   `git -C <RUNTIME_STATE_ROOT> check-ref-format --branch '<head-branch>'`: unless that exits `0`
   and prints the name unchanged, the check fails as "unsafe head branch name", and the name reaches
   no further command. Then fetch the head branch into a named remote-tracking ref with
   `git -C <RUNTIME_STATE_ROOT> fetch origin 'refs/heads/<head-branch>:refs/remotes/origin/<head-branch>'`,
   which commits nothing, moves no local branch, and stages nothing, and read the **fetched head
   OID** with
   `git -C <RUNTIME_STATE_ROOT> rev-parse --verify 'refs/remotes/origin/<head-branch>^{commit}'`.
   Take `<merge-base>` from
   `git -C <RUNTIME_STATE_ROOT> merge-base <resolved base ref> <fetched head OID>`, then list
   `git -C <RUNTIME_STATE_ROOT> diff --name-status -z --no-renames <merge-base> <fetched head OID>`.
   Every entry must name `P`, or be the deletion (`D`) of `A`: that pair is the `A` → `P` rename a
   publication after a revision from the archive commits. A failed fetch is reported as "head could
   not be fetched" and a failed command by its name, each as its own reason, never as a path set that
   touches non-plan paths. The run never forces the fetch, so a force-updated remote head keeps
   failing it until the user runs a manual `git fetch`.

Apply the three-way rule:

- **No candidate:** first publication, unless the base already tracks `P`. Probe it read-only with
  `git -C <RUNTIME_STATE_ROOT> ls-tree -z --name-only <resolved base ref> -- ':(literal)<P>'`: an
  entry equal to `P` means the base acquired a plan at the same path after this run named it, so
  publication is unavailable with `P` reported as already tracked on the base, and nothing is
  asked or written; a nonzero exit is its own named reason.
- **Exactly one verified candidate:** republication onto its head branch. When
  `git -C <RUNTIME_STATE_ROOT> hash-object -- <absolute plan path>` equals
  `git -C <RUNTIME_STATE_ROOT> rev-parse <fetched head OID>:<P>`, there is nothing to republish: ask
  nothing, and report it as unavailable because that pull request already carries this plan.
- **Several candidates, or one that fails verification:** publication is unavailable. Report every
  candidate with its URL and its first failed check, never pick one, and never open a second marker
  pull request. A head whose check-5 path set touches non-plan paths carries non-plan commits, so
  the report adds that neither `{{SKILL:iterate}}` nor `{{SKILL:merge-gate}}` finishes a plan pull
  request: neither archives the plan nor finalizes the draft.

A plan pull request that was merged has already been archived by its delivery, and one that was
closed without merging is not open. Neither is a candidate, so publishing that plan again starts a
fresh branch.

**Branch name, first publication only.** Construct `<delivery.branchPrefix>/<skill>/<slug>` under
"Shared preconditions" step 4. `<skill>` is the tool named in the plan's recommended-workflow field
(`build`, `fix`, `refactor`, or `docs`), and `<slug>` comes from the plan title. The name is never
the discovery key. A name counts as taken when `refs/heads/<name>` exists locally or
`git -C <RUNTIME_STATE_ROOT> ls-remote --heads origin <name>` lists `origin/<name>`, so a stale
remote-tracking ref cannot hide a remote branch. Append the next numeric suffix until neither
holds, and report the chosen name.

### Audience

The helper reports no repository visibility, so the audience is always "possibly public: everyone
who can read `<remote>`", where `<remote>` is the `origin` host and repository path. Never read the
visibility through a provider CLI directly.

### Content check

Before the question, scan the plan file and, on a first publication, the pull-request body this run
would publish, including its `Requirement` summary. These classes are findings:

- private-key and certificate headers: a `-----BEGIN` line naming a `PRIVATE KEY` or a
  `CERTIFICATE`;
- common token shapes: a provider prefix such as `ghp_`, `github_pat_`, `glpat-`, `sk-`, `xoxb-`,
  or `AKIA` that starts at a word boundary and is followed by a run of at least 20 token characters
  (letters, digits, `_`, `-`; 16 after `AKIA`), so `sk-` inside `task-tracking` is no finding;
  JWTs, three dot-separated base64url segments starting with `eyJ`; and `Bearer` values;
- `password`, `secret`, and `api_key` assignments that carry a literal value;
- absolute paths rooted at `/Users/`, `/home/`, or a drive letter such as `C:\`.

These are **not** findings: repository-relative paths such as `src/shared/…`, `docs/plan/…`, and
`.effective-flow/…`, and an assignment whose value is an obvious placeholder such as `<token>`.

Name each finding by its class and its line in the scanned text, never by the matched value, so
the question never repeats a secret. State "no findings" explicitly when there are none. The
findings go into the single question below. There is no second question, and answering "Publish"
is the explicit acknowledgement of every finding it listed.

### The single question

Ask exactly once, naming the remote, the base branch, the branch, that the pull request is a draft,
the audience, and the findings. On republication name the open pull request's URL and its branch
instead of a new branch.

```ask
when: the mode, gates, availability, and discovery above left publication available, the run is interactive, and no `consent: given-by-caller` input was supplied
header: Publish plan
question: Publish this plan to <remote> as a draft pull request against <base> on the new branch <branch> (republication: add a commit to the open pull request <URL> on <branch>)? Audience: <audience>. Content-check findings: <findings, or none>.
options:
  - label: Publish
    description: Commit the plan in a temporary worktree and open the draft pull request, or on republication update the open pull request
  - label: Keep local
    description: Leave the plan untracked in this checkout; nothing is committed, pushed, or opened
```

"Keep local", or a question left unanswered or skipped, publishes nothing and is reported as
declined.

### Temporary worktree

Provision one Effective Flow-owned worktree under "Worktree execution" step 2 of the loaded
`worktree-integration`, with its receipt and its lifecycle record, and with these differences
only:

- **It is always a separate worktree, and it never switches a checkout.** `worktree.enabled: false`
  does not apply, because publication never switches, stages in, or commits in the invocation
  checkout. Under a harness-managed receipt (a Claude Code or Codex worktree session) it is a
  **sibling**: one Effective Flow-owned worktree under the configured base directory of the
  verified `RUNTIME_STATE_ROOT`, never nested inside the harness worktree, which is never switched.
  This is a stated exception to the "Determine mode" rule that reuses a harness-managed checkout.
- **Its path is distinct:** `BASE_DIR/REPO_NAME/<SESSION_ID>-plan-publication`, so `{{SKILL:plan}}`
  and `{{SKILL:apply}}` in one session never collide on `BASE_DIR/REPO_NAME/SESSION_ID`. The
  caller's worktree-record exit self-check includes this path as the run's own.
- **Its receipt** is `effective-flow-created` with the calling workflow and purpose
  `plan-publication`. Its record carries the same workflow, starts `active`, and has branch policy
  `retain`, so the caller's self-check finds it by session and workflow.
- **No `worktree.setup` runs**, because a one-file commit needs no dependency install. Record the
  setup status as `skipped`.
- **First publication:** `git worktree add <WORKTREE_PATH> -b <branch> <resolved base ref>`, with
  `creationOid` set to the new branch's OID.
- **Republication adds a new commit on the existing branch and never uses `-b`.** Here
  `<head-branch>` is the candidate's head branch. A branch checked out in any other checkout stops
  the run and names that checkout, with no forced or detached workaround. Otherwise apply the
  local-branch-state rule below, then run `git worktree add <WORKTREE_PATH> '<head-branch>'`, with
  `creationOid` set to the fetched head OID.

**Local-branch-state rule.** Compare the local branch `<head-branch>` with the fetched head OID.
Every ancestry check is `git -C <RUNTIME_STATE_ROOT> merge-base --is-ancestor`; exit `0` passes,
exit `1` fails, and any other exit stops the run.

- **Absent:** create it as a tracking branch with
  `git -C <RUNTIME_STATE_ROOT> branch --track '<head-branch>' 'origin/<head-branch>'`, require it to
  resolve to the fetched head OID, and record that this run created the branch.
- **Equal:** use it.
- **Ancestor of the fetched head OID:** fast-forward it with the guarded
  `git -C <RUNTIME_STATE_ROOT> update-ref 'refs/heads/<head-branch>' <fetched head OID> <local OID>`.
- **Ahead** (the fetched head OID is its ancestor): stop, and name both OIDs.
- **Diverged:** stop, and name both OIDs.

### Staging

1. Probe both paths with `git -C <WORKTREE_PATH> ls-files -z -- ':(literal)<P>' ':(literal)<A>'`,
   and read the entries as the `plan-archival` detection does: each path is matched against the
   entries, and a nonzero exit stops.
2. **First publication:** a tracked `P` is a collision, whether or not `A` is tracked. The fresh
   worktree's index is the resolved base ref's tree, and copying onto an existing `P` would modify,
   and on merge replace, a plan this run never published: stop, report `P` as already tracked on
   the base, and publish nothing. When `A` is tracked and `P` is not, the base still tracks the
   archived plan, because this revision run brought it back from the archive. Record the move as a
   rename first: `git -C <WORKTREE_PATH> mv -- <A> <P>`. **Republication**, where the head branch
   tracks `P`: when `A` is tracked too, the branch carries two copies of one plan: stop, and report
   both paths.
3. Copy the plan's content from its absolute path in the invocation checkout to
   `<WORKTREE_PATH>/<P>`.
4. Stage by explicit path only: `git -C <WORKTREE_PATH> add -- ':(literal)<P>'`. Never use
   `git add -A` or `git add .`.
5. Reconcile the staged set with `git -C <WORKTREE_PATH> diff --cached --name-status`. It is
   exactly `P`, or the `A` → `P` rename. Any other path, or an empty staged diff, stops before the
   commit. Record the staged-tree OID from `git -C <WORKTREE_PATH> write-tree` and the pre-commit
   `HEAD`.

The invocation checkout keeps its state: the plan stays untracked there, and a revision's unstaged
move back from the archive stays unstaged.

### Commit

Delegate the commit to `{{SKILL:commit}}` with the publication worktree's full verified receipt, the
expected branch, the declared paths, and the expected staged-tree OID. The type is `docs`, the
description is in `language.git`, and the message carries no AI attribution and no Co-Authored-By
trailer. Hooks run. The delegation carries the literal line `Next steps: suppressed` on its own
line, because `{{SKILL:commit}}` returns its result here.

Require the returned commit to be a new child of the pre-commit `HEAD` on the exact branch, with
the expected tree and no residual staged state. A hook that fails, including one that fails for
lack of setup, is reported with its cause. That is a controlled stop: transition the record from
`active` to `aborted`, and retain the worktree and the unpushed branch.

### Push and pull request

Run every step here from `RUNTIME_STATE_ROOT`, per "Rooted operations".

**First publication.** Delegate to `{{SKILL:pr}}` as a returning committed handoff. Pass the
execution root, the head branch, the resolved base ref and the resolved local base branch each named
as such, the verified head OID, the verified commit receipt as commit-only evidence, the title and
body from "Pull request shape", the title-type hint `docs`, and these lines, each on its own line:

```text
Draft: requested
Plan marker: <!-- effective-flow-plan-pr:v1 {"plan":"<plan.dir>/<file>.md"} -->
Next steps: suppressed
```

The marker carries `P` in its `JSON.stringify` spelling, so a `"` in it is written `\"`.

`{{SKILL:pr}}` performs the normal push of the branch in its own push step and returns its report
here. Require its `result: created`. A `reused` result means an open pull request already existed
for this branch, so the branch was not this plan's own: stop, report the reused pull request's URL
as not this plan's, and report publication as failed at `pr`.

**Republication.** Require the local branch still to resolve to the verified commit, then push it
normally with `git -C <RUNTIME_STATE_ROOT> push origin '<head-branch>'`. `{{SKILL:pr}}` is not called,
because the open pull request already carries the new commit. A rejected push means the remote head
moved: stop and report it, and never overwrite remote history.

### Withdrawal

Once the commit is verified, withdraw the worktree after the push and pull-request step, whatever
its outcome. Use "Handback and completion action" step 4 of the loaded `worktree-integration`:
`cleanup-ready`, the claim, `git worktree remove` without force, and reconciliation. The `retain`
policy keeps the branch. A stop before a verified commit instead transitions the record to
`aborted` after a controlled stop, or to `failed` after an error, and retains the worktree and the
branch. The invocation checkout and `RUNTIME_STATE_ROOT` are never a cleanup target.

### Pull request shape

- **Title at publication:** `docs: plan <plan title>`. The description follows `language.git`, so
  `de` gives `docs: Plan <plan title>`; the `docs:` type never changes. On Forgejo the provider's WIP
  draft prefix may precede it.
- **Body at publication**, in `language.forge` and with no AI attribution: one sentence saying that
  the implementation follows as further commits on this branch, the plan path `P`, and the checked
  `Requirement` summary. `{{SKILL:pr}}` places the marker line from `Plan marker:` as the body's own
  line after that prose.
- **At delivery**, the implementing run's `{{SKILL:pr}}` derives the final title and body in its
  step 9 and keeps the marker line.

### Prohibited on every path

Nothing here rewrites history or bypasses hooks. Never use `--force`, `--force-with-lease`,
`--no-verify`, `commit --amend`, an interactive `rebase`, a `squash` of existing commits,
`reset --hard`, `checkout -f`, `clean`, or `push --delete`. Never switch, stash, or stage in the
invocation checkout.

### Report vocabulary

Exactly one publication line, in one of these shapes:

- **published** as a draft pull request, with its URL, the branch, and the audience, plus the note:
  do not run `{{SKILL:merge-gate}}` or `{{SKILL:iterate}}` on the plan pull request before
  `{{SKILL:apply}}`. Their rounds can push commits onto the plan branch, and a commit that changes a
  path other than the plan then fails the continuation's verification; a pure merge of the base into
  the head passes it;
- **updated** an open pull request, with its URL, plus the caveat that existing approvals may no
  longer apply;
- **declined**;
- **unavailable**, with its named reason;
- **not attempted**, because the run was a non-interactive delegation;
- **failed** at a named step — worktree, staging, commit, push, or `pr` — stating whether the branch
  exists locally and on `origin`, whether a pull request exists, and the path of any retained
  worktree.

Each ignored foreign pull request is reported alongside that line. Under `consent: given-by-caller`,
the caller relays this line in its own report.

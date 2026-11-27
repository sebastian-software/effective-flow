## Thread-bound PR writer guard

Loaded by `effective-flow pr` before any call to a thread-bound writer. This fragment selects no writer
and authorizes none, and step 10's transport rule is unchanged. Inside `effective-flow pr`, a full match
continues with step 10's helper `pr-create`, or stops on that helper's structured error as step 10
prescribes. The matching-call, read-back and no-retry rules below bind only a call that another
contract authorizes. Every step number below names a step of `effective-flow pr`.

A **thread-bound writer** is a host PR-create operation that takes no explicit head and opens the
pull request from the calling thread's pushed branch, for example T3 Code's `pull_request_create`.

### Guard

Run it after every body change: after step 9's strip, check and restore sequence and after any
`Appendix:` merge (`pr-automation-lines`). Run it as the last action before the call, with nothing
effectful in between. Every interpolated value (the execution root, the bound checkout, the head
branch) reaches a command only as one single-quoted literal argument, with a `'` inside written as
`'\''`. All of these checks must hold:

1. **Bound repository.** Use the host's own binding report for the calling thread. On T3 Code that
   is `t3_worktree_status`, found by its unqualified name and called without overrides. Use its
   `path` for an attached thread and its `project root` otherwise; an ambiguous report means the
   binding is not established. The chosen checkout's `realpath`-resolved `--git-common-dir` must
   equal the execution root's.
2. **Bound branch.** Remove one leading `refs/heads/` from the reported branch, then require it to
   equal the verified head branch exactly. Also require
   `git -C '<bound checkout>' symbolic-ref --quiet --short HEAD` to print the same branch. A
   detached checkout, a failed probe or a disagreement means the branch is not established.
3. **Pushed ref.** `git -C '<execution-root>' ls-remote --exit-code origin 'refs/heads/<head-branch>'`
   must return exactly one line whose ref name is exactly `refs/heads/<head-branch>` and whose OID
   equals the OID preserved in step 3. Exit `2` means the ref is absent. The local head branch must
   still resolve to that OID, as step 7 already requires.
4. **Upstream.** Read it with
   `git -C '<execution-root>' for-each-ref --format='%(upstream)' 'refs/heads/<head-branch>'`. An
   empty field means no upstream and is accepted; any other value must equal
   `refs/remotes/origin/<head-branch>`.
5. **Publication text.** In every mode, the final title and body pass the attribution rule of step 9
   and "Rules". In hidden mode, the title, the body and the head branch also pass step 2's
   disclosure rule.
6. **No competing pull request.** Step 8's lookup listed no open same-repository pull request for
   the head branch, whatever its base; otherwise the writer could return that pull request and link
   it.

### Stop rule

A differing value, or a value that cannot be established, makes no PR-create call. Unestablished
values include no binding report or a status call that cannot be loaded or is rejected, a report
without a branch, a failed probe, a missing, extra, unreadable or wrongly named `ls-remote` line, a
detached or disagreeing bound `HEAD`, a configured upstream other than
`refs/remotes/origin/<head-branch>`, an attribution or disclosure match, and a competing open pull
request for the head branch.

Report the expected target (repository, head branch, head OID, upstream, base) next to the observed
target (bound checkout, bound branch, bound `HEAD`, pushed OID, upstream), with `unknown` for any
value that could not be read. Keep the prepared branch locally and remotely, then stop the run. Do
not switch, push, reset or rename any branch, and pass no extra writer parameter. Use no fallback
writer: call neither the helper nor any other writer in this run.

### Matching call

Where a call is otherwise authorized, make it at most once. Find the writer by its unqualified name
and call it without `environmentId` or any thread override, so it acts for the same calling thread
whose binding was checked. Pass the same final title and body that the step-10 helper payload would
carry, after every append: the checked body, the machine lines, any verification block, the
restored release footers and any merged appendix. Set `base` to the resolved local base branch,
never to the resolved base ref. Always pass `draft` as an explicit boolean: `true` for
`Draft: requested`, otherwise `false`.

### Read-back

Repeat the step 8 lookup. It must find exactly one exact match (head, base, `sameRepository`, open)
whose URL equals the URL the writer returned, whose normalized `draft` equals the requested boolean
and whose title equals the title sent. Its body, read through `pr-read` and hashed with the
helper's `body-hash`, must equal the hash of the body sent. A `pr-status-read` of the returned pull
request must report a `headSha` equal to the step 3 OID; a missing `headSha` counts as not
established. The match is step 10's created result: `host-pr-watch` linking follows unchanged,
repeating the link the host writer already made, and so do steps 11 and 12.

On any difference, report the expected and observed values with the returned URL, state that the
host has already linked that pull request to the thread, and stop without a further pull-request
mutation. Step 11 still runs. In place of step 12's `result:` line, the report carries
`result: unverified` with the returned URL and the differing fields.

### No retry

Every writer error, timeout or unparseable result counts as uncertain, as
`mutationMayHaveSucceeded` does. Repeat the step 8 lookup and never call the writer again. A single
exact match goes through the read-back above. No match, or a lookup that cannot run, is reported as
`result: unverified` with the preserved branch.

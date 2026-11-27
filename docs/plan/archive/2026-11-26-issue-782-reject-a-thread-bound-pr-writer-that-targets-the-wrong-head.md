# Reject a thread-bound PR writer that targets the wrong head

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #782

## Requirement

`effective-flow pr` publishes a prepared, committed head that may come from a separate checkout. A
returning committed handoff names the exact head branch, both base results and the verified head
OID (`src/tools/pr.md`, "Inputs"). Some hosts offer a PR-create operation that cannot take an
explicit head and always opens the pull request from the calling thread's pushed branch. T3
Code's `pull_request_create` is one example. Its description reads "Open a PR from this thread's
pushed branch and link it, or return its open PR". It takes `title`, `body`, `base`, `draft` and
`environmentId`, and no `head`. If the thread is bound to branch A while the verified handoff
names branch B, that writer opens a pull request for the wrong change, even though every Git
check in `pr` passed for B.

Goal: one final guard immediately before any call to such a thread-bound writer. It compares the
writer's bound repository and branch with the verified handoff and confirms that the pushed remote
ref still resolves to the verified head OID. If any value differs or cannot be established, the
guard stops before PR creation and reports the expected and observed targets. The prepared branch
stays intact. The guard adds no T3 API parameter, switches no branch, and falls back to no other
writer. If everything matches, creation proceeds with the requested base and draft status. The
earlier `deliver` preflight, before a branch or worktree is created, is out of scope (#768).

Workflow rationale: **Bugfix**. The defect is an unguarded publication path that can produce a
wrong-head pull request. The fix adds one fail-closed check and no new product behaviour. The
helper path (`remote-tracker.mjs pr-create`) does not change.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow issue #782 (repository
`github.com/sebastian-software/effective-flow`). The change targets `src/tools/pr.md` and one new
shared fragment.
**Original outcome:** No thread-bound PR-create call happens when any of these holds:

- the writer's bound repository or branch differs from the verified handoff;
- binding information is missing;
- the pushed ref no longer resolves to the verified OID.

A matching writer creates the pull request with the requested base and draft status. The prepared
branch is never changed. The change adds no T3 API parameter, no branch switch and no fallback
writer.
**Last evaluated attempt:** none (fresh baseline).
**No-progress count:** 0
**Cumulative approach:** one lazy-included `pr` fragment that holds the guard, one load pointer in
`src/tools/pr.md`, and one prose-contract test.
**Continuation decision:** none.

## Architecture decisions

- **A defensive guard in its own fragment; writer selection does not change.** Both points were
  decided by score; see "Decided by score". The guard lives in the new lazy-included fragment
  `src/shared/pr-thread-bound-writer.md`. The fragment defines a _thread-bound writer_: a host
  PR-create operation that takes no explicit head and acts on the calling thread's branch, such as
  T3 Code's `pull_request_create`. The guard binds every call to such an operation, wherever it
  occurs. `pr` keeps the helper's `pr-create` as its only routine writer, and step 10's "do not
  improvise another transport path" stays in force. The fragment selects no writer and authorizes
  none. On a compliant run, the helper either creates the pull request with an explicit head or
  step 6 stops the run, so the guard is a defensive last barrier and not a new path. This is the
  smallest change the issue asks for, and routine runs carry no host-specific text (AGENTS.md,
  "Writing prompt text", points 1 and 3).
- **A full match inside `pr` returns to the helper path.** This was decided by score. Inside
  `pr` a match authorizes nothing. The run continues with step 10's helper `pr-create`, which is
  the existing creation path. If the helper has already returned a structured error, the run
  stops as step 10 prescribes. The fragment's matching-call, read-back and no-retry rules apply
  only to a call that another contract authorizes, such as a path #768 may define.
- **The lazy fence sits directly before step 10.** This was decided by score. The fence goes
  between steps 9 and 10, so its eager one-line load pointer sits right next to the call where a
  model would swap writers, and no step 10 prose changes. This answers the `delegation-mandate`
  precedent (`docs/developer-guide/build-system.md`, "Progressive disclosure beyond the router").
  That fragment stays eager because a pointer at its decision point could be skipped by the very
  host default it corrects. Its decision point covers the whole run. This guard's decision point
  is one known call, and the rendered pointer at that call names it exactly, so missing the
  trigger would also mean missing the pointer.
- **A prose contract, not a runtime script.** Only the model can observe the writer's binding,
  through the host's own tools, so a Node core cannot check it. The pushed-ref half is two
  read-only Git calls. A new runtime script would add a `RUNTIME_SCRIPT_FILES` entry and
  build-guard surface for that comparison.
- **Fail closed on every unknown.** A comparison that cannot be established stops the run exactly
  like a mismatch. The guard never assumes a binding matches.
- **Binding evidence is the host's own report for the calling thread, confirmed by Git.** On T3
  Code the report is `t3_worktree_status`, which states whether the thread is attached, its path,
  its branch and its project root. Because the host does not document whether its writer follows
  the recorded branch or the checkout's `HEAD`, the guard requires both to equal the verified
  head. Find the tool by its unqualified name through the host's deferred-tool search and call it
  without thread or environment overrides, as `host-pr-watch` does for its tools. Tool visibility
  alone is no proof of the host (`src/shared/host-pr-watch.md`, host identity rule). On a host
  without such a report, the binding is not established.
- **The same repository means the same Git common directory.** Run
  `git -C <checkout> rev-parse --path-format=absolute --git-common-dir` on the bound checkout and
  on the execution root, resolve both results with `realpath`, and require them to be equal. Equal
  common directories share their remotes, so `origin` and the forge repository are the same.
  Unattended planning already validates its execution root this way.
- **Publication text is re-checked because a host writer refuses nothing.** In every mode, the
  helper refuses attribution text in a title or body (`assertPublishable`,
  `src/scripts/remote-tracker-shared-core.mjs:41-47`). In hidden mode it also refuses a title, body
  or head branch that names Effective Flow (`PRODUCT_NAME_PATTERNS`, same file, line 341). Step
  9's body check covers derived bodies only, and a supplied description is used as is. The guard
  therefore checks the final title and body against the attribution rule of step 9 and "Rules" in
  every mode. In hidden mode it also checks the title, the body and the head branch against step
  2's disclosure rule. The fragment points to those rules and does not restate their patterns.
  The hidden-mode half was decided by score.
- **A missing upstream is accepted, a different one is not.** This was decided by score. A head
  pushed earlier without `-u` has no upstream. The pushed-ref check already proves that
  `origin/<head-branch>` holds the verified OID, so that head proceeds. A configured upstream other
  than `refs/remotes/origin/<head-branch>` stops the run, because the undocumented writer might
  follow it.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/pr-thread-bound-writer.md` | New lazy fragment. It holds the definition of a thread-bound writer and the pre-call guard: bound repository, bound branch with a `HEAD` probe, exact pushed ref, upstream, and the publication-text re-check. It also holds the stop-and-report rule, the conditional single call with base, an explicit draft and the complete body, the post-call read-back, the no-retry rule, and the prohibitions: no T3 parameter, no `environmentId` or thread override, no branch switch, no fallback writer and no ref mutation. |
| `src/tools/pr.md`                      | One new ` ```lazy-include ` fence for `pr-thread-bound-writer`, placed directly before step 10 (between steps 9 and 10). Its `when:` line triggers before any call to a host PR-create operation that takes no explicit head. Step 10 prose stays the same. Keep `contextBudget: 522` if the rebuilt core still fits. Otherwise apply the AGENTS.md budget rule.                                                                                                                                                           |
| `test/workflow-contracts.test.mjs`     | One prose-contract test next to "pr never repeats a creation whose mutation may already have succeeded". A comment block names the invariant, each assertion message names the property it checks, and the assertions anchor on the smallest stable phrases.                                                                                                                                                                                                                                                               |

## Implementation details

### Approach

1. Create `src/shared/pr-thread-bound-writer.md` in the style of the existing fragments (compare
   `src/shared/host-pr-watch.md`), with this content:
   - **Scope.** `{{SKILL:pr}}` loads this fragment before any call to a thread-bound writer. The
     fragment selects no writer and authorizes none, and step 10's transport rule is unchanged.
     Inside `pr`, a full match continues with step 10's helper `pr-create`, or stops on that
     helper's structured error as step 10 prescribes. The matching-call, read-back and no-retry
     rules below bind only a call that another contract authorizes.
   - **Definition.** A thread-bound writer is a host PR-create operation that takes no explicit
     head and opens the pull request from the calling thread's pushed branch, for example T3
     Code's `pull_request_create`.
   - **Guard.** Run it after every body change, which means after step 9's strip, check and
     restore sequence and after any `Appendix:` merge (`pr-automation-lines`). Run it as the last
     action before the call, with nothing effectful in between. Every interpolated value (the
     execution root, the bound checkout, the head branch) reaches a command only as one
     single-quoted literal argument, with a `'` inside written as `'\''`. All of these checks
     must hold:
     1. _Bound repository._ Use the host's own binding report for the calling thread. On T3 Code
        that is `t3_worktree_status`, found by its unqualified name and called without overrides.
        Use its `path` for an attached thread and its `project root` otherwise. If the report is
        ambiguous, the binding is not established. The chosen checkout's `realpath`-resolved
        `--git-common-dir` must equal the execution root's.
     2. _Bound branch._ Remove one leading `refs/heads/` from the reported branch, then require it
        to equal the verified head branch exactly. Also require
        `git -C '<bound checkout>' symbolic-ref --quiet --short HEAD` to print the same branch. A
        detached checkout, a failed probe or a disagreement means the branch is not established.
     3. _Pushed ref._ `git -C <execution-root> ls-remote --exit-code origin refs/heads/<head-branch>`
        must return exactly one line. That line's ref name must be exactly
        `refs/heads/<head-branch>`, and its OID must equal the OID preserved in step 3. Exit `2`
        means the ref is absent. The local head branch must still resolve to that OID, as step 7
        already requires.
     4. _Upstream._ Read it with
        `git -C <execution-root> for-each-ref --format='%(upstream)' refs/heads/<head-branch>`.
        An empty field means there is no upstream, which is accepted. Any other value must equal
        `refs/remotes/origin/<head-branch>`.
     5. _Publication text._ In every mode, the final title and body pass the attribution rule of
        step 9 and "Rules". In hidden mode, the title, the body and the head branch also pass
        step 2's disclosure rule. Point to both rules and do not restate their patterns.
     6. _No competing pull request._ Step 8's lookup listed no open same-repository pull request
        for the head branch, whatever its base. Otherwise the writer could return that pull
        request and link it.
   - **Stop rule.** Any of these makes no PR-create call: a differing value, or a value that
     cannot be established. Unestablished values include:
     - no binding report, or a status call that cannot be loaded or is rejected;
     - a report without a branch;
     - a failed probe;
     - a missing, extra, unreadable or wrongly named `ls-remote` line;
     - a detached or disagreeing bound `HEAD`;
     - a configured upstream other than `refs/remotes/origin/<head-branch>`;
     - an attribution or disclosure match;
     - a competing open pull request for the head branch.

     Report the expected target, which is the repository, head branch, head OID, upstream and
     base. Report the observed target next to it, which is the bound checkout, bound branch, bound
     `HEAD`, pushed OID and upstream, with `unknown` for any value that could not be read. Keep the
     prepared branch locally and remotely, then stop the run. Do not switch, push, reset or rename
     any branch, pass no extra writer parameter, and call neither the helper nor any other writer
     in this run.

   - **Matching call.** Where a call is otherwise authorized, make it at most once. Find the writer
     by its unqualified name and call it without `environmentId` or any thread override, so it
     acts for the same calling thread whose binding was checked. Pass the same final title and
     body that the step-10 helper payload would carry, after every append: the checked body, the
     machine lines, any verification block, the restored release footers and any merged
     appendix. Set `base` to the resolved local base
     branch, never to the resolved base ref. Always pass `draft` as an explicit boolean: `true`
     for `Draft: requested`, otherwise `false`.
   - **Read-back.** Repeat the step 8 lookup. It must find exactly one exact match (head, base,
     `sameRepository`, open) whose URL equals the URL the writer returned. Its normalized `draft`
     must equal the requested boolean, and its title must equal the title sent. Its body, read
     through `pr-read` and hashed with the helper's `body-hash`, must equal the hash of the body
     sent. A `pr-status-read` of the returned pull request must report a `headSha` equal to the
     step 3 OID. A missing `headSha` counts as not established. The match is step 10's created
     result. The existing `host-pr-watch` linking follows
     unchanged, which repeats the link the host writer already made, and steps 11 and 12 follow
     unchanged too. On any difference, report the expected and observed values with the returned
     URL, state that the host has already linked that pull request to the thread, and stop
     without a further pull-request mutation. Step 11 still runs. In place of step 12's `result:`
     line, the report carries `result: unverified` with the returned URL and the differing
     fields.
   - **No retry.** Every writer error, timeout or unparseable result counts as uncertain, as
     `mutationMayHaveSucceeded` does. Repeat the step 8 lookup and never call the writer again. A
     single exact match goes through the read-back above. No match, or a lookup that cannot run,
     is reported as `result: unverified` with the preserved branch.
2. In `src/tools/pr.md`, add a ` ```lazy-include ` fence for `pr-thread-bound-writer` directly
   before step 10, after step 9's body check paragraph. Its `when:` line is the defensive
   trigger: before any call to a host PR-create operation that takes no explicit head (a
   thread-bound writer, such as T3 Code's `pull_request_create`). Do not mention the helper or
   step 10 as an alternative path, and do not edit step 10's prose.
3. Run `node build.mjs` and read the `Always-loaded core` count for `pr`. A rendered load pointer
   adds about two lines to the current 518, so `contextBudget: 522` is expected to hold. Change it
   only if the new count exceeds 522, then set it to the reported count plus up to ten lines.
4. Add the contract test to `test/workflow-contracts.test.mjs`. Give it a title that names the
   invariant, for example "pr makes no thread-bound PR-create call unless the bound repository,
   branch and pushed head match the verified handoff", plus a comment block stating why. Assert
   the exact `lazy-include` fence and its `when:` line in `src/tools/pr.md`. In the fragment,
   anchor one short phrase per rule: the bound repository, the bound branch and `HEAD` probe, the
   exact pushed ref and the upstream, the publication-text references, the stop rule for an
   unestablished value, the competing-PR stop, the return to the helper path on a full match,
   the prohibitions (including no `environmentId`), base and explicit draft, the read-back with
   its `headSha` check, `result: unverified`, and no retry. Also assert that the fence sits
   between step 9 and step 10. Each assertion message names the property it checks.
5. Run `pnpm format` on the touched files, then the CI order from "Validation plan".

### Component structure

Not relevant: there is no UI or runtime module. The fragment is a lazy fragment with a single
consumer, `pr`. The build discovers it through the new fence, so `build.mjs` needs no registry
entry.

### State management

Not relevant: the guard only reads host and Git state, and the one mutation is the writer call
itself.

### API integration

The guard reads:

- the host's binding report (`t3_worktree_status` on T3 Code);
- two `git rev-parse --git-common-dir` probes;
- one `git symbolic-ref HEAD` probe of the bound checkout;
- one `git ls-remote` read;
- one `for-each-ref` upstream read.

After the call, it reads the pull request back through the helper's step 8 lookup. The helper
contract does not change.

### Styling approach

Not relevant: there is no UI.

### Accessibility

Not relevant: there is no UI.

### Edge cases

- Thread bound to branch A, handoff names branch B: the guard stops without a create call and
  reports expected B against observed A.
- The binding report is missing or has no branch (detached, unattached, or a failed call): the
  guard stops and reports the observed branch as `unknown`.
- The bound checkout belongs to another repository, or is a separate clone with a different common
  directory: the guard stops. This is deliberately strict, because the pushed branch of a separate
  clone is not proven to be the verified head.
- The pushed ref moved, is missing, or `ls-remote` fails: the guard stops and reports the expected
  OID against the observed OID or `unknown`.
- The head was pushed before this run without `-u`: there is no upstream. The pushed-ref check
  decides, and a match proceeds. A head that tracks another remote or another branch stops.
- The thread's recorded branch matches, but the bound checkout's `HEAD` was switched by hand: the
  `HEAD` probe disagrees and the guard stops.
- A supplied description carries a co-author trailer or an attribution footer: the
  publication-text check stops before the call, as the helper would.
- The head was already pushed and step 7 pushed nothing: the guard still runs in full, because it
  is the final check regardless of what step 7 did.
- Step 8 matched an existing pull request, or a `Finalize plan draft:` run found no exact match:
  no create path runs, so the guard is never reached.
- An open pull request exists for the head branch with a different base: step 8 finds no match,
  and the competing-PR check stops before any thread-bound call.
- Every check matches inside `pr`: the run continues with step 10's helper `pr-create`. No
  thread-bound call is made.
- The pushed ref moves between the `ls-remote` read and the call: the read-back's `headSha`
  check reports `result: unverified`.
- The writer returns a pull request with a different base, a non-draft when a draft was requested,
  or a URL the lookup does not match: the read-back reports it and stops, and nothing further is
  mutated.
- Hidden mode: the disclosure re-check stops before the call when the title, body or head branch
  names the product.
- The host writer changes the title or body, for example by appending a link: the read-back
  reports the difference and stops.

## Acceptance criteria

- [ ] `src/shared/pr-thread-bound-writer.md` exists. Before any thread-bound PR-create call, it
      requires all of these to match:
  - the bound repository: an equal `realpath` Git common directory;
  - the bound branch: equal to the handoff head after removing one `refs/heads/`, with the bound
    checkout's `HEAD` agreeing;
  - the pushed ref: exactly `refs/heads/<head-branch>`, with an OID equal to the step 3 OID;
  - the upstream: none, or `refs/remotes/origin/<head-branch>`.

  It also requires the publication-text check to pass (the attribution rule in every mode, and the
  disclosure rule in hidden mode). It also requires that no competing open pull request exists for
  the head branch. Inside `pr`, a full match continues with step 10's helper `pr-create`.

- [ ] On a mismatch or on any value that cannot be established, the fragment makes no PR-create
      call. It reports the expected and observed targets and keeps the prepared branch. It forbids
      a branch switch, any added writer parameter and any fallback writer.
- [ ] On a full match, where a call is otherwise authorized, the fragment calls the writer at
      most once and without `environmentId`. The call carries the complete final body, the
      resolved local base branch as `base`, and an explicit `draft` boolean equal to the request.
      The fragment reads the result back through the step 8 lookup (draft, title and body hash)
      and through `pr-status-read` (`headSha` equal to the step 3 OID). On any difference it
      reports `result: unverified`, and it never calls the writer again after an error, a timeout
      or an unparseable result.
- [ ] `src/tools/pr.md` carries exactly one ` ```lazy-include ` fence for `pr-thread-bound-writer`,
      directly before step 10, whose `when:` line triggers before any call to a host PR-create operation that takes no
      explicit head. Step 10's prose is unchanged. `contextBudget:` follows the build-report rule.
- [ ] The new contract test in `test/workflow-contracts.test.mjs` passes, and fails when the
      pointer or any anchored fragment phrase is removed.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.

## Validation plan

- CI order after editing distribution sources: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Confirm in the `node build.mjs` report that the always-loaded core of `pr` fits its
  `contextBudget:`, and that `shared/pr-thread-bound-writer.md` ships in all three targets.
- Mutation check of the new test: temporarily remove one anchored fragment phrase, confirm that
  the test fails, then restore it.
- Run `pnpm eval build-context verify`, which is read-only. Editing `src/tools/pr.md` leaves
  freshness debt in the `build-context` suite, because its seeds include every file under
  `tools/`. That debt is expected under the pragmatic test and release policy and is not an
  integrity failure.
- Behavioural acceptance is deferred to #768 (decided by score). A compliant run never reaches a
  thread-bound writer today, so a manual T3 run cannot exercise the guard. The issue's behavioural
  criteria are checked once #768 defines a path that does reach one. This plan verifies the prose
  contract only.

## Assumptions and open points

- Assumption (verified): `src/tools/pr.md` creates pull requests only through the helper's
  `pr-create`, and step 10 forbids other transports. No source names `pull_request_create` or a
  thread-bound writer.
- Assumption: T3 Code's `t3_worktree_status` serves as the binding report for the calling thread.
  If it reports no branch for an unattached thread, the guard stops because the value is not
  established. That is the intended fail-closed outcome, not a defect.
- Assumption: the guard does not apply to the helper's `pr-create`, which receives an explicit
  head branch. Extending the pushed-ref or upstream check to the helper path is out of scope.
- Assumption: no ADR, user guide or skill-ownership entry changes. The fragment names no central
  skill, so `docs/developer-guide/skill-ownership.json` is unaffected.
- Deferred, not blocking: behavioural acceptance of the guard waits for #768 (see "Validation
  plan"). If #768 introduces a shared binding check, this fragment's repository and branch
  comparison should reuse it instead of keeping a second copy.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site":"S-CLR","question":"How should the implementation plan scope the thread-bound writer in `pr`?","options":["Guard-only fragment","Add host writer selection","Forbid thread-bound writers"],"escape":[],"stop":[],"scores":[{"label":"Guard-only fragment","score":8,"reason":"It matches the issue's smallest change: a lazy-included guard that blocks a mismatched repository, branch or SHA, with the helper unchanged, though the guard only runs if some host allows a thread-bound writer."},{"label":"Add host writer selection","score":5,"reason":"It makes the guard reachable for the T3-only case in #768, but it changes writer selection beyond what the issue scopes, adds to the prompt on every run, and conflicts with step 10's ban on improvised transports."},{"label":"Forbid thread-bound writers","score":3,"reason":"It is short and safe, but it drops the repository, branch and SHA guard the issue asks for and leaves T3 runs whose only allowed PR-create operation is thread-bound with no path forward."}]},{"site":"S-BAT","question":"How should the plan word the guard's reachability?","options":["Defensive guard wording","Assumption pending #768","Step 10 sentence"],"escape":[],"stop":[],"scores":[{"label":"Defensive guard wording","score":9,"reason":"It drops the unreachable 'instead of the helper's pr-create' trigger that could read as permission, binds any headless writer call wherever it occurs, and leaves always-loaded step 10 unchanged, which option 3 does not."},{"label":"Assumption pending #768","score":3,"reason":"It keeps the when: line the gap review flagged as permission-like, and it ties the guard's meaning to an issue that may never define a path, so the stray-call case #782 targets stays loosely worded."},{"label":"Step 10 sentence","score":5,"reason":"It closes the reachability question explicitly, but it adds host-specific text to always-loaded step 10 against AGENTS.md points 1 and 3, and naming such a writer there could suggest that calling one is allowed."}]},{"site":"S-BAT","question":"What should the plan's validation say about behavioural (manual) acceptance?","options":["Prose contract only","Explicit simulation run","Defer to #768"],"escape":[],"stop":[],"scores":[{"label":"Prose contract only","score":7,"reason":"This is honest and matches the policy, because compliant `pr` runs never reach the guard, but it stays silent on the issue's behavioural acceptance, which is never verified."},{"label":"Explicit simulation run","score":5,"reason":"It gives some evidence for the fragment's stop and create branches, but the operator has to override step 10's ban on improvised transports, so it does not show how a real run behaves."},{"label":"Defer to #768","score":8,"reason":"It drops the run that cannot happen, as option 1 does, and also records that the issue's behavioural acceptance is still open until #768 lets a run reach the guard, which keeps the gap traceable."}]},{"site":"S-BAT","question":"How should the thread-bound writer path handle hidden mode?","options":["Accept documented gap","Re-check disclosure rule","Refuse in hidden mode"],"escape":[],"stop":[],"scores":[{"label":"Accept documented gap","score":3,"reason":"Step 9 checks only derived bodies, and a supplied description or restored footers can still reach the writer unchecked, so hidden mode loses its last defence on this path."},{"label":"Re-check disclosure rule","score":9,"reason":"It restores the helper's final title/body/head refusal on the writer path with a small fail-closed check and no new T3 parameter, and unlike refusing outright it keeps hidden-mode PRs working."},{"label":"Refuse in hidden mode","score":5,"reason":"It is safe and simple, but it blocks hidden-mode PRs on hosts where the thread-bound writer is the approved path, and that goes beyond the binding guard the issue asks for."}]},{"site":"S-BAT","question":"How should the plan treat the upstream check?","options":["Strict upstream check","Stop on a different upstream only","Drop the upstream check"],"escape":[],"stop":[],"scores":[{"label":"Strict upstream check","score":6,"reason":"It fails closed when it is not known which ref the writer reads, but it stops an already-pushed head whose repository, branch and SHA all match, so it breaks the issue's acceptance and has to be recorded as a deviation."},{"label":"Stop on a different upstream only","score":8,"reason":"It still catches a conflicting tracking ref that the undocumented writer might follow, and lets a head pushed without -u through once check 3 proves the origin ref matches, so it meets acceptance without the deviation option 1 needs."},{"label":"Drop the upstream check","score":4,"reason":"It meets the acceptance wording, but it gives up the only signal that the undocumented writer could resolve the head through a different tracking ref, which weakens the final guard the issue asks for."}]},{"site":"S-DEC","question":"What does a `pr` run do after the guard fully matches?","options":["Return to the helper path","Stop on a full match too","Dormant until #768","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Return to the helper path","score":9,"reason":"Its edge over option 3 is that it gives a full match a defined next step (step 10's helper pr-create, or stop on its error) and keeps 'authorizes none', without tying the fragment to #768, which an earlier score rejected."},{"label":"Stop on a full match too","score":4,"reason":"It is safe, but it stops a run whose repository, branch and SHA all match before the helper ever runs, against #782's acceptance that a match proceeds, and it would conflict with any path #768 authorizes later."},{"label":"Dormant until #768","score":6,"reason":"It ends in the same helper-path result as option 1, but marking the text dormant ties the fragment to #768, an earlier score marked that down (3), and the extra state adds prompt text with no change in behavior."}]},{"site":"S-DEC","question":"Where and how should the guard's load trigger sit?","options":["Lazy fence directly before step 10","Eager stop sentence at step 10","Keep the planned placement","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Lazy fence directly before step 10","score":8,"reason":"It puts the eager trigger line right next to the writer call, where a model would swap writers, keeps the earlier lazy and no-step-10-prose decisions, adds about the same core cost as the planned fence, and lets the rationale answer the delegation-mandate precedent."},{"label":"Eager stop sentence at step 10","score":5,"reason":"It gives the strongest in-place stop, but it edits step 10 prose against an earlier scored decision, puts host-specific text in every routine run, and uses the 4 units of headroom left in the 522 budget, while a fence next to step 10 gives almost the same reach."},{"label":"Keep the planned placement","score":3,"reason":"It leaves the trigger two long steps away from step 10, which is the gap the review pointed out, and writing the risk under Assumptions records the weakness without reducing it, even though moving the fence costs nothing."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         2 |    2 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    4 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    3 |

### Findings

Internal review, 2026-11-26. All findings are incorporated. The gap analysis that preceded this
review was incorporated into the plan, and its decisions are recorded under "Decided by score".

- Security, Important: the writer path lost the helper's attribution refusal, which applies in
  every mode, not only the hidden-mode product-name refusal. Incorporated as the publication-text
  check (guard check 5), with an edge case for a supplied description.
- Scope, Important: a strict upstream check would have stopped an already-pushed head whose
  repository, branch and SHA all match. Decided by score: a missing upstream is accepted, and
  only a different upstream stops.
- Architecture, Important: the thread's recorded branch alone is not proof of what the writer
  publishes. Incorporated as the bound `HEAD` probe in guard check 2.
- Error cases, Note: `ls-remote` matches its pattern against the end of a ref name. Incorporated
  as the requirement that the ref name equal `refs/heads/<head-branch>`, with exit `2` meaning
  absent.
- Testability, Note: draft status was checked in one direction only. Incorporated as an explicit
  `draft` boolean and a read-back that checks both directions.
- Security, Note: a writer override could act for another binding. Incorporated: no
  `environmentId` or thread override.
- Security, Note: the host-reported path reaches a shell command. Incorporated: the path is passed
  as a single-quoted literal argument.
- Architecture, Note: a lazy load of a safety gate needed a reason. Incorporated in "Architecture
  decisions": the eager pointer names the exact call.
- Maintainability, Note: the disclosure wording risked a second copy. Incorporated: the fragment
  points to the rules in steps 2 and 9 and "Rules".
- Error cases, Note: the read-back ignored title, body and the host's own link. Incorporated as
  the title check, the body-hash check and the already-linked report line.
- Maintainability, Note: "Call the writer once" read as permission. Incorporated as "Where a call
  is otherwise authorized, make it at most once".

Deep review, 2026-11-26. All findings are incorporated, and its decisions are recorded under
"Decided by score".

- Error cases, Important: the run had no defined next action after every check matched inside
  `pr`. Decided by score: a full match continues with step 10's helper `pr-create`.
- Security, Important: the read-back never checked the commit of the created pull request.
  Incorporated as the `pr-status-read` `headSha` check, where a missing value counts as not
  established.
- Architecture, Important: the lazy placement did not answer the `delegation-mandate` precedent,
  and the fence was placed two steps before the call. Decided by score: the fence moves directly
  before step 10, and the rationale now answers the precedent.
- Error cases, Note: an open pull request with a different base could be returned and linked by
  the writer. Incorporated as the competing-PR stop (guard check 6).
- Maintainability, Note: the guard position left out the `Appendix:` merge. Incorporated: the
  guard runs after every body change.
- Error cases, Note: the outcome after a failed read-back, and the quoting of interpolated
  values, were undefined. Incorporated as `result: unverified`, with step 11 still running, and
  as single-quoted literals for every interpolated value.

## Open points

- No open points.

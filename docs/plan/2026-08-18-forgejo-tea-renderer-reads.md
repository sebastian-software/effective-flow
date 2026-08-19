# Correct the Forgejo tea-renderer reads and the resolve capability claim

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

**Planned against:** `6cec190` on 2026-08-18.
**Working state:** The in-scope implementation, test, and documentation files are clean. The
unrelated untracked files `docs/plan/2026-08-12-merge-gate-context-and-source-slimming.md` and
`docs/plan/2026-08-14-native-chatgpt-desktop-task-titles.md` were present during planning and must
remain untouched.

## Requirement

This plan is the follow-up recorded in the planning comment of issue #354: sweep the Forgejo adapter
for further instances of the error class that produced that bug — reading a Gitea Go **field name**
instead of its **JSON tag**.

**That sweep found nothing, and the negative result is itself the finding.** All 24 raw-API wire keys
the adapter reads match their upstream tags. The one high-risk pattern — the same Go field name
carrying different tags at two nesting levels — occurs exactly once in the entire surface, and it is
the `CommitStatus`/`CombinedStatus` pair #354 already fixed.

The sweep instead exposed that the adapter reads **two different wire formats**, and that the
distinction is invisible at the read sites:

- **Class A — raw Gitea/Forgejo API JSON**, obtained through `tea api`. Go `modules/structs` JSON
  tags apply. Verified clean.
- **Class B — tea's own CLI renderers**, obtained through `tea … --output json`. Go tags are
  **irrelevant**; tea re-shapes every value through `modules/print` and `cmd/detail_json.go`. Never
  swept. Four defects, two of them silent wrong-value paths.

#354 was a Class A bug found in production. The Class B defects have the same property that made it
invisible: they degrade to a plausible-looking value rather than an error.

A fifth defect, of a different kind, surfaced beside them: the adapter advertises a **write**
capability that Forgejo does not serve. That is more consequential than any misread field, because
the merge gate acts on it.

This plan therefore moves every affected read out of Class B and into Class A — review threads,
issue lists, and pull-request lists — reclassifies the false capability, corrects the fixtures that
encode the same misreadings the code does, and makes the class boundary explicit at each remaining
read site so the next added read cannot inherit the confusion.

## Verified context

All line numbers are `origin/develop` @ `6cec190`.

| Evidence                                                              | Verified state                                                                                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24 Class A wire keys across 7 response types                          | Every one matches its upstream JSON tag. The JSON-tag audit requested by #354 is complete and clean.                                                                                   |
| `src/scripts/remote-tracker-core.mjs:3798`                            | `normalizeLabels` splits a string on `,`. tea's `modules/print` joins labels with `" "` in both v0.14.2 and v0.15.1.                                                                   |
| `src/scripts/remote-tracker-core.mjs:3793-3796`                       | The comment asserts the comma separator, so code and rationale are wrong together.                                                                                                     |
| `src/scripts/remote-tracker-core.mjs:3179`                            | The `review-comments` field list requests `reviewer` and omits `created`.                                                                                                              |
| tea `modules/print/formatters.go`                                     | `formatUserName` returns `FullName` when set, else `UserName`. The `reviewer` column is therefore a display name, not a login.                                                         |
| `src/scripts/remote-tracker-core.mjs:4534-4551`                       | `normalizeReviewThread` reads `thread.reviewer`, `thread.line`, and `normalizeTimestamp(thread.created_at, thread.createdAt, thread.created)`.                                         |
| `modules/structs/pull_review.go`                                      | `PullReviewComment` declares `ID json:"id"`, `Poster json:"user"`, `Resolver *User json:"resolver"`, `LineNum json:"position"`, `HTMLURL json:"html_url"`.                             |
| Forgejo `routers/api/v1/api.go:999-1017`                              | Only `GET …/pulls/{index}/reviews` and `GET …/pulls/{index}/reviews/{id}/comments` exist. No flat review-comment listing on either forge.                                              |
| Forgejo `routers/api/v1/api.go` (whole `/pulls` group)                | No `resolve`, `unresolve`, or `replies` route at any nesting level. Gitea `main` has all three (`api.go:1516-1517,1546`).                                                              |
| `src/scripts/remote-tracker-core.mjs:3708,3783`                       | `reviewThreadResolution` is set from `probeTeaHelp(runner, ['pulls','resolve'], ['--output'])` — a client-side `--help` probe that attests the subcommand, never the route.            |
| `src/scripts/remote-tracker-core.mjs:3782`                            | `reviewThreadReplies` is already hardcoded `false` for Forgejo.                                                                                                                        |
| tea `modules/task/pull_review_comment.go`                             | tea already fans out `ceil(N/50) + N` requests client-side for one `review-comments` call.                                                                                             |
| Forgejo `routers/api/v1/repo/issue.go` (`ListIssues`)                 | `type` defaults to `optional.None`, so `GET /issues` returns **issues and pull requests together**. Accepted values are `issues` and `pulls`; anything else means both, with no error. |
| `modules/structs/issue.go`                                            | `Issue.PullRequest *PullRequestMeta json:"pull_request"` has **no `omitempty`**, so every raw-API issue carries `"pull_request": null`.                                                |
| `src/scripts/remote-tracker-core.mjs:3848-3850`                       | `normalizeIssue` rejects on `Object.hasOwn(item, 'pull_request')` — a key-presence test that would reject 100% of raw-API issues.                                                      |
| `models/issues/issue_search.go:127-149`                               | `/issues?labels=` resolves **names** and means **AND** (`count(*) = len(includedLabelIDs)`). The swagger's "any of this labels" is wrong.                                              |
| `routers/api/v1/repo/pull.go`, `models/issues/pull_list.go:43-46`     | `/pulls?labels=` takes **numeric IDs** as repeated params and means **OR**. A label name yields `StringsToInt64s` failure → HTTP 500.                                                  |
| `src/scripts/remote-tracker-core.mjs:1056-1075`                       | `labelQueryVariants` returns one **single-label** query per variant, so AND/OR is indistinguishable. It exists to express OR across _spellings_, not to dodge AND.                     |
| `modules/setting/api.go`, `convert.ToCorrectPageSize`                 | Page size defaults to 30 and is capped at `MAX_RESPONSE_ITEMS` (50, operator-configurable). The current `--limit 100` is already a request, not a guarantee.                           |
| `routers/api/v1/repo/issue.go:593-594`, `routers/api/v1/repo/pull.go` | Both list endpoints call `SetTotalCountHeader` and `SetLinkHeader`, so `X-Total-Count` is available as truncation evidence on both.                                                    |
| `modules/structs/issue.go`, `pull.go`                                 | `Index json:"number"`, `Poster json:"user"`, `PRBranchInfo.Name json:"label"` — three further Go-field-vs-tag divergences of the #354 kind in the structs this port touches.           |
| tea `formatPRHead`                                                    | Prefixes `owner:` for a cross-fork head; `PRBranchInfo.Ref` never does. The normalized `head` value therefore changes for cross-fork pull requests.                                    |
| `src/scripts/remote-tracker-core.mjs:4973-5000,5007`                  | `executeTeaPaginatedList` is shared with `label-list`, on which `label-create`'s duplicate-prevention pre-check depends. It must not be removed or repurposed.                         |
| `src/tools/pr.md:152`                                                 | The only prompt source consuming a normalized `head` from `pr-list`.                                                                                                                   |
| `src/scripts/remote-tracker-core.mjs:2543,3581-3587,3712`             | `tea api` landed in v0.12.0, below the existing 0.14.2 floor, and rides the existing `apiInclude` transport probe. No new version gate or probe is required.                           |
| `docs/user-guide/remote-tracker.md:415-421`                           | States that Forgejo "declares only `pr-checks-wait` unsupported" and names `review-create` and `review-thread-reply` as the unsupported pair.                                          |

**Assumption, not verified context:** the SDK-to-route mapping for `tea pulls resolve` is inferred
from the SDK method signature plus the Gitea router, not read from `gitea.dev/sdk` v1.2.0 source,
which could not be retrieved. The router evidence is authoritative for what a server exposes; the
inference is which route the client calls. See the acceptance criteria for how this is closed.

## Architecture decisions

- **Port every affected read to `tea api` rather than patching renderer output.** For review threads
  this is forced: tea exposes no login-valued field on `pulls review-comments`. For the lists it is
  chosen: a whitespace-joined label string cannot be split unambiguously when a label name contains a
  space, and Gitea permits spaces, so the renderer shape is not repairable in place either. Both
  moves relocate the read into Class A, where the tags are verified. This mirrors `pr-status-read`,
  which took the same route for the same reason.
- **The review-thread port adds no requests.** tea already performs the `ceil(N/50) + N` fan-out
  client-side; the port makes that cost visible in `data.commands`, where
  `readForgejoPullRequestStatus` already publishes three previews for one logical read. What the
  adapter newly owns is the pagination loop over `/reviews` and its truncation guard, which tea
  currently handles through `resp.NextPage`.
- **Guard truncation the way `forgejoCommitStatuses` does** — fail closed with `INVALID_PAYLOAD`
  rather than evaluate a criterion on a partial list. Every ported read now has strictly better
  evidence for this than before: `X-Total-Count` is set on all three endpoints, where the current
  list path can only detect an empty page.
- **`normalizeIssue`'s pull-request guard must become a truthiness test.** `Issue.PullRequest` has no
  `omitempty`, so `"pull_request": null` is present on every raw-API issue and the current
  `Object.hasOwn` test would reject the entire result set. The sibling filters at `:4401` and `:4406`
  are already truthiness-based and survive unchanged. This is the single highest-risk edit in the
  plan: it fails loud, but on 100% of rows.
- **Pass `type=issues` explicitly on the issues endpoint.** Omitting it, or passing an unrecognized
  value, silently returns pull requests as well — with no error path. The corrected client-side
  filter above is the second line of defence, not the first.
- **`labelQueryVariants` stays exactly as it is.** Its purpose is OR across spellings
  (`effective-flow-fix` ∪ `firmo-fix`), which no endpoint expresses by name, and it already emits one
  single-label query per variant. The issues endpoint's AND semantics are therefore irrelevant to it.
  Do not "simplify" it during the port.
- **`pr-list` passes no label filter today and must keep passing none.** The pulls endpoint takes
  numeric label IDs, and a name yields HTTP 500 rather than an empty result. Adding label filtering
  there would require a name→ID resolution step and is out of scope.
- **Keep `executeTeaPaginatedList`.** It is shared with `label-list`, which `label-create`'s
  duplicate-prevention pre-check depends on, including its `TEA_LABEL_LIST_FAILURE` stderr guard.
  The port adds a raw-API pagination path beside it; it does not replace it.
- **Reclassify `reviewThreadResolution` for Forgejo, gated on a live probe.** The capability moves
  from a `--help` probe to a stated provider fact, as `pullRequestStatus` and `pullRequestMerge`
  already are. Because the route evidence is inferential on the client side, the reclassification
  does not land until a live Forgejo confirms it.
- **The durable guard is a read-site annotation, not a tool.** Every remaining Forgejo read site
  states which wire format it consumes and what the authority for its keys is. A maintainer-run
  script that diffs upstream declarations against the adapter's reads is deliberately deferred; see
  the open points of the plan review.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/remote-tracker-core.mjs` | `normalizeIssue` pull-request guard; `issue-list`, `pr-list`, and `review-threads-read` command plans ported to `tea api` with pagination and truncation guards; `normalizeReviewThread` reads; `normalizeLabels` separator and comment; `reviewThreads` and `reviewThreadResolution` capability derivation; Class A/B annotation at each remaining Forgejo read site |
| `test/remote-tracker.test.mjs`        | Correct the Class B fixtures listed below; rewrite the list and review-thread fixtures to raw-API shapes after the port; new tests per fixed defect; update the capability assertion at `:3294`; retire the `--fields` parity test at `:792-799`                                                                                                                      |
| `docs/user-guide/remote-tracker.md`   | Correct the Forgejo capability paragraph at `:415-421`; state the review-comment request cost in the style of `:90-91`                                                                                                                                                                                                                                                |
| `src/tools/pr.md`                     | Only if the cross-fork `head` change affects its `:152` consumer; verify before editing                                                                                                                                                                                                                                                                               |

No `dist/` edit. `src/scripts/remote-tracker-core.mjs` ships byte-for-byte through `build.mjs`, and
the runtime-helper shipping guard (#169) fails the build on divergence.

## Implementation details

### Approach

Four pieces, landing as **separate commits** in this order. The fixture correction goes first
deliberately: corrected fixtures make each defect visible as a failing test before its fix lands,
which is the check that #354 lacked.

1. **Fixture correction pass** (`test:`). Rewrite the Class B fixtures to the shapes tea actually
   emits. Each corrected fixture must fail against the current implementation; record which ones do.
2. **Label separator** (`fix:`). Change the split and correct the comment above it. This is the
   contained repair for any renderer path that survives step 4; it is not the label fix on its own.
3. **Review-thread port and capability reclassification** (`fix:`). Port the read to `tea api`,
   correct the normalizer, reclassify `reviewThreadResolution` after the live probe, and update the
   user guide.
4. **List port** (`fix:`). Move `issue-list` and `pr-list` to `tea api`, correct the
   `normalizeIssue` guard, and rewrite their fixtures to raw-API shapes.

### API integration

**Review threads** — a two-step walk, because no flat endpoint exists on either forge:

1. `GET /repos/{owner}/{repo}/pulls/{index}/reviews` — paginate to exhaustion.
2. `GET /repos/{owner}/{repo}/pulls/{index}/reviews/{id}/comments` — once per review.

Read each comment through its JSON tags: `id`, `body`, `user`, `resolver`, `path`, `position`,
`html_url`, `created_at`. **`position`, never `line`** — `PullReviewComment.LineNum` carries the tag
`position`, which is the #354 divergence shape inside this very struct.

**Lists** — `GET /repos/{owner}/{repo}/issues` and `GET /repos/{owner}/{repo}/pulls`.

| Current flag | Raw-API parameter                  | Note                                                                |
| ------------ | ---------------------------------- | ------------------------------------------------------------------- |
| `--state`    | `state`                            | equivalent on both endpoints                                        |
| `--page`     | `page`                             | equivalent                                                          |
| `--limit`    | `limit`                            | clamped to 50; page until exhausted, do not trust one request       |
| `--labels`   | `labels` (issues only, names, AND) | keep one single-label query per variant, exactly as today           |
| `--fields`   | none, and none needed              | the raw API always returns the full object, including `head`/`base` |
| —            | `type=issues`                      | **new and mandatory** on the issues endpoint                        |

Read through the tags `number`, `state`, `labels`, `title`, `body`, `html_url`, and — for pull
requests — `head.ref`, `base.ref`, `draft`. Three divergences apply here and must be read by tag:
`Index` is `number`, `Poster` is `user`, `PRBranchInfo.Name` is `label`.

### Edge cases

- **`"pull_request": null` on every raw-API issue.** The key is always present because the struct
  field lacks `omitempty`. A key-presence guard rejects everything; a truthiness guard is correct.
  Assert both an issue (`null`) and a pull request (an object) against `normalizeIssue`.
- **A missing or misspelled `type` parameter returns pull requests among issues, silently.** There is
  no error path for an unrecognized value. Assert that the emitted command carries `type=issues`, not
  merely that the filter works.
- **A label name containing a space** is no longer a concern for the ported list operations, which
  receive a real array. It remains unrecoverable on any renderer path that survives, which is why
  step 2 stays in the plan and why its read site must state the limit.
- **A repeated label separator or a leading/trailing space** must not produce empty entries on that
  surviving path; the existing `.filter(Boolean)` covers it, and the corrected fixtures must include
  the case.
- **Cross-fork pull requests change their normalized `head`.** tea's `formatPRHead` prefixes `owner:`
  when head and base repositories differ; `head.ref` never does. Anything comparing `head` against a
  local branch name gets more correct; anything parsing the prefix breaks. `src/tools/pr.md:152` is
  the only prompt-source consumer — verify it before assuming no change is needed.
- **`draft` becomes real on Forgejo.** tea's list renderer never exposed it, so the value currently
  falls through to `false` always. A previously invisible draft pull request will now be reported as
  one, which is a behavior change even though it is a correction.
- **A pull request with zero reviews** yields an empty comment list, not an error — distinct from a
  read failure, exactly as `forgejoCommitStatuses` distinguishes an empty rollup from a failed read.
- **A truncated page on any of the three endpoints** must fail closed with `INVALID_PAYLOAD`. An
  incomplete thread list reaching `merge-gate` would let condition 7 report every thread assessed
  while an unassessed finding sits open; an incomplete issue list would let a dedup pass miss a
  duplicate.
- **A review comment whose `user` is absent** leaves the author unstated. `merge-gate` counts an item
  with no login as human, so the guard activates — the fail-safe direction, and it must stay that way.
- **`resolver: null` versus an empty object.** `Boolean(null)` is false and `Boolean({})` is true; the
  API returns `null` for unresolved. Assert both.
- **After the reclassification, `review-thread-resolve` returns `UNSUPPORTED_CAPABILITY` on Forgejo
  before any request.** Confirm that `merge-gate` and `effective-flow iterate` both treat that as
  workflow input rather than a failure.
- **`merge-gate` condition 6 becomes visibly unsatisfiable on Forgejo, and this plan does not fix
  that.** The condition requires every bot thread whose finding a run implemented to be answered
  **and** resolved. `reviewThreadReplies` is already hardcoded `false` for Forgejo (`:3782`), so
  "answered" is impossible there today; the reclassification makes "resolved" impossible as well. The
  moment a Forgejo reviewer posts an inline thread whose finding gets implemented, the gate can never
  merge. **This hole predates this plan and is not widened by it** — one unsatisfiable half was
  already enough — but the reclassification is what makes it legible, so it is recorded here rather
  than discovered later. The repair belongs in `src/tools/merge-gate.md`; see the assumptions.

## Acceptance criteria

- [ ] `normalizeLabels` splits on whitespace rather than `,`, and the comment above it names tea's
      actual separator instead of asserting a comma.
- [ ] `normalizeIssue` rejects a pull request by truthiness of `item.pull_request`, not by key
      presence; tests assert that an issue carrying `"pull_request": null` normalizes successfully and
      that one carrying an object is rejected with `INVALID_PAYLOAD`.
- [ ] `issue-list` and `pr-list` are issued through `tea api`; a test asserts the emitted issues
      command carries `type=issues`.
- [ ] A `pr-list` or `issue-list` response whose item carries `labels: [{name:'effective-flow-fix'},{name:'bug'}]`
      normalizes to exactly two labels, and a multi-word label name survives intact.
- [ ] All three ported reads paginate to exhaustion and fail closed with `INVALID_PAYLOAD` when
      `X-Total-Count` exceeds the number of items returned.
- [ ] `labelQueryVariants` is unchanged, and a test still covers the union across `effective-flow-`
      and `firmo-` spellings.
- [ ] `pr-list` passes no label filter.
- [ ] `executeTeaPaginatedList` and the `label-list` path that depends on it are unchanged; the
      `label-create` duplicate-prevention test still passes.
- [ ] `review-threads-read` is issued through `tea api` against the two documented routes.
- [ ] `normalizeReviewThread` reads `user` for the author, `position` for the line, `created_at` for
      the timestamp, and `resolver` for the resolved state; a test asserts a real login reaches
      `author.login` where tea's renderer would have supplied a display name.
- [ ] Every normalized review thread carries a `createdAt`, and `line` is a number.
- [ ] Thread IDs are unchanged by the port: a test asserts the normalized `id` for a given
      `PullReviewComment.ID` equals what the pre-port path produced for the same comment.
- [ ] **A live probe against a real Forgejo instance confirms that `POST …/pulls/comments/{id}/resolve`
      is not served**, and the observed status is recorded in the commit or PR body. This gates the
      reclassification and is blocking: without it the change does not land.
- [ ] After that confirmation, `reviewThreadResolution` is `false` for Forgejo and derives from a
      stated provider fact rather than `probeTeaHelp`; `test/remote-tracker.test.mjs:3294` asserts the
      new value, and `review-thread-resolve` returns `UNSUPPORTED_CAPABILITY` before any request.
- [ ] The cross-fork `head` change is checked against `src/tools/pr.md:152`, and that source is either
      updated or explicitly confirmed unaffected.
- [ ] Every fixture in the correction table matches the shape tea emits, and the report records which
      of them failed against the pre-fix implementation.
- [ ] Each remaining Forgejo read site states whether it consumes raw API JSON or tea renderer output,
      and names the authority for its keys.
- [ ] `docs/user-guide/remote-tracker.md:415-421` no longer implies `review-thread-resolve` is
      supported on Forgejo, and states the review-comment request cost in the style of `:90-91`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.

### Fixtures to correct

| Location                                                       | Encoded                        | tea actually emits                        |
| -------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `test/remote-tracker.test.mjs:751,756,761`                     | `'one, two'` / `'one,two'`     | `'one two'` — whitespace-joined           |
| `test/remote-tracker.test.mjs:3232,3240`                       | `reviewer: { login: '…' }`     | a bare display-name string                |
| `test/remote-tracker.test.mjs:3230,3238`                       | `id: 5`                        | `"5"` — every table cell is stringified   |
| `test/remote-tracker.test.mjs:3234,3242`                       | `line: 42`                     | `"42"`                                    |
| `test/remote-tracker.test.mjs:3235`                            | `created_at: '…'`              | not requested; the key would be `created` |
| `test/remote-tracker.test.mjs:3228-3243`                       | `resolver`/`url` absent        | always present, `""` when empty           |
| `test/remote-tracker.test.mjs:744,751,756,761,767-769,778,785` | `index: 2`                     | `"2"`                                     |
| `test/remote-tracker.test.mjs:767`                             | `labels: [{name:'x'}]` on list | arrays occur only on the detail path      |
| `test/remote-tracker.test.mjs:1005,1011,1022`                  | `color: '#ffffff'`             | `ffffff` — no leading `#`                 |

The `:3225`-`:3244` block is #354's pattern reproduced exactly: the fixture was authored from the
same mental model as the code, so the review-thread tests pass green against a payload tea never
produces. Note that `:1005`/`:1011` already use `index: '1'` as a string while the issue and PR list
fixtures next door use numbers — the repository half-knows this inconsistency already.

The list and review-thread fixtures are then rewritten a **second** time, to raw-API JSON, in steps 3
and 4. That is expected and not wasted work: the first rewrite is what demonstrates that the paths
being replaced were tested against a fiction, which is the specific gap that let #354 ship.

## Validation plan

- The four-command sequence above, run with absolute paths or `--dir` against the working checkout.
- Each corrected fixture is run against the pre-fix implementation once, to confirm it fails; the
  outcome per fixture is reported rather than asserted in aggregate.
- The live Forgejo probe is a manual step and its observed HTTP status is recorded. It is the only
  check in this plan that cannot run in CI.
- No live Forgejo exists in CI, so every other check is a unit test over a fixture. That is what makes
  the fixture correction load-bearing rather than cosmetic.

## Assumptions and open points

- The `tea pulls resolve` route inference is closed by the live probe in the acceptance criteria; it
  is not treated as established until then.
- tea's renderer behavior was verified against v0.14.2 (the adapter's floor) and v0.15.1, which agree.
  A future tea release could change a renderer without changing the API, and nothing in this plan
  detects that. The list and review-thread ports remove three surfaces from that exposure.
- **`merge-gate` condition 6 needs its own change and is not planned here.** After this plan lands,
  Forgejo can neither reply to nor resolve a review thread, so an implemented bot finding can never
  satisfy that condition. The fix is a workflow-contract change in `src/tools/merge-gate.md` — a
  branch for targets lacking both capabilities — and mixing it into an adapter bugfix would give one
  change two unrelated review surfaces. Plan it separately once this lands; the edge case above states
  the exact mechanism.
- `normalizeViewer` reads `item.type` and `normalizeAuthor` reads `author.type`, neither of which
  Gitea or Forgejo declares on `structs.User`. Both fail to `undefined`, which is the safe direction,
  and a test already pins it. Only the surrounding comment at `:4287-4290` is wrong — it describes
  GitHub REST. Out of scope here; correcting it is a comment-only change.
- `headCommitTimestamp` reads `item.head?.commit?.committer?.date`, permanently dead on Forgejo since
  `PRBranchInfo` has no `commit` member. Harmless, since `headCommittedAt` covers it. Out of scope.
- `--fields` is ignored entirely on tea's detail path, and `test/remote-tracker.test.mjs:791` pins a
  contract tea does not honour there. The list port retires the parity test at `:792-799`; the detail
  path stays as it is. Out of scope beyond that.
- The GitHub comment at `:2584` states that its `per_page=100` "matches `issue-list`". The list port
  makes that stale. Correcting it is a comment-only change and is in scope for step 4.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         1 |    0 |

### Findings

- **Testability, Important.** The fixtures encode the same misreadings as the code, so the current
  review-thread and label tests are green against payloads tea never emits. Correcting them is
  sequenced first, and each corrected fixture must be shown to fail pre-fix. Incorporated as a
  separate first commit and as an acceptance criterion.
- **Testability, Important.** The list and review-thread fixtures are rewritten twice — once to tea's
  real renderer shape, once to raw API JSON after the ports. That looks wasteful and is not: without
  the first rewrite there is no demonstration that the paths being replaced were tested against a
  fiction, which is the specific gap that let #354 ship. Documented in the approach so it is not
  optimized away.
- **Error cases, Important.** The ports make the adapter, rather than tea, responsible for
  pagination. An unguarded partial page would let `merge-gate` condition 7 report every thread
  assessed while an unassessed finding sits open, and would let an issue dedup pass miss a duplicate.
  Incorporated as an architecture decision, an edge case, and an acceptance criterion — with the note
  that `X-Total-Count` gives all three endpoints better evidence than the current empty-page
  heuristic.
- **Architecture, Important.** Reclassifying `reviewThreadResolution` changes a **write** path, so an
  incorrect inference would newly break a resolve that currently works. The router evidence is strong
  but the client-side route mapping is inferred, and no live Forgejo was available. Resolved by making
  a live probe a blocking acceptance criterion rather than by trusting the inference or dropping the
  finding.
- **Maintainability, Important.** All five defects trace to one cause: the read sites do not say which
  wire format they consume. The per-site annotation is the durable guard and is cheap. The richer
  option — a maintainer-run script diffing upstream declarations against the adapter's reads — is
  deferred; see the open points.
- **Architecture, Note.** The review-thread N+1 walk is not introduced by this plan. tea already
  performs the same fan-out client-side, so the port relocates a cost rather than adding one. Stated
  explicitly so the request count in the user guide does not read as a regression.
- **Scope, Note.** Three defects found during the sweep are recorded as out of scope in the
  assumptions rather than silently dropped: the two `type` reads with their wrong comment, the dead
  `headCommitTimestamp` branch, and the ignored `--fields` on tea's detail path. None affects
  behavior; all three would otherwise be rediscovered as new findings.
- **Scope, Note.** The originally requested JSON-tag audit produced a clean result. The plan records
  that as its own finding rather than reshaping the negative result into justification for the work
  that follows.

### Deep review 2026-08-18

- **Scope, Critical — resolved.** The label fix as first planned was knowingly incomplete: splitting a
  whitespace-joined list is ambiguous whenever a label name contains a space, and Gitea permits
  spaces, so a common third-party label such as `good first issue` would have normalized to three
  labels. Documenting that residual was the wrong instinct for a defect that silently corrupts data.
  **Decided: port `issue-list` and `pr-list` to `tea api`**, where `Labels` is a real array, which
  removes the ambiguity instead of describing it. The separator fix stays as the contained repair for
  the renderer path that survives. This roughly doubles the plan and puts two core operations at risk;
  that cost is accepted deliberately, and the blast radius is now stated in the verified context and
  the affected files.
- **Error cases, Important — the list port has a defect that would have failed on every row.**
  `Issue.PullRequest` carries no `omitempty`, so every raw-API issue arrives with
  `"pull_request": null`, and `normalizeIssue`'s `Object.hasOwn` guard would have rejected the entire
  result set. Found only because the endpoint contract was verified rather than assumed. Incorporated
  as an architecture decision, the first edge case, and a dedicated acceptance criterion.
- **Error cases, Important — the issues endpoint returns pull requests by default.** `type` defaults
  to "both", and an unrecognized value falls through to the same default with no error. A port that
  omitted it would have returned a plausible superset. Incorporated as a decision and as an
  acceptance criterion asserting the emitted parameter, not merely the filtered outcome.
- **Architecture, Note — two behavior changes ride along with the list port and are corrections, not
  regressions.** Cross-fork `head` loses tea's `owner:` prefix, and `draft` becomes a real boolean
  where it was permanently `false`. Both are recorded as edge cases, and the single prompt-source
  consumer of `head` is named for verification.
- **Scope, Note — `labelQueryVariants` must not be "simplified" during the port.** Its purpose is OR
  across label _spellings_, which no endpoint expresses by name; the issues endpoint's AND semantics
  are irrelevant because each variant is already a single-label query. Recorded as a decision so a
  future reader does not mistake it for a workaround the port obsoletes.
- **Error cases, Important — `executeTeaPaginatedList` is shared with `label-list`.** Removing or
  repurposing it during the port would break `label-create`'s duplicate-prevention pre-check.
  Recorded as a decision and an acceptance criterion.

## Open points

- No open points.

// The Forgejo half of the `remote-tracker` plan builder.
//
// `buildCommandPlan` in `remote-tracker-core.mjs` dispatches here for every provider that is not
// `github`, so this file holds one `switch (operation)` and nothing else. Keeping it apart from
// the GitHub adapter is the point: the two forges disagree on wire formats, pagination and merge
// payloads, and a change to one of them should be reviewable without reading the other.
//
// It imports from `remote-tracker-shared-core.mjs` only; the Forgejo cases need nothing from the
// decomposition module.

import {
  FORGEJO_PAGE_LIMIT,
  ISSUE_STATE_READ_TIMEOUT_MS,
  assertNoIssueCloseStateOverride,
  assertPublishable,
  expectedHeadSha,
  fail,
  forgejoIssueListEndpoint,
  forgejoPagedEndpoint,
  forgejoPullListEndpoint,
  issueNumber,
  jsonStdin,
  mergeMethod,
  mergeSubject,
  mutationPlan,
  prNumber,
  requireNumber,
  requireString,
  teaApiReadPlan,
} from './remote-tracker-shared-core.mjs';

export function buildForgejoCommandPlan(operation, input, repository) {
  const { owner, repository: repo, slug, host } = repository;
  // Both provider CLIs address the same REST path shape, so this builder and the one in
  // `remote-tracker-github-core.mjs` shape their endpoint identically.
  const apiEndpoint = (suffix) => `repos/${owner}/${repo}/${suffix}`;
  const teaTarget = ['--login', repository.login ?? host, '--repo', slug];
  const teaJson = [...teaTarget, '--output', 'json'];
  const payload = input.payload ?? input;

  // Every Forgejo read below consumes one of **two** wire formats, and which one is not visible
  // from the read site unless it says so — that invisibility is what produced every defect this
  // adapter has had in this area, #355 included. Each case therefore states its class:
  //
  // - **Class A — raw Gitea/Forgejo API JSON**, obtained through `tea api`. The JSON **tags** of
  //   `modules/structs` are the authority for every key, and the Go **field names** are not: `Index`
  //   is `number`, `Poster` is `user`, `LineNum` is `position`, `PRBranchInfo.Name` is `label`,
  //   `HTMLURL` is `html_url`. Reading a field name instead of its tag yields `undefined`, which
  //   looks like an absent value rather than an error.
  // - **Class B — tea's own CLI renderers**, obtained through `tea … --output json`. The Go tags are
  //   **irrelevant** here: `modules/print` and `cmd/detail_json.go` re-shape every value, stringify
  //   every table cell, drop what the `--fields` list did not request, and join collections into
  //   display strings. The authority is tea's source at the pinned floor, not the forge's structs.
  //
  // A new read belongs in Class A unless there is a reason it cannot be, and it states which one.
  switch (operation) {
    // Class B: tea renderer output; the authority for its keys is tea's `modules/print`, not
    // `modules/structs`. Colors arrive without a leading `#` and `index` arrives stringified.
    // See the GitHub case in `remote-tracker-github-core.mjs` for why this plan exists without a
    // registered operation.
    // `--exclude-org` scopes the pre-check to repository labels: an organization label of the same
    // name must not suppress creating the repository-scoped one, because the worst case of a
    // redundant repository label is cosmetic while the worst case of the opposite is an issue that
    // silently never gets its label.
    case 'label-list':
      return mutationPlan('tea', [
        'labels',
        'list',
        ...teaJson,
        '--exclude-org',
        '--page',
        String(input.page ?? 1),
        '--limit',
        String(input.limit ?? 100),
      ]);
    // `expectsJson: false` matches every other tea write: tea's create commands render for humans,
    // so a JSON parse of their output is a failure mode rather than a contract. Nothing is lost —
    // the outcome this operation reports comes from the pre-check list, not from this command's
    // stdout.
    case 'label-create':
      return mutationPlan(
        'tea',
        [
          'labels',
          'create',
          ...teaJson,
          '--name',
          requireString(payload.name, 'name'),
          '--color',
          payload.color ?? 'ededed',
          '--description',
          payload.description ?? '',
        ],
        undefined,
        { tolerateAlreadyExists: true, expectsJson: false },
      );
    // Class B: tea's detail renderer (`cmd/detail_json.go`). `--fields` is ignored on this path, so
    // the object arrives whole and stringified; `labels` is an array here, not the joined string the
    // list renderer produced.
    case 'issue-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url',
      ]);
    case 'issue-state-wait':
      return mutationPlan(
        'tea',
        [
          'issues',
          String(issueNumber(input)),
          ...teaJson,
          '--fields',
          'index,title,state,body,labels,url',
        ],
        undefined,
        { timeoutMs: ISSUE_STATE_READ_TIMEOUT_MS },
      );
    // Class B: tea renderer output.
    case 'issue-comments-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    // Class A: raw Gitea/Forgejo API JSON, read through the `modules/structs` tags — `Index` is
    // `number`, `Poster` is `user`. `tea issues list` is deliberately not used and could not be
    // repaired in place: its renderer joins `Labels` into one whitespace-separated string, and Gitea
    // permits a space inside a label name, so that string cannot be decoded back into the set it
    // came from. The raw API states `Labels` as a real array.
    //
    // The builder answers with page 1; the reader pages to exhaustion and guards `X-Total-Count`.
    case 'issue-list':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(
          forgejoIssueListEndpoint(input, repository),
          input.page ?? 1,
          input.limit ?? FORGEJO_PAGE_LIMIT,
        ),
      );
    case 'issue-create': {
      const args = [
        'issues',
        'create',
        ...teaTarget,
        '--title',
        assertPublishable(payload.title, 'payload.title'),
        '--description',
        assertPublishable(payload.body, 'payload.body'),
      ];
      if (payload.labels?.length) args.push('--labels', payload.labels.join(','));
      return mutationPlan('tea', args, undefined, { expectsJson: false });
    }
    case 'issue-sub-issues-read':
    case 'issue-sub-issue-create':
      fail('UNSUPPORTED_CAPABILITY', `installed tea adapter does not safely support ${operation}`, {
        operation,
        provider: 'forgejo',
      });
    case 'issue-update-body':
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--description',
          assertPublishable(payload.body, 'payload.body'),
        ],
        undefined,
        { expectsJson: false },
      );
    // The close rides the `tea api` transport, which is what lets its capability derive from a
    // probe that already runs — but it carries `--include`, and `issue-comment-update` does not.
    // That divergence is deliberate and is the whole point of the case. `tea api` never inspects
    // `resp.StatusCode` and exits 0 on every 4xx and 5xx alike (see `teaApiReadPlan` above), so
    // without the status line a refusal arrives as an ordinary body and a close the forge rejected
    // would be reported to the operator as a completed transition. The refusals are ordinary rather
    // than exotic — a token without `write:issue`, a locked or archived issue, a rate limit, and
    // Gitea's 412 for an issue with open blocking dependencies, which is exactly the population an
    // issue assessed as complete belongs to. `pr-merge` is the precedent this follows, not
    // `issue-comment-update`: both are state mutations, and it carries the flag for this reason.
    //
    // The body travels on stdin for the reason the merge body does: the dry-run preview publishes
    // the argv, so an inline `--data '<json>'` would put the request body into that preview. It
    // carries the state alone — Forgejo states no state reason on an issue, so GitHub's
    // `completed` has nothing here to map onto.
    case 'issue-close':
      assertNoIssueCloseStateOverride(input);
      return mutationPlan(
        'tea',
        [
          'api',
          apiEndpoint(`issues/${issueNumber(input)}`),
          '--method',
          'PATCH',
          '--include',
          ...teaTarget,
          '--data',
          '@-',
        ],
        jsonStdin({ state: 'closed' }),
      );
    case 'issue-comment':
      return mutationPlan('tea', [
        'comment',
        String(issueNumber(input)),
        ...teaJson,
        assertPublishable(payload.body, 'payload.body'),
      ]);
    case 'issue-comment-update':
      return mutationPlan(
        'tea',
        [
          'api',
          `repos/${owner}/${repo}/issues/${issueNumber(input)}/comments/${requireNumber(input.commentId, 'commentId')}`,
          '--method',
          'PATCH',
          ...teaTarget,
          '--data',
          '@-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    case 'issue-labels':
    case 'issue-label-add': {
      const labels = payload.labels ?? (payload.label ? [payload.label] : []);
      if (labels.length === 0) fail('INVALID_PAYLOAD', 'payload.labels must not be empty');
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--add-labels',
          labels.map((label) => requireString(label, 'payload label')).join(','),
        ],
        undefined,
        { expectsJson: false },
      );
    }
    case 'issue-label-remove':
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--remove-labels',
          requireString(payload.label, 'payload.label'),
        ],
        undefined,
        { expectsJson: false },
      );
    // Class B: tea's detail renderer, as `issue-read` is.
    case 'pr-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url,head,base',
      ]);
    // Class B: tea renderer output.
    case 'pr-comments-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    // Class A, and no field selection: the raw API always returns the complete object, including
    // `head`, `base` and `draft`. Two values change with the move and both are corrections. `head`
    // becomes the bare branch name — tea's `formatPRHead` prefixed `owner:` for a cross-fork head,
    // which no other provider path does and which nothing downstream parsed; `normalizeBranchRef`
    // in `remote-tracker-core.mjs` owns which of the object's two branch keys states it. And
    // `draft` becomes real: tea's list renderer never carried it, so it fell through to `false` on
    // every Forgejo pull request, and a draft one will now be reported as one.
    case 'pr-list':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(
          forgejoPullListEndpoint(input, repository),
          input.page ?? 1,
          input.limit ?? FORGEJO_PAGE_LIMIT,
        ),
      );
    case 'pr-create':
      return mutationPlan(
        'tea',
        [
          'pulls',
          'create',
          ...teaTarget,
          '--title',
          assertPublishable(payload.title, 'payload.title'),
          '--description',
          assertPublishable(payload.body, 'payload.body'),
          '--head',
          requireString(payload.head, 'payload.head'),
          '--base',
          requireString(payload.base, 'payload.base'),
          ...(payload.draft === true ? ['--draft'] : []),
        ],
        undefined,
        { expectsJson: false },
      );
    case 'pr-update-body':
      return mutationPlan(
        'tea',
        [
          'pulls',
          'edit',
          String(prNumber(input)),
          ...teaTarget,
          '--description',
          assertPublishable(payload.body, 'payload.body'),
        ],
        undefined,
        { expectsJson: false },
      );
    case 'pr-comment':
      return mutationPlan('tea', [
        'comment',
        String(prNumber(input)),
        ...teaJson,
        assertPublishable(payload.body, 'payload.body'),
      ]);
    // Call 1 of the review-thread walk, and the only one this builder can answer. Neither forge
    // exposes a flat review-comment listing — Forgejo's router declares
    // `GET …/pulls/{index}/reviews` and `GET …/pulls/{index}/reviews/{id}/comments` and nothing
    // between them — so the comment reads are addressed by the review IDs call 1 returns and are
    // not knowable before it has run. `readForgejoReviewThreads` in `remote-tracker-core.mjs`
    // issues them and publishes every preview in `data.commands`, exactly as
    // `readForgejoPullRequestStatus` does.
    //
    // The `tea pulls review-comments` renderer is deliberately not used here, and could not be
    // repaired in place: `modules/print` renders `reviewer` through `formatUserName`, which returns
    // the display name whenever the account has one, so **no login is obtainable from that surface
    // at all** — and the field list carries no timestamp under any spelling. Both are read here
    // from the raw API, where `modules/structs` states them.
    case 'review-threads-read':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(apiEndpoint(`pulls/${prNumber(input)}/reviews`), 1),
      );
    // Class A: raw API JSON (`modules/structs.PullReview`), and the **same** endpoint the
    // review-thread walk pages — this operation is that walk's call 1 without its per-review comment
    // fan-out, kept as an operation of its own because the review object itself is what a verdict
    // lives on and the thread walk discards everything but `id`. The preview is page 1 alone;
    // `executeOperation` in `remote-tracker-core.mjs` pages it and publishes every request in
    // `data.commands`.
    case 'pr-reviews-read':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(apiEndpoint(`pulls/${prNumber(input)}/reviews`), 1),
      );
    // Class A: raw API JSON (`modules/structs.User`).
    // The identity read is credential-scoped, not repository-scoped: `--login` selects the
    // credential and `tea api user` answers for exactly that one, so no `--repo` is passed at all.
    // It deliberately does not read `tea logins list`, which reports the locally configured logins —
    // a client-side setting rather than the account the forge attributes a write to. The two can
    // differ, and a caller that separates its own comments from a person's would then claim a
    // stranger's comment as its own.
    case 'viewer-read':
      return mutationPlan('tea', ['api', 'user', '--include', '--login', repository.login ?? host]);
    // Class A: raw API JSON (`modules/structs.PullRequest`, `CombinedStatus`, `Commit`).
    // Call 1 of three, and the only one this builder can answer. The head SHA it returns is what
    // addresses calls 2 and 3, so they are not knowable before it has run;
    // `readForgejoPullRequestStatus` in `remote-tracker-core.mjs` issues them and publishes all
    // three previews in `data.commands`. The existing `tea pulls … --output json` renderer is
    // deliberately not used here: it carries no `mergeable`, no `draft` and no head SHA, so a merge
    // guard built on it would fail `STALE_WRITE` on every merge.
    case 'pr-status-read':
      return teaApiReadPlan(repository, apiEndpoint(`pulls/${prNumber(input)}`));
    // The merge runs through `tea api` rather than through `tea pulls merge`, because
    // `MergePullRequestOption` accepts `head_commit_id` and the porcelain subcommand exposes no way
    // to send it. That field is the atomic server-side head guard `gh --match-head-commit` provides,
    // and the merge is the most irreversible mutation in the set, so it keeps that guard. The body
    // travels on stdin via `--data @-` exactly as `issue-comment-update` does: the dry-run preview
    // publishes the argv, so an inline `--data '<json>'` would put the merge body into the preview.
    // It carries no `force_merge` (which would bypass the branch protection this adapter relies on
    // for the merge states Forgejo does not report), no `merge_when_checks_succeed` (which would
    // turn a guarded synchronous merge into a deferred one the gate never observes), and no
    // `delete_branch_after_merge`.
    case 'pr-merge': {
      const method = mergeMethod(payload);
      const subject = mergeSubject(payload, method);
      return mutationPlan(
        'tea',
        [
          'api',
          apiEndpoint(`pulls/${prNumber(input)}/merge`),
          '--method',
          'POST',
          '--include',
          ...teaTarget,
          '--data',
          '@-',
        ],
        // The mixed spelling of this body is not an inconsistency but the wire format itself.
        // Forgejo's `MergePullRequestForm` (`services/forms/repo_form.go`, branch `forgejo`) tags
        // only some of its fields: `HeadCommitID` carries `json:"head_commit_id,omitempty"`, while
        // `Do`, `MergeTitleField`, `MergeMessageField` and `MergeCommitID` carry **no** json tag at
        // all, so their wire key is the Go field name. Go's `encoding/json` — and the jsoniter
        // config Forgejo runs in standard-library-compatible mode — matches an incoming key to a
        // field name case-insensitively but performs **no** snake_case conversion, so a
        // helpfully-normalized `merge_title_field` would never bind and the subject would be
        // dropped without a word on every squash merge. That is exactly the failure pinning the
        // subject exists to prevent: a squash subject that is not a Conventional Commit drops the
        // change from the changelog silently. Verify against Forgejo before "tidying" this body —
        // upstream go-gitea/gitea has since tagged every field of the same struct, and reading the
        // Gitea source instead is the way to arrive confidently at the broken spelling.
        jsonStdin({
          Do: method,
          head_commit_id: expectedHeadSha(payload),
          ...(subject === undefined ? {} : { MergeTitleField: subject }),
        }),
      );
    }
    // These three stay refused. `tea` has no `checks` subcommand and Forgejo offers no server-side
    // blocking watch comparable to `gh pr checks --watch`, so `pr-checks-wait` would have to become
    // the poll loop the gate explicitly rejects; the documented no-watch degradation carries it
    // instead. The two review operations have no verified tea surface either.
    // `review-thread-resolve` joins them: `tea pulls resolve` exists as a client subcommand, but
    // the route behind it does not. Forgejo's `/pulls` router group declares no `resolve`,
    // `unresolve` or `replies` path at any nesting level, where Gitea `main` declares all three, and
    // a live instance confirms it — see the user guide. The former `--help` probe attested the
    // subcommand and never the route, so it reported a write capability the forge does not serve.
    case 'review-create':
    case 'review-thread-reply':
    case 'review-thread-resolve':
    case 'pr-checks-wait':
      fail('UNSUPPORTED_CAPABILITY', `installed tea adapter does not safely support ${operation}`, {
        operation,
        provider: 'forgejo',
      });
    default:
      fail('UNSUPPORTED_CAPABILITY', `unsupported Forgejo operation: ${operation}`, { operation });
  }
}

// The GitHub half of the `remote-tracker` plan builder.
//
// `buildCommandPlan` in `remote-tracker-core.mjs` dispatches here when the resolved provider is
// `github`, so this file holds one `switch (operation)` plus the helpers whose only code consumer
// is that switch: the `gh` host arguments, the pull-request status GraphQL query, and the review
// and thread-reply payload builders.
//
// It imports from `remote-tracker-shared-core.mjs` and `remote-tracker-decomposition-core.mjs`;
// the native sub-issue cases are the only plan sites that reach into the decomposition subsystem.

import {
  ISSUE_STATE_READ_TIMEOUT_MS,
  MERGE_METHOD_FLAGS,
  assertNoIssueCloseStateOverride,
  assertPublishable,
  checksWaitSettings,
  commentMarker,
  expectedHeadSha,
  fail,
  ghRepoArgs,
  issueNumber,
  jsonStdin,
  mergeMethod,
  mergeSubject,
  mutationPlan,
  payloadInteger,
  prNumber,
  publishableText,
  requireNumber,
  requireObject,
  requireString,
  stampMarker,
} from './remote-tracker-shared-core.mjs';
import {
  childIssuePayload,
  decompositionKey,
  parentIssueNumber,
} from './remote-tracker-decomposition-core.mjs';

// A thread reply is an `iterate` write, so it carries the same marker as that direction's summary
// comment. It is stamped here rather than left to the caller because the marker contract states
// that these markers are never written by hand: the merge gate's guard matches them as exact
// strings, and a caller that forgot the stamp — or reworded it — produced a reply the guard later
// read as a human's, blocking the merge on this tool's own output.
export function buildThreadReplyBody(payload) {
  const marker = commentMarker('pr');
  return stampMarker(marker, publishableText(payload.body, 'payload.body'));
}

export const REVIEW_EVENTS = Object.freeze(['COMMENT']);

export const REVIEW_SIDES = Object.freeze(['LEFT', 'RIGHT']);

export function reviewCommentSide(value, field) {
  const side =
    value === undefined || value === null
      ? 'RIGHT'
      : requireString(value, field).trim().toUpperCase();
  if (!REVIEW_SIDES.includes(side)) {
    fail('INVALID_PAYLOAD', `${field} must be LEFT or RIGHT`, {
      field,
      value,
      supported: [...REVIEW_SIDES],
    });
  }
  return side;
}

// Builds the provider-neutral payload for one pull-request review carrying inline comments.
// The event is pinned to the neutral comment event: this operation never approves a pull
// request and never requests changes, so any other event value is rejected here instead of
// being forwarded to the provider. Every input is validated before a request is planned, so
// an invalid comment fails closed with the same structured error shape as every other payload.
// The review body is mandatory and the comment array is optional: the publication contract
// requires body-only submissions — a short summary when nothing was found, and a finding on a
// line outside the diff that must not be anchored onto a wrong line — while a submission
// without body text carries nothing to publish and would be rejected by the provider anyway.
// Body and comment bodies are stamped with the `pr-review` marker from the marker table, so no
// caller has to hand-write it and repeat suppression cannot be defeated by a reworded marker.
export function buildReviewPayload(input) {
  requireObject(input, 'payload');
  const event =
    input.event === undefined || input.event === null
      ? 'COMMENT'
      : requireString(input.event, 'payload.event').trim().toUpperCase();
  if (!REVIEW_EVENTS.includes(event)) {
    fail('INVALID_PAYLOAD', 'payload.event must be COMMENT', {
      field: 'payload.event',
      value: input.event,
      supported: [...REVIEW_EVENTS],
    });
  }
  const marker = commentMarker('pr-review');
  const body = stampMarker(marker, publishableText(input.body, 'payload.body'));
  const comments = input.comments ?? [];
  if (!Array.isArray(comments)) {
    fail('INVALID_PAYLOAD', 'payload.comments must be an array', {
      field: 'payload.comments',
    });
  }
  return {
    body,
    event,
    comments: comments.map((comment, index) => {
      const field = `payload.comments[${index}]`;
      requireObject(comment, field);
      return {
        path: requireString(comment.path, `${field}.path`),
        line: payloadInteger(comment.line, `${field}.line`),
        side: reviewCommentSide(comment.side, `${field}.side`),
        body: stampMarker(marker, publishableText(comment.body, `${field}.body`)),
      };
    }),
  };
}

export function ghHostArgs(repository) {
  return repository.host === 'github.com' ? [] : ['--hostname', repository.host];
}

// The selections of the two JSON reads of the gate. Both are pinned rather than requested
// wholesale: an unknown field is rejected outright, so naming every field fails loudly on an
// incompatible provider instead of silently returning a differently shaped payload.
//
// The status read has to be GraphQL rather than `gh pr view --json`, because requiredness is the one
// fact the porcelain projection cannot express at all: none of its fields states whether branch
// protection marks a check as required, so `mergeGate.requireAllChecks: false` — documented as "the
// forge's own required-checks definition decides" — had no definition to consult, and the check list
// correctly reported no `required` flag rather than guessing one. GraphQL states it per context as
// `isRequired(pullRequestNumber:)`, on both members of the rollup union, and a single query returns
// it together with everything the old projection returned. That is what makes the switch worth it:
// head SHA, base ref, state, draft flag, check list, requiredness, and the forge's own merge state
// stay read at one instant instead of being correlated across two requests, which is the property
// that makes them usable as a merge precondition at all.
//
// `commits(last:1)` is requested for exactly one value: the head commit's own timestamp, which the
// gate compares against an automatic reviewer's latest comment. It rides on this read rather than on
// a second request, so the two values it correlates describe the same instant. `contexts` reports
// its `totalCount` alongside its nodes so a truncated page can be detected — see
// `flattenPullRequestStatus`, which is where that count is acted on.
export const PR_STATUS_QUERY = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){number title url state isDraft mergeable mergeStateStatus baseRefName headRefOid commits(last:1){nodes{commit{oid committedDate statusCheckRollup{contexts(first:100){totalCount nodes{__typename ... on CheckRun{name status conclusion detailsUrl isRequired(pullRequestNumber:$number)} ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$number)}}}}}}}}}}`;

export function buildGithubCommandPlan(operation, input, repository) {
  const { owner, repository: repo } = repository;
  // Both provider CLIs address the same REST path shape, so this builder and the one in
  // `remote-tracker-forgejo-core.mjs` shape their endpoint identically.
  const ghEndpoint = (suffix) => `repos/${owner}/${repo}/${suffix}`;
  const payload = input.payload ?? input;
  const hostArgs = ghHostArgs(repository);
  switch (operation) {
    // The account the current authentication belongs to. `gh auth status` prints the same login
    // inside human-readable prose, but this adapter reads provider JSON and nothing else, so the
    // identity is asked for as data. It rides on the repository only for its host: the credential
    // is selected per host, so the identity has to be read against the same one.
    case 'viewer-read':
      return mutationPlan('gh', ['api', ...hostArgs, 'user']);
    // `label-list` is an internal plan, deliberately absent from `REMOTE_OPERATIONS`,
    // `MUTATIONS`, and `CAPABILITY_BY_OPERATION` in `remote-tracker-core.mjs`. It exists because
    // the `label-create` pre-check and `executeTeaPaginatedList` there both build every plan
    // through `buildCommandPlan`, and a name they can construct is the cheapest way to give them
    // one. Leaving it unregistered is what keeps it internal: `executeOperation` consults
    // `REMOTE_OPERATIONS` and refuses the name from outside, so the read stays owned by the one
    // branch whose contract defines it.
    // The explicit `per_page=100` matches this adapter's other `gh api` list reads; without it
    // the endpoint pages at 30 and
    // a target name on page 2 would be read as absent.
    case 'label-list':
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        `${ghEndpoint('labels')}?${new URLSearchParams({ per_page: '100' })}`,
      ]);
    case 'label-create':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '-X', 'POST', ghEndpoint('labels'), '--input', '-'],
        jsonStdin({
          name: requireString(payload.name, 'name'),
          color: payload.color ?? 'ededed',
          description: payload.description ?? '',
        }),
        { tolerateAlreadyExists: true },
      );
    case 'issue-read':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '--include', ghEndpoint(`issues/${issueNumber(input)}`)],
        undefined,
        { includesHeaders: true },
      );
    case 'issue-state-wait':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '--include', ghEndpoint(`issues/${issueNumber(input)}`)],
        undefined,
        { includesHeaders: true, timeoutMs: ISSUE_STATE_READ_TIMEOUT_MS },
      );
    case 'issue-comments-read':
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        ghEndpoint(`issues/${issueNumber(input)}/comments`),
      ]);
    case 'issue-sub-issues-read':
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        `${ghEndpoint(`issues/${parentIssueNumber(input, repository)}/sub_issues`)}?${new URLSearchParams({ per_page: '100' })}`,
      ]);
    case 'issue-list': {
      const query = new URLSearchParams({ state: input.state ?? 'all', per_page: '100' });
      if (input.labels?.length) query.set('labels', input.labels.join(','));
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        `${ghEndpoint('issues')}?${query}`,
      ]);
    }
    case 'issue-create':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '-X', 'POST', ghEndpoint('issues'), '--input', '-'],
        jsonStdin({
          title: assertPublishable(payload.title, 'payload.title'),
          body: assertPublishable(payload.body, 'payload.body'),
          labels: payload.labels ?? [],
        }),
      );
    case 'issue-sub-issue-create': {
      const child = childIssuePayload(input, repository);
      const args = [
        'issue',
        'create',
        ...ghRepoArgs(repository),
        '--title',
        child.title,
        '--body',
        child.body,
        '--parent',
        String(child.parent),
      ];
      for (const label of child.labels) args.push('--label', label);
      return mutationPlan('gh', args, undefined, {
        expectsJson: false,
        parent: child.parent,
        decompositionKey: child.decompositionKey,
        childPayload: child,
      });
    }
    case 'issue-update-body':
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'PATCH',
          ghEndpoint(`issues/${issueNumber(input)}`),
          '--input',
          '-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    // A close is a state change of the issue itself, so it is a `PATCH` of the issue resource
    // exactly as `issue-update-body` is — not a `POST` to a sub-resource the way
    // `issue-label-add` is. Both body values are literals rather than payload fields: the only
    // transition this adapter offers is the one that records a completed issue, and `completed`
    // is the only state reason that statement has.
    case 'issue-close':
      assertNoIssueCloseStateOverride(input);
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'PATCH',
          ghEndpoint(`issues/${issueNumber(input)}`),
          '--input',
          '-',
        ],
        jsonStdin({ state: 'closed', state_reason: 'completed' }),
      );
    case 'issue-comment':
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'POST',
          ghEndpoint(`issues/${issueNumber(input)}/comments`),
          '--input',
          '-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    case 'issue-comment-update': {
      issueNumber(input);
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'PATCH',
          ghEndpoint(`issues/comments/${requireNumber(input.commentId, 'commentId')}`),
          '--input',
          '-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    }
    case 'issue-labels':
    case 'issue-label-add': {
      const labels = payload.labels ?? (payload.label ? [payload.label] : []);
      if (labels.length === 0) fail('INVALID_PAYLOAD', 'payload.labels must not be empty');
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'POST',
          ghEndpoint(`issues/${issueNumber(input)}/labels`),
          '--input',
          '-',
        ],
        jsonStdin({ labels }),
      );
    }
    case 'issue-label-remove': {
      const label = encodeURIComponent(requireString(payload.label, 'payload.label'));
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '-X',
        'DELETE',
        ghEndpoint(`issues/${issueNumber(input)}/labels/${label}`),
      ]);
    }
    case 'pr-read':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '--include', ghEndpoint(`pulls/${prNumber(input)}`)],
        undefined,
        { includesHeaders: true },
      );
    case 'pr-comments-read':
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        ghEndpoint(`issues/${prNumber(input)}/comments`),
      ]);
    // `--paginate --slurp` **plus** an explicit `per_page=100`, which is the pairing `label-list`,
    // `issue-list` and `pr-list` use and which `pr-comments-read` omits. `--paginate` follows the
    // `Link` header whatever the page size, so the flag alone is not wrong — it is merely thirty
    // items per request on an endpoint that serves a hundred, and a reviewer that submits a review
    // per push turns that into a request per three reviews. The gate reads this list on every
    // Phase-1 and Phase-4 evaluation, so the page size is the difference between one request and
    // several on an ordinary pull request.
    case 'pr-reviews-read': {
      const query = new URLSearchParams({ per_page: '100' });
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        `${ghEndpoint(`pulls/${prNumber(input)}/reviews`)}?${query}`,
      ]);
    }
    case 'pr-list': {
      const query = new URLSearchParams({ state: input.state ?? 'open', per_page: '100' });
      if (input.head) query.set('head', input.head);
      return mutationPlan('gh', [
        'api',
        ...hostArgs,
        '--paginate',
        '--slurp',
        `${ghEndpoint('pulls')}?${query}`,
      ]);
    }
    // One read, not two: head SHA, base ref, state, draft flag, check list, per-check requiredness,
    // and the forge's own merge state have to describe the same instant to be usable as a merge
    // precondition. `PR_STATUS_QUERY` explains why that one read is a GraphQL query.
    case 'pr-status-read':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, 'graphql', '--input', '-'],
        jsonStdin({
          query: PR_STATUS_QUERY,
          variables: { owner, repo, number: prNumber(input) },
        }),
      );
    // The watch and nothing else: `gh pr checks` refuses `--watch` together with `--json` outright,
    // so a plan carrying both is not a slow read but a guaranteed failure on every invocation.
    // `executeOperation` in `remote-tracker-core.mjs` runs `buildChecksReadPlan` after this one
    // for the payload.
    // The watch never carries `--required` either, no matter how the caller set that criterion.
    // `--required` filters the rollup by a per-context flag that only a context which has already
    // reported can carry, so on a branch where no required check has reported yet the filtered
    // watch finds nothing to watch and returns immediately — the wait stops waiting, which is the
    // one thing it exists for. Waiting on every check is a superset of waiting on the required
    // ones and stays bounded by the caller's `timeoutMs`, so the criterion loses nothing by
    // riding on the structured read alone.
    case 'pr-checks-wait': {
      const wait = checksWaitSettings(payload);
      return mutationPlan(
        'gh',
        [
          'pr',
          'checks',
          String(prNumber(input)),
          ...ghRepoArgs(repository),
          '--watch',
          '--interval',
          String(wait.intervalSeconds),
        ],
        undefined,
        { timeoutMs: wait.timeoutMs },
      );
    }
    case 'pr-create':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '-X', 'POST', ghEndpoint('pulls'), '--input', '-'],
        jsonStdin({
          title: assertPublishable(payload.title, 'payload.title'),
          body: assertPublishable(payload.body, 'payload.body'),
          head: requireString(payload.head, 'payload.head'),
          base: requireString(payload.base, 'payload.base'),
          draft: payload.draft === true,
        }),
      );
    case 'pr-update-body':
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, '-X', 'PATCH', ghEndpoint(`pulls/${prNumber(input)}`), '--input', '-'],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    case 'pr-comment':
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'POST',
          ghEndpoint(`issues/${prNumber(input)}/comments`),
          '--input',
          '-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    // The merge carries the head the caller verified. `--match-head-commit` makes the provider
    // itself reject a moved head, so the guard survives even if the local precondition read and
    // the merge are separated by a push; `gh pr merge` prints prose, not JSON.
    case 'pr-merge': {
      const method = mergeMethod(payload);
      const subject = mergeSubject(payload, method);
      return mutationPlan(
        'gh',
        [
          'pr',
          'merge',
          String(prNumber(input)),
          ...ghRepoArgs(repository),
          MERGE_METHOD_FLAGS[method],
          ...(subject === undefined ? [] : ['--subject', subject]),
          '--match-head-commit',
          expectedHeadSha(payload),
        ],
        undefined,
        { expectsJson: false },
      );
    }
    case 'review-create':
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'POST',
          ghEndpoint(`pulls/${prNumber(input)}/reviews`),
          '--input',
          '-',
        ],
        jsonStdin(buildReviewPayload(payload)),
      );
    case 'review-threads-read': {
      const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved path line startLine diffSide comments(first:100){nodes{id databaseId url body path line originalLine startLine originalStartLine createdAt author{__typename login}}}}}}}}`;
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, 'graphql', '--input', '-'],
        jsonStdin({ query, variables: { owner, repo, number: prNumber(input) } }),
      );
    }
    case 'review-thread-reply':
      return mutationPlan(
        'gh',
        [
          'api',
          ...hostArgs,
          '-X',
          'POST',
          ghEndpoint(
            `pulls/${prNumber(input)}/comments/${requireNumber(input.commentId, 'commentId')}/replies`,
          ),
          '--input',
          '-',
        ],
        jsonStdin({ body: buildThreadReplyBody(payload) }),
      );
    case 'review-thread-resolve': {
      const query = `mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}}`;
      return mutationPlan(
        'gh',
        ['api', ...hostArgs, 'graphql', '--input', '-'],
        jsonStdin({ query, variables: { threadId: requireString(input.threadId, 'threadId') } }),
      );
    }
    default:
      fail('UNSUPPORTED_CAPABILITY', `unsupported GitHub operation: ${operation}`, { operation });
  }
}

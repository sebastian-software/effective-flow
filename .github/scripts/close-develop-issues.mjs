const NON_FATAL_STATUSES = new Set([403, 404, 410]);

function errorStatus(error) {
  return error?.status ?? error?.response?.status;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function issueFailure(issueNumber, operation, error) {
  return new Error(`Issue #${issueNumber}: ${operation} failed: ${errorMessage(error)}`, {
    cause: error,
  });
}

function annotations(core) {
  return {
    notice: core?.notice?.bind(core) ?? console.log,
    warning: core?.warning?.bind(core) ?? console.warn,
    error: core?.error?.bind(core) ?? console.error,
  };
}

/**
 * Extract same-repository issue numbers preceded by a supported GitHub closing keyword.
 *
 * @param {string | null | undefined} body Pull-request description.
 * @returns {number[]} Unique issue numbers in first-seen order.
 */
export function parseClosingIssueNumbers(body) {
  if (typeof body !== 'string' || body.trim() === '') return [];

  const issueNumbers = [];
  const seen = new Set();
  const closingReference =
    /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\b\s*:?\s*#([1-9]\d*)(?![\w]|\.\d)/gi;

  for (const match of body.matchAll(closingReference)) {
    const issueNumber = Number(match[1]);
    if (!Number.isSafeInteger(issueNumber) || seen.has(issueNumber)) continue;
    seen.add(issueNumber);
    issueNumbers.push(issueNumber);
  }
  return issueNumbers;
}

/**
 * Close open issues referenced by a pull-request description.
 *
 * Expected skips are reported without failing. Unexpected failures are accumulated so every
 * unique reference is attempted before the caller receives an AggregateError.
 *
 * @param {object} options
 * @param {object} options.octokit GitHub Actions Octokit client.
 * @param {string} options.owner Repository owner.
 * @param {string} options.repo Repository name.
 * @param {string | null | undefined} options.body Pull-request description.
 * @param {object} options.core GitHub Actions annotation helper.
 * @returns {Promise<{referenced: number, closed: number, skipped: number}>}
 */
export async function closeReferencedIssues({ octokit, owner, repo, body, core }) {
  const log = annotations(core);
  const issueNumbers = parseClosingIssueNumbers(body);
  const failures = [];
  let closed = 0;
  let skipped = 0;

  if (issueNumbers.length === 0) {
    log.notice('No same-repository closing references found in the pull-request description.');
  }

  for (const issueNumber of issueNumbers) {
    let issue;
    try {
      ({ data: issue } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      }));
    } catch (error) {
      if (NON_FATAL_STATUSES.has(errorStatus(error))) {
        log.warning(
          `Skipping issue #${issueNumber}: it is missing, inaccessible, or no longer available (${errorStatus(error)}).`,
        );
        skipped += 1;
        continue;
      }
      const failure = issueFailure(issueNumber, 'read', error);
      failures.push(failure);
      log.error(failure);
      continue;
    }

    if (issue?.pull_request) {
      log.notice(
        `Skipping #${issueNumber}: the reference identifies a pull request, not an issue.`,
      );
      skipped += 1;
      continue;
    }
    if (issue?.state !== 'open') {
      log.notice(`Skipping issue #${issueNumber}: it is already closed.`);
      skipped += 1;
      continue;
    }

    try {
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: 'completed',
      });
      closed += 1;
      log.notice(`Closed issue #${issueNumber} as completed.`);
    } catch (error) {
      if (NON_FATAL_STATUSES.has(errorStatus(error))) {
        log.warning(
          `Skipping issue #${issueNumber}: it became inaccessible or unavailable while closing (${errorStatus(error)}).`,
        );
        skipped += 1;
        continue;
      }
      const failure = issueFailure(issueNumber, 'close', error);
      failures.push(failure);
      log.error(failure);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} referenced issue operation${failures.length === 1 ? '' : 's'} failed after all references were processed.`,
    );
  }

  return { referenced: issueNumbers.length, closed, skipped };
}

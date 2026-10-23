#!/usr/bin/env node
// Read-only admission CLI. Repository variables, controlled by maintainers outside the candidate,
// pin a detached Git blob only after the final source, original hosted proof and review exist.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ghRead } from '../../scripts/protected-validation-backend.mjs';
import { verifyFreshness } from '../_scaffold/round-core.mjs';
import suite from './suite.config.mjs';
import mergeGate from '../merge-gate/suite.config.mjs';
import iterate from '../iterate/suite.config.mjs';
import nextSteps from '../next-steps/suite.config.mjs';
import {
  PROVISIONAL_SCHEMA,
  ABSENT_POPULATIONS,
  AUTHORIZATION_BLOB_VARIABLE,
  AUTHORIZATION_DIGEST_VARIABLE,
  candidateBinding,
  readAuthorization,
  validateAbsentArchive,
  validateAbsentVerdict,
  verifyCandidate,
  verifyHostedCandidate,
  verifyLiveRelease,
} from './_scaffold/provisional-release.mjs';
const root = resolve(import.meta.dirname, '../..');
// Build subprocesses do not need the backend credential used by the read-only API client.
function credentialFreeFreshness(selectedSuite) {
  const credentials = ['GH_TOKEN', 'GITHUB_TOKEN'].map((key) => [key, process.env[key]]);
  try {
    for (const [key] of credentials) delete process.env[key];
    return verifyFreshness(selectedSuite);
  } finally {
    for (const [key, value] of credentials) if (value !== undefined) process.env[key] = value;
  }
}
try {
  if (process.argv.length !== 3 || !['inspect', 'verify'].includes(process.argv[2]))
    throw new Error('usage: node evals/build-context/provisional-release.mjs inspect|verify');
  const actual = candidateBinding(root, suite);
  if (process.argv[2] === 'inspect') {
    process.stdout.write(
      JSON.stringify(
        {
          schema: PROVISIONAL_SCHEMA,
          ...actual,
          absentPopulations: ABSENT_POPULATIONS,
          authorizationCreated: false,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    const full = credentialFreeFreshness(suite);
    // This output is deliberately retained even when admission later refuses.
    process.stdout.write(JSON.stringify({ check: 'build-context FULL strict', ...full }) + '\n');
    validateAbsentVerdict(full, suite.scenarios);
    validateAbsentArchive(resolve(suite.root, 'results'));
    const value = readAuthorization({
      read: ghRead,
      repository: process.env.GITHUB_REPOSITORY,
      blob: process.env[AUTHORIZATION_BLOB_VARIABLE],
      digest: process.env[AUTHORIZATION_DIGEST_VARIABLE],
    });
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    verifyCandidate(value, actual, {
      root,
      context: {
        event: process.env.GITHUB_EVENT_NAME,
        repository: process.env.GITHUB_REPOSITORY,
        pullRequest: event.number,
        headRef: event.pull_request?.head?.ref,
      },
    });
    for (const other of [mergeGate, iterate, nextSteps]) {
      const verdict = credentialFreeFreshness(other);
      process.stdout.write(JSON.stringify({ check: other.name + ' strict', ...verdict }) + '\n');
      if (verdict.failsStrict) throw new Error(other.name + ' strict acceptance failed');
    }
    verifyLiveRelease(value, { read: ghRead });
    const host = verifyHostedCandidate(value, { root, read: ghRead });
    process.stdout.write(
      JSON.stringify({
        check: 'build-context provisional PR581 release disposition',
        state: 'PROVISIONALLY_ADMITTED',
        fullAcceptance: 'UNPROVEN',
        releasePullRequest: value.releasePullRequest,
        releaseVersion: value.releaseVersion,
        sourceCommit: value.sourceCommit,
        sourceTree: value.sourceTree,
        instrumentDigest: value.instrumentDigest,
        absentPopulations: value.absentPopulations,
        host,
        claims: 'No performance, cost, context reduction or quality equivalence established.',
      }) + '\n',
    );
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      check: 'build-context provisional PR581 release disposition',
      state: 'REFUSED',
      fullAcceptance: 'UNPROVEN',
      diagnostic: error.message,
    }) + '\n',
  );
  process.exitCode = 1;
}

// The reading side of the autopilot pull-request appendix: block extraction, the raw digest, the
// blocker count, the trust decision and the neutralization.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  APPENDIX_BEGIN,
  APPENDIX_BLOCKER_HEADINGS,
  APPENDIX_END,
  MAX_APPENDIX_BYTES,
  appendixDigest,
  assessAppendixTrust,
  countAppendixBlockers,
  extractAppendixBlocks,
  neutralizeAppendix,
} from '../src/scripts/autopilot-appendix-core.mjs';

const block = (...lines) => [APPENDIX_BEGIN, ...lines, APPENDIX_END].join('\n');

test('the appendix markers and blocker headings are the rendered strings', () => {
  assert.equal(APPENDIX_BEGIN, '<!-- effective-flow-autopilot-appendix:begin v1 -->');
  assert.equal(APPENDIX_END, '<!-- effective-flow-autopilot-appendix:end -->');
  assert.deepEqual({ ...APPENDIX_BLOCKER_HEADINGS }, { en: '### Blockers', de: '### Blocker' });
  assert.equal(MAX_APPENDIX_BYTES, 64 * 1024);
});

test('extractAppendixBlocks cuts every block out of the body byte for byte', () => {
  assert.deepEqual(extractAppendixBlocks(undefined), []);
  assert.deepEqual(extractAppendixBlocks('no appendix'), []);
  const first = block('one');
  const second = block('two');
  assert.deepEqual(extractAppendixBlocks(`intro\n\n${first}\n\nmiddle\n${second}\ntail`), [
    first,
    second,
  ]);
  // Indentation around a marker line is tolerated and kept in the raw block; CRLF stays as written.
  const crlf = `x\r\n  ${APPENDIX_BEGIN}\t\r\nline\r\n${APPENDIX_END}\r\ny`;
  assert.deepEqual(extractAppendixBlocks(crlf), [
    `  ${APPENDIX_BEGIN}\t\r\nline\r\n${APPENDIX_END}`,
  ]);
});

test('extractAppendixBlocks keeps an unterminated block and ignores a stray end line', () => {
  const open = `${APPENDIX_BEGIN}\n### Blockers\n- cut off`;
  assert.deepEqual(extractAppendixBlocks(`head\n${open}`), [open]);
  assert.deepEqual(extractAppendixBlocks(`${APPENDIX_END}\ntext`), []);
  // A begin line inside an open block belongs to it; the block still ends at the first end line.
  const nested = `${APPENDIX_BEGIN}\na\n${APPENDIX_BEGIN}\nb\n${APPENDIX_END}`;
  assert.deepEqual(extractAppendixBlocks(`${nested}\nafter`), [nested]);
  // A marker inside a line of other text is no marker.
  assert.deepEqual(extractAppendixBlocks(`see ${APPENDIX_BEGIN} here`), []);
});

test('appendixDigest is the SHA-256 of the raw blocks joined by a newline', () => {
  assert.equal(appendixDigest([]), null);
  assert.equal(appendixDigest(undefined), null);
  const one = block('one');
  assert.equal(appendixDigest([one]), createHash('sha256').update(one, 'utf8').digest('hex'));
  const two = block('two');
  assert.equal(
    appendixDigest([one, two]),
    createHash('sha256').update(`${one}\n${two}`, 'utf8').digest('hex'),
  );
  assert.notEqual(appendixDigest([one]), appendixDigest([block('one ')]));
});

test("countAppendixBlockers counts bullet lines under either language's heading only", () => {
  assert.equal(countAppendixBlockers(undefined), 0);
  assert.equal(countAppendixBlockers([]), 0);
  assert.equal(countAppendixBlockers([block('### Blockers', '', '- a', '* b', '+ c')]), 3);
  assert.equal(countAppendixBlockers([block('### Blocker', '- a')]), 1);
  assert.equal(countAppendixBlockers([block('  ### Blockers  ', '- a')]), 1);
  // Bullets elsewhere do not count, and the section ends at the next heading.
  assert.equal(
    countAppendixBlockers([
      block('### Decisions', '- d', '### Blockers', '- a', '### Next', '- n'),
    ]),
    1,
  );
  // Prose in the section is no blocker; a nested bullet is a line of its own.
  assert.equal(
    countAppendixBlockers([block('### Blockers', 'Nothing blocks.', '- a', '  - nested')]),
    2,
  );
  assert.equal(countAppendixBlockers([block('### Blockers', 'None.')]), 0);
  // The section ends at the block's end, and every block counts.
  assert.equal(
    countAppendixBlockers([block('### Blockers', '- a'), block('### Blocker', '- b', '- c')]),
    3,
  );
  // An unterminated block still counts.
  assert.equal(countAppendixBlockers([`${APPENDIX_BEGIN}\n### Blockers\n- a\n- b`]), 2);
});

test('assessAppendixTrust verifies only a same-repository author with write access', () => {
  for (const permission of ['write', 'admin', 'maintain', 'owner', 'Write']) {
    assert.deepEqual(assessAppendixTrust({ sameRepository: true, permission }), {
      trust: 'verified',
      reason: null,
    });
  }
  assert.deepEqual(assessAppendixTrust({ sameRepository: false, permission: 'admin' }), {
    trust: 'unverifiable',
    reason: 'fork',
  });
  // A read that does not state the head repository is no fork verdict, and no trust either.
  for (const sameRepository of [undefined, null, 'true', 1]) {
    assert.deepEqual(assessAppendixTrust({ sameRepository, permission: 'admin' }), {
      trust: 'unverifiable',
      reason: 'repository-unstated',
    });
  }
  for (const permission of [null, undefined, '']) {
    assert.deepEqual(assessAppendixTrust({ sameRepository: true, permission }), {
      trust: 'unverifiable',
      reason: 'permission-unreadable',
    });
  }
  for (const permission of ['read', 'triage', 'none', 'writer']) {
    assert.deepEqual(assessAppendixTrust({ sameRepository: true, permission }), {
      trust: 'unverifiable',
      reason: 'permission-insufficient',
    });
  }
  assert.deepEqual(assessAppendixTrust(), {
    trust: 'unverifiable',
    reason: 'repository-unstated',
  });
});

test('the write permission levels are a frozen list behind one predicate', async () => {
  const { COLLABORATOR_WRITE_PERMISSIONS, isWritePermission } =
    await import('../src/scripts/remote-tracker-shared-core.mjs');
  assert.ok(Object.isFrozen(COLLABORATOR_WRITE_PERMISSIONS));
  assert.throws(() => COLLABORATOR_WRITE_PERMISSIONS.push('read'), TypeError);
  for (const level of ['write', 'admin', 'owner', 'maintain']) {
    assert.equal(isWritePermission(level), true, level);
  }
  for (const level of ['read', 'triage', 'none', 'Write', '', null, undefined, ['write']]) {
    assert.equal(isWritePermission(level), false, String(level));
  }
});

test('neutralizeAppendix drops the markers, escapes comments, controls and bidirectional characters', () => {
  assert.equal(neutralizeAppendix([]), null);
  assert.equal(neutralizeAppendix(undefined), null);
  assert.deepEqual(neutralizeAppendix([block('### Decisions', '', '- one')]), {
    text: '### Decisions\n\n- one',
    truncated: false,
  });
  assert.deepEqual(neutralizeAppendix([block('a'), block('b')]).text, 'a\n\nb');
  assert.equal(neutralizeAppendix([block('x\r\ny\rz')]).text, 'x\ny\nz');
  const hostile = neutralizeAppendix([
    block(
      '<!-- hidden -->',
      'tab\tkept',
      'bell\u0007',
      'esc\u001b',
      'rlo‮',
      'iso⁦',
      'zw​',
      'bom﻿',
      'del\u007f',
      'lsep\u2028end',
      'psep\u2029end',
      'alm\u061c',
      'shy\u00ad',
      'mvs\u180e',
      'anchor\ufff9\ufffa\ufffb',
      'lrm\u200e',
      'tag\u{e0001}\u{e0041}\u{e007f}',
      'unassigned\u2065',
    ),
  ]).text;
  // No control, format or line/paragraph separator character survives, tab and line feed aside.
  assert.ok(!/(?![\t\n])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u{e0000}-\u{e007f}]/u.test(hostile));
  assert.ok(!hostile.includes('<!--'));
  assert.ok(hostile.includes('&lt;!-- hidden -->'));
  assert.ok(hostile.includes('tab\tkept'));
  for (const escaped of [
    '\\u0007',
    '\\u001b',
    '\\u202e',
    '\\u2066',
    '\\u200b',
    '\\ufeff',
    '\\u007f',
    'lsep\\u2028end',
    'psep\\u2029end',
    '\\u061c',
    '\\u00ad',
    '\\u180e',
    '\\ufff9\\ufffa\\ufffb',
    '\\u200e',
    '\\u{e0001}\\u{e0041}\\u{e007f}',
    '\\u2065',
  ]) {
    assert.ok(hostile.includes(escaped), escaped);
  }
  // A marker line inside the block, whatever its position, never reaches the text.
  assert.ok(!neutralizeAppendix([block('a', APPENDIX_BEGIN, 'b')]).text.includes('appendix'));
});

test('neutralizeAppendix bounds the text to the byte limit on a code point and says so', () => {
  const big = neutralizeAppendix([block('x'.repeat(MAX_APPENDIX_BYTES * 2))]);
  assert.equal(big.truncated, true);
  assert.ok(Buffer.byteLength(big.text, 'utf8') <= MAX_APPENDIX_BYTES);
  assert.ok(big.text.endsWith('\n[truncated]'));
  // The cut never splits a multi-byte character.
  const wide = neutralizeAppendix([block('€'.repeat(100))], { maxBytes: 50 });
  assert.equal(wide.truncated, true);
  assert.ok(Buffer.byteLength(wide.text, 'utf8') <= 50);
  assert.ok(!wide.text.includes('�'));
  assert.match(wide.text, /^€+\n\[truncated\]$/);
  const exact = neutralizeAppendix([block('x'.repeat(10))], { maxBytes: 10 });
  assert.equal(exact.truncated, false);
});

// Invariant: the base-move section sits outside the blocker section, so its lines (even bullets
// or a path list) never change the blocker count that gates the appendix.
test('countAppendixBlockers ignores the base-move section in either language', () => {
  const move = (heading) => [
    heading,
    '',
    '- not a blocker',
    'The base moved from `aaaaaaa` to `bbbbbbb` during planning.',
    '',
  ];
  assert.equal(
    countAppendixBlockers([block(...move('### Base move'), '### Blockers', '', '- a', '- b')]),
    2,
  );
  assert.equal(
    countAppendixBlockers([block(...move('### Basis-Verschiebung'), '### Blocker', '- a')]),
    1,
  );
  assert.equal(countAppendixBlockers([block(...move('### Base move'))]), 0);
});

// Invariant (issue #734 follow-up): a flagged, unresolved base move is the PR's flag, not a
// blocker: an appendix whose only section after the decisions is that move counts no blocker in
// either language, so the draft PR is not gated by it.
test('countAppendixBlockers counts no blocker for an appendix with only a flagged base move', () => {
  const flagged = {
    '### Base move': [
      'The base moved from `aaaaaaa` to `bbbbbbb` during planning: 1 commit, 1 changed path. The plan was published on the new base.',
      'The move is unresolved (`cited-path`): reconciling the plan with the new base is left to review.',
      'Overlapping paths: `src/a.mjs`',
    ],
    '### Basis-Verschiebung': [
      'Die Basis hat sich während der Planung von `aaaaaaa` auf `bbbbbbb` verschoben: 1 Commit, 1 geänderter Pfad. Der Plan wurde auf der neuen Basis veröffentlicht.',
      'Die Verschiebung ist ungelöst (`cited-path`): den Plan mit der neuen Basis abzugleichen bleibt dem Review überlassen.',
      'Überschneidende Pfade: `src/a.mjs`',
    ],
  };
  for (const [heading, lines] of Object.entries(flagged)) {
    assert.equal(countAppendixBlockers([block(heading, '', ...lines, '')]), 0, heading);
  }
});

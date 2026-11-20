// The autopilot pull-request appendix as data both of its sides share: the marker pair and the
// blocker headings `autopilot-core.mjs` renders, and the reading side a reader of a pull-request
// body needs (the remote tracker's `pr-draft-classify`): find every appendix block, digest it raw,
// count its blockers, decide whether its text may be shown, and neutralize it for display.
//
// The body is attacker-influenceable text (`docs/adr/input-trust-boundary.md`). Nothing here
// interprets it beyond the line rules below, and nothing returns any of it except the neutralized
// appendix text. The module imports no tracker or autopilot module, so both can import it without a
// cycle.

import { createHash } from 'node:crypto';
import { isWritePermission } from './remote-tracker-shared-core.mjs';

// The appendix markers. `pr`'s body check strips every `<!-- effective-flow-` comment from a drafted
// body, so only this appended block can carry them.
export const APPENDIX_BEGIN = '<!-- effective-flow-autopilot-appendix:begin v1 -->';
export const APPENDIX_END = '<!-- effective-flow-autopilot-appendix:end -->';
// The blocker section heading the appendix renders, per language.
export const APPENDIX_BLOCKER_HEADINGS = Object.freeze({ en: '### Blockers', de: '### Blocker' });
// The rendered appendix and, on the reading side, the neutralized text are bounded to this size.
export const MAX_APPENDIX_BYTES = 64 * 1024;
export const APPENDIX_TRUST_LEVELS = Object.freeze(['verified', 'unverifiable']);

const LINE = /\r\n|\n|\r/;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const BULLET = /^[ \t]*[-*+][ \t]+\S/;
const BLOCKER_HEADINGS = new Set(Object.values(APPENDIX_BLOCKER_HEADINGS));
const TRUNCATION_NOTE = '[truncated]';

function trimLine(line) {
  return line.replace(/^[ \t]+|[ \t]+$/g, '');
}

// The body's lines with the exact text of each, its separator kept apart, so a block is cut out of
// the body byte for byte.
function bodyLines(body) {
  const parts = body.split(/(\r\n|\n|\r)/);
  const lines = [];
  for (let index = 0; index < parts.length; index += 2) {
    lines.push({ text: parts[index], separator: parts[index + 1] ?? '' });
  }
  return lines;
}

// Every appendix block of a body, each the raw text from its begin line through its end line,
// without the end line's separator. A block opens on a line that, trimmed of spaces and tabs, is
// APPENDIX_BEGIN, and closes on the next line that is APPENDIX_END. A begin line inside an open block
// is part of that block. A begin line without an end line opens a block that runs to the end of the
// body, so a truncated or tampered block still counts its blockers; an end line outside a block is
// ignored. A body that is not a string has none.
export function extractAppendixBlocks(body) {
  if (typeof body !== 'string') return [];
  const blocks = [];
  let open = null;
  for (const line of bodyLines(body)) {
    const marker = trimLine(line.text);
    if (open === null) {
      if (marker === APPENDIX_BEGIN) open = [line];
      continue;
    }
    open.push(line);
    if (marker === APPENDIX_END) {
      blocks.push(joinBlock(open));
      open = null;
    }
  }
  if (open !== null) blocks.push(joinBlock(open));
  return blocks;
}

function joinBlock(lines) {
  return lines
    .map((line, index) => line.text + (index === lines.length - 1 ? '' : line.separator))
    .join('');
}

// The SHA-256 (hex) of the raw appendix text, before neutralization and size bounding: the blocks
// joined with `\n`, so a single block digests as itself. Null when there is none.
export function appendixDigest(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return createHash('sha256').update(blocks.join('\n'), 'utf8').digest('hex');
}

// The number of bullet lines under a blocker heading (`### Blockers` or `### Blocker`, the heading
// trimmed of spaces and tabs) in every block. A section ends at the next Markdown heading or the end
// of its block; a nested bullet counts as a line of its own, so a doubtful count only ever errs
// upwards, the direction that suppresses an offer.
export function countAppendixBlockers(blocks) {
  if (!Array.isArray(blocks)) return 0;
  let count = 0;
  for (const block of blocks) {
    let inSection = false;
    for (const line of block.split(LINE)) {
      const trimmed = trimLine(line);
      if (BLOCKER_HEADINGS.has(trimmed)) {
        inSection = true;
        continue;
      }
      if (HEADING.test(trimmed) || trimmed === APPENDIX_END) {
        inSection = false;
        continue;
      }
      if (inSection && BULLET.test(line)) count += 1;
    }
  }
  return count;
}

// Whether an appendix's text may be shown: `verified` only when the pull request's head lives in the
// base repository (`sameRepository === true`) and its author's collaborator permission is one of the
// write levels; anything else, an unread permission included (`permission` null or absent), is
// `unverifiable`. Returns `{ trust, reason }`, `reason` naming the first failed condition or null:
// `fork` when the read states a head in another repository or none at all, such as a deleted fork
// (`sameRepository === false`), `repository-unstated` when it does not state the head repository
// usably (the field absent, or any other value), then `permission-unreadable` and
// `permission-insufficient`.
export function assessAppendixTrust({ sameRepository, permission } = {}) {
  if (sameRepository === false) return { trust: 'unverifiable', reason: 'fork' };
  if (sameRepository !== true) return { trust: 'unverifiable', reason: 'repository-unstated' };
  if (typeof permission !== 'string' || permission === '') {
    return { trust: 'unverifiable', reason: 'permission-unreadable' };
  }
  if (!isWritePermission(permission.toLowerCase())) {
    return { trust: 'unverifiable', reason: 'permission-insufficient' };
  }
  return { trust: 'verified', reason: null };
}

// Every character that can hide, reorder or break displayed text, escaped rather than shown: the
// control characters (`Cc`) other than tab and line feed; every format character (`Cf`), which
// covers the bidirectional marks, embeddings, overrides and isolates, the zero-width characters,
// the Arabic letter mark U+061C, the soft hyphen U+00AD, the Mongolian vowel separator U+180E, the
// interlinear annotation controls U+FFF9–U+FFFB, the byte-order mark and the tag characters; the
// line and paragraph separators U+2028/U+2029 (`Zl`, `Zp`), which end a line where no `\n` does;
// and the whole U+2060–U+206F, U+FFF9–U+FFFB and U+E0000–U+E007F ranges by number, so a code point
// there that the runtime's Unicode tables do not yet assign to `Cf` is escaped too.
const UNSAFE_CHARACTER =
  /(?![\t\n])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u180e\u2060-\u206f\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

// `\uXXXX` for a code point of the Basic Multilingual Plane, `\u{XXXXX}` above it.
function escapeCharacter(character) {
  const codePoint = character.codePointAt(0);
  const hex = codePoint.toString(16);
  return codePoint > 0xffff ? `\\u{${hex}}` : `\\u${hex.padStart(4, '0')}`;
}

// The longest prefix of `text` whose UTF-8 encoding fits `limit` bytes, cut on a code point.
function utf8Prefix(text, limit) {
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > limit) break;
    bytes += size;
    end += character.length;
  }
  return text.slice(0, end);
}

// The appendix text for display: the blocks without their marker lines, joined with a blank line,
// line endings normalized to `\n`, every `<!--` escaped as `&lt;!--`, and every UNSAFE_CHARACTER
// escaped as `\uXXXX` text (`\u{XXXXX}` above U+FFFF). The result is bounded to MAX_APPENDIX_BYTES
// of UTF-8; a longer one is cut and ends in a `[truncated]` line. Returns `{ text, truncated }`, or
// null when there is no block.
export function neutralizeAppendix(blocks, { maxBytes = MAX_APPENDIX_BYTES } = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const text = blocks
    .map((block) =>
      block
        .split(LINE)
        .filter((line) => {
          const marker = trimLine(line);
          return marker !== APPENDIX_BEGIN && marker !== APPENDIX_END;
        })
        .join('\n')
        .replace(/^\n+|\n+$/g, ''),
    )
    .join('\n\n')
    .replaceAll('<!--', '&lt;!--')
    .replace(UNSAFE_CHARACTER, escapeCharacter);
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return { text, truncated: false };
  const suffix = `\n${TRUNCATION_NOTE}`;
  const kept = utf8Prefix(text, maxBytes - Buffer.byteLength(suffix, 'utf8'));
  return { text: `${kept}${suffix}`, truncated: true };
}

#!/usr/bin/env node

// The exit channel of the `iterate` behavioural eval: the one place a run's final report becomes
// evidence. The prompt asks the agent, once the tool's run has ended, to pipe that report into this
// helper on standard input; the helper appends exactly one bounded JSONL record per invocation to
// the slot's trace directory and does nothing else with the text.
//
// **Why a helper at all.** A Phase-0 refusal leaves the tracker call log empty, and an empty log is
// equally consistent with a crashed session, a prompt that never started, or a run that refused
// correctly. The host receipt deliberately carries no text. So the suite needs one positive
// observable that says what the run concluded, and this record is it.
//
// **It sits beside production `iterate`, never in place of it.** The merge-gate precedent,
// `evals/merge-gate/_scaffold/iterate-trace.mjs`, is executed by an echo that *replaces*
// `tools/iterate.md`; this helper is added next to an unmodified `tools/iterate.md`, so what runs is
// the shipped text. The instruction to call it lives in the prompt and addresses the agent after the
// tool's own report exists.
//
// **It is hashed as `skill`, not as an instrument file.** The suite's overlay copies it into each
// slot's skill tree at `scripts/report-channel.mjs` and names that path as an extra load-set seed,
// which is the membership rule `build-identity.mjs` states for `iterate-trace.mjs`: a helper a run
// executes is hashed at the path the run executes it from.
//
// What it guarantees about the text:
//
//   * it is never executed, interpreted, parsed or echoed. It is read as bytes, hashed, counted and
//     stored as a JSON string; the process prints a fixed receipt that contains none of it;
//   * `bytes` and `digest` always describe the **whole** input, however long;
//   * `text` holds at most `REPORT_TEXT_BOUND` bytes. A longer report is cut at the last complete
//     UTF-8 character before the bound and the record says so in `truncated`, next to the `bound`
//     that applied — so an evaluator can tell a truncated report from a short one and refuse to
//     match a partial `ABORT:` line;
//   * the input is streamed, never held whole: it is hashed and counted as it arrives and only the
//     first `REPORT_TEXT_BOUND + 1` bytes are kept, which is all the cut needs to see. A terminal on
//     standard input is refused outright, because a helper waiting for end-of-file on an open TTY
//     would hang the run that was asked to call it;
//   * `malformed` says whether the input was valid UTF-8. The digest and the byte count stay those of
//     the raw input — the honest record of what the run sent — while `text` is its decoding, with
//     every invalid sequence replaced by U+FFFD. Normalising the input before hashing it would have
//     made the record agree with itself at the cost of describing bytes nobody sent; the flag keeps
//     the raw evidence and tells the evaluator why the text cannot hash to the digest;
//   * a malformed record also carries `raw`: the retained input bytes behind `text` — the whole
//     input, or the stored prefix of a truncated one — base64-encoded, so the text stays bound to
//     the evidence. The evaluator decodes `raw` to reproduce `text` and, when nothing was cut,
//     hashes and counts it against `digest` and `bytes`. Without it a malformed record's text would
//     be bound to nothing, and any text could be paired with any digest. A well-formed record
//     states `raw: null`: its text already hashes to its digest.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';

export const REPORT_SCHEMA = 'effective-flow/iterate-report-channel/v1';
// The stored-text bound, in UTF-8 bytes. A Phase-0 refusal is one line and an empty-selection
// summary a short table; 32 KiB is generous for both and still keeps one record, JSON-escaped, far
// below the trace-file bound.
export const REPORT_TEXT_BOUND = 32 * 1024;
// A record is one invocation. Four is more than any correct run needs — the prompt asks for exactly
// one — and still bounds what a looping run can write.
export const MAX_REPORT_RECORDS = 4;
export const REPORT_RECORD_KEYS = Object.freeze([
  'bound',
  'bytes',
  'digest',
  'malformed',
  'raw',
  'schema',
  'seq',
  'text',
  'truncated',
]);
// Worst case per stored byte after JSON escaping is six characters (`\u00XX`), plus a malformed
// record's base64 `raw` copy of the same at most `REPORT_TEXT_BOUND` bytes, plus the fixed keys.
const MAX_RECORD_BYTES = REPORT_TEXT_BOUND * 6 + Math.ceil(REPORT_TEXT_BOUND / 3) * 4 + 1024;
const MAX_TRACE_BYTES = MAX_RECORD_BYTES * MAX_REPORT_RECORDS;
const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 5000;
const LOCK_POLL_MS = 5;

export function sha256(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

// The longest prefix of `buffer` that is at most `bound` bytes and ends on a UTF-8 character
// boundary. Walking back over continuation bytes (`10xxxxxx`) from the cut lands on the lead byte of
// the character the bound would have split, which is then excluded whole.
export function boundedPrefix(buffer, bound = REPORT_TEXT_BOUND) {
  if (buffer.length <= bound) return buffer;
  let end = bound;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return buffer.subarray(0, end);
}

// The record for one report, built incrementally: `push` each chunk as it arrives, then `finish`.
// Only the first `bound + 1` bytes are retained — the one byte past the bound is what
// `boundedPrefix` inspects to decide whether the cut falls inside a character — while the hash, the
// byte count and the UTF-8 validity check see every byte. The validity check is a fatal streaming
// decoder whose output is discarded; its state carries a sequence split across two chunks, and the
// final flush catches one the input ends in the middle of.
export function reportAccumulator(bound = REPORT_TEXT_BOUND) {
  const hash = createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const head = [];
  let kept = 0;
  let bytes = 0;
  let malformed = false;
  const validate = (chunk) => {
    if (malformed) return;
    try {
      if (chunk === null) decoder.decode();
      else decoder.decode(chunk, { stream: true });
    } catch {
      malformed = true;
    }
  };
  return {
    push(input) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      hash.update(chunk);
      bytes += chunk.length;
      if (kept <= bound) {
        const slice = Buffer.from(chunk.subarray(0, bound + 1 - kept));
        head.push(slice);
        kept += slice.length;
      }
      validate(chunk);
    },
    finish() {
      validate(null);
      const stored = boundedPrefix(Buffer.concat(head), bound);
      return {
        schema: REPORT_SCHEMA,
        text: stored.toString('utf8'),
        bytes,
        digest: `sha256:${hash.digest('hex')}`,
        bound,
        truncated: stored.length < bytes,
        malformed,
        raw: malformed ? stored.toString('base64') : null,
      };
    },
  };
}

// The record for one report held in memory, without its sequence number: the same accumulator the
// CLI streams through, fed in one piece, so the unit tests exercise exactly what the CLI stores.
export function reportRecord(input) {
  const accumulator = reportAccumulator();
  accumulator.push(Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'));
  return accumulator.finish();
}

// Where the record goes: the slot's trace directory, resolved from this file's own location in the
// copied skill tree (`<attempt>/skill/scripts/report-channel.mjs` → `<attempt>/trace/`), exactly as
// the tracker stub resolves its call log. The run passes nothing that could redirect it.
export function reportTracePath(scriptPath = import.meta.filename) {
  return resolve(dirname(scriptPath), '..', '..', 'trace', 'report-channel.jsonl');
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// Only contention is waited out: a lock that already exists (EEXIST) is retried until the deadline,
// a stale one is removed, and one that vanished between the two calls (ENOENT) is retried at once.
// Any other failure to create the lock — an unwritable trace directory, say — would fail the same
// way on every attempt, so it is thrown rather than retried; a stat failure other than ENOENT still
// passes the deadline check and the sleep, so the loop is bounded whatever the file system says.
function acquireLock(lockPath) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
      }
      if (Date.now() >= deadline) throw new Error(`report channel lock unavailable at ${lockPath}`);
      sleepSync(LOCK_POLL_MS);
    }
  }
}

function readTrace(tracePath) {
  if (!existsSync(tracePath)) return [];
  const raw = readFileSync(tracePath, 'utf8');
  if (Buffer.byteLength(raw) > MAX_TRACE_BYTES) {
    throw new Error('report channel trace already exceeds its byte bound');
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > MAX_REPORT_RECORDS) {
    throw new Error('report channel trace already exceeds its record bound');
  }
  return lines.map((line, index) => {
    const record = JSON.parse(line);
    if (record?.schema !== REPORT_SCHEMA || record.seq !== index + 1) {
      throw new Error(`report channel trace line ${index + 1} is not a record this helper wrote`);
    }
    return record;
  });
}

// Append one record under a lock, by rewriting the whole file through a temporary sibling and a
// rename, so a reader never sees half a line. The same shape `iterate-trace.mjs` uses.
export function appendReport(tracePath, record) {
  const lockPath = `${tracePath}.lock`;
  mkdirSync(dirname(tracePath), { recursive: true });
  acquireLock(lockPath);
  let temporary = null;
  try {
    const existing = readTrace(tracePath);
    if (existing.length >= MAX_REPORT_RECORDS) {
      throw new Error(`report channel permits at most ${MAX_REPORT_RECORDS} records`);
    }
    const next = { ...record, seq: existing.length + 1 };
    const line = JSON.stringify(next);
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) {
      throw new Error('report channel record exceeds its byte bound');
    }
    const content = `${[...existing.map((entry) => JSON.stringify(entry)), line].join('\n')}\n`;
    temporary = resolve(dirname(tracePath), `.${basename(tracePath)}.${process.pid}.tmp`);
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, tracePath);
    temporary = null;
    return next;
  } finally {
    if (temporary !== null) rmSync(temporary, { force: true });
    rmSync(lockPath, { recursive: true, force: true });
  }
}

// Stream standard input into one record. A TTY is refused before a byte is read: nothing would ever
// end the input, and a run told to pipe its report here would block on the helper instead of
// failing visibly.
export async function readReport(stream = process.stdin) {
  if (stream.isTTY) {
    throw new Error('standard input is a terminal; pipe the report into this helper instead');
  }
  const accumulator = reportAccumulator();
  for await (const chunk of stream) accumulator.push(chunk);
  return accumulator.finish();
}

export async function main({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  tracePath = reportTracePath(),
} = {}) {
  try {
    const record = appendReport(tracePath, await readReport(stdin));
    // A fixed receipt: sequence, size and digest, never the text.
    stdout.write(
      `report channel: recorded report ${record.seq} (${record.bytes} bytes, ${record.digest}${
        record.truncated ? `, stored text truncated at ${record.bound} bytes` : ''
      })\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(`report channel: ${error?.message ?? 'the report could not be recorded'}\n`);
    return 1;
  }
}

// Runs only when invoked as a program. The comparison is made on real paths, because a slot lives
// under `/tmp`, which is a symlink on macOS: `process.argv[1]` keeps the path as typed while
// `import.meta.filename` is resolved, and a plain comparison would silently record nothing.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(import.meta.filename);
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = await main();

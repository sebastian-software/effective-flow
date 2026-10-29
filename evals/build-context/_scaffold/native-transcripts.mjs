// Native CLI rollouts append across turns. Preserve each observed prefix outside writable CLI state.
import { lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { digest, parseTranscript } from './transcript.mjs';
import { requireThat } from './protocol.mjs';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function files(root) {
  const found = {};
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = resolve(dir, name),
        stat = lstatSync(path);
      requireThat(!stat.isSymbolicLink(), 'native transcript namespace contains a symlink');
      if (stat.isDirectory()) walk(path);
      else if (/^rollout-.*\.jsonl$/.test(name)) {
        requireThat(
          stat.isFile() && stat.size <= 128 * 1024 * 1024,
          'native transcript is not bounded regular data',
        );
        found[relative(root, path)] = readFileSync(path);
      }
    }
  }
  walk(realpathSync(root));
  return found;
}
export function verifyNativeTranscriptPrefix(root, snapshot, { append = false } = {}) {
  const current = files(root);
  if (!append)
    requireThat(
      JSON.stringify(Object.keys(current).sort()) ===
        JSON.stringify(Object.keys(snapshot.files).sort()),
      'native session inventory changed outside an observed process',
    );
  for (const [name, prior] of Object.entries(snapshot.files)) {
    const saved = readFileSync(prior.path),
      actual = current[name];
    requireThat(
      saved.length === prior.bytes && digest(saved) === prior.digest,
      'protected native transcript prefix changed',
    );
    requireThat(
      actual &&
        actual.length >= saved.length &&
        actual.subarray(0, saved.length).equals(saved) &&
        (append || actual.length === saved.length),
      'native transcript prefix was rewritten or changed outside its observed turn',
    );
  }
  return current;
}
export function nativeRootFromArguments(args) {
  const index = args.indexOf('resume');
  return index < 0 ? null : args[index + 1];
}
export function captureNativeTurn({
  root,
  journalRoot,
  launch,
  turn,
  stdout,
  prompt,
  prior = null,
}) {
  const rows = stdout.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  const starts = rows.filter((r) => r.type === 'thread.started');
  requireThat(
    starts.length === 1 && UUID.test(starts[0].thread_id),
    'actual native thread.started root missing or ambiguous',
  );
  const rootId = starts[0].thread_id;
  requireThat(!prior || prior.rootId === rootId, 'native resume changed the observed root');
  const current = prior ? verifyNativeTranscriptPrefix(root, prior, { append: true }) : files(root);
  const roots = Object.entries(current).filter(([, bytes]) => {
    const meta = bytes
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .find((r) => r.type === 'session_meta')?.payload;
    return meta?.id === rootId && !meta.parent_thread_id;
  });
  requireThat(roots.length === 1, 'native stdout root lacks exactly one actual root rollout');
  const [rootFile, bytes] = roots[0],
    priorBytes = prior?.files[rootFile]?.bytes ?? 0;
  const added = bytes.subarray(priorBytes);
  requireThat(
    Buffer.from(added.toString('utf8')).equals(added),
    'native added transcript is invalid UTF-8',
  );
  const parsed = parseTranscript(added.toString('utf8'), 'codex-cli');
  requireThat(
    parsed.initialUser?.text === prompt,
    'actual native turn initial user differs from sealed stdin',
  );
  const snapshot = { rootId, files: {} };
  let index = 0;
  for (const [name, data] of Object.entries(current)) {
    const path = resolve(journalRoot, launch + '-native-prefix-' + turn + '-' + index++ + '.jsonl');
    writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
    snapshot.files[name] = { path, bytes: data.length, digest: digest(data) };
  }
  return {
    snapshot,
    rootIdentity: digest('host-session:' + rootId),
    inputDigest: digest(prompt),
    transcriptBasisDigest: digest(
      JSON.stringify(
        Object.entries(snapshot.files).map(([name, f]) => [digest(name), f.bytes, f.digest]),
      ),
    ),
  };
}

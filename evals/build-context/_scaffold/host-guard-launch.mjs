// Executed inside the same inherited OS sandbox as the real CLI and all of its descendants.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [canary, executable, ...args] = process.argv.slice(2),
  hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex');
const physical = realpathSync(canary),
  before = readFileSync(physical);
let denied = false;
try {
  writeFileSync(physical, 'invalid descendant journal write');
} catch (error) {
  denied = error.code === 'EPERM';
}
if (!denied || !readFileSync(physical).equals(before)) {
  process.stderr.write('host journal write protection failed inside actual launch sandbox\n');
  process.exit(73);
}
process.stdout.write(
  JSON.stringify({
    type: 'host_guard',
    schema: 'effective-flow.build-context/1/guard',
    writeDenied: true,
    physicalCanaryDigest: hash(physical),
    canaryDigest: hash(before),
    wrapperDigest: hash(readFileSync(import.meta.filename)),
  }) + '\n',
);
const result = spawnSync(executable, args, { stdio: 'inherit', env: process.env });
if (result.error) {
  process.stderr.write('CLI process start failed: ' + result.error.code + '\n');
  process.exit(74);
}
process.exit(result.status ?? 75);

// The coordinator's sealed build already validates cross-target role eligibility. Reuse its
// canonical schema parser here and bind every declared role to the measured target directory.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNativeAgentInventory } from '../../../build-lib.mjs';
import { readRegular } from './transcript.mjs';
import { requireThat } from './protocol.mjs';

export function nativeWorkerNames(skillRoot, harness) {
  const inventory = parseNativeAgentInventory(
    readRegular(resolve(skillRoot, 'native-agent-inventory.json')),
    { context: 'measured native target' },
  );
  requireThat(inventory.harness === harness, 'measured native inventory harness differs');
  requireThat(
    harness !== 'claude' || inventory.tierWorkers.length === 0,
    'Claude tier sidecars forbidden',
  );
  const names = [...inventory.baseWorkers, ...inventory.fastWorkers, ...inventory.tierWorkers];
  const extension = harness === 'codex' ? '.toml' : '.md';
  const actual = readdirSync(resolve(skillRoot, '../agents')).sort();
  requireThat(
    JSON.stringify(actual) === JSON.stringify(names.map((name) => name + extension).sort()),
    'native sidecar membership differs',
  );
  return names;
}

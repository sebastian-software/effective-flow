import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import process from 'node:process';
import {
  discoverPythonCases,
  pythonCaseBudgets,
  runPythonCase,
} from '../scripts/host-driver-tests.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform === 'win32') {
  test('portable host-driver Python tests', { skip: 'requires POSIX process groups' }, () => {});
} else {
  const identities = await discoverPythonCases(root);
  for (const identity of identities) {
    const { pythonTimeout, nodeTimeout } = pythonCaseBudgets(identity);
    test(`portable host-driver Python tests (${identity})`, { timeout: nodeTimeout }, (context) =>
      runPythonCase(root, identity, { timeout: pythonTimeout, signal: context.signal }),
    );
  }
}

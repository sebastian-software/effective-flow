import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pythonTestFiles = readdirSync(resolve(root, 'evals/host-driver/tests'))
  .filter((name) => name.startsWith('test_') && name.endsWith('.py'))
  .sort();

// Each discovered module keeps the established child and Node timeouts.
for (const filename of pythonTestFiles) {
  test(
    `portable host-driver Python tests (${filename})`,
    {
      skip: process.platform === 'win32' ? 'requires POSIX process groups' : false,
      timeout: 180_000,
    },
    () => {
      const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
      if (filename !== 'test_remaining_stage_composed.py') delete env.EF_HOST_DRIVER_DIAGNOSTICS;
      execFileSync(
        'python3',
        ['-B', '-m', 'unittest', 'discover', '-s', 'evals/host-driver/tests', '-p', filename],
        {
          cwd: root,
          env,
          stdio: 'inherit',
          timeout: 150_000,
        },
      );
    },
  );
}

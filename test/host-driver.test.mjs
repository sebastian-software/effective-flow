import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import process from 'node:process';

test(
  'portable host-driver Python tests',
  {
    skip: process.platform === 'win32' ? 'requires POSIX process groups' : false,
    timeout: 180_000,
  },
  () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    execFileSync(
      'python3',
      ['-B', '-m', 'unittest', 'discover', '-s', 'evals/host-driver/tests', '-p', 'test_*.py'],
      {
        cwd: root,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        stdio: 'inherit',
        timeout: 150_000,
      },
    );
  },
);
